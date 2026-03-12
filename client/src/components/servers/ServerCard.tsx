import { ExternalLink, Loader2, Pencil, Server as ServerIcon, Trash2, Wifi } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { useDeleteServer, useTestServer } from '../../api/servers';
import { useApiErrorMessage } from '../../hooks/useApiErrorMessage';
import type { Server } from '../../types';
import { formatBackupScheduleInterval, formatBackupScheduleMode, getBackupScheduleNextRun } from '../../utils/backupSchedule';
import { formatRuDateTime } from '../../utils/format';
import { getServerPanelUrl } from '../../utils/serverPanel';
import { useConfirmationDialog } from '../ConfirmationDialog';
import { IconButton } from '../IconButton';

const PANEL_TYPES = [
  { value: 'hestia', label: 'Hestia' },
  { value: 'fastpanel', label: 'FastPanel' },
  { value: 'ispmanager', label: 'ISP Manager' },
  { value: 'cpanel', label: 'cPanel' },
];

interface ServerCardProps {
  server: Server;
  onEdit: (server: Server) => void;
  onDelete: ReturnType<typeof useDeleteServer>;
  onTest: ReturnType<typeof useTestServer>;
}

export function ServerCard({ server, onEdit, onDelete, onTest }: ServerCardProps) {
  const { confirm, confirmationDialog } = useConfirmationDialog();
  const getApiErrorMessage = useApiErrorMessage();
  const [testing, setTesting] = useState(false);

  const handleTest = async () => {
    setTesting(true);
    onTest.mutate(server.id, {
      onSuccess: (data: { success: boolean; error?: string }) => {
        if (data.success) {
          toast.success(`${server.name}: подключение ОК`);
        } else {
          toast.error(`${server.name}: ${data.error || 'не удалось'}`);
        }
        setTesting(false);
      },
      onError: (error) => {
        toast.error(getApiErrorMessage(error, 'Ошибка тестирования'));
        setTesting(false);
      },
    });
  };

  const panelLabel = PANEL_TYPES.find((panel) => panel.value === server.panelType)?.label || server.panelType;
  const panelUrl = getServerPanelUrl(server);
  const nextRun = server.backupScheduleEnabled
    ? getBackupScheduleNextRun(server.backupScheduleLastRunAt, server.backupScheduleIntervalHours)
    : null;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${server.isActive ? 'bg-green-500/10' : 'bg-gray-800'}`}>
            <ServerIcon className={`w-5 h-5 ${server.isActive ? 'text-green-400' : 'text-gray-500'}`} />
          </div>
          <div>
            <h3 className="font-semibold text-gray-100">{server.name}</h3>
            <p className="text-gray-500 text-xs font-mono">{server.host}:{server.port}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <IconButton
            onClick={() => onEdit(server)}
            label={`Редактировать сервер ${server.name}`}
            tone="primary"
          >
            <Pencil className="w-4 h-4" />
          </IconButton>
          <IconButton
            onClick={handleTest}
            disabled={testing}
            label={`Проверить подключение к серверу ${server.name}`}
            tone="success"
          >
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
          </IconButton>
          <IconButton
            onClick={async () => {
              const shouldDelete = await confirm({
                title: 'Удалить сервер?',
                description: `Сервер "${server.name}" будет удалён из списка подключений.`,
                confirmText: 'Удалить сервер',
                tone: 'danger',
              });

              if (!shouldDelete) {
                return;
              }

              onDelete.mutate(server.id, { onSuccess: () => toast.success('Сервер удалён') });
            }}
            label={`Удалить сервер ${server.name}`}
            tone="danger"
          >
            <Trash2 className="w-4 h-4" />
          </IconButton>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <div>
          <span className="text-gray-500">Панель:</span>
          <span className="ml-2 inline-flex items-center gap-2 text-gray-300">
            <span>{panelLabel}</span>
            {panelUrl && (
              <a
                href={panelUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Открыть панель сервера ${server.name}`}
                className="text-gray-500 transition-colors hover:text-indigo-300"
                title="Открыть панель"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </span>
        </div>
        <div>
          <span className="text-gray-500">Пользователь:</span>
          <span className="ml-2 text-gray-300">{server.username}</span>
        </div>
        <div>
          <span className="text-gray-500">Авторизация:</span>
          <span className="ml-2 text-gray-300">{server.authType === 'key' ? 'SSH ключ' : 'Пароль'}</span>
        </div>
        <div>
          <span className="text-gray-500">Панель юзер:</span>
          <span className="ml-2 text-gray-300">{server.panelUser || server.username}</span>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-gray-800">
        <span className="text-gray-600 text-xs font-mono break-all">{server.webRootPattern}</span>
      </div>

      <div className="mt-3 rounded-lg border border-gray-800 bg-gray-950/50 p-3 text-xs text-gray-400">
        <div className="flex items-center justify-between gap-3">
          <span className="font-medium text-gray-300">Автобэкапы</span>
          <span className={`rounded-full px-2 py-1 ${server.backupScheduleEnabled ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border border-gray-800 text-gray-500'}`}>
            {server.backupScheduleEnabled ? formatBackupScheduleInterval(server.backupScheduleIntervalHours) : 'Выключены'}
          </span>
        </div>
        <div className="mt-2">Режим: {formatBackupScheduleMode(server.backupScheduleMode)}</div>
        <div className="mt-1">Следующий запуск: {nextRun ? formatRuDateTime(nextRun.toISOString()) : 'нет'}</div>
      </div>

      {confirmationDialog}
    </div>
  );
}