/**
 * Baglib — Knowledge & Reading Session Domain Types
 *
 * Implements Baglib's core Knowledge layer schema:
 * - knowledge (polymorphic parent)
 * - highlight_detail (quoted_text, color)
 * - note_detail (content)
 * - quote_detail (quoted_text, context_note)
 * - bookmark_detail (label)
 * - question_detail (question_text)
 * - reading_session (work_id, started_at, ended_at, pages_read, mood)
 */

export type { KnowledgeType } from '../../../baglib_library_repository_interfaces_sprint_1';
import type { KnowledgeType } from '../../../baglib_library_repository_interfaces_sprint_1';

export interface KnowledgeTag {
  id: string;
  name: string;
  color?: string;
}

export interface KnowledgeCollection {
  id: string;
  name: string;
}

export interface KnowledgeItemDTO {
  title?: string;
  revision?: number;
  id: string;
  workId: string | null;
  editionId?: string | null;
  sourceId?: string | null;
  knowledgeType: KnowledgeType;
  type?: KnowledgeType;
  location: string; // e.g. "14" or "epubcfi(...)" or JSON coordinates
  createdAt: string;
  updatedAt: string;

  // Detail fields by type:
  quotedText?: string;
  color?: string; // Semantic colors: amber, emerald, rose, sky, violet
  noteContent?: string;
  contextNote?: string;
  label?: string;
  questionText?: string;

  tags?: KnowledgeTag[];
  collections?: KnowledgeCollection[];
}

export interface SaveKnowledgePayload {
  /** Origin of this editing action, independent of the item's original source. */
  actor?: 'reader';
  title?: string;
  aliases?: string[];
  entryDate?: string;
  mood?: string;
  difficulty?: number;
  rating?: number;
  recommendations?: string;
  lessons?: string;
  projectToReader?: boolean;
  expectedRevision?: number;
  id?: string;
  workId: string | null;
  editionId?: string | null;
  sourceId?: string | null;
  knowledgeType?: KnowledgeType;
  type?: KnowledgeType;
  location: string;
  quotedText?: string;
  color?: string;
  noteContent?: string;
  contextNote?: string;
  label?: string;
  questionText?: string;
  tagIds?: string[];
  collectionIds?: string[];
  createdAt?: string;
}

export interface ReadingSessionRecord {
  id: string;
  workId: string;
  editionId?: string | null;
  startedAt: string;
  endedAt: string;
  pagesRead: number;
  mood?: string | null;
}

export interface RecordReadingSessionPayload {
  id?: string;
  workId: string;
  editionId?: string | null;
  startedAt: string;
  endedAt?: string;
  pagesRead: number;
  mood?: string | null;
}

// Backwards compatibility for existing PageNote components
export interface PageNotePayload {
  id: string;
  bookId: string;
  pageNumber: number;
  content: string;
  createdAt?: string;
}

export interface PageNoteDTO {
  id: string;
  bookId: string;
  pageNumber: number;
  content: string;
  createdAt: string;
}
