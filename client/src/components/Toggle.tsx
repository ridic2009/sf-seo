interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, label, description, disabled = false }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex w-full items-center justify-between gap-4 rounded-xl border px-4 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${checked ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-gray-800 bg-gray-950/50 hover:border-gray-700'}`}
    >
      <div className="pr-4">
        <div className="text-sm font-medium text-gray-200">{label}</div>
        {description && <div className="mt-1 text-xs text-gray-500">{description}</div>}
      </div>
      <span
        className={`inline-flex h-7 w-12 shrink-0 items-center rounded-full border p-0.5 transition-colors ${checked ? 'border-emerald-400/60 bg-emerald-500/25' : 'border-gray-700 bg-gray-800'}`}
      >
        <span
          className={`block h-5 w-5 rounded-full transition-transform ${checked ? 'translate-x-5 bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.35)]' : 'translate-x-0 bg-gray-400'}`}
        />
      </span>
    </button>
  );
}