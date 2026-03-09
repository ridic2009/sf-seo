import { lazy, Suspense, useState } from 'react';
import { useTemplates, useUploadTemplate, useDeleteTemplate, useTemplateSyncStatus, useSyncTemplates, useUpdateTemplate, useReplaceTemplateArchive, getTemplatePreviewUrl, getTemplateFiles, getTemplateFileContent, saveTemplateFileContent, searchTemplateFiles, replaceTemplateFiles } from '../api/templates';
import { Upload, FileBox, Loader2, X, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import type { Template } from '../types';
import { ModalOverlay } from '../components/ModalOverlay';
import { IconButton } from '../components/IconButton';
import { useConfirmationDialog } from '../components/ConfirmationDialog';
import { TemplateCard } from '../components/templates/TemplateCard';
import { TemplateEditForm } from '../components/templates/TemplateEditForm';
import { TemplateUploadForm } from '../components/templates/TemplateUploadForm';

const LazyCodeEditorModal = lazy(async () => {
  const module = await import('../components/CodeEditorModal');
  return { default: module.CodeEditorModal };
});

export function TemplatesPage() {
  const { data: templates = [], isLoading } = useTemplates();
  const { data: syncStatus } = useTemplateSyncStatus();
  const syncTemplates = useSyncTemplates();
  const uploadTemplate = useUploadTemplate();
  const updateTemplate = useUpdateTemplate();
  const replaceTemplateArchive = useReplaceTemplateArchive();
  const deleteTemplate = useDeleteTemplate();
  const { confirmationDialog } = useConfirmationDialog();
  const [showUpload, setShowUpload] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [editingTemplateCode, setEditingTemplateCode] = useState<Template | null>(null);
  const [selectedPreview, setSelectedPreview] = useState<{ template: Template; url: string } | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Шаблоны</h1>
          <p className="text-gray-500 text-sm mt-1">Библиотека шаблонов сайтов с поддержкой ZIP и плейсхолдеров</p>
          <p className="text-gray-600 text-xs mt-2">
            {syncStatus?.enabled
              ? `Синхронизация включена: ${syncStatus.directory}`
              : 'Синхронизация выключена. Укажите TEMPLATE_SYNC_DIR на обеих установках.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => syncTemplates.mutate(undefined, {
              onSuccess: (data: any) => {
                toast.success(`Синхронизация завершена: +${data.imported || 0} / ~${data.updated || 0} / -${data.deleted || 0}`);
              },
              onError: (err: any) => {
                toast.error(err.response?.data?.error || 'Ошибка синхронизации');
              },
            })}
            disabled={!syncStatus?.enabled || syncTemplates.isPending}
            className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {syncTemplates.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Синхронизировать
          </button>
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Upload className="w-4 h-4" />
            Загрузить шаблон
          </button>
        </div>
      </div>

      {showUpload && (
        <ModalOverlay onClose={() => setShowUpload(false)} ariaLabel="Загрузить шаблон" className="z-[120] bg-black/80 p-4 backdrop-blur-sm">
          <div className="flex h-full items-center justify-center">
            <TemplateUploadForm
              templates={templates}
              onClose={() => setShowUpload(false)}
              onUpload={uploadTemplate}
            />
          </div>
        </ModalOverlay>
      )}

      {editingTemplate && (
        <ModalOverlay onClose={() => setEditingTemplate(null)} ariaLabel="Редактировать шаблон" className="z-[120] bg-black/80 p-4 backdrop-blur-sm">
          <div className="flex h-full items-center justify-center">
            <TemplateEditForm
              template={editingTemplate}
              onClose={() => setEditingTemplate(null)}
              onUpdate={updateTemplate}
              onReplaceArchive={replaceTemplateArchive}
            />
          </div>
        </ModalOverlay>
      )}

      {editingTemplateCode && (
        <Suspense
          fallback={
            <ModalOverlay ariaLabel="Загрузка редактора шаблона" className="z-[120] bg-black/75 p-4">
              <div className="flex h-full items-center justify-center">
                <div className="rounded-xl border border-gray-800 bg-gray-950 px-6 py-5 text-sm text-gray-300">
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Загружаю редактор...
                  </span>
                </div>
              </div>
            </ModalOverlay>
          }
        >
          <LazyCodeEditorModal
            title="Редактор шаблона"
            subtitle={editingTemplateCode.name}
            filesLoader={() => getTemplateFiles(editingTemplateCode.id)}
            fileLoader={(filePath) => getTemplateFileContent(editingTemplateCode.id, filePath)}
            fileSaver={(filePath, content) => saveTemplateFileContent(editingTemplateCode.id, filePath, content)}
            globalSearcher={(query, options) => searchTemplateFiles(editingTemplateCode.id, query, options)}
            globalReplacer={(query, replaceWith, options) => replaceTemplateFiles(editingTemplateCode.id, query, replaceWith, options)}
            saveHint="Правки сохраняются в локальный шаблон. Для уже задеплоенных сайтов после этого нужен редеплой."
            onClose={() => setEditingTemplateCode(null)}
          />
        </Suspense>
      )}

      {isLoading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center p-12 bg-gray-900 border border-gray-800 rounded-xl text-gray-500">
          <FileBox className="w-12 h-12 mx-auto mb-3 text-gray-700" />
          <p className="text-lg">Пока нет шаблонов</p>
          <p className="text-sm mt-1">Загрузите ZIP-архив с готовым шаблоном сайта</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              onDelete={deleteTemplate}
              onEdit={setEditingTemplate}
              onCodeEdit={setEditingTemplateCode}
              onOpenPreview={(template, url) => setSelectedPreview({ template, url })}
            />
          ))}
        </div>
      )}

      {selectedPreview && (
        <ModalOverlay onClose={() => setSelectedPreview(null)} ariaLabel="Полное превью шаблона" className="z-[110] bg-black/80 p-4">
          <div className="mx-auto flex h-full max-w-7xl flex-col rounded-2xl border border-gray-800 bg-gray-950 shadow-2xl">
            <div className="flex items-start justify-between border-b border-gray-800 p-4">
              <div>
                <h2 className="text-lg font-semibold text-white">Полное превью шаблона</h2>
                <p className="mt-1 text-sm text-gray-500">{selectedPreview.template.name}</p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={selectedPreview.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Открыть изображение шаблона в новой вкладке"
                  className="rounded-lg border border-gray-800 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:border-gray-700 hover:bg-gray-900"
                >
                  Открыть изображение
                </a>
                <IconButton
                  onClick={() => setSelectedPreview(null)}
                  label="Закрыть превью шаблона"
                >
                  <X className="w-4 h-4" />
                </IconButton>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4">
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-3">
                <img
                  src={selectedPreview.url}
                  alt={selectedPreview.template.name}
                  className="h-auto w-full rounded-lg"
                />
              </div>
            </div>
          </div>
        </ModalOverlay>
      )}

      {confirmationDialog}
    </div>
  );
}
