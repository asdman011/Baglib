import type Database from 'better-sqlite3';
import { normalizeArabicForSearch, poetrySearchExcerpt, classifyPoetryLayout } from '../../../shared/poetry';
import type { PoetryQuery, PoetQuery, PoetrySummary, PoetryDetail } from '../../../shared/types/poetry';
export type { PoetryQuery } from '../../../shared/types/poetry';


export function searchPoetry(database: Database.Database, input: PoetryQuery) {
  const limit = input.limit ?? 40, after = input.after ?? 0;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(after) || after < 0 || (input.language !== undefined && !['ar', 'en'].includes(input.language))) throw new Error('invalid-poetry-query');
  const conditions = ['p.id > ?'];
  const values: (number | string)[] = [after];
  const filters = [[input.language ?? 'ar', 'p.language'], [input.poetId, 'p.poet_id'], [input.meter, 'p.meter'], [input.theme, 'p.theme'], [input.era, 'a.era']] as const;
  for (const [value, column] of filters) {
    if (value === undefined) continue;
    if (typeof value === 'string' && value.length > 300) throw new Error('invalid-poetry-query');
    if (typeof value === 'number' && (!Number.isSafeInteger(value) || value < 1)) throw new Error('invalid-poetry-query');
    conditions.push(`${column} = ?`); values.push(value);
  }
  const query = input.query ?? '';
  if (typeof query !== 'string' || query.length > 500) throw new Error('invalid-poetry-query');
  const tokens = normalizeArabicForSearch(query).split(/\s+/u).filter(Boolean);
  if (tokens.length > 32) throw new Error('invalid-poetry-query');
  if (tokens.length) {
    conditions.push('p.id IN (SELECT rowid FROM poems_fts WHERE poems_fts MATCH ?)');
    values.push(tokens.map(token => `"${token.replace(/"/gu, '""')}"`).join(' AND '));
  }
  const rows = database.prepare(`SELECT p.id, p.title, p.language, p.layout_type AS layoutType, p.meter, p.theme,
    p.verse_count AS verseCount, a.id AS poetId, a.name AS poetName${tokens.length ? ', p.verses_json AS versesJson' : ''}
    FROM poems p JOIN poets a ON a.id=p.poet_id WHERE ${conditions.join(' AND ')} ORDER BY p.id LIMIT ?`).all(...values, limit + 1) as (PoetrySummary & { versesJson?: string })[];
  const items = rows.slice(0, limit).map(({ versesJson, ...summary }) => {
    if (!versesJson) return summary;
    const parsed: unknown = JSON.parse(versesJson);
    const verses = Array.isArray(parsed) && parsed.every(value => typeof value === 'string') ? parsed as string[] : [];
    const layoutType = summary.layoutType === 'bayt' && verses.length % 2 === 0 ? classifyPoetryLayout(summary.language, summary.meter, verses) : summary.layoutType;
    return { ...summary, layoutType, match: poetrySearchExcerpt(verses, layoutType, query) };
  });
  return { items, next: rows.length > limit ? rows[limit - 1].id : null };
}

export function poetryDetail(database: Database.Database, id: number) {
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('invalid-poetry-query');
  const poem = database.prepare(`SELECT p.*, a.name AS poet_name, a.era AS poet_era, a.bio AS poet_bio,
    a.location AS poet_location, a.external_url AS poet_url FROM poems p JOIN poets a ON a.id=p.poet_id WHERE p.id=?`).get(id) as PoetryDetail | undefined;
  if (!poem) return null;
  const verses: unknown = JSON.parse(poem.verses_json);
  if (poem.layout_type === 'bayt' && Array.isArray(verses) && verses.length % 2 === 0 && verses.every(value => typeof value === 'string')) return { ...poem, layout_type: classifyPoetryLayout(poem.language, poem.meter, verses) };
  return poem;
}

export function poetryFacets(database: Database.Database) {
  const values = (table: string, column: string) => (database.prepare(`SELECT DISTINCT ${column} AS value FROM ${table} WHERE ${column} IS NOT NULL AND ${column} != '' ORDER BY ${column} LIMIT 300`).all() as { value: string }[]).map(row => row.value);
  return {
    languages: database.prepare('SELECT language,COUNT(*) AS count FROM poems GROUP BY language').all(),
    eras: values('poets', 'era'), meters: values('poems', 'meter'), themes: values('poems', 'theme'),
  };
}

export function searchPoets(database: Database.Database, input: PoetQuery) {
  const offset = input.offset ?? 0;
  if (!['ar', 'en'].includes(input.language) || !Number.isSafeInteger(offset) || offset < 0 || offset > 1000000 || typeof (input.query ?? '') !== 'string' || (input.query?.length ?? 0) > 300) throw new Error('invalid-poetry-query');
  const where = ['language = ?'];
  const values: (string | number)[] = [input.language];
  const query = normalizeArabicForSearch(input.query || '');
  if (query) { where.push('instr(name_normalized, ?) > 0'); values.push(query); }
  if (input.era !== undefined) {
    if (typeof input.era !== 'string' || input.era.length > 300) throw new Error('invalid-poetry-query');
    where.push('era = ?'); values.push(input.era);
  }
  const clause = where.join(' AND ');
  const total = (database.prepare(`SELECT COUNT(*) AS n FROM poets WHERE ${clause}`).get(...values) as { n: number }).n;
  const items = database.prepare(`SELECT id,name,era,poem_count AS poemCount FROM poets WHERE ${clause} ORDER BY name_normalized,id LIMIT 40 OFFSET ?`).all(...values, offset);
  return { items, total, offset };
}
