import { readFile } from 'node:fs/promises';
import { parentPort, workerData } from 'node:worker_threads';
import pdfParse from 'pdf-parse';

// Custom page renderer to accurately capture page boundaries
function renderPageText(pageData: import('pdf-parse').PdfParsePage) {
  return pageData.getTextContent().then(function (textContent: import('pdf-parse').PdfTextContent) {
    let lastY: number | undefined;
    let text = '';
    for (const item of textContent.items) {
      if (lastY === item.transform[5] || lastY === undefined) text += item.str;
      else text += '\n' + item.str;
      lastY = item.transform[5];
    }
    return '\n---PAGE_SPLIT_MARKER---\n' + text;
  });
}

/** Parsing a whole book takes seconds, so it runs here rather than on the thread that serves the viewer. */
async function extract(filename: string) {
  const data = await readFile(filename);
  if (data.length < 10 || !data.subarray(0, 1024).toString('latin1').includes('%PDF-')) {
    console.warn('[baglib:pdf-text] Skipped non-PDF or corrupt file');
    return null;
  }
  const warn = console.warn;
  // Suppress verbose internal pdf.js font warnings that flood dev terminal
  console.warn = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].includes('Ran out of space in font private use area')) return;
    warn.apply(console, args);
  };
  let parsed: import('pdf-parse').PdfParseResult;
  try { parsed = await pdfParse(new Uint8Array(data), { pagerender: renderPageText }); }
  finally { console.warn = warn; }
  const rawText = parsed.text || '';
  const cleanText = rawText.replace(/---PAGE_SPLIT_MARKER---/g, '').trim();
  const numPages = parsed.numpages || 1;
  const avgCharsPerPage = cleanText.length / numPages;
  // Check if average text per page is less than 50 characters (Watermark/ID-only scanned PDF)
  const isScannedImagePdf = avgCharsPerPage < 50;
  return { text: isScannedImagePdf ? '' : rawText, numpages: numPages, info: parsed.info || {}, isScannedImagePdf, avgCharsPerPage, totalChars: cleanText.length };
}

void extract(workerData.filename as string).then(result => parentPort?.postMessage({ result }), error => parentPort?.postMessage({ error: String(error?.message || error) }));
