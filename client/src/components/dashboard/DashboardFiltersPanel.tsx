import { Search, SlidersHorizontal } from 'lucide-react';
import type { Site } from '../../types';

const selectClass = 'h-11 rounded-xl border border-gray-800 bg-gray-900/80 px-3 text-sm text-gray-200 outline-none transition-colors focus:border-indigo-500';

interface DashboardFiltersPanelProps {
  globalFilter: string;
  templateFilter: string;
  serverFilter: string;
  statusFilter: 'all' | Site['status'];
  templateOptions: Array<{ value: string; label: string }>;
  serverOptions: Array<{ value: string; label: string }>;
  hasActiveFilters: boolean;
  selectedTransferCount: number;
  filteredCount: number;
  totalCount: number;
  onGlobalFilterChange: (value: string) => void;
  onTemplateFilterChange: (value: string) => void;
  onServerFilterChange: (value: string) => void;
  onStatusFilterChange: (value: 'all' | Site['status']) => void;
  onResetFilters: () => void;
  onClearTransferSelection: () => void;
}

export function DashboardFiltersPanel({
  globalFilter,
  templateFilter,
  serverFilter,
  statusFilter,
  templateOptions,
  serverOptions,
  hasActiveFilters,
  selectedTransferCount,
  filteredCount,
  totalCount,
  onGlobalFilterChange,
  onTemplateFilterChange,
  onServerFilterChange,
  onStatusFilterChange,
  onResetFilters,
  onClearTransferSelection,
}: DashboardFiltersPanelProps) {
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900/70 p-3 backdrop-blur-sm">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="relative flex-1 xl:max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Поиск по домену, названию бизнеса и серверу..."
            className="h-11 w-full rounded-xl border border-gray-800 bg-gray-950/70 py-2.5 pl-10 pr-4 text-sm text-gray-200 placeholder-gray-600 outline-none transition-colors focus:border-indigo-500"
            value={globalFilter}
            onChange={(event) => onGlobalFilterChange(event.target.value)}
          />
        </div>

        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-gray-500">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Фильтры
          </div>

          <select className={selectClass} value={templateFilter} onChange={(event) => onTemplateFilterChange(event.target.value)}>
            <option value="all">Все шаблоны</option>
            {templateOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select className={selectClass} value={serverFilter} onChange={(event) => onServerFilterChange(event.target.value)}>
            <option value="all">Все серверы</option>
            {serverOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select className={selectClass} value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value as 'all' | Site['status'])}>
            <option value="all">Все статусы</option>
            <option value="deployed">Развёрнут</option>
            <option value="pending">Ожидает</option>
            <option value="deploying">Деплоится</option>
            <option value="error">Ошибка</option>
          </select>

          <button
            type="button"
            onClick={onResetFilters}
            disabled={!hasActiveFilters}
            className="h-11 rounded-xl border border-gray-800 px-4 text-sm text-gray-300 transition-colors hover:border-gray-700 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-45"
          >
            Сбросить
          </button>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-gray-800/80 px-1 pt-3 text-sm text-gray-500">
        <span>Показано {filteredCount} из {totalCount}</span>
        <div className="flex min-w-[320px] items-center justify-end gap-2">
          <span className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${selectedTransferCount > 0 ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200' : 'border-gray-800 bg-gray-900/60 text-gray-500'}`}>
            Выбрано: {selectedTransferCount}
          </span>
          <button
            type="button"
            onClick={onClearTransferSelection}
            disabled={selectedTransferCount === 0}
            className="rounded-full border border-gray-800 px-2.5 py-1 text-xs text-gray-400 transition-colors hover:border-gray-700 hover:bg-gray-800 hover:text-gray-200 disabled:opacity-40"
          >
            Очистить выбор
          </button>
          {hasActiveFilters && (
            <span className="rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2.5 py-1 text-xs text-indigo-200">
              Фильтры активны
            </span>
          )}
        </div>
      </div>
    </div>
  );
}