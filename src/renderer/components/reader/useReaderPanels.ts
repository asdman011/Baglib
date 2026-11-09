'use client';
import { useMemo, useReducer, type SetStateAction } from 'react';

export const READER_PANELS = ['toc', 'knowledge', 'search', 'settings', 'ai', 'annotations', 'dictionary', 'ai-settings', 'ocr', 'lyrics', 'pairing', 'cloud', 'plugins', 'accessibility', 'document'] as const;
export type ReaderPanel = typeof READER_PANELS[number];
export interface ReaderPanelState { activePanel: ReaderPanel | null; tocPinned: boolean; knowledgePinned: boolean }
export type ReaderPanelAction = { type: 'set'; panel: ReaderPanel; value: SetStateAction<boolean> } | { type: 'pin'; panel: 'toc' | 'knowledge'; value: SetStateAction<boolean> } | { type: 'close'; except?: ReaderPanel };
export function readerPanelReducer(state: ReaderPanelState, action: ReaderPanelAction): ReaderPanelState {
  let activePanel = state.activePanel;
  if (action.type === 'close') activePanel = action.except || null;
  else if (action.type === 'set') {
    const open = typeof action.value === 'function' ? action.value(state.activePanel === action.panel) : action.value;
    activePanel = open ? action.panel : state.activePanel === action.panel ? null : state.activePanel;
  } else {
    const previous = action.panel === 'toc' ? state.tocPinned : state.knowledgePinned;
    const pinned = typeof action.value === 'function' ? action.value(previous) : action.value;
    if (pinned) activePanel = action.panel;
    return { activePanel, tocPinned: action.panel === 'toc' ? pinned : false, knowledgePinned: action.panel === 'knowledge' ? pinned : false };
  }
  return { activePanel, tocPinned: activePanel === 'toc' && state.tocPinned, knowledgePinned: activePanel === 'knowledge' && state.knowledgePinned };
}

export function useReaderPanels() {
  const [state, dispatch] = useReducer(readerPanelReducer, { activePanel: null, tocPinned: false, knowledgePinned: false });
  const setters = useMemo(() => Object.fromEntries(READER_PANELS.map(panel => [panel, (value: SetStateAction<boolean>) => dispatch({ type: 'set', panel, value })])) as Record<ReaderPanel, (value: SetStateAction<boolean>) => void>, []);
  return { ...state, setters, close: (except?: ReaderPanel) => dispatch({ type: 'close', except }), pinToc: (value: SetStateAction<boolean>) => dispatch({ type: 'pin', panel: 'toc', value }), pinKnowledge: (value: SetStateAction<boolean>) => dispatch({ type: 'pin', panel: 'knowledge', value }) };
}
