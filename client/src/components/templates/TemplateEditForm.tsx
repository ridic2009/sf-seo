import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { z } from 'zod';
import { useReplaceTemplateArchive, useUpdateTemplate } from '../../api/templates';
import { useApiErrorMessage } from '../../hooks/useApiErrorMessage';
import { formatTemplateLanguages } from '../../hooks/useTemplateLanguages';
import type { Template } from '../../types';
import { buildTemplateFormData, buildTemplateMetadataPayload } from './templateFormUtils';

const editTemplateSchema = z.object({
  name: z.string().trim().min(1, 'Укажите название шаблона'),
  description: z.string(),
  languages: z.string().trim().min(1, 'Укажите хотя бы один язык'),
  originalBusinessName: z.string(),
  originalDomain: z.string(),
  archive: z.any().optional(),
});

type EditTemplateFormValues = z.infer<typeof editTemplateSchema>;

interface TemplateEditFormProps {
  template: Template;
  onClose: () => void;
  onUpdate: ReturnType<typeof useUpdateTemplate>;
  onReplaceArchive: ReturnType<typeof useReplaceTemplateArchive>;
}

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <p className="mt-1 text-xs text-red-400">{message}</p>;
}

export function TemplateEditForm({ template, onClose, onUpdate, onReplaceArchive }: TemplateEditFormProps) {
  const getApiErrorMessage = useApiErrorMessage();
  const inputClass = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-indigo-500';
  const form = useForm<EditTemplateFormValues>({
    resolver: zodResolver(editTemplateSchema),
    defaultValues: {
      name: template.name,
      description: template.description ?? '',
      languages: formatTemplateLanguages(template.languages),
      originalBusinessName: template.originalBusinessName,
      originalDomain: template.originalDomain,
      archive: undefined,
    },
  });

  const handleSubmit = form.handleSubmit((values) => {
    const archiveFile = values.archive?.[0] as File | undefined;

    if (archiveFile) {
      onReplaceArchive.mutate(
        { id: template.id, formData: buildTemplateFormData(values, archiveFile) },
        {
          onSuccess: () => {
            toast.success('Архив шаблона обновлён');
            onClose();
          },
          onError: (error) => {
            toast.error(getApiErrorMessage(error, 'Ошибка обновления архива'));
          },
        },
      );
      return;
    }

    onUpdate.mutate(
      {
        id: template.id,
        data: buildTemplateMetadataPayload(values),
      },
      {
        onSuccess: () => {
          toast.success('Шаблон обновлён');
          onClose();
        },
        onError: (error) => {
          toast.error(getApiErrorMessage(error, 'Ошибка обновления'));
        },
      },
    );
  });

  const archiveFiles = form.watch('archive');
  const hasArchive = Boolean(archiveFiles?.length);

  return (
    <div className="w-full max-w-3xl bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-2xl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Редактировать шаблон</h2>
          <p className="mt-1 text-sm text-gray-500">Меняются только метаданные, архив шаблона остаётся прежним.</p>
        </div>
        <button type="button" aria-label="Закрыть форму редактирования шаблона" onClick={onClose} className="text-gray-500 hover:text-gray-300">
          <X className="w-5 h-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm text-gray-400">Название шаблона</label>
            <input className={inputClass} {...form.register('name')} />
            <FieldError message={form.formState.errors.name?.message} />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-400">Языки (через запятую)</label>
            <input className={inputClass} placeholder="en, de, pt-br, es-mx, ja, zh-cn" {...form.register('languages')} />
            <p className="mt-1 text-xs text-gray-500">Поддерживаются коды языков и локалей, в интерфейсе для них автоматически покажутся флаги.</p>
            <FieldError message={form.formState.errors.languages?.message} />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm text-gray-400">Описание</label>
          <input className={inputClass} placeholder="Описание шаблона" {...form.register('description')} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm text-gray-400">Исходное название бизнеса</label>
            <input className={inputClass} placeholder="{{NAME}}" {...form.register('originalBusinessName')} />
          </div>
          <div>
            <label className="mb-1 block text-sm text-gray-400">Исходный домен</label>
            <input className={inputClass} placeholder="{{DOMAIN}}" {...form.register('originalDomain')} />
          </div>
        </div>

        <div className="rounded-lg border border-gray-800 bg-gray-950/40 p-4">
          <div className="mb-2 text-sm font-medium text-gray-200">Новый архив шаблона</div>
          <input
            type="file"
            accept=".zip"
            className="w-full text-sm text-gray-400 file:mr-4 file:rounded-lg file:border-0 file:bg-indigo-500/10 file:px-4 file:py-2 file:text-sm file:font-medium file:text-indigo-400 hover:file:bg-indigo-500/20"
            {...form.register('archive')}
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200">
            Отмена
          </button>
          <button
            type="submit"
            disabled={onUpdate.isPending || onReplaceArchive.isPending}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {(onUpdate.isPending || onReplaceArchive.isPending) && <Loader2 className="w-4 h-4 animate-spin" />}
            {hasArchive ? 'Сохранить и заменить архив' : 'Сохранить'}
          </button>
        </div>
      </form>
    </div>
  );
}