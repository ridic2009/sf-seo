const DATE_LOCALE = 'ru-RU';

export function formatBytes(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  if (sizeBytes < 1024 * 1024 * 1024) return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(sizeBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatRuDate(value: string | number | Date): string {
  return new Date(value).toLocaleDateString(DATE_LOCALE);
}

export function formatRuDateTime(value: string | number | Date): string {
  return new Date(value).toLocaleString(DATE_LOCALE);
}