import { HIGHLIGHT_COLORS } from './highlight-manager';

/** Single-key reader shortcuts (Acrobat's keep-tool-selected, Zotero-style colour keys). */
export type ReaderShortcut =
  | { kind: 'toggle-highlighter' }
  | { kind: 'color'; color: string }
  | { kind: 'shortcuts' }
  | { kind: 'stop-highlighter' };

export interface ShortcutKeyEvent {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  target?: unknown;
}

function isTyping(target: unknown): boolean {
  if (!target || typeof target !== 'object') return false;
  const element = target as { tagName?: string; isContentEditable?: boolean; closest?: (selector: string) => unknown };
  if (element.isContentEditable) return true;
  const tag = String(element.tagName || '').toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return typeof element.closest === 'function' && !!element.closest('[contenteditable="true"],[role="dialog"]');
}

export function readerShortcut(event: ShortcutKeyEvent, highlighterOn: boolean): ReaderShortcut | null {
  if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return null;
  if (event.key === 'Escape') return highlighterOn ? { kind: 'stop-highlighter' } : null;
  if (event.key === '?') return { kind: 'shortcuts' };
  if (event.key.toLowerCase() === 'h') return { kind: 'toggle-highlighter' };
  // Physical digits only; Arabic-Indic digits come from the same keys on Arabic layouts.
  const digit = '١٢٣٤٥'.indexOf(event.key) + 1 || Number(event.key);
  if (Number.isInteger(digit) && digit >= 1 && digit <= HIGHLIGHT_COLORS.length) return { kind: 'color', color: HIGHLIGHT_COLORS[digit - 1].id };
  return null;
}
