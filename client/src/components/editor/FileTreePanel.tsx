import { Check, ChevronDown, ChevronRight, File, FileCode2, Folder, Search, Upload } from 'lucide-react';
import type { FileTreeNode } from './codeEditorTypes';

function TreeNode({
  node,
  depth,
  expandedDirs,
  selectedFile,
  selectedUploadDir,
  onToggle,
  onSelect,
  onSelectUploadDir,
}: {
  node: FileTreeNode;
  depth: number;
  expandedDirs: Set<string>;
  selectedFile: string;
  selectedUploadDir: string;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void | Promise<void>;
  onSelectUploadDir: (path: string) => void;
}) {
  const paddingLeft = 12 + depth * 14;

  if (node.type === 'file') {
    const FileIcon = node.editable ? FileCode2 : File;

    return (
      <button
        type="button"
        onClick={() => void onSelect(node.path)}
        className={`flex w-full items-center gap-2 rounded-lg py-2 pr-3 text-left text-sm transition-colors ${selectedFile === node.path ? 'bg-indigo-500/10 text-indigo-300' : 'text-gray-300 hover:bg-gray-800'}`}
        style={{ paddingLeft }}
        title={node.editable ? node.path : `${node.path} • Файл доступен для загрузки и удаления, но не для текстового редактирования`}
      >
        <FileIcon className={`h-4 w-4 shrink-0 ${node.editable ? 'text-gray-500' : 'text-amber-400/80'}`} />
        <span className="truncate">{node.name}</span>
      </button>
    );
  }

  const isExpanded = expandedDirs.has(node.path);
  const isUploadTarget = selectedUploadDir === node.path;

  return (
    <div>
      <div className={`flex items-center gap-2 rounded-lg pr-2 text-sm transition-colors hover:bg-gray-800 ${isUploadTarget ? 'bg-emerald-500/10 text-emerald-200' : 'text-gray-200'}`}>
        <button
          type="button"
          onClick={() => onToggle(node.path)}
          className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left"
          style={{ paddingLeft }}
        >
          {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0 text-gray-500" /> : <ChevronRight className="h-4 w-4 shrink-0 text-gray-500" />}
          <Folder className={`h-4 w-4 shrink-0 ${isUploadTarget ? 'text-emerald-300' : 'text-gray-500'}`} />
          <span className="truncate">{node.name}</span>
        </button>
        <button
          type="button"
          onClick={() => onSelectUploadDir(node.path)}
          className={`inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] transition-colors ${isUploadTarget ? 'bg-emerald-500/20 text-emerald-200' : 'text-gray-400 hover:bg-gray-900 hover:text-gray-200'}`}
          title={`Загружать в ${node.path}`}
        >
          {isUploadTarget ? <Check className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />}
          {isUploadTarget ? 'Цель' : 'Сюда'}
        </button>
      </div>

      {isExpanded && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              expandedDirs={expandedDirs}
              selectedFile={selectedFile}
              selectedUploadDir={selectedUploadDir}
              onToggle={onToggle}
              onSelect={onSelect}
              onSelectUploadDir={onSelectUploadDir}
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
  selectedUploadDir: string;
  onToggleDir: (path: string) => void;
  onSelectFile: (path: string) => void | Promise<void>;
  onSelectUploadDir: (path: string) => void;
}

export function FileTreePanel({
  search,
  onSearchChange,
  filteredTree,
  expandedDirSet,
  selectedFile,
  selectedUploadDir,
  onToggleDir,
  onSelectFile,
  onSelectUploadDir,
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

      <div className="rounded-lg border border-gray-800 bg-gray-950/80 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.2em] text-gray-500">Папка загрузки</div>
            <div className="mt-1 truncate text-sm text-gray-200">{selectedUploadDir || 'Корень проекта'}</div>
          </div>
          <button
            type="button"
            onClick={() => onSelectUploadDir('')}
            className={`rounded-md px-2.5 py-1.5 text-xs transition-colors ${selectedUploadDir === '' ? 'bg-emerald-500/20 text-emerald-200' : 'border border-gray-800 text-gray-400 hover:bg-gray-900 hover:text-gray-200'}`}
          >
            В корень
          </button>
        </div>
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
              selectedUploadDir={selectedUploadDir}
              onToggle={onToggleDir}
              onSelect={onSelectFile}
              onSelectUploadDir={onSelectUploadDir}
            />
          ))}
        </div>
      )}
    </div>
  );
}