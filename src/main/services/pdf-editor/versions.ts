import { readdir, stat, unlink, utimes } from 'node:fs/promises';
import path from 'node:path';
import type { PdfVersionItem } from '../../../shared/types/pdf-editor';
import { publishPdfOutput } from './publication';
import { fileSha256 } from './source';

const RESTORE_POINT = '_restore-point';

function parseVersion(sourceId: string, filename: string): { timestamp: number; restorePoint: boolean } | null {
  if (path.basename(filename) !== filename || !filename.startsWith(`${sourceId}_`)) return null;
  const match = /^(\d+)(_restore-point)?\.pdf$/u.exec(filename.slice(sourceId.length + 1));
  return match ? { timestamp: Number.parseInt(match[1], 10), restorePoint: Boolean(match[2]) } : null;
}

export async function listPdfVersions(directory: string, sourceId: string): Promise<PdfVersionItem[]> {
  const items: PdfVersionItem[] = [];
  for (const filename of await readdir(directory).catch(() => [] as string[])) {
    const version = parseVersion(sourceId, filename);
    if (!version) continue;
    const info = await stat(path.join(directory, filename)).catch(() => null);
    if (info) items.push({ filename, timestamp: version.timestamp, dateStr: new Date(version.timestamp).toLocaleString(), size: info.size, restorePoint: version.restorePoint });
  }
  return items.sort((first, second) => second.timestamp - first.timestamp);
}

/**
 * Steps to the save just older than the current bytes. Restore points are ignored so that undoing
 * repeatedly walks back through history instead of bouncing between two versions.
 */
export async function selectUndoVersion(directory: string, sourceId: string, currentSha256: string): Promise<string | null> {
  const saves = (await listPdfVersions(directory, sourceId)).filter(version => !version.restorePoint);
  for (const [index, version] of saves.entries()) {
    if (await fileSha256(path.join(directory, version.filename)) === currentSha256) return saves[index + 1]?.filename ?? null;
  }
  return saves[0]?.filename ?? null;
}

interface RestoreInput { directory: string; sourceId: string; filename: string; target: string; expectedSha256: string }

/** Swaps the source atomically, keeping the replaced bytes as a restore point. */
export async function restorePdfVersion(input: RestoreInput): Promise<{ sha256: string; restorePoint: string }> {
  if (!parseVersion(input.sourceId, input.filename)) throw new Error('invalid-request');
  const staged = path.join(input.directory, input.filename);
  const sha256 = await fileSha256(staged).catch(() => { throw new Error('invalid-request'); });
  const published = await publishPdfOutput({
    staged, target: input.target, stagedSha256: sha256, expectedTargetSha256: input.expectedSha256,
    backupDirectory: input.directory, backupFilename: `${input.sourceId}_${Date.now()}${RESTORE_POINT}.pdf`,
  });
  // copyFile keeps the backup's modified time, which could revive a view-cache entry keyed on path, mtime and size.
  const now = new Date();
  await utimes(input.target, now, now);
  return { sha256, restorePoint: published.backup! };
}

export async function deletePdfVersion(directory: string, sourceId: string, filename: string): Promise<void> {
  if (!parseVersion(sourceId, filename)) throw new Error('invalid-request');
  await unlink(path.join(directory, filename));
}
