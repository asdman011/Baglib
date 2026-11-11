import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { WorkspaceProvider, useWorkspace } from '../../src/renderer/components/context/WorkspaceContext';
import { ToastProvider } from '../../src/renderer/components/ui/Toast';
import { Modal } from '../../src/renderer/components/ui/Modal';
import { Sheet } from '../../src/renderer/components/ui/Sheet';
import { ActionOverlays } from '../../src/renderer/components/actions/ActionOverlays';
import { CommandPalette } from '../../src/renderer/components/layout/CommandPalette';
import { SearchHubModal } from '../../src/renderer/components/search/SearchHubModal';
import { BookDetailModal } from '../../src/renderer/components/library/BookDetailModal';
import { ImportWizardModal } from '../../src/renderer/components/library/ImportWizardModal';
import { ProviderSettingsModal } from '../../src/renderer/components/library/ProviderSettingsModal';
import { StorageManagerModal } from '../../src/renderer/components/library/StorageManagerModal';
import { GeekMetadataModal } from '../../src/renderer/components/library/GeekMetadataModal';
import { MetadataCandidatesModal } from '../../src/renderer/components/library/MetadataCandidatesModal';
import { MetadataDiffModal } from '../../src/renderer/components/library/MetadataDiffModal';
import { EditionComparisonModal } from '../../src/renderer/components/library/EditionComparisonModal';
import { CloudSyncModal } from '../../src/renderer/components/sync/CloudSyncModal';
import { AISettingsModal } from '../../src/renderer/components/ai/AISettingsModal';
import { ReaderPluginsModal } from '../../src/renderer/components/plugins/ReaderPluginsModal';
import { AppLockModal } from '../../src/renderer/components/security/AppLockModal';
import { ReadingStatisticsModal } from '../../src/renderer/components/statistics/ReadingStatisticsModal';
import { QuranWirdSettingsModal } from '../../src/renderer/components/dashboard/QuranWirdSettingsModal';
import { SaveCloseDialog, ExportPdfDialog } from '../../src/renderer/components/reader/FileSaveUi';
import { PdfCompareDialog } from '../../src/renderer/components/reader/PdfCompareDialog';
import { ReaderShortcutSheet } from '../../src/renderer/components/reader/ReaderMarkupBar';
import type { BibliographicWork } from '../../src/shared/types/bibliographic';

const cases = ['modal', 'sheet', 'book', 'import', 'search', 'palette', 'providers', 'storage', 'geek', 'candidates', 'diff', 'editions', 'sync', 'ai', 'plugins', 'lock', 'statistics', 'wird', 'save-close', 'export-pdf', 'compare', 'reader-shortcuts'];
function Fixture() {
  const { books, lang, dir, t, setSearchHubOpen, setCommandPaletteOpen } = useWorkspace();
  const [active, setActive] = useState<string | null>(null);
  const close = () => setActive(null);
  const book = books.find(book => book.id === new URLSearchParams(location.search).get('book')) ?? books[0];
  const candidate: BibliographicWork = { workId: 'keyboard-candidate', title: book?.title ?? '', authors: [], editions: [] };
  useEffect(() => {
    document.documentElement.dir = dir;
    document.documentElement.lang = lang;
    document.documentElement.classList.toggle('dark', localStorage.getItem('baglib-theme') === 'dark');
  }, [dir, lang]);
  return <main dir={dir} data-a11y-fixture className="h-full overflow-auto bg-canvas p-4 text-main">
    <nav aria-label={t('shortcutGlobalScope')} className="flex flex-wrap gap-2">{cases.map(id => <button type="button" key={id} data-case={id} className="rounded-lg border border-subtle bg-surface px-3 py-2" onClick={() => { setActive(id); if (id === 'search') setSearchHubOpen(true); if (id === 'palette') setCommandPaletteOpen(true); }}>{id}</button>)}</nav>
    <input data-typing-input aria-label={t('searchPlaceholder')} className="m-2 rounded border border-subtle" />
    <textarea data-typing-textarea aria-label={t('writeNotePlaceholder')} className="m-2 rounded border border-subtle" />
    <div data-typing-editable contentEditable suppressContentEditableWarning aria-label={t('writeNotePlaceholder')} tabIndex={0} className="m-2 min-h-8 rounded border border-subtle">{book?.title}</div>
    <Modal open={active === 'modal'} onClose={close} title={t('readerShortcutsTitle')}><button type="button" onClick={close}>{t('close')}</button><button type="button" onClick={close}>{t('cancel')}</button></Modal>
    <Sheet open={active === 'sheet'} onClose={close} title={t('readerShortcutsTitle')}><button type="button" onClick={close}>{t('close')}</button><button type="button" onClick={close}>{t('cancel')}</button></Sheet>
    {book && <>
      {active === 'book' && <BookDetailModal isOpen={true} book={book} isNew={false} onClose={close} onSave={close} onDelete={close} />}
      {active === 'geek' && <GeekMetadataModal isOpen={true} book={book} onClose={close} />}
      {active === 'candidates' && <MetadataCandidatesModal isOpen={true} candidates={[candidate]} selectedWork={candidate} onSelectWork={() => {}} onProceed={close} onClose={close} />}
      {active === 'diff' && <MetadataDiffModal isOpen={true} currentBook={book} incomingWork={candidate} onApply={close} onClose={close} />}
      {active === 'editions' && <EditionComparisonModal isOpen={true} book={book} onClose={close} onEnrichmentApplied={close} />}
      {active === 'save-close' && <SaveCloseDialog title={book.title} busy={false} onSave={close} onDiscard={close} onCancel={close} t={t} />}
      {active === 'export-pdf' && <ExportPdfDialog workId={book.id} pages={book.pagesCount || 2} onClose={close} t={t} lang={lang} dir={dir} />}
      {active === 'compare' && <PdfCompareDialog workId={book.id} onJump={() => {}} onClose={close} />}
    </>}
    {active === 'import' && <ImportWizardModal isOpen={true} onClose={close} />}
    {active === 'providers' && <ProviderSettingsModal isOpen={true} onClose={close} />}
    {active === 'storage' && <StorageManagerModal isOpen={true} onClose={close} books={books} />}
    {active === 'sync' && <CloudSyncModal isOpen={true} onClose={close} />}
    {active === 'ai' && <AISettingsModal isOpen={true} onClose={close} t={t} />}
    {active === 'plugins' && <ReaderPluginsModal isOpen={true} onClose={close} lang={lang} />}
    {active === 'lock' && <AppLockModal isOpen={true} onClose={close} lang={lang} />}
    {active === 'statistics' && <ReadingStatisticsModal isOpen={true} onClose={close} lang={lang} />}
    {active === 'wird' && <QuranWirdSettingsModal isOpen={true} onClose={close} />}
    {active === 'reader-shortcuts' && <ReaderShortcutSheet onClose={close} t={t} />}
    <CommandPalette /><SearchHubModal /><ActionOverlays />
  </main>;
}
createRoot(document.getElementById('root')!).render(<WorkspaceProvider><ToastProvider><Fixture /></ToastProvider></WorkspaceProvider>);
