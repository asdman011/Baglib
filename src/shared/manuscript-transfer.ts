import { emptySourceProps, type ResearchSourceKind, type ResearchSourceProps } from './research-editor-sources';
import { bookCfiTarget, bookStudyTarget } from './study-notes';

export const SEND_TO_MANUSCRIPT_EVENT = 'baglib:send-to-manuscript';
export const LAST_MANUSCRIPT_STORAGE_KEY = 'baglib:last-manuscript-id';
export const LAST_CHAPTER_STORAGE_KEY = 'baglib:last-chapter-id';

export interface SendToManuscriptPayload {
  kind: ResearchSourceKind;
  props: ResearchSourceProps;
}

export function requestSendToManuscript(payload: SendToManuscriptPayload): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SEND_TO_MANUSCRIPT_EVENT, { detail: payload }));
  }
}

export function createBookQuotePayload(options: {
  book: { id: string; title: string; editionId?: string; sourceId?: string };
  text: string;
  page?: number;
  cfi?: string;
  chapter?: string;
}): SendToManuscriptPayload {
  const { book, text, page, cfi, chapter } = options;
  const url = cfi ? bookCfiTarget(book, cfi) : bookStudyTarget(book, page);
  const pageLabel = page ? `ص ${page}` : chapter || '1';
  const label = `${book.title} · ${pageLabel}`;
  return {
    kind: 'book-quote',
    props: {
      ...emptySourceProps(),
      url,
      label,
      text: text.trim(),
      workId: book.id,
      editionId: book.editionId || '',
      sourceId: book.sourceId || '',
      page: page || 1,
    },
  };
}

export function createQuranAyahPayload(options: {
  profile: 'hafs' | 'warsh';
  surah: number;
  ayah: number;
  surahName?: string;
  text: string;
}): SendToManuscriptPayload {
  const { profile, surah, ayah, surahName, text } = options;
  const url = `quran:${profile}:${surah}:${ayah}`;
  const label = surahName ? `${surahName} ${surah}:${ayah}` : `${surah}:${ayah}`;
  return {
    kind: 'ayah',
    props: {
      ...emptySourceProps(),
      url,
      label,
      text: text.trim(),
    },
  };
}

export function createHadithPayload(options: {
  collection: string;
  collectionLabel: string;
  chapterNumber: number;
  hadithId: string;
  hadithNumber: string;
  text: string;
  grade?: string;
}): SendToManuscriptPayload {
  const { collection, collectionLabel, chapterNumber, hadithId, hadithNumber, text, grade } = options;
  const url = `sunnah:${collection}:${chapterNumber}:${hadithId}`;
  const label = `${collectionLabel} · ${hadithNumber}`;
  return {
    kind: 'hadith',
    props: {
      ...emptySourceProps(),
      url,
      label,
      text: text.trim(),
      collection: collectionLabel,
      number: hadithNumber,
      grade: grade || '',
    },
  };
}

export function createPoetryVersePayload(options: {
  poemId: number;
  from: number;
  to: number;
  poetName?: string;
  poemTitle?: string;
  verses: { sadr: string; ajuz: string }[];
}): SendToManuscriptPayload {
  const { poemId, from, to, poetName = '', poemTitle = '', verses } = options;
  const url = `poetry:ashaar:${poemId}:${from}:${to}`;
  const label = [poetName, poemTitle].filter(Boolean).join(' — ') || `شعر ${poemId}`;
  return {
    kind: 'verse',
    props: {
      ...emptySourceProps(),
      url,
      label,
      verses,
      poet: poetName,
      poem: poemTitle,
      text: verses.map(v => [v.sadr, v.ajuz].filter(Boolean).join(' ... ')).join('\n'),
    },
  };
}

export const MANUSCRIPT_DOCUMENT_CHANGED_EVENT = 'baglib:manuscript-document-changed';

/** KEY-370: the remembered choice wins when it still exists; otherwise the first item. */
export function pickDefaultId<T extends { id: string }>(items: readonly T[], stored: string | null | undefined): string {
  if (stored && items.some(item => item.id === stored)) return stored;
  return items[0]?.id ?? '';
}

export interface ManuscriptTransferApi {
  document(id: string): Promise<{ id: string; snapshot: string }>;
  save(input: { id: string; snapshot: string }): Promise<unknown>;
}

/** KEY-370: append the source block at the end of the chapter and save; manuscript_link is derived on save (RE-3). */
export async function sendPayloadToDocument(api: ManuscriptTransferApi, documentId: string, payload: SendToManuscriptPayload): Promise<string> {
  const { insertBlockIntoManuscriptSnapshot } = await import('./manuscript-snapshot');
  const current = await api.document(documentId);
  const { snapshot, blockId } = insertBlockIntoManuscriptSnapshot(current.snapshot, payload.kind, payload.props, 'end');
  await api.save({ id: documentId, snapshot });
  return blockId;
}

/** KEY-370: the chapter open in the research editor. Writing to it behind the editor's back would be overwritten by its autosave. */
let openManuscriptDocumentId: string | null = null;
export type OpenDocumentInserter = (kind: string, props: Record<string, unknown>) => Promise<string>;
let openDocumentInserter: OpenDocumentInserter | null = null;
export function setOpenManuscriptDocument(id: string | null | undefined, inserter?: OpenDocumentInserter | null): void {
  openManuscriptDocumentId = id || null;
  openDocumentInserter = id ? inserter ?? null : null;
}
/** KEY-370: insert into the chapter open in the editor through the editor itself; null when no live editor can take it. */
export function openDocumentInserterFor(id: string): OpenDocumentInserter | null {
  return isManuscriptDocumentOpen(id) ? openDocumentInserter : null;
}
export function isManuscriptDocumentOpen(id: string): boolean { return !!id && openManuscriptDocumentId === id; }

/** KEY-370: drag-and-drop of a reader passage into the research editor carries the same payload. */
export const SOURCE_DRAG_TYPE = 'application/x-baglib-source';
export function writeSourceDrag(dataTransfer: Pick<DataTransfer, 'setData'> | null, payload: SendToManuscriptPayload): void {
  if (!dataTransfer) return;
  dataTransfer.setData(SOURCE_DRAG_TYPE, JSON.stringify(payload));
  dataTransfer.setData('text/plain', [payload.props.text, payload.props.label].filter(Boolean).join('\n'));
}
export function readSourceDrag(dataTransfer: Pick<DataTransfer, 'getData'> | null): SendToManuscriptPayload | null {
  try {
    const raw = dataTransfer?.getData(SOURCE_DRAG_TYPE);
    if (!raw) return null;
    const value = JSON.parse(raw) as SendToManuscriptPayload;
    const kinds = ['ayah', 'hadith', 'verse', 'book-quote'];
    return value && kinds.includes(value.kind) && value.props && typeof value.props.url === 'string' ? value : null;
  } catch { return null; }
}
