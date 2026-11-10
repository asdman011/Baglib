import type { TranslationKey } from '../../translations';

export const READER_CHROME_TABS = [
  { id: 'toc', label: 'readerPanelOutline' },
  { id: 'knowledge', label: 'readerPanelMarks' },
  { id: 'annotations', label: 'readerPanelNotes' },
  { id: 'search', label: 'readerPanelSearch' },
] as const satisfies readonly { id: string; label: TranslationKey }[];
export type ReaderChromeTab = typeof READER_CHROME_TABS[number]['id'];
export interface ReaderChromeState { tab: ReaderChromeTab; open: boolean; width: number }
export const readerChromeKey = (bookId: string) => `reader.chrome.v1:${bookId}`;
export const isReaderChromeTab = (value: unknown): value is ReaderChromeTab => READER_CHROME_TABS.some(tab => tab.id === value);
export function parseReaderChrome(value: unknown): ReaderChromeState {
  const saved = value && typeof value === 'object' ? value as Partial<ReaderChromeState> : {};
  return {
    tab: isReaderChromeTab(saved.tab) ? saved.tab : 'toc',
    open: saved.open === true,
    width: typeof saved.width === 'number' && Number.isFinite(saved.width) ? Math.max(280, Math.min(480, saved.width)) : 320,
  };
}
export function resizeReaderPanel(width: number, delta: number, dir: 'rtl' | 'ltr', viewport: number) {
  return Math.max(280, Math.min(480, viewport - 500, width + (dir === 'rtl' ? delta : -delta)));
}
