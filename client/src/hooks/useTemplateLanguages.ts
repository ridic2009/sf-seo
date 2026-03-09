import { useMemo } from 'react';
import { getLanguagePresentation, parseLanguageCodes } from '../utils/languagePresentation';

export function parseTemplateLanguages(rawLanguages: string | null | undefined): string[] {
  return parseLanguageCodes(rawLanguages);
}

export function formatTemplateLanguages(rawLanguages: string | null | undefined): string {
  return parseTemplateLanguages(rawLanguages).join(', ');
}

export function useTemplateLanguages(rawLanguages: string | null | undefined) {
  return useMemo(() => parseTemplateLanguages(rawLanguages), [rawLanguages]);
}

export function useTemplateLanguagePresentation(rawLanguages: string | null | undefined) {
  return useMemo(() => parseTemplateLanguages(rawLanguages).map(getLanguagePresentation), [rawLanguages]);
}