import { useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCcw, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useRefreshSitePreview } from '../../api/sites';
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

  useEffect(() => {
    setRefreshToken(0);
    setImageLoadFailed(false);
  }, [preview.site.id, preview.url]);

  const imageUrl = useMemo(() => {
    if (!refreshToken) {
      return preview.url;
    }

    return `${preview.url}${preview.url.includes('?') ? '&' : '?'}t=${refreshToken}`;
  }, [preview.url, refreshToken]);

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
            <a
              href={imageUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Открыть изображение сайта ${preview.site.domain} в новой вкладке`}
              className="rounded-lg border border-gray-800 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:border-gray-700 hover:bg-gray-900"
            >
              Открыть изображение
            </a>
            <IconButton onClick={onClose} label="Закрыть превью сайта">
              <X className="h-4 w-4" />
            </IconButton>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4">
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-3">
            {imageLoadFailed ? (
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