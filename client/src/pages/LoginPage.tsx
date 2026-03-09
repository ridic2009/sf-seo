import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, LockKeyhole } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useAuthSession, useLogin } from '../api/auth';
import { useApiErrorMessage } from '../hooks/useApiErrorMessage';

const loginSchema = z.object({
  username: z.string().trim().min(1, 'Введите логин'),
  password: z.string().min(1, 'Введите пароль'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const getApiErrorMessage = useApiErrorMessage();
  const login = useLogin();
  const { data: session, isLoading } = useAuthSession();
  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: 'admin',
      password: '',
    },
  });

  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || '/';

  useEffect(() => {
    const passwordField = form.getFieldState('password');
    if (passwordField.error?.message) {
      form.setFocus('password');
    }
  }, [form]);

  if (!isLoading && session?.authenticated) {
    return <Navigate to={from} replace />;
  }

  const inputClass = 'w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:border-amber-400/70 focus:outline-none';

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      await login.mutateAsync(values);
      navigate(from, { replace: true });
      toast.success('Вход выполнен');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Не удалось войти'));
    }
  });

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,#4a2d16_0%,#120d0a_30%,#050608_72%)] px-6 py-10 text-white">
      <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(245,158,11,0.08),transparent_30%,rgba(249,115,22,0.14))]" />
      <div className="absolute left-[-8rem] top-12 h-72 w-72 rounded-full bg-amber-500/10 blur-3xl" />
      <div className="absolute bottom-0 right-[-6rem] h-80 w-80 rounded-full bg-orange-500/10 blur-3xl" />

      <div className="relative mx-auto grid min-h-[calc(100vh-5rem)] max-w-6xl items-center gap-10 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/10 px-4 py-1.5 text-xs uppercase tracking-[0.28em] text-amber-200">
            Site Factory Secure Access
          </div>
          <div className="max-w-2xl space-y-4">
            <h1 className="text-4xl font-extrabold leading-tight text-white md:text-6xl">
              Панель теперь закрыта
              <span className="block text-amber-300">авторизацией и антибрутом</span>
            </h1>
            <p className="max-w-xl text-base leading-7 text-gray-300 md:text-lg">
              Доступ к шаблонам, серверам, деплою и бэкапам открыт только после входа. Попытки перебора ограничиваются на сервере по IP и временно блокируются.
            </p>
          </div>
        </section>

        <section className="rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/40 backdrop-blur-xl md:p-8">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-400/15 text-amber-300">
              <LockKeyhole className="h-6 w-6" />
            </div>
            <div>
              <div className="text-lg font-semibold text-white">Вход администратора</div>
              <div className="text-sm text-gray-400">Нужны логин и пароль из env-конфига сервера</div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-2 block text-sm text-gray-300">Логин</label>
              <input className={inputClass} autoComplete="username" {...form.register('username')} />
              {form.formState.errors.username?.message && (
                <p className="mt-1 text-xs text-red-300">{form.formState.errors.username.message}</p>
              )}
            </div>

            <div>
              <label className="mb-2 block text-sm text-gray-300">Пароль</label>
              <input className={inputClass} type="password" autoComplete="current-password" {...form.register('password')} />
              {form.formState.errors.password?.message && (
                <p className="mt-1 text-xs text-red-300">{form.formState.errors.password.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={login.isPending}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-400 px-4 py-3 text-sm font-bold text-gray-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {login.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Войти
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}