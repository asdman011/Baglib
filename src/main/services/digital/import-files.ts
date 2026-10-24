import { createReadStream } from 'node:fs';
import { lstat, opendir, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { DigitalFileValidatorService } from './digital-file-validator.service';

export async function hashImportFile(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath, { highWaterMark: 256 * 1024 })) hash.update(chunk);
  return hash.digest('hex');
}

export interface ImportFileDiscovery {
  files: { path: string; name: string; size: number }[];
  errors: { path: string; code: string }[];
}

export async function discoverImportFiles(inputs: string[]): Promise<ImportFileDiscovery> {
  const result: ImportFileDiscovery = { files: [], errors: [] };
  const visited = new Set<string>();
  const validator = DigitalFileValidatorService.getInstance();
  const pending = [...inputs];
  while (pending.length) {
    const input = pending.pop()!;
    if (typeof input !== 'string' || !path.isAbsolute(input)) throw new Error('Invalid import path');
    try {
      const info = await lstat(input);
      if (info.isSymbolicLink()) continue;
      const resolved = await realpath(input);
      const key = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
      if (visited.has(key)) continue;
      visited.add(key);
      if (info.isDirectory()) {
        const directory = await opendir(resolved);
        for await (const entry of directory) {
          if (!entry.isSymbolicLink() && (entry.isDirectory() || validator.isFormatSupported(path.extname(entry.name)))) pending.push(path.join(resolved, entry.name));
        }
      } else if (info.isFile() && validator.isFormatSupported(path.extname(resolved))) {
        result.files.push({ path: resolved, name: path.basename(resolved), size: info.size });
      }
    } catch (error) {
      result.errors.push({ path: input, code: (error as NodeJS.ErrnoException).code || 'READ_ERROR' });
    }
  }
  return result;
}
