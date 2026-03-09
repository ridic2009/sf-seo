import { ChevronDown, ChevronRight, FileCode2, Folder, Search } from 'lucide-react';
import type { FileTreeNode } from './codeEditorTypes';

function TreeNode({
  node,
  depth,
  expandedDirs,
  selectedFile,
  onToggle,
  onSelect,
}: {
  node: FileTreeNode;
  depth: number;
  expandedDirs: Set<string>;
  selectedFile: string;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void | Promise<void>;
}) {
  const paddingLeft = 12 + depth * 14;

  if (node.type === 'file') {
    return (
      <button
        type="button"
        onClick={() => void onSelect(node.path)}
        className={`flex w-full items-center gap-2 rounded-lg py-2 pr-3 text-left text-sm transition-colors ${selectedFile === node.path ? 'bg-indigo-500/10 text-indigo-300' : 'text-gray-300 hover:bg-gray-800'}`}
        style={{ paddingLeft }}
      >
        <FileCode2 className="h-4 w-4 shrink-0 text-gray-500" />
        <span className="truncate">{node.name}</span>
      </button>
    );
  }

  const isExpanded = expandedDirs.has(node.path);

  return (
    <div>
      <button
        type="button"
        onClick={() => onToggle(node.path)}
        className="flex w-full items-center gap-2 rounded-lg py-2 pr-3 text-left text-sm text-gray-200 transition-colors hover:bg-gray-800"
        style={{ paddingLeft }}
      >
        {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" /> : <ChevronRight className="h-4 w-4 shrink-0 text-gray-500" />}
        <Folder className="h-4 w-4 shrink-0 text-gray-500" />
        <span className="truncate">{node.name}</span>
      </button>

      {isExpanded && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              expandedDirs={expandedDirs}
              selectedFile={selectedFile}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface FileTreePanelProps {
  search: string;
  onSearchChange: (value: string) => void;
  filteredTree: FileTreeNode[];
  expandedDirSet: Set<string>;
  selectedFile: string;
  onToggleDir: (path: string) => void;
  onSelectFile: (path: string) => void | Promise<void>;
}

export function FileTreePanel({
  search,
  onSearchChange,
  filteredTree,
  expandedDirSet,
  selectedFile,
  onToggleDir,
  onSelectFile,
}: FileTreePanelProps) {
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Поиск файла..."
          className="w-full rounded-lg border border-gray-800 bg-gray-950 py-2 pl-9 pr-3 text-sm text-gray-200 placeholder-gray-600 focus:border-indigo-500 focus:outline-none"
        />
      </div>

      {filteredTree.length === 0 ? (
        <div className="p-4 text-sm text-gray-500">Нет доступных файлов</div>
      ) : (
        <div className="space-y-1">
          {filteredTree.map((node) => (
            <TreeNode
              key={node.path}
              node={node}
              depth={0}
              expandedDirs={expandedDirSet}
              selectedFile={selectedFile}
              onToggle={onToggleDir}
              onSelect={onSelectFile}
            />
          ))}
        </div>
      )}
    </div>
  );
}