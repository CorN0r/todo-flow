import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import zhCN from './locales/zh-CN.json';
import enUS from './locales/en-US.json';

export const LANGUAGES = [
  { code: 'zh-CN', label: '简体中文' },
  { code: 'en-US', label: 'English' },
] as const;

export type Language = (typeof LANGUAGES)[number]['code'];

i18n.use(initReactI18next).init({
  resources: {
    'zh-CN': { translation: zhCN },
    'en-US': { translation: enUS },
  },
  lng: 'zh-CN',
  fallbackLng: 'zh-CN',
  interpolation: { escapeValue: false },
});

export default i18n;
