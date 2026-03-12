export function formatBackupScheduleInterval(hours: number): string {
  if (hours <= 1) {
    return 'Каждый час';
  }

  if (hours % 24 === 0) {
    const days = hours / 24;
    return days === 1 ? 'Раз в сутки' : `Раз в ${days} дн.`;
  }

  return `Каждые ${hours} ч.`;
}

export function getBackupScheduleNextRun(lastRunAt: string | null, intervalHours: number): Date | null {
  const anchor = lastRunAt ? Date.parse(lastRunAt) : Number.NaN;
  if (!Number.isFinite(anchor)) {
    return null;
  }

  return new Date(anchor + Math.max(1, intervalHours) * 60 * 60 * 1000);
}

export function formatBackupScheduleMode(mode: 'managed' | 'all'): string {
  return mode === 'all' ? 'Все сайты' : 'Только сайты из приложения';
}