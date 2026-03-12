import { getTemplateLivePreviewUrl } from '../../api/templates';
import type { Site } from '../../types';

interface TemplatePreviewProps {
  site: Site;
  onOpen: (site: Site) => void;
}

export function TemplatePreview({ site, onOpen }: TemplatePreviewProps) {
  const isDeployed = site.status === 'deployed';
  const livePreviewUrl = isDeployed
    ? `https://${site.domain}`
    : site.templateId
      ? getTemplateLivePreviewUrl(site.templateId)
      : null;

  if (!livePreviewUrl) {
    return (
      <div
        className="flex h-12 w-20 items-center justify-center rounded-lg border border-dashed border-gray-700 bg-gray-950/60 px-2 text-center text-[10px] uppercase tracking-[0.2em] text-gray-500"
        title={isDeployed ? 'Live-preview сайта недоступен' : 'Для сайта нет доступного live-preview'}
      >
        {isDeployed ? 'Нет live' : 'Нет превью'}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(site)}
      className="group block rounded-lg"
      title="Открыть live-preview"
    >
      <iframe
        src={livePreviewUrl}
        title={site.templateName || site.domain || 'Live preview'}
        className="pointer-events-none h-12 w-20 rounded-lg border border-gray-800 bg-white transition-colors group-hover:border-indigo-400/60"
        loading="lazy"
        sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
      />
    </button>
  );
}