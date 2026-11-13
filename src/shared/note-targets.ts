/**
 * KEY-337: which notes belong to a passage (an ayah, a hadith, a verse range, a lecture moment), so a note can be
 * written beside the text and the text can show that it already has notes.
 */
import { parseQuranTarget, studyLinks, validStudyTarget } from './study-notes';

interface NoteLike { id: string; content: string; sourceRef?: string; workId?: string }

const COMMENTARY_KIND = /:(reflection|question|research|cross-reference|insight|academic)$/u;

/** `commentary:<reference>:<kind>` (a personal comment) → the passage it is about, as a study target. */
export function commentaryTarget(sourceRef?: string): string | null {
  if (!sourceRef?.startsWith('commentary:')) return null;
  const reference = sourceRef.slice('commentary:'.length).replace(COMMENTARY_KIND, '');
  const target = /^quran:\d{1,3}:\d{1,3}$/u.test(reference) ? reference.replace(/^quran:/u, 'quran:hafs:') : reference;
  return validStudyTarget(target) ? target : null;
}

/** Every passage a note points at: its study links, the passage of a personal comment, a poetry note's location. */
export function noteTargets(note: NoteLike): string[] {
  const targets = studyLinks(note.content).map(link => link.target);
  const comment = commentaryTarget(note.sourceRef);
  if (comment) targets.push(comment);
  if (note.sourceRef && /^poetry:ashaar:\d+:\d+:\d+$/u.test(note.sourceRef)) targets.push(note.sourceRef);
  return [...new Set(targets)];
}

/** One key per marked spot: each ayah of a Quran range (any reading), a hadith, a lecture, a poem's verse range. */
export function markerKeys(target: string): string[] {
  const quran = parseQuranTarget(target);
  if (quran) return Array.from({ length: quran.to - quran.from + 1 }, (_, index) => `quran:${quran.surah}:${quran.from + index}`);
  const media = /^media:([0-9a-f-]{36}):/u.exec(target);
  if (media) return [`media:${media[1]}`];
  return [target];
}

/** Does a note's target sit on the passage the reader is looking at? */
export function targetMatches(noteTarget: string, passage: string): boolean {
  if (noteTarget === passage) return true;
  const wanted = new Set(markerKeys(passage));
  if (markerKeys(noteTarget).some(key => wanted.has(key))) return true;
  const a = poetryRange(noteTarget), b = poetryRange(passage);
  return !!a && !!b && a.poem === b.poem && a.from <= b.to && b.from <= a.to;
}

export function notesForTarget<Note extends NoteLike>(notes: Note[], passage: string): Note[] {
  return notes.filter(note => noteTargets(note).some(target => targetMatches(target, passage)));
}

/** Marker keys for every note, counted, for the open page or chapter to look up. */
export function markerCounts(notes: NoteLike[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const note of notes) {
    const keys = new Set(noteTargets(note).flatMap(markerKeys));
    for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function poetryRange(target: string): { poem: number; from: number; to: number } | null {
  const match = /^poetry:ashaar:(\d+):(\d+):(\d+)$/u.exec(target);
  return match ? { poem: +match[1], from: +match[2], to: +match[3] } : null;
}

/** How many notes touch a verse row of a poem (rows can span several source lines). */
export function poetryRowCount(counts: Map<string, number>, poem: number, from: number, to: number): number {
  let total = 0;
  for (const [key, count] of counts) {
    const range = poetryRange(key);
    if (range && range.poem === poem && range.from <= to && from <= range.to) total += count;
  }
  return total;
}
