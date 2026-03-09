export interface LanguagePresentation {
  code: string;
  normalizedCode: string;
  flag: string;
  label: string;
  badgeLabel: string;
  optionLabel: string;
}

interface LanguageMetadata {
  flag: string;
  label: string;
}

const LANGUAGE_METADATA: Record<string, LanguageMetadata> = {
  ar: { flag: '🇸🇦', label: 'Арабский' },
  az: { flag: '🇦🇿', label: 'Азербайджанский' },
  bg: { flag: '🇧🇬', label: 'Болгарский' },
  bn: { flag: '🇧🇩', label: 'Бенгальский' },
  cs: { flag: '🇨🇿', label: 'Чешский' },
  da: { flag: '🇩🇰', label: 'Датский' },
  de: { flag: '🇩🇪', label: 'Немецкий' },
  el: { flag: '🇬🇷', label: 'Греческий' },
  en: { flag: '🇬🇧', label: 'Английский' },
  es: { flag: '🇪🇸', label: 'Испанский' },
  'es-419': { flag: '🇲🇽', label: 'Испанский (Латинская Америка)' },
  'es-ar': { flag: '🇦🇷', label: 'Испанский (Аргентина)' },
  'es-bo': { flag: '🇧🇴', label: 'Испанский (Боливия)' },
  'es-cl': { flag: '🇨🇱', label: 'Испанский (Чили)' },
  'es-co': { flag: '🇨🇴', label: 'Испанский (Колумбия)' },
  'es-cr': { flag: '🇨🇷', label: 'Испанский (Коста-Рика)' },
  'es-cu': { flag: '🇨🇺', label: 'Испанский (Куба)' },
  'es-do': { flag: '🇩🇴', label: 'Испанский (Доминикана)' },
  'es-ec': { flag: '🇪🇨', label: 'Испанский (Эквадор)' },
  'es-gt': { flag: '🇬🇹', label: 'Испанский (Гватемала)' },
  'es-hn': { flag: '🇭🇳', label: 'Испанский (Гондурас)' },
  'es-mx': { flag: '🇲🇽', label: 'Испанский (Мексика)' },
  'es-ni': { flag: '🇳🇮', label: 'Испанский (Никарагуа)' },
  'es-pa': { flag: '🇵🇦', label: 'Испанский (Панама)' },
  'es-pe': { flag: '🇵🇪', label: 'Испанский (Перу)' },
  'es-pr': { flag: '🇵🇷', label: 'Испанский (Пуэрто-Рико)' },
  'es-py': { flag: '🇵🇾', label: 'Испанский (Парагвай)' },
  'es-sv': { flag: '🇸🇻', label: 'Испанский (Сальвадор)' },
  'es-uy': { flag: '🇺🇾', label: 'Испанский (Уругвай)' },
  'es-ve': { flag: '🇻🇪', label: 'Испанский (Венесуэла)' },
  et: { flag: '🇪🇪', label: 'Эстонский' },
  fa: { flag: '🇮🇷', label: 'Персидский' },
  fi: { flag: '🇫🇮', label: 'Финский' },
  fil: { flag: '🇵🇭', label: 'Филиппинский' },
  fr: { flag: '🇫🇷', label: 'Французский' },
  ga: { flag: '🇮🇪', label: 'Ирландский' },
  gn: { flag: '🇵🇾', label: 'Гуарани' },
  gu: { flag: '🇮🇳', label: 'Гуджарати' },
  he: { flag: '🇮🇱', label: 'Иврит' },
  hi: { flag: '🇮🇳', label: 'Хинди' },
  hr: { flag: '🇭🇷', label: 'Хорватский' },
  ht: { flag: '🇭🇹', label: 'Гаитянский креольский' },
  hu: { flag: '🇭🇺', label: 'Венгерский' },
  hy: { flag: '🇦🇲', label: 'Армянский' },
  id: { flag: '🇮🇩', label: 'Индонезийский' },
  it: { flag: '🇮🇹', label: 'Итальянский' },
  ja: { flag: '🇯🇵', label: 'Японский' },
  ka: { flag: '🇬🇪', label: 'Грузинский' },
  kk: { flag: '🇰🇿', label: 'Казахский' },
  km: { flag: '🇰🇭', label: 'Кхмерский' },
  kn: { flag: '🇮🇳', label: 'Каннада' },
  ko: { flag: '🇰🇷', label: 'Корейский' },
  ky: { flag: '🇰🇬', label: 'Киргизский' },
  lo: { flag: '🇱🇦', label: 'Лаосский' },
  lt: { flag: '🇱🇹', label: 'Литовский' },
  lv: { flag: '🇱🇻', label: 'Латышский' },
  ml: { flag: '🇮🇳', label: 'Малаялам' },
  mn: { flag: '🇲🇳', label: 'Монгольский' },
  mr: { flag: '🇮🇳', label: 'Маратхи' },
  ms: { flag: '🇲🇾', label: 'Малайский' },
  mt: { flag: '🇲🇹', label: 'Мальтийский' },
  multi: { flag: '🌐', label: 'Мультиязычный' },
  my: { flag: '🇲🇲', label: 'Бирманский' },
  ne: { flag: '🇳🇵', label: 'Непальский' },
  nl: { flag: '🇳🇱', label: 'Нидерландский' },
  pa: { flag: '🇮🇳', label: 'Панджаби' },
  pl: { flag: '🇵🇱', label: 'Польский' },
  'pt-br': { flag: '🇧🇷', label: 'Португальский (Бразилия)' },
  pt: { flag: '🇵🇹', label: 'Португальский' },
  ps: { flag: '🇦🇫', label: 'Пушту' },
  qu: { flag: '🇵🇪', label: 'Кечуа' },
  ro: { flag: '🇷🇴', label: 'Румынский' },
  ru: { flag: '🇷🇺', label: 'Русский' },
  si: { flag: '🇱🇰', label: 'Сингальский' },
  sk: { flag: '🇸🇰', label: 'Словацкий' },
  sl: { flag: '🇸🇮', label: 'Словенский' },
  sv: { flag: '🇸🇪', label: 'Шведский' },
  ta: { flag: '🇮🇳', label: 'Тамильский' },
  te: { flag: '🇮🇳', label: 'Телугу' },
  tg: { flag: '🇹🇯', label: 'Таджикский' },
  th: { flag: '🇹🇭', label: 'Тайский' },
  tl: { flag: '🇵🇭', label: 'Тагальский' },
  tr: { flag: '🇹🇷', label: 'Турецкий' },
  uk: { flag: '🇺🇦', label: 'Украинский' },
  ur: { flag: '🇵🇰', label: 'Урду' },
  uz: { flag: '🇺🇿', label: 'Узбекский' },
  vi: { flag: '🇻🇳', label: 'Вьетнамский' },
  zh: { flag: '🇨🇳', label: 'Китайский' },
  'zh-cn': { flag: '🇨🇳', label: 'Китайский (КНР)' },
  'zh-hans': { flag: '🇨🇳', label: 'Китайский (упрощённый)' },
  'zh-hant': { flag: '🇹🇼', label: 'Китайский (традиционный)' },
  'zh-hk': { flag: '🇭🇰', label: 'Китайский (Гонконг)' },
  'zh-sg': { flag: '🇸🇬', label: 'Китайский (Сингапур)' },
  'zh-tw': { flag: '🇹🇼', label: 'Китайский (Тайвань)' },
};

const LANGUAGE_ALIASES: Record<string, string> = {
  'en-au': 'en',
  'en-ca': 'en',
  'en-gb': 'en',
  'en-ie': 'en',
  'en-in': 'en',
  'en-mt': 'en',
  'en-nz': 'en',
  'en-ph': 'en',
  'en-sg': 'en',
  'en-us': 'en',
  'es-419': 'es-419',
  'es-la': 'es-419',
  'fr-be': 'fr',
  'fr-ca': 'fr',
  'fr-ch': 'fr',
  iw: 'he',
  'nl-be': 'nl',
  'pt-pt': 'pt',
  'tl-ph': 'tl',
  'zh-mo': 'zh-hant',
};

function splitLanguageTokens(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeLanguageCode(languageCode: string): string {
  const cleaned = languageCode.trim().toLowerCase().replace(/_/g, '-');
  if (!cleaned) {
    return '';
  }

  const aliased = LANGUAGE_ALIASES[cleaned];
  if (aliased) {
    return aliased;
  }

  if (LANGUAGE_METADATA[cleaned]) {
    return cleaned;
  }

  const baseCode = cleaned.split('-')[0];
  if (LANGUAGE_METADATA[baseCode]) {
    return baseCode;
  }

  return cleaned;
}

export function parseLanguageCodes(rawLanguages: string | null | undefined): string[] {
  if (!rawLanguages) {
    return [];
  }

  let values: string[] = [];

  try {
    const parsed = JSON.parse(rawLanguages);
    if (Array.isArray(parsed)) {
      values = parsed.flatMap((language) => splitLanguageTokens(String(language)));
    } else if (typeof parsed === 'string') {
      values = splitLanguageTokens(parsed);
    }
  } catch {
    values = splitLanguageTokens(rawLanguages);
  }

  const normalized = values.map(normalizeLanguageCode).filter(Boolean);
  return [...new Set(normalized)];
}

export function getLanguagePresentation(languageCode: string): LanguagePresentation {
  const normalizedCode = normalizeLanguageCode(languageCode);
  const metadata = LANGUAGE_METADATA[normalizedCode];
  const fallbackCode = normalizedCode || languageCode.trim().toUpperCase();

  if (!metadata) {
    return {
      code: languageCode,
      normalizedCode: fallbackCode,
      flag: '🏳️',
      label: fallbackCode.toUpperCase(),
      badgeLabel: `🏳️ ${fallbackCode.toUpperCase()}`,
      optionLabel: `🏳️ ${fallbackCode.toUpperCase()}`,
    };
  }

  return {
    code: languageCode,
    normalizedCode,
    flag: metadata.flag,
    label: metadata.label,
    badgeLabel: `${metadata.flag} ${metadata.label}`,
    optionLabel: `${metadata.flag} ${metadata.label} (${normalizedCode.toUpperCase()})`,
  };
}