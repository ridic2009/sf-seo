import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, X } from 'lucide-react';
import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import toast from 'react-hot-toast';
import { z } from 'zod';
import { useCreateServer, useUpdateServer } from '../../api/servers';
import { useApiErrorMessage } from '../../hooks/useApiErrorMessage';
import type { Server } from '../../types';
import { FormFieldLabel } from '../FormFieldLabel';

const PANEL_TYPES = [
  { value: 'hestia', label: 'Hestia' },
  { value: 'fastpanel', label: 'FastPanel' },
  { value: 'ispmanager', label: 'ISP Manager' },
  { value: 'cpanel', label: 'cPanel' },
] as const;

const WEB_ROOT_PRESETS: Record<string, string> = {
  hestia: '/home/{{USER}}/web/{{DOMAIN}}/public_html',
  fastpanel: '/var/www/{{USER}}/data/www/{{DOMAIN}}',
  ispmanager: '/var/www/{{USER}}/data/www/{{DOMAIN}}',
  cpanel: '/home/{{USER}}/public_html',
};

const PANEL_CONFIG: Record<string, {
  label: string;
  panelPort: number;
  panelUser: string;
  passwordHint: string;
}> = {
  hestia: {
    label: 'Hestia',
    panelPort: 8083,
    panelUser: 'admin',
    passwordHint: 'Укажите пароль пользователя панели, если домен создаётся через Hestia.',
  },
  fastpanel: {
    label: 'FastPanel',
    panelPort: 8888,
    panelUser: 'admin',
    passwordHint: 'Пароль панели обязателен для работы FastPanel API.',
  },
  ispmanager: {
    label: 'ISP Manager',
    panelPort: 1500,
    panelUser: 'root',
    passwordHint: 'Пароль панели нужен для команд панели и некоторых сценариев деплоя.',
  },
  cpanel: {
    label: 'cPanel',
    panelPort: 2083,
    panelUser: 'root',
    passwordHint: 'Если панель не используется, поле можно оставить пустым.',
  },
};

function createServerFormSchema(isEditing: boolean) {
  return z.object({
    name: z.string().trim().min(1, 'Укажите название сервера'),
    host: z.string().trim().min(1, 'Укажите хост или IP'),
    port: z.number().min(1, 'Неверный порт').max(65535, 'Неверный порт'),
    panelType: z.enum(['hestia', 'fastpanel', 'ispmanager', 'cpanel']),
    panelPort: z.number().min(1, 'Неверный порт панели').max(65535, 'Неверный порт панели'),
    username: z.string().trim().min(1, 'Укажите SSH пользователя'),
    authType: z.enum(['password', 'key']),
    password: z.string(),
    privateKey: z.string(),
    webRootPattern: z.string().trim().min(1, 'Укажите шаблон web root'),
    panelUser: z.string(),
    panelPassword: z.string(),
  }).superRefine((values, context) => {
    if (values.authType === 'password' && !isEditing && !values.password.trim()) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['password'], message: 'Укажите SSH пароль' });
    }

    if (values.authType === 'key' && !isEditing && !values.privateKey.trim()) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['privateKey'], message: 'Вставьте приватный SSH ключ' });
    }
  });
}

type ServerFormValues = z.infer<ReturnType<typeof createServerFormSchema>>;

interface ServerFormProps {
  initialServer: Server | null;
  onClose: () => void;
  onCreate: ReturnType<typeof useCreateServer>;
  onUpdate: ReturnType<typeof useUpdateServer>;
}

function FormSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-800 p-5">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-white">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-gray-400">{description}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <p className="mt-1 text-xs text-red-400">{message}</p>;
}

export function ServerForm({ initialServer, onClose, onCreate, onUpdate }: ServerFormProps) {
  const getApiErrorMessage = useApiErrorMessage();
  const initialPanel = PANEL_CONFIG[initialServer?.panelType ?? 'hestia'] ?? PANEL_CONFIG.hestia;
  const isEditing = Boolean(initialServer);
  const inputClass = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors';

  const form = useForm<ServerFormValues>({
    resolver: zodResolver(createServerFormSchema(isEditing)),
    defaultValues: {
      name: initialServer?.name ?? '',
      host: initialServer?.host ?? '',
      port: initialServer?.port ?? 22,
      panelType: (initialServer?.panelType as ServerFormValues['panelType']) ?? 'hestia',
      panelPort: initialServer?.panelPort ?? initialPanel.panelPort,
      username: initialServer?.username ?? 'root',
      authType: (initialServer?.authType as ServerFormValues['authType']) ?? 'password',
      password: '',
      privateKey: '',
      webRootPattern: initialServer?.webRootPattern ?? WEB_ROOT_PRESETS.hestia,
      panelUser: initialServer?.panelUser ?? initialPanel.panelUser,
      panelPassword: '',
    },
  });

  const selectedPanelType = useWatch({ control: form.control, name: 'panelType' });
  const authType = useWatch({ control: form.control, name: 'authType' });
  const panelUser = useWatch({ control: form.control, name: 'panelUser' });
  const username = useWatch({ control: form.control, name: 'username' });
  const webRootPattern = useWatch({ control: form.control, name: 'webRootPattern' });
  const selectedPanel = PANEL_CONFIG[selectedPanelType] ?? PANEL_CONFIG.hestia;
  const usesPanelPassword = selectedPanelType === 'fastpanel' || selectedPanelType === 'ispmanager' || selectedPanelType === 'hestia';
  const isPending = onCreate.isPending || onUpdate.isPending;

  useEffect(() => {
    form.setValue('webRootPattern', WEB_ROOT_PRESETS[selectedPanelType], { shouldDirty: true });
    form.setValue('panelPort', selectedPanel.panelPort, { shouldDirty: true });
    form.setValue('panelUser', selectedPanel.panelUser, { shouldDirty: true });
  }, [form, selectedPanel.panelPort, selectedPanel.panelUser, selectedPanelType]);

  const handleSubmit = form.handleSubmit((values) => {
    const payload = {
      ...values,
      name: values.name.trim(),
      host: values.host.trim(),
      username: values.username.trim(),
      webRootPattern: values.webRootPattern.trim(),
      panelUser: values.panelUser.trim(),
      password: values.password.trim(),
      privateKey: values.privateKey.trim(),
      panelPassword: values.panelPassword.trim(),
    };

    if (isEditing && initialServer) {
      onUpdate.mutate(
        { id: initialServer.id, data: payload },
        {
          onSuccess: () => {
            toast.success('Сервер обновлён');
            onClose();
          },
          onError: (error) => toast.error(getApiErrorMessage(error, 'Ошибка')),
        },
      );
      return;
    }

    onCreate.mutate(payload, {
      onSuccess: () => {
        toast.success('Сервер добавлен');
        onClose();
      },
      onError: (error) => toast.error(getApiErrorMessage(error, 'Ошибка')),
    });
  });

  return (
    <div className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-gray-800 bg-gray-900 shadow-2xl">
      <div className="flex items-start justify-between border-b border-gray-800 px-6 py-5">
        <div>
          <h2 className="text-lg font-semibold text-white">{isEditing ? 'Редактировать сервер' : 'Добавить сервер'}</h2>
        </div>
        <button type="button" aria-label="Закрыть форму сервера" onClick={onClose} className="text-gray-500 hover:text-gray-300">
          <X className="w-5 h-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 pb-4">
          <FormSection
            title="1. Сервер и SSH"
            description="Основные параметры подключения к машине, куда будут загружаться файлы сайта."
          >
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <FormFieldLabel label="Название сервера" />
                <input className={inputClass} placeholder="Production Hestia" {...form.register('name')} />
                <FieldError message={form.formState.errors.name?.message} />
              </div>
              <div>
                <FormFieldLabel label="Хост или IP" />
                <input className={inputClass} placeholder="185.123.45.67" {...form.register('host')} />
                <FieldError message={form.formState.errors.host?.message} />
              </div>
              <div>
                <FormFieldLabel label="SSH порт" />
                <input className={inputClass} type="number" min={1} max={65535} {...form.register('port', { valueAsNumber: true })} />
                <FieldError message={form.formState.errors.port?.message} />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <FormFieldLabel label="SSH пользователь" />
                <input className={inputClass} {...form.register('username')} />
                <FieldError message={form.formState.errors.username?.message} />
              </div>
              <div>
                <FormFieldLabel label="Способ авторизации" />
                <select className={inputClass} {...form.register('authType')}>
                  <option value="password">Пароль</option>
                  <option value="key">SSH ключ</option>
                </select>
              </div>
            </div>

            {authType === 'password' ? (
              <div>
                <FormFieldLabel label="SSH пароль" />
                <input className={inputClass} type="password" placeholder={isEditing ? 'Оставьте пустым, чтобы не менять' : 'Пароль SSH-пользователя'} {...form.register('password')} />
                <FieldError message={form.formState.errors.password?.message} />
              </div>
            ) : (
              <div>
                <FormFieldLabel
                  label="Приватный SSH ключ"
                  tooltip="Вставьте полное содержимое приватного ключа, включая BEGIN и END строки."
                />
                <textarea className={`${inputClass} h-28 resize-y font-mono text-xs`} placeholder={isEditing ? 'Оставьте пустым, чтобы не менять ключ' : '-----BEGIN OPENSSH PRIVATE KEY-----'} {...form.register('privateKey')} />
                <FieldError message={form.formState.errors.privateKey?.message} />
              </div>
            )}
          </FormSection>

          <FormSection
            title="2. Панель управления"
            description="Данные панели для создания домена и доступа к каталогу сайта."
          >
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <FormFieldLabel label="Тип панели" />
                <select className={inputClass} {...form.register('panelType')}>
                  {PANEL_TYPES.map((panel) => (
                    <option key={panel.value} value={panel.value}>{panel.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <FormFieldLabel label="Порт панели" />
                <input className={inputClass} type="number" min={1} max={65535} {...form.register('panelPort', { valueAsNumber: true })} />
                <FieldError message={form.formState.errors.panelPort?.message} />
              </div>
              <div>
                <FormFieldLabel
                  label="Пользователь панели"
                  tooltip="Логин в панели управления. Иногда совпадает с SSH-пользователем, но не всегда."
                />
                <input className={inputClass} placeholder={selectedPanel.panelUser} {...form.register('panelUser')} />
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Для {selectedPanel.label} обычно используется порт {selectedPanel.panelPort}.
            </p>

            <div>
              <FormFieldLabel label="Пароль панели" tooltip={selectedPanel.passwordHint} />
              <input className={inputClass} type="password" placeholder={isEditing ? 'Оставьте пустым, чтобы не менять' : 'Пароль от панели управления'} {...form.register('panelPassword')} />
              <p className="mt-2 text-xs text-gray-500">
                {usesPanelPassword ? 'Для выбранной панели пароль обычно нужен для автоматического создания домена.' : 'Для этой панели пароль может не понадобиться, если домен создаётся другим способом.'}
              </p>
            </div>
          </FormSection>

          <FormSection
            title="3. Путь публикации"
            description="Куда именно на сервер будут загружены обработанные файлы шаблона после деплоя."
          >
            <div>
              <FormFieldLabel
                label="Шаблон web root"
                tooltip="Используйте переменные {{USER}} и {{DOMAIN}}. Они автоматически заменятся на пользователя панели и домен сайта при деплое."
              />
              <input className={`${inputClass} font-mono text-xs`} {...form.register('webRootPattern')} />
              <FieldError message={form.formState.errors.webRootPattern?.message} />
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-950/40 p-3 text-sm text-gray-300">
              <p className="text-xs text-gray-500">Пример итогового пути</p>
              <p className="mt-1 break-all font-mono text-xs text-gray-400">
                {webRootPattern
                  .replace('{{USER}}', panelUser || username || 'admin')
                  .replace('{{DOMAIN}}', 'example.com')}
              </p>
              <p className="mt-2 text-xs text-gray-500">Доступные переменные: {'{{USER}}'}, {'{{DOMAIN}}'}.</p>
            </div>
          </FormSection>
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-800 px-6 py-4">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200">
            Отмена
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {isEditing ? 'Сохранить' : 'Добавить'}
          </button>
        </div>
      </form>
    </div>
  );
}