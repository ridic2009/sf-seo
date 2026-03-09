import { lazy, Suspense, useMemo, useState } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from '@tanstack/react-table';
import {
  getSiteEditorFileContent,
  getSiteEditorFiles,
  getSitePreviewUrl,
  replaceSiteEditorFiles,
  saveSiteEditorFileContent,
  searchSiteEditorFiles,
  useBatchTransferSites,
  useDeleteSite,
  useDeploySite,
  useReplaceSiteTemplate,
  useSites,
} from '../api/sites';
import { useServers } from '../api/servers';
import { useTemplates } from '../api/templates';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Code2,
  ExternalLink,
  FileText,
  Loader2,
  RefreshCcw,
  Rocket,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { Server, Site, Template } from '../types';
import { getServerPanelUrl } from '../utils/serverPanel';
import { formatRuDate } from '../utils/format';
import { useDashboardFilters } from '../hooks/useDashboardFilters';
import { useDashboardTransferSelection } from '../hooks/useDashboardTransferSelection';
import { IconButton } from '../components/IconButton';
import { useConfirmationDialog } from '../components/ConfirmationDialog';
import { TableSelectionCheckbox } from '../components/dashboard/TableSelectionCheckbox';
import { TemplatePreview } from '../components/dashboard/TemplatePreview';
import { TransferSitesModal } from '../components/dashboard/TransferSitesModal';
import { ReplaceTemplateModal } from '../components/dashboard/ReplaceTemplateModal';
import { DeployLogModal } from '../components/dashboard/DeployLogModal';
import { SitePreviewModal } from '../components/dashboard/SitePreviewModal';
import { DashboardStats } from '../components/dashboard/DashboardStats';
import { DashboardFiltersPanel } from '../components/dashboard/DashboardFiltersPanel';
import { DashboardSitesTable } from '../components/dashboard/DashboardSitesTable';

const LazyCodeEditorModal = lazy(async () => {
  const module = await import('../components/CodeEditorModal');
  return { default: module.CodeEditorModal };
});

const columnHelper = createColumnHelper<Site>();

const statusConfig: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
  deployed: { icon: CheckCircle2, color: 'text-green-400', label: 'Развёрнут' },
  pending: { icon: Clock, color: 'text-yellow-400', label: 'Ожидает' },
  deploying: { icon: Loader2, color: 'text-blue-400', label: 'Деплоится' },
  error: { icon: AlertCircle, color: 'text-red-400', label: 'Ошибка' },
};

export function DashboardPage() {
  const { data: sites = [], isLoading, isError, error } = useSites();
  const { data: servers = [] } = useServers();
  const { data: templates = [] } = useTemplates();
  const deploySite = useDeploySite();
  const replaceSiteTemplate = useReplaceSiteTemplate();
  const deleteSite = useDeleteSite();
  const batchTransferSites = useBatchTransferSites();
  const { confirm, confirmationDialog } = useConfirmationDialog();

  const [sorting, setSorting] = useState<SortingState>([]);
  const [selectedLogSiteId, setSelectedLogSiteId] = useState<number | null>(null);
  const [selectedPreview, setSelectedPreview] = useState<{ site: Site; url: string } | null>(null);
  const [editingSiteCode, setEditingSiteCode] = useState<Site | null>(null);
  const [templateReplacementSite, setTemplateReplacementSite] = useState<Site | null>(null);
  const [replacementTemplateId, setReplacementTemplateId] = useState(0);
  const [deployingAll, setDeployingAll] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const activeLogSite = selectedLogSiteId == null ? null : sites.find((site) => site.id === selectedLogSiteId) || null;

  const {
    globalFilter,
    setGlobalFilter,
    templateFilter,
    setTemplateFilter,
    serverFilter,
    setServerFilter,
    statusFilter,
    setStatusFilter,
    templateOptions,
    serverOptions,
    filteredSites,
    hasActiveFilters,
    stats,
    resetFilters,
  } = useDashboardFilters(sites, servers);

  const pendingDeployableSites = useMemo(
    () => sites.filter((site) => site.status !== 'deployed' && site.templateId && site.serverId),
    [sites],
  );

  const transferableSites = useMemo(
    () => sites
      .filter((site) => site.templateId && site.serverId)
      .sort((left, right) => left.domain.localeCompare(right.domain, 'ru')),
    [sites],
  );

  const {
    selectedTransferSiteIds,
    transferServerId,
    setTransferServerId,
    eligibleTransferSiteIds,
    visibleTransferCandidateIds,
    selectableTransferSiteIds,
    allVisibleTransferSelected,
    hasSomeVisibleTransferSelected,
    toggleTransferSite,
    toggleAllVisibleTransferSites,
    handleTransferServerChange,
    clearTransferSelection,
    resetTransferFlow,
  } = useDashboardTransferSelection(filteredSites, transferableSites);

  const handleOpenTemplateReplacement = (site: Site) => {
    const availableTemplates = templates.filter((template) => template.id !== site.templateId);

    if (availableTemplates.length === 0) {
      toast.error('Нет альтернативных шаблонов для замены');
      return;
    }

    setTemplateReplacementSite(site);
    setReplacementTemplateId(availableTemplates[0]?.id ?? 0);
  };

  const handleReplaceTemplate = () => {
    if (!templateReplacementSite || !replacementTemplateId) {
      toast.error('Выберите новый шаблон');
      return;
    }

    replaceSiteTemplate.mutate(
      { siteId: templateReplacementSite.id, templateId: replacementTemplateId },
      {
        onSuccess: (result) => {
          toast.success(`Шаблон сайта ${result.domain} заменён`);
          setSelectedLogSiteId(templateReplacementSite.id);
          setTemplateReplacementSite(null);
          setReplacementTemplateId(0);
        },
        onError: (requestError: any) => {
          toast.error(requestError.response?.data?.error || 'Ошибка замены шаблона');
        },
      },
    );
  };

  const handleDeployAll = async () => {
    if (pendingDeployableSites.length === 0) {
      toast.error('Нет сайтов, готовых к деплою');
      return;
    }

    setDeployingAll(true);
    let errorCount = 0;

    for (const site of pendingDeployableSites) {
      try {
        await deploySite.mutateAsync(site.id);
      } catch {
        errorCount += 1;
      }
    }

    setDeployingAll(false);

    if (errorCount > 0) {
      toast.error(`Массовый деплой завершён с ошибками: ${errorCount}`);
    } else {
      toast.success(`Запущен деплой для ${pendingDeployableSites.length} сайтов`);
    }
  };

  const handleOpenTransferModal = () => {
    if (selectedTransferSiteIds.length === 0) {
      toast.error('Сначала отметьте сайты в таблице');
      return;
    }

    setTransferServerId(0);
    setShowTransferModal(true);
  };

  const handleBatchTransfer = () => {
    if (!transferServerId || selectedTransferSiteIds.length === 0) {
      toast.error('Выберите новый сервер и хотя бы один сайт');
      return;
    }

    const launchedSiteIds = [...selectedTransferSiteIds];
    const launchedServerId = transferServerId;

    setShowTransferModal(false);
    resetTransferFlow();
    setSelectedLogSiteId(launchedSiteIds[0] ?? null);
    toast.success(`Перенос запущен для ${launchedSiteIds.length} сайт(ов)`);

    batchTransferSites.mutate(
      {
        targetServerId: launchedServerId,
        siteIds: launchedSiteIds,
        concurrency: 3,
      },
      {
        onSuccess: (result) => {
          const transferredCount = result.results.filter((item) => item.status === 'transferred').length;
          const skippedCount = result.results.filter((item) => item.status === 'skipped').length;
          const errorCount = result.results.filter((item) => item.status === 'error').length;

          if (transferredCount > 0) {
            toast.success(`Перенесено ${transferredCount} сайт(ов)${errorCount > 0 ? `, ошибок: ${errorCount}` : ''}${skippedCount > 0 ? `, пропущено: ${skippedCount}` : ''}`);
          } else if (skippedCount > 0 && errorCount === 0) {
            toast.error('Все выбранные сайты уже привязаны к этому серверу');
          } else {
            toast.error(`Перенос завершён с ошибками: ${errorCount}`);
          }
        },
        onError: (requestError: any) => {
          toast.error(requestError.response?.data?.error || 'Ошибка переноса');
        },
      },
    );
  };

  const columns = useMemo(
    () => [
      columnHelper.accessor('domain', {
        header: 'Домен',
        cell: (info) => (
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-100">{info.getValue()}</span>
            <a
              href={`https://${info.getValue()}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Открыть сайт ${info.getValue()} в новой вкладке`}
              className="text-gray-500 hover:text-indigo-400"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        ),
      }),
      columnHelper.accessor('businessName', {
        header: 'Название бизнеса',
        cell: (info) => <span className="text-gray-300">{info.getValue()}</span>,
      }),
      columnHelper.accessor('templateName', {
        header: 'Шаблон',
        cell: (info) => {
          const site = info.row.original;
          return (
            <div className="flex items-center gap-3">
              <TemplatePreview site={site} onOpen={(previewSite, url) => setSelectedPreview({ site: previewSite, url })} />
              <div>
                <div className="text-sm text-gray-200">{info.getValue() || '—'}</div>
                <div className="mt-0.5 text-xs text-gray-500">ID шаблона: {site.templateId || '—'}</div>
              </div>
            </div>
          );
        },
      }),
      columnHelper.accessor('serverName', {
        header: 'Сервер',
        cell: (info) => {
          const row = info.row.original;
          const panelUrl = getServerPanelUrl({ host: row.serverHost, panelPort: 8083 });
          return (
            <div className="text-sm">
              <div className="flex items-center gap-2 text-gray-300">
                <span>{info.getValue() || '—'}</span>
                {panelUrl && (
                  <a
                    href={panelUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Открыть панель сервера ${info.getValue() || row.serverHost || 'сайта'}`}
                    className="text-gray-500 hover:text-indigo-400"
                    title="Открыть панель сервера"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
              {row.serverHost && (
                <div className="text-xs text-gray-500">{row.serverHost}</div>
              )}
            </div>
          );
        },
      }),
      columnHelper.accessor('status', {
        header: 'Статус',
        cell: (info) => {
          const row = info.row.original;
          const status = info.getValue();
          const cfg = statusConfig[status] || statusConfig.pending;
          const Icon = cfg.icon;
          const responseCode = row.previewStatus;
          const responseTone = responseCode == null
            ? 'border-gray-700 bg-gray-950/60 text-gray-500'
            : responseCode >= 200 && responseCode < 400
              ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-300'
              : responseCode >= 400 && responseCode < 500
                ? 'border-amber-400/20 bg-amber-500/10 text-amber-300'
                : 'border-red-400/20 bg-red-500/10 text-red-300';

          return (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <Icon className={`h-4 w-4 ${cfg.color} ${status === 'deploying' ? 'animate-spin' : ''}`} />
                <span className={`text-sm ${cfg.color}`}>{cfg.label}</span>
              </div>
              {row.status === 'deployed' && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">HTTP</span>
                  <span className={`rounded-md border px-2 py-0.5 text-xs font-medium ${responseTone}`}>
                    {responseCode ?? '—'}
                  </span>
                </div>
              )}
              {row.deployStep && (
                <div className="text-xs text-gray-500">{row.deployStep}</div>
              )}
              {row.previewError && row.status === 'deployed' && (
                <div className="max-w-[260px] break-words text-xs text-amber-400">{row.previewError}</div>
              )}
              {row.errorMessage && (
                <div className="max-w-[260px] break-words text-xs text-red-400">{row.errorMessage}</div>
              )}
            </div>
          );
        },
      }),
      columnHelper.accessor('createdAt', {
        header: 'Создан',
        cell: (info) => (
          <span className="text-sm text-gray-500">
            {formatRuDate(info.getValue())}
          </span>
        ),
      }),
      columnHelper.display({
        id: 'actions',
        header: '',
        cell: (info) => {
          const site = info.row.original;
          return (
            <div className="flex items-center gap-1">
              {site.status !== 'deployed' && site.templateId && site.serverId && (
                <IconButton
                  onClick={() => {
                    deploySite.mutate(site.id, {
                      onSuccess: () => toast.success(`Деплой ${site.domain} запущен`),
                      onError: (error: any) => toast.error(error.response?.data?.error || 'Ошибка'),
                    });
                  }}
                  label={`Запустить деплой для ${site.domain}`}
                  tone="primary"
                >
                  <Rocket className="h-4 w-4" />
                </IconButton>
              )}
              {site.status === 'deployed' && site.serverId && site.templateId && (
                <IconButton
                  onClick={() => handleOpenTemplateReplacement(site)}
                  label={`Заменить шаблон для ${site.domain}`}
                  tone="warning"
                >
                  <RefreshCcw className="h-4 w-4" />
                </IconButton>
              )}
              {site.deployLog && (
                <IconButton
                  onClick={() => setSelectedLogSiteId(site.id)}
                  label={`Открыть лог деплоя для ${site.domain}`}
                  tone="primary"
                >
                  <FileText className="h-4 w-4" />
                </IconButton>
              )}
              {site.serverId && (
                <IconButton
                  onClick={() => setEditingSiteCode(site)}
                  label={`Открыть редактор сайта ${site.domain}`}
                  tone="primary"
                >
                  <Code2 className="h-4 w-4" />
                </IconButton>
              )}
              <IconButton
                onClick={async () => {
                  const shouldDelete = await confirm({
                    title: 'Удалить сайт?',
                    description: `Сайт ${site.domain} будет удалён из приложения.`,
                    confirmText: 'Удалить сайт',
                    tone: 'danger',
                  });

                  if (!shouldDelete) {
                    return;
                  }

                  deleteSite.mutate(site.id, {
                    onSuccess: () => toast.success('Сайт удалён'),
                  });
                }}
                label={`Удалить сайт ${site.domain}`}
                tone="danger"
              >
                <Trash2 className="h-4 w-4" />
              </IconButton>
            </div>
          );
        },
      }),
    ],
    [deleteSite, deploySite, templates],
  );

  const selectionColumn = useMemo(
    () => columnHelper.display({
      id: 'transferSelect',
      header: () => (
        <div className="flex h-5 w-5 items-center justify-center">
          <TableSelectionCheckbox
            checked={allVisibleTransferSelected}
            indeterminate={!allVisibleTransferSelected && hasSomeVisibleTransferSelected}
            disabled={visibleTransferCandidateIds.length === 0}
            onToggle={toggleAllVisibleTransferSites}
            title={allVisibleTransferSelected ? 'Снять выбор с видимых строк' : 'Выбрать все видимые строки'}
          />
        </div>
      ),
      cell: (info) => {
        const site = info.row.original;
        const isEligible = eligibleTransferSiteIds.has(site.id);
        const checked = selectedTransferSiteIds.includes(site.id);

        return (
          <div className="flex h-5 w-5 items-center justify-center">
            <TableSelectionCheckbox
              checked={checked}
              disabled={!isEligible}
              onToggle={() => toggleTransferSite(site.id)}
              title={isEligible ? 'Выбрать сайт для аварийного переноса' : 'Сайт нельзя перенести без шаблона и сервера'}
            />
          </div>
        );
      },
    }),
    [allVisibleTransferSelected, eligibleTransferSiteIds, hasSomeVisibleTransferSelected, selectedTransferSiteIds, visibleTransferCandidateIds.length],
  );

  const table = useReactTable({
    data: filteredSites,
    columns: [selectionColumn, ...columns],
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Сайты</h1>
        <p className="mt-1 text-sm text-gray-500">Все сайты и статусы их развёртывания</p>
      </div>

      <div className="flex flex-wrap justify-end gap-3">
        <button
          onClick={handleOpenTransferModal}
          disabled={transferableSites.length === 0 || selectedTransferSiteIds.length === 0}
          className="flex items-center gap-2 rounded-lg border border-gray-700 px-4 py-2 text-sm font-medium text-gray-200 transition-colors hover:border-gray-600 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCcw className="h-4 w-4" />
          Аварийный перенос
        </button>
        <button
          onClick={handleDeployAll}
          disabled={deployingAll || pendingDeployableSites.length === 0}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {deployingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
          Задеплоить все ожидающие
        </button>
      </div>

      <DashboardStats stats={stats} />

      <DashboardFiltersPanel
        globalFilter={globalFilter}
        templateFilter={templateFilter}
        serverFilter={serverFilter}
        statusFilter={statusFilter}
        templateOptions={templateOptions}
        serverOptions={serverOptions}
        hasActiveFilters={hasActiveFilters}
        selectedTransferCount={selectedTransferSiteIds.length}
        filteredCount={table.getFilteredRowModel().rows.length}
        totalCount={sites.length}
        onGlobalFilterChange={setGlobalFilter}
        onTemplateFilterChange={setTemplateFilter}
        onServerFilterChange={setServerFilter}
        onStatusFilterChange={setStatusFilter}
        onResetFilters={resetFilters}
        onClearTransferSelection={clearTransferSelection}
      />

      <DashboardSitesTable
        table={table}
        isLoading={isLoading}
        isError={isError}
        error={error}
        sitesCount={sites.length}
        selectedTransferSiteIds={selectedTransferSiteIds}
      />

      {activeLogSite && <DeployLogModal site={activeLogSite} onClose={() => setSelectedLogSiteId(null)} />}

      {showTransferModal && (
        <TransferSitesModal
          servers={servers}
          selectedSiteIds={selectedTransferSiteIds}
          targetServerId={transferServerId}
          onTargetServerChange={handleTransferServerChange}
          onClose={() => setShowTransferModal(false)}
          onSubmit={handleBatchTransfer}
          isSubmitting={batchTransferSites.isPending}
        />
      )}

      {templateReplacementSite && (
        <ReplaceTemplateModal
          site={templateReplacementSite}
          templates={templates.filter((template) => template.id !== templateReplacementSite.templateId)}
          selectedTemplateId={replacementTemplateId}
          onTemplateChange={setReplacementTemplateId}
          onClose={() => {
            setTemplateReplacementSite(null);
            setReplacementTemplateId(0);
          }}
          onSubmit={handleReplaceTemplate}
          isSubmitting={replaceSiteTemplate.isPending}
        />
      )}

      {editingSiteCode && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 p-4">
              <div className="rounded-xl border border-gray-800 bg-gray-950 px-6 py-5 text-sm text-gray-300">
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Загружаю редактор...
                </span>
              </div>
            </div>
          }
        >
          <LazyCodeEditorModal
            title="Редактор сайта"
            subtitle={editingSiteCode.domain}
            filesLoader={() => getSiteEditorFiles(editingSiteCode.id)}
            fileLoader={(filePath) => getSiteEditorFileContent(editingSiteCode.id, filePath)}
            fileSaver={(filePath, content) => saveSiteEditorFileContent(editingSiteCode.id, filePath, content)}
            globalSearcher={(query, options) => searchSiteEditorFiles(editingSiteCode.id, query, options)}
            globalReplacer={(query, replaceWith, options) => replaceSiteEditorFiles(editingSiteCode.id, query, replaceWith, options)}
            saveHint="Правки сохраняются сразу на удалённый сайт. Перед записью сервер делает backup изменяемого файла в .site-factory-backups."
            onClose={() => setEditingSiteCode(null)}
          />
        </Suspense>
      )}

      {selectedPreview && <SitePreviewModal preview={selectedPreview} onClose={() => setSelectedPreview(null)} />}

      {confirmationDialog}
    </div>
  );
}
