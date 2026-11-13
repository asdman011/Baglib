import { SUNNAH_COLLECTION_IDS, SUNNAH_SOURCE_BOOK_IDS } from './types/sunnah';
import { normalizeArabicText } from './utils/text-normalizer';

export function matchesStudyQuery(text: string, query: string): boolean {
  const normalize = (value: string) => normalizeArabicText(value, { normalizeTaaMarbuta: false }).toLowerCase();
  const haystack = normalize(text);
  return normalize(query).split(/\s+/u).filter(Boolean).every(term => haystack.includes(term));
}

export interface StudyNote {
  kind?: string;
  sourceRef?: string;
  revision?: number;
  id: string;
  title: string;
  content: string;
  aliases: string[];
  tags: string[];
  workId?: string;
  knowledgeId?: string;
  createdAt: string;
  updatedAt: string;
}
export type StudyNoteInput = Pick<StudyNote, 'title' | 'content' | 'aliases' | 'tags'> & { id?: string; workId?: string; expectedRevision?: number };
export interface StudyNotesAPI {
  list(): Promise<StudyNote[]>;
  save(note: StudyNoteInput): Promise<StudyNote>;
  remove(id: string): Promise<void>;
}
/**
 * A link may name how the note relates to its target, inside the link text (decision S4):
 * `[[supports::note:abc|label]]` or, in Arabic, `[[يؤيد::quran:hafs:2:153|…]]`. Known names map to one key;
 * any other single word is kept as written, so a reader can coin their own relationship.
 */
export interface StudyLink { target: string; label: string; embed: boolean; start: number; end: number; relation?: string }
export const STUDY_RELATIONS = ['supports', 'refutes', 'explains', 'answers', 'example', 'contrasts', 'questions'] as const;
export type StudyRelation = typeof STUDY_RELATIONS[number];
const RELATION_NAMES: Record<string, StudyRelation> = {
  supports: 'supports', support: 'supports', 'يؤيد': 'supports', 'يدعم': 'supports',
  refutes: 'refutes', refute: 'refutes', 'يرد': 'refutes', 'ينقض': 'refutes',
  explains: 'explains', explain: 'explains', 'يشرح': 'explains', 'يفسر': 'explains',
  answers: 'answers', answer: 'answers', 'يجيب': 'answers',
  example: 'example', 'مثال': 'example',
  contrasts: 'contrasts', contrast: 'contrasts', 'يخالف': 'contrasts',
  questions: 'questions', question: 'questions', 'يسأل': 'questions',
};
const RELATION_WORD = /^[\p{L}\p{M}\p{N}_-]{1,24}$/u;
// Matching ignores case, tashkeel and hamza/alef forms, the same way note search does.
const relationKey = (value: string) => normalizeArabicText(value.trim(), { normalizeTaaMarbuta: false }).toLowerCase();
const RELATION_LOOKUP = new Map(Object.entries(RELATION_NAMES).map(([name, key]) => [relationKey(name), key]));
/** The key for a typed relationship name: a known one in English or Arabic, or the word itself as written. */
export function studyRelation(name: string): string | undefined {
  const word = name.trim();
  if (!RELATION_WORD.test(word)) return undefined;
  return RELATION_LOOKUP.get(relationKey(word)) ?? word;
}
/** Known relationship names that start with what was typed (for suggestions after `[[`). */
export function matchingStudyRelations(typed: string): StudyRelation[] {
  const word = relationKey(typed);
  if (!word) return [...STUDY_RELATIONS];
  return STUDY_RELATIONS.filter(key => [...RELATION_LOOKUP].some(([name, value]) => value === key && name.startsWith(word)));
}
/** Splits `relation::target` into its parts; a target without a relation comes back as is. */
export function splitRelation(head: string): { relation?: string; target: string } {
  const match = /^([^:\s|\[\]]{1,24})::([\s\S]*)$/u.exec(head);
  const relation = match ? studyRelation(match[1]) : undefined;
  return match && relation ? { relation, target: match[2] } : { target: head };
}

/** The same link with its relationship set, changed or removed (`relation` undefined); null if `raw` is not a link. */
export function withLinkRelation(raw: string, relation?: string): string | null {
  const match = /^(!?)\[\[([^\]\n]+)\]\]$/u.exec(raw);
  if (!match) return null;
  const [head, ...label] = match[2].split('|');
  const { target } = splitRelation(head);
  if (!validStudyTarget(target)) return null;
  const named = relation ? studyRelation(relation) : undefined;
  return `${match[1]}[[${named ? `${named}::` : ''}${target}${label.length ? `|${label.join('|')}` : ''}]]`;
}

export function validStudyTarget(target: string): boolean {
  const poetry = /^poetry:ashaar:(\d+):(\d+):(\d+)$/u.exec(target);
  if (poetry) return Number.isSafeInteger(+poetry[1]) && +poetry[1] > 0 && +poetry[2] >= 0 && +poetry[3] >= +poetry[2] && +poetry[3] <= 100000;
  if (/^note:[^\s\[\]|:#]{1,180}$/u.test(target)) return true;
  if (target.startsWith('book:')) return !!parseBookTarget(target);
  if (parseNoteTarget(target)?.anchor) return true;
  if (/^media:[0-9a-f-]{36}:\d{1,6}(?::[0-9a-f-]{36})?$/u.test(target)) return true;
  if (target.startsWith('quran:')) return !!parseQuranTarget(target);
  const sunnah = /^sunnah:([^:]+):(\d+):([^\s\[\]|]{1,180})$/u.exec(target);
  return !!sunnah && [...SUNNAH_COLLECTION_IDS, ...SUNNAH_SOURCE_BOOK_IDS, 'MuwattaMalik', 'MusnadAhmad', 'SunanDarimi'].includes(sunnah[1]) && +sunnah[2] >= 0 && +sunnah[2] <= 1000;
}

/** `quran:hafs:2:255` or a range in one surah, `quran:hafs:2:255-257`. */
export function parseQuranTarget(target: string): { profile: 'hafs' | 'warsh'; surah: number; from: number; to: number } | null {
  const match = /^quran:(hafs|warsh):(\d{1,3}):(\d{1,3})(?:-(\d{1,3}))?$/u.exec(target);
  if (!match) return null;
  const surah = +match[2], from = +match[3], to = match[4] ? +match[4] : from;
  if (surah < 1 || surah > 114 || from < 1 || to < from || to > 300) return null;
  return { profile: match[1] as 'hafs' | 'warsh', surah, from, to };
}

/** `note:<id>` or a paragraph in it, `note:<id>#^<anchor>`. */
export function parseNoteTarget(target: string): { id: string; anchor?: string } | null {
  const match = /^note:([^\s\[\]|:#]{1,180})(?:#\^([A-Za-z0-9-]{1,64}))?$/u.exec(target);
  return match ? (match[2] ? { id: match[1], anchor: match[2] } : { id: match[1] }) : null;
}

/** A work, optionally tied to its source and page. IDs retain the existing 180-character limit. */
export function parseBookTarget(target: string): { id: string; sourceId?: string; page?: number; cfi?: string } | null {
  const cfiMatch = /^book:([^\s\[\]|:#@]{1,180})(?:@([^\s\[\]|:#@]{1,180}))?#cfi=(.{1,2000})$/u.exec(target);
  if (cfiMatch) {
    try {
      const cfi = decodeURIComponent(cfiMatch[3]);
      const location = /^epubcfi\(\/6\/(\d{1,7})(?:\[[^\]\s]*\])?!\/4\/2(?:\/1:(\d{1,9})|,\/1:(\d{1,9}),\/1:(\d{1,9}))\)$/u.exec(cfi);
      if (!location || +location[1] < 2 || +location[1] % 2 !== 0 || (location[4] && +location[4] < +location[3])) return null;
      return { id: cfiMatch[1], ...(cfiMatch[2] ? { sourceId: cfiMatch[2] } : {}), cfi };
    } catch { return null; }
  }
  const match = /^book:([^\s\[\]|:#@]{1,180})(?:@([^\s\[\]|:#@]{1,180}))?(?:#p=(\d{1,6}))?$/u.exec(target);
  if (!match || (match[3] !== undefined && +match[3] < 1)) return null;
  return { id: match[1], ...(match[2] ? { sourceId: match[2] } : {}), ...(match[3] ? { page: +match[3] } : {}) };
}

/** Build references from the source identity carried with the open file. */
export function bookStudyTarget(book: { id: string; sourceId?: string }, page?: number): string {
  return `book:${book.id}${book.sourceId ? `@${book.sourceId}` : ''}${page === undefined ? '' : `#p=${page}`}`;
}

/** EPUB locations keep their CFI instead of a synthetic PDF page. */
export function bookCfiTarget(book: { id: string; sourceId?: string }, cfi: string): string {
  const target = bookStudyTarget(book) + '#cfi=' + encodeURIComponent(cfi);
  if (!parseBookTarget(target) || target.length > 500) throw new Error('invalid-reference');
  return target;
}

export function studyLinks(content: string): StudyLink[] {
  const links: StudyLink[] = [];
  // Code spans/blocks are examples, not relationships.
  const pattern = /```[^]*?```|`[^`\n]*`|(!?)\[\[([^\]\n]+)\]\]/gu;
  for (const match of content.matchAll(pattern)) {
    if (match[2] === undefined) continue;
    const [head, ...label] = match[2].split('|');
    const { relation, target } = splitRelation(head);
    if (!validStudyTarget(target)) continue;
    links.push({ target, label: label.join('|') || target, embed: match[1] === '!', start: match.index!, end: match.index! + match[0].length, ...(relation ? { relation } : {}) });
  }
  return links;
}

export function studyBacklinks(notes: StudyNote[], target: string): StudyNote[] {
  const book = parseBookTarget(target);
  return notes.filter(note => {
    if (`note:${note.id}` === target) return false;
    if (book && !book.sourceId && !book.page && !book.cfi && note.workId === book.id) return true;
    return studyLinks(note.content).some(link => {
      if (link.target === target) return true;
      if (book && !book.page && !book.cfi) {
        const linked = parseBookTarget(link.target);
        return linked?.id === book.id && (!book.sourceId || linked.sourceId === book.sourceId);
      }
      return target.startsWith('note:') && link.target.startsWith(`${target}#`);
    });
  });
}

export function studyNoteHeading(content: string): string {
  const lines = content.split('\n').map(line => line.trim()).filter(Boolean);
  // Prefer the user's thought over a leading citation or embed.
  const line = lines.find(line => {
    let text = line;
    for (const link of studyLinks(line).reverse()) text = text.slice(0, link.start) + text.slice(link.end);
    return text.trim();
  }) || lines[0] || '';
  let heading = line;
  for (const link of studyLinks(line).reverse()) heading = heading.slice(0, link.start) + link.label + heading.slice(link.end);
  return heading.replace(/[ \t]\^[A-Za-z0-9-]{1,64}[ \t]*$/u, '').replace(/^#{1,6}\s*|^>\s*|^[*-]\s+/u, '').replace(/[*`]/gu, '').slice(0, 100);
}

/** A plain-text preview for note lists: link labels instead of link markup, no paragraph anchors or Markdown marks. */
export function studyNoteExcerpt(content: string, max = 240): string {
  const lines = content.split('\n').map(line => {
    let text = line;
    for (const link of studyLinks(line).reverse()) text = text.slice(0, link.start) + link.label + text.slice(link.end);
    return text
      .replace(/[ \t]\^[A-Za-z0-9-]{1,64}[ \t]*$/u, '')
      .replace(/^\s*(?:#{1,6}\s+|>\s?|[*-]\s+|\d+\.\s+)/u, '')
      .replace(/\[!\w+\]\s*/gu, '')
      .replace(/\[\^[^\]\s]+\]:?/gu, '')
      .replace(/[*`]/gu, '')
      .trim();
  }).filter(Boolean);
  const text = lines.join(' ').replace(/\s+/gu, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function studyLinkText(target: string, label: string, embed = false, relation?: string): string {
  if (!validStudyTarget(target)) return '';
  const named = relation ? studyRelation(relation) : undefined;
  return `${embed ? '!' : ''}[[${named ? `${named}::` : ''}${target}|${label.replace(/[\[\]|\r\n]/gu, ' ').trim()}]]`;
}
