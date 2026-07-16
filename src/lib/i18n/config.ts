/**
 * i18n/config.ts — Supported languages.
 * First entry is the base language (English).
 * Adding a language = adding one entry + one dictionary folder.
 */
export interface Language {
  code: string;
  label: string;
}

export const SUPPORTED_LANGUAGES: Language[] = [
  { code: "en", label: "EN" },
  // Add more languages here, e.g.:
  // { code: "zh", label: "ZH" },
  // { code: "es", label: "ES" },
];

export const BASE_LANGUAGE = SUPPORTED_LANGUAGES[0].code;

export function getLanguage(code: string): Language | undefined {
  return SUPPORTED_LANGUAGES.find((l) => l.code === code);
}
