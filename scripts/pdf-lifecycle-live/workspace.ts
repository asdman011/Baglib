import { translations } from '../../src/renderer/translations';
export function useWorkspace() {
  const lang = new URLSearchParams(location.search).get('lang') === 'ar' ? 'ar' : 'en';
  return { lang, dir: lang === 'ar' ? 'rtl' : 'ltr', t: (key: string) => translations[lang][key as keyof typeof translations.en] ?? key };
}
