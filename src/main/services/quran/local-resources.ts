import path from 'node:path';
import { readerPresets } from '../../../shared/quran-resource-presets';

const additionalLocalFiles: Record<string, string> = {
  'quran-metadata/63': '5-Quran metadata/quran-metadata-rub.sqlite.zip',
  'quran-metadata/64': '5-Quran metadata/quran-metadata-sajda.sqlite.zip',
  'quran-metadata/65': '5-Quran metadata/quran-metadata-ruku.sqlite.zip',
  'quran-metadata/66': '5-Quran metadata/quran-metadata-manzil.sqlite.zip',
  'quran-metadata/67': '5-Quran metadata/quran-metadata-hizb.sqlite.zip',
  'quran-metadata/68': '5-Quran metadata/quran-metadata-juz.sqlite.zip',
  'quran-metadata/69': '5-Quran metadata/quran-metadata-ayah.sqlite.zip',
  'morphology/481': 'Quranic Grammar and Morphology/ayah-stem.db.zip',
  'morphology/482': 'Quranic Grammar and Morphology/ayah-root.db.zip',
  'morphology/483': 'Quranic Grammar and Morphology/ayah-lemma.db.zip',
  'translation/564': '4-Translation & Transliteration/Translation/colored-english-wbw-translation.db.zip',
};

export function localResourceCandidates(id: string, root: string): string[] {
  const preset = readerPresets.find(preset => preset.id === id);
  const relative = preset ? [path.join(preset.relative, preset.filename)] : Object.hasOwn(additionalLocalFiles, id) ? [additionalLocalFiles[id]] : [];
  if (id === 'font/240') relative.push('1-Quran Script, Font & Mushaf Layouts/Hafs/Font/ttf.zip');
  if (id === 'font/qpc-warsh-font') relative.push('1-Quran Script, Font & Mushaf Layouts/Warsh/Font/uthmanic-warsh-v21.ttf.zip');
  if (id === 'mushaf-layout/569') relative.push('1-Quran Script, Font & Mushaf Layouts/Warsh/Layout/ligature-basd-svg.zip');
  return relative.map(filename => path.join(root, filename));
}
