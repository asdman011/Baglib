import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { WorkspaceProvider, useWorkspace } from '../../src/renderer/components/context/WorkspaceContext';
import { BayanView } from '../../src/renderer/components/poetry/BayanView';
import { openPoetryReference } from '../../src/renderer/utils/poetry-navigation';

function Probe() {
  const workspace = useWorkspace();
  useEffect(() => { Object.assign(window, { poetryLive: workspace, poetryOpen: openPoetryReference }); }, [workspace]);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', workspace.theme === 'dark');
    document.documentElement.dir = workspace.dir;
  }, [workspace.theme, workspace.dir]);
  return <BayanView />;
}
createRoot(document.getElementById('root')!).render(<WorkspaceProvider><Probe /></WorkspaceProvider>);
