const DOMAIN_LABEL_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function tryParseUrlLike(value: string): URL | null {
  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
      return new URL(value);
    }

    return new URL(`http://${value}`);
  } catch {
    return null;
  }
}

export function normalizeDomainInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  const withoutMailto = trimmed.replace(/^mailto:/i, '');
  const parsed = tryParseUrlLike(withoutMailto);

  let candidate = parsed?.hostname || withoutMailto;
  candidate = candidate
    .replace(/^\.+|\.+$/g, '')
    .replace(/\/$/, '')
    .toLowerCase();

  return candidate;
}

export function isValidDomain(value: string): boolean {
  if (!value || value.length > 253 || !value.includes('.')) {
    return false;
  }

  const labels = value.split('.');
  return labels.every((label) => DOMAIN_LABEL_REGEX.test(label));
}

export function normalizeAndValidateDomain(value: string): string {
  const normalized = normalizeDomainInput(value);
  if (!normalized) {
    throw new Error('Укажите домен');
  }

  if (!isValidDomain(normalized)) {
    throw new Error('Домен должен быть в формате example.com без http://, https://, путей и параметров');
  }

  return normalized;
}