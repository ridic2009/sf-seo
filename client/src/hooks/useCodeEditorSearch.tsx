import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { createPreviewPattern } from '../components/editor/codeEditorTree';
import type { GlobalSearchOptions, SearchResult } from '../components/editor/codeEditorTypes';

const SEARCH_DEBOUNCE_MS = 350;

interface UseCodeEditorSearchParams {
  enabled: boolean;
  selectedFile: string;
  fileLoader: (filePath: string) => Promise<string>;
  globalSearcher: (query: string, options: GlobalSearchOptions) => Promise<{ results: SearchResult[]; files: number; matches: number }>;
  globalReplacer: (query: string, replaceWith: string, options: GlobalSearchOptions) => Promise<{ updatedFiles: number; replacements: number }>;
  loadFiles: () => Promise<void>;
  setContent: (content: string) => void;
  setSavedContent: (content: string) => void;
  confirm: (options: { title: string; description: string; confirmText?: string; tone?: 'default' | 'danger' | 'warning' }) => Promise<boolean>;
}

export function useCodeEditorSearch({
  enabled,
  selectedFile,
  fileLoader,
  globalSearcher,
  globalReplacer,
  loadFiles,
  setContent,
  setSavedContent,
  confirm,
}: UseCodeEditorSearchParams) {
  const [globalQuery, setGlobalQuery] = useState('');
  const [replaceValue, setReplaceValue] = useState('');
  const [ignoreCase, setIgnoreCase] = useState(true);
  const [useRegex, setUseRegex] = useState(false);
  const [globalResults, setGlobalResults] = useState<SearchResult[]>([]);
  const [globalFilesCount, setGlobalFilesCount] = useState(0);
  const [globalMatchesCount, setGlobalMatchesCount] = useState(0);
  const [searchingGlobal, setSearchingGlobal] = useState(false);
  const [replacingGlobal, setReplacingGlobal] = useState(false);
  const globalSearchRequestId = useRef(0);

  const previewPattern = useMemo(
    () => createPreviewPattern(globalQuery.trim(), { ignoreCase, useRegex }),
    [globalQuery, ignoreCase, useRegex],
  );

  const resetGlobalResults = () => {
    setGlobalResults([]);
    setGlobalFilesCount(0);
    setGlobalMatchesCount(0);
  };

  const runGlobalSearch = async (queryValue: string) => {
    const query = queryValue.trim();
    if (!query) {
      resetGlobalResults();
      setSearchingGlobal(false);
      return;
    }

    const requestId = globalSearchRequestId.current + 1;
    globalSearchRequestId.current = requestId;
    setSearchingGlobal(true);

    try {
      const data = await globalSearcher(query, { ignoreCase, useRegex });
      if (globalSearchRequestId.current !== requestId) {
        return;
      }

      setGlobalResults(data.results);
      setGlobalFilesCount(data.files);
      setGlobalMatchesCount(data.matches);
    } catch (error: any) {
      if (globalSearchRequestId.current !== requestId) {
        return;
      }

      resetGlobalResults();
      toast.error(error?.response?.data?.error || error?.message || 'Не удалось выполнить поиск');
    } finally {
      if (globalSearchRequestId.current === requestId) {
        setSearchingGlobal(false);
      }
    }
  };

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const query = globalQuery.trim();
    if (!query) {
      globalSearchRequestId.current += 1;
      setSearchingGlobal(false);
      resetGlobalResults();
      return;
    }

    const timer = window.setTimeout(() => {
      void runGlobalSearch(query);
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [enabled, globalQuery, ignoreCase, useRegex]);

  const handleGlobalReplace = async () => {
    const query = globalQuery.trim();
    if (!query) {
      toast.error('Введите текст для замены');
      return;
    }

    const shouldReplace = await confirm({
      title: 'Применить глобальную замену?',
      description: `Во всех доступных файлах будет выполнена замена "${query}" на "${replaceValue}".`,
      confirmText: 'Заменить во всех файлах',
      tone: 'danger',
    });

    if (!shouldReplace) {
      return;
    }

    setReplacingGlobal(true);
    try {
      const data = await globalReplacer(query, replaceValue, { ignoreCase, useRegex });
      toast.success(`Заменено ${data.replacements} вхождений в ${data.updatedFiles} файлах`);
      await loadFiles();
      if (selectedFile) {
        const reloadedContent = await fileLoader(selectedFile);
        setContent(reloadedContent);
        setSavedContent(reloadedContent);
      }
      await runGlobalSearch(query);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || error?.message || 'Не удалось выполнить замену');
    } finally {
      setReplacingGlobal(false);
    }
  };

  const highlightPreview = (preview: string) => {
    if (!previewPattern) {
      return preview;
    }

    const match = preview.match(previewPattern);
    if (!match || match.index == null) {
      return preview;
    }

    const index = match.index;
    const matchText = match[0];

    return (
      <>
        {preview.slice(0, index)}
        <span className="rounded bg-indigo-500/20 px-0.5 text-indigo-200">{preview.slice(index, index + matchText.length)}</span>
        {preview.slice(index + matchText.length)}
      </>
    );
  };

  return {
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
  };
}