import type { QuranReaderSource } from '../../../shared/types/quran';

export type ReaderTab = 'commentary' | 'translation' | 'notes' | 'related' | 'recitation';
export interface ReaderChromeState { settings: boolean; panel: boolean; tab: ReaderTab }
export type ReaderChromeAction = { type: 'settings' } | { type: 'panel' } | { type: 'tab'; tab: ReaderTab } | { type: 'close' };
export function readerChromeState(state: ReaderChromeState, action: ReaderChromeAction): ReaderChromeState {
  switch (action.type) {
    case 'settings': return { ...state, settings: !state.settings, panel: false };
    case 'panel': return { ...state, panel: !state.panel, settings: false };
    case 'tab': return { ...state, tab: action.tab, panel: true, settings: false };
    case 'close': return { ...state, settings: false, panel: false };
  }
}

/** Every companion is selected within the script profile. Numbered targets reset on a profile change. */
export function readerProfileSelection(sources: QuranReaderSource[], script: string) {
  const profile = sources.find(source => source.kind === 'script' && source.id === script)?.profile;
  const find = (kind: QuranReaderSource['kind']) => sources.find(source => source.kind === kind && source.profile === profile)?.id || '';
  return { script, translation: find('translation'), tafsir: find('tafsir'), meanings: find('word-translation'), transliteration: find('word-transliteration'), ayahTransliteration: find('ayah-transliteration') };
}
