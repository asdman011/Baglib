import type { DigitalImportOptions, DigitalImportResult } from '../../shared/types/digital-file';

interface DropAPI {
  discoverDigitalFiles: (paths: string[]) => Promise<{ files: { path: string }[]; errors: { path: string; code: string }[] }>;
  importDigitalFile: (options: DigitalImportOptions) => Promise<DigitalImportResult>;
}

export async function routeBookDrop(paths: string[], api: DropAPI): Promise<{ kind: 'batch'; paths: string[] } | { kind: 'single'; result: DigitalImportResult }> {
  if (paths.length !== 1) return { kind: 'batch', paths };
  const discovery = await api.discoverDigitalFiles(paths);
  if (discovery.errors.length || !discovery.files.length) throw new Error('Import file unavailable');
  const normalize = (value: string) => value.replace(/\\/g, '/').toLowerCase();
  if (discovery.files.length !== 1 || normalize(discovery.files[0].path) !== normalize(paths[0])) return { kind: 'batch', paths };
  const result = await api.importDigitalFile({ filePath: discovery.files[0].path, duplicateAction: 'skip', skipExactDuplicatesOnly: true });
  return { kind: 'single', result };
}
