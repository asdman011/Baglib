import { shortcutForEvent } from '../../components/actions/shortcuts';
import { HIGHLIGHT_COLORS } from './highlight-manager';
import type { MarkupTool } from '../../../shared/pdf-markup';

/** Single-key reader shortcuts (Acrobat's keep-tool-selected, Zotero-style colour keys). */
export type ReaderShortcut =
  | { kind: 'toggle-highlighter' }
  | { kind: 'color'; color: string }
  | { kind: 'shortcuts' }
  | { kind: 'tool'; tool: MarkupTool }
  | { kind: 'stop-highlighter' };

export interface ShortcutKeyEvent {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  target?: unknown;
  shiftKey?: boolean;
  repeat?: boolean;
  defaultPrevented?: boolean;
}

export function markHistoryShortcut(event: ShortcutKeyEvent, dialogOpen: boolean): 'undo' | 'redo' | null {
  if (dialogOpen || event.defaultPrevented || event.repeat || event.altKey || !(event.ctrlKey || event.metaKey) || isTyping(event.target)) return null;
  const id = shortcutForEvent(event, 'reader')?.id;
  if(id === 'reader-redo' || id === 'reader-redo-alt')return 'redo';
  return id === 'reader-undo' ? 'undo' : null;
}

function isTyping(target: unknown): boolean {
  if (!target || typeof target !== 'object') return false;
  const element = target as { tagName?: string; isContentEditable?: boolean; closest?: (selector: string) => unknown };
  if (element.isContentEditable) return true;
  const tag = String(element.tagName || '').toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return typeof element.closest === 'function' && !!element.closest('[contenteditable="true"],[role="dialog"],[role="alertdialog"],.cm-editor');
}

export function readerShortcut(event: ShortcutKeyEvent, highlighterOn: boolean): ReaderShortcut | null {
  if (isTyping(event.target)) return null;
  const id = shortcutForEvent(event, 'reader')?.id;
  if (id === 'reader-stop') return highlighterOn ? { kind: 'stop-highlighter' } : null;
  if (id === 'help') return { kind: 'shortcuts' };
  if (id === 'reader-highlight') return { kind: 'toggle-highlighter' };
  if (id === 'reader-underline') return { kind: 'tool', tool: 'underline' };
  if (id === 'reader-comment') return { kind: 'tool', tool: 'comment' };
  if (id?.startsWith('reader-color-')) return { kind: 'color', color: HIGHLIGHT_COLORS[Number(id.at(-1)) - 1].id };
  return null;
}
