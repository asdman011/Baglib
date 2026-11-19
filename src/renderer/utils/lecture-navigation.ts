export const LECTURE_OPEN_EVENT = 'baglib:lecture-open';
export interface LectureTarget { id: string; seconds: number; tabId?: string }
let pending: LectureTarget | null = null;

export function openLecture(target: LectureTarget): void {
  pending = target;
  window.dispatchEvent(new CustomEvent(LECTURE_OPEN_EVENT, { detail: { tabId: target.tabId } }));
}
export function consumeLecture(tab?: string | { id: string; isFocused: boolean } | null): LectureTarget | null {
  if (!pending) return null;
  if (tab) {
    if (typeof tab === 'string') {
      if (pending.tabId && pending.tabId !== tab) return null;
    } else if (pending.tabId) {
      if (pending.tabId !== tab.id) return null;
    } else if (!tab.isFocused) {
      return null;
    }
  }
  const value = pending; pending = null; return value;
}

/** media:<lecture>:<seconds>, with a screenshot id appended when the link embeds a frame. */
export function lectureTarget(id: string, seconds: number, shot?: string): string {
  return `media:${id}:${Math.floor(seconds)}${shot ? `:${shot}` : ''}`;
}
