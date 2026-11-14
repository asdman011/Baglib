import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { WorkspaceProvider, useWorkspace } from '../../src/renderer/components/context/WorkspaceContext';
import { ImportWizardModal } from '../../src/renderer/components/library/ImportWizardModal';
import { routeBookDrop } from '../../src/renderer/utils/book-drop';

function Fixture() {
  const workspace = useWorkspace();
  const [paths, setPaths] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    Object.assign(window, { importTest: { workspace, setPaths, setOpen, routeBookDrop } });
  }, [workspace]);
  return <div className="h-screen bg-canvas text-main" dir={workspace.dir}>
    <ImportWizardModal isOpen={open} initialPaths={paths} onClose={() => setOpen(false)} />
  </div>;
}
createRoot(document.getElementById('root')!).render(<WorkspaceProvider><Fixture /></WorkspaceProvider>);
