import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { RequireAuth } from './components/auth/RequireAuth';
import { Layout } from './components/Layout';

const DashboardPage = lazy(async () => ({ default: (await import('./pages/DashboardPage')).DashboardPage }));
const TemplatesPage = lazy(async () => ({ default: (await import('./pages/TemplatesPage')).TemplatesPage }));
const ServersPage = lazy(async () => ({ default: (await import('./pages/ServersPage')).ServersPage }));
const DeployPage = lazy(async () => ({ default: (await import('./pages/DeployPage')).DeployPage }));
const BackupsPage = lazy(async () => ({ default: (await import('./pages/BackupsPage')).BackupsPage }));
const BulkReplacePage = lazy(async () => ({ default: (await import('./pages/BulkReplacePage')).BulkReplacePage }));
const LoginPage = lazy(async () => ({ default: (await import('./pages/LoginPage')).LoginPage }));

function PageLoader() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="rounded-xl border border-gray-800 bg-gray-900 px-5 py-4 text-sm text-gray-300">
        Загрузка страницы...
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<Layout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/templates" element={<TemplatesPage />} />
            <Route path="/servers" element={<ServersPage />} />
            <Route path="/backups" element={<BackupsPage />} />
            <Route path="/bulk-replace" element={<BulkReplacePage />} />
            <Route path="/deploy" element={<DeployPage />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
}
