import path from 'path';
import fs from 'fs';

const EDITABLE_TEXT_EXTENSIONS = new Set([
  '.html', '.htm', '.css', '.js', '.json', '.xml', '.txt', '.svg',
  '.php', '.md', '.yaml', '.yml', '.toml', '.conf', '.map',
  '.htaccess', '.mjs', '.cjs', '.ts', '.jsx', '.tsx', '.tpl',
  '.scss', '.sass', '.less', '.env', '.ini', '.sql', '.csv',
]);

export interface SearchOccurrence {
  line: number;
  column: number;
  preview: string;
  matchLength: number;
}

export interface SearchResult {
  filePath: string;
  matchCount: number;
  matches: SearchOccurrence[];
}

export interface SearchOptions {
  ignoreCase?: boolean;
  useRegex?: boolean;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function createSearchPattern(query: string, options: SearchOptions = {}): RegExp {
  const source = options.useRegex ? query : escapeRegExp(query);

  try {
    const pattern = new RegExp(source, options.ignoreCase ? 'gi' : 'g');
    if (options.useRegex && ''.match(pattern)) {
      throw new Error('Regex must not match empty strings');
    }
    return pattern;
  } catch (error: any) {
    if (error?.message === 'Regex must not match empty strings') {
      throw error;
    }

    throw new Error(`Invalid regular expression: ${error?.message || 'unknown error'}`);
  }
}

export function isEditableTextFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  const ext = path.extname(normalized).toLowerCase();
  if (EDITABLE_TEXT_EXTENSIONS.has(ext)) {
    return true;
  }

  const baseName = path.posix.basename(normalized);
  return baseName.startsWith('.') || !ext;
}

export function resolveLocalEditorPath(rootDir: string, relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/');
  const resolved = path.resolve(rootDir, normalized);
  const rootResolved = path.resolve(rootDir);

  if (resolved !== rootResolved && !resolved.startsWith(`${rootResolved}${path.sep}`)) {
    throw new Error('Path escapes template root');
  }

  return resolved;
}

export function resolveRemoteEditorPath(rootDir: string, relativePath: string): string {
  const normalizedRoot = path.posix.resolve(rootDir);
  const normalizedPath = relativePath.replace(/\\/g, '/');
  const resolved = path.posix.resolve(normalizedRoot, normalizedPath);

  if (resolved !== normalizedRoot && !resolved.startsWith(`${normalizedRoot}/`)) {
    throw new Error('Path escapes remote site root');
  }

  return resolved;
}

export function normalizeEditorFileList(files: string[]): string[] {
  return files
    .map((item) => item.replace(/\\/g, '/').replace(/^\.\//, ''))
    .filter(Boolean)
    .filter(isEditableTextFile)
    .sort((left, right) => left.localeCompare(right));
}

export function collectLocalEditableFiles(rootDir: string, currentDir = rootDir, prefix = ''): string[] {
  if (!fs.existsSync(currentDir)) {
    return [];
  }

  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  let files: string[] = [];

  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const fullPath = path.join(currentDir, entry.name);

    if (entry.isDirectory()) {
      files = files.concat(collectLocalEditableFiles(rootDir, fullPath, relativePath));
      continue;
    }

    files.push(relativePath);
  }

  return normalizeEditorFileList(files);
}

export function searchInContent(content: string, query: string, options: SearchOptions = {}): SearchOccurrence[] {
  if (!query) {
    return [];
  }

  const matches: SearchOccurrence[] = [];
  const lines = content.split(/\r?\n/);
  const pattern = createSearchPattern(query, options);

  lines.forEach((lineText, lineIndex) => {
    pattern.lastIndex = 0;
    let match = pattern.exec(lineText);

    while (match) {
      const matchText = match[0];
      if (!matchText) {
        pattern.lastIndex += 1;
        match = pattern.exec(lineText);
        continue;
      }

      const previewStart = Math.max(0, match.index - 36);
      const previewEnd = Math.min(lineText.length, match.index + matchText.length + 36);
      matches.push({
        line: lineIndex + 1,
        column: match.index + 1,
        preview: lineText.slice(previewStart, previewEnd),
        matchLength: matchText.length,
      });

      match = pattern.exec(lineText);
    }
  });

  return matches;
}

export function replaceInContent(content: string, query: string, replaceWith: string, options: SearchOptions = {}): { content: string; replacements: number } {
  if (!query) {
    return { content, replacements: 0 };
  }

  const pattern = createSearchPattern(query, options);
  let replacements = 0;
  let match = pattern.exec(content);

  while (match) {
    if (!match[0]) {
      pattern.lastIndex += 1;
      match = pattern.exec(content);
      continue;
    }

    replacements += 1;
    match = pattern.exec(content);
  }

  return {
    content: replacements > 0 ? content.replace(pattern, replaceWith) : content,
    replacements,
  };
}

export function searchLocalFiles(rootDir: string, query: string, options: SearchOptions = {}): SearchResult[] {
  return collectLocalEditableFiles(rootDir)
    .map((filePath) => {
      const content = fs.readFileSync(resolveLocalEditorPath(rootDir, filePath), 'utf-8');
      const matches = searchInContent(content, query, options);
      if (matches.length === 0) {
        return null;
      }

      return {
        filePath,
        matchCount: matches.length,
        matches,
      } satisfies SearchResult;
    })
    .filter((item): item is SearchResult => Boolean(item));
}

export function replaceLocalFiles(rootDir: string, query: string, replaceWith: string, options: SearchOptions = {}): { updatedFiles: number; replacements: number } {
  let updatedFiles = 0;
  let replacements = 0;

  for (const filePath of collectLocalEditableFiles(rootDir)) {
    const fullPath = resolveLocalEditorPath(rootDir, filePath);
    const original = fs.readFileSync(fullPath, 'utf-8');
    const result = replaceInContent(original, query, replaceWith, options);
    if (result.replacements === 0) {
      continue;
    }

    fs.writeFileSync(fullPath, result.content, 'utf-8');
    updatedFiles += 1;
    replacements += result.replacements;
  }

  return { updatedFiles, replacements };
}

export function validateSearchQuery(query: string, options: SearchOptions = {}): void {
  createSearchPattern(query, options);
}