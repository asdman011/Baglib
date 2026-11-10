import type { TranslationKey } from '../translations';

type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;

/**
 * "1 task", "2 tasks" / «مهمة واحدة», «مهمتان», «٣ مهام», «١١ مهمة» (KEY-308).
 * Arabic needs its own forms for two, 3–10 and 11+, so one "{count} tasks" string cannot cover it.
 */
export function taskCountLabel(count: number, lang: string, t: Translate): string {
  const form = new Intl.PluralRules(lang).select(count);
  const key: TranslationKey = form === 'one' ? 'taskCountOne' : form === 'two' ? 'taskCountTwo' : form === 'few' ? 'taskCountFew' : 'taskCountOther';
  return t(key, { count });
}
