import { createHash } from 'node:crypto';
import { unzipSync } from 'fflate';
import { DatabaseSync } from 'node:sqlite';

export function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function unpackSample(bytes, expectedHash, limits = {}) {
  const { compressedBytes = 20 * 1024 * 1024, expandedBytes = 64 * 1024 * 1024, entries = 16 } = limits;
  if (bytes.length > compressedBytes || hash(bytes) !== expectedHash) throw new Error('Archive identity/size mismatch');
  if (!Buffer.from(bytes).subarray(0, 4).equals(Buffer.from([80, 75, 3, 4]))) throw new Error('Expected ZIP signature');
  let declaredBytes = 0;
  let count = 0;
  const result = unzipSync(bytes, { filter: file => {
    count++;
    declaredBytes += file.originalSize;
    if (count > entries || declaredBytes > expandedBytes) throw new Error('Archive exceeds expansion limits');
    if (!/^[a-zA-Z0-9_(). -]+\.(json|db|sqlite|woff2?|ttf)$/.test(file.name)) throw new Error('Unsafe or unsupported archive member');
    return true;
  } });
  if (!count || Object.values(result).reduce((total, value) => total + value.length, 0) > expandedBytes) throw new Error('Invalid expanded archive size');
  return result;
}

export function openSource(filename, expectedTables) {
  const database = new DatabaseSync(filename, { readOnly: true, allowExtension: false });
  try {
    database.exec('PRAGMA trusted_schema=OFF; PRAGMA query_only=ON');
    const schema = database.prepare("SELECT type, name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'").all();
    if (schema.some(item => !['table', 'index'].includes(item.type) || /CREATE\s+VIRTUAL/i.test(item.sql || ''))) throw new Error('Unexpected executable schema');
    const actualTables = schema.filter(item => item.type === 'table').map(item => item.name).sort();
    if (JSON.stringify(actualTables) !== JSON.stringify(Object.keys(expectedTables).sort())) throw new Error('Unexpected tables');
    for (const [table, columns] of Object.entries(expectedTables)) {
      if (!/^[a-z_]+$/.test(table)) throw new Error('Invalid table contract');
      const actualColumns = database.prepare(`PRAGMA table_info("${table}")`).all().map(column => column.name);
      if (JSON.stringify(actualColumns) !== JSON.stringify(columns)) throw new Error('Unexpected columns');
    }
    if (database.prepare('PRAGMA quick_check').get().quick_check !== 'ok') throw new Error('Invalid SQLite integrity');
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

export function ayahKey(surah, ayah) {
  if (![surah, ayah].every(value => typeof value === 'number' || (typeof value === 'string' && /^[0-9]+$/.test(value)))) throw new Error('Invalid ayah identity');
  const chapter = Number(surah);
  const verse = Number(ayah);
  if (!Number.isInteger(chapter) || chapter < 1 || chapter > 114 || !Number.isInteger(verse) || verse < 1 || verse > 286) throw new Error('Invalid ayah identity');
  return `${chapter}:${verse}`;
}

export function wordKey(surah, ayah, word) {
  if (!(typeof word === 'number' || (typeof word === 'string' && /^[0-9]+$/.test(word)))) throw new Error('Invalid word position');
  const position = Number(word);
  if (!Number.isInteger(position) || position < 1 || position > 500) throw new Error('Invalid word position');
  return `${ayahKey(surah, ayah)}:${position}`;
}

export function decodeTranslation(row) {
  const text = JSON.parse(row.text);
  const footnotes = row.footnotes ? JSON.parse(row.footnotes) : {};
  if (typeof text !== 'string' || !footnotes || typeof footnotes !== 'object' || Array.isArray(footnotes) || Object.values(footnotes).some(value => typeof value !== 'string')) throw new Error('Invalid translation encoding');
  return { text, footnotes };
}

export function resolveTafsir(rows, key) {
  const visited = new Set();
  let current = key;
  while (!visited.has(current)) {
    visited.add(current);
    const row = rows.get(current);
    if (!row) throw new Error('Missing tafsir group');
    if (typeof row.text === 'string' && row.text.length) return { text: row.text, group: current };
    current = row.group_ayah_key;
  }
  throw new Error('Cyclic tafsir group');
}

export function normalizeSearch(text) {
  return text.normalize('NFKC').replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').toLocaleLowerCase('en');
}

export function isAyahMarker(text) {
  return /^[٠-٩۰-۹0-9]+$/u.test(text.trim());
}

export const schemas = {
  script: { verses: ['id', 'verse_key', 'surah', 'ayah', 'text'] },
  words: { words: ['id', 'location', 'surah', 'ayah', 'word', 'text'] },
  ayahMetadata: { verses: ['id', 'surah_number', 'ayah_number', 'verse_key', 'words_count', 'text'] },
  surahMetadata: { chapters: ['id', 'name', 'name_simple', 'name_arabic', 'revelation_order', 'revelation_place', 'verses_count', 'bismillah_pre'] },
  translation: { translation: ['sura', 'ayah', 'ayah_key', 'text', 'footnotes'] },
  wordTranslation: { word_translation: ['surah_number', 'ayah_number', 'word_number', 'text'] },
  tafsir: { tafsir: ['ayah_key', 'group_ayah_key', 'from_ayah', 'to_ayah', 'ayah_keys', 'text'] },
  roots: { roots: ['id', 'arabic_trilateral', 'english_trilateral', 'words_count', 'uniq_words_count'], root_words: ['root_id', 'word_location'] },
};
