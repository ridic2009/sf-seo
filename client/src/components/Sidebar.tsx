import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, FileBox, Server, Rocket, Factory, Archive, Replace, LogOut } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthSession, useLogout } from '../api/auth';
import { useApiErrorMessage } from '../hooks/useApiErrorMessage';

const links = [
  { to: '/', label: 'Сайты', icon: LayoutDashboard },
  { to: '/templates', label: 'Шаблоны', icon: FileBox },
  { to: '/servers', label: 'Серверы', icon: Server },
  { to: '/bulk-replace', label: 'Массовая замена', icon: Replace },
  { to: '/backups', label: 'Бэкапы', icon: Archive },
  { to: '/deploy', label: 'Деплой', icon: Rocket },
];

export function Sidebar() {
  const navigate = useNavigate();
  const getApiErrorMessage = useApiErrorMessage();
  const { data: session } = useAuthSession();
  const logout = useLogout();

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
        <div className="mb-3 rounded-xl border border-gray-800 bg-gray-950/70 px-3 py-2">
          <p className="text-[11px] uppercase tracking-[0.22em] text-gray-500">Администратор</p>
          <p className="mt-1 text-sm font-semibold text-gray-200">{session?.username || 'admin'}</p>
        </div>
        <button
          type="button"
          onClick={async () => {
            try {
              await logout.mutateAsync();
              navigate('/login', { replace: true });
              toast.success('Сессия завершена');
            } catch (error) {
              toast.error(getApiErrorMessage(error, 'Не удалось выйти'));
            }
          }}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-700 px-3 py-2 text-sm text-gray-300 transition hover:border-gray-600 hover:bg-gray-800"
        >
          <LogOut className="h-4 w-4" />
          Выйти
        </button>
        <p className="mt-3 text-xs text-gray-600">v1.0.0 — protected mode</p>
      </div>
    </aside>
  );
}
