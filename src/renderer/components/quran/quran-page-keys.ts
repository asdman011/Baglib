import { shortcutForEvent } from '../actions/shortcuts';
/** Direction-aware reading keys. Focused controls and study text retain their native keys. */
export function quranPageKeyDelta(event: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'altKey' | 'ctrlKey' | 'metaKey' | 'defaultPrevented' | 'isComposing' | 'repeat'>, direction: 'rtl' | 'ltr'): number {
  if (!shortcutForEvent(event, 'quran')?.id.startsWith('quran-')) return 0;
  if (event.key === ' ' || event.key === 'Spacebar') return event.shiftKey ? -1 : 1;
  if (event.key === 'PageDown') return 1;
  if (event.key === 'PageUp') return -1;
  if (event.key === 'ArrowRight') return direction === 'rtl' ? -1 : 1;
  if (event.key === 'ArrowLeft') return direction === 'rtl' ? 1 : -1;
  return 0;
}
export function quranReadingKeyTarget(target: EventTarget | null): boolean {
  if (!target || !('closest' in target)) return true;
  const element = target as Element;
  return !element.closest('input,textarea,select,button,a,[contenteditable]:not([contenteditable="false"]),[role="button"],[role="dialog"],[role="menu"],[role="slider"],[role="textbox"],[data-quran-study-panel],[data-islamic-reader-panel],[data-quran-popup]');
}
