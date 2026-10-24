import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { WorkspaceProvider, useWorkspace } from '../../src/renderer/components/context/WorkspaceContext';
import { NavigationRail } from '../../src/renderer/components/layout/NavigationRail';
import { SunnahView } from '../../src/renderer/components/sunnah/SunnahView';

function Fixture() {
  const workspace = useWorkspace();
  useEffect(() => { workspace.setViewMode('sunnah'); }, []);
  useEffect(() => { Object.assign(window, { sunnahWorkspace: workspace }); }, [workspace]);
  return <div className="flex h-screen overflow-hidden bg-canvas text-main font-sans" dir={workspace.dir}>
    <NavigationRail />
    <main className="flex flex-col flex-1 min-w-0 min-h-0">{workspace.viewMode === 'sunnah' && <SunnahView />}</main>
  </div>;
}

createRoot(document.getElementById('root')!).render(<WorkspaceProvider><Fixture /></WorkspaceProvider>);
