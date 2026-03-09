import { useEffect, useState } from 'react';
import { getTemplatePreviewUrl } from '../../api/templates';
import { getSitePreviewUrl } from '../../api/sites';
import type { Site } from '../../types';

interface TemplatePreviewProps {
  site: Site;
  onOpen: (site: Site, previewUrl: string) => void;
}

export function TemplatePreview({ site, onOpen }: TemplatePreviewProps) {
  const [imageError, setImageError] = useState(false);

  const isDeployed = site.status === 'deployed';
  const livePreviewUrl = isDeployed
    ? getSitePreviewUrl(site.id, site.previewUpdatedAt || site.deployedAt || null)
    : null;
  const templatePreviewUrl = !isDeployed && site.templateId ? getTemplatePreviewUrl(site.templateId) : null;
  const previewUrl = imageError ? null : livePreviewUrl || templatePreviewUrl;

  useEffect(() => {
    setImageError(false);
  }, [site.id, livePreviewUrl, templatePreviewUrl]);

  if (!previewUrl) {
    return (
      <div
        className="flex h-12 w-20 items-center justify-center rounded-lg border border-dashed border-gray-700 bg-gray-950/60 px-2 text-center text-[10px] uppercase tracking-[0.2em] text-gray-500"
        title={site.previewError || (isDeployed ? 'Не удалось загрузить live preview сайта' : 'Нет превью')}
      >
        {isDeployed ? 'Превью сайта недоступно' : 'Нет превью'}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(site, previewUrl)}
      className="group block rounded-lg"
      title="Открыть полное превью"
    >
      <img
        src={previewUrl}
        alt={site.templateName || site.domain || 'Preview'}
        className="h-12 w-20 rounded-lg border border-gray-800 object-cover object-top transition-colors group-hover:border-indigo-400/60"
        loading="lazy"
        onError={() => setImageError(true)}
      />
    </button>
  );
}