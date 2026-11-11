import { KnowledgeGraphButton } from '../../src/renderer/components/notes/KnowledgeGraph';
import { StirlingToolsHub, STIRLING_TOOLS } from '../../src/renderer/components/pdf-workstation/StirlingToolsHub';
import { QuranSimilarAyahsDrawer } from '../../src/renderer/components/quran/QuranSimilarAyahsDrawer';
import { QuranAyahInspector } from '../../src/renderer/components/quran/QuranAyahInspector';
import { CategoriesOverviewView } from '../../src/renderer/components/categories/CategoriesOverviewView';
import { StudyAssistant } from '../../src/renderer/components/notes/StudyAssistant';
import { ExplainBack } from '../../src/renderer/components/notes/ExplainBack';
import { TodayStudyPanel } from '../../src/renderer/components/dashboard/TodayStudyPanel';
import { CurriculumExamModal } from '../../src/renderer/components/dashboard/CurriculumExamModal';
import { OPDSHubModal } from '../../src/renderer/components/opds/OPDSHubModal';
import { WebClipperModal } from '../../src/renderer/components/clipper/WebClipperModal';
import { AudiobookPairingDialog } from '../../src/renderer/components/audiobook/AudiobookPairingDialog';
import { PdfTocEditor } from '../../src/renderer/components/reader/PdfTocEditor';
import { RSVPOverlay } from '../../src/renderer/components/reader/RSVPOverlay';
import { ParagraphOverlay } from '../../src/renderer/components/reader/ParagraphOverlay';
import { PdfReflowModal } from '../../src/renderer/components/reader/PdfReflowModal';
import { PdfAccessibilityDrawer } from '../../src/renderer/components/reader/PdfAccessibilityDrawer';
import { OcrInspectorDrawer } from '../../src/renderer/components/reader/OcrInspectorDrawer';
import { ExportModal } from '../../src/renderer/components/reader/ExportModal';
import { DictionaryLookupModal } from '../../src/renderer/components/reader/DictionaryLookupModal';
import { LibraryGridView } from '../../src/renderer/components/library/LibraryGridView';
import { BulkActionsToolbar } from '../../src/renderer/components/library/BulkActionsToolbar';
import { TrashBinModal } from '../../src/renderer/components/library/TrashBinModal';
import { OnlineLibraryHub } from '../../src/renderer/components/library/OnlineLibraryHub';
import { MetadataAuditModal } from '../../src/renderer/components/library/MetadataAuditModal';
import { ReturnBookModal } from '../../src/renderer/components/library/ReturnBookModal';
import { LendBookModal } from '../../src/renderer/components/library/LendBookModal';
﻿import React, { useEffect, useState } from 'react';
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

const cases = ['lend', 'return', 'audit', 'online', 'trash', 'dictionary', 'export-notes', 'ocr', 'accessibility', 'reflow', 'paragraph', 'rsvp', 'pairing', 'clipper', 'opds', 'exam', 'explain', 'assistant', 'ayah', 'similar', 'bulk', 'categories', 'today', 'toc', 'tools', 'graph', 'library', 'tool', 'modal', 'sheet', 'book', 'import', 'search', 'palette', 'providers', 'storage', 'geek', 'candidates', 'diff', 'editions', 'sync', 'ai', 'plugins', 'lock', 'statistics', 'wird', 'save-close', 'export-pdf', 'compare', 'reader-shortcuts'];
function Fixture() {
  const { books, lang, dir, t, setSearchHubOpen, setCommandPaletteOpen } = useWorkspace();
  const [active, setActive] = useState<string | null>(null);
  const close = () => setActive(null);
  const book = books.find(book => book.id === new URLSearchParams(location.search).get('book')) ?? books[0];
  const pageText = (window as Window & { a11yPageText?: string }).a11yPageText || book?.title || '';
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
    {active === 'library' && <LibraryGridView />}
    {active === 'categories' && <CategoriesOverviewView />}
    {active === 'today' && <TodayStudyPanel />}
    {active === 'toc' && <PdfTocEditor busy={false} totalPages={book?.pagesCount || 2} initialOutline={[{title: book?.title || '', page: 1}]} onApply={() => {}} />}
    {(active === 'tools' || active === 'tool') && <StirlingToolsHub initialView="pipelines" initialToolId={active === 'tool' ? STIRLING_TOOLS[0].id : undefined} onClose={close} />}
    {active === 'graph' && <KnowledgeGraphButton noteId="a11y-note" notes={[{id:'a11y-note', title:book?.title || '', content:'#KEY298', aliases:[], tags:['KEY298'], createdAt:'2026-11-11',updatedAt:'2026-11-11',revision:1}]} />}
    {active === 'bulk' && <BulkActionsToolbar selectedBookIds={books.map(book => book.id)} selectedBooks={books} allCategories={[]} onClearSelection={close} onOperationComplete={() => {}} />}
    {active === 'clipper' && <WebClipperModal isOpen onClose={close} />}
    {active === 'opds' && <OPDSHubModal isOpen onClose={close} />}
    {active === 'exam' && <CurriculumExamModal isOpen pathwayId={new URLSearchParams(location.search).get('pathway') || ''} pathwayName={book?.title || ''} onClose={close} onPlanApplied={() => {}} />}
    {active === 'assistant' && <StudyAssistant readerSource={{target:`book:${book?.id}:1`,label:book?.title || '',text:pageText}} notes={[]} initialNotes={[]} onClose={close} />}
    {active === 'explain' && <ExplainBack target={`book:${book?.id}:1`} label={book?.title || ''} onClose={close} onOpen={() => {}} />}
    {active === 'ayah' && <QuranAyahInspector details={null} reference={{surah:1,ayah:1}} surahName="KEY298" error={false} t={t} dir={dir} onClose={close} onCopy={() => {}} onStudy={() => {}} />}
    {active === 'similar' && <QuranSimilarAyahsDrawer surah={1} ayah={1} similarAyahs={[]} t={t} lang={lang} dir={dir} onClose={close} onNavigateAyah={() => {}} />}
    {book && <>
      {active === 'lend' && <LendBookModal isOpen book={book} onClose={close} onSuccess={() => {}} />}
      {active === 'return' && <ReturnBookModal isOpen book={book} activeLoan={{id:'a11y-loan',borrowerName:book.title,borrowDate:'2026-11-11',expectedReturnDate:'2026-11-18',isReturned:false}} onClose={close} onSuccess={() => {}} />}
      {active === 'audit' && <MetadataAuditModal isOpen booksToAudit={[book]} onClose={close} onUpdateBook={() => {}} />}
      {active === 'online' && <OnlineLibraryHub isOpen onClose={close} onImportBook={() => {}} />}
      {active === 'trash' && <TrashBinModal isOpen onClose={close} />}
      {active === 'dictionary' && <DictionaryLookupModal isOpen word={book.title} t={t} onClose={close} />}
      {active === 'export-notes' && <ExportModal isOpen activeBook={{id:book.id,title:book.title,author:book.author}} annotations={[]} t={t} direction={dir} onClose={close} />}
      {active === 'ocr' && <OcrInspectorDrawer isOpen pageResult={null} readingPage={1} engines={[]} selectedEngine="ocrmypdf" onSelectEngine={() => {}} onEnginesChanged={() => {}} onClose={close} />}
      {active === 'accessibility' && <PdfAccessibilityDrawer isOpen workId={book.id} onClose={close} />}
      {active === 'reflow' && <PdfReflowModal isOpen currentPage={1} totalPages={book.pagesCount || 2} pageText={pageText} docTitle={book.title} defaultDirection={dir} onPageChange={() => {}} onClose={close} />}
      {active === 'paragraph' && <ParagraphOverlay paragraphs={[pageText,book.title]} direction={dir} theme={localStorage.getItem('baglib-theme') === 'dark' ? 'dark' : 'light'} onClose={close} />}
      {active === 'rsvp' && <RSVPOverlay text={pageText} direction={dir} theme={localStorage.getItem('baglib-theme') === 'dark' ? 'dark' : 'light'} onClose={close} />}
      {active === 'pairing' && <AudiobookPairingDialog isOpen bookId={book.id} bookTitle={book.title} onClose={close} />}

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
