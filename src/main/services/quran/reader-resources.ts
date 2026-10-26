import type { QuranPack, QuranResource } from '../../../shared/types/quran';
import { HAFS_READING_PROFILE, WARSH_READING_PROFILE } from '../../../shared/types/quran';

import { readerPresets } from '../../../shared/quran-resource-presets';
export { readerPresets } from '../../../shared/quran-resource-presets';

export function canonicalResourceId(id: string): string {
  return readerPresets.find(preset => preset.aliases?.includes(id))?.id || id;
}

export function readerPreset(pack: QuranPack) {
  return readerPresets.find(preset => {
    if (preset.id !== canonicalResourceId(pack.resource.id)) return false;
    if (preset.kind === 'mushaf-layout') return pack.files.some(file => file.type === 'svg');
    if (preset.kind === 'mutashabihat') return pack.files.some(file => file.type === 'json');
    if (preset.kind === 'font') return pack.files.some(file => file.type === 'font');
    return pack.files.some(file => file.type === 'sqlite');
  });
}

export function presetResource(id: string): QuranResource {
  const preset = readerPresets.find(value => value.id === canonicalResourceId(id));
  if (!preset) throw new Error('invalid-resource');
  const formats = preset.kind === 'mushaf-layout' ? ['SVG'] : preset.kind === 'font' ? ['WOFF2'] : preset.kind === 'mutashabihat' ? ['JSON'] : ['SQLite'];
  const profile = preset.profile === 'warsh' ? WARSH_READING_PROFILE : HAFS_READING_PROFILE;
  return {
    id: preset.id,
    category: preset.id.split('/')[0] as QuranResource['category'],
    title: preset.title,
    sourcePath: `/resources/${preset.id}`,
    tags: [preset.profile],
    formats,
    related: [],
    restricted: false,
    fetchedAt: new Date().toISOString(),
    profile,
  };
}
