/**
 * Baglib — personal lists (KEY-386): a built-in "Starred" list plus the user's own named lists,
 * each holding any mix of books, ayahs, hadith and poems. Lists also work as filters, like tags.
 *
 * An item is identified by its kind and a reference in BagLib's study-link format, so opening an
 * item reuses the study-link navigation:
 *   book   `book:<workId>`
 *   ayah   `quran:<hafs|warsh>:<surah>:<ayah>` or a range `…:<from>-<to>`
 *   hadith `sunnah:<collection>:<chapter>:<hadithId>`
 *   poem   `poetry:ashaar:<poemId>:0:0` (the whole poem)
 *   lecture `media:<lectureId>:<seconds>` (a moment in a lecture; KEY-415)
 *   note   `note:<id>` (the whole note; KEY-415)
 *   page   `book:<workId>[@<sourceId>]#p=<page>` or `…#cfi=<epubcfi>` (an exact place in a book; KEY-415)
 */

import { parseBookTarget, parseNoteTarget, parseQuranTarget, validStudyTarget, matchesStudyQuery } from './study-notes';

export const PERSONAL_LIST_KINDS = ['book', 'ayah', 'hadith', 'poem', 'lecture', 'note', 'page'] as const;
export type PersonalListItemKind = (typeof PERSONAL_LIST_KINDS)[number];
export const STARRED_LIST_ID = 'starred';
export const PERSONAL_LISTS_CHANGED = 'baglib:personal-lists-changed';
export const MAX_LIST_NAME = 120;
export const MAX_ITEM_LABEL = 300;

export interface PersonalList {
  id: string;
  name: string;
  /** `starred` is the built-in list; it can't be renamed or deleted. */
  kind: 'starred' | 'custom';
  position: number;
  createdAt: string;
  updatedAt: string;
  /** Item counts by kind, so each section can show only the lists that hold its kind. */
  counts: Record<PersonalListItemKind, number>;
}

export interface PersonalListItem {
  id: string;
  listId: string;
  itemKind: PersonalListItemKind;
  itemRef: string;
  /** A short preview of the item (title, ayah text, hadith opening or poem title) kept when added. */
  label: string;
  position: number;
  addedAt: string;
}

export type ListFilterMode = 'any' | 'all';

export interface PersonalListsAPI {
  all(): Promise<PersonalList[]>;
  create(name: string): Promise<PersonalList>;
  rename(id: string, name: string): Promise<void>;
  remove(id: string): Promise<void>;
  reorder(ids: string[]): Promise<void>;
  items(listId: string, kind?: PersonalListItemKind): Promise<PersonalListItem[]>;
  add(listId: string, item: { itemKind: PersonalListItemKind; itemRef: string; label: string }): Promise<PersonalListItem>;
  removeItem(listId: string, itemKind: PersonalListItemKind, itemRef: string): Promise<void>;
  reorderItems(listId: string, itemIds: string[]): Promise<void>;
  toggleStar(item: { itemKind: PersonalListItemKind; itemRef: string; label: string }): Promise<boolean>;
  /** For each reference, the ids of the lists that hold it. */
  membership(itemKind: PersonalListItemKind, itemRefs: string[]): Promise<Record<string, string[]>>;
  /** References of this kind in the chosen lists: in any of them, or in all of them. */
  filter(itemKind: PersonalListItemKind, listIds: string[], mode: ListFilterMode): Promise<string[]>;
}

export const isListItemKind = (value: unknown): value is PersonalListItemKind =>
  typeof value === 'string' && (PERSONAL_LIST_KINDS as readonly string[]).includes(value);

/** The canonical reference for an item, or null when the reference doesn't fit its kind. */
export function canonicalItemRef(kind: PersonalListItemKind, ref: unknown): string | null {
  if (typeof ref !== 'string' || ref.length > 600) return null;
  switch (kind) {
    case 'book': {
      const parsed = ref.startsWith('book:') ? parseBookTarget(ref) : null;
      return parsed ? `book:${parsed.id}` : null;
    }
    case 'ayah': {
      const parsed = ref.startsWith('quran:') ? parseQuranTarget(ref) : null;
      if (!parsed) return null;
      return parsed.to > parsed.from ? `quran:${parsed.profile}:${parsed.surah}:${parsed.from}-${parsed.to}` : `quran:${parsed.profile}:${parsed.surah}:${parsed.from}`;
    }
    case 'hadith':
      return ref.startsWith('sunnah:') && validStudyTarget(ref) ? ref : null;
    case 'poem': {
      const match = /^poetry:ashaar:(\d{1,9})(?::\d+:\d+)?$/u.exec(ref);
      return match && +match[1] > 0 ? `poetry:ashaar:${+match[1]}:0:0` : null;
    }
    case 'lecture': {
      // A screenshot id appended to the link is dropped: the item is the moment, not the frame.
      const match = /^media:([0-9a-f-]{36}):(\d{1,6})(?::[0-9a-f-]{36})?$/u.exec(ref);
      return match ? `media:${match[1]}:${+match[2]}` : null;
    }
    case 'note': {
      // The whole note: a paragraph anchor is dropped.
      const parsed = ref.startsWith('note:') ? parseNoteTarget(ref) : null;
      return parsed ? `note:${parsed.id}` : null;
    }
    case 'page': {
      const parsed = ref.startsWith('book:') ? parseBookTarget(ref) : null;
      if (!parsed || (parsed.page === undefined && parsed.cfi === undefined)) return null;
      const base = `book:${parsed.id}${parsed.sourceId ? `@${parsed.sourceId}` : ''}`;
      return parsed.cfi !== undefined ? `${base}#cfi=${encodeURIComponent(parsed.cfi)}` : `${base}#p=${parsed.page}`;
    }
  }
}

export const bookListRef = (workId: string) => `book:${workId}`;
export const ayahListRef = (surah: number, from: number, to = from, profile: 'hafs' | 'warsh' = 'hafs') =>
  to > from ? `quran:${profile}:${surah}:${from}-${to}` : `quran:${profile}:${surah}:${from}`;
export const hadithListRef = (collection: string, chapter: number, hadithId: string) => `sunnah:${collection}:${chapter}:${hadithId}`;
export const poemListRef = (poemId: number) => `poetry:ashaar:${poemId}:0:0`;
export const lectureListRef = (lectureId: string, seconds: number) => `media:${lectureId}:${Math.max(0, Math.floor(seconds))}`;
export const noteListRef = (noteId: string) => `note:${noteId}`;

/** List names are kept as typed; only surrounding space is trimmed and control characters dropped. */
export function cleanListName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const value = name.replace(/[\u0000-\u001f\u007f]/gu, ' ').trim();
  return value && value.length <= MAX_LIST_NAME ? value : null;
}

export function cleanItemLabel(label: unknown): string {
  if (typeof label !== 'string') return '';
  return label.replace(/[\u0000-\u001f\u007f]+/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, MAX_ITEM_LABEL);
}

/**
 * The any/all filter, shared by the main process and the renderer: `membership` maps a reference
 * to the lists that hold it. No chosen list means no filter.
 */
export function passesListFilter(listIdsOfItem: readonly string[] | undefined, chosen: readonly string[], mode: ListFilterMode): boolean {
  if (chosen.length === 0) return true;
  const held = new Set(listIdsOfItem ?? []);
  return mode === 'all' ? chosen.every(id => held.has(id)) : chosen.some(id => held.has(id));
}

/** List search uses BagLib's Arabic normalisation (tashkeel and alef forms; ة/ه kept apart). */
export function matchListName(list: Pick<PersonalList, 'name'>, query: string): boolean {
  return !query.trim() || matchesStudyQuery(list.name, query);
}
