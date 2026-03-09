import { useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { getTemplatePreviewUrl } from '../../api/templates';
import { IconButton } from '../IconButton';
import { ModalOverlay } from '../ModalOverlay';
import type { Template } from '../../types';

interface TemplatePickerProps {
  templates: Template[];
  selectedTemplate?: Template;
  value: number;
  onChange: (templateId: number) => void;
}

export function TemplatePicker({ templates, selectedTemplate, value, onChange }: TemplatePickerProps) {
  const [open, setOpen] = useState(false);
  const [imageErrors, setImageErrors] = useState<Record<number, boolean>>({});

  const renderPreview = (template: Template, size: 'compact' | 'card') => {
    const failed = imageErrors[template.id];
    const previewUrl = getTemplatePreviewUrl(template.id);
    const imageClass = size === 'compact' ? 'h-14 w-20' : 'h-40 w-full';

    if (failed) {
      return (
        <div className={`${imageClass} flex shrink-0 items-center justify-center rounded-xl border border-dashed border-gray-700 bg-gray-950/70 text-[10px] uppercase tracking-[0.18em] text-gray-500`}>
          Нет превью
        </div>
      );
    }

    return (
      <img
        src={previewUrl}
        alt={template.name}
        className={`${imageClass} shrink-0 rounded-xl border border-gray-700 object-cover object-top`}
        loading="lazy"
        onError={() => setImageErrors((current) => ({ ...current, [template.id]: true }))}
      />
    );
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`flex w-full items-center justify-between rounded-xl border px-3 py-3 text-left transition-colors ${open ? 'border-indigo-500 bg-gray-800' : 'border-gray-700 bg-gray-800 hover:border-gray-600'}`}
      >
        {selectedTemplate ? (
          <div className="flex min-w-0 items-center gap-3">
            {renderPreview(selectedTemplate, 'compact')}
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-gray-100">{selectedTemplate.name}</div>
              <div className="mt-1 truncate text-xs text-gray-500">{selectedTemplate.originalBusinessName}</div>
            </div>
          </div>
        ) : (
          <div>
            <div className="text-sm text-gray-200">Выберите шаблон...</div>
            <div className="mt-1 text-xs text-gray-500">С превью и быстрым визуальным выбором</div>
          </div>
        )}
        <ChevronDown className={`ml-3 h-4 w-4 shrink-0 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <ModalOverlay onClose={() => setOpen(false)} ariaLabel="Библиотека шаблонов" className="z-[130] bg-black/85 p-4 backdrop-blur-sm">
          <div className="flex h-full w-full items-center justify-center">
            <div className="flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border border-gray-800 bg-[#09111f] shadow-2xl">
              <div className="flex items-start justify-between gap-6 border-b border-gray-800 px-6 py-5">
                <div>
                  <h3 className="text-xl font-semibold text-white">Библиотека шаблонов</h3>
                  <p className="mt-1 text-sm text-gray-500">Выберите шаблон по карточке и превью, без тесной выпадашки.</p>
                </div>
                <IconButton
                  type="button"
                  onClick={() => setOpen(false)}
                  label="Закрыть библиотеку шаблонов"
                  className="border border-gray-800"
                >
                  <X className="h-4 w-4" />
                </IconButton>
              </div>

              <div className="border-b border-gray-800 px-6 py-4">
                <button
                  type="button"
                  onClick={() => {
                    onChange(0);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-2xl border px-4 py-4 text-left transition-colors ${value === 0 ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-100' : 'border-gray-800 bg-gray-950/60 text-gray-300 hover:border-gray-700 hover:bg-gray-900'}`}
                >
                  <div>
                    <div className="text-sm font-medium">Сбросить выбор</div>
                  </div>
                  {value === 0 && <Check className="h-4 w-4 text-indigo-300" />}
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {templates.map((template) => {
                    const isSelected = template.id === value;
                    return (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() => {
                          onChange(template.id);
                          setOpen(false);
                        }}
                        className={`overflow-hidden rounded-[24px] border text-left transition-colors ${isSelected ? 'border-indigo-500/50 bg-indigo-500/10 shadow-[0_0_0_1px_rgba(99,102,241,0.12)]' : 'border-gray-800 bg-gray-950/55 hover:border-gray-700 hover:bg-gray-900'}`}
                      >
                        <div className="relative p-3">
                          {renderPreview(template, 'card')}
                          {isSelected && (
                            <span className="absolute right-6 top-6 inline-flex h-8 w-8 items-center justify-center rounded-full border border-indigo-300/60 bg-indigo-500 text-white shadow-lg">
                              <Check className="h-4 w-4" />
                            </span>
                          )}
                        </div>
                        <div className="space-y-2 px-4 pb-4 pt-1">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-gray-100">{template.name}</div>
                              <div className="mt-1 text-xs text-gray-500">{template.originalBusinessName}</div>
                            </div>
                            <span className={`rounded-full px-2.5 py-1 text-[11px] ${isSelected ? 'bg-indigo-500/15 text-indigo-200' : 'bg-gray-800 text-gray-500'}`}>
                              {isSelected ? 'Выбран' : 'Открыть'}
                            </span>
                          </div>
                          {template.description && (
                            <div className="line-clamp-3 text-xs leading-5 text-gray-400">{template.description}</div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </ModalOverlay>
      )}
    </>
  );
}