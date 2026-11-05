// Interface strings, in the reader's language. `t()` reads reactive state, so
// any template or $derived that calls it updates when the language changes.
// English is the reference catalogue; every other one must have its keys.

import en from './en';

export type MessageKey = keyof typeof en;
type PluralForms = {
  one: string;
  other: string;
  zero?: string;
  two?: string;
  few?: string;
  many?: string;
};
export type Messages = {
  [K in MessageKey]: (typeof en)[K] extends string ? string : PluralForms;
};

export const LOCALES = ['en', 'es', 'fr', 'de'] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
};

const loaders: Record<Exclude<Locale, 'en'>, () => Promise<{ default: Messages }>> = {
  es: () => import('./es'),
  fr: () => import('./fr'),
  de: () => import('./de'),
};

let state = $state.raw<{ locale: Locale; messages: Messages }>({
  locale: 'en',
  messages: en as Messages,
});

export type Params = Record<string, string | number>;
export type Translate = (key: MessageKey, params?: Params) => string;

function format(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m));
}

export function translateWith(messages: Messages, locale: Locale): Translate {
  const rules = new Intl.PluralRules(locale);
  return (key, params) => {
    const msg = messages[key] ?? (en as Messages)[key];
    if (typeof msg === 'string') return format(msg, params);
    const form = rules.select(Number(params?.count ?? 0)) as keyof PluralForms;
    return format(msg[form] ?? msg.other, params);
  };
}

let translate = translateWith(en as Messages, 'en');

export const t: Translate = (key, params) => {
  void state.messages;
  return translate(key, params);
};

export function locale(): Locale {
  return state.locale;
}

export function detectLocale(languages: readonly string[] = typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language])): Locale {
  for (const lang of languages) {
    const base = lang.toLowerCase().split('-')[0] as Locale;
    if (LOCALES.includes(base)) return base;
  }
  return 'en';
}

export async function setLocale(next: Locale | 'system'): Promise<void> {
  const target = next === 'system' ? detectLocale() : next;
  const messages = target === 'en' ? (en as Messages) : (await loaders[target]()).default;
  translate = translateWith(messages, target);
  state = { locale: target, messages };
  document.documentElement.lang = target;
}
