import React from "react";

import cs from "./cs";
import en from "./en";

export type LocaleKey = "en" | "cs";
export type Messages = typeof en;

export type HotkeySectionCopy = {
  title: string;
  items: { shortcut: string; action: string; description: string }[];
};

export type PaletteActionCopy = {
  label: string;
  description: string;
  shortcut?: string;
};

export const DEFAULT_LOCALE: LocaleKey = "en";
export const SUPPORTED_LOCALES: LocaleKey[] = ["en", "cs"];

const LOCALE_MAP: Record<LocaleKey, Messages> = {
  en,
  cs,
};

export const resolveLocale = (value?: string | null): LocaleKey => (value === "cs" ? "cs" : "en");

const interpolate = (value: string, params?: Record<string, string | number>) =>
  value.replace(/\{\{(.*?)\}\}/g, (_, key) => String(params?.[key.trim()] ?? ""));

export type Translator = (path: string, params?: Record<string, string | number>) => string;

export const makeTranslator = (messages: Messages): Translator => (path, params) => {
  const segments = path.split(".");
  let current: any = messages;

  for (const segment of segments) {
    if (current && typeof current === "object" && segment in current) {
      current = current[segment as keyof typeof current];
    } else {
      return path;
    }
  }

  if (typeof current === "string") return interpolate(current, params);
  return path;
};

export interface I18nContextValue {
  locale: LocaleKey;
  messages: Messages;
  t: Translator;
  setLocale?: (next: LocaleKey) => void;
}

export const I18nContext = React.createContext<I18nContextValue>({
  locale: DEFAULT_LOCALE,
  messages: en,
  t: (key) => key,
});

export const useI18n = () => React.useContext(I18nContext);

export const getMessages = (locale: LocaleKey): Messages => LOCALE_MAP[locale] ?? en;
