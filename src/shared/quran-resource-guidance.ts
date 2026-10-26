import type { QuranResource } from './types/quran';
import { readerPresets } from './quran-resource-presets';

export const quranResourceBundles = [
  { id: 'hafs-reader', resources: ['quran-script/312', 'mushaf-layout/569', 'quran-metadata/70'] },
  { id: 'hafs-study', resources: ['quran-script/312', 'mushaf-layout/569', 'quran-metadata/70', 'translation/193', 'tafsir/22', 'translation/92', 'transliteration/71', 'morphology/quran-word-roots', 'morphology/75', 'morphology/77', 'surah-info/3', 'ayah-theme/62', 'ayah-topics/45', 'mutashabihat/73', 'similar-ayah/74'] },
  { id: 'hafs-v4', resources: ['quran-script/312', 'quran-script/47', 'mushaf-layout/19', 'font/240', 'quran-metadata/70'] },
  { id: 'warsh-reader', resources: ['quran-script/qpc-warsh-script-wbw', 'font/qpc-warsh-font', 'mushaf-layout/569'] },
] as const;

export type QuranResourceBundle = typeof quranResourceBundles[number]['id'];
export type QuranResourceFeature = 'search' | 'words' | 'footnotes' | 'tafsir' | 'glyphs' | 'vectors' | 'recitation' | 'timings' | 'morphology' | 'topics' | 'transliteration' | 'metadata';

export function quranResourceGuidance(resource: Pick<QuranResource, 'id' | 'formats'>) {
  const preset = readerPresets.find(preset => preset.id === resource.id || preset.aliases?.includes(resource.id));
  const requirements: string[] = [];
  const features: QuranResourceFeature[] = [];
  if (preset) {
    if (preset.kind === 'script') features.push('search', 'words');
    if (preset.kind === 'glyph-script' || preset.kind === 'glyph-layout' || resource.id === 'font/240') { requirements.push('quran-script/312', 'quran-script/47', 'mushaf-layout/19', 'font/240'); features.push('glyphs'); }
    if (preset.kind === 'mushaf-layout') features.push('vectors');
    if (preset.profile === 'warsh') requirements.push('quran-script/qpc-warsh-script-wbw', 'font/qpc-warsh-font', 'mushaf-layout/569');
    if (['translation', 'tafsir', 'word-translation', 'word-transliteration', 'recitation', 'word-root', 'word-lemma', 'word-stem', 'ayah-topics', 'ayah-theme', 'similar-ayah', 'mutashabihat'].includes(preset.kind)) requirements.push('quran-script/312');
    if (resource.id === 'translation/193') features.push('footnotes');
    if (preset.kind === 'tafsir') features.push('tafsir');
    if (preset.kind === 'word-translation') features.push('words');
    if (preset.kind === 'word-transliteration') features.push('transliteration');
    if (preset.kind === 'recitation') features.push('recitation', 'timings');
    if (preset.kind.startsWith('word-') && ['word-root', 'word-lemma', 'word-stem'].includes(preset.kind)) features.push('morphology');
    if (['ayah-topics', 'ayah-theme', 'similar-ayah', 'mutashabihat', 'surah-info'].includes(preset.kind)) features.push('topics');
    if (preset.kind === 'surahs') features.push('metadata');
  }
  return {
    supported: Boolean(preset),
    profile: preset?.kind === 'mushaf-layout' ? 'shared-layout' : preset?.profile || 'unverified',
    preferredFormat: preset?.kind === 'font' ? 'WOFF2' : preset?.kind === 'mushaf-layout' ? 'SVG' : preset?.kind === 'mutashabihat' ? 'JSON' : resource.formats.some(format => /sqlite|\.db/i.test(format)) || preset ? 'SQLite' : 'source',
    requirements: [...new Set(requirements)].filter(id => id !== preset?.id),
    features,
    audioMetadataOnly: preset?.kind === 'recitation',
  };
}

export function quranResourceDependencies(ids: string[]): string[] {
  const selected = new Set(ids);
  const pending = [...ids];
  while (pending.length) {
    const id = pending.shift()!;
    const preset = readerPresets.find(preset => preset.id === id);
    if (!preset) continue;
    const guidance = quranResourceGuidance({ id, formats: [] });
    for (const dependency of guidance.requirements) if (!selected.has(dependency)) { selected.add(dependency); pending.push(dependency); }
  }
  return [...selected];
}
