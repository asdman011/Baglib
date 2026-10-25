let workerUrl;
let worker;

window.initializeCoverRenderer = ({ workerScript }) => {
  workerUrl = URL.createObjectURL(new Blob([workerScript], { type: 'text/javascript' }));
  worker = new Worker(workerUrl, { type: 'module' });
  globalThis.baglibCoverPdfjs.GlobalWorkerOptions.workerPort = worker;
};

window.renderCoverPages = async ({ url, pages, width, cMapUrl, standardFontDataUrl }) => {
  const task = globalThis.baglibCoverPdfjs.getDocument({ url, cMapUrl, cMapPacked: true, standardFontDataUrl, isEvalSupported: false });
  try {
    const document = await task.promise;
    const totalPages = Math.min(5, document.numPages);
    const selected = [...new Set(pages.map(page => Math.max(1, Math.min(page, totalPages))))];
    const results = [];
    for (const number of selected) {
      const page = await document.getPage(number);
      const natural = page.getViewport({ scale: 1 });
      const scale = Math.min(width / natural.width, Math.sqrt(4_000_000 / (natural.width * natural.height)));
      const viewport = page.getViewport({ scale });
      const canvas = window.document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      try {
        await page.render({ canvasContext: canvas.getContext('2d'), viewport, background: 'rgb(255,255,255)' }).promise;
        results.push({ currentPage: number, totalPages, documentPages: document.numPages, dataUrl: canvas.toDataURL('image/jpeg', 0.9) });
      } finally {
        canvas.width = 0;
        canvas.height = 0;
        page.cleanup();
      }
    }
    return results;
  } finally { await task.destroy(); }
};

window.addEventListener('unload', () => {
  worker?.terminate();
  if (workerUrl) URL.revokeObjectURL(workerUrl);
});
