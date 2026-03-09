import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthSession } from '../../api/auth';

function AuthLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 p-6">
      <div className="rounded-2xl border border-gray-800 bg-gray-900 px-6 py-5 text-sm text-gray-300 shadow-2xl shadow-black/30">
        Проверка доступа...
      </div>
    </div>
  );
}

export function RequireAuth() {
  const location = useLocation();
  const { data, isLoading } = useAuthSession();

  if (isLoading) {
    return <AuthLoader />;
  }

  if (!data?.authenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}