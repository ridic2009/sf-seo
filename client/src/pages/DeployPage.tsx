import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { getTemplatePreviewUrl, useTemplates } from '../api/templates';
import { useServers } from '../api/servers';
import { useCreateSite, useDeploySite, useBatchDeploy } from '../api/sites';
import { Rocket, Plus, Trash2, Loader2, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import { Toggle } from '../components/Toggle';
import { IconButton } from '../components/IconButton';
import type { Template } from '../types';
import { useApiErrorMessage } from '../hooks/useApiErrorMessage';
import { useTemplateLanguagePresentation } from '../hooks/useTemplateLanguages';
import { TemplatePicker } from '../components/deploy/TemplatePicker';
import { DeployProgressItem, DeployProgressPanel } from '../components/deploy/DeployProgressPanel';
import { getLanguagePresentation } from '../utils/languagePresentation';

const siteEntrySchema = z.object({
  domain: z.string(),
  businessName: z.string(),
});

const deployFormSchema = z.object({
  templateId: z.number(),
  serverId: z.number(),
  language: z.string(),
  autoDeploy: z.boolean(),
  entries: z.array(siteEntrySchema),
});

type DeployFormValues = z.infer<typeof deployFormSchema>;

export function DeployPage() {
  const { data: templates = [] } = useTemplates();
  const { data: servers = [] } = useServers();
  const getApiErrorMessage = useApiErrorMessage();
  const createSite = useCreateSite();
  const deploySite = useDeploySite();
  const batchDeploy = useBatchDeploy();
  const [bulkText, setBulkText] = useState('');
  const [mode, setMode] = useState<'manual' | 'bulk'>('manual');
  const [deploying, setDeploying] = useState(false);
  const [progressLog, setProgressLog] = useState<DeployProgressItem[]>([]);

  const form = useForm<DeployFormValues>({
    resolver: zodResolver(deployFormSchema),
    defaultValues: {
      templateId: 0,
      serverId: 0,
      language: 'en',
      autoDeploy: true,
      entries: [{ domain: '', businessName: '' }],
    },
  });
  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: 'entries',
  });
  const templateId = useWatch({ control: form.control, name: 'templateId' }) ?? 0;
  const serverId = useWatch({ control: form.control, name: 'serverId' }) ?? 0;
  const language = useWatch({ control: form.control, name: 'language' }) ?? 'en';
  const autoDeploy = useWatch({ control: form.control, name: 'autoDeploy' }) ?? true;
  const watchedEntries = useWatch({ control: form.control, name: 'entries' }) ?? [];

  const selectedTemplate = templates.find((t) => t.id === templateId);
  const selectedServer = servers.find((server) => server.id === serverId);
  const templateLanguages = useTemplateLanguagePresentation(selectedTemplate?.languages);
  const selectedLanguage = useMemo(() => getLanguagePresentation(language), [language]);

  const parseBulkText = () => {
    const lines = bulkText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const parsed: DeployFormValues['entries'] = [];
    for (const line of lines) {
      const parts = line.split(/[|,\t]/).map((p) => p.trim());
      if (parts.length >= 2) {
        parsed.push({ domain: parts[0], businessName: parts[1] });
      }
    }
    if (parsed.length > 0) {
      replace(parsed);
      setMode('manual');
      toast.success(`Распознано ${parsed.length} записей`);
    } else {
      toast.error('Не удалось распознать. Формат: домен | название бизнеса (по строчке)');
    }
  };

  const handleDeploy = form.handleSubmit(async (values) => {
    const validEntries = values.entries.filter((entry) => entry.domain.trim() && entry.businessName.trim());
    if (!templateId || !serverId || validEntries.length === 0) {
      toast.error('Выберите шаблон, сервер и добавьте хотя бы один сайт');
      return;
    }

    setDeploying(true);
    setProgressLog(validEntries.map((entry) => ({
      domain: entry.domain,
      businessName: entry.businessName,
      status: 'queued',
      message: 'Ожидает запуска',
    })));

    const setItemStatus = (domain: string, status: DeployProgressItem['status'], message: string) => {
      setProgressLog((current) => current.map((item) => (
        item.domain === domain ? { ...item, status, message } : item
      )));
    };

    try {
      if (!autoDeploy) {
        const result = await batchDeploy.mutateAsync({
          templateId: values.templateId,
          serverId: values.serverId,
          language: values.language,
          autoDeploy: false,
          sites: validEntries,
        });

        for (const item of result.results) {
          setItemStatus(item.domain, item.status === 'created' ? 'created' : 'error', item.status === 'created' ? 'Создано, ожидает запуска' : item.error || 'Ошибка создания');
        }

        const successCount = result.results.filter((r: any) => r.status === 'created').length;
        const errorCount = result.results.filter((r: any) => r.status === 'error').length;

        if (successCount > 0) {
          toast.success(`Создано ${successCount} сайтов${errorCount > 0 ? `, ошибок: ${errorCount}` : ''}`);
        }
        if (errorCount > 0 && successCount === 0) {
          toast.error(`Все ${errorCount} записей с ошибками`);
        }
      } else {
        let deployErrorCount = 0;
        for (const entry of validEntries) {
          setItemStatus(entry.domain, 'creating', 'Создание записи сайта');
          const site = await createSite.mutateAsync({
            domain: entry.domain,
            businessName: entry.businessName,
            templateId: values.templateId,
            serverId: values.serverId,
            language: values.language,
            status: 'pending',
          });

          setItemStatus(entry.domain, 'deploying', 'Запускается деплой');
          try {
            await deploySite.mutateAsync(site.id);
            setItemStatus(entry.domain, 'deployed', 'Деплой завершён');
          } catch (error) {
            deployErrorCount += 1;
            setItemStatus(entry.domain, 'error', getApiErrorMessage(error, 'Ошибка деплоя'));
          }
        }

        if (deployErrorCount > 0) {
          toast.error(`Деплой завершён с ошибками: ${deployErrorCount}`);
        } else {
          toast.success(`Задеплоено ${validEntries.length} сайтов`);
        }
      }

      replace([{ domain: '', businessName: '' }]);
      setBulkText('');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Ошибка'));
    } finally {
      setDeploying(false);
    }
  });

  const inputClass =
    'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-indigo-500';
  const selectClass =
    'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-indigo-500';
  const readyCount = useMemo(() => watchedEntries.filter((entry) => entry.domain && entry.businessName).length, [watchedEntries]);
  const panelClass = 'rounded-2xl border border-gray-800 bg-gray-900/80 p-5 backdrop-blur-sm';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Деплой</h1>
        <p className="mt-1 text-sm text-gray-500">Создание сайтов на основе выбранного шаблона и сервера.</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <div className={`${panelClass} relative z-10 space-y-4`}>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Настройки</h2>
                <p className="mt-1 text-sm text-gray-500">Шаблон, сервер и язык запуска.</p>
              </div>
              <span className="text-xs text-gray-500">{readyCount} готово</span>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm text-gray-400">Шаблон</label>
                <TemplatePicker
                  templates={templates}
                  selectedTemplate={selectedTemplate}
                  value={templateId}
                  onChange={(nextTemplateId) => form.setValue('templateId', nextTemplateId, { shouldDirty: true })}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-400">Сервер</label>
                <select
                  className={selectClass}
                  value={serverId}
                  onChange={(event) => form.setValue('serverId', parseInt(event.target.value), { shouldDirty: true })}
                >
                  <option value={0}>Выберите сервер...</option>
                  {servers
                    .filter((s) => s.isActive)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.host})
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-400">Язык</label>
                <select
                  className={selectClass}
                  value={language}
                  onChange={(event) => form.setValue('language', event.target.value, { shouldDirty: true })}
                >
                  {templateLanguages.length > 0
                    ? templateLanguages.map((item) => (
                        <option key={item.normalizedCode} value={item.normalizedCode}>{item.optionLabel}</option>
                      ))
                    : <option value="en">🇬🇧 Английский (EN)</option>
                  }
                </select>
              </div>
            </div>

            <Toggle
              checked={autoDeploy}
              onChange={(checked) => form.setValue('autoDeploy', checked, { shouldDirty: true })}
              label="Сразу запускать деплой после создания записей"
              description="Если выключено, записи только создаются в базе и остаются в ожидании."
            />
          </div>

          <div className={`${panelClass} space-y-4`}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-white">Сайты</h2>
                <p className="mt-1 text-sm text-gray-500">Ручной ввод или массовая вставка.</p>
              </div>
              <button
                onClick={() => setMode(mode === 'manual' ? 'bulk' : 'manual')}
                className={`rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
                  mode === 'bulk'
                    ? 'border border-indigo-500/20 bg-indigo-500/10 text-indigo-300'
                    : 'bg-gray-800 text-gray-400 hover:text-gray-300'
                }`}
              >
                {mode === 'bulk' ? 'Ручной ввод' : 'Массовая вставка'}
              </button>
            </div>

            {mode === 'bulk' ? (
              <div className="space-y-3">
                <textarea
                  className={`${inputClass} h-56 resize-y font-mono text-xs leading-6`}
                  placeholder={`Вставьте список (по строчке):\nxentora-core.pro | Xentora Core\nfinova-hub.com | Finova Hub\ntradex-prime.net | Tradex Prime`}
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                />
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-gray-500">Поддерживается формат: домен | название бизнеса</p>
                  <button
                    onClick={parseBulkText}
                    className="flex items-center gap-2 rounded-lg bg-gray-800 px-4 py-2 text-sm text-gray-300 transition-colors hover:bg-gray-700"
                  >
                    <Zap className="w-4 h-4" />
                    Распознать
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {fields.map((field, index) => (
                  <div key={field.id} className="grid gap-3 rounded-xl border border-gray-800 bg-gray-950/40 p-3 md:grid-cols-[36px_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center">
                    <div className="text-right text-sm text-gray-600">{index + 1}</div>
                    <input
                      className={inputClass}
                      placeholder="xentora-core.pro"
                      {...form.register(`entries.${index}.domain`)}
                    />
                    <input
                      className={inputClass}
                      placeholder="Xentora Core"
                      {...form.register(`entries.${index}.businessName`)}
                    />
                    <div className="flex justify-end">
                      {fields.length > 1 && (
                        <IconButton
                          onClick={() => remove(index)}
                          label={`Удалить строку ${index + 1}`}
                          tone="danger"
                        >
                          <Trash2 className="w-4 h-4" />
                        </IconButton>
                      )}
                    </div>
                  </div>
                ))}
                <button
                  onClick={() => append({ domain: '', businessName: '' })}
                  className="flex items-center gap-2 rounded-lg border border-dashed border-gray-700 px-4 py-3 text-sm text-gray-400 transition-colors hover:border-gray-600 hover:bg-gray-800/70 hover:text-gray-200"
                >
                  <Plus className="w-4 h-4" />
                  Добавить ещё строку
                </button>
              </div>
            )}
          </div>
        </div>

        <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          <div className={panelClass}>
            {selectedTemplate ? (
              <div className="space-y-4">
                <img
                  src={getTemplatePreviewUrl(selectedTemplate.id)}
                  alt={selectedTemplate.name}
                  className="h-40 w-full rounded-xl border border-gray-800 object-cover object-top"
                />
                <div>
                  <div className="text-base font-medium text-gray-100">{selectedTemplate.name}</div>
                  <div className="mt-1 text-sm text-gray-500">{selectedTemplate.originalBusinessName}</div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-gray-800 bg-gray-950/50 p-4 text-sm text-gray-500">
                Выберите шаблон, и здесь появится его превью.
              </div>
            )}
          </div>

          <div className={panelClass}>
            <div className="space-y-4">
              <div className="rounded-xl border border-gray-800 bg-gray-950/50 p-4">
                <div className="flex items-center justify-between text-sm text-gray-300">
                  <span>Сервер</span>
                  <span className="text-gray-500">{selectedServer ? selectedServer.name : 'Не выбран'}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm text-gray-300">
                  <span>Язык</span>
                  <span className="text-gray-400">{selectedLanguage.badgeLabel}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm text-gray-300">
                  <span>Готово строк</span>
                  <span className="text-gray-100">{readyCount}</span>
                </div>
              </div>

              <button
                onClick={handleDeploy}
                disabled={deploying || !templateId || !serverId}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deploying ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Rocket className="w-4 h-4" />
                )}
                {autoDeploy ? 'Создать и задеплоить' : 'Создать и сохранить'}
              </button>
            </div>
          </div>

          <DeployProgressPanel items={progressLog} panelClass={panelClass} />
        </aside>
      </div>
    </div>
  );
}
