import fs from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { app } from 'electron';
import { randomUUID } from 'node:crypto';
import { publishPdfOutput } from './publication';
import { fileSha256 } from './source';
import type { PdfEngineTools } from './python';
import type {
  PdfAccessibilityBaseReport,
  PdfAccessibilityFixResult,
  PdfAccessibilityReport,
  PdfPageTextExtractionResult,
  VeraPdfRuleSummary,
  VeraPdfUaReport,
} from '../../../shared/types/pdf-accessibility';

function spawnAsync(
  command: string,
  args: string[],
  input?: string,
  timeoutMs = 60_000,
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`Command timed out after ${timeoutMs}ms: ${command}`));
    }, timeoutMs);

    proc.stdout.on('data', chunk => {
      stdout += chunk.toString();
    });
    proc.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });
    proc.on('error', err => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on('close', code => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code });
    });

    if (input) {
      proc.stdin.write(input);
    }
    proc.stdin.end();
  });
}

interface CachedPdfPagesEntry {
  sha256: string;
  engineVersion: string;
  totalPages: number;
  pageTexts: Record<string, string>;
  pageHasUnmapped: Record<string, boolean>;
  pagesWithoutText: number[];
  fontsWithoutToUnicode: string[];
  allFontsCount: number;
  accessedAt: number;
}

const MAX_PDF_TEXT_CACHE_ENTRIES = 20;
const pdfPageTextCache = new Map<string, CachedPdfPagesEntry>();
const fileMetaCache = new Map<string, { sha256: string; mtimeMs: number; size: number }>();

export function clearPdfPageTextCache(): void {
  pdfPageTextCache.clear();
  fileMetaCache.clear();
}

export function invalidatePdfPageCache(sha256?: string): void {
  if (!sha256) {
    clearPdfPageTextCache();
    return;
  }
  for (const [key, entry] of pdfPageTextCache.entries()) {
    if (entry.sha256 === sha256 || key.startsWith(`${sha256}:`)) {
      pdfPageTextCache.delete(key);
    }
  }
  for (const [filepath, meta] of fileMetaCache.entries()) {
    if (meta.sha256 === sha256) {
      fileMetaCache.delete(filepath);
    }
  }
}

export function getPdfPageTextCacheStats(): { size: number; keys: string[] } {
  return {
    size: pdfPageTextCache.size,
    keys: Array.from(pdfPageTextCache.keys()),
  };
}

export async function extractPdfPageTexts(
  tools: PdfEngineTools,
  filename: string,
  pages?: number[],
  options: { forceHash?: boolean } = {},
): Promise<PdfPageTextExtractionResult> {
  if (!fs.existsSync(filename)) {
    throw new Error('file-not-found');
  }

  // 1. Resolve file SHA-256 (and invalidate if file content changed)
  const stat = await fs.promises.stat(filename);
  const lastMeta = fileMetaCache.get(filename);
  let currentSha: string;
  if (lastMeta && !options.forceHash && lastMeta.mtimeMs === stat.mtimeMs && lastMeta.size === stat.size) {
    currentSha = lastMeta.sha256;
  } else {
    currentSha = await fileSha256(filename);
    if (lastMeta && lastMeta.sha256 !== currentSha) {
      // Content changed on disk! Invalidate old cache entry
      invalidatePdfPageCache(lastMeta.sha256);
    }
    fileMetaCache.set(filename, { sha256: currentSha, mtimeMs: stat.mtimeMs, size: stat.size });
  }

  // 2. Cache key
  const engineVersion = 'pypdfium2-1.x';
  const cacheKey = `${currentSha}:${engineVersion}`;
  let entry = pdfPageTextCache.get(cacheKey);

  // 3. Check if all requested pages are already cached
  const targetPages = pages ? pages.filter(p => Number.isInteger(p) && p >= 1) : undefined;
  const missingPages = targetPages
    ? (entry ? targetPages.filter(p => typeof entry!.pageTexts[String(p)] !== 'string') : targetPages)
    : undefined;

  if (entry && missingPages && missingPages.length === 0) {
    entry.accessedAt = Date.now();
    return {
      engine: entry.engineVersion,
      filename: path.basename(filename),
      fileSize: stat.size,
      sha256: entry.sha256,
      totalPages: entry.totalPages,
      pageTexts: entry.pageTexts,
      pageHasUnmapped: entry.pageHasUnmapped,
      pagesWithoutText: entry.pagesWithoutText,
      fontsWithoutToUnicode: entry.fontsWithoutToUnicode,
      allFontsCount: entry.allFontsCount,
    };
  }

  // 4. Request missing pages from engine.py
  const pagesToFetch = missingPages && missingPages.length > 0 ? missingPages : targetPages;
  const requestJson = JSON.stringify({
    operation: 'extract-text',
    filename,
    pages: pagesToFetch,
  });

  const { stdout, stderr, code } = await spawnAsync(
    tools.python,
    [tools.script],
    requestJson,
    30_000,
  );

  if (code !== 0 && !stdout) {
    throw new Error(`PDF text extraction engine failed (code ${code}): ${stderr}`);
  }

  const lines = stdout.trim().split('\n').filter(Boolean);
  let result: PdfPageTextExtractionResult | null = null;
  for (const line of lines) {
    try {
      const msg = JSON.parse(line);
      if (msg.type === 'complete' && msg.result) {
        result = msg.result as PdfPageTextExtractionResult;
        break;
      }
      if (msg.type === 'error') {
        throw new Error(msg.error || 'pdf-text-extract-error');
      }
    } catch (e) {
      if ((e as Error).message === 'file-not-found' || (e as Error).message === 'pdf-text-extract-error') {
        throw e;
      }
    }
  }

  if (!result) {
    throw new Error('Failed to parse text extraction report from python engine');
  }

  // 5. Update or create cache entry
  if (entry) {
    Object.assign(entry.pageTexts, result.pageTexts);
    Object.assign(entry.pageHasUnmapped, result.pageHasUnmapped);
    entry.pagesWithoutText = Array.from(new Set([...entry.pagesWithoutText, ...result.pagesWithoutText]));
    entry.fontsWithoutToUnicode = Array.from(new Set([...entry.fontsWithoutToUnicode, ...result.fontsWithoutToUnicode]));
    entry.allFontsCount = Math.max(entry.allFontsCount, result.allFontsCount);
    entry.accessedAt = Date.now();
  } else {
    if (pdfPageTextCache.size >= MAX_PDF_TEXT_CACHE_ENTRIES) {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;
      for (const [k, v] of pdfPageTextCache.entries()) {
        if (v.accessedAt < oldestTime) {
          oldestTime = v.accessedAt;
          oldestKey = k;
        }
      }
      if (oldestKey) pdfPageTextCache.delete(oldestKey);
    }

    entry = {
      sha256: currentSha,
      engineVersion: result.engine || engineVersion,
      totalPages: result.totalPages,
      pageTexts: result.pageTexts,
      pageHasUnmapped: result.pageHasUnmapped,
      pagesWithoutText: result.pagesWithoutText,
      fontsWithoutToUnicode: result.fontsWithoutToUnicode,
      allFontsCount: result.allFontsCount,
      accessedAt: Date.now(),
    };
    pdfPageTextCache.set(cacheKey, entry);
  }

  return {
    engine: entry.engineVersion,
    filename: path.basename(filename),
    fileSize: stat.size,
    sha256: entry.sha256,
    totalPages: entry.totalPages,
    pageTexts: entry.pageTexts,
    pageHasUnmapped: entry.pageHasUnmapped,
    pagesWithoutText: entry.pagesWithoutText,
    fontsWithoutToUnicode: entry.fontsWithoutToUnicode,
    allFontsCount: entry.allFontsCount,
  };
}

export function isVeraPdfAvailable(tools: PdfEngineTools): boolean {
  return Boolean(
    tools.java &&
    tools.veraPdfJar &&
    fs.existsSync(tools.java) &&
    fs.existsSync(tools.veraPdfJar)
  );
}

export async function runVeraPdfCheck(
  tools: PdfEngineTools,
  filename: string,
): Promise<VeraPdfUaReport | null> {
  if (!isVeraPdfAvailable(tools) || !tools.java || !tools.veraPdfJar) {
    return null;
  }

  const args = [
    '-jar',
    tools.veraPdfJar,
    '--flavour',
    'ua1',
    '--format',
    'json',
    '--maxfailures',
    '30',
    filename,
  ];

  try {
    const { stdout } = await spawnAsync(tools.java, args, undefined, 45_000);
    const parsed = JSON.parse(stdout);
    const valResult = parsed?.report?.jobs?.[0]?.validationResult?.[0];
    if (!valResult) return null;

    const details = valResult.details || {};
    const ruleSummaries: VeraPdfRuleSummary[] = (details.ruleSummaries || []).map(
      (r: { clause?: string; description?: string; failedChecks?: number; checks?: { errorMessage?: string }[] }) => ({
        clause: String(r.clause || ''),
        description: String(r.description || ''),
        failedChecks: Number(r.failedChecks || 0),
        errorMessage: r.checks?.[0]?.errorMessage,
      })
    );

    return {
      compliant: Boolean(valResult.compliant),
      passedRules: Number(details.passedRules || 0),
      failedRules: Number(details.failedRules || 0),
      passedChecks: Number(details.passedChecks || 0),
      failedChecks: Number(details.failedChecks || 0),
      ruleSummaries,
    };
  } catch (error) {
    console.warn('[baglib:a11y] veraPDF validation failed or errored:', error);
    return null;
  }
}

export async function runAccessibilityCheck(
  tools: PdfEngineTools,
  filename: string,
  options: { runVeraPdf?: boolean } = {},
): Promise<PdfAccessibilityReport> {
  if (!fs.existsSync(filename)) {
    throw new Error('file-not-found');
  }

  // 1. Run base checks through Python engine.py
  const requestJson = JSON.stringify({
    operation: 'accessibility',
    filename,
  });

  const { stdout, stderr, code } = await spawnAsync(
    tools.python,
    [tools.script],
    requestJson,
    30_000,
  );

  if (code !== 0 && !stdout) {
    throw new Error(`Accessibility engine failed (code ${code}): ${stderr}`);
  }

  // Engine emits progress and complete messages in JSON lines
  const lines = stdout.trim().split('\n').filter(Boolean);
  let baseReport: PdfAccessibilityBaseReport | null = null;
  for (const line of lines) {
    try {
      const msg = JSON.parse(line);
      if (msg.type === 'complete' && msg.result) {
        baseReport = msg.result as PdfAccessibilityBaseReport;
        break;
      }
      if (msg.type === 'error') {
        throw new Error(msg.error || 'accessibility-check-error');
      }
    } catch {
      // ignore non-json log lines
    }
  }

  if (!baseReport) {
    throw new Error('Failed to parse accessibility report from python engine');
  }

  // Populate cache with extracted page texts from base report
  if (baseReport.sha256 && baseReport.pageTexts) {
    const engineVersion = 'pypdfium2-1.x';
    const cacheKey = `${baseReport.sha256}:${engineVersion}`;
    const entry: CachedPdfPagesEntry = {
      sha256: baseReport.sha256,
      engineVersion: baseReport.engine || engineVersion,
      totalPages: baseReport.totalPages,
      pageTexts: { ...baseReport.pageTexts },
      pageHasUnmapped: { ...(baseReport.pageHasUnmapped || {}) },
      pagesWithoutText: [...(baseReport.pagesWithoutText || [])],
      fontsWithoutToUnicode: [...(baseReport.fontsWithoutToUnicode || [])],
      allFontsCount: baseReport.allFontsCount || 0,
      accessedAt: Date.now(),
    };
    pdfPageTextCache.set(cacheKey, entry);
  }

  // 2. Optional veraPDF check
  const veraAvailable = isVeraPdfAvailable(tools);
  let veraReport: VeraPdfUaReport | null = null;
  if (options.runVeraPdf && veraAvailable) {
    veraReport = await runVeraPdfCheck(tools, filename);
  }

  return {
    base: baseReport,
    veraPdfAvailable: veraAvailable,
    veraPdfReport: veraReport,
  };
}

export async function fixAccessibilityMetadata(
  tools: PdfEngineTools,
  filename: string,
  fixes: { language?: string; title?: string },
  outputDir?: string,
): Promise<PdfAccessibilityFixResult> {
  if (!fs.existsSync(filename)) {
    throw new Error('file-not-found');
  }

  const dir = outputDir || path.join(app.getPath('temp'), 'baglib-a11y-staged');
  await fs.promises.mkdir(dir, { recursive: true });
  const stagedPath = path.join(dir, `${path.basename(filename, '.pdf')}-a11y-staged-${randomUUID().slice(0, 8)}.pdf`);

  const requestJson = JSON.stringify({
    operation: 'fix-accessibility-metadata',
    filename,
    output: stagedPath,
    language: fixes.language,
    title: fixes.title,
  });

  const { stdout, stderr, code } = await spawnAsync(
    tools.python,
    [tools.script],
    requestJson,
    30_000,
  );

  if (code !== 0 && !stdout) {
    throw new Error(`Failed to stage accessibility fix (code ${code}): ${stderr}`);
  }

  const lines = stdout.trim().split('\n').filter(Boolean);
  for (const line of lines) {
    try {
      const msg = JSON.parse(line);
      if (msg.type === 'complete' && msg.result) {
        const fixResult = msg.result as PdfAccessibilityFixResult;
        fixResult.stagedPath = fixResult.output;
        return fixResult;
      }
      if (msg.type === 'error') {
        throw new Error(msg.error || 'fix-accessibility-error');
      }
    } catch {
      // ignore non-json log lines
    }
  }

  throw new Error('Failed to parse staged output from python engine');
}

export async function saveAccessibilityFix(
  tools: PdfEngineTools,
  filename: string,
  stagedPath: string,
): Promise<{ ok: boolean; sha256?: string; backup?: string; error?: string }> {
  if (!fs.existsSync(filename) || !fs.existsSync(stagedPath)) {
    return { ok: false, error: 'file-not-found' };
  }
  try {
    const stagedSha256 = await fileSha256(stagedPath);
    const expectedTargetSha256 = await fileSha256(filename);
    const pubResult = await publishPdfOutput({
      staged: stagedPath,
      target: filename,
      stagedSha256,
      expectedTargetSha256,
      backup: true,
    });
    return { ok: true, sha256: pubResult.sha256, backup: pubResult.backup };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}
