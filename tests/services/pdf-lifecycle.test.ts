import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { readFileSync } from 'node:fs';
import { pdfThumbnail } from '../../src/renderer/libs/reader/pdf-thumbnails';
import type { PdfViewDocument } from '../../src/renderer/libs/reader/pdf-view-document';
import { waitForPdfPreview } from '../../src/renderer/libs/reader/pdf-preview-work';

const tick = () => new Promise<void>(resolve => setImmediate(resolve));
function bundled(entry: string, pdfjs: object, extra: Record<string, unknown> = {}) {
  const code = buildSync({ entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['pdfjs-dist'] }).outputFiles[0].text;
  const testModule = { exports: {} as Record<string, unknown> };
  const sandbox = { module: testModule, exports: testModule.exports, require: (name: string) => { assert.equal(name, 'pdfjs-dist'); return pdfjs; }, AbortController, URL, setTimeout, clearTimeout, console, ...extra };
  runInNewContext(code, sandbox);
  return { api: testModule.exports, sandbox };
}

test('thumbnails abort active work, skip queued work and reject requests after document destruction', async () => {
  const owner = new AbortController();
  const pages: number[] = [];
  let renderSignal!: AbortSignal;
  const doc = { signal: owner.signal, render: (page: number, _scale: number, _dpr: number, signal: AbortSignal) => {
    pages.push(page); renderSignal = signal;
    return new Promise<null>(resolve => signal.addEventListener('abort', () => resolve(null), { once: true }));
  } } as unknown as PdfViewDocument;
  const first = pdfThumbnail(doc, 1), duplicate = pdfThumbnail(doc, 1), queued = pdfThumbnail(doc, 2);
  assert.equal(first, duplicate);
  await tick();
  owner.abort();
  assert.equal(renderSignal.aborted, true);
  assert.deepEqual(await Promise.all([first, queued, pdfThumbnail(doc, 3)]), [null, null, null]);
  assert.deepEqual(pages, [1]);
});

test('thumbnails close a late bitmap without drawing it after document destruction', async () => {
  const owner = new AbortController();
  let finish!: (bitmap: ImageBitmap) => void, closed = 0;
  const doc = { signal: owner.signal, render: () => new Promise<ImageBitmap>(resolve => { finish = resolve; }) } as unknown as PdfViewDocument;
  const thumbnail = pdfThumbnail(doc, 1);
  await tick(); owner.abort();
  finish({ close: () => closed++ } as unknown as ImageBitmap);
  assert.equal(await thumbnail, null);
  assert.equal(closed, 1);
});

test('preview timer is cleared on viewer unmount and on document replacement', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  for (const close of ['viewer', 'document']) {
    const viewer = new AbortController(), document = new AbortController();
    let completed = 0;
    const waiting = waitForPdfPreview(viewer.signal, document.signal).then(ready => { if (ready) completed++; return ready; });
    (close === 'viewer' ? viewer : document).abort();
    assert.equal(await waiting, false);
    context.mock.timers.tick(1000);
    assert.equal(completed, 0);
  }
  const source = readFileSync('src/renderer/components/reader/PdfNativeViewer.tsx', 'utf8');
  assert.match(source, /useEffect\(\(\) => \(\) => \{ previewWork.current\?\.abort\(\); previewWork.current = null; \}, \[fileUrl, viewingUrl\]\)/u);
});

test('preview becomes ready only after its delay while both owners remain alive', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const viewer = new AbortController(), document = new AbortController();
  const waiting = waitForPdfPreview(viewer.signal, document.signal);
  context.mock.timers.tick(600);
  assert.equal(await waiting, true);
});

test('fallback parser task.destroy and controller.abort run once when the viewer closes', async () => {
  let destroyed = 0;
  const proxy = { numPages: 3 };
  const { api } = bundled('src/renderer/libs/reader/pdf-view-document.ts', {
    GlobalWorkerOptions: { workerPort: {} }, PDFDataRangeTransport: class {},
    getDocument: () => ({ promise: Promise.resolve(proxy), destroy: async () => { destroyed++; } }),
  }, { window: {} });
  const View = api.PdfViewDocument as typeof PdfViewDocument;
  const doc = await View.open('https://fixture/book.pdf', new AbortController().signal, () => {});
  let aborted = 0;
  doc.signal.addEventListener('abort', () => aborted++);
  await doc.destroy(); await doc.destroy();
  assert.equal(doc.signal.aborted, true);
  assert.equal(aborted, 1); assert.equal(destroyed, 1);
  assert.equal(await doc.render(1, 1, 1, new AbortController().signal), null);
  await assert.rejects(doc.pageInfo(1), /cancelled/u);
});

for (const mode of ['resolve', 'reject', 'hang'] as const) {
  test(`raster worker destroys its independent nested parser before termination (${mode})`, async context => {
    context.mock.timers.enable({ apis: ['setTimeout'] });
    const events: string[] = [];
    let finish!: () => void, reject!: (error: Error) => void;
    const task = { promise: Promise.resolve({ numPages: 1, getPage: async () => ({ getViewport: () => ({ width: 1, height: 1 }) }) }), destroy: () => {
      events.push('destroy');
      return new Promise<void>((resolve, fail) => { finish = resolve; reject = fail; });
    } };
    const { sandbox } = bundled('assets/pdf-raster-worker.ts', {
      PDFDataRangeTransport: class {}, GlobalWorkerOptions: {}, getDocument: () => task,
    }, {
      Worker: class { terminate() { events.push('terminate'); } },
      fonts: {}, postMessage: () => {},
      fetch: async (_url: string, init: RequestInit) => {
        init.signal?.addEventListener('abort', () => events.push('abort'), { once: true });
        return init.method === 'HEAD' ? new Response(null, { headers: { 'Content-Length': '8', 'Accept-Ranges': 'bytes' } }) : new Response(new Uint8Array(8), { status: 206, headers: { 'Content-Range': 'bytes 0-7/8' } });
      },
    });
    const emit = (data: object) => (sandbox as unknown as { onmessage: (event: { data: object }) => void }).onmessage({ data });
    emit({ type: 'init', url: 'https://fixture/book.pdf', assets: 'https://fixture/vendor/' });
    await tick();
    emit({ type: 'dispose' }); emit({ type: 'dispose' });
    assert.equal(events.at(-1), 'destroy');
    assert.ok(events.includes('abort'));
    assert.ok(!events.includes('terminate'));
    if (mode === 'resolve') finish();
    if (mode === 'reject') reject(new Error('parser failed'));
    if (mode === 'hang') context.mock.timers.tick(200);
    await tick();
    assert.equal(events.at(-1), 'terminate');
    assert.equal(events.filter(event => event === 'destroy').length, 1);
    assert.equal(events.filter(event => event === 'terminate').length, 1);
    emit({ type: 'render', id: 99, page: 1 });
    await tick();
    assert.equal(events.at(-1), 'terminate');
  });
}


test('viewer effect cleanup cancels its actual scheduled preview on unmount or source change', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const effects: { run: () => (() => void) | undefined; deps: unknown[] }[] = [];
  const callbacks: ((...args: unknown[]) => unknown)[] = [];
  const react = {
    memo: (component: (...args: unknown[]) => unknown) => component,
    useRef: (current: unknown) => ({ current }),
    useState: (initial: unknown) => [typeof initial === 'function' ? initial() : initial, () => {}],
    useEffect: (run: () => (() => void) | undefined, deps: unknown[]) => effects.push({ run, deps }),
    useCallback: (fn: (...args: unknown[]) => unknown) => { callbacks.push(fn); return fn; },
    useMemo: (fn: () => unknown) => fn(),
    createElement: () => null,
  };
  const code = buildSync({ entryPoints: ['src/renderer/components/reader/PdfNativeViewer.tsx'], bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'transform', external: ['*'] }).outputFiles[0].text;
  const testModule = { exports: {} as { PdfNativeViewer: (props: object) => unknown } };
  const clear = context.mock.method(globalThis, 'clearTimeout');
  runInNewContext(code, {
    module: testModule, exports: testModule.exports, AbortController, setTimeout, clearTimeout: globalThis.clearTimeout,
    require: (name: string) => {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx: () => null, jsxs: () => null };
      if (name.endsWith('WorkspaceContext')) return { useWorkspace: () => ({ t: (key: string) => key }) };
      if (name.endsWith('usePdfViewSource')) return { usePdfViewSource: () => ({ url: 'fixture.pdf', savePreview: () => assert.fail('Stale preview saved') }) };
      if (name.endsWith('pdf-preview-work')) return { waitForPdfPreview };
      return {};
    },
  });
  for (const close of ['unmount', 'source-change']) {
    effects.length = 0; callbacks.length = 0;
    testModule.exports.PdfNativeViewer({ fileUrl: 'fixture.pdf', currentPage: 1, totalPages: 1, onPageChange: () => {} });
    const cleanup = effects.find(effect => effect.deps?.length === 2 && effect.deps.every(dep => dep === 'fixture.pdf'))?.run();
    assert.equal(typeof cleanup, 'function', close);
    const painted = callbacks.find(callback => callback.toString().includes('paintBarrier.current'));
    assert.ok(painted);
    painted({ signal: new AbortController().signal }, 1);
    const before = clear.mock.callCount();
    cleanup!();
    await Promise.resolve();
    assert.ok(clear.mock.callCount() > before, close + ' clears timer');
    context.mock.timers.tick(1000);
  }
});

test('closing during fallback initialization destroys its loading task without waiting for it to open', async () => {
  let destroyed = 0, started!: () => void;
  const running = new Promise<void>(resolve => { started = resolve; });
  const { api } = bundled('src/renderer/libs/reader/pdf-view-document.ts', {
    GlobalWorkerOptions: { workerPort: {} }, PDFDataRangeTransport: class {},
    getDocument: () => { started(); return { promise: new Promise(() => {}), destroy: async () => { destroyed++; } }; },
  }, { window: {} });
  const View = api.PdfViewDocument as typeof PdfViewDocument;
  const close = new AbortController();
  const opening = View.open('https://fixture/book.pdf', close.signal, () => {});
  await running; close.abort();
  await assert.rejects(opening, /cancelled/u);
  assert.equal(destroyed, 1);
});
