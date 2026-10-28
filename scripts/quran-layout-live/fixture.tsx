import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { WorkspaceProvider, useWorkspace } from '../../src/renderer/components/context/WorkspaceContext';
import { QuranReaderView } from '../../src/renderer/components/quran/QuranReaderView';
function Fixture() { const workspace = useWorkspace(); useEffect(() => { Object.assign(window, { quranLayout: workspace }); }, [workspace]); return <main dir={workspace.dir} className="h-screen bg-canvas text-main"><QuranReaderView /></main>; }
createRoot(document.getElementById('root')!).render(<WorkspaceProvider><Fixture /></WorkspaceProvider>);
