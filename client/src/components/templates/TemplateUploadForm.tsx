import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { z } from 'zod';
import { useUploadTemplate } from '../../api/templates';
import { useApiErrorMessage } from '../../hooks/useApiErrorMessage';
import type { Template } from '../../types';
import { buildTemplateFormData } from './templateFormUtils';

const uploadTemplateSchema = z.object({
  name: z.string(),
  description: z.string(),
  languages: z.string().trim().min(1, 'Укажите хотя бы один язык'),
  originalBusinessName: z.string(),
  originalDomain: z.string(),
  file: z.any().refine((value) => value?.length > 0, 'Выберите ZIP-файл'),
});

type UploadTemplateFormValues = z.infer<typeof uploadTemplateSchema>;

interface TemplateUploadFormProps {
  templates: Template[];
  onClose: () => void;
  onUpload: ReturnType<typeof useUploadTemplate>;
}

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <p className="mt-1 text-xs text-red-400">{message}</p>;
}

export function TemplateUploadForm({ templates: _templates, onClose, onUpload }: TemplateUploadFormProps) {
  const getApiErrorMessage = useApiErrorMessage();
  const inputClass = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-indigo-500';
  const form = useForm<UploadTemplateFormValues>({
    resolver: zodResolver(uploadTemplateSchema),
    defaultValues: {
      name: '',
      description: '',
      languages: 'en',
      originalBusinessName: '',
      originalDomain: '',
      file: undefined,
    },
  });

  const handleSubmit = form.handleSubmit((values) => {
    const archiveFile = values.file?.[0] as File | undefined;
    if (!archiveFile) {
      return;
    }

    onUpload.mutate(buildTemplateFormData(values, archiveFile), {
      onSuccess: () => {
        toast.success('Шаблон загружен');
        onClose();
      },
      onError: (error) => {
        toast.error(getApiErrorMessage(error, 'Ошибка загрузки'));
      },
    });
  });

  return (
    <div className="w-full max-w-3xl bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-2xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Загрузить шаблон</h2>
        <button type="button" aria-label="Закрыть форму загрузки шаблона" onClick={onClose} className="text-gray-500 hover:text-gray-300">
          <X className="w-5 h-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Название шаблона</label>
            <input className={inputClass} placeholder="Можно оставить пустым для экспортированного пакета" {...form.register('name')} />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Языки (через запятую)</label>
            <input className={inputClass} placeholder="en, de, pt-br, es-mx, ja, zh-cn" {...form.register('languages')} />
            <p className="mt-1 text-xs text-gray-500">Можно указывать и региональные коды, например pt-br, es-ar, zh-tw.</p>
            <FieldError message={form.formState.errors.languages?.message} />
          </div>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Описание</label>
          <input className={inputClass} placeholder="Описание шаблона (необязательно)" {...form.register('description')} />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">ZIP-архив шаблона</label>
          <input
            type="file"
            accept=".zip"
            className="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-indigo-500/10 file:text-indigo-400 hover:file:bg-indigo-500/20"
            {...form.register('file')}
          />
          <FieldError message={form.formState.errors.file?.message as string | undefined} />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200">
            Отмена
          </button>
          <button
            type="submit"
            disabled={onUpload.isPending}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            {onUpload.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Загрузить
          </button>
        </div>
      </form>
    </div>
  );
}