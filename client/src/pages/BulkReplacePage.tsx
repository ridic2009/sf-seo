import { useState } from 'react';
import { Check, Loader2, Replace } from 'lucide-react';
import toast from 'react-hot-toast';
import { useBulkServerReplaceApply, useBulkServerReplacePreview, useServers } from '../api/servers';
import { FormFieldLabel } from '../components/FormFieldLabel';
import { Toggle } from '../components/Toggle';
import { useConfirmationDialog } from '../components/ConfirmationDialog';
import { useApiErrorMessage } from '../hooks/useApiErrorMessage';
import type { BulkReplaceApplyResponse, BulkReplacePreviewResponse } from '../types';

const PANEL_TYPES = [
  { value: 'hestia', label: 'Hestia' },
  { value: 'fastpanel', label: 'FastPanel' },
  { value: 'ispmanager', label: 'ISP Manager' },
  { value: 'cpanel', label: 'cPanel' },
];

export function BulkReplacePage() {
  const { data: servers = [], isLoading } = useServers();
  const { confirm, confirmationDialog } = useConfirmationDialog();
  const getApiErrorMessage = useApiErrorMessage();
  const previewMutation = useBulkServerReplacePreview();
  const applyMutation = useBulkServerReplaceApply();
  const [selectedServerIds, setSelectedServerIds] = useState<number[]>([]);
  const [relativePath, setRelativePath] = useState('api/action.php');
  const [query, setQuery] = useState('');
  const [replaceWith, setReplaceWith] = useState('');
  const [ignoreCase, setIgnoreCase] = useState(true);
  const [useRegex, setUseRegex] = useState(false);
  const [previewResult, setPreviewResult] = useState<BulkReplacePreviewResponse | null>(null);
  const [applyResult, setApplyResult] = useState<BulkReplaceApplyResponse | null>(null);

  const inputClass = 'w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors';

  const toggleServer = (serverId: number) => {
    setSelectedServerIds((current) => current.includes(serverId)
      ? current.filter((item) => item !== serverId)
      : [...current, serverId]);
  };

  const selectActiveServers = () => {
    setSelectedServerIds(servers.filter((server) => server.isActive).map((server) => server.id));
  };

  const selectAllServers = () => {
    setSelectedServerIds(servers.map((server) => server.id));
  };

  const handlePreview = () => {
    if (!query.trim()) {
      toast.error('Введите текст или шаблон для поиска');
      return;
    }

    if (selectedServerIds.length === 0) {
      toast.error('Выберите хотя бы один сервер');
      return;
    }

    previewMutation.mutate(
      {
        serverIds: selectedServerIds,
        query,
        relativePath,
        ignoreCase,
        useRegex,
      },
      {
        onSuccess: (data) => {
          setPreviewResult(data);
          setApplyResult(null);
          toast.success(`Найдено ${data.totals.matches} вхождений в ${data.totals.matchedSites} сайтах`);
        },
        onError: (error) => {
          toast.error(getApiErrorMessage(error, 'Не удалось выполнить предпросмотр'));
        },
      },
    );
  };

  const handleApply = async () => {
    if (!query.trim()) {
      toast.error('Введите текст или шаблон для поиска');
      return;
    }

    if (selectedServerIds.length === 0) {
      toast.error('Выберите хотя бы один сервер');
      return;
    }

    const shouldApply = await confirm({
      title: 'Применить массовую замену?',
      description: 'Изменения будут внесены на выбранных серверах, а резервные копии файлов будут сохранены в .site-factory-backups.',
      confirmText: 'Применить замену',
      tone: 'danger',
    });

    if (!shouldApply) {
      return;
    }

    applyMutation.mutate(
      {
        serverIds: selectedServerIds,
        query,
        replaceWith,
        relativePath,
        ignoreCase,
        useRegex,
      },
      {
        onSuccess: (data) => {
          setApplyResult(data);
          toast.success(`Обновлено ${data.totals.updatedFiles} файлов, замен ${data.totals.replacements}`);
        },
        onError: (error) => {
          toast.error(getApiErrorMessage(error, 'Не удалось применить массовую замену'));
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Массовая замена</h1>
          <p className="mt-1 text-sm text-gray-500">Поиск и замена кода на сайтах выбранных серверов из отдельного инструментального раздела.</p>
        </div>
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs leading-5 text-amber-100 max-w-md">
          Перед перезаписью создаётся резервная копия каждого изменённого файла в папке .site-factory-backups внутри сайта.
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
          <div className="space-y-5">
            <section className="rounded-xl border border-gray-800 bg-gray-900 p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-white">1. Серверы</h2>
                  <p className="mt-1 text-xs text-gray-500">Можно выбрать один сервер, несколько или все активные.</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={selectActiveServers} className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800">
                    Все активные
                  </button>
                  <button type="button" onClick={selectAllServers} className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800">
                    Все
                  </button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {servers.map((server) => {
                  const checked = selectedServerIds.includes(server.id);
                  return (
                    <button
                      key={server.id}
                      type="button"
                      aria-pressed={checked}
                      onClick={() => toggleServer(server.id)}
                      className={`rounded-xl border p-4 text-left transition-colors ${checked ? 'border-indigo-500 bg-indigo-500/10 shadow-[0_0_0_1px_rgba(99,102,241,0.15)]' : 'border-gray-800 bg-gray-950/40 hover:border-gray-700'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-gray-100">{server.name}</div>
                          <div className="mt-1 text-xs text-gray-500">{server.host}:{server.port}</div>
                        </div>
                        <span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${checked ? 'border-indigo-400 bg-indigo-500 text-white' : 'border-gray-600 bg-transparent text-transparent'}`}>
                          <Check className="h-3.5 w-3.5" />
                        </span>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3 text-xs">
                        <span className="text-gray-500">
                          Панель: {PANEL_TYPES.find((item) => item.value === server.panelType)?.label || server.panelType}
                        </span>
                        <span className={`rounded-full px-2 py-1 text-[11px] ${checked ? 'bg-indigo-500/15 text-indigo-200' : 'bg-gray-800 text-gray-500'}`}>
                          {checked ? 'Выбран' : 'Не выбран'}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="rounded-xl border border-gray-800 bg-gray-900 p-5">
              <div className="mb-4">
                <h2 className="text-sm font-semibold text-white">2. Что менять</h2>
                <p className="mt-1 text-xs text-gray-500">Оставьте путь пустым, если нужно искать по всем текстовым файлам сайта.</p>
              </div>

              <div className="space-y-4">
                <div>
                  <FormFieldLabel label="Относительный путь внутри сайта" tooltip="Например: api/action.php. Если оставить пустым, поиск и замена пойдут по всем текстовым файлам сайта." />
                  <input className={`${inputClass} font-mono text-xs`} placeholder="api/action.php" value={relativePath} onChange={(e) => setRelativePath(e.target.value)} />
                </div>

                <div>
                  <FormFieldLabel label="Найти" tooltip="Поддерживается обычный текст или регулярное выражение, если включён режим regex." />
                  <textarea className={`${inputClass} min-h-28 resize-y font-mono text-xs`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="https://old-crm.example.com/api/lead" />
                </div>

                <div>
                  <FormFieldLabel label="Заменить на" tooltip="Можно оставить пустым, если нужно удалить найденный фрагмент." />
                  <textarea className={`${inputClass} min-h-28 resize-y font-mono text-xs`} value={replaceWith} onChange={(e) => setReplaceWith(e.target.value)} placeholder="https://new-crm.example.com/api/lead" />
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <Toggle
                    checked={ignoreCase}
                    onChange={setIgnoreCase}
                    label="Игнорировать регистр"
                    description="Полезно для обычного текстового поиска, чтобы не зависеть от регистра символов."
                  />
                  <Toggle
                    checked={useRegex}
                    onChange={setUseRegex}
                    label="Регулярное выражение"
                    description="Включайте только если действительно нужен шаблонный поиск."
                  />
                </div>
              </div>
            </section>
          </div>

          <div className="space-y-5">
            <section className="rounded-xl border border-gray-800 bg-gray-900 p-5">
              <h2 className="text-sm font-semibold text-white">3. Запуск</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={handlePreview}
                  disabled={previewMutation.isPending || applyMutation.isPending}
                  className="flex items-center justify-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm font-medium text-gray-200 transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {previewMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Replace className="h-4 w-4" />}
                  Предпросмотр
                </button>
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={previewMutation.isPending || applyMutation.isPending}
                  className="flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {applyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Replace className="h-4 w-4" />}
                  Применить замену
                </button>
              </div>
            </section>

            {previewResult && (
              <section className="rounded-xl border border-gray-800 bg-gray-900 p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold text-white">Предпросмотр</h2>
                  <span className="text-xs text-gray-500">Совпадений: {previewResult.totals.matches} • Сайтов: {previewResult.totals.matchedSites}</span>
                </div>
                <div className="space-y-3">
                  {previewResult.servers.map((server) => (
                    <div key={server.serverId} className="rounded-xl border border-gray-800 bg-gray-950/40 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-gray-100">{server.serverName}</div>
                          <div className="mt-1 text-xs text-gray-500">Проверено сайтов: {server.scannedSites} • Совпадений: {server.matches}</div>
                        </div>
                        {server.error && <span className="text-xs text-red-300">{server.error}</span>}
                      </div>
                      {server.sites.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {server.sites.slice(0, 5).map((site) => (
                            <div key={`${server.serverId}-${site.domain}`} className="rounded-lg border border-gray-800 px-3 py-2">
                              <div className="text-xs font-medium text-gray-200">{site.domain}</div>
                              <div className="mt-1 text-xs text-gray-500">Файлов: {site.matchedFiles} • Совпадений: {site.matches}</div>
                              {site.files[0]?.firstMatch && (
                                <div className="mt-2 text-xs text-gray-400">
                                  <span className="font-mono text-gray-500">{site.files[0].filePath}:{site.files[0].firstMatch.line}</span>
                                  <div className="mt-1 break-all font-mono text-[11px] text-gray-500">{site.files[0].firstMatch.preview}</div>
                                </div>
                              )}
                            </div>
                          ))}
                          {server.sites.length > 5 && <div className="text-xs text-gray-500">И ещё сайтов: {server.sites.length - 5}</div>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {applyResult && (
              <section className="rounded-xl border border-gray-800 bg-gray-900 p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold text-white">Результат применения</h2>
                  <span className="text-xs text-gray-500">Файлов: {applyResult.totals.updatedFiles} • Замен: {applyResult.totals.replacements}</span>
                </div>
                <div className="space-y-3">
                  {applyResult.servers.map((server) => (
                    <div key={server.serverId} className="rounded-xl border border-gray-800 bg-gray-950/40 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-gray-100">{server.serverName}</div>
                          <div className="mt-1 text-xs text-gray-500">Обновлено сайтов: {server.updatedSites} • Файлов: {server.updatedFiles} • Замен: {server.replacements}</div>
                        </div>
                        {server.error && <span className="text-xs text-red-300">{server.error}</span>}
                      </div>
                      {server.sites.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {server.sites.slice(0, 6).map((site) => (
                            <div key={`${server.serverId}-${site.domain}`} className="flex items-center justify-between rounded-lg border border-gray-800 px-3 py-2 text-xs">
                              <span className="text-gray-200">{site.domain}</span>
                              <span className="text-gray-500">Файлов: {site.updatedFiles} • Замен: {site.replacements}</span>
                            </div>
                          ))}
                          {server.sites.length > 6 && <div className="text-xs text-gray-500">И ещё сайтов: {server.sites.length - 6}</div>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      )}

      {confirmationDialog}
    </div>
  );
}
