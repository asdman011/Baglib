import { translations } from '../renderer/translations';
import type { DhikrReminder } from './notifications';
export function notificationMinutes(count: number, language: 'ar' | 'en'): string {
  const text = translations[language];
  const forms = { zero: text.notificationMinutesZero, one: text.notificationMinutesOne, two: text.notificationMinutesTwo, few: text.notificationMinutesFew, many: text.notificationMinutesMany, other: text.notificationMinutesOther };
  return forms[new Intl.PluralRules(language).select(count)].replace('{count}', new Intl.NumberFormat(language).format(count));
}
export function dhikrTitle(reminder: DhikrReminder, language: 'ar' | 'en'): string {
  const text = translations[language];
  return { morning: text.notificationMorning, evening: text.notificationEvening, afterPrayer: text.notificationAfterPrayer, custom: reminder.title || text.notificationCustom }[reminder.kind];
}
