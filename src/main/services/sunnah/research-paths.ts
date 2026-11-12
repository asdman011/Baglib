import path from 'node:path';

export const SUNNAH_RESEARCH_FILES = ['sunnah_merged_quranlab_v1.sqlite', 'sunnah_kutub_tisah_itqan.sqlite'] as const;

/**
 * Where the read-only Sunnah research databases may live, in lookup order.
 * A copy in the user's profile always wins; installed builds then use the database shipped in the
 * installer's resources (KEY-265); development builds fall back to the local alignment output.
 */
export function sunnahResearchPaths(options: { packaged: boolean; userData: string; appPath: string; resourcesPath?: string }): string[] {
  return SUNNAH_RESEARCH_FILES.flatMap(name => [
    path.join(options.userData, 'sunnah', name),
    ...(options.packaged
      ? (options.resourcesPath ? [path.join(options.resourcesPath, 'sunnah', name)] : [])
      : [path.join(options.appPath, 'tools', 'hadith-alignment', 'data', 'output', name)]),
  ]);
}
