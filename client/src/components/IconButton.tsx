import type { ButtonHTMLAttributes, ReactNode } from 'react';

type IconButtonTone = 'default' | 'primary' | 'success' | 'warning' | 'danger';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
  tone?: IconButtonTone;
}

const toneClasses: Record<IconButtonTone, string> = {
  default: 'text-gray-400 hover:bg-gray-800 hover:text-gray-200',
  primary: 'text-gray-400 hover:bg-gray-800 hover:text-indigo-300',
  success: 'text-gray-400 hover:bg-gray-800 hover:text-green-400',
  warning: 'text-gray-400 hover:bg-gray-800 hover:text-amber-300',
  danger: 'text-gray-400 hover:bg-gray-800 hover:text-red-400',
};

export function IconButton({
  label,
  children,
  tone = 'default',
  className = '',
  type = 'button',
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${toneClasses[tone]} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}