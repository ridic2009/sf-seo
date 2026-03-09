import { useState } from 'react';
import { getTemplatePreviewUrl } from '../../api/templates';
import { getSitePreviewUrl } from '../../api/sites';
import type { Site } from '../../types';

interface TemplatePreviewProps {
  site: Site;
  onOpen: (site: Site, previewUrl: string) => void;
}

export function TemplatePreview({ site, onOpen }: TemplatePreviewProps) {
  const [imageError, setImageError] = useState(false);

  const livePreviewUrl = site.status === 'deployed'
    ? getSitePreviewUrl(site.id, site.previewUpdatedAt || site.deployedAt || null)
    : null;
  const templatePreviewUrl = site.templateId ? getTemplatePreviewUrl(site.templateId) : null;
  const previewUrl = !imageError && livePreviewUrl ? livePreviewUrl : templatePreviewUrl;

  if (!previewUrl) {
    return (
      <div className="flex h-12 w-20 items-center justify-center rounded-lg border border-dashed border-gray-700 bg-gray-950/60 text-[10px] uppercase tracking-[0.2em] text-gray-500">
        Нет превью
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