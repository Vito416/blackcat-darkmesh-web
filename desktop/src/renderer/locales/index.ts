import React from "react";

import en, { type Messages } from "./en";
export type { Messages } from "./en";

export type LocaleKey = "en" | "cs" | "es" | "de";
export type HotkeyScope = "global" | "studio" | "ao" | "data" | "preview" | "palette";
export type HotkeyTarget =
  | "workspaces"
  | "theme"
  | "effects"
  | "offline"
  | "health"
  | "wizard"
  | "vault"
  | "drafts"
  | "preview"
  | "language"
  | "palette";

export type HotkeySectionCopy = {
  id: string;
  title: string;
  scope: HotkeyScope;
  items: { shortcut: string; action?: string; label?: string; description: string; target?: HotkeyTarget }[];
};

export type PaletteActionCopy = {
  label: string;
  description: string;
  shortcut?: string;
};

export const DEFAULT_LOCALE: LocaleKey = "en";
export const SUPPORTED_LOCALES: LocaleKey[] = ["en", "cs", "es", "de"];
export const FALLBACK_MESSAGES = en;

type LocaleLoader = () => Promise<{ default: Messages }>;

const LOCALE_LOADERS: Record<LocaleKey, LocaleLoader> = {
  en: () => Promise.resolve({ default: en }),
  cs: () => import("./cs"),
  es: () => import("./es"),
  de: () => import("./de"),
};

const messagesCache = new Map<LocaleKey, Promise<Messages>>();

export const resolveLocale = (value?: string | null): LocaleKey => {
  const normalized = (value ?? "").toLowerCase();
  const direct = normalized as LocaleKey;
  if (SUPPORTED_LOCALES.includes(direct)) return direct;
  const short = normalized.slice(0, 2) as LocaleKey;
  return SUPPORTED_LOCALES.includes(short) ? short : DEFAULT_LOCALE;
};

export const loadMessages = (locale: LocaleKey): Promise<Messages> => {
  const normalized = resolveLocale(locale);

  if (!messagesCache.has(normalized)) {
    const loader = LOCALE_LOADERS[normalized] ?? LOCALE_LOADERS[DEFAULT_LOCALE];
    messagesCache.set(
      normalized,
      loader()
        .then((mod) => mod?.default ?? FALLBACK_MESSAGES)
        .catch(() => FALLBACK_MESSAGES),
    );
  }

  return messagesCache.get(normalized)!;
};

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
