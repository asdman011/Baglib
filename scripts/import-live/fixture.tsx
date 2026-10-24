import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { WorkspaceProvider, useWorkspace } from '../../src/renderer/components/context/WorkspaceContext';
import { ImportWizardModal } from '../../src/renderer/components/library/ImportWizardModal';

function Fixture() {
  const workspace = useWorkspace();
  const [paths, setPaths] = useState<string[]>([]);
  useEffect(() => { Object.assign(window, { importTest: { workspace, setPaths } }); }, [workspace]);
  return <div className="h-screen bg-canvas text-main" dir={workspace.dir}>
    <ImportWizardModal isOpen initialPaths={paths} onClose={() => {}} />
  </div>;
}

createRoot(document.getElementById('root')!).render(<WorkspaceProvider><Fixture /></WorkspaceProvider>);
