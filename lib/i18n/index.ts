import { en } from "./en";
import { zh } from "./zh";
import { translatePhraseToEnglish } from "./phrases";

export type Language = "en" | "zh";
export type I18nKey = keyof typeof en;
export type I18nParams = Record<string, string | number | null | undefined>;

export const DEFAULT_LANGUAGE: Language = "zh";

const dictionaries = { en, zh } satisfies Record<Language, Record<I18nKey, string>>;

export function normalizeLanguage(value: unknown): Language {
  if (value === "en" || value === "zh") return value;
  return DEFAULT_LANGUAGE;
}

export function interpolate(template: string, params?: I18nParams) {
  if (!params) return template;
  return template.replace(/(?<!\{)\{(\w+)\}(?!\})/g, (_, key: string) => String(params[key] ?? ""));
}

export function tFor(language: unknown, key: I18nKey, params?: I18nParams) {
  const lang = normalizeLanguage(language);
  const template = dictionaries[lang][key] ?? en[key] ?? key;
  return interpolate(template, params);
}

export function translateSystemText(language: unknown, text: string) {
  if (normalizeLanguage(language) !== "en") return text;
  return translatePhraseToEnglish(text);
}

export function translateJsonMessages<T>(language: unknown, value: T): T {
  if (normalizeLanguage(language) !== "en" || !value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => translateJsonMessages(language, item)) as T;
  const copy: Record<string, unknown> = { ...(value as Record<string, unknown>) };
  for (const field of ["error", "message", "title", "body"]) {
    if (typeof copy[field] === "string") copy[field] = translateSystemText(language, copy[field] as string);
  }
  return copy as T;
}
