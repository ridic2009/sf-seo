import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { buildFileTree, collectExpandablePaths, collectParentPaths, filterTree } from '../components/editor/codeEditorTree';

interface UseCodeEditorFilesParams {
  filesLoader: () => Promise<string[]>;
  fileLoader: (filePath: string) => Promise<string>;
  fileSaver: (filePath: string, content: string) => Promise<void>;
  confirm: (options: { title: string; description: string; confirmText?: string; tone?: 'default' | 'danger' | 'warning' }) => Promise<boolean>;
}

export function useCodeEditorFiles({ filesLoader, fileLoader, fileSaver, confirm }: UseCodeEditorFilesParams) {
  const [files, setFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [content, setContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [loadingFile, setLoadingFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedDirs, setExpandedDirs] = useState<string[]>([]);

  const fileTree = useMemo(() => buildFileTree(files), [files]);
  const filteredTree = useMemo(() => filterTree(fileTree, search), [fileTree, search]);
  const expandedDirSet = useMemo(() => new Set(expandedDirs), [expandedDirs]);
  const isDirty = content !== savedContent;

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
        const nextSelectedFile = nextFiles.includes(selectedFile) ? selectedFile : nextFiles[0];
        collectParentPaths(nextSelectedFile).forEach((dirPath) => defaultExpanded.add(dirPath));
        setSelectedFile(nextSelectedFile);
      } else {
        setSelectedFile('');
        setContent('');
        setSavedContent('');
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
  }, [fileLoader, selectedFile]);

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
    search,
    setSearch,
    filteredTree,
    expandedDirSet,
    isDirty,
    loadFiles,
    handleSelectFile,
    handleToggleDir,
    handleSave,
  };
}