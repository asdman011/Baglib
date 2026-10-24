import type { BookItem } from '../types/work';

export function editionYearFallback(book: Pick<BookItem, 'edition' | 'publicationYear'>): string {
  if (book.edition?.trim() || book.publicationYear == null) return '';
  const original = String(book.publicationYear).trim();
  const normalized = original.replace(/[٠-٩]/g, character => String(character.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, character => String(character.charCodeAt(0) - 0x6f0));
  const year = Number(normalized);
  return /^\d{1,4}$/.test(normalized) && Number.isInteger(year) && year > 0 ? original : '';
}
