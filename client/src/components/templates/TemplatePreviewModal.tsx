import { MonitorPlay, Image as ImageIcon, ExternalLink, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { getTemplateLivePreviewUrl, getTemplatePreviewUrl } from '../../api/templates';
import type { Template } from '../../types';
import { IconButton } from '../IconButton';
import { ModalOverlay } from '../ModalOverlay';

interface TemplatePreviewModalProps {
  template: Template;
  onClose: () => void;
}

type PreviewMode = 'live' | 'image';

export function TemplatePreviewModal({ template, onClose }: TemplatePreviewModalProps) {
  const [mode, setMode] = useState<PreviewMode>('live');

  useEffect(() => {
    setMode('live');
  }, [template.id]);

  const screenshotUrl = useMemo(() => getTemplatePreviewUrl(template.id), [template.id]);
  const livePreviewUrl = useMemo(() => getTemplateLivePreviewUrl(template.id), [template.id]);

  return (
    <ModalOverlay onClose={onClose} ariaLabel="Полное превью шаблона" className="z-[110] bg-black/80 p-4">
      <div className="mx-auto flex h-full max-w-7xl flex-col rounded-2xl border border-gray-800 bg-gray-950 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-800 p-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Полное превью шаблона</h2>
            <p className="mt-1 text-sm text-gray-500">{template.name}</p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-lg border border-gray-800 bg-gray-900 p-1">
              <button
                type="button"
                onClick={() => setMode('live')}
                className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors ${mode === 'live' ? 'bg-indigo-500 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}`}
              >
                <MonitorPlay className="h-4 w-4" />
                Live
              </button>
              <button
                type="button"
                onClick={() => setMode('image')}
                className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors ${mode === 'image' ? 'bg-indigo-500 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}`}
              >
                <ImageIcon className="h-4 w-4" />
                Скриншот
              </button>
            </div>

            <a
              href={mode === 'live' ? livePreviewUrl : screenshotUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-800 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:border-gray-700 hover:bg-gray-900"
            >
              <ExternalLink className="h-4 w-4" />
              {mode === 'live' ? 'Открыть live' : 'Открыть изображение'}
            </a>

            <IconButton onClick={onClose} label="Закрыть превью шаблона">
              <X className="h-4 w-4" />
            </IconButton>
          </div>
        </div>

        <div className="border-b border-gray-800 px-4 py-3 text-xs text-amber-200/90">
          Live-preview рендерит шаблон как статическую страницу. Если шаблон зависит от PHP или backend-логики, в этом режиме будет видна только клиентская часть.
        </div>

        <div className="min-h-0 flex-1 overflow-hidden p-4">
          <div className="h-full rounded-xl border border-gray-800 bg-gray-900 p-3">
            {mode === 'live' ? (
              <iframe
                key={livePreviewUrl}
                src={livePreviewUrl}
                title={`Live-preview шаблона ${template.name}`}
                className="h-full min-h-[70vh] w-full rounded-lg bg-white"
              />
            ) : (
              <div className="h-full overflow-y-auto overflow-x-hidden rounded-lg">
                <img
                  src={screenshotUrl}
                  alt={template.name}
                  className="h-auto w-full rounded-lg"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}