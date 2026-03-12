import { useMemo } from 'react';
import { ExternalLink, MonitorPlay, X } from 'lucide-react';
import { getTemplateLivePreviewUrl } from '../../api/templates';
import type { Site } from '../../types';
import { IconButton } from '../IconButton';
import { ModalOverlay } from '../ModalOverlay';

interface SitePreviewModalProps {
  preview: { site: Site };
  onClose: () => void;
}

export function SitePreviewModal({ preview, onClose }: SitePreviewModalProps) {
  const isLivePreview = preview.site.status === 'deployed';
  const livePreviewUrl = useMemo(() => {
    if (isLivePreview) {
      return `https://${preview.site.domain}`;
    }

    return preview.site.templateId ? getTemplateLivePreviewUrl(preview.site.templateId) : null;
  }, [isLivePreview, preview.site.domain, preview.site.templateId]);

  return (
    <ModalOverlay onClose={onClose} ariaLabel="Полное превью сайта" className="z-[110] bg-black/80 p-4">
      <div className="mx-auto flex h-full max-w-7xl flex-col rounded-2xl border border-gray-800 bg-gray-950 shadow-2xl">
        <div className="flex items-start justify-between border-b border-gray-800 p-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Полное превью</h2>
            <p className="mt-1 text-sm text-gray-500">{preview.site.domain}</p>
          </div>
          <div className="flex items-center gap-2">
            {livePreviewUrl && (
              <a
                href={livePreviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Открыть live-preview сайта ${preview.site.domain} в новой вкладке`}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-800 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:border-gray-700 hover:bg-gray-900"
              >
                <ExternalLink className="h-4 w-4" />
                Открыть live
              </a>
            )}
            <IconButton onClick={onClose} label="Закрыть превью сайта">
              <X className="h-4 w-4" />
            </IconButton>
          </div>
        </div>

        {!isLivePreview && livePreviewUrl && (
          <div className="border-b border-gray-800 px-4 py-3 text-xs text-amber-200/90">
            Для шаблона доступен live-preview как статическая страница. Если разметка зависит от PHP, в этом режиме серверная логика не выполняется.
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4">
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-3">
            {livePreviewUrl ? (
              <iframe
                key={livePreviewUrl}
                src={livePreviewUrl}
                title={`Live-preview для ${preview.site.domain}`}
                className="h-[70vh] w-full rounded-lg bg-white"
                sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
              />
            ) : (
              <div className="flex min-h-[320px] items-center justify-center rounded-lg border border-dashed border-gray-700 bg-gray-950/60 px-6 text-center text-sm text-gray-400">
                <div className="max-w-xl space-y-3">
                  <div className="text-base font-medium text-gray-200">Live-preview недоступен</div>
                  <div>Для этого сайта сейчас нельзя открыть встроенное live-preview.</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}