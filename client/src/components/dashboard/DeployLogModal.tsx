import type { Site } from '../../types';
import { IconButton } from '../IconButton';
import { ModalOverlay } from '../ModalOverlay';
import { X } from 'lucide-react';

interface DeployLogModalProps {
  site: Site;
  onClose: () => void;
}

export function DeployLogModal({ site, onClose }: DeployLogModalProps) {
  return (
    <ModalOverlay onClose={onClose} ariaLabel="Лог деплоя" className="z-[110] bg-black/70 p-4">
      <div className="flex h-full items-center justify-center">
        <div className="w-full max-w-3xl rounded-xl border border-gray-800 bg-gray-900 shadow-2xl">
          <div className="flex items-start justify-between border-b border-gray-800 p-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Лог деплоя</h2>
              <p className="mt-1 text-sm text-gray-500">{site.domain}</p>
            </div>
            <IconButton onClick={onClose} label="Закрыть лог деплоя">
              <X className="h-4 w-4" />
            </IconButton>
          </div>
          <div className="space-y-3 p-4">
            {site.errorMessage && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {site.errorMessage}
              </div>
            )}
            <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-gray-800 bg-gray-950/60 p-4 text-xs leading-6 text-gray-300">{site.deployLog || 'Лог пока отсутствует'}</pre>
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}