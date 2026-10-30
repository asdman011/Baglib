'use client';
import React, { useState } from 'react';
import { useTTSAudio } from '../../hooks/useTTSAudio';
import { useWorkspace } from '../context/WorkspaceContext';

export function EnglishPoetryNarration({ sentences }: { sentences: string[] }) {
  const { t } = useWorkspace();
  const [failed, setFailed] = useState(false);
  const narration = useTTSAudio({ language: 'en', onProviderNotice: () => setFailed(true) });
  return <div data-poetry-narration data-playback-state={narration.playbackState} data-sentence-index={narration.currentSentenceIndex} className="flex w-full flex-wrap gap-3">
    <button type="button" disabled={!sentences.some(text => text.trim())} onClick={() => { setFailed(false); narration.stop(); narration.setSentences(sentences); narration.playSentence(0); }}>{t('bayanReadSelection')}</button>
    <button type="button" disabled={!narration.isPlaying} onClick={narration.pause}>{t('bayanPause')}</button>
    {narration.playbackState === 'paused' && <button type="button" onClick={narration.play}>{t('bayanResume')}</button>}
    <button type="button" onClick={narration.stop}>{t('bayanStop')}</button>
    {failed && <p role="status">{t('ttsProviderUnavailable')}</p>}
  </div>;
}
