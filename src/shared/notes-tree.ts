/**
 * KEY-338: the Notes tab as folders. Each note is filed under the sources it is about:
 * Quran › surah, Sunnah › collection › chapter, Library › book, Poetry › poem, Lectures › lecture, or Other.
 * Folder paths are '/'-joined ids, e.g. 'quran/2', 'sunnah/Bukhari/1', 'library/<workId>'.
 */
import { parseBookTarget, parseQuranTarget, studyLinks } from './study-notes';
import type { LectureSeries } from './lecture-series';
import { noteTargets } from './note-targets';

export type NotesRoot = 'quran' | 'sunnah' | 'library' | 'poetry' | 'lectures' | 'other';
export const NOTES_ROOTS: NotesRoot[] = ['quran', 'sunnah', 'library', 'poetry', 'lectures', 'other'];

export interface TreeNote { id: string; content: string; sourceRef?: string; workId?: string }

/** Where a passage target is filed, or null when it is not a source folder (e.g. a link to another note). */
export function targetFolder(target: string, series: readonly LectureSeries[] = []): string | null {
  const quran = parseQuranTarget(target);
  if (quran) return `quran/${quran.surah}`;
  const sunnah = /^sunnah:([^:]+):(\d+):/u.exec(target);
  if (sunnah) return `sunnah/${sunnah[1]}/${sunnah[2]}`;
  const book = parseBookTarget(target);
  if (book) return `library/${book.id}`;
  const poem = /^poetry:ashaar:(\d+):/u.exec(target);
  if (poem) return `poetry/${poem[1]}`;
  const lecture = /^media:([0-9a-f-]{36}):/u.exec(target);
  if (lecture) {
    const group = series.find(item => item.items.some(member => member.workId === lecture[1]));
    return group ? `lectures/series-${group.id}/${lecture[1]}` : `lectures/${lecture[1]}`;
  }
  return null;
}

/** Every folder a note belongs in; a note about nothing in particular goes under Other. */
export function noteFolders(note: TreeNote, series: readonly LectureSeries[] = []): string[] {
  const folders = new Set(noteTargets(note).map(target => targetFolder(target, series)).filter((folder): folder is string => !!folder));
  if (note.workId) folders.add(`library/${note.workId}`);
  return folders.size ? [...folders] : ['other'];
}

export function inFolder(folders: string[], path: string): boolean {
  return folders.some(folder => folder === path || folder.startsWith(path + '/'));
}

/** Note counts for every folder and every ancestor ('quran', 'quran/2', ...); each note counts once per folder. */
export function folderCounts(notes: TreeNote[], series: readonly LectureSeries[] = []): Map<string, number> {
  const counts = new Map<string, number>();
  for (const note of notes) {
    const paths = new Set<string>();
    for (const folder of noteFolders(note, series)) {
      const parts = folder.split('/');
      for (let depth = 1; depth <= parts.length; depth++) paths.add(parts.slice(0, depth).join('/'));
    }
    for (const path of paths) counts.set(path, (counts.get(path) ?? 0) + 1);
  }
  return counts;
}

export function notesInFolder<Note extends TreeNote>(notes: Note[], path: string | null, series: readonly LectureSeries[] = []): Note[] {
  if (!path) return notes;
  return notes.filter(note => inFolder(noteFolders(note, series), path));
}

/** The child folder ids under a path that hold notes, in a natural order (surahs and chapters by number). */
export function childFolders(counts: Map<string, number>, path: string): string[] {
  const depth = path.split('/').length + 1;
  const children = [...counts.keys()].filter(key => key.startsWith(path + '/') && key.split('/').length === depth);
  return children.sort((a, b) => {
    const x = a.split('/').pop()!, y = b.split('/').pop()!;
    const nx = Number(x), ny = Number(y);
    return Number.isFinite(nx) && Number.isFinite(ny) ? nx - ny : x.localeCompare(y);
  });
}

/** The first link label a note gives a folder, used to name poems and lectures (titles live in other stores). */
export function folderLabels(notes: TreeNote[], series: readonly LectureSeries[] = []): Map<string, string> {
  const labels = new Map<string, string>();
  for (const group of series) {
    labels.set(`lectures/series-${group.id}`, group.name);
    for (const item of group.items) labels.set(`lectures/series-${group.id}/${item.workId}`, item.title);
  }
  for (const note of notes) for (const link of studyLinks(note.content)) {
    const folder = targetFolder(link.target, series);
    if (folder && !labels.has(folder) && link.label && link.label !== link.target) labels.set(folder, link.label.replace(/\s*·\s*\d+:\d+(?::\d+)?\s*$/u, '').trim());
  }
  return labels;
}

/** Sort order inside a folder: by ayah/hadith/verse position, then newest first. */
export function notePosition(note: TreeNote, path: string, series: readonly LectureSeries[] = []): number {
  for (const target of noteTargets(note)) {
    const folder = targetFolder(target, series);
    if (!folder || !(folder === path || folder.startsWith(path + '/') || path.startsWith(folder))) continue;
    const quran = parseQuranTarget(target);
    if (quran) return quran.surah * 1000 + quran.from;
    const verse = /^poetry:ashaar:\d+:(\d+):/u.exec(target);
    if (verse) return Number(verse[1]);
    const moment = /^media:[0-9a-f-]{36}:(\d+)/u.exec(target);
    if (moment) return Number(moment[1]);
  }
  return Number.MAX_SAFE_INTEGER;
}


/** Keep a remembered lecture folder selected when its series membership changes. */
export function resolveLectureFolder(folder: string | null, series: readonly LectureSeries[]): string | null {
  if (!folder?.startsWith('lectures/')) return folder;
  const parts = folder.split('/');
  const lectureId = parts[parts.length - 1];
  if (/^[0-9a-f-]{36}$/u.test(lectureId)) return targetFolder(`media:${lectureId}:0`, series);
  if (parts.length === 2 && parts[1].startsWith('series-') && !series.some(item => `series-${item.id}` === parts[1])) return 'lectures';
  return folder;
}
