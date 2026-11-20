/**
 * KEY-439 (AI Task 5, Phase 2): PDF operation runner & inspector for AI Actions.
 *
 * Reuses BagLib's existing PDF tooling:
 * - `pdfjs-dist/legacy/build/pdf.mjs` for page-count and text-layer inspection
 * - `runStirlingPdf` (`pdf-editor/stirling.ts`) + `pdfEngineTools()` for split, merge, extract, rotate
 * - `OcrService.getInstance().recognizePdfPage` (`ocr/ocr.service.ts`) for single-page OCR
 *
 * Outputs are always written as NEW files next to the source PDF; originals are never overwritten.
 */
import fs from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { OcrLanguage } from '../../../../shared/types/ocr';
import { OcrService } from '../../ocr/ocr.service';
import { runStirlingPdf } from '../../pdf-editor/stirling';
import { pdfEngineTools } from '../../pdf-editor/tools';

export interface PdfInspectionSummary {
  totalPages: number;
  pageHasText?: boolean;
}

export interface PdfActionsRunner {
  splitPdf(params: {
    sourcePath: string;
    expectedHash: string;
    totalPages: number;
    groups?: number[][];
    pagesPerFile?: number;
    outputPaths: string[];
    language: 'ar' | 'en';
  }): Promise<string[]>;
  mergePdfs(params: {
    sources: Array<{ path: string; sha256: string; totalPages: number }>;
    outputPath: string;
    language: 'ar' | 'en';
  }): Promise<string[]>;
  extractPdfPages(params: {
    sourcePath: string;
    expectedHash: string;
    pages: number[];
    outputPath: string;
    language: 'ar' | 'en';
  }): Promise<string[]>;
  rotatePdfPages(params: {
    sourcePath: string;
    expectedHash: string;
    totalPages: number;
    pages: number[];
    angle: 90 | 180 | 270;
    outputPath: string;
    language: 'ar' | 'en';
  }): Promise<string[]>;
  ocrPdfPage(params: {
    sourcePath: string;
    page: number;
    ocrLanguage: OcrLanguage;
    outputPath: string;
  }): Promise<string[]>;
}

export async function inspectPdfFile(pdfPath: string, checkTextPage?: number): Promise<PdfInspectionSummary> {
  const data = await readFile(pdfPath);
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loading = pdfjs.getDocument({
    data: new Uint8Array(data),
    isEvalSupported: false,
    enableXfa: false,
    verbosity: 0,
  });
  try {
    const doc = await loading.promise;
    const totalPages = doc.numPages;
    if (totalPages > 10_000) throw new Error('document-too-large');
    let pageHasText: boolean | undefined;
    if (checkTextPage !== undefined && checkTextPage >= 1 && checkTextPage <= totalPages) {
      const page = await doc.getPage(checkTextPage);
      const content = await page.getTextContent();
      const text = content.items
        .map(item => ('str' in item && typeof item.str === 'string' ? item.str : ''))
        .join('')
        .trim();
      pageHasText = text.length > 0;
    }
    return { totalPages, ...(pageHasText !== undefined ? { pageHasText } : {}) };
  } finally {
    await loading.destroy();
  }
}

export function uniqueOutputPaths(
  sourcePath: string,
  count: number,
  suffix: string,
  ext = '.pdf',
  reserved: Set<string> = new Set()
): string[] {
  const dir = path.dirname(sourcePath);
  const stem = path.basename(sourcePath, path.extname(sourcePath));
  const paths: string[] = [];

  for (let i = 0; i < count; i++) {
    const partLabel = count > 1 ? `-${i + 1}` : '';
    let attempt = 0;
    let candidate = '';
    for (;;) {
      const dedupe = attempt > 0 ? `-${attempt + 1}` : '';
      candidate = path.join(dir, `${stem}-${suffix}${partLabel}${dedupe}${ext}`);
      if (!fs.existsSync(candidate) && !reserved.has(candidate)) {
        reserved.add(candidate);
        break;
      }
      attempt++;
    }
    paths.push(candidate);
  }
  return paths;
}

function mapOcrLanguage(lang?: 'ara' | 'eng' | 'ara+eng' | 'auto'): OcrLanguage {
  if (lang === 'ara' || lang === 'eng') return lang;
  if (lang === 'ara+eng') return 'ara+eng';
  return 'auto';
}

export function createDefaultPdfActionsRunner(): PdfActionsRunner {
  return {
    async splitPdf({ sourcePath, expectedHash, totalPages, groups, pagesPerFile, outputPaths, language }) {
      const tools = pdfEngineTools();
      const tempDir = await mkdtemp(path.join(os.tmpdir(), 'baglib-ai-split-'));
      const controller = new AbortController();
      const created: string[] = [];
      try {
        if (groups && groups.length > 0) {
          for (let i = 0; i < groups.length; i++) {
            const jobDir = path.join(tempDir, `g-${i}`);
            await mkdir(jobDir, { recursive: true });
            const res = await runStirlingPdf(
              tools,
              {
                filename: sourcePath,
                output: path.join(jobDir, 'document.pdf'),
                operation: 'organize',
                language,
                expectedHash,
                payload: { pages: groups[i].map(page => ({ page })) },
              },
              controller.signal,
              () => {}
            );
            const first = res.outputs?.[0];
            if (!first) throw new Error('invalid-output');
            await copyFile(path.join(jobDir, first.filename), outputPaths[i]);
            created.push(outputPaths[i]);
          }
          return created;
        }

        const perFile = pagesPerFile ?? 1;
        const allPages = Array.from({ length: totalPages }, (_, idx) => ({ page: idx + 1 }));
        const res = await runStirlingPdf(
          tools,
          {
            filename: sourcePath,
            output: path.join(tempDir, 'document.pdf'),
            operation: 'split',
            language,
            expectedHash,
            payload: { pages: allPages, pagesPerFile: perFile },
          },
          controller.signal,
          () => {}
        );
        const outputs = res.outputs ?? [];
        if (outputs.length === 0) throw new Error('invalid-output');
        const reserved = new Set<string>();
        const targets =
          outputs.length === outputPaths.length
            ? outputPaths
            : uniqueOutputPaths(sourcePath, outputs.length, 'split', '.pdf', reserved);
        for (let i = 0; i < outputs.length; i++) {
          await copyFile(path.join(tempDir, outputs[i].filename), targets[i]);
          created.push(targets[i]);
        }
        return created;
      } finally {
        await rm(tempDir, { recursive: true, force: true }).catch(() => {});
      }
    },

    async mergePdfs({ sources, outputPath, language }) {
      const tools = pdfEngineTools();
      const tempDir = await mkdtemp(path.join(os.tmpdir(), 'baglib-ai-merge-'));
      const controller = new AbortController();
      try {
        const extraSources: Record<string, { filename: string; sha256: string }> = {};
        const planPages: Array<{ sessionId?: string; page: number }> = [];
        for (let idx = 0; idx < sources.length; idx++) {
          const src = sources[idx];
          const sessionId = idx === 0 ? 'current' : `src-${idx}`;
          if (idx > 0) extraSources[sessionId] = { filename: src.path, sha256: src.sha256 };
          for (let p = 1; p <= src.totalPages; p++) {
            planPages.push(idx === 0 ? { page: p } : { sessionId, page: p });
          }
        }
        const res = await runStirlingPdf(
          tools,
          {
            filename: sources[0].path,
            output: path.join(tempDir, 'document.pdf'),
            operation: 'organize',
            language,
            expectedHash: sources[0].sha256,
            sources: extraSources,
            payload: { pages: planPages },
          },
          controller.signal,
          () => {}
        );
        const first = res.outputs?.[0];
        if (!first) throw new Error('invalid-output');
        await copyFile(path.join(tempDir, first.filename), outputPath);
        return [outputPath];
      } finally {
        await rm(tempDir, { recursive: true, force: true }).catch(() => {});
      }
    },

    async extractPdfPages({ sourcePath, expectedHash, pages, outputPath, language }) {
      const tools = pdfEngineTools();
      const tempDir = await mkdtemp(path.join(os.tmpdir(), 'baglib-ai-extract-'));
      const controller = new AbortController();
      try {
        const res = await runStirlingPdf(
          tools,
          {
            filename: sourcePath,
            output: path.join(tempDir, 'document.pdf'),
            operation: 'organize',
            language,
            expectedHash,
            payload: { pages: pages.map(page => ({ page })) },
          },
          controller.signal,
          () => {}
        );
        const first = res.outputs?.[0];
        if (!first) throw new Error('invalid-output');
        await copyFile(path.join(tempDir, first.filename), outputPath);
        return [outputPath];
      } finally {
        await rm(tempDir, { recursive: true, force: true }).catch(() => {});
      }
    },

    async rotatePdfPages({ sourcePath, expectedHash, totalPages, pages, angle, outputPath, language }) {
      const tools = pdfEngineTools();
      const tempDir = await mkdtemp(path.join(os.tmpdir(), 'baglib-ai-rotate-'));
      const controller = new AbortController();
      try {
        const selected = new Set(pages);
        const planPages = Array.from({ length: totalPages }, (_, idx) => {
          const page = idx + 1;
          return { page, rotation: selected.has(page) ? angle : 0 };
        });
        const res = await runStirlingPdf(
          tools,
          {
            filename: sourcePath,
            output: path.join(tempDir, 'document.pdf'),
            operation: 'organize',
            language,
            expectedHash,
            payload: { pages: planPages },
          },
          controller.signal,
          () => {}
        );
        const first = res.outputs?.[0];
        if (!first) throw new Error('invalid-output');
        await copyFile(path.join(tempDir, first.filename), outputPath);
        return [outputPath];
      } finally {
        await rm(tempDir, { recursive: true, force: true }).catch(() => {});
      }
    },

    async ocrPdfPage({ sourcePath, page, ocrLanguage, outputPath }) {
      const result = await OcrService.getInstance().recognizePdfPage(sourcePath, page, ocrLanguage);
      await writeFile(outputPath, result.text ?? '', 'utf8');
      return [outputPath];
    },
  };
}

export { mapOcrLanguage };
