export const LECTURE_EXTENSIONS = ['.mp4', '.m4v', '.mov', '.mkv', '.webm', '.mp3', '.m4a', '.ogg', '.opus', '.wav'] as const;
const AUDIO_EXTENSIONS = new Set(['.mp3', '.m4a', '.ogg', '.opus', '.wav']);
export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3] as const;

export interface LectureSection { title: string; start: number }
export interface Lecture {
  id: string;
  title: string;
  path: string;
  kind: 'video' | 'audio';
  sections: LectureSection[];
  /** Where the sections came from: the file's own chapters or the user. */
  sectionSource: 'file' | 'user' | 'none';
  addedAt: string;
}
export interface LectureProgress { position: number; rate: number; completed: boolean }

export interface LecturesAPI {
  series: import('./lecture-series').LectureSeriesAPI;
  subtitles(id: string, choose?: boolean): Promise<{ path: string; cues: import('./subtitles').SubtitleCue[] } | null>;
  list(): Promise<Lecture[]>;
  add(): Promise<Lecture[]>;
  addPaths(paths: string[]): Promise<Lecture[]>;
  remove(id: string): Promise<void>;
  update(id: string, changes: { title?: string; sections?: LectureSection[] }): Promise<Lecture>;
  progress(id: string): Promise<LectureProgress | null>;
  saveProgress(id: string, progress: LectureProgress): Promise<void>;
  saveShot(id: string, png: string): Promise<string>;
  shotsDirectory(): Promise<string>;
}

export const lectureKind = (extension: string): Lecture['kind'] => AUDIO_EXTENSIONS.has(extension.toLowerCase()) ? 'audio' : 'video';

/** 3725 → 1:02:05, and 65 → 1:05. */
export function clockTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const [hours, minutes, rest] = [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60];
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${minutes}:${pad(rest)}`;
}

export function validSections(value: unknown): LectureSection[] {
  if (!Array.isArray(value) || value.length > 500) throw new Error('invalid-request');
  return value.map(item => {
    const section = item as Record<string, unknown>;
    if (typeof section?.title !== 'string' || !section.title.trim() || section.title.length > 300 || typeof section.start !== 'number' || !Number.isFinite(section.start) || section.start < 0) throw new Error('invalid-request');
    return { title: section.title.trim(), start: Math.round(section.start * 1000) / 1000 };
  }).sort((first, second) => first.start - second.start);
}

export function validProgress(value: unknown): LectureProgress {
  const progress = value as Record<string, unknown>;
  if (typeof progress?.position !== 'number' || !Number.isFinite(progress.position) || progress.position < 0 || !PLAYBACK_RATES.includes(progress.rate as typeof PLAYBACK_RATES[number])) throw new Error('invalid-request');
  return { position: progress.position, rate: progress.rate as number, completed: progress.completed === true };
}

export const isLectureFormat = (format: string | undefined): boolean => LECTURE_EXTENSIONS.some(extension => extension.slice(1) === format?.toLowerCase());
