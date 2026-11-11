import type { SaveCardInput } from './types/knowledge-cards';

// KEY-319: a memorization deck from a range of hadiths in one chapter (kitab) of one collection.
export interface HadithDeckInput {
  name: string;
  collection: string;
  chapter: number;
  from: number;
  to: number;
  memorize: boolean;
}

/** Longest range one request may turn into cards. */
export const MAX_HADITH_DECK_RANGE = 300;

export function validateHadithDeckInput(input: unknown): HadithDeckInput {
  const { name, collection, chapter, from, to, memorize } = (input ?? {}) as Record<string, unknown>;
  if (typeof name !== 'string' || !name.trim() || name.length > 200) throw new Error('invalid-request');
  if (typeof collection !== 'string' || !/^[A-Za-z0-9]{1,40}$/u.test(collection)) throw new Error('invalid-request');
  if (!Number.isInteger(chapter) || (chapter as number) < 1) throw new Error('invalid-request');
  if (!Number.isInteger(from) || !Number.isInteger(to) || (from as number) < 1 || (to as number) < (from as number)) throw new Error('invalid-request');
  if ((to as number) - (from as number) + 1 > MAX_HADITH_DECK_RANGE) throw new Error('invalid-request');
  return { name: name.trim(), collection, chapter: chapter as number, from: from as number, to: to as number, memorize: memorize === true };
}

export interface StoredHadith {
  id: string;
  number: string;
  /** The matn when the corpus separates it, else the full text; copied exactly. */
  text: string;
}

/** One card per hadith whose number falls in the range; the back is the stored text, unchanged. */
export function hadithRangeDrafts(hadiths: readonly StoredHadith[], request: HadithDeckInput, collectionName: string): SaveCardInput[] {
  const range = request.from === request.to ? `${request.from}` : `${request.from}-${request.to}`;
  return hadiths
    .filter(hadith => {
      const number = Number.parseInt(hadith.number, 10);
      return Number.isInteger(number) && number >= request.from && number <= request.to && hadith.text.trim().length > 0;
    })
    .map(hadith => ({
      front: `${collectionName} ${hadith.number}`,
      back: hadith.text,
      sourceKind: 'hadith' as const,
      sourceRef: `sunnah:${request.collection}:${request.chapter}:${hadith.id}`,
      sourceLabel: `${collectionName} ${range}`,
      language: 'ar',
    }));
}
