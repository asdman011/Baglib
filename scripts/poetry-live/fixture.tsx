import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { WorkspaceProvider, useWorkspace } from '../../src/renderer/components/context/WorkspaceContext';
import { BayanView } from '../../src/renderer/components/poetry/BayanView';
import { openPoetryReference } from '../../src/renderer/utils/poetry-navigation';
import { NotesOverviewView } from '../../src/renderer/components/notes/NotesOverviewView';
import { NavigationRail } from '../../src/renderer/components/layout/NavigationRail';
import { TagEditor } from '../../src/renderer/components/tags/TagEditor';
import { TTSMiniPlayer } from '../../src/renderer/components/tts/TTSMiniPlayer';
import { AISettingsModal } from '../../src/renderer/components/ai/AISettingsModal';
import { ReaderPluginsModal } from '../../src/renderer/components/plugins/ReaderPluginsModal';
import { AudiobookPairingDialog } from '../../src/renderer/components/audiobook/AudiobookPairingDialog';
import { ProviderSettingsModal } from '../../src/renderer/components/library/ProviderSettingsModal';
import { MetadataDiffModal } from '../../src/renderer/components/library/MetadataDiffModal';
import { MetadataCandidatesModal } from '../../src/renderer/components/library/MetadataCandidatesModal';
import { LendBookModal } from '../../src/renderer/components/library/LendBookModal';
import { ReturnBookModal } from '../../src/renderer/components/library/ReturnBookModal';
import { EditionComparisonModal } from '../../src/renderer/components/library/EditionComparisonModal';

const sampleWork = { workId: 'layout-work', title: 'عنوان طويل — Metadata review fixture', authors: ['مؤلف — Author'], editions: [{ editionId: 'layout-edition', publisher: 'ناشر — Publisher', sources: [] }] };
const sampleBook = { id: 'layout-book', title: 'كتاب — Existing book', author: 'باحث', categories: [], tags: [], lendingHistory: [], bookType: 'digital' as const };

function ReviewFixture({ kind, onClose }: { kind: string; onClose: () => void }) {
  if (kind === 'lend') return <LendBookModal isOpen book={sampleBook} onClose={onClose} onSuccess={noAction} />;
  if (kind === 'return') return <ReturnBookModal isOpen book={sampleBook} activeLoan={{ id: 'fixture-loan', borrowerName: 'قارئ — Reader', borrowDate: '2026-11-01', expectedReturnDate: '2026-11-15', isReturned: false }} onClose={onClose} onSuccess={noAction} />;
  if (kind === 'edition') return <EditionComparisonModal isOpen book={sampleBook} onClose={onClose} onEnrichmentApplied={noAction} />;
  if (kind === 'providers') return <ProviderSettingsModal isOpen onClose={onClose} />;
  if (kind === 'diff') return <MetadataDiffModal isOpen currentBook={sampleBook} incomingWork={sampleWork} onClose={onClose} onApply={noAction} />;
  return <MetadataCandidatesModal isOpen candidates={[sampleWork]} selectedWork={sampleWork} onSelectWork={noAction} onProceed={noAction} onClose={onClose} />;
}

const noAction = () => {};
const playerProps: React.ComponentProps<typeof TTSMiniPlayer> = {
  bookTitle: 'عنوان طويل — A long audio title', playbackState: 'paused', playbackMode: 'tts', currentTime: 0, duration: 0, currentSentenceIndex: 2, totalSentences: 20, rate: 1, sleepRemainingSeconds: 300, voices: [], autoLanguageSwitch: false, audiobookPairing: null, isLyricsOpen: false,
  onTogglePlay: noAction, onStop: noAction, onSkipForward: noAction, onSkipBackward: noAction, onNextSentence: noAction, onPrevSentence: noAction, onSeek: noAction, onRateChange: noAction, onSleepTimerChange: noAction, onVoiceArChange: noAction, onVoiceEnChange: noAction, onToggleAutoSwitch: noAction, onToggleLyrics: noAction, onOpenPairingWizard: noAction,
};

if (new URLSearchParams(location.search).get('tts') === '1') {
  const sources = new Set<AudioBufferSourceNode>();
  const stats = { sources, starts: 0, stops: 0 };
  Object.assign(window, { poetryAudioProbe: stats });
  const create = AudioContext.prototype.createBufferSource;
  AudioContext.prototype.createBufferSource = function () {
    const source = create.call(this);
    const start = source.start.bind(source), stop = source.stop.bind(source);
    source.start = (when = 0, offset = 0, duration?: number) => {
      stats.starts++; sources.add(source);
      source.addEventListener('ended', () => sources.delete(source), { once: true });
      if (duration === undefined) start(when, offset); else start(when, offset, duration);
    };
    source.stop = (when = 0) => { stats.stops++; sources.delete(source); stop(when); };
    return source;
  };
}
function Probe() {
  const workspace = useWorkspace();
  const [showNotes, setShowNotes] = useState(false);
  const [showNavigation, setShowNavigation] = useState(false);
  const [showTags, setShowTags] = useState(false);
  const [showPlayer, setShowPlayer] = useState(false);
  const [dialog, setDialog] = useState<string | null>(null);
  useEffect(() => { Object.assign(window, { poetryShowDialog: setDialog }); }, []);
  useEffect(() => { Object.assign(window, { poetryShowPlayer: setShowPlayer }); }, []);
  const [tags, setTags] = useState<string[]>([]);
  useEffect(() => { Object.assign(window, { poetryShowTags: setShowTags }); }, []);
  useEffect(() => { Object.assign(window, { poetryLive: workspace, poetryOpen: openPoetryReference, poetryShowNotes: setShowNotes, poetryShowNavigation: setShowNavigation }); }, [workspace]);
  if (showNavigation) return <div dir={workspace.dir} className="flex h-full"><NavigationRail /><main className="min-w-0 flex-1">{workspace.viewMode === 'bayan' && <BayanView />}</main></div>;
  if (dialog && ['providers', 'diff', 'candidates', 'lend', 'return', 'edition'].includes(dialog)) return <section dir={workspace.dir} data-fixture-dialog={dialog}><ReviewFixture kind={dialog} onClose={() => setDialog(null)} /></section>;
  if (dialog) return <section dir={workspace.dir} data-fixture-dialog={dialog}>{dialog === 'ai' ? <AISettingsModal isOpen onClose={() => setDialog(null)} t={workspace.t} /> : dialog === 'plugins' ? <ReaderPluginsModal isOpen onClose={() => setDialog(null)} lang={workspace.lang} /> : <AudiobookPairingDialog isOpen bookId="layout-fixture" bookTitle="عنوان طويل — Audio pairing layout fixture" onClose={() => setDialog(null)} />}</section>;
  if (showPlayer) return <section dir={workspace.dir}><TTSMiniPlayer {...playerProps} /></section>;
  if (showTags) return <section dir={workspace.dir} className="p-4"><TagEditor value={tags} onChange={setTags} /></section>;
  return showNotes ? <NotesOverviewView /> : <BayanView />;
}
createRoot(document.getElementById('root')!).render(<WorkspaceProvider><Probe /></WorkspaceProvider>);
