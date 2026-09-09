import { messages } from './messages.ts';

export type Locale = 'en' | 'zh-CN';
export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_STORAGE_KEY = 'evening-bell.language';

export function normalizeLocale(value: unknown): Locale {
  return value === 'zh' || value === 'zh-CN' ? 'zh-CN' : DEFAULT_LOCALE;
}

export function readLocale(storage?: Pick<Storage, 'getItem'>): Locale {
  try {
    return normalizeLocale(storage?.getItem(LOCALE_STORAGE_KEY));
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function saveLocale(
  locale: Locale,
  storage?: Pick<Storage, 'setItem'>,
): void {
  try {
    storage?.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // The current session can still switch languages if storage is blocked.
  }
}

const reverse = new Map(
  Object.entries(messages)
    .filter(([, en]) => en)
    .map(([zh, en]) => [en, zh]),
);
const escapePattern = (text: string) =>
  text.replace(/[.*+?^$()|[\]\\]/g, '\\$&');

function templatePattern(template: string) {
  const slots: number[] = [];
  let pattern = '',
    cursor = 0;
  for (const match of template.matchAll(/\{(\d+)\}/g)) {
    pattern +=
      escapePattern(template.slice(cursor, match.index)) + '([\\s\\S]*?)';
    slots.push(Number(match[1]));
    cursor = match.index! + match[0].length;
  }
  return {
    regex: new RegExp(
      '^' + pattern + escapePattern(template.slice(cursor)) + '$',
    ),
    slots,
  };
}

// Only system messages are passed here. Templates keep dynamic user content
// intact; no search-and-replace is performed inside a task or goal name.
const templates = Object.entries(messages)
  .filter(
    ([zh, en]) =>
      /\{\d+\}/.test(zh) &&
      zh.replace(/\{\d+\}/g, '').trim().length >= 4 &&
      en.replace(/\{\d+\}/g, '').trim().length >= 4,
  )
  .sort(
    (a, b) =>
      b[0].replace(/\{\d+\}/g, '').length - a[0].replace(/\{\d+\}/g, '').length,
  )
  .map(([zh, en]) => ({
    zh,
    en,
    chinese: templatePattern(zh),
    english: templatePattern(en),
  }));

function interpolate(
  template: string,
  values: readonly (string | number | boolean | null | undefined)[],
) {
  return template.replace(/\{(\d+)\}/g, (placeholder, index) =>
    Number(index) < values.length
      ? String(values[Number(index)] ?? '')
      : placeholder,
  );
}

export function translate(
  message: string,
  locale: Locale = DEFAULT_LOCALE,
  values?: readonly (string | number | boolean | null | undefined)[],
): string {
  if (values)
    return interpolate(
      locale === 'zh-CN' ? message : (messages[message] ?? message),
      values,
    );
  if (Object.hasOwn(messages, message))
    return locale === 'zh-CN' ? message : messages[message];
  const original = reverse.get(message);
  if (original !== undefined) return locale === 'zh-CN' ? original : message;

  // Scheduling reasons consist of fixed system prefixes followed by a rule or
  // AI-authored explanation. Only the fixed prefixes are localized.
  for (const prefix of ['每日习惯 · ', '优先目标 · ', '适合当前精力 · ']) {
    const en = messages[prefix];
    if (message.startsWith(prefix))
      return (
        (locale === 'zh-CN' ? prefix : en) +
        translate(message.slice(prefix.length), locale)
      );
    if (message.startsWith(en))
      return (
        (locale === 'zh-CN' ? prefix : en) +
        translate(message.slice(en.length), locale)
      );
  }

  for (const item of templates) {
    const pattern = locale === 'en' ? item.chinese : item.english;
    const match = message.match(pattern.regex);
    if (!match) continue;
    const params: string[] = [];
    pattern.slots.forEach((slot, index) => {
      params[slot] = match[index + 1];
    });
    // These two slots contain known system phrases, never user-entered names.
    if (item.zh === '「{0}」留待后续：{1}。')
      params[1] = translate(params[1], locale);
    if (item.zh === '按{0}估算，共享时间预算{1}') {
      params[0] = translate(params[0], locale);
      params[1] = translate(params[1], locale);
    }
    return interpolate(locale === 'en' ? item.en : item.zh, params);
  }
  return message;
}

export function createTranslator(locale: Locale) {
  return (
    message: string,
    values?: readonly (string | number | boolean | null | undefined)[],
  ) => translate(message, locale, values);
}
