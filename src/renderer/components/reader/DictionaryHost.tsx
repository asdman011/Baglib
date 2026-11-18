'use client';

/**
 * Baglib — app-wide dictionary windows (KEY-414): the lookup window and the Reading pad, opened from
 * the command palette, from the lookup window itself, or from the pad, by window events.
 */

import React, { useEffect, useState } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { DictionaryLookupModal } from './DictionaryLookupModal';
import { ReadingPad } from './ReadingPad';
import { OPEN_DICTIONARY_EVENT, OPEN_READING_PAD_EVENT } from '../../../shared/dictionary-features';

export function DictionaryHost() {
  const { t } = useWorkspace();
  const [lookup, setLookup] = useState<{ word: string; key: number } | null>(null);
  const [pad, setPad] = useState(false);
  useEffect(() => {
    const openLookup = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      setLookup({ word: typeof detail === 'string' ? detail.slice(0, 400) : '', key: Date.now() });
    };
    const openPad = () => setPad(true);
    window.addEventListener(OPEN_DICTIONARY_EVENT, openLookup);
    window.addEventListener(OPEN_READING_PAD_EVENT, openPad);
    return () => {
      window.removeEventListener(OPEN_DICTIONARY_EVENT, openLookup);
      window.removeEventListener(OPEN_READING_PAD_EVENT, openPad);
    };
  }, []);
  return (
    <>
      {lookup && <DictionaryLookupModal key={lookup.key} isOpen word={lookup.word} t={t} onClose={() => setLookup(null)} />}
      <ReadingPad open={pad} onClose={() => setPad(false)} />
    </>
  );
}
