'use client';
import { Languages } from 'lucide-react';
import { useI18n } from './language-provider';
import { normalizeLocale } from '@/lib/i18n';

export function LanguageSwitcher() {
  const { locale, setLocale, tr } = useI18n();
  return (
    <label className="language-switcher">
      <Languages size={17} aria-hidden="true" />
      <span className="sr-only">{tr('语言')}</span>
      <select
        aria-label="Language / 语言"
        value={locale}
        onChange={(event) => setLocale(normalizeLocale(event.target.value))}
      >
        <option value="en" lang="en">
          English
        </option>
        <option value="zh-CN" lang="zh-CN">
          简体中文
        </option>
      </select>
    </label>
  );
}
