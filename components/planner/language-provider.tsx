'use client';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from 'react';
import type { ReactNode } from 'react';
import {
  createTranslator,
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  normalizeLocale,
  readLocale,
  saveLocale,
} from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { getAnnaRuntime, isAnna, annaError } from '@/lib/anna-runtime';

const CHANGE_EVENT = 'evening-bell-language-change';
let sessionLocale: Locale | undefined;
let languageWrites: Promise<unknown> = Promise.resolve();
export async function initializeAnnaLanguage() {
  const saved = await getAnnaRuntime().storage.get({ key: LOCALE_STORAGE_KEY });
  sessionLocale = normalizeLocale(saved.value);
}
function getSnapshot(): Locale {
  if (sessionLocale) return sessionLocale;
  if (isAnna()) return DEFAULT_LOCALE;
  try {
    return readLocale(window.localStorage);
  } catch {
    return DEFAULT_LOCALE;
  }
}
function subscribe(listener: () => void) {
  const sync = (event: StorageEvent) => {
    if (event.key === LOCALE_STORAGE_KEY || event.key === null) {
      sessionLocale = normalizeLocale(event.newValue);
      listener();
    }
  };
  window.addEventListener('storage', sync);
  window.addEventListener(CHANGE_EVENT, listener);
  return () => {
    window.removeEventListener('storage', sync);
    window.removeEventListener(CHANGE_EVENT, listener);
  };
}
function setLocale(value: Locale) {
  sessionLocale = normalizeLocale(value);
  if (isAnna()) {
    const nextLocale = sessionLocale;
    languageWrites = languageWrites
      .catch(() => {})
      .then(() =>
        getAnnaRuntime().storage.set({
          key: LOCALE_STORAGE_KEY,
          value: nextLocale,
        }),
      )
      .catch((error) => {
        window.dispatchEvent(
          new CustomEvent('evening-bell-storage-error', {
            detail: annaError(error, nextLocale),
          }),
        );
      });
  } else
    try {
      saveLocale(sessionLocale, window.localStorage);
    } catch {}
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
const LanguageContext = createContext({ locale: DEFAULT_LOCALE, setLocale });

export function LanguageProvider({ children }: { children: ReactNode }) {
  // The server and hydration render agree; saved preferences are read by React
  // immediately after hydration, without remounting forms or the active timer.
  const locale = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => DEFAULT_LOCALE,
  );
  useEffect(() => {
    document.documentElement.lang = locale;
    const tr = createTranslator(locale);
    document.title = tr('晚钟 · 让每一小步都有方向');
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute(
        'content',
        tr('根据每天的时间与精力安排目标，用番茄钟专注，用温和的陪伴坚持。'),
      );
  }, [locale]);
  const context = useMemo(() => ({ locale, setLocale }), [locale]);
  return (
    <LanguageContext.Provider value={context}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(LanguageContext);
  const tr = useMemo(() => createTranslator(context.locale), [context.locale]);
  return { ...context, tr };
}
