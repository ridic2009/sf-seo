import { Check } from 'lucide-react';

interface TableSelectionCheckboxProps {
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  onToggle: () => void;
  title?: string;
}

export function TableSelectionCheckbox({
  checked,
  indeterminate = false,
  disabled = false,
  onToggle,
  title,
}: TableSelectionCheckboxProps) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      aria-label={title || 'Выбрать строку'}
      disabled={disabled}
      onClick={onToggle}
      title={title}
      className={`inline-flex h-5 w-5 items-center justify-center rounded-md border transition-colors ${disabled ? 'cursor-not-allowed border-gray-800 bg-gray-900/60 opacity-45' : checked || indeterminate ? 'border-indigo-400 bg-indigo-500 text-white shadow-[0_0_0_1px_rgba(99,102,241,0.15)] hover:bg-indigo-400' : 'border-gray-700 bg-gray-950 text-transparent hover:border-gray-500 hover:bg-gray-900'}`}
    >
      {indeterminate ? (
        <span className="block h-0.5 w-2.5 rounded-full bg-current" />
      ) : (
        <Check className={`h-3.5 w-3.5 ${checked ? 'opacity-100' : 'opacity-0'}`} />
      )}
    </button>
  );
}