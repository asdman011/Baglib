import { matchesStudyQuery, splitRelation, studyLinkText, type StudyNote } from './study-notes';

export interface StudyLinkOption { kind: 'note' | 'book' | 'quran'; label: string; target: string; text: string }

const toLatinDigits = (value: string) => value.replace(/[٠-٩]/gu, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));

/**
 * Suggestions shown after typing `[[` in a note: local notes and books by title or alias,
 * and an ayah when the query looks like `2:255` (Arabic-Indic digits accepted).
 */
export function studyLinkOptions(query: string, notes: Pick<StudyNote, 'id' | 'title' | 'aliases'>[], books: { id: string; title: string }[], limit = 20): StudyLinkOption[] {
  const options: StudyLinkOption[] = [];
  const add = (kind: StudyLinkOption['kind'], target: string, label: string) => {
    const text = studyLinkText(target, label);
    if (text) options.push({ kind, label, target, text });
  };
  const ayah = /^\s*(\d{1,3})\s*[:：.]\s*(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?\s*$/u.exec(toLatinDigits(query));
  if (ayah) {
    const range = ayah[3] ? `${+ayah[2]}-${+ayah[3]}` : `${+ayah[2]}`;
    add('quran', `quran:hafs:${+ayah[1]}:${range}`, `${+ayah[1]}:${range}`);
  }
  // `title#12` (or `title #١٢`) links a page of the book.
  const paged = /^(.*?)\s*#\s*(\d{1,6})\s*$/u.exec(toLatinDigits(query));
  if (paged && +paged[2] >= 1) {
    for (const book of books) {
      if (options.length >= limit) break;
      if (!paged[1].trim() || matchesStudyQuery(book.title, paged[1].trim())) add('book', `book:${book.id}#p=${+paged[2]}`, `${book.title} (${+paged[2]})`);
    }
    return options.slice(0, limit);
  }
  const trimmed = query.trim();
  for (const note of notes) {
    if (options.length >= limit) break;
    if (!trimmed || matchesStudyQuery([note.title, ...note.aliases].join(' '), trimmed)) add('note', `note:${note.id}`, note.title || note.id);
  }
  for (const book of books) {
    if (options.length >= limit) break;
    if (!trimmed || matchesStudyQuery(book.title, trimmed)) add('book', `book:${book.id}`, book.title);
  }
  return options.slice(0, limit);
}

/**
 * The open `[[query` immediately before the cursor, if any. `[[supports::query` searches for `query`, and
 * `relation` holds the typed relationship so the chosen link keeps it.
 */
export function openStudyLink(beforeCursor: string): { from: number; query: string; relation?: string } | null {
  // A leading `!` stays in place, so `![[` completes to an embed.
  const match = /\[\[([^\[\]\n|]{0,80})$/u.exec(beforeCursor);
  if (!match) return null;
  const { relation, target } = splitRelation(match[1]);
  return relation ? { from: match.index, query: target, relation } : { from: match.index, query: match[1] };
}

/** A completed link (`[[target|label]]`) with the typed relationship put back in front of its target. */
export function withRelation(text: string, relation?: string): string {
  return relation ? text.replace(/^(!?)\[\[/u, `$1[[${relation}::`) : text;
}
