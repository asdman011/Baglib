import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { WorkspaceProvider, useWorkspace } from '../../src/renderer/components/context/WorkspaceContext';
import { BookDetailModal } from '../../src/renderer/components/library/BookDetailModal';
import { OnlineLibraryHub } from '../../src/renderer/components/library/OnlineLibraryHub';
import type { BookItem } from '../../src/shared/types/work';

function Fixture() {
  const workspace = useWorkspace();
  const [book, setBook] = useState<BookItem | null>(null);
  const [create, setCreate] = useState(false);
  const [open, setOpen] = useState(true);
  const [hub, setHub] = useState(false);
  useEffect(() => {
    Object.assign(window, { bookTest: { workspace, book, create, setHub, open: (book: BookItem, create = false) => { setBook(book); setCreate(create); setOpen(true); } } });
  }, [workspace, book, create]);
  return <div className="h-screen bg-canvas text-main" dir={workspace.dir}>
    <BookDetailModal book={book || workspace.books[0] || null} isOpen={open} isNew={create} onSave={saved => { if (create) workspace.addBook(saved); else workspace.updateBook(saved); }} onDelete={() => {}} onClose={() => setOpen(false)} onOpenVolume={(volume, create) => { setBook(volume); setCreate(create); }} />
    <OnlineLibraryHub isOpen={hub} onClose={() => setHub(false)} onImportBook={() => {}} />
  </div>;
}
createRoot(document.getElementById('root')!).render(<WorkspaceProvider><Fixture /></WorkspaceProvider>);
