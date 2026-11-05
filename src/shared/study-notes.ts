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
export interface StudyLink { target: string; label: string; embed: boolean; start: number; end: number }

export function validStudyTarget(target: string): boolean {
  const poetry = /^poetry:ashaar:(\d+):(\d+):(\d+)$/u.exec(target);
  if (poetry) return Number.isSafeInteger(+poetry[1]) && +poetry[1] > 0 && +poetry[2] >= 0 && +poetry[3] >= +poetry[2] && +poetry[3] <= 100000;
  if (/^(note|book):[^\s\[\]|:#]{1,180}$/u.test(target)) return true;
  if (parseBookTarget(target)?.page) return true;
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

/** `book:<id>` or a page in it, `book:<id>#p=12`. */
export function parseBookTarget(target: string): { id: string; page?: number } | null {
  const match = /^book:([^\s\[\]|:#]{1,180})(?:#p=(\d{1,6}))?$/u.exec(target);
  if (!match || (match[2] !== undefined && +match[2] < 1)) return null;
  return match[2] === undefined ? { id: match[1] } : { id: match[1], page: +match[2] };
}

export function studyLinks(content: string): StudyLink[] {
  const links: StudyLink[] = [];
  // Code spans/blocks are examples, not relationships.
  const pattern = /```[^]*?```|`[^`\n]*`|(!?)\[\[([^\]\n]+)\]\]/gu;
  for (const match of content.matchAll(pattern)) {
    if (match[2] === undefined) continue;
    const [target, ...label] = match[2].split('|');
    if (!validStudyTarget(target)) continue;
    links.push({ target, label: label.join('|') || target, embed: match[1] === '!', start: match.index!, end: match.index! + match[0].length });
  }
  return links;
}

export function studyBacklinks(notes: StudyNote[], target: string): StudyNote[] {
  return notes.filter(note => `note:${note.id}` !== target && (
    (target.startsWith('book:') && note.workId === target.slice(5)) || studyLinks(note.content).some(link => link.target === target || ((target.startsWith('book:') || target.startsWith('note:')) && link.target.startsWith(`${target}#`)))
  ));
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

export function studyLinkText(target: string, label: string, embed = false): string {
  if (!validStudyTarget(target)) return '';
  return `${embed ? '!' : ''}[[${target}|${label.replace(/[\[\]|\r\n]/gu, ' ').trim()}]]`;
}
