/** Canonical lexical positions come from the active script, never metadata/row IDs. */
export type QuranLexicalIndex = ReadonlyMap<string, ReadonlySet<number>>;
export function validateQuranWordLocation(value: unknown, index: QuranLexicalIndex) {
  if (typeof value !== 'string' || !/^[1-9]\d{0,2}:[1-9]\d{0,2}:[1-9]\d{0,2}$/.test(value)) return null;
  const [surah, ayah, word] = value.split(':').map(Number);
  if (surah > 114 || ayah > 286) return null;
  const positions = index.get(`${surah}:${ayah}`);
  if (!positions || word > positions.size || !positions.has(word)) return null;
  return { surah, ayah, word, location: value };
}
/** QUL script/312 stores إِلۡ يَاسِينَ as one token. See docs/features/QUL.md.
 * Metadata/69 historically counts two; never shift or split script positions. */
export function quranWordCompatibility(profile: string, surah: number, ayah: number) {
  return profile === 'hafs' && surah === 37 && ayah === 130 ? 'qul-37-130' as const : undefined;
}
