import type { SunnahCollectionId } from '../../shared/types/sunnah';
import type { BookItem } from '../../shared/types/work';
import { parseBookTarget, parseNoteTarget, parseQuranTarget, validStudyTarget } from '../../shared/study-notes';
import { openQuranAyah } from './quran-navigation';
import { openPoetryReference } from './poetry-navigation';
import { openLecture } from './lecture-navigation';
export const STUDY_NOTE_OPEN = 'baglib:study-note-open';
let pendingNote: { id?: string; content?: string; anchor?: string } | null = null;
let pendingPage: { workId: string; page: number } | null = null;
/** The page a `book:<id>#p=N` link asked for; read once by the reader when that book opens. */
export function consumePendingPage(workId: string): number | null {
  if (!pendingPage || pendingPage.workId !== workId) return null;
  const page = pendingPage.page; pendingPage = null; return page;
}
let pendingSunnah: { collection: SunnahCollectionId; chapter: number; hadith: string } | null = null;
export function openStudyNote(target: { id?: string; content?: string; anchor?: string }): void {
  pendingNote = target;
  window.dispatchEvent(new CustomEvent(STUDY_NOTE_OPEN));
}
export function consumeStudyNote() { const value = pendingNote; pendingNote = null; return value; }
export function openSunnahReference(target: NonNullable<typeof pendingSunnah>): void {
  pendingSunnah = target;
  window.dispatchEvent(new CustomEvent('baglib:sunnah-open', { detail: target }));
}
export function consumeSunnahReference() { const value = pendingSunnah; pendingSunnah = null; return value; }

export async function navigateStudyReference(target: string, books: BookItem[], onBook: (book: BookItem) => void, onNote: (id: string, anchor?: string) => void): Promise<void> {
  if (!validStudyTarget(target)) throw new Error('invalid-reference');
  if (target.startsWith('note:')) { const parsed = parseNoteTarget(target)!; onNote(parsed.id, parsed.anchor); return; }
  if (target.startsWith('book:')) {
    const parsed = parseBookTarget(target);
    const book = parsed && books.find(book => book.id === parsed.id);
    if (!book) throw new Error('missing-book');
    pendingPage = parsed.page ? { workId: book.id, page: parsed.page } : null;
    onBook(book); return;
  }
  if (target.startsWith('quran:')) {
    const parsed = parseQuranTarget(target)!;
    const { profile, surah, from: ayah } = parsed;
    const catalog = await window.electronAPI.quran.readerCatalog();
    if (!catalog.ok) throw new Error('missing-source');
    const source = catalog.data.sources.find(source => source.kind === 'script' && source.profile === profile);
    if (!source) throw new Error('missing-source');
    openQuranAyah({ script: source.id, surah: +surah, ayah: +ayah }); return;
  }
  if (target.startsWith('media:')) {
    const [, id, seconds] = target.split(':');
    openLecture({ id, seconds: +seconds });
    return;
  }
  if (target.startsWith('poetry:')) {
    const [, , poem, from, to] = target.split(':');
    openPoetryReference({ poemId: +poem, from: +from, to: +to });
    return;
  }
  const [, collection, chapter, ...hadith] = target.split(':');
  const api = window.electronAPI?.sunnah;
  const source = await api?.chapter(collection as SunnahCollectionId, +chapter);
  const id = hadith.join(':');
  if (!source?.ok || !source.data.hadiths.some(hadith => hadith.id === id)) throw new Error('missing-source');
  openSunnahReference({ collection: collection as SunnahCollectionId, chapter: +chapter, hadith: id });
}
