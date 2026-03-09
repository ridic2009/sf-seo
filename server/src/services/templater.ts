import fs from 'fs';
import path from 'path';

const TEXT_EXTENSIONS = new Set([
  '.html', '.htm', '.css', '.js', '.json', '.xml', '.txt', '.svg',
  '.php', '.md', '.yaml', '.yml', '.toml', '.conf', '.map',
  '.htaccess', '.mjs', '.cjs', '.ts', '.jsx', '.tsx', '.tpl',
]);

interface ReplaceConfig {
  originalBusinessName?: string;
  originalDomain?: string;
  newBusinessName: string;
  newDomain: string;
}

const PLACEHOLDER_ALIASES = {
  businessName: ['{{NAME}}', '{{BUSINESS_NAME}}', '{{BUSINESS}}'],
  domain: ['{{DOMAIN}}', '{{SITE_DOMAIN}}'],
};

function isTextFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  if (TEXT_EXTENSIONS.has(ext)) return true;
  // Files without extension (e.g., .htaccess) — check by name
  const name = path.basename(filePath);
  if (name.startsWith('.')) return true;
  return false;
}

function buildReplacements(config: ReplaceConfig): Array<[string, string]> {
  const { originalBusinessName, originalDomain, newBusinessName, newDomain } = config;
  const pairs = new Map<string, string>();

  const add = (from: string | undefined, to: string) => {
    if (!from || from === to || pairs.has(from)) {
      return;
    }
    pairs.set(from, to);
  };

  for (const token of PLACEHOLDER_ALIASES.domain) {
    add(token, newDomain);
  }

  for (const token of PLACEHOLDER_ALIASES.businessName) {
    add(token, newBusinessName);
  }

  // Domain first (more specific, avoids partial matches)
  add(originalDomain, newDomain);
  if (originalDomain) {
    add(`www.${originalDomain}`, `www.${newDomain}`);
  }

  // Business name — exact
  add(originalBusinessName, newBusinessName);

  if (!originalBusinessName) {
    const domainClean = newDomain.replace(/^www\./, '').replace(/\.[^.]+$/, '');
    add('{{NAME_LOWER}}', newBusinessName.toLowerCase());
    add('{{NAME_UPPER}}', newBusinessName.toUpperCase());
    add('{{DOMAIN_CLEAN}}', domainClean.replace(/\./g, ''));
    return Array.from(pairs.entries());
  }

  // Lowercase
  const origLower = originalBusinessName.toLowerCase();
  const newLower = newBusinessName.toLowerCase();
  if (origLower !== originalBusinessName) {
    add(origLower, newLower);
  }

  // UPPERCASE
  const origUpper = originalBusinessName.toUpperCase();
  const newUpper = newBusinessName.toUpperCase();
  if (origUpper !== originalBusinessName && origUpper !== origLower) {
    add(origUpper, newUpper);
  }

  // kebab-case (for URLs, slugs, CSS classes)
  const origKebab = originalBusinessName.toLowerCase().replace(/\s+/g, '-');
  const newKebab = newBusinessName.toLowerCase().replace(/\s+/g, '-');
  if (origKebab !== origLower) {
    add(origKebab, newKebab);
  }

  // snake_case
  const origSnake = originalBusinessName.toLowerCase().replace(/\s+/g, '_');
  const newSnake = newBusinessName.toLowerCase().replace(/\s+/g, '_');
  if (origSnake !== origLower && origSnake !== origKebab) {
    add(origSnake, newSnake);
  }

  // camelCase (e.g., "aurellitoPro")
  const toCamel = (s: string) => {
    const parts = s.toLowerCase().split(/\s+/);
    return parts[0] + parts.slice(1).map((p) => p[0].toUpperCase() + p.slice(1)).join('');
  };
  const origCamel = toCamel(originalBusinessName);
  const newCamel = toCamel(newBusinessName);
  if (origCamel !== origLower) {
    add(origCamel, newCamel);
  }

  // Domain without dots (sometimes used in IDs, variable names)
  const newDomainClean = newDomain.replace(/\./g, '');
  if (originalDomain) {
    const origDomainClean = originalDomain.replace(/\./g, '');
    if (origDomainClean !== originalDomain) {
      add(origDomainClean, newDomainClean);
    }
  }

  add('{{NAME_LOWER}}', newBusinessName.toLowerCase());
  add('{{NAME_UPPER}}', newBusinessName.toUpperCase());
  add('{{DOMAIN_CLEAN}}', newDomain.replace(/\./g, ''));

  return Array.from(pairs.entries());
}

function applyReplacements(content: string, replacements: Array<[string, string]>): string {
  for (const [from, to] of replacements) {
    // Use split+join for global replacement (safe, no regex escaping needed)
    content = content.split(from).join(to);
  }
  return content;
}

function copyAndReplace(
  srcDir: string,
  destDir: string,
  replacements: Array<[string, string]>,
): void {
  fs.mkdirSync(destDir, { recursive: true });

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);

    // Apply replacements to filename
    let destName = entry.name;
    for (const [from, to] of replacements) {
      destName = destName.split(from).join(to);
    }
    const destPath = path.join(destDir, destName);

    if (entry.isDirectory()) {
      copyAndReplace(srcPath, destPath, replacements);
    } else if (isTextFile(srcPath)) {
      let content = fs.readFileSync(srcPath, 'utf-8');
      content = applyReplacements(content, replacements);
      fs.writeFileSync(destPath, content, 'utf-8');
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

export function processTemplate(
  sourceDir: string,
  outputDir: string,
  config: ReplaceConfig,
): void {
  const replacements = buildReplacements(config);
  copyAndReplace(sourceDir, outputDir, replacements);
}
