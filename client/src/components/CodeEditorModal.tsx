import { useEffect, useMemo, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { FileCode2, Loader2, RefreshCw, Save, SearchCode, Trash2, Upload, X } from 'lucide-react';
import { ModalOverlay } from './ModalOverlay';
import { IconButton } from './IconButton';
import { useConfirmationDialog } from './ConfirmationDialog';
import { FileTreePanel } from './editor/FileTreePanel';
import { SearchPanel } from './editor/SearchPanel';
import { detectLanguage } from './editor/codeEditorTree';
import type { EditorFileEntry, GlobalSearchOptions, SearchResult } from './editor/codeEditorTypes';
import { useCodeEditorFiles } from '../hooks/useCodeEditorFiles';
import { useCodeEditorSearch } from '../hooks/useCodeEditorSearch';

interface CodeEditorModalProps {
  title: string;
  subtitle: string;
  filesLoader: () => Promise<EditorFileEntry[]>;
  fileLoader: (filePath: string) => Promise<string>;
  fileSaver: (filePath: string, content: string) => Promise<void>;
  fileUploader: (files: File[], targetDir: string) => Promise<void>;
  fileDeleter: (filePath: string) => Promise<void>;
  globalSearcher: (query: string, options: GlobalSearchOptions) => Promise<{ results: SearchResult[]; files: number; matches: number }>;
  globalReplacer: (query: string, replaceWith: string, options: GlobalSearchOptions) => Promise<{ updatedFiles: number; replacements: number }>;
  onClose: () => void;
  saveHint?: string;
}


export function CodeEditorModal({
  title,
  subtitle,
  filesLoader,
  fileLoader,
  fileSaver,
  fileUploader,
  fileDeleter,
  globalSearcher,
  globalReplacer,
  onClose,
  saveHint,
}: CodeEditorModalProps) {
  const [sidebarTab, setSidebarTab] = useState<'files' | 'search'>('files');
  const [pendingSelection, setPendingSelection] = useState<{ filePath: string; line: number; column: number; matchLength: number } | null>(null);
  const editorRef = useRef<any>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const uploadDirectoryInputRef = useRef<HTMLInputElement | null>(null);
  const { confirm, confirmationDialog } = useConfirmationDialog();

  const {
    selectedFile,
    content,
    setContent,
    savedContent,
    setSavedContent,
    loadingFiles,
    loadingFile,
    saving,
    uploading,
    deleting,
    search,
    setSearch,
    filteredTree,
    expandedDirSet,
    isDirty,
    selectedFileEditable,
    uploadTargetDir,
    setUploadTargetDir,
    loadFiles,
    handleSelectFile,
    handleToggleDir,
    handleSave,
    handleUploadFiles,
    handleDeleteSelectedFile,
  } = useCodeEditorFiles({ filesLoader, fileLoader, fileSaver, fileUploader, fileDeleter, confirm });

  const {
    globalQuery,
    setGlobalQuery,
    replaceValue,
    setReplaceValue,
    ignoreCase,
    setIgnoreCase,
    useRegex,
    setUseRegex,
    globalResults,
    globalFilesCount,
    globalMatchesCount,
    searchingGlobal,
    replacingGlobal,
    handleGlobalReplace,
    highlightPreview,
  } = useCodeEditorSearch({
    enabled: sidebarTab === 'search',
    selectedFile,
    selectedFileEditable,
    fileLoader,
    globalSearcher,
    globalReplacer,
    loadFiles,
    setContent,
    setSavedContent,
    confirm,
  });

  const uploadTargetLabel = useMemo(() => uploadTargetDir || 'Корень проекта', [uploadTargetDir]);

  useEffect(() => {
    if (!pendingSelection || pendingSelection.filePath !== selectedFile || loadingFile || !editorRef.current) {
      return;
    }

    const selection = {
      startLineNumber: pendingSelection.line,
      startColumn: pendingSelection.column,
      endLineNumber: pendingSelection.line,
      endColumn: pendingSelection.column + pendingSelection.matchLength,
    };

    editorRef.current.setSelection(selection);
    editorRef.current.revealLineInCenter(pendingSelection.line);
    editorRef.current.focus();
    setPendingSelection(null);
  }, [pendingSelection, selectedFile, loadingFile]);

  return (
    <>
      <ModalOverlay onClose={onClose} ariaLabel={title} className="z-[120] bg-black/75 p-4">
      <div className="mx-auto flex h-full max-w-7xl flex-col rounded-2xl border border-gray-800 bg-gray-950 shadow-2xl">
        <div className="flex items-start justify-between border-b border-gray-800 p-4">
          <div>
            <h2 className="text-lg font-semibold text-white">{title}</h2>
            <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
            {saveHint && <p className="mt-2 text-xs text-amber-300">{saveHint}</p>}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => uploadInputRef.current?.click()}
              disabled={uploading}
              title={`Загрузить файлы в ${uploadTargetLabel}`}
              className="rounded-lg border border-gray-800 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:border-gray-700 hover:bg-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="inline-flex items-center gap-2">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Загрузить файлы
              </span>
            </button>
            <button
              type="button"
              onClick={() => uploadDirectoryInputRef.current?.click()}
              disabled={uploading}
              title={`Загрузить папку в ${uploadTargetLabel}`}
              className="rounded-lg border border-gray-800 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:border-gray-700 hover:bg-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="inline-flex items-center gap-2">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Загрузить папку
              </span>
            </button>
            <button
              type="button"
              onClick={loadFiles}
              className="rounded-lg border border-gray-800 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:border-gray-700 hover:bg-gray-900"
            >
              <span className="inline-flex items-center gap-2">
                <RefreshCw className="h-4 w-4" />
                Обновить
              </span>
            </button>
            <IconButton
              onClick={onClose}
              label="Закрыть редактор кода"
            >
              <X className="h-4 w-4" />
            </IconButton>
          </div>
        </div>

        <input
          ref={uploadInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.target.files || []);
            if (files.length > 0) {
              void handleUploadFiles(files, uploadTargetDir);
            }
            event.currentTarget.value = '';
          }}
        />
        <input
          ref={uploadDirectoryInputRef}
          type="file"
          multiple
          className="hidden"
          {...({ webkitdirectory: 'true', directory: 'true' } as any)}
          onChange={(event) => {
            const files = Array.from(event.target.files || []);
            if (files.length > 0) {
              void handleUploadFiles(files, uploadTargetDir);
            }
            event.currentTarget.value = '';
          }}
        />

        <div className="min-h-0 flex flex-1 overflow-hidden">
          <aside className="flex w-80 flex-col border-r border-gray-800 bg-gray-900/70">
            <div className="border-b border-gray-800 p-3">
              <div className="grid grid-cols-2 gap-2 rounded-xl border border-gray-800 bg-gray-950/80 p-1">
                <button
                  type="button"
                  onClick={() => setSidebarTab('files')}
                  className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${sidebarTab === 'files' ? 'bg-indigo-600 text-white' : 'text-gray-300 hover:bg-gray-900'}`}
                >
                  <FileCode2 className="h-4 w-4" />
                  Файлы
                </button>
                <button
                  type="button"
                  onClick={() => setSidebarTab('search')}
                  className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${sidebarTab === 'search' ? 'bg-indigo-600 text-white' : 'text-gray-300 hover:bg-gray-900'}`}
                >
                  <SearchCode className="h-4 w-4" />
                  Поиск
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {loadingFiles ? (
                <div className="flex items-center justify-center p-6 text-gray-500">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : (
                sidebarTab === 'files' ? (
                  <FileTreePanel
                    search={search}
                    onSearchChange={setSearch}
                    filteredTree={filteredTree}
                    expandedDirSet={expandedDirSet}
                    selectedFile={selectedFile}
                    selectedUploadDir={uploadTargetDir}
                    onToggleDir={handleToggleDir}
                    onSelectFile={handleSelectFile}
                    onSelectUploadDir={setUploadTargetDir}
                  />
                ) : (
                  <SearchPanel
                    globalQuery={globalQuery}
                    replaceValue={replaceValue}
                    ignoreCase={ignoreCase}
                    useRegex={useRegex}
                    searchingGlobal={searchingGlobal}
                    replacingGlobal={replacingGlobal}
                    globalResults={globalResults}
                    globalFilesCount={globalFilesCount}
                    globalMatchesCount={globalMatchesCount}
                    onGlobalQueryChange={setGlobalQuery}
                    onReplaceValueChange={setReplaceValue}
                    onToggleIgnoreCase={() => setIgnoreCase((current) => !current)}
                    onToggleRegex={() => setUseRegex((current) => !current)}
                    onGlobalReplace={handleGlobalReplace}
                    onSelectFile={handleSelectFile}
                    onNavigateToMatch={(payload) => {
                      setPendingSelection(payload);
                      void handleSelectFile(payload.filePath);
                    }}
                    highlightPreview={highlightPreview}
                  />
                )
              )}
            </div>
          </aside>

          <section className="min-h-0 flex flex-1 flex-col">
            <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-gray-200">{selectedFile || 'Файл не выбран'}</div>
                <div className="mt-1 text-xs text-gray-500">{selectedFile ? (selectedFileEditable ? detectLanguage(selectedFile) : 'Бинарный / не-текстовый файл') : '—'}</div>
              </div>
              <div className="flex items-center gap-2">
                {selectedFile && (
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() => void handleDeleteSelectedFile()}
                    className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 px-4 py-2 text-sm font-medium text-red-200 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    Удалить
                  </button>
                )}
                <button
                  type="button"
                  disabled={!selectedFile || !selectedFileEditable || saving || loadingFile || !isDirty}
                  onClick={handleSave}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Сохранить
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 bg-[#0b1220]">
              {loadingFile ? (
                <div className="flex h-full items-center justify-center text-gray-500">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : selectedFile && selectedFileEditable ? (
                <Editor
                  height="100%"
                  theme="vs-dark"
                  language={detectLanguage(selectedFile)}
                  value={content}
                  onChange={(value) => setContent(value ?? '')}
                  onMount={(editor) => {
                    editorRef.current = editor;
                  }}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    wordWrap: 'on',
                    automaticLayout: true,
                    scrollBeyondLastLine: false,
                    tabSize: 2,
                  }}
                />
              ) : selectedFile ? (
                <div className="flex h-full items-center justify-center p-8 text-center text-gray-500">
                  <div className="max-w-md space-y-3">
                    <div className="text-base font-medium text-gray-300">Файл не открыт в текстовом редакторе</div>
                    <div className="text-sm text-gray-500">
                      Этот файл можно хранить в шаблоне или на сайте, дозагружать и удалять прямо отсюда, но он не поддерживает текстовое редактирование в Monaco.
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-gray-500">
                  Выберите файл слева
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
      </ModalOverlay>
      {confirmationDialog}
    </>
  );
}