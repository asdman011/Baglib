/** Commands offered after typing `/` at the start of a line or after a space in a note. */
export type SlashCommandId = 'link' | 'quran' | 'hadith' | 'poem' | 'card' | 'heading' | 'quote' | 'list' | 'date' | 'salla' | 'azza' | 'radiyaHu' | 'radiyaHa' | 'rahimahu' | 'subhanahu';

export interface SlashCommand {
  id: SlashCommandId;
  /** Words matched against what follows `/`, in English and Arabic, so either works in either interface language. */
  keywords: string;
  /** Text inserted in place of `/query`; `date` is filled in when applied. */
  insert: string;
}

export const SLASH_COMMANDS: readonly SlashCommand[] = [
  { id: 'link', keywords: 'link note notes paragraph book page رابط ملاحظة ملاحظات فقرة كتاب صفحة', insert: '[[' },
  // These three open a search and insert the text itself with its reference, not only a link.
  { id: 'quran', keywords: 'quran ayah verse قرآن قران آية اية', insert: '[[' },
  { id: 'hadith', keywords: 'hadith sunnah حديث سنة', insert: '[[' },
  { id: 'poem', keywords: 'poem poetry bayt verse شعر بيت قصيدة', insert: '[[' },
  // Makes review cards from the line it is typed on; inserts nothing but a #card tag.
  { id: 'card', keywords: 'card flashcard srs cloze review بطاقة مراجعة حفظ', insert: '' },
  { id: 'heading', keywords: 'heading title عنوان', insert: '## ' },
  { id: 'quote', keywords: 'quote اقتباس نص', insert: '> ' },
  { id: 'list', keywords: 'list bullet قائمة', insert: '- ' },
  { id: 'date', keywords: 'date today تاريخ اليوم', insert: '' },
  { id: 'salla', keywords: 'salla pbuh saw prophet صلى صلي النبي', insert: 'ﷺ' },
  { id: 'azza', keywords: 'azza jalla عز وجل', insert: 'عز وجل' },
  { id: 'subhanahu', keywords: 'subhanahu swt سبحانه تعالى', insert: 'سبحانه وتعالى' },
  { id: 'radiyaHu', keywords: 'radiya ra رضي عنه', insert: 'رضي الله عنه' },
  { id: 'radiyaHa', keywords: 'radiya ra رضي عنها', insert: 'رضي الله عنها' },
  { id: 'rahimahu', keywords: 'rahimahu rahimahullah رحمه', insert: 'رحمه الله' },
];

const fold = (value: string) => value.normalize('NFKD').replace(/[ً-ٰٟ]/gu, '').replace(/[أإآ]/gu, 'ا').toLowerCase();

/** The open `/query` immediately before the cursor, when it starts a line or follows a space. */
export function openSlashCommand(beforeCursor: string): { from: number; query: string } | null {
  const match = /(^|\s)\/([\p{L}\p{N}-]{0,24})$/u.exec(beforeCursor);
  return match ? { from: match.index + match[1].length, query: match[2] } : null;
}

export function matchSlashCommands(query: string, labels: Partial<Record<SlashCommandId, string>> = {}): SlashCommand[] {
  const needle = fold(query.trim());
  if (!needle) return [...SLASH_COMMANDS];
  return SLASH_COMMANDS.filter(command => fold(`${command.keywords} ${labels[command.id] || ''}`).split(/\s+/u).some(word => word.startsWith(needle)));
}
