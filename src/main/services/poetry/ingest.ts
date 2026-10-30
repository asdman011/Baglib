import type Database from 'better-sqlite3';
import { classifyPoetryLayout, normalizeArabicForSearch } from '../../../shared/poetry';
import { rebuildPoetrySearch } from './partition';

export type AshaarRow = Record<string, unknown>;

export function ingestPoetryRows(database: Database.Database, rows: Iterable<AshaarRow>, progress: (count: number) => void = () => {}, options: { append?: boolean; finalize?: boolean } = {}): number {
  if (!options.append && (database.prepare('SELECT COUNT(*) AS n FROM poems').get() as { n: number }).n) throw new Error('poetry-partition-not-empty');
  const insertPoet = database.prepare('INSERT INTO poets(slug,name,name_normalized,language,era,location,bio,external_url) VALUES(?,?,?,\'ar\',?,?,?,?)');
  const findPoet = database.prepare('SELECT id FROM poets WHERE slug=?');
  const insertPoem = database.prepare('INSERT INTO poems(poet_id,title,title_normalized,language,layout_type,meter,theme,language_variant,verse_count,verses_json,search_text_normalized,source_url,description_json) VALUES(?,?,?,\'ar\',?,?,?,?,?,?,?,?,?)');
  const text = (row: AshaarRow, key: string): string | null => typeof row[key] === 'string' ? row[key] as string : null;
  let count = 0;
  const write = database.transaction((batch: AshaarRow[]) => {
    for (const row of batch) {
      const name = text(row, 'poet name'), title = text(row, 'poem title') ?? '', verses = row['poem verses'];
      if (!name || (row['poem title'] != null && typeof row['poem title'] !== 'string') || !Array.isArray(verses) || verses.some(verse => typeof verse !== 'string')) throw new Error('invalid-poetry-row');
      const poetUrl = text(row, 'poet url');
      const slug = poetUrl || JSON.stringify([name, text(row, 'poet era'), text(row, 'poet location')]);
      let poet = findPoet.get(slug) as { id: number } | undefined;
      if (!poet) {
        const inserted = insertPoet.run(slug, name, normalizeArabicForSearch(name), text(row, 'poet era'), text(row, 'poet location'), text(row, 'poet description'), poetUrl);
        poet = { id: Number(inserted.lastInsertRowid) };
      }
      const meter = text(row, 'poem meter');
      insertPoem.run(poet.id, title, normalizeArabicForSearch(title), classifyPoetryLayout('ar', meter, verses), meter, text(row, 'poem theme'), text(row, 'poem language type'), verses.length, JSON.stringify(verses), normalizeArabicForSearch(verses.join('\n')), text(row, 'poem url'), row['poem description'] == null ? null : JSON.stringify(row['poem description']));
    }
  });
  let batch: AshaarRow[] = [];
  for (const row of rows) {
    batch.push(row);
    if (batch.length === 5000) { write(batch); count += batch.length; progress(count); batch = []; }
  }
  if (batch.length) { write(batch); count += batch.length; progress(count); }
  if (options.finalize !== false) rebuildPoetrySearch(database);
  return count;
}

export async function ingestPoetryStream(database: Database.Database, rows: AsyncIterable<AshaarRow>, progress: (count: number) => void): Promise<number> {
  if ((database.prepare('SELECT COUNT(*) AS n FROM poems').get() as { n: number }).n) throw new Error('poetry-partition-not-empty');
  let count = 0;
  let batch: AshaarRow[] = [];
  for await (const row of rows) {
    batch.push(row);
    if (batch.length === 5000) {
      count += ingestPoetryRows(database, batch, () => {}, { append: true, finalize: false });
      progress(count); batch = [];
    }
  }
  if (batch.length) count += ingestPoetryRows(database, batch, () => {}, { append: true, finalize: false });
  rebuildPoetrySearch(database);
  progress(count);
  return count;
}
