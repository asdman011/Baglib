import { LECTURE_EXTENSIONS, type Lecture } from '../../shared/lectures';
import type { DigitalImportOptions, DigitalImportResult } from '../../shared/types/digital-file';

interface DropAPI {
  lectures?: { addPaths(paths: string[]): Promise<Lecture[]> };
  discoverDigitalFiles: (paths: string[]) => Promise<{ files: { path: string }[]; errors: { path: string; code: string }[] }>;
  importDigitalFile: (options: DigitalImportOptions) => Promise<DigitalImportResult>;
}

export function splitLectureDrop(paths: string[]): { media: string[]; books: string[]; unsupported: string[] } {
  const groups = { media: [] as string[], books: [] as string[], unsupported: [] as string[] };
  for (const file of paths) {
    const extension = /\.[^.\\/]+$/u.exec(file)?.[0].toLowerCase() ?? '';
    const key = (LECTURE_EXTENSIONS as readonly string[]).includes(extension) ? 'media' : ['.wma', '.wmv', '.avi', '.flac', '.aac'].includes(extension) ? 'unsupported' : 'books';
    groups[key].push(file);
  }
  return groups;
}

export async function routeBookDrop(paths: string[], api: DropAPI): Promise<{ kind: 'batch'; paths: string[] } | { kind: 'single'; result: DigitalImportResult } | { kind: 'media'; count: number }> {
  const split = splitLectureDrop(paths);
  if (split.unsupported.length) throw new Error('unsupported-media');
  if (split.media.length) {
    if (!api.lectures) throw new Error('unsupported-media');
    const added = await api.lectures.addPaths(split.media);
    if (!split.books.length) return { kind: 'media', count: added.length };
    paths = split.books;
  }
  if (paths.length !== 1) return { kind: 'batch', paths };
  const discovery = await api.discoverDigitalFiles(paths);
  if (discovery.errors.length || !discovery.files.length) throw new Error('Import file unavailable');
  const normalize = (value: string) => value.replace(/\\/g, '/').toLowerCase();
  if (discovery.files.length !== 1 || normalize(discovery.files[0].path) !== normalize(paths[0])) return { kind: 'batch', paths };
  const result = await api.importDigitalFile({ filePath: discovery.files[0].path, duplicateAction: 'skip', skipExactDuplicatesOnly: true });
  return { kind: 'single', result };
}
