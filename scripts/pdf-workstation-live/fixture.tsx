import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { WorkspaceProvider, useWorkspace } from '../../src/renderer/components/context/WorkspaceContext';
import { PdfWorkstationPanel as Workstation } from '../../src/renderer/components/reader/PdfWorkstationPanel';
import { AnnotationsDrawer } from '../../src/renderer/components/reader/AnnotationsDrawer';
import type { AnnotationDTO } from '../../src/shared/types/annotation';
import { PdfTocEditor } from '../../src/renderer/components/reader/PdfTocEditor';
import { PdfNativeViewer } from '../../src/renderer/components/reader/PdfNativeViewer';
import * as pdfjs from 'pdfjs-dist';
import { warmPdfRasterHost } from '../../src/renderer/libs/reader/pdf-view-document';

declare global { interface Window { pdfFirstPaintPage?: number } }
const nativeUrl = new URLSearchParams(window.location.search).get('pdf');
function PdfWorkstationPanel(props: React.ComponentProps<typeof Workstation>) {
  const { t, dir } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [annotations, setAnnotations] = useState<AnnotationDTO[]>([{ id: 'fixture-note', bookId: 'fixture-work', type: 'note', locationCfiOrPage: '{"page":2,"rects":[]}', selectedText: 'تَأَمُّلٌ — Reflection', noteContent: 'A mixed-script annotation', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]);
  return <Workstation {...props} annotationPanel={{ open, count: annotations.length, onToggle: () => setOpen(value => !value), onClose: () => setOpen(false), content: <AnnotationsDrawer embedded isOpen={open} onClose={() => setOpen(false)} annotations={annotations} currentPage={1} bookTitle="Fixture" t={t} direction={dir} onJumpToPage={page => Object.assign(window, { pdfAnnotationJump: page })} onDeleteAnnotation={id => setAnnotations(previous => previous.filter(item => item.id !== id))} /> }} />;
}
Object.assign(window, { pdfFixtureMountStartedAt: performance.now() });
if (nativeUrl) pdfjs.GlobalWorkerOptions.workerPort = new Worker(new URL('./vendor/pdfjs/pdf.worker.min.mjs', window.location.href), { type: 'module' });
function Probe() { const workspace = useWorkspace(); const [blank, setBlank] = useState(false); const [workMountKey, setWorkMountKey] = useState(0); useEffect(() => { Object.assign(window, { pdfLive: workspace, pdfOpenBlank: () => setBlank(true), pdfOpenWork: () => { setWorkMountKey(k => k + 1); setBlank(false); } }); }, [workspace]); if (new URLSearchParams(window.location.search).get('toc')) return <PdfTocEditor totalPages={2} onApply={payload => Object.assign(window, { pdfTocApplied: payload })} />; return <PdfWorkstationPanel key={blank ? 'blank' : `work-${workMountKey}`} workId={blank ? undefined : 'fixture-work'} fileUrl={blank ? undefined : nativeUrl || undefined} readingActions={{ onReadAloud: () => Object.assign(window, { pdfReadAloudInvoked: true }), onAutoScroll: () => Object.assign(window, { pdfAutoScrollInvoked: true }), autoScrolling: false, onBookmark: () => Object.assign(window, { pdfBookmarkInvoked: true }), bookmarked: false }} readerIntegration={{ onTotalPagesLoaded: total => Object.assign(window, { pdfReaderPageCount: total }), onPdfDocLoaded: doc => Object.assign(window, { pdfReaderDocumentPages: doc.numPages }) }} onClose={() => setBlank(true)} />; }
function PerformanceProbe() {
  const workspace = useWorkspace();
  const [page, setPage] = useState(1), [total, setTotal] = useState(0);
  const [mode, setMode] = useState<'single' | 'scrolled'>('single');
  const [zoom, setZoom] = useState(1);
  const params = new URLSearchParams(window.location.search);
  const [active, setActive] = useState(!params.has('delayedOpen'));
  useEffect(() => {
    if (!params.has('delayedOpen')) return;
    warmPdfRasterHost();
    const stamp = (name: string) => { Object.assign(window, { [name]: performance.now() }); };
    const observer = new MutationObserver(() => {
      const scope = window as unknown as { pdfPreviewShownAt?: number; pdfOpenAt?: number };
      if (!scope.pdfPreviewShownAt && document.querySelector('[data-pdf-instant-preview]')) { stamp('pdfPreviewShownAt'); requestAnimationFrame(() => requestAnimationFrame(() => stamp('pdfPreviewPresentedAt'))); }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  useEffect(() => { Object.assign(window, { pdfLive: workspace, pdfPerformance: { setPage, setMode, setZoom, close: () => setActive(false), open: () => { Object.assign(window, { pdfOpenAt: performance.now(), pdfPreviewShownAt: 0, pdfPreviewPresentedAt: 0 }); setPage(window.pdfFirstPaintPage ?? 1); setActive(true); } } }); }, [workspace]);
  if (!active) return <div data-pdf-performance />;
  return <div data-pdf-performance style={{ width: '100vw', height: '100vh' }}><PdfNativeViewer zoom={zoom} useViewCache={new URLSearchParams(window.location.search).has('viewCache')} fileUrl={nativeUrl!} currentPage={page} totalPages={total} onPageChange={setPage} onTotalPagesLoaded={setTotal} onPdfDocLoaded={doc => Object.assign(window, { pdfDocumentReadyAt: performance.now(), pdfDocumentPages: doc.numPages, pdfTestDocument: doc })} onOutlineLoaded={() => Object.assign(window, { pdfOutlineLoadedAt: performance.now() })} viewMode={mode} /></div>;
}
createRoot(document.getElementById('root')!).render(<WorkspaceProvider>{new URLSearchParams(window.location.search).has('performance') ? <PerformanceProbe /> : <Probe />}</WorkspaceProvider>);
