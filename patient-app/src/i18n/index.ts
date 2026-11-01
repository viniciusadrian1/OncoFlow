import { useSyncExternalStore } from "react";
import { appEnglishTranslations } from "./app.en";
import { liaEnglishTranslations } from "./lia.en";

export type AppLocale = "pt-BR" | "en-US";
export type TranslationVariables = Record<string, string | number>;
const storageKey = "oncoflow-locale";
const dictionaries: Record<AppLocale, Record<string, string>> = {
  "pt-BR": {},
  "en-US": { ...appEnglishTranslations, ...liaEnglishTranslations },
};
const listeners = new Set<() => void>();
let locale: AppLocale = readLocale();

function readLocale(): AppLocale {
  try {
    return globalThis.localStorage?.getItem(storageKey) === "en-US"
      ? "en-US"
      : "pt-BR";
  } catch {
    return "pt-BR";
  }
}

function updateDocumentLanguage() {
  if (typeof document !== "undefined") document.documentElement.lang = locale;
}
updateDocumentLanguage();

export function getLocale(): AppLocale {
  return locale;
}

export function setLocale(next: AppLocale): void {
  if (next !== "pt-BR" && next !== "en-US") return;
  try {
    globalThis.localStorage?.setItem(storageKey, next);
  } catch {
    // The selection remains available in memory when storage is unavailable.
  }
  const changed = locale !== next;
  locale = next;
  updateDocumentLanguage();
  if (changed) listeners.forEach((listener) => listener());
}

export function registerTranslations(
  target: AppLocale,
  entries: Record<string, string>,
): void {
  Object.assign(dictionaries[target], entries);
}

export function translate(
  text: string,
  variables: TranslationVariables = {},
  target: AppLocale = getLocale(),
): string {
  const dictionary = dictionaries[target];
  const translated = dictionary[text.trim()];
  const template =
    dictionary[text] ??
    (translated === undefined ? text : text.replace(text.trim(), translated));
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.hasOwn(variables, key) ? String(variables[key]) : match,
  );
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useI18n() {
  const current = useSyncExternalStore(
    subscribe,
    getLocale,
    () => "pt-BR" as AppLocale,
  );
  return {
    locale: current,
    setLocale,
    t: (text: string, variables?: TranslationVariables) =>
      translate(text, variables, current),
  };
}
