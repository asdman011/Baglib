import { studyNoteHeading, type StudyNote } from './study-notes';
import type { KnowledgeItemDTO } from './types/knowledge';

/** Use canonical saved content for every note type displayed in the Notes overview. */
export function exportableStudyNotes(personal: StudyNote[], knowledge: KnowledgeItemDTO[]): StudyNote[] {
  const notes = new Map(personal.map(note => [note.id, note]));
  for (const item of knowledge) {
    if (!['note', 'study_note', 'reading_reflection'].includes(item.knowledgeType) || typeof item.noteContent !== 'string') continue;
    const existing = notes.get(item.id);
    notes.set(item.id, {
      id: item.id, title: existing?.title || item.title || studyNoteHeading(item.noteContent), content: item.noteContent,
      aliases: existing?.aliases || [], tags: item.tags?.map(tag => tag.name) || [], workId: item.workId || undefined,
      createdAt: item.createdAt, updatedAt: item.updatedAt,
    });
  }
  return [...notes.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
