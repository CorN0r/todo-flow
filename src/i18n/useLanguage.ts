import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { getRepositories } from '../domain/repositories/current';
import type { Language } from './index';

export function useLanguage() {
  const { i18n } = useTranslation();

  const changeLanguage = useCallback(async (lang: Language) => {
    await i18n.changeLanguage(lang);
    getRepositories().settings.set('language', lang).catch(() => {});
  }, [i18n]);

  const loadSavedLanguage = useCallback(async () => {
    try {
      const saved = await getRepositories().settings.get('language');
      if (saved && (saved === 'zh-CN' || saved === 'en-US')) {
        await i18n.changeLanguage(saved);
      }
    } catch {}
  }, [i18n]);

  return { language: i18n.language as Language, changeLanguage, loadSavedLanguage };
}
