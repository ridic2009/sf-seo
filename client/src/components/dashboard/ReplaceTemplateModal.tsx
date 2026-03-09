import { Loader2, RefreshCcw, X } from 'lucide-react';
import { getTemplatePreviewUrl } from '../../api/templates';
import type { Site, Template } from '../../types';
import { IconButton } from '../IconButton';
import { ModalOverlay } from '../ModalOverlay';

interface ReplaceTemplateModalProps {
  site: Site;
  templates: Template[];
  selectedTemplateId: number;
  onTemplateChange: (templateId: number) => void;
  onClose: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
}

export function ReplaceTemplateModal({
  site,
  templates,
  selectedTemplateId,
  onTemplateChange,
  onClose,
  onSubmit,
  isSubmitting,
}: ReplaceTemplateModalProps) {
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) || null;

  return (
    <ModalOverlay onClose={onClose} ariaLabel="Замена шаблона сайта" className="z-[145] p-4">
      <div className="absolute inset-0 bg-black/88 backdrop-blur-[3px]" />
      <div className="relative flex h-full w-full items-center justify-center p-4">
        <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl">
          <div className="flex items-start justify-between gap-6 border-b border-slate-800 px-6 py-5">
            <div>
              <h2 className="text-xl font-semibold text-white">Заменить шаблон</h2>
              <p className="mt-1 text-sm text-slate-500">Сайт {site.domain} будет заново залит на текущий сервер с новым шаблоном.</p>
            </div>
            <IconButton
              onClick={onClose}
              label="Закрыть окно замены шаблона"
              className="border border-slate-800 text-slate-500 hover:border-slate-700 hover:bg-slate-900 hover:text-slate-300"
            >
              <X className="h-4 w-4" />
            </IconButton>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
              <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300">Новый шаблон</label>
                  <select
                    className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-100 outline-none transition-colors focus:border-indigo-500"
                    value={selectedTemplateId}
                    onChange={(event) => onTemplateChange(parseInt(event.target.value))}
                  >
                    <option value={0}>Выберите шаблон...</option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                  Текущие файлы сайта будут очищены и заменены содержимым нового шаблона. Домен, сервер и название бизнеса сохранятся.
                </div>
              </section>

              <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                  <div>
                    <div className="mb-2 text-xs uppercase tracking-[0.22em] text-slate-500">Текущий шаблон</div>
                    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
                      {site.templateId ? (
                        <img
                          src={getTemplatePreviewUrl(site.templateId)}
                          alt={site.templateName || 'Current template'}
                          className="h-40 w-full object-cover object-top"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-40 items-center justify-center text-xs uppercase tracking-[0.22em] text-slate-500">
                          Нет шаблона
                        </div>
                      )}
                    </div>
                    <div className="mt-2 text-sm text-slate-300">{site.templateName || 'Не задан'}</div>
                  </div>

                  <div>
                    <div className="mb-2 text-xs uppercase tracking-[0.22em] text-slate-500">Новый шаблон</div>
                    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
                      {selectedTemplate ? (
                        <img
                          src={getTemplatePreviewUrl(selectedTemplate.id)}
                          alt={selectedTemplate.name}
                          className="h-40 w-full object-cover object-top"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-40 items-center justify-center text-xs uppercase tracking-[0.22em] text-slate-500">
                          Выберите шаблон
                        </div>
                      )}
                    </div>
                    <div className="mt-2 text-sm text-slate-300">{selectedTemplate?.name || '—'}</div>
                  </div>
                </div>
              </section>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-slate-800 bg-slate-950 px-6 py-4">
            <p className="text-sm text-slate-500">Сайт: {site.domain}{selectedTemplate ? `, новый шаблон: ${selectedTemplate.name}` : ''}</p>
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
                disabled={isSubmitting || !selectedTemplateId}
                className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                Заменить шаблон
              </button>
            </div>
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}