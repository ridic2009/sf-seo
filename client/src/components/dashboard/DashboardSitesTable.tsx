import { flexRender, type Table } from '@tanstack/react-table';
import { Loader2 } from 'lucide-react';
import type { Site } from '../../types';

interface DashboardSitesTableProps {
  table: Table<Site>;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  sitesCount: number;
  selectedTransferSiteIds: number[];
}

export function DashboardSitesTable({
  table,
  isLoading,
  isError,
  error,
  sitesCount,
  selectedTransferSiteIds,
}: DashboardSitesTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
      {isLoading ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
        </div>
      ) : isError ? (
        <div className="p-12 text-center text-gray-500">
          <p className="text-lg text-red-300">Не удалось загрузить сайты</p>
          <p className="mt-2 text-sm">{(error as any)?.response?.data?.error || (error as Error | undefined)?.message || 'API недоступен или отвечает не тем сервисом'}</p>
          <p className="mt-2 text-xs text-gray-600">Проверьте, что backend Site Factory действительно запущен на порту 3001.</p>
        </div>
      ) : sitesCount === 0 ? (
        <div className="p-12 text-center text-gray-500">
          <p className="text-lg">Пока нет воронок</p>
          <p className="mt-1 text-sm">Перейдите на страницу Деплой, чтобы создать первую</p>
        </div>
      ) : table.getRowModel().rows.length === 0 ? (
        <div className="p-12 text-center text-gray-500">
          <p className="text-lg text-gray-300">Ничего не найдено</p>
        </div>
      ) : (
        <table className="w-full table-fixed">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-gray-800">
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    aria-sort={header.column.getIsSorted() === 'asc' ? 'ascending' : header.column.getIsSorted() === 'desc' ? 'descending' : 'none'}
                    className={`px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 ${header.column.id === 'transferSelect' ? 'w-14 text-center' : ''}`}
                  >
                    {header.column.id === 'transferSelect' ? (
                      flexRender(header.column.columnDef.header, header.getContext())
                    ) : (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className="inline-flex items-center gap-1 transition-colors hover:text-gray-300 focus:outline-none focus:text-gray-300"
                      >
                        <span>{flexRender(header.column.columnDef.header, header.getContext())}</span>
                        <span>{({ asc: '↑', desc: '↓' }[header.column.getIsSorted() as string] ?? '')}</span>
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className={`transition-colors hover:bg-gray-800/30 ${selectedTransferSiteIds.includes(row.original.id) ? 'bg-indigo-500/5' : ''}`}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className={`${cell.column.id === 'transferSelect' ? 'w-14 px-4 py-3 text-center align-middle' : 'px-4 py-3 align-middle'}`}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}