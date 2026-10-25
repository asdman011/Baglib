import type { QuranPack, QuranReaderKind, QuranResource } from '../../../shared/types/quran';

export const readerPresets: { id: string; title: string; kind: QuranReaderKind; filename: string; relative: string; profile: 'hafs' | 'warsh' }[] = [
  { id: 'quran-script/312', title: 'KFGQPC Hafs script', kind: 'script', filename: 'qpc-hafs-word-by-word.db.zip', relative: '1-Quran Script, Font & Mushaf Layouts/Hafs/Script', profile: 'hafs' },
  { id: 'quran-script/qpc-warsh-script-wbw', title: 'QPC Warsh script', kind: 'script', filename: 'qpc-warsh-script-wbw.db.zip', relative: '1-Quran Script, Font & Mushaf Layouts/Warsh/Script', profile: 'warsh' },
  { id: 'translation/193', title: 'Saheeh International', kind: 'translation', filename: 'en-sahih-international-inline-footnotes.db.zip', relative: '4-Translation & Transliteration/Translation', profile: 'hafs' },
  { id: 'tafsir/22', title: 'تفسير ابن كثير', kind: 'tafsir', filename: 'ar-tafsir-ibn-kathir.db.zip', relative: '2-Tafsir', profile: 'hafs' },
  { id: 'translation/92', title: 'English word translation', kind: 'word-translation', filename: 'english-wbw-translation.db.zip', relative: '4-Translation & Transliteration/Translation', profile: 'hafs' },
  { id: 'transliteration/71', title: 'English word transliteration', kind: 'word-transliteration', filename: 'english-wbw-transliteration.db.zip', relative: '4-Translation & Transliteration/Transliteration', profile: 'hafs' },
  { id: 'quran-metadata/70', title: 'Quran surah metadata', kind: 'surahs', filename: 'quran-metadata-surah-name.sqlite.zip', relative: '5-Quran metadata', profile: 'hafs' },
];

export function readerPreset(pack: QuranPack) {
  return readerPresets.find(preset => preset.id === pack.resource.id && pack.files.some(file => file.type === 'sqlite' && file.name === preset.filename.replace(/\.zip$/, '')));
}

export function presetResource(id: string): QuranResource {
  const preset = readerPresets.find(value => value.id === id);
  if (!preset) throw new Error('invalid-resource');
  return { id, category: id.split('/')[0] as QuranResource['category'], title: preset.title, sourcePath: `/resources/${id}`, tags: [], formats: ['SQLite'], related: [], restricted: false, fetchedAt: new Date().toISOString(), profile: { key: `qul:${id}:unverified`, qiraah: null, riwayah: null, tariq: null, numbering: null, segmentation: null, script: null, verified: false } };
}
