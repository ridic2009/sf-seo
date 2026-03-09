import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, LockKeyhole, ShieldCheck } from 'lucide-react';
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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050608] px-6 py-10 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.18),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(249,115,22,0.16),transparent_30%),linear-gradient(145deg,#050608_0%,#120b07_45%,#050608_100%)]" />
      <div className="absolute left-1/2 top-1/2 h-[28rem] w-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/5 bg-white/[0.02] blur-3xl" />
      <div className="absolute left-[12%] top-[18%] h-28 w-28 rounded-full bg-amber-400/10 blur-3xl" />
      <div className="absolute bottom-[14%] right-[10%] h-36 w-36 rounded-full bg-orange-500/10 blur-3xl" />

      <section className="relative w-full max-w-md rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-7 shadow-[0_30px_90px_rgba(0,0,0,0.45)] backdrop-blur-2xl md:p-8">
        <div className="mb-8 flex items-center justify-center">
          <div className="relative flex h-16 w-16 items-center justify-center rounded-[1.4rem] border border-amber-300/20 bg-[linear-gradient(180deg,rgba(251,191,36,0.22),rgba(245,158,11,0.08))] text-amber-200 shadow-[0_12px_32px_rgba(245,158,11,0.16)]">
            <ShieldCheck className="absolute h-8 w-8 opacity-90" />
            <LockKeyhole className="absolute bottom-3 right-3 h-3.5 w-3.5 text-amber-100" />
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
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(180deg,#f7c948,#e7a91a)] px-4 py-3 text-sm font-bold text-gray-950 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {login.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Войти
            </button>
          </form>
      </section>
    </div>
  );
}