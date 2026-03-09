import { AlertCircle, CheckCircle2, Clock3, Loader2 } from 'lucide-react';

export interface DeployProgressItem {
  domain: string;
  businessName: string;
  status: 'queued' | 'creating' | 'deploying' | 'deployed' | 'error' | 'created';
  message: string;
}

interface DeployProgressPanelProps {
  items: DeployProgressItem[];
  panelClass: string;
}

export function DeployProgressPanel({ items, panelClass }: DeployProgressPanelProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className={panelClass}>
      <div className="mb-4 flex items-center justify-between">
        <div className="text-sm font-medium text-white">Ход выполнения</div>
        <span className="text-xs text-gray-500">Текущий запуск</span>
      </div>
      <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
        {items.map((item) => {
          const icon = item.status === 'deployed'
            ? <CheckCircle2 className="w-4 h-4 text-green-400" />
            : item.status === 'error'
              ? <AlertCircle className="w-4 h-4 text-red-400" />
              : item.status === 'queued' || item.status === 'created'
                ? <Clock3 className="w-4 h-4 text-yellow-400" />
                : <Loader2 className="w-4 h-4 animate-spin text-blue-400" />;

          return (
            <div key={item.domain} className="flex items-start gap-3 rounded-xl border border-gray-800 bg-gray-950/40 px-3 py-3">
              <div className="mt-0.5">{icon}</div>
              <div className="min-w-0">
                <div className="truncate text-sm text-gray-200">{item.domain}</div>
                <div className="mt-0.5 truncate text-xs text-gray-500">{item.businessName}</div>
                <div className={`mt-1 text-xs leading-5 ${item.status === 'error' ? 'text-red-400' : 'text-gray-400'}`}>{item.message}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}