import { randomUUID } from 'node:crypto';
import type { ISettingsRepository } from '../database/repositories/settings.repository';
import type { StudyNote, StudyNoteInput } from '../../shared/study-notes';

const prefix = 'study.note.v1:';
export class StudyNotesService {
  constructor(private settings: ISettingsRepository) {}
  list(): StudyNote[] {
    return Object.entries(this.settings.getAll()).filter(([key]) => key.startsWith(prefix))
      .map(([, note]) => note as StudyNote).filter(note => note && typeof note.id === 'string' && typeof note.content === 'string')
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  save(input: StudyNoteInput): StudyNote {
    if (!input || typeof input.content !== 'string' || !input.content.trim() || input.content.length > 100_000 || typeof input.title !== 'string' || input.title.length > 300) throw new Error('invalid-note');
    if (input.id !== undefined && (typeof input.id !== 'string' || !/^[\w-]{1,180}$/u.test(input.id))) throw new Error('invalid-note');
    const strings = (values: string[]) => {
      if (!Array.isArray(values) || values.length > 50 || values.some(value => typeof value !== 'string' || value.length > 200)) throw new Error('invalid-note');
      return [...new Set(values.map(value => value.trim()).filter(Boolean))];
    };
    const id = input.id || randomUUID();
    const previous = this.settings.get<StudyNote>(prefix + id);
    const now = new Date().toISOString();
    const note: StudyNote = { id, title: input.title.trim(), content: input.content, aliases: strings(input.aliases), tags: strings(input.tags), createdAt: previous?.createdAt || now, updatedAt: now };
    if (input.workId) {
      if (typeof input.workId !== 'string' || !/^[\w-]{1,180}$/u.test(input.workId)) throw new Error('invalid-note');
      note.workId = input.workId;
    }
    this.settings.set(prefix + id, note);
    return note;
  }
  remove(id: string): void {
    if (typeof id !== 'string' || !/^[\w-]{1,180}$/u.test(id)) throw new Error('invalid-note');
    this.settings.delete(prefix + id);
  }
}
