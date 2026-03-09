export interface GlobalSearchOptions {
  ignoreCase?: boolean;
  useRegex?: boolean;
}

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

export interface FileTreeNode {
  name: string;
  path: string;
  type: 'directory' | 'file';
  children: FileTreeNode[];
}