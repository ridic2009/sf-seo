import { Info } from 'lucide-react';
import { useState } from 'react';

interface FormFieldLabelProps {
  label: string;
  tooltip?: string;
}

export function FormFieldLabel({ label, tooltip }: FormFieldLabelProps) {
  const [open, setOpen] = useState(false);
  const tooltipId = `field-tooltip-${label.replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <div className="mb-1.5 flex items-center gap-2 text-sm font-medium text-gray-300">
      <span>{label}</span>
      {tooltip && (
        <span className="group relative inline-flex">
          <button
            type="button"
            aria-label={`Показать подсказку для поля ${label}`}
            aria-describedby={open ? tooltipId : undefined}
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
            onBlur={(event) => {
              if (!event.currentTarget.parentElement?.contains(event.relatedTarget as Node | null)) {
                setOpen(false);
              }
            }}
            className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-gray-600 text-gray-400 transition hover:border-indigo-400 hover:text-indigo-300"
          >
            <Info className="h-3 w-3" />
          </button>
          {open && (
            <span id={tooltipId} role="tooltip" className="absolute bottom-full left-1/2 z-10 mb-2 w-64 -translate-x-1/2 rounded-xl border border-white/10 bg-gray-950 px-3 py-2 text-xs font-normal leading-5 text-gray-200 shadow-2xl">
              {tooltip}
            </span>
          )}
        </span>
      )}
    </div>
  );
}