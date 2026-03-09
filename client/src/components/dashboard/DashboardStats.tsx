interface DashboardStatsProps {
  stats: {
    total: number;
    deployed: number;
    pending: number;
    errors: number;
  };
}

export function DashboardStats({ stats }: DashboardStatsProps) {
  return (
    <div className="grid grid-cols-4 gap-4">
      {[
        { label: 'Всего', value: stats.total, color: 'text-white' },
        { label: 'Развёрнуто', value: stats.deployed, color: 'text-green-400' },
        { label: 'Ожидает', value: stats.pending, color: 'text-yellow-400' },
        { label: 'Ошибки', value: stats.errors, color: 'text-red-400' },
      ].map((item) => (
        <div key={item.label} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <div className={`text-2xl font-bold ${item.color}`}>{item.value}</div>
          <div className="text-sm text-gray-500">{item.label}</div>
        </div>
      ))}
    </div>
  );
}