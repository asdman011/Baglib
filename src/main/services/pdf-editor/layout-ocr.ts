import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { probeExternalCapabilities } from './stirling';

export const OCR_LAYOUTS = ['columns', 'lines'] as const;
export type OcrLayout = typeof OCR_LAYOUTS[number];

/**
 * Tesseract page segmentation per layout, chosen from scripts/ocr-benchmark on Arabic print.
 * `lines` (6) read verse at 1.5-3% letter error where automatic segmentation scored 58%.
 * `columns` (3) is Tesseract's automatic mode, the only one that read two columns in order.
 */
export const LAYOUT_PAGE_SEGMENTATION: Record<OcrLayout, number> = { columns: 3, lines: 6 };
const TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Stirling has no page segmentation option, so a page-layout choice runs OCRmyPDF directly
 * with the same tools and language data Stirling uses.
 */
export async function ocrWithLayout(input: Uint8Array, options: { languages: string[]; layout: OcrLayout; force: boolean; deskew: boolean; signal?: AbortSignal }): Promise<Uint8Array> {
  const caps = probeExternalCapabilities();
  if (!caps.ocrmypdf.path || !caps.tesseract.path || !caps.tessdata.path) throw new Error('engine-missing');
  const languages = options.languages.filter(language => /^[a-z]{3}$/u.test(language));
  if (!languages.length) throw new Error('invalid-request');
  const work = await mkdtemp(path.join(os.tmpdir(), 'baglib-layout-ocr-'));
  try {
    const source = path.join(work, 'source.pdf');
    const target = path.join(work, 'output.pdf');
    await writeFile(source, input);
    const args = ['-l', languages.join('+'), '--tesseract-pagesegmode', String(LAYOUT_PAGE_SEGMENTATION[options.layout]), options.force ? '--force-ocr' : '--skip-text', '--output-type', 'pdf', '--optimize', '0', ...(options.deskew ? ['--deskew'] : []), source, target];
    const pathKey = Object.keys(process.env).find(key => key.toUpperCase() === 'PATH') ?? 'PATH';
    const tools = [caps.tesseract.path, caps.ghostscript.path].filter((tool): tool is string => Boolean(tool)).map(tool => path.dirname(tool));
    await new Promise<void>((resolve, reject) => {
      const child = spawn(caps.ocrmypdf.path!, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, TESSDATA_PREFIX: caps.tessdata.path, [pathKey]: [...tools, process.env[pathKey]].join(path.delimiter) } });
      let errors = '';
      const timer = setTimeout(() => child.kill(), TIMEOUT_MS);
      const abort = () => child.kill();
      options.signal?.addEventListener('abort', abort, { once: true });
      child.stderr.on('data', chunk => { errors = (errors + chunk).slice(-4000); });
      child.once('error', reject);
      child.once('exit', code => {
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', abort);
        if (options.signal?.aborted) reject(new Error('cancelled'));
        else if (code === 0) resolve();
        else reject(new Error(`ocr-failed: ${errors.trim().split('\n').pop() ?? code}`));
      });
    });
    return await readFile(target);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
