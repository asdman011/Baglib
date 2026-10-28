import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { WorkspaceProvider, useWorkspace } from '../../src/renderer/components/context/WorkspaceContext';
import { PdfWorkstationPanel } from '../../src/renderer/components/reader/PdfWorkstationPanel';
function Probe() { const workspace = useWorkspace(); const [blank, setBlank] = useState(false); useEffect(() => { Object.assign(window, { pdfLive: workspace, pdfOpenBlank: () => setBlank(true) }); }, [workspace]); return <PdfWorkstationPanel key={blank ? 'blank' : 'work'} workId={blank ? undefined : 'fixture-work'} onClose={() => {}} />; }
createRoot(document.getElementById('root')!).render(<WorkspaceProvider><Probe /></WorkspaceProvider>);
