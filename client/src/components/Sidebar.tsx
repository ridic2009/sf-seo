import { NavLink } from 'react-router-dom';
import { LayoutDashboard, FileBox, Server, Rocket, Factory, Archive, Replace } from 'lucide-react';

const links = [
  { to: '/', label: 'Сайты', icon: LayoutDashboard },
  { to: '/templates', label: 'Шаблоны', icon: FileBox },
  { to: '/servers', label: 'Серверы', icon: Server },
  { to: '/bulk-replace', label: 'Массовая замена', icon: Replace },
  { to: '/backups', label: 'Бэкапы', icon: Archive },
  { to: '/deploy', label: 'Деплой', icon: Rocket },
];

export function Sidebar() {
  return (
    <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col">
      <div className="p-5 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <Factory className="w-6 h-6 text-indigo-400" />
          <span className="text-lg font-bold text-white">Site Factory</span>
        </div>
        <p className="text-xs text-gray-500 mt-1">Управление шаблонами и деплоем</p>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
              }`
            }
          >
            <Icon className="w-4 h-4" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-gray-800">
        <p className="text-xs text-gray-600">v1.0.0 — local mode</p>
      </div>
    </aside>
  );
}
