import { Loader2, RefreshCcw, X } from 'lucide-react';
import type { Server } from '../../types';
import { IconButton } from '../IconButton';
import { ModalOverlay } from '../ModalOverlay';

interface TransferSitesModalProps {
  servers: Server[];
  selectedSiteIds: number[];
  targetServerId: number;
  onTargetServerChange: (serverId: number) => void;
  onClose: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
}

export function TransferSitesModal({
  servers,
  selectedSiteIds,
  targetServerId,
  onTargetServerChange,
  onClose,
  onSubmit,
  isSubmitting,
}: TransferSitesModalProps) {
  const activeServers = servers.filter((server) => server.isActive);
  const targetServer = activeServers.find((server) => server.id === targetServerId) || null;
  const selectedCount = selectedSiteIds.length;

  return (
    <ModalOverlay onClose={onClose} ariaLabel="Аварийный перенос сайтов" className="z-[140] p-4">
      <div className="absolute inset-0 bg-black/88 backdrop-blur-[3px]" />
      <div className="relative flex h-full w-full items-center justify-center p-4">
        <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl">
          <div className="flex items-start justify-between gap-6 border-b border-slate-800 px-6 py-5">
            <div>
              <h2 className="text-xl font-semibold text-white">Аварийный перенос сайтов</h2>
            </div>
            <IconButton
              onClick={onClose}
              label="Закрыть окно аварийного переноса"
              className="border border-slate-800 text-slate-500 hover:border-slate-700 hover:bg-slate-900 hover:text-slate-300"
            >
              <X className="h-4 w-4" />
            </IconButton>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
              <label className="block text-sm font-medium text-slate-300">Сервер назначения</label>
              <select
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-100 outline-none transition-colors focus:border-indigo-500"
                value={targetServerId}
                onChange={(event) => onTargetServerChange(parseInt(event.target.value))}
              >
                <option value={0}>Выберите сервер...</option>
                {activeServers.map((server) => (
                  <option key={server.id} value={server.id}>
                    {server.name} ({server.host})
                  </option>
                ))}
              </select>
            </section>
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-slate-800 bg-slate-950 px-6 py-4">
            <p className="text-sm text-slate-500">Выбрано {selectedCount} сайт(ов){targetServer ? `, сервер: ${targetServer.name}` : ''}.</p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm text-slate-300 transition-colors hover:border-slate-600 hover:bg-slate-800"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={onSubmit}
                disabled={isSubmitting || selectedCount === 0 || targetServerId === 0}
                className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                Запустить перенос
              </button>
            </div>
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}