export interface QuranStudyReference { surah: number; ayah: number; wordText?: string; wholePage?: boolean }

export function quranStudyReferences(tool: string, reference: QuranStudyReference, words: readonly { surah: number; ayah: number }[]): QuranStudyReference[] {
  if (!reference.wholePage || !['translation', 'tafsir', 'topics', 'themes', 'meanings'].includes(tool)) return [reference];
  return [...new Map(words.map(word => [`${word.surah}:${word.ayah}`, { surah: word.surah, ayah: word.ayah }])).values()];
}
