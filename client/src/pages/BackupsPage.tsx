import { useEffect, useState } from 'react';
import { Archive, Download, Loader2, Server as ServerIcon, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useCreateServerBackup, useDeleteServerBackup, useServerBackups, useServers, useUpdateServer } from '../api/servers';
import { useConfirmationDialog } from '../components/ConfirmationDialog';
import { Toggle } from '../components/Toggle';
import { useApiErrorMessage } from '../hooks/useApiErrorMessage';
import type { Server } from '../types';
import { formatBackupScheduleInterval, formatBackupScheduleMode, getBackupScheduleNextRun } from '../utils/backupSchedule';
import { triggerFileDownload } from '../utils/download';
import { formatBytes, formatRuDateTime } from '../utils/format';
import { formatBackupMode, formatBackupStage, formatBackupStatus } from '../utils/serverBackups';

interface BackupScheduleDraft {
  enabled: boolean;
  mode: 'managed' | 'all';
  intervalHours: number;
}

function createScheduleDraft(server: Server): BackupScheduleDraft {
  return {
    enabled: server.backupScheduleEnabled,
    mode: server.backupScheduleMode,
    intervalHours: Math.max(1, server.backupScheduleIntervalHours || 24),
  };
}

export function BackupsPage() {
  const getApiErrorMessage = useApiErrorMessage();
  const { data: servers = [], isLoading: isServersLoading } = useServers();
  const { data: backups = [], isLoading: isBackupsLoading } = useServerBackups();
  const createBackup = useCreateServerBackup();
  const deleteBackup = useDeleteServerBackup();
  const updateServer = useUpdateServer();
  const { confirm, confirmationDialog } = useConfirmationDialog();
  const [activeBackupKey, setActiveBackupKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [savingScheduleId, setSavingScheduleId] = useState<number | null>(null);
  const [scheduleDrafts, setScheduleDrafts] = useState<Record<number, BackupScheduleDraft>>({});

  useEffect(() => {
    setScheduleDrafts(
      Object.fromEntries(servers.map((server) => [server.id, createScheduleDraft(server)])),
    );
  }, [servers]);

  const handleCreateBackup = (serverId: number, mode: 'managed' | 'all') => {
    const key = `${serverId}:${mode}`;
    setActiveBackupKey(key);
    createBackup.mutate(
      { id: serverId, mode },
      {
        onSuccess: (result) => {
          toast.success(`Создание бэкапа запущено для сервера ${result.serverName}`);
          setActiveBackupKey(null);
        },
        onError: (error: any) => {
          toast.error(error.response?.data?.error || 'Не удалось создать бэкап');
          setActiveBackupKey(null);
        },
      },
    );
  };

  const handleDeleteBackup = async (serverId: number, fileName: string) => {
    const shouldDelete = await confirm({
      title: 'Удалить архив?',
      description: `Архив ${fileName} будет удалён с локального диска.`,
      confirmText: 'Удалить архив',
      tone: 'danger',
    });

    if (!shouldDelete) {
      return;
    }

    const key = `${serverId}:${fileName}`;
    setDeletingKey(key);
    deleteBackup.mutate(
      { serverId, fileName },
      {
        onSuccess: () => {
          toast.success('Архив удалён');
          setDeletingKey(null);
        },
        onError: (error: any) => {
          toast.error(error.response?.data?.error || 'Не удалось удалить архив');
          setDeletingKey(null);
        },
      },
    );
  };

  const handleScheduleChange = (serverId: number, patch: Partial<BackupScheduleDraft>) => {
    setScheduleDrafts((current) => ({
      ...current,
      [serverId]: {
        ...(current[serverId] || { enabled: false, mode: 'managed', intervalHours: 24 }),
        ...patch,
      },
    }));
  };

  const handleSaveSchedule = (server: Server) => {
    const draft = scheduleDrafts[server.id] || createScheduleDraft(server);
    setSavingScheduleId(server.id);
    updateServer.mutate(
      {
        id: server.id,
        data: {
          backupScheduleEnabled: draft.enabled,
          backupScheduleMode: draft.mode,
          backupScheduleIntervalHours: Math.max(1, Math.round(draft.intervalHours || 24)),
        },
      },
      {
        onSuccess: () => {
          toast.success(`Расписание сохранено для сервера ${server.name}`);
          setSavingScheduleId(null);
        },
        onError: (error) => {
          toast.error(getApiErrorMessage(error, 'Не удалось сохранить расписание'));
          setSavingScheduleId(null);
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Бэкапы</h1>
        <p className="mt-1 text-sm text-gray-500">Создание архивов сайтов на сервере, управление уже собранными бэкапами и настройка автоматического расписания</p>
      </div>

      <section className="rounded-xl border border-gray-800 bg-gray-900 p-5">
        <div className="mb-4 flex items-center gap-2 text-gray-100">
          <Archive className="h-4 w-4 text-amber-300" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-300">Создать бэкап</h2>
        </div>

        {isServersLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
          </div>
        ) : servers.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-800 bg-gray-950 p-6 text-sm text-gray-500">
            Нет серверов для архивации.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {servers.map((server) => {
              const managedKey = `${server.id}:managed`;
              const allKey = `${server.id}:all`;
              const scheduleDraft = scheduleDrafts[server.id] || createScheduleDraft(server);
              const nextRun = getBackupScheduleNextRun(server.backupScheduleLastRunAt, scheduleDraft.intervalHours);
              const isSavingSchedule = savingScheduleId === server.id;

              return (
                <div key={server.id} className="rounded-xl border border-gray-800 bg-gray-950 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-900">
                        <ServerIcon className="h-5 w-5 text-gray-300" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-100">{server.name}</h3>
                        <p className="text-xs text-gray-500">{server.host}:{server.port}</p>
                      </div>
                    </div>
                    <span className="rounded-full border border-gray-800 px-2 py-1 text-xs text-gray-400">{server.panelType}</span>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                      onClick={() => handleCreateBackup(server.id, 'managed')}
                      disabled={activeBackupKey !== null}
                      className="flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {activeBackupKey === managedKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
                      Только сайты из приложения
                    </button>
                    <button
                      onClick={() => handleCreateBackup(server.id, 'all')}
                      disabled={activeBackupKey !== null}
                      className="flex items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {activeBackupKey === allKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
                      Все сайты на сервере
                    </button>
                  </div>

                  <div className="mt-4 rounded-xl border border-gray-800 bg-gray-900/60 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-semibold text-gray-100">Автоматические бэкапы</div>
                        <p className="mt-1 text-xs text-gray-500">Расписание работает, пока backend Site Factory запущен.</p>
                      </div>
                      <span className="rounded-full border border-gray-800 px-2 py-1 text-xs text-gray-400">
                        {formatBackupScheduleInterval(scheduleDraft.intervalHours)}
                      </span>
                    </div>

                    <div className="mt-4">
                      <Toggle
                        checked={scheduleDraft.enabled}
                        onChange={(checked) => handleScheduleChange(server.id, { enabled: checked })}
                        label="Включить расписание"
                        description="Backend будет сам запускать архивирование по выбранному интервалу."
                        disabled={isSavingSchedule}
                      />
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_auto] md:items-end">
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-gray-300">Режим</label>
                        <select
                          value={scheduleDraft.mode}
                          onChange={(event) => handleScheduleChange(server.id, { mode: event.target.value as 'managed' | 'all' })}
                          disabled={isSavingSchedule}
                          className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:border-indigo-500 focus:outline-none"
                        >
                          <option value="managed">Только сайты из приложения</option>
                          <option value="all">Все сайты на сервере</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-gray-300">Интервал, часов</label>
                        <input
                          type="number"
                          min={1}
                          max={720}
                          value={scheduleDraft.intervalHours}
                          onChange={(event) => handleScheduleChange(server.id, { intervalHours: Math.max(1, Number(event.target.value) || 1) })}
                          disabled={isSavingSchedule}
                          className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:border-indigo-500 focus:outline-none"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSaveSchedule(server)}
                        disabled={isSavingSchedule}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isSavingSchedule ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Сохранить
                      </button>
                    </div>

                    <div className="mt-3 grid gap-2 text-xs text-gray-500 md:grid-cols-2">
                      <div>
                        Последний запуск: {server.backupScheduleLastRunAt ? formatRuDateTime(server.backupScheduleLastRunAt) : 'ещё не выполнялся'}
                      </div>
                      <div>
                        Следующий запуск: {scheduleDraft.enabled && nextRun ? formatRuDateTime(nextRun.toISOString()) : 'расписание выключено'}
                      </div>
                    </div>

                    <div className="mt-2 text-xs text-gray-500">
                      Текущий режим: {formatBackupScheduleMode(scheduleDraft.mode)}.
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-gray-800 bg-gray-900 p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-300">Архивы</h2>
            <p className="mt-1 text-xs text-gray-500">Список ранее созданных бэкапов. Файлы хранятся локально на этой машине и автоматически удаляются через 31 день.</p>
          </div>
        </div>

        {isBackupsLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
          </div>
        ) : backups.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-800 bg-gray-950 p-6 text-sm text-gray-500">
            Бэкапов пока нет.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-3 font-medium">Сервер</th>
                  <th className="px-3 py-3 font-medium">Режим</th>
                  <th className="px-3 py-3 font-medium">Статус</th>
                  <th className="px-3 py-3 font-medium">Сайты</th>
                  <th className="px-3 py-3 font-medium">Размер</th>
                  <th className="px-3 py-3 font-medium">Дата</th>
                  <th className="px-3 py-3 font-medium">Действия</th>
                </tr>
              </thead>
              <tbody>
                {backups.map((backup) => {
                  const deleteKey = `${backup.serverId}:${backup.fileName}`;

                  return (
                    <tr key={`${backup.serverId}:${backup.fileName}`} className="border-b border-gray-800/80 text-gray-200">
                      <td className="px-3 py-3 align-top">
                        <div className="font-medium text-gray-100">{backup.serverName}</div>
                        <div className="mt-1 text-xs text-gray-500">{backup.fileName}</div>
                      </td>
                      <td className="px-3 py-3 align-top text-gray-300">{formatBackupMode(backup.mode)}</td>
                      <td className="px-3 py-3 align-top">
                        <div className="font-medium text-gray-100">{formatBackupStatus(backup.status)}</div>
                        <div className="mt-1 text-xs text-gray-500">{backup.errorMessage || formatBackupStage(backup.stage)}</div>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <div className="font-medium text-gray-100">{backup.siteCount}</div>
                        <div className="mt-1 max-w-md truncate text-xs text-gray-500" title={backup.sites.join(', ')}>
                          {backup.sites.join(', ')}
                        </div>
                      </td>
                      <td className="px-3 py-3 align-top text-gray-300">{formatBytes(backup.sizeBytes)}</td>
                      <td className="px-3 py-3 align-top text-gray-300">{formatRuDateTime(backup.createdAt)}</td>
                      <td className="px-3 py-3 align-top">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => triggerFileDownload(backup.downloadPath)}
                            disabled={backup.status !== 'completed'}
                            className="flex items-center gap-2 rounded-lg border border-gray-800 px-3 py-2 text-xs text-gray-300 transition-colors hover:border-gray-700 hover:bg-gray-800"
                          >
                            <Download className="h-3.5 w-3.5" />
                            Скачать
                          </button>
                          <button
                            onClick={() => handleDeleteBackup(backup.serverId, backup.fileName)}
                            disabled={deletingKey === deleteKey || backup.status === 'running'}
                            className="flex items-center gap-2 rounded-lg border border-red-900/60 px-3 py-2 text-xs text-red-300 transition-colors hover:bg-red-950/40 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {deletingKey === deleteKey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                            Удалить
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {confirmationDialog}
    </div>
  );
}
