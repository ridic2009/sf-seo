export function formatBackupMode(mode: 'managed' | 'all'): string {
  return mode === 'all' ? 'Все сайты' : 'Только из приложения';
}

export function formatBackupStatus(status: 'running' | 'completed' | 'error'): string {
  if (status === 'running') return 'В работе';
  if (status === 'completed') return 'Готов';
  return 'Ошибка';
}

export function formatBackupStage(stage?: string): string {
  if (!stage) return 'Нет данных';

  const stageMap: Record<string, string> = {
    queued: 'Ожидает запуска',
    connecting: 'Подключение к серверу',
    collecting: 'Сбор файлов',
    archiving: 'Создание архива',
    finalizing: 'Подготовка результата',
    completed: 'Архив готов',
    error: 'Ошибка выполнения',
  };

  return stageMap[stage] || stage;
}