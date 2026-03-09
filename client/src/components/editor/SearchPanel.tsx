import type { ReactNode } from 'react';
import { Loader2, Replace } from 'lucide-react';
import type { SearchResult } from './codeEditorTypes';

interface SearchPanelProps {
  globalQuery: string;
  replaceValue: string;
  ignoreCase: boolean;
  useRegex: boolean;
  searchingGlobal: boolean;
  replacingGlobal: boolean;
  globalResults: SearchResult[];
  globalFilesCount: number;
  globalMatchesCount: number;
  onGlobalQueryChange: (value: string) => void;
  onReplaceValueChange: (value: string) => void;
  onToggleIgnoreCase: () => void;
  onToggleRegex: () => void;
  onGlobalReplace: () => void | Promise<void>;
  onSelectFile: (filePath: string) => void | Promise<void>;
  onNavigateToMatch: (payload: { filePath: string; line: number; column: number; matchLength: number }) => void;
  highlightPreview: (preview: string) => ReactNode;
}

export function SearchPanel({
  globalQuery,
  replaceValue,
  ignoreCase,
  useRegex,
  searchingGlobal,
  replacingGlobal,
  globalResults,
  globalFilesCount,
  globalMatchesCount,
  onGlobalQueryChange,
  onReplaceValueChange,
  onToggleIgnoreCase,
  onToggleRegex,
  onGlobalReplace,
  onSelectFile,
  onNavigateToMatch,
  highlightPreview,
}: SearchPanelProps) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-gray-800 bg-gray-950/70 p-3">
        <div className="space-y-2">
          <input
            value={globalQuery}
            onChange={(event) => onGlobalQueryChange(event.target.value)}
            placeholder="Что найти во всех файлах"
            className="w-full rounded-lg border border-gray-800 bg-[#0b1220] px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-indigo-500 focus:outline-none"
          />
          <input
            value={replaceValue}
            onChange={(event) => onReplaceValueChange(event.target.value)}
            placeholder="Чем заменить"
            className="w-full rounded-lg border border-gray-800 bg-[#0b1220] px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-indigo-500 focus:outline-none"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onToggleIgnoreCase}
              className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${ignoreCase ? 'border-indigo-500/60 bg-indigo-500/10 text-indigo-200' : 'border-gray-800 bg-gray-950 text-gray-400 hover:border-gray-700 hover:text-gray-200'}`}
            >
              Без учёта регистра
            </button>
            <button
              type="button"
              onClick={onToggleRegex}
              className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${useRegex ? 'border-indigo-500/60 bg-indigo-500/10 text-indigo-200' : 'border-gray-800 bg-gray-950 text-gray-400 hover:border-gray-700 hover:text-gray-200'}`}
            >
              Regex
            </button>
          </div>
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{searchingGlobal ? 'Ищу...' : `Результатов: ${globalMatchesCount}`}</span>
            <span>Файлов: {globalFilesCount}</span>
          </div>
          <button
            type="button"
            onClick={() => void onGlobalReplace()}
            disabled={!globalQuery.trim() || replacingGlobal}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
          >
            {replacingGlobal ? <Loader2 className="h-4 w-4 animate-spin" /> : <Replace className="h-4 w-4" />}
            Заменить всё
          </button>
        </div>
      </div>

      {!globalQuery.trim() ? null : globalResults.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-gray-950/50 p-4 text-sm text-gray-500">
          {searchingGlobal ? 'Выполняется поиск...' : 'Результатов: 0'}
        </div>
      ) : (
        <div className="space-y-2">
          {globalResults.map((result) => (
            <div key={result.filePath} className="rounded-lg border border-gray-800 bg-[#0b1220]/50 p-2">
              <button
                type="button"
                onClick={() => void onSelectFile(result.filePath)}
                className="mb-2 block w-full truncate text-left text-sm font-medium text-indigo-300 hover:text-indigo-200"
              >
                {result.filePath}
              </button>
              <div className="space-y-1">
                {result.matches.slice(0, 8).map((match, index) => (
                  <button
                    key={`${result.filePath}-${match.line}-${match.column}-${index}`}
                    type="button"
                    onClick={() => onNavigateToMatch({
                      filePath: result.filePath,
                      line: match.line,
                      column: match.column,
                      matchLength: match.matchLength,
                    })}
                    className="block w-full rounded-md px-2 py-1 text-left text-xs text-gray-400 hover:bg-gray-900 hover:text-gray-200"
                  >
                    <div className="mb-0.5 text-[10px] uppercase tracking-[0.14em] text-gray-600">{match.line}:{match.column}</div>
                    <div className="break-words">{highlightPreview(match.preview)}</div>
                  </button>
                ))}
                {result.matches.length > 8 && (
                  <div className="px-2 text-[11px] text-gray-500">Ещё {result.matches.length - 8} совпадений...</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}