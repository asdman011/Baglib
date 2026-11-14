import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PdfNativeViewer } from '../../src/renderer/components/reader/PdfNativeViewer';
import { PdfPageThumbnail } from '../../src/renderer/components/reader/PdfPageThumbnail';
import { PdfViewDocument } from '../../src/renderer/libs/reader/pdf-view-document';
import { useWorkspace } from './workspace';

const stats = { renders: 0, rendersAfterClose: 0, dispatches: 0, dispatchesAfterDispose: 0, destroyed: 0, documents: 0, errors: [] as string[] };
const originalRender = PdfViewDocument.prototype.render;
PdfViewDocument.prototype.render = function (...args) {
  stats.renders++;
  if (this.signal.aborted) stats.rendersAfterClose++;
  return originalRender.apply(this, args);
};
const originalDestroy = PdfViewDocument.prototype.destroy;
PdfViewDocument.prototype.destroy = function () {
  if (!this.signal.aborted) stats.destroyed++;
  return originalDestroy.call(this);
};
const post = Worker.prototype.postMessage;
const disposed = new WeakSet<Worker>();
Worker.prototype.postMessage = function (message, ...args) {
  if (message.type === 'render') {
    stats.dispatches++;
    if (disposed.has(this)) stats.dispatchesAfterDispose++;
  }
  if (message.type === 'dispose') disposed.add(this);
  return Reflect.apply(post, this, [message, ...args]);
};
window.addEventListener('error', event => stats.errors.push(event.message));
window.addEventListener('unhandledrejection', event => stats.errors.push(String(event.reason)));
function Fixture() {
  const { t, dir } = useWorkspace();
  const [url, setUrl] = useState<string | null>(null), [doc, setDoc] = useState<PdfViewDocument | null>(null);
  const [page, setPage] = useState(1);
  useEffect(() => { Object.assign(window, { lifecycle: { stats, open: (next: string) => { setDoc(null); setUrl(next); }, close: () => { setDoc(null); setUrl(null); }, doc: () => doc } }); }, [doc]);
  const loaded = React.useCallback((next: PdfViewDocument) => { stats.documents++; setDoc(next); }, []);
  return <div dir={dir} style={{ display: 'flex', height: '100vh', background: '#202025', color: 'white' }}>
    <aside data-thumbnails style={{ width: 180, overflowY: 'scroll', flexShrink: 0 }}>
      {doc && Array.from({ length: Math.min(80, doc.numPages) }, (_, index) => <div key={index} style={{ height: 180, paddingBlock: 8, paddingInline: 12 }}><PdfPageThumbnail document={doc} page={index + 1} alt={`${t('page')} ${index + 1}`} fallback={<span>{index + 1}</span>} /></div>)}
    </aside>
    <main style={{ flex: 1, minWidth: 0 }}>
      {url && <PdfNativeViewer fileUrl={url} useViewCache={false} currentPage={page} totalPages={doc?.numPages ?? 0} onPageChange={setPage} onPdfDocLoaded={loaded} direction={dir as 'rtl' | 'ltr'} />}
    </main>
  </div>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
