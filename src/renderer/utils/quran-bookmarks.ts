import { parseQuranTarget, type StudyNote } from '../../shared/study-notes';
import { noteTargets } from '../../shared/note-targets';

export interface QuranBookmark { target: string; surah: number; ayah: number }

/** Bookmark identity includes the reading profile, unlike general note marker keys. */
export function quranBookmarks(notes: Pick<StudyNote, 'id' | 'content' | 'sourceRef' | 'tags'>[], profile: 'hafs' | 'warsh'): QuranBookmark[] {
  const entries = new Map<string, QuranBookmark>();
  for (const note of notes.filter(note => note.tags.includes('bookmark'))) {
    for (const target of noteTargets(note)) {
      const reference = parseQuranTarget(target);
      if (!reference || reference.profile !== profile) continue;
      for (let ayah = reference.from; ayah <= reference.to; ayah++) {
        const key = 'quran:' + profile + ':' + reference.surah + ':' + ayah;
        entries.set(key, { target: key, surah: reference.surah, ayah });
      }
    }
  }
  return [...entries.values()].sort((a, b) => a.surah - b.surah || a.ayah - b.ayah);
}
