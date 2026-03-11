import { useEffect, useMemo, useState } from 'react';
import { Image as ImageIcon, Loader2, MonitorPlay, RefreshCcw, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useRefreshSitePreview } from '../../api/sites';
import { getTemplateLivePreviewUrl } from '../../api/templates';
import { useApiErrorMessage } from '../../hooks/useApiErrorMessage';
import type { Site } from '../../types';
import { IconButton } from '../IconButton';
import { ModalOverlay } from '../ModalOverlay';

interface SitePreviewModalProps {
  preview: { site: Site; url: string };
  onClose: () => void;
}

export function SitePreviewModal({ preview, onClose }: SitePreviewModalProps) {
  const refreshSitePreview = useRefreshSitePreview();
  const getApiErrorMessage = useApiErrorMessage();
  const [refreshToken, setRefreshToken] = useState(0);
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const isLivePreview = preview.site.status === 'deployed';
  const hasTemplateLivePreview = !isLivePreview && Boolean(preview.site.templateId);
  const [mode, setMode] = useState<'live' | 'image'>(hasTemplateLivePreview ? 'live' : 'image');

  useEffect(() => {
    setRefreshToken(0);
    setImageLoadFailed(false);
    setMode(hasTemplateLivePreview ? 'live' : 'image');
  }, [hasTemplateLivePreview, preview.site.id, preview.url]);

  const imageUrl = useMemo(() => {
    if (!refreshToken) {
      return preview.url;
    }

    return `${preview.url}${preview.url.includes('?') ? '&' : '?'}t=${refreshToken}`;
  }, [preview.url, refreshToken]);
  const templateLiveUrl = useMemo(
    () => (preview.site.templateId ? getTemplateLivePreviewUrl(preview.site.templateId) : null),
    [preview.site.templateId],
  );
  const currentOpenUrl = mode === 'live' && templateLiveUrl ? templateLiveUrl : imageUrl;

  return (
    <ModalOverlay onClose={onClose} ariaLabel="Полное превью сайта" className="z-[110] bg-black/80 p-4">
      <div className="mx-auto flex h-full max-w-7xl flex-col rounded-2xl border border-gray-800 bg-gray-950 shadow-2xl">
        <div className="flex items-start justify-between border-b border-gray-800 p-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Полное превью</h2>
            <p className="mt-1 text-sm text-gray-500">{preview.site.domain}</p>
          </div>
          <div className="flex items-center gap-2">
            {isLivePreview && preview.site.serverId && (
              <button
                type="button"
                onClick={() => {
                  refreshSitePreview.mutate(preview.site.id, {
                    onSuccess: () => {
                      setImageLoadFailed(false);
                      setRefreshToken(Date.now());
                      toast.success(`Превью ${preview.site.domain} обновлено`);
                    },
                    onError: (error) => toast.error(getApiErrorMessage(error, 'Ошибка обновления превью')),
                  });
                }}
                disabled={refreshSitePreview.isPending}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-800 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:border-gray-700 hover:bg-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {refreshSitePreview.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                Обновить превью
              </button>
            )}
            {hasTemplateLivePreview && templateLiveUrl && (
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
            )}
            <a
              href={currentOpenUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Открыть превью сайта ${preview.site.domain} в новой вкладке`}
              className="rounded-lg border border-gray-800 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:border-gray-700 hover:bg-gray-900"
            >
              {mode === 'live' && templateLiveUrl ? 'Открыть live' : 'Открыть изображение'}
            </a>
            <IconButton onClick={onClose} label="Закрыть превью сайта">
              <X className="h-4 w-4" />
            </IconButton>
          </div>
        </div>

        {hasTemplateLivePreview && (
          <div className="border-b border-gray-800 px-4 py-3 text-xs text-amber-200/90">
            Для шаблона доступен live-preview как статическая страница. Если разметка зависит от PHP, в этом режиме серверная логика не выполняется.
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4">
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-3">
            {mode === 'live' && templateLiveUrl ? (
              <iframe
                key={templateLiveUrl}
                src={templateLiveUrl}
                title={`Live-preview шаблона для ${preview.site.domain}`}
                className="h-[70vh] w-full rounded-lg bg-white"
              />
            ) : imageLoadFailed ? (
              <div className="flex min-h-[320px] items-center justify-center rounded-lg border border-dashed border-gray-700 bg-gray-950/60 px-6 text-center text-sm text-gray-400">
                <div className="max-w-xl space-y-3">
                  <div className="text-base font-medium text-gray-200">Изображение превью пока недоступно</div>
                  <div>
                    {preview.site.previewError || 'Открой превью позже или нажми "Обновить превью", чтобы повторить снимок вручную.'}
                  </div>
                </div>
              </div>
            ) : (
              <img
                src={imageUrl}
                alt={preview.site.domain}
                className="h-auto w-full rounded-lg"
                onError={() => setImageLoadFailed(true)}
              />
            )}
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}