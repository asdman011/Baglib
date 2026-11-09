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
