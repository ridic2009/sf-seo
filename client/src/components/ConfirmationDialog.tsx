import { AlertTriangle } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ModalOverlay } from './ModalOverlay';

type ConfirmationTone = 'default' | 'danger' | 'warning';

interface ConfirmationOptions {
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  tone?: ConfirmationTone;
}

interface ConfirmationDialogProps extends Required<ConfirmationOptions> {
  onConfirm: () => void;
  onClose: () => void;
}

const confirmToneClasses: Record<ConfirmationTone, string> = {
  default: 'bg-indigo-600 hover:bg-indigo-500',
  danger: 'bg-red-600 hover:bg-red-500',
  warning: 'bg-amber-600 hover:bg-amber-500',
};

function ConfirmationDialog({
  title,
  description,
  confirmText,
  cancelText,
  tone,
  onConfirm,
  onClose,
}: ConfirmationDialogProps) {
  return (
    <ModalOverlay onClose={onClose} ariaLabel={title} className="z-[160] bg-black/80 p-4 backdrop-blur-sm">
      <div className="flex h-full items-center justify-center">
        <div className="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-950 shadow-2xl">
          <div className="border-b border-gray-800 px-6 py-5">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-full border border-amber-400/20 bg-amber-500/10 text-amber-300">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">{title}</h2>
                <p className="mt-1 text-sm leading-6 text-gray-400">{description}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-700 px-4 py-2.5 text-sm text-gray-300 transition-colors hover:border-gray-600 hover:bg-gray-900"
            >
              {cancelText}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className={`rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-colors ${confirmToneClasses[tone]}`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}

export function useConfirmationDialog() {
  const resolverRef = useRef<((result: boolean) => void) | null>(null);
  const [options, setOptions] = useState<Required<ConfirmationOptions> | null>(null);

  const closeDialog = useCallback((result: boolean) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setOptions(null);
  }, []);

  useEffect(() => {
    return () => {
      resolverRef.current?.(false);
      resolverRef.current = null;
    };
  }, []);

  const confirm = useCallback((nextOptions: ConfirmationOptions) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setOptions({
        cancelText: 'Отмена',
        confirmText: 'Подтвердить',
        tone: 'default',
        ...nextOptions,
      });
    });
  }, []);

  return {
    confirm,
    confirmationDialog: options ? (
      <ConfirmationDialog
        {...options}
        onClose={() => closeDialog(false)}
        onConfirm={() => closeDialog(true)}
      />
    ) : null,
  };
}