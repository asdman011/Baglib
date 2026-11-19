import type { SunnahCollectionId } from '../../shared/types/sunnah';
import type { BookItem } from '../../shared/types/work';
import { isLectureFormat } from '../../shared/lectures';
import { parseBookTarget, parseNoteTarget, parseQuranTarget, validStudyTarget } from '../../shared/study-notes';
import type { WorkspaceView } from '../../shared/workspace-tabs';
import { openQuranAyah } from './quran-navigation';
import { openPoetryReference } from './poetry-navigation';
import { openLecture } from './lecture-navigation';

export type TabEventRef = string | { id: string; isFocused: boolean } | null | undefined;

export function isTabEventTarget(tab: TabEventRef, event?: Event): boolean {
  if (!tab) return true;
  const tabId = typeof tab === 'string' ? tab : tab.id;
  const isFocused = typeof tab === 'string' ? true : tab.isFocused;
  const targetTabId = (event as CustomEvent<{ tabId?: string }> | undefined)?.detail?.tabId;
  if (targetTabId) return targetTabId === tabId;
  return isFocused;
}

export function canConsumePendingTabTarget(targetTabId: string | undefined, tab: TabEventRef): boolean {
  if (!tab) return true;
  if (typeof tab === 'string') return !targetTabId || targetTabId === tab;
  if (targetTabId) return targetTabId === tab.id;
  return tab.isFocused;
}

export const STUDY_NOTE_OPEN = 'baglib:study-note-open';
let pendingNote: { id?: string; content?: string; anchor?: string; tabId?: string } | null = null;
let pendingCfi: { workId: string; cfi: string; tabId?: string } | null = null;
export function consumePendingCfi(workId: string, tab?: TabEventRef): string | null {
  if (!pendingCfi || pendingCfi.workId !== workId) return null;
  if (!canConsumePendingTabTarget(pendingCfi.tabId, tab)) return null;
  const cfi = pendingCfi.cfi;
  pendingCfi = null;
  return cfi;
}
let pendingPage: { workId: string; page: number; tabId?: string } | null = null;
/** The page a `book:<id>#p=N` link asked for; read once by the reader when that book opens. */
export function consumePendingPage(workId: string, tab?: TabEventRef): number | null {
  if (!pendingPage || pendingPage.workId !== workId) return null;
  if (!canConsumePendingTabTarget(pendingPage.tabId, tab)) return null;
  const page = pendingPage.page; pendingPage = null; return page;
}
let pendingSunnah: { collection: SunnahCollectionId; chapter: number; hadith: string; tabId?: string } | null = null;
function dispatchCustomEvent(name: string, detail?: unknown): void {
  const Ctor = (typeof window !== 'undefined' && (window as unknown as { CustomEvent?: typeof CustomEvent }).CustomEvent) || CustomEvent;
  window.dispatchEvent(new Ctor(name, { detail }));
}

export function openStudyNote(target: { id?: string; content?: string; anchor?: string; tabId?: string }): void {
  pendingNote = target;
  dispatchCustomEvent(STUDY_NOTE_OPEN, { tabId: target.tabId });
}
export function consumeStudyNote(tab?: TabEventRef) {
  if (!pendingNote) return null;
  if (!canConsumePendingTabTarget(pendingNote.tabId, tab)) return null;
  const value = pendingNote; pendingNote = null; return value;
}
export function openSunnahReference(target: NonNullable<typeof pendingSunnah>): void {
  pendingSunnah = target;
  dispatchCustomEvent('baglib:sunnah-open', target);
}
export function consumeSunnahReference(tab?: TabEventRef) {
  if (!pendingSunnah) return null;
  if (!canConsumePendingTabTarget(pendingSunnah.tabId, tab)) return null;
  const value = pendingSunnah; pendingSunnah = null; return value;
}

export function studyTargetView(target: string, books: BookItem[] = []): WorkspaceView | null {
  if (!validStudyTarget(target)) return null;
  if (target.startsWith('note:')) return 'notes';
  if (target.startsWith('quran:')) return 'quran';
  if (target.startsWith('sunnah:')) return 'sunnah';
  if (target.startsWith('poetry:')) return 'bayan';
  if (target.startsWith('media:')) return 'lectures';
  if (target.startsWith('person:narrator:')) return 'sunnah';
  if (target.startsWith('person:card:')) return 'notes';
  if (target.startsWith('person:')) return 'library';
  if (target.startsWith('book:')) {
    const parsed = parseBookTarget(target);
    const book = parsed ? books.find(item => item.id === parsed.id) : undefined;
    if (book && book.workType === 'lecture' && book.filePath && isLectureFormat(book.digitalFormat)) return 'lectures';
    return 'reader';
  }
  return null;
}

export function studyTargetTitle(target: string, books: BookItem[] = []): string {
  if (target.startsWith('book:')) {
    const parsed = parseBookTarget(target);
    const book = parsed ? books.find(item => item.id === parsed.id) : undefined;
    return book?.title ?? '';
  }
  return '';
}

export async function navigateStudyReference(target: string, books: BookItem[], onBook: (book: BookItem) => void, onNote: (id: string, anchor?: string) => void, tabId?: string): Promise<void> {
  if (!validStudyTarget(target)) throw new Error('invalid-reference');
  if (target.startsWith('note:')) { const parsed = parseNoteTarget(target)!; onNote(parsed.id, parsed.anchor); return; }
  if (target.startsWith('book:')) {
    const parsed = parseBookTarget(target);
    const defaultBook = parsed && books.find(book => book.id === parsed.id);
    if (!defaultBook) throw new Error('missing-book');
    let book = defaultBook;
    if (parsed.sourceId) {
      const sourceBook = await window.electronAPI.getBookSource(parsed.id, parsed.sourceId);
      if (sourceBook) book = sourceBook;
      else window.dispatchEvent(new CustomEvent('baglib:study-source-missing'));
    }
    pendingCfi = parsed.cfi ? { workId: book.id, cfi: parsed.cfi, ...(tabId ? { tabId } : {}) } : null;
    pendingPage = parsed.page ? { workId: book.id, page: parsed.page, ...(tabId ? { tabId } : {}) } : null;
    onBook({ ...book }); return;
  }
  if (target.startsWith('quran:')) {
    const parsed = parseQuranTarget(target)!;
    const { profile, surah, from: ayah } = parsed;
    const catalog = await window.electronAPI.quran.readerCatalog();
    if (!catalog.ok) throw new Error('missing-source');
    const source = catalog.data.sources.find(source => source.kind === 'script' && source.profile === profile);
    if (!source) throw new Error('missing-source');
    openQuranAyah({ script: source.id, surah: +surah, ayah: +ayah, ...(tabId ? { tabId } : {}) }); return;
  }
  if (target.startsWith('media:')) {
    const [, id, seconds] = target.split(':');
    openLecture({ id, seconds: +seconds, ...(tabId ? { tabId } : {}) });
    return;
  }
  if (target.startsWith('poetry:')) {
    const [, , poem, from, to] = target.split(':');
    openPoetryReference({ poemId: +poem, from: +from, to: +to, ...(tabId ? { tabId } : {}) });
    return;
  }
  if (target.startsWith('person:')) {
    dispatchCustomEvent('baglib:person-open', { target, ...(tabId ? { tabId } : {}) });
    return;
  }
  const [, collection, chapter, ...hadith] = target.split(':');
  const api = window.electronAPI?.sunnah;
  const source = await api?.chapter(collection as SunnahCollectionId, +chapter);
  const id = hadith.join(':');
  if (!source?.ok || !source.data.hadiths.some(hadith => hadith.id === id)) throw new Error('missing-source');
  openSunnahReference({ collection: collection as SunnahCollectionId, chapter: +chapter, hadith: id, ...(tabId ? { tabId } : {}) });
}
