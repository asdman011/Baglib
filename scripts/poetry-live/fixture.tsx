import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { WorkspaceProvider, useWorkspace } from '../../src/renderer/components/context/WorkspaceContext';
import { BayanView } from '../../src/renderer/components/poetry/BayanView';
import { openPoetryReference } from '../../src/renderer/utils/poetry-navigation';
import { NotesOverviewView } from '../../src/renderer/components/notes/NotesOverviewView';
import { NavigationRail } from '../../src/renderer/components/layout/NavigationRail';

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
  useEffect(() => { Object.assign(window, { poetryLive: workspace, poetryOpen: openPoetryReference, poetryShowNotes: setShowNotes, poetryShowNavigation: setShowNavigation }); }, [workspace]);
  if (showNavigation) return <div dir={workspace.dir} className="flex h-full"><NavigationRail /><main className="min-w-0 flex-1">{workspace.viewMode === 'bayan' && <BayanView />}</main></div>;
  return showNotes ? <NotesOverviewView /> : <BayanView />;
}
createRoot(document.getElementById('root')!).render(<WorkspaceProvider><Probe /></WorkspaceProvider>);
