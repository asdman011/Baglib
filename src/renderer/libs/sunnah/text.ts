import { normalizeArabicText } from '../../../shared/utils/text-normalizer';
import type { SunnahPassage } from '../../../shared/types/sunnah';

export function normalizeSunnahSearch(text: string): string {
  return normalizeArabicText(text, { normalizeTaaMarbuta: false, normalizeWawHamza: false, normalizeYaaHamza: false })
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').replace(/\s+/g, ' ').trim();
}

function letters(text: string): { text: string; positions: number[] } {
  let normalized = '';
  const positions: number[] = [];
  for (let index = 0; index < text.length; index++) {
    const character = text[index].toLowerCase().replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/\u0640|[^\p{L}\p{N}]/gu, '');
    normalized += character;
    for (let offset = 0; offset < character.length; offset++) positions.push(index);
  }
  return { text: normalized, positions };
}

export function splitSunnahPassage(passage: SunnahPassage): { isnad: string; matn: string; segmented: boolean } {
  if (!passage.full) return { isnad: passage.isnad, matn: passage.matn, segmented: Boolean(passage.isnad) };
  if (!passage.isnad) return { isnad: '', matn: passage.full, segmented: false };
  const annotation = letters(passage.isnad).text;
  const original = letters(passage.full);
  if (!annotation || !original.text.startsWith(annotation)) {
    return { isnad: '', matn: passage.full, segmented: false };
  }
  const boundary = original.positions[annotation.length] ?? passage.full.length;
  return { isnad: passage.full.slice(0, boundary), matn: passage.full.slice(boundary), segmented: true };
}

const transmissionWords = new Set(['حدثنا', 'حدثني', 'حدث', 'حدثه', 'اخبرنا', 'اخبرني', 'اخبره', 'انبانا', 'انباني', 'عن', 'قال', 'قالت', 'قالا', 'قالوا', 'يقول', 'سمع', 'سمعت', 'سمعنا', 'انه', 'انها', 'ان', 'ح']);

export function shortenArabicChain(passage: SunnahPassage): string {
  const full = passage.full || [passage.isnad, passage.matn].filter(Boolean).join(' ');
  const split = splitSunnahPassage(passage);
  if (!split.segmented) return full;
  const tokens = [...split.isnad.matchAll(/[\p{L}\p{M}]+/gu)];
  const introducers = new Set(['عن', 'سمع', 'سمعت', 'سمعنا', 'حدثنا', 'حدثني', 'اخبرنا', 'اخبرني', 'انبانا', 'انباني']);
  for (let index = tokens.length - 2; index >= 0; index--) {
    const word = normalizeSunnahSearch(tokens[index][0]).replace(/^و(?=عن|سمع|حدث|اخبر|انبا)/u, '');
    const next = normalizeSunnahSearch(tokens[index + 1][0]);
    if (!introducers.has(word) || transmissionWords.has(next) || ['رسول', 'النبي'].includes(next)) continue;
    if (['الله', 'من', 'ابيه', 'امه', 'رجل'].includes(next)) return full;
    return `عن ${full.slice(tokens[index + 1].index)}`;
  }
  return full;
}

export function isnadTokens(text: string): { text: string; narrator: boolean }[] {
  const tokens = text.split(/(\s+|[،,:;؛]+)/u).filter(Boolean).map(token => {
    const normalized = normalizeSunnahSearch(token);
    const word = normalized.replace(/^و(?=حدث|اخبر|انبا|قال|عن|سمع)/u, '');
    return { text: token, narrator: /\p{L}/u.test(word) && !transmissionWords.has(word) };
  });
  const groups: { text: string; narrator: boolean }[] = [];
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    const previous = groups.at(-1);
    const joiningSpace = /^\s+$/u.test(token.text) && previous?.narrator && tokens[index + 1]?.narrator;
    if (previous?.narrator && (token.narrator || joiningSpace)) previous.text += token.text;
    else groups.push({ ...token });
  }
  return groups;
}
