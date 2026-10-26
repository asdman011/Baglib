import type { QuranMushafPage, QuranMushafWord } from '../../../shared/types/quran';

export interface WarshLayoutWord { id: number; surah: number; ayah: number; word: number; text: string; }
export interface SharedLayoutPage { pageNumber: number; words: QuranMushafWord[]; }
export interface WarshLayout { pages: Map<number, QuranMushafPage>; references: Map<string, number>; }

export function buildWarshLayout(templates: SharedLayoutPage[], source: WarshLayoutWord[]): WarshLayout {
  if (!templates.length || templates.length > 604 || !source.length || source.length > 100000) throw new Error('invalid-package');
  const rows = [...source].sort((first, second) => first.surah - second.surah || first.ayah - second.ayah || first.word - second.word);
  const canonical = new Map<number, WarshLayoutWord[]>();
  const locations = new Set<string>();
  for (const word of rows) {
    const location = `${word.surah}:${word.ayah}:${word.word}`;
    if (!Number.isInteger(word.surah) || word.surah < 1 || word.surah > 114 || !Number.isInteger(word.ayah) || word.ayah < 1 || word.ayah > 300 || !Number.isInteger(word.word) || word.word < 1 || typeof word.text !== 'string' || !word.text || word.text.length > 1000 || locations.has(location)) throw new Error('invalid-package');
    locations.add(location);
    if (!canonical.has(word.surah)) canonical.set(word.surah, []);
    canonical.get(word.surah)!.push(word);
  }
  const slots: { page: number; line: number; surah: number; count: number }[] = [];
  const capacity = new Map<number, number>();
  const pageIds = new Set<number>();
  for (const page of [...templates].sort((first, second) => first.pageNumber - second.pageNumber)) {
    if (!Number.isInteger(page.pageNumber) || page.pageNumber < 1 || page.pageNumber > 604 || pageIds.has(page.pageNumber)) throw new Error('invalid-package');
    pageIds.add(page.pageNumber);
    const lines = new Map<string, { page: number; line: number; surah: number; count: number }>();
    for (const word of page.words) {
      if (word.type === 'aya-mark') continue;
      if (!word.line || !Number.isInteger(word.line) || word.line < 1 || word.line > 15 || !canonical.has(word.surah)) throw new Error('invalid-package');
      const key = `${word.line}:${word.surah}`;
      if (!lines.has(key)) lines.set(key, { page: page.pageNumber, line: word.line, surah: word.surah, count: 0 });
      lines.get(key)!.count++;
      capacity.set(word.surah, (capacity.get(word.surah) || 0) + 1);
    }
    slots.push(...[...lines.values()].sort((first, second) => first.line - second.line || first.surah - second.surah));
  }
  for (const surah of canonical.keys()) if (!capacity.get(surah)) throw new Error('invalid-package');
  const pages = new Map<number, QuranMushafPage>();
  for (const page of pageIds) pages.set(page, {
    pageNumber: page, totalPages: pageIds.size, profile: 'warsh', layoutMode: 'adapted', svg: '', words: [],
    surahStart: 0, ayahStart: 0, surahEnd: 0, ayahEnd: 0,
    glyphLines: Array.from({ length: 15 }, (_, index) => ({ number: index + 1, type: 'empty', centered: page <= 2, surah: 0, words: [] })),
  });
  const allocated = new Map<number, number>();
  const references = new Map<string, number>();
  const numbers = new Intl.NumberFormat('ar', { useGrouping: false, numberingSystem: 'arab' });
  let emitted = 0;
  for (const slot of slots) {
    const words = canonical.get(slot.surah)!;
    const consumed = allocated.get(slot.surah) || 0;
    const from = Math.floor(consumed * words.length / capacity.get(slot.surah)!);
    const to = Math.floor((consumed + slot.count) * words.length / capacity.get(slot.surah)!);
    allocated.set(slot.surah, consumed + slot.count);
    const page = pages.get(slot.page)!;
    const line = page.glyphLines![slot.line - 1];
    for (let index = from; index < to; index++) {
      const word = words[index];
      line.type = 'ayah';
      line.surah = word.surah;
      line.words.push({ surah: word.surah, ayah: word.ayah, position: word.word, glyph: word.text, text: word.text });
      page.words.push({ id: `warsh:${word.id}`, surah: word.surah, ayah: word.ayah, wordIndex: word.word, type: 'text', line: slot.line, canonicalText: word.text });
      const reference = `${word.surah}:${word.ayah}`;
      if (!references.has(reference)) references.set(reference, slot.page);
      const next = words[index + 1];
      if (!next || next.ayah !== word.ayah) {
        const text = numbers.format(word.ayah);
        line.words.push({ surah: word.surah, ayah: word.ayah, position: 0, glyph: text, text, marker: true });
        page.words.push({ id: `warsh-marker:${reference}`, surah: word.surah, ayah: word.ayah, wordIndex: 0, type: 'aya-mark', line: slot.line });
      }
      if (index === 0 && slot.line > 1) {
        const header = page.glyphLines![slot.line - 2];
        if (header.type === 'empty') { header.type = 'surah_name'; header.surah = word.surah; }
      }
      emitted++;
    }
  }
  if (emitted !== rows.length) throw new Error('invalid-package');
  for (const page of pages.values()) {
    const text = page.words.filter(word => word.type !== 'aya-mark');
    if (!text.length) throw new Error('invalid-package');
    page.surahStart = text[0].surah; page.ayahStart = text[0].ayah;
    page.surahEnd = text[text.length - 1].surah; page.ayahEnd = text[text.length - 1].ayah;
  }
  return { pages, references };
}
