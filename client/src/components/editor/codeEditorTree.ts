import type { EditorFileEntry, FileTreeNode, GlobalSearchOptions } from './codeEditorTypes';

const EDITABLE_TEXT_EXTENSIONS = new Set([
  '.html', '.htm', '.css', '.js', '.json', '.xml', '.txt', '.svg',
  '.php', '.md', '.yaml', '.yml', '.toml', '.conf', '.map',
  '.htaccess', '.mjs', '.cjs', '.ts', '.jsx', '.tsx', '.tpl',
  '.scss', '.sass', '.less', '.env', '.ini', '.sql', '.csv',
]);

export function createPreviewPattern(query: string, options: GlobalSearchOptions): RegExp | null {
  if (!query) {
    return null;
  }

  try {
    const source = options.useRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(source, options.ignoreCase ? 'i' : '');
  } catch {
    return null;
  }
}

export function detectLanguage(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html';
  if (lower.endsWith('.css') || lower.endsWith('.scss') || lower.endsWith('.sass') || lower.endsWith('.less')) return 'css';
  if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) return 'javascript';
  if (lower.endsWith('.ts') || lower.endsWith('.tsx')) return 'typescript';
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.php')) return 'php';
  if (lower.endsWith('.xml') || lower.endsWith('.svg')) return 'xml';
  if (lower.endsWith('.md')) return 'markdown';
  if (lower.endsWith('.yml') || lower.endsWith('.yaml')) return 'yaml';
  if (lower.endsWith('.sql')) return 'sql';
  return 'plaintext';
}

export function isEditableClientFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  const fileName = normalized.split('/').pop() || normalized;
  const extMatch = /\.[^.]+$/.exec(fileName.toLowerCase());
  const ext = extMatch?.[0] || '';

  return EDITABLE_TEXT_EXTENSIONS.has(ext) || fileName.startsWith('.') || !ext;
}

function createDirectoryNode(name: string, nodePath: string): FileTreeNode {
  return {
    name,
    path: nodePath,
    type: 'directory',
    children: [],
  };
}

export function buildFileTree(files: EditorFileEntry[]): FileTreeNode[] {
  const root = createDirectoryNode('', '');

  for (const file of files) {
    const filePath = file.path;
    const parts = filePath.split('/').filter(Boolean);
    let current = root;

    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index];
      const currentPath = parts.slice(0, index + 1).join('/');
      const isFile = index === parts.length - 1;

      let nextNode = current.children.find((child) => child.name === part && child.type === (isFile ? 'file' : 'directory'));
      if (!nextNode) {
        nextNode = isFile
          ? { name: part, path: currentPath, type: 'file', editable: file.editable, children: [] }
          : createDirectoryNode(part, currentPath);
        current.children.push(nextNode);
      }

      current = nextNode;
    }
  }

  const sortNodes = (nodes: FileTreeNode[]) => {
    nodes.sort((left, right) => {
      if (left.type !== right.type) {
        return left.type === 'directory' ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    });
    nodes.forEach((node) => sortNodes(node.children));
  };

  sortNodes(root.children);
  return root.children;
}

export function collectExpandablePaths(nodes: FileTreeNode[]): string[] {
  const paths: string[] = [];

  for (const node of nodes) {
    if (node.type === 'directory') {
      paths.push(node.path);
      paths.push(...collectExpandablePaths(node.children));
    }
  }

  return paths;
}

export function collectParentPaths(filePath: string): string[] {
  const parts = filePath.split('/').filter(Boolean);
  return parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join('/'));
}

export function filterTree(nodes: FileTreeNode[], query: string): FileTreeNode[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return nodes;
  }

  return nodes
    .map((node) => {
      if (node.type === 'file') {
        return node.path.toLowerCase().includes(normalized) ? node : null;
      }

      const filteredChildren = filterTree(node.children, normalized);
      if (node.path.toLowerCase().includes(normalized) || filteredChildren.length > 0) {
        return {
          ...node,
          children: filteredChildren,
        };
      }

      return null;
    })
    .filter((node): node is FileTreeNode => Boolean(node));
}