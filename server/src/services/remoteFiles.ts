import { executeSSHCommand, type ServerConnectionConfig } from './deployer.js';
import { normalizeEditorFileList, resolveRemoteEditorPath, type SearchOptions, type SearchResult } from './codeEditor.js';
import path from 'path';

export interface BulkRemoteSiteTarget {
  domain: string;
  remoteRoot: string;
}

export interface BulkRemotePreviewFileResult {
  filePath: string;
  matchCount: number;
  firstMatch: SearchResult['matches'][number] | null;
}

export interface BulkRemotePreviewSiteResult {
  domain: string;
  remoteRoot: string;
  matchedFiles: number;
  matches: number;
  files: BulkRemotePreviewFileResult[];
}

export interface BulkRemotePreviewResult {
  scannedSites: number;
  matchedSites: number;
  matchedFiles: number;
  matches: number;
  sites: BulkRemotePreviewSiteResult[];
}

export interface BulkRemoteApplySiteResult {
  domain: string;
  remoteRoot: string;
  updatedFiles: number;
  replacements: number;
}

export interface BulkRemoteApplyResult {
  scannedSites: number;
  updatedSites: number;
  updatedFiles: number;
  replacements: number;
  sites: BulkRemoteApplySiteResult[];
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `"'"'`)}'`;
}

function safeOwner(owner?: string): string | null {
  if (!owner) {
    return null;
  }

  return /^[a-z_][a-z0-9_-]*$/i.test(owner) ? owner : null;
}

function buildRemotePythonCommand(script: string): string {
  return [
    `if command -v python3 >/dev/null 2>&1; then python3 - <<'PY'`,
    script,
    `PY`,
    `else python - <<'PY'`,
    script,
    `PY`,
    `fi`,
  ].join('\n');
}

function toPythonLiteral(value: string | boolean | null): string {
  if (typeof value === 'boolean') {
    return value ? 'True' : 'False';
  }

  if (value === null) {
    return 'None';
  }

  return JSON.stringify(value);
}

export async function listRemoteEditableFiles(server: ServerConnectionConfig, remoteRoot: string): Promise<string[]> {
  const root = path.posix.resolve(remoteRoot);
  const output = await executeSSHCommand(
    server,
    `find ${shellEscape(root)} -type f 2>/dev/null || true`,
  );

  const files = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.startsWith(`${root}/`) ? line.slice(root.length + 1) : line)
    .filter((line) => !line.startsWith('.site-factory-backups/'));

  return normalizeEditorFileList(files);
}

export async function readRemoteTextFile(
  server: ServerConnectionConfig,
  remoteRoot: string,
  relativePath: string,
): Promise<string> {
  const remotePath = resolveRemoteEditorPath(remoteRoot, relativePath);
  const output = await executeSSHCommand(
    server,
    [
      `if [ ! -f ${shellEscape(remotePath)} ]; then echo '__SF_NOT_FOUND__'; exit 0; fi`,
      `printf '__SF_BEGIN__'`,
      `base64 -w0 ${shellEscape(remotePath)}`,
      `printf '__SF_END__'`,
    ].join('; '),
  );

  if (output.includes('__SF_NOT_FOUND__')) {
    throw new Error('Remote file not found');
  }

  const match = output.match(/__SF_BEGIN__(.*)__SF_END__/s);
  if (!match) {
    throw new Error('Failed to read remote file');
  }

  return Buffer.from(match[1], 'base64').toString('utf-8');
}

export async function writeRemoteTextFile(
  server: ServerConnectionConfig,
  remoteRoot: string,
  relativePath: string,
  content: string,
  owner?: string,
): Promise<void> {
  const remotePath = resolveRemoteEditorPath(remoteRoot, relativePath);
  const backupStamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupRoot = path.posix.join(remoteRoot, '.site-factory-backups', backupStamp);
  const backupPath = path.posix.join(backupRoot, relativePath.replace(/\\/g, '/'));
  const base64Content = Buffer.from(content, 'utf-8').toString('base64');
  const ownerName = safeOwner(owner);

  await executeSSHCommand(
    server,
    [
      `mkdir -p ${shellEscape(path.posix.dirname(remotePath))}`,
      `mkdir -p ${shellEscape(path.posix.dirname(backupPath))}`,
      `if [ -f ${shellEscape(remotePath)} ]; then cp ${shellEscape(remotePath)} ${shellEscape(backupPath)}; fi`,
      `printf %s ${shellEscape(base64Content)} | base64 -d > ${shellEscape(remotePath)}`,
      ownerName ? `chown ${ownerName}:${ownerName} ${shellEscape(remotePath)} 2>/dev/null || true` : 'true',
    ].join('; '),
  );
}

export async function searchRemoteFiles(
  server: ServerConnectionConfig,
  remoteRoot: string,
  query: string,
  options: SearchOptions = {},
): Promise<SearchResult[]> {
  const script = `
import json
import os
import re

root = ${JSON.stringify(path.posix.resolve(remoteRoot))}
query = ${JSON.stringify(query)}
ignore_case = ${toPythonLiteral(Boolean(options.ignoreCase))}
use_regex = ${toPythonLiteral(Boolean(options.useRegex))}
editable_exts = {
    '.html', '.htm', '.css', '.js', '.json', '.xml', '.txt', '.svg',
    '.php', '.md', '.yaml', '.yml', '.toml', '.conf', '.map',
    '.htaccess', '.mjs', '.cjs', '.ts', '.jsx', '.tsx', '.tpl',
    '.scss', '.sass', '.less', '.env', '.ini', '.sql', '.csv',
}

def is_editable(rel_path):
    name = os.path.basename(rel_path)
    _, ext = os.path.splitext(name.lower())
    return ext in editable_exts or name.startswith('.') or ext == ''

pattern_source = query if use_regex else re.escape(query)
try:
    pattern = re.compile(pattern_source, re.IGNORECASE if ignore_case else 0)
except re.error as exc:
    raise ValueError(f'Invalid regular expression: {exc}')

if use_regex and pattern.search('') is not None:
    raise ValueError('Regex must not match empty strings')

def collect_matches(content):
    results = []
    lines = content.splitlines()
    for line_idx, line in enumerate(lines, start=1):
        for match in pattern.finditer(line):
            text = match.group(0)
            if text == '':
                continue
            idx = match.start()
            preview_start = max(0, idx - 36)
            preview_end = min(len(line), idx + len(text) + 36)
            results.append({
                'line': line_idx,
                'column': idx + 1,
                'preview': line[preview_start:preview_end],
                'matchLength': len(text),
            })
    return results

payload = []
for dirpath, dirnames, filenames in os.walk(root):
    dirnames[:] = [d for d in dirnames if d != '.site-factory-backups']
    for filename in filenames:
        full_path = os.path.join(dirpath, filename)
        rel_path = os.path.relpath(full_path, root).replace('\\\\', '/')
        if not is_editable(rel_path):
            continue
        try:
            with open(full_path, 'r', encoding='utf-8') as fh:
                content = fh.read()
        except Exception:
            continue
        matches = collect_matches(content)
        if matches:
            payload.append({
                'filePath': rel_path,
                'matchCount': len(matches),
                'matches': matches,
            })

print(json.dumps(payload, ensure_ascii=False))
`;

  const output = await executeSSHCommand(server, buildRemotePythonCommand(script));
  return JSON.parse(output.trim() || '[]') as SearchResult[];
}

export async function replaceRemoteFiles(
  server: ServerConnectionConfig,
  remoteRoot: string,
  query: string,
  replaceWith: string,
  owner?: string,
  options: SearchOptions = {},
): Promise<{ updatedFiles: number; replacements: number }> {
  const ownerName = safeOwner(owner);
  const script = `
import json
import os
import re
import shutil
from datetime import datetime

root = ${JSON.stringify(path.posix.resolve(remoteRoot))}
query = ${JSON.stringify(query)}
replace_with = ${JSON.stringify(replaceWith)}
owner = ${toPythonLiteral(ownerName)}
ignore_case = ${toPythonLiteral(Boolean(options.ignoreCase))}
use_regex = ${toPythonLiteral(Boolean(options.useRegex))}
editable_exts = {
    '.html', '.htm', '.css', '.js', '.json', '.xml', '.txt', '.svg',
    '.php', '.md', '.yaml', '.yml', '.toml', '.conf', '.map',
    '.htaccess', '.mjs', '.cjs', '.ts', '.jsx', '.tsx', '.tpl',
    '.scss', '.sass', '.less', '.env', '.ini', '.sql', '.csv',
}

def is_editable(rel_path):
    name = os.path.basename(rel_path)
    _, ext = os.path.splitext(name.lower())
    return ext in editable_exts or name.startswith('.') or ext == ''

pattern_source = query if use_regex else re.escape(query)
try:
    pattern = re.compile(pattern_source, re.IGNORECASE if ignore_case else 0)
except re.error as exc:
    raise ValueError(f'Invalid regular expression: {exc}')

if use_regex and pattern.search('') is not None:
    raise ValueError('Regex must not match empty strings')

def apply_js_replacement(template, match, source):
    result = []
    index = 0
    group_count = len(match.groups())

    while index < len(template):
        char = template[index]
        if char != '$' or index == len(template) - 1:
            result.append(char)
            index += 1
            continue

        token = template[index + 1]
        if token == '$':
            result.append('$')
            index += 2
            continue
        if token == '&':
            result.append(match.group(0))
            index += 2
            continue
        if token == chr(96):
            result.append(source[:match.start()])
            index += 2
            continue
        if token == "'":
            result.append(source[match.end():])
            index += 2
            continue
        if token.isdigit():
            end = index + 2
            value = token
            if end < len(template) and template[end].isdigit():
                candidate = template[index + 1:end + 1]
                if int(candidate) <= group_count:
                    value = candidate
                    end += 1
            group_index = int(value)
            if 0 < group_index <= group_count:
                group_value = match.group(group_index)
                if group_value is not None:
                    result.append(group_value)
            index = end
            continue

        result.append('$')
        index += 1

    return ''.join(result)

stamp = datetime.utcnow().isoformat().replace(':', '-').replace('.', '-')
backup_root = os.path.join(root, '.site-factory-backups', stamp)
updated_files = 0
replacements = 0

for dirpath, dirnames, filenames in os.walk(root):
    dirnames[:] = [d for d in dirnames if d != '.site-factory-backups']
    for filename in filenames:
        full_path = os.path.join(dirpath, filename)
        rel_path = os.path.relpath(full_path, root).replace('\\\\', '/')
        if not is_editable(rel_path):
            continue
        try:
            with open(full_path, 'r', encoding='utf-8') as fh:
                content = fh.read()
        except Exception:
            continue
        pieces = []
        last_index = 0
        count = 0
        for match in pattern.finditer(content):
            text = match.group(0)
            if text == '':
                continue
            pieces.append(content[last_index:match.start()])
            pieces.append(apply_js_replacement(replace_with, match, content))
            last_index = match.end()
            count += 1
        if count == 0:
            continue
        pieces.append(content[last_index:])
        backup_path = os.path.join(backup_root, rel_path)
        os.makedirs(os.path.dirname(backup_path), exist_ok=True)
        shutil.copy2(full_path, backup_path)
        with open(full_path, 'w', encoding='utf-8') as fh:
            fh.write(''.join(pieces))
        updated_files += 1
        replacements += count

print(json.dumps({'updatedFiles': updated_files, 'replacements': replacements}, ensure_ascii=False))
`;

  const output = await executeSSHCommand(server, buildRemotePythonCommand(script));

  if (ownerName) {
    await executeSSHCommand(
      server,
      `find ${shellEscape(path.posix.resolve(remoteRoot))} -type f ! -path ${shellEscape(`${path.posix.resolve(remoteRoot)}/.site-factory-backups/*`)} -exec chown ${ownerName}:${ownerName} {} + 2>/dev/null || true`,
    );
  }

  return JSON.parse(output.trim() || '{"updatedFiles":0,"replacements":0}') as { updatedFiles: number; replacements: number };
}

export async function previewBulkRemoteSiteReplace(
  server: ServerConnectionConfig,
  sites: BulkRemoteSiteTarget[],
  query: string,
  options: SearchOptions & { relativePath?: string | null } = {},
): Promise<BulkRemotePreviewResult> {
  const script = `
import json
import os
import re

sites = json.loads(${JSON.stringify(JSON.stringify(sites))})
query = ${JSON.stringify(query)}
relative_path = ${JSON.stringify((options.relativePath || '').replace(/\\/g, '/'))}
ignore_case = ${toPythonLiteral(Boolean(options.ignoreCase))}
use_regex = ${toPythonLiteral(Boolean(options.useRegex))}
editable_exts = {
  '.html', '.htm', '.css', '.js', '.json', '.xml', '.txt', '.svg',
  '.php', '.md', '.yaml', '.yml', '.toml', '.conf', '.map',
  '.htaccess', '.mjs', '.cjs', '.ts', '.jsx', '.tsx', '.tpl',
  '.scss', '.sass', '.less', '.env', '.ini', '.sql', '.csv',
}

def is_editable(rel_path):
  name = os.path.basename(rel_path)
  _, ext = os.path.splitext(name.lower())
  return ext in editable_exts or name.startswith('.') or ext == ''

def iter_site_files(root):
  if relative_path:
    target_path = os.path.join(root, relative_path)
    if os.path.isfile(target_path):
      yield relative_path, target_path
    return

  for dirpath, dirnames, filenames in os.walk(root):
    dirnames[:] = [d for d in dirnames if d != '.site-factory-backups']
    for filename in filenames:
      full_path = os.path.join(dirpath, filename)
      rel_path = os.path.relpath(full_path, root).replace('\\\\', '/')
      if is_editable(rel_path):
        yield rel_path, full_path

pattern_source = query if use_regex else re.escape(query)
try:
  pattern = re.compile(pattern_source, re.IGNORECASE if ignore_case else 0)
except re.error as exc:
  raise ValueError(f'Invalid regular expression: {exc}')

if use_regex and pattern.search('') is not None:
  raise ValueError('Regex must not match empty strings')

payload = []
matched_files_total = 0
matches_total = 0

for site in sites:
  root = os.path.abspath(site['remoteRoot'])
  matched_files = []
  site_match_count = 0

  for rel_path, full_path in iter_site_files(root):
    try:
      with open(full_path, 'r', encoding='utf-8') as fh:
        content = fh.read()
    except Exception:
      continue

    line_matches = []
    lines = content.splitlines()
    file_match_count = 0

    for line_idx, line in enumerate(lines, start=1):
      for match in pattern.finditer(line):
        text = match.group(0)
        if text == '':
          continue
        file_match_count += 1
        if not line_matches:
          idx = match.start()
          preview_start = max(0, idx - 36)
          preview_end = min(len(line), idx + len(text) + 36)
          line_matches.append({
            'line': line_idx,
            'column': idx + 1,
            'preview': line[preview_start:preview_end],
            'matchLength': len(text),
          })

    if file_match_count == 0:
      continue

    matched_files.append({
      'filePath': rel_path,
      'matchCount': file_match_count,
      'firstMatch': line_matches[0] if line_matches else None,
    })
    site_match_count += file_match_count

  if matched_files:
    payload.append({
      'domain': site['domain'],
      'remoteRoot': root,
      'matchedFiles': len(matched_files),
      'matches': site_match_count,
      'files': matched_files,
    })
    matched_files_total += len(matched_files)
    matches_total += site_match_count

print(json.dumps({
  'scannedSites': len(sites),
  'matchedSites': len(payload),
  'matchedFiles': matched_files_total,
  'matches': matches_total,
  'sites': payload,
}, ensure_ascii=False))
`;

  const output = await executeSSHCommand(server, buildRemotePythonCommand(script));
  return JSON.parse(output.trim() || '{"scannedSites":0,"matchedSites":0,"matchedFiles":0,"matches":0,"sites":[]}') as BulkRemotePreviewResult;
}

export async function applyBulkRemoteSiteReplace(
  server: ServerConnectionConfig,
  sites: BulkRemoteSiteTarget[],
  query: string,
  replaceWith: string,
  options: SearchOptions & { relativePath?: string | null } = {},
): Promise<BulkRemoteApplyResult> {
  const script = `
import json
import os
import re
import shutil
from datetime import datetime

sites = json.loads(${JSON.stringify(JSON.stringify(sites))})
query = ${JSON.stringify(query)}
replace_with = ${JSON.stringify(replaceWith)}
relative_path = ${JSON.stringify((options.relativePath || '').replace(/\\/g, '/'))}
ignore_case = ${toPythonLiteral(Boolean(options.ignoreCase))}
use_regex = ${toPythonLiteral(Boolean(options.useRegex))}
editable_exts = {
  '.html', '.htm', '.css', '.js', '.json', '.xml', '.txt', '.svg',
  '.php', '.md', '.yaml', '.yml', '.toml', '.conf', '.map',
  '.htaccess', '.mjs', '.cjs', '.ts', '.jsx', '.tsx', '.tpl',
  '.scss', '.sass', '.less', '.env', '.ini', '.sql', '.csv',
}

def is_editable(rel_path):
  name = os.path.basename(rel_path)
  _, ext = os.path.splitext(name.lower())
  return ext in editable_exts or name.startswith('.') or ext == ''

def iter_site_files(root):
  if relative_path:
    target_path = os.path.join(root, relative_path)
    if os.path.isfile(target_path):
      yield relative_path, target_path
    return

  for dirpath, dirnames, filenames in os.walk(root):
    dirnames[:] = [d for d in dirnames if d != '.site-factory-backups']
    for filename in filenames:
      full_path = os.path.join(dirpath, filename)
      rel_path = os.path.relpath(full_path, root).replace('\\\\', '/')
      if is_editable(rel_path):
        yield rel_path, full_path

def apply_js_replacement(template, match, source):
  result = []
  index = 0
  group_count = len(match.groups())

  while index < len(template):
    char = template[index]
    if char != '$' or index == len(template) - 1:
      result.append(char)
      index += 1
      continue

    token = template[index + 1]
    if token == '$':
      result.append('$')
      index += 2
      continue
    if token == '&':
      result.append(match.group(0))
      index += 2
      continue
    if token == chr(96):
      result.append(source[:match.start()])
      index += 2
      continue
    if token == "'":
      result.append(source[match.end():])
      index += 2
      continue
    if token.isdigit():
      end = index + 2
      value = token
      if end < len(template) and template[end].isdigit():
        candidate = template[index + 1:end + 1]
        if int(candidate) <= group_count:
          value = candidate
          end += 1
      group_index = int(value)
      if 0 < group_index <= group_count:
        group_value = match.group(group_index)
        if group_value is not None:
          result.append(group_value)
      index = end
      continue

    result.append('$')
    index += 1

  return ''.join(result)

pattern_source = query if use_regex else re.escape(query)
try:
  pattern = re.compile(pattern_source, re.IGNORECASE if ignore_case else 0)
except re.error as exc:
  raise ValueError(f'Invalid regular expression: {exc}')

if use_regex and pattern.search('') is not None:
  raise ValueError('Regex must not match empty strings')

payload = []
updated_files_total = 0
replacements_total = 0

for site in sites:
  root = os.path.abspath(site['remoteRoot'])
  stamp = datetime.utcnow().isoformat().replace(':', '-').replace('.', '-')
  backup_root = os.path.join(root, '.site-factory-backups', stamp)
  site_updated_files = 0
  site_replacements = 0

  for rel_path, full_path in iter_site_files(root):
    try:
      with open(full_path, 'r', encoding='utf-8') as fh:
        content = fh.read()
    except Exception:
      continue

    pieces = []
    last_index = 0
    count = 0
    for match in pattern.finditer(content):
      text = match.group(0)
      if text == '':
        continue
      pieces.append(content[last_index:match.start()])
      pieces.append(apply_js_replacement(replace_with, match, content))
      last_index = match.end()
      count += 1

    if count == 0:
      continue

    pieces.append(content[last_index:])
    backup_path = os.path.join(backup_root, rel_path)
    os.makedirs(os.path.dirname(backup_path), exist_ok=True)
    shutil.copy2(full_path, backup_path)
    with open(full_path, 'w', encoding='utf-8') as fh:
      fh.write(''.join(pieces))

    site_updated_files += 1
    site_replacements += count

  if site_updated_files > 0:
    payload.append({
      'domain': site['domain'],
      'remoteRoot': root,
      'updatedFiles': site_updated_files,
      'replacements': site_replacements,
    })
    updated_files_total += site_updated_files
    replacements_total += site_replacements

print(json.dumps({
  'scannedSites': len(sites),
  'updatedSites': len(payload),
  'updatedFiles': updated_files_total,
  'replacements': replacements_total,
  'sites': payload,
}, ensure_ascii=False))
`;

  const output = await executeSSHCommand(server, buildRemotePythonCommand(script));
  return JSON.parse(output.trim() || '{"scannedSites":0,"updatedSites":0,"updatedFiles":0,"replacements":0,"sites":[]}') as BulkRemoteApplyResult;
}