export const LECTURE_OPEN_EVENT = 'baglib:lecture-open';
export interface LectureTarget { id: string; seconds: number }
let pending: LectureTarget | null = null;

export function openLecture(target: LectureTarget): void {
  pending = target;
  window.dispatchEvent(new CustomEvent(LECTURE_OPEN_EVENT));
}
export function consumeLecture(): LectureTarget | null { const value = pending; pending = null; return value; }

/** media:<lecture>:<seconds>, with a screenshot id appended when the link embeds a frame. */
export function lectureTarget(id: string, seconds: number, shot?: string): string {
  return `media:${id}:${Math.floor(seconds)}${shot ? `:${shot}` : ''}`;
}
