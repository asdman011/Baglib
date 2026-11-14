import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { validateResearchBlobId, type ResearchEditorAssets, type ResearchEditorBlob } from '../../shared/research-editor';

/** Immutable per-id directories, atomically published after data and MIME writes are complete. */
export function researchEditorAssets(databasePath: string): ResearchEditorAssets {
  const root = path.join(path.dirname(databasePath), 'manuscript-assets');
  async function location(id: string) {
    validateResearchBlobId(id);
    await fs.mkdir(root, { recursive: true });
    if ((await fs.lstat(root)).isSymbolicLink()) throw new Error('invalid-assets-directory');
    const target = path.join(root, id);
    try { if ((await fs.lstat(target)).isSymbolicLink()) throw new Error('invalid-asset-directory'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    return target;
  }
  async function get(id: string): Promise<ResearchEditorBlob | null> {
    const target = await location(id);
    try {
      const [bytes, type] = await Promise.all([fs.readFile(path.join(target, 'data')), fs.readFile(path.join(target, 'type'), 'utf8')]);
      return { bytes: new Uint8Array(bytes), type };
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  }
  return {
    get,
    async set(id, value) {
      const target = await location(id);
      if (!value || !(value.bytes instanceof Uint8Array) || typeof value.type !== 'string' || value.type.length > 255 || /[\r\n\0]/.test(value.type)) throw new Error('invalid-blob');
      const existing = await get(id);
      if (existing) {
        if (!Buffer.from(existing.bytes).equals(value.bytes) || existing.type !== value.type) throw new Error('blob-id-conflict');
        return id;
      }
      const temporary = path.join(root, '.' + randomUUID());
      await fs.mkdir(temporary);
      try {
        await Promise.all([fs.writeFile(path.join(temporary, 'data'), value.bytes), fs.writeFile(path.join(temporary, 'type'), value.type)]);
        try { await fs.rename(temporary, target); }
        catch (error) {
          const concurrent = await get(id);
          if (!concurrent || !Buffer.from(concurrent.bytes).equals(value.bytes) || concurrent.type !== value.type) throw error;
        }
      } finally { await fs.rm(temporary, { recursive: true, force: true }); }
      return id;
    },
    async delete(id) { await fs.rm(await location(id), { recursive: true, force: true }); },
    async list() {
      await fs.mkdir(root, { recursive: true });
      if ((await fs.lstat(root)).isSymbolicLink()) throw new Error('invalid-assets-directory');
      return (await fs.readdir(root, { withFileTypes: true })).filter(entry => entry.isDirectory() && /^[a-zA-Z0-9_-]{1,128}={0,2}$/.test(entry.name)).map(entry => entry.name).sort();
    },
  };
}
