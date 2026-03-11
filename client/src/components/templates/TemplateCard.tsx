import { Code2, Download, FileBox, Globe, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { getTemplateExportUrl, getTemplatePreviewUrl, useDeleteTemplate } from '../../api/templates';
import { useTemplateLanguagePresentation } from '../../hooks/useTemplateLanguages';
import type { Template } from '../../types';
import { formatRuDate } from '../../utils/format';
import { useConfirmationDialog } from '../ConfirmationDialog';
import { IconButton } from '../IconButton';

interface TemplateCardProps {
  template: Template;
  onDelete: ReturnType<typeof useDeleteTemplate>;
  onEdit: (template: Template) => void;
  onCodeEdit: (template: Template) => void;
  onOpenPreview: (template: Template) => void;
}

export function TemplateCard({ template, onDelete, onEdit, onCodeEdit, onOpenPreview }: TemplateCardProps) {
  const { confirm, confirmationDialog } = useConfirmationDialog();
  const [previewError, setPreviewError] = useState(false);
  const previewUrl = getTemplatePreviewUrl(template.id);
  const languages = useTemplateLanguagePresentation(template.languages);
  const usesPlaceholders = template.originalBusinessName === '{{NAME}}' && template.originalDomain === '{{DOMAIN}}';

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors">
      <div className="mb-4 overflow-hidden rounded-xl border border-gray-800 bg-gray-950/60">
        {previewError ? (
          <div className="flex h-40 items-center justify-center text-xs uppercase tracking-[0.24em] text-gray-500">
            Нет превью
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onOpenPreview(template)}
            className="group block w-full"
            title="Открыть полное превью"
          >
            <img
              src={previewUrl}
              alt={template.name}
              className="h-40 w-full object-cover object-top transition-transform group-hover:scale-[1.01]"
              loading="lazy"
              onError={() => setPreviewError(true)}
            />
          </button>
        )}
      </div>

      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-500/10 rounded-lg flex items-center justify-center">
            <FileBox className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-100">{template.name}</h3>
            {template.description && (
              <p className="text-gray-500 text-xs mt-0.5">{template.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <IconButton onClick={() => onCodeEdit(template)} label="Открыть редактор кода шаблона" tone="primary">
            <Code2 className="w-4 h-4" />
          </IconButton>
          <IconButton onClick={() => onEdit(template)} label="Редактировать шаблон" tone="primary">
            <Pencil className="w-4 h-4" />
          </IconButton>
          <a
            href={getTemplateExportUrl(template.id)}
            aria-label="Скачать пакет шаблона"
            title="Скачать пакет шаблона"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-800 hover:text-indigo-300"
          >
            <Download className="w-4 h-4" />
          </a>
          <IconButton
            onClick={async () => {
              const shouldDelete = await confirm({
                title: 'Удалить шаблон?',
                description: `Шаблон "${template.name}" будет удалён без возможности восстановления.`,
                confirmText: 'Удалить шаблон',
                tone: 'danger',
              });

              if (!shouldDelete) {
                return;
              }

              onDelete.mutate(template.id, {
                onSuccess: () => toast.success('Шаблон удалён'),
              });
            }}
            label="Удалить шаблон"
            tone="danger"
          >
            <Trash2 className="w-4 h-4" />
          </IconButton>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Режим:</span>
          <span className="text-gray-300">{usesPlaceholders ? 'Плейсхолдеры' : 'По исходным строкам'}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Оригинал:</span>
          <span className="text-gray-300">{usesPlaceholders ? '{{NAME}}' : template.originalBusinessName}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Домен:</span>
          <span className="text-gray-400 font-mono text-xs">{usesPlaceholders ? '{{DOMAIN}}' : template.originalDomain}</span>
        </div>
        <div className="flex items-center gap-1.5 mt-3">
          <Globe className="w-3.5 h-3.5 text-gray-500" />
          <div className="flex gap-1 flex-wrap">
            {languages.map((language) => (
              <span
                key={language.normalizedCode}
                className="rounded-full border border-gray-700 bg-gray-800/90 px-2.5 py-1 text-[11px] font-medium text-gray-200"
                title={language.optionLabel}
              >
                {language.badgeLabel}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-gray-800 text-xs text-gray-600">
        Добавлен: {formatRuDate(template.createdAt)}
      </div>

      {confirmationDialog}
    </div>
  );
}