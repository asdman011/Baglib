import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { WorkspaceProvider, useWorkspace } from '../../src/renderer/components/context/WorkspaceContext';
import { SunnahView } from '../../src/renderer/components/sunnah/SunnahView';
import { consumeQuranAyah } from '../../src/renderer/utils/quran-navigation';
function Fixture() {
  const workspace = useWorkspace();
  useEffect(() => { Object.assign(window, { sunnahLive: workspace }); }, [workspace]);
  useEffect(() => {
    const capture=()=>Object.assign(window,{sunnahQuranTarget:consumeQuranAyah()});
    window.addEventListener('baglib:quran-open',capture);
    return ()=>window.removeEventListener('baglib:quran-open',capture);
  },[]);
  return <main className="h-screen flex bg-canvas text-main" dir={workspace.dir}><SunnahView /></main>;
}
createRoot(document.getElementById('root')!).render(<WorkspaceProvider><Fixture /></WorkspaceProvider>);
