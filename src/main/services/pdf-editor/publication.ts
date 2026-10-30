import { constants } from 'node:fs';
import { copyFile, link, lstat, mkdir, open, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileSha256 } from './source';

interface PublicationInput { staged: string; target: string; stagedSha256: string; expectedTargetSha256?: string; backupDirectory?: string; backupFilename?: string }
const locks = new Set<string>();
/** Outputs must already be independently validated by their engine before publication. */
export async function publishPdfOutput(input: PublicationInput): Promise<{ sha256: string; backup?: string }> {
  const key = process.platform === 'win32' ? path.resolve(input.target).toLowerCase() : path.resolve(input.target);
  if (locks.has(key)) throw new Error('busy');
  locks.add(key);
  try { return await publish(input); } finally { locks.delete(key); }
}
async function publish(input: PublicationInput): Promise<{ sha256: string; backup?: string }> {
  const target = path.resolve(input.target);
  if (path.resolve(input.staged) === target || !/^[a-f0-9]{64}$/u.test(input.stagedSha256)) throw new Error('invalid-request');
  const original = await lstat(target).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
  if (original?.isSymbolicLink() || (original && !original.isFile())) throw new Error('invalid-source');
  if (original && !input.expectedTargetSha256) throw new Error('source-changed');
  if (!original && input.expectedTargetSha256) throw new Error('source-changed');
  const unchanged = async () => {
    const current = await lstat(target).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
    if (current?.isSymbolicLink() || (original ? !current || await fileSha256(target) !== input.expectedTargetSha256 : current)) throw new Error('source-changed');
  };
  await unchanged();
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${randomUUID()}.pending`);
  let backup: string | undefined;
  try {
    await copyFile(input.staged, temporary, constants.COPYFILE_EXCL);
    if (await fileSha256(temporary) !== input.stagedSha256) throw new Error('source-changed');
    const file = await open(temporary, 'r+'); try { await file.sync(); } finally { await file.close(); }
    if (original) {
      if (input.backupDirectory) await mkdir(input.backupDirectory, { recursive: true });
      const backupName = input.backupFilename || `${path.basename(target)}.baglib-backup-${randomUUID()}`;
      backup = input.backupDirectory ? path.join(input.backupDirectory, backupName) : `${target}.baglib-backup-${randomUUID()}`;
      await copyFile(target, backup, constants.COPYFILE_EXCL);
      if (await fileSha256(backup) !== input.expectedTargetSha256) throw new Error('source-changed');
    }
    await unchanged();
    // Same-directory atomic replacement; never delete the original as a fallback.
    if (original) await rename(temporary, target);
    else {
      // Exclusive same-filesystem link publishes complete bytes without clobbering.
      await link(temporary, target);
      await unlink(temporary);
    }
    return { sha256: input.stagedSha256, ...(backup ? { backup } : {}) };
  } finally { await unlink(temporary).catch(() => {}); }
}
