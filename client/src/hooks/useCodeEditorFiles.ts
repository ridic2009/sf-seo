import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { buildFileTree, collectExpandablePaths, collectParentPaths, filterTree } from '../components/editor/codeEditorTree';
import type { EditorFileEntry } from '../components/editor/codeEditorTypes';

interface UseCodeEditorFilesParams {
  filesLoader: () => Promise<EditorFileEntry[]>;
  fileLoader: (filePath: string) => Promise<string>;
  fileSaver: (filePath: string, content: string) => Promise<void>;
  fileUploader: (files: File[], targetDir: string) => Promise<void>;
  fileDeleter: (filePath: string) => Promise<void>;
  confirm: (options: { title: string; description: string; confirmText?: string; tone?: 'default' | 'danger' | 'warning' }) => Promise<boolean>;
}

export function useCodeEditorFiles({ filesLoader, fileLoader, fileSaver, fileUploader, fileDeleter, confirm }: UseCodeEditorFilesParams) {
  const [files, setFiles] = useState<EditorFileEntry[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [content, setContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [loadingFile, setLoadingFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedDirs, setExpandedDirs] = useState<string[]>([]);
  const [uploadTargetDir, setUploadTargetDir] = useState('');

  const fileTree = useMemo(() => buildFileTree(files), [files]);
  const filteredTree = useMemo(() => filterTree(fileTree, search), [fileTree, search]);
  const expandedDirSet = useMemo(() => new Set(expandedDirs), [expandedDirs]);
  const isDirty = content !== savedContent;
  const selectedFileEntry = useMemo(() => files.find((item) => item.path === selectedFile) || null, [files, selectedFile]);
  const selectedFileEditable = selectedFileEntry?.editable ?? false;

  const loadFiles = async () => {
    setLoadingFiles(true);
    try {
      const nextFiles = await filesLoader();
      setFiles(nextFiles);
      const defaultExpanded = new Set<string>();
      buildFileTree(nextFiles).forEach((node) => {
        if (node.type === 'directory') {
          defaultExpanded.add(node.path);
        }
      });

      if (nextFiles.length > 0) {
        const nextSelectedFile = nextFiles.some((item) => item.path === selectedFile) ? selectedFile : nextFiles[0].path;
        collectParentPaths(nextSelectedFile).forEach((dirPath) => defaultExpanded.add(dirPath));
        setSelectedFile(nextSelectedFile);
        const hasCurrentTarget = !uploadTargetDir || nextFiles.some((item) => item.path.startsWith(`${uploadTargetDir}/`));
        setUploadTargetDir(hasCurrentTarget ? uploadTargetDir : collectParentPaths(nextSelectedFile).slice(-1)[0] || '');
      } else {
        setSelectedFile('');
        setContent('');
        setSavedContent('');
        setUploadTargetDir('');
      }

      setExpandedDirs(Array.from(defaultExpanded));
    } catch (error: any) {
      toast.error(error?.response?.data?.error || error?.message || 'Не удалось загрузить список файлов');
    } finally {
      setLoadingFiles(false);
    }
  };

  useEffect(() => {
    void loadFiles();
  }, []);

  useEffect(() => {
    if (!search.trim()) {
      return;
    }

    setExpandedDirs((current) => {
      const next = new Set(current);
      collectExpandablePaths(filteredTree).forEach((dirPath) => next.add(dirPath));
      return Array.from(next);
    });
  }, [filteredTree, search]);

  useEffect(() => {
    if (!selectedFile) {
      return;
    }

    if (!selectedFileEditable) {
      setLoadingFile(false);
      setContent('');
      setSavedContent('');
      return;
    }

    let cancelled = false;
    setLoadingFile(true);

    fileLoader(selectedFile)
      .then((nextContent) => {
        if (cancelled) {
          return;
        }
        setContent(nextContent);
        setSavedContent(nextContent);
      })
      .catch((error: any) => {
        if (cancelled) {
          return;
        }
        toast.error(error?.response?.data?.error || error?.message || 'Не удалось загрузить файл');
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingFile(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fileLoader, selectedFile, selectedFileEditable]);

  const handleSelectFile = async (filePath: string) => {
    if (saving || filePath === selectedFile) {
      return;
    }

    if (isDirty) {
      const shouldSwitch = await confirm({
        title: 'Есть несохранённые изменения',
        description: 'Изменения в текущем файле будут потеряны, если перейти к другому файлу без сохранения.',
        confirmText: 'Перейти без сохранения',
        tone: 'warning',
      });

      if (!shouldSwitch) {
        return;
      }
    }

    setExpandedDirs((current) => Array.from(new Set([...current, ...collectParentPaths(filePath)])));
    setSelectedFile(filePath);
  };

  const handleToggleDir = (dirPath: string) => {
    setExpandedDirs((current) => (
      current.includes(dirPath)
        ? current.filter((item) => item !== dirPath)
        : [...current, dirPath]
    ));
  };

  const handleSave = async () => {
    if (!selectedFile) {
      return;
    }

    if (!selectedFileEditable) {
      toast.error('Этот файл нельзя редактировать как текст');
      return;
    }

    setSaving(true);
    try {
      await fileSaver(selectedFile, content);
      setSavedContent(content);
      toast.success('Изменения сохранены');
      await loadFiles();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || error?.message || 'Не удалось сохранить файл');
    } finally {
      setSaving(false);
    }
  };

  const handleUploadFiles = async (items: File[], targetDir: string) => {
    if (items.length === 0) {
      return;
    }

    setUploading(true);
    try {
      await fileUploader(items, targetDir);
      toast.success(items.length === 1 ? 'Файл загружен' : `Загружено файлов: ${items.length}`);
      await loadFiles();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || error?.message || 'Не удалось загрузить файлы');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteSelectedFile = async () => {
    if (!selectedFile) {
      return;
    }

    if (selectedFileEditable && isDirty) {
      const shouldDiscard = await confirm({
        title: 'Есть несохранённые изменения',
        description: 'Если удалить файл сейчас, несохранённые изменения будут потеряны.',
        confirmText: 'Продолжить удаление',
        tone: 'warning',
      });

      if (!shouldDiscard) {
        return;
      }
    }

    const shouldDelete = await confirm({
      title: 'Удалить файл?',
      description: `Файл "${selectedFile}" будет удалён.`,
      confirmText: 'Удалить файл',
      tone: 'danger',
    });

    if (!shouldDelete) {
      return;
    }

    setDeleting(true);
    try {
      await fileDeleter(selectedFile);
      setSelectedFile('');
      setContent('');
      setSavedContent('');
      toast.success('Файл удалён');
      await loadFiles();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || error?.message || 'Не удалось удалить файл');
    } finally {
      setDeleting(false);
    }
  };

  return {
    files,
    selectedFile,
    setSelectedFile,
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
  };
}