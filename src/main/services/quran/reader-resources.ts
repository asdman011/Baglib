import type { QuranPack, QuranReaderKind, QuranResource } from '../../../shared/types/quran';

export const readerPresets: { id: string; aliases?: string[]; title: string; kind: QuranReaderKind; filename: string; relative: string; profile: 'hafs' | 'warsh' }[] = [
  { id: 'quran-script/312', title: 'KFGQPC Hafs script', kind: 'script', filename: 'qpc-hafs-word-by-word.db.zip', relative: '1-Quran Script, Font & Mushaf Layouts/Hafs/Script', profile: 'hafs' },
  { id: 'quran-script/qpc-warsh-script-wbw', title: 'QPC Warsh script', kind: 'script', filename: 'qpc-warsh-script-wbw.db.zip', relative: '1-Quran Script, Font & Mushaf Layouts/Warsh/Script', profile: 'warsh' },
  { id: 'translation/193', title: 'Saheeh International', kind: 'translation', filename: 'en-sahih-international-inline-footnotes.db.zip', relative: '4-Translation & Transliteration/Translation', profile: 'hafs' },
  { id: 'tafsir/22', title: 'تفسير ابن كثير', kind: 'tafsir', filename: 'ar-tafsir-ibn-kathir.db.zip', relative: '2-Tafsir', profile: 'hafs' },
  { id: 'translation/92', title: 'English word translation', kind: 'word-translation', filename: 'english-wbw-translation.db.zip', relative: '4-Translation & Transliteration/Translation', profile: 'hafs' },
  { id: 'transliteration/71', title: 'English word transliteration', kind: 'word-transliteration', filename: 'english-wbw-transliteration.db.zip', relative: '4-Translation & Transliteration/Transliteration', profile: 'hafs' },
  { id: 'quran-metadata/70', title: 'Quran surah metadata', kind: 'surahs', filename: 'quran-metadata-surah-name.sqlite.zip', relative: '5-Quran metadata', profile: 'hafs' },
  { id: 'mushaf-layout/569', title: 'Ligature-based SVG Mushaf', kind: 'mushaf-layout', filename: 'ligature-basd-svg.zip', relative: '1-Quran Script, Font & Mushaf Layouts/Hafs/Layout', profile: 'hafs' },
  { id: 'recitation/957', title: 'محمود خليل الحصري (مرتل)', kind: 'recitation', filename: 'ayah-recitation-mahmoud-khalil-al-husary-murattal-hafs-957 (with segments).db.zip', relative: '3-Recitations and segments data', profile: 'hafs' },
  { id: 'recitation/959', title: 'محمد صديق المنشاوي (مرتل)', kind: 'recitation', filename: 'ayah-recitation-muhammad-siddiq-al-minshawi-murattal-hafs-959.db.zip', relative: '3-Recitations and segments data', profile: 'hafs' },
  { id: 'surah-info/3', aliases: ['surah-info/en'], title: 'Surah Information (English)', kind: 'surah-info', filename: 'surah-info-en.db.zip', relative: 'Surah information', profile: 'hafs' },
  { id: 'ayah-theme/62', aliases: ['ayah-theme/default'], title: 'Ayah Themes', kind: 'ayah-theme', filename: 'ayah-themes.db.zip', relative: 'Ayah theme', profile: 'hafs' },
  { id: 'ayah-topics/45', aliases: ['ayah-topics/default'], title: 'Quran Topics & Concepts', kind: 'ayah-topics', filename: 'topics.db.zip', relative: 'Topics and concepts in the Quran', profile: 'hafs' },
];

export function canonicalResourceId(id: string): string {
  return readerPresets.find(preset => preset.aliases?.includes(id))?.id || id;
}

export function readerPreset(pack: QuranPack) {
  return readerPresets.find(preset => {
    if (preset.id !== canonicalResourceId(pack.resource.id)) return false;
    if (preset.kind === 'mushaf-layout') return pack.files.some(file => file.type === 'svg');
    return pack.files.some(file => file.type === 'sqlite');
  });
}

export function presetResource(id: string): QuranResource {
  const preset = readerPresets.find(value => value.id === canonicalResourceId(id));
  if (!preset) throw new Error('invalid-resource');
  const formats = preset.kind === 'mushaf-layout' ? ['SVG'] : ['SQLite'];
  return { id: preset.id, category: preset.id.split('/')[0] as QuranResource['category'], title: preset.title, sourcePath: `/resources/${preset.id}`, tags: [], formats, related: [], restricted: false, fetchedAt: new Date().toISOString(), profile: { key: `qul:${preset.id}:unverified`, qiraah: null, riwayah: null, tariq: null, numbering: null, segmentation: null, script: null, verified: false } };
}
