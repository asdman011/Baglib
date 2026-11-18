import type { TranslationKey } from '../../translations';

/**
 * Display labels for the built-in note types and their fields (KEY-407).
 *
 * The stored names stay in English because Anki import and export match on them. Only a built-in
 * type (`stock-*` id) whose stored name is still the seeded one gets a translated label; a type or
 * field the user created or renamed is shown exactly as written.
 */

type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;

const STOCK_TYPES: Record<string, { name: string; key: TranslationKey }> = {
  'stock-basic': { name: 'Basic', key: 'stockTypeBasic' },
  'stock-basic-reversed': { name: 'Basic (and reversed card)', key: 'stockTypeBasicReversed' },
  'stock-basic-optional-reversed': { name: 'Basic (optional reversed card)', key: 'stockTypeBasicOptionalReversed' },
  'stock-cloze': { name: 'Cloze', key: 'stockTypeCloze' },
  'stock-context-cloze': { name: 'Progressive context cloze', key: 'stockTypeContextCloze' },
  'stock-basic-typing': { name: 'Basic (type in the answer)', key: 'stockTypeBasicTyping' },
  'stock-multiple-choice': { name: 'Multiple choice', key: 'stockTypeMultipleChoice' },
  'stock-quran': { name: 'Quran', key: 'stockTypeQuran' },
  'stock-hadith': { name: 'Hadith', key: 'stockTypeHadith' },
  'stock-poetry': { name: 'Poetry', key: 'stockTypePoetry' },
  'stock-image-occlusion': { name: 'Image Occlusion', key: 'stockTypeImageOcclusion' },
  'stock-hadith-variants': { name: 'Hadith (variants)', key: 'stockTypeHadithVariants' },
  'stock-narrator': { name: 'Narrator', key: 'stockTypeNarrator' },
  'stock-poem-whole': { name: 'Poem (whole)', key: 'stockTypePoemWhole' },
  'stock-person': { name: 'Person', key: 'stockTypePerson' },
};

const STOCK_FIELDS: Record<string, TranslationKey> = {
  Front: 'stockFieldFront',
  Back: 'stockFieldBack',
  'Add Reverse': 'stockFieldAddReverse',
  Text: 'stockFieldText',
  'Back Extra': 'stockFieldBackExtra',
  'Context Before': 'stockFieldContextBefore',
  Target: 'stockFieldTarget',
  'Context After': 'stockFieldContextAfter',
  Notes: 'stockFieldNotes',
  Ayah: 'stockFieldAyah',
  Surah: 'stockFieldSurah',
  Translation: 'stockFieldTranslation',
  Bab: 'stockFieldBab',
  Hadith: 'stockFieldHadith',
  Sharh: 'stockFieldSharh',
  Poet: 'stockFieldPoet',
  Poem: 'stockFieldPoem',
  Occlusion: 'stockFieldOcclusion',
  Image: 'stockFieldImage',
  Header: 'stockFieldHeader',
  Comments: 'stockFieldComments',
  Isnad: 'stockFieldIsnad',
  Matn: 'stockFieldMatn',
  'Full card': 'stockFieldFullCard',
  'Matn card': 'stockFieldMatnCard',
  'Isnad card': 'stockFieldIsnadCard',
  Name: 'stockFieldName',
  Kunya: 'stockFieldKunya',
  Nasab: 'stockFieldNasab',
  Laqab: 'stockFieldLaqab',
  Tabaqah: 'stockFieldTabaqah',
  Death: 'stockFieldDeath',
  Grade: 'stockFieldGrade',
  Teachers: 'stockFieldTeachers',
  Students: 'stockFieldStudents',
  Title: 'stockFieldTitle',
  'Whole verse': 'stockFieldWholeVerse',
  Chunk: 'stockFieldChunk',
  Era: 'stockFieldEra',
  Works: 'stockFieldWorks',
  Field: 'stockFieldField',
  Bio: 'stockFieldBio',
  Source: 'stockFieldSource',
};

export function isBuiltInNoteType(noteType: { id: string }): boolean {
  return Object.prototype.hasOwnProperty.call(STOCK_TYPES, noteType.id);
}

export function noteTypeLabel(noteType: { id: string; name: string }, t: Translate): string {
  const stock = STOCK_TYPES[noteType.id];
  return stock && stock.name === noteType.name ? t(stock.key) : noteType.name;
}

export function noteFieldLabel(noteType: { id: string }, fieldName: string, t: Translate): string {
  if (!isBuiltInNoteType(noteType)) return fieldName;
  const key = STOCK_FIELDS[fieldName];
  return key ? t(key) : fieldName;
}
