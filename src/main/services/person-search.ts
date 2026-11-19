/**
 * BagLib — People search (scholars and narrators) for slash search (KEY-432).
 *
 * Searches existing data with no new database schema:
 * 1. `author` rows (scholars in the library),
 * 2. `card_note` rows with `stock-person` (migration 036) or `stock-narrator` (migration 034),
 * 3. `rijal_narrators` from the Sunnah research corpus when present.
 */

import type { Database } from 'better-sqlite3';
import { PERSON_NOTE_TYPE_ID } from '../database/migrations/036_person_note_type';
import { NARRATOR_NOTE_TYPE_ID } from '../database/migrations/034_sunnah_deck_note_types';
import { normalizeArabicText } from '../../shared/utils/text-normalizer';
import type { PersonSearchItem } from '../../shared/types/dictionary';

const PLACEHOLDER_AUTHORS = new Set(['غير معروف', 'unknown author']);
const MAX_QUERY_LENGTH = 200;

const fold = (value: string) =>
  normalizeArabicText(value, { normalizeTaaMarbuta: false }).toLowerCase();

function scoreMatch(foldedName: string, foldedExtra: string, foldedQuery: string, terms: string[]): number {
  if (!foldedQuery) return 10;
  const combined = foldedExtra ? `${foldedName} ${foldedExtra}` : foldedName;
  if (!terms.every(term => combined.includes(term))) return -1;
  let score = 0;
  if (foldedName === foldedQuery) score += 1500;
  else if (foldedName.startsWith(foldedQuery)) score += 1000;
  else if (foldedQuery.length >= 2 && foldedName.includes(foldedQuery)) score += 800;
  else if (terms.every(term => foldedName.includes(term))) score += 500;
  else score += 200;
  score += Math.max(0, 50 - Math.abs(foldedName.length - foldedQuery.length));
  return score;
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/gu, ' ').replace(/\s+/gu, ' ').trim();
}

export interface PersonSearchOptions {
  limit?: number;
  searchNarrators?: (query: string, limit: number) => Promise<Array<{ id: string; name: string; detail?: string }>>;
}

export async function searchPeople(
  db: Database,
  rawQuery: unknown,
  options?: PersonSearchOptions
): Promise<PersonSearchItem[]> {
  if (rawQuery !== undefined && typeof rawQuery !== 'string') throw new Error('invalid-request');
  const query = typeof rawQuery === 'string' ? rawQuery.trim().slice(0, MAX_QUERY_LENGTH) : '';
  const limit = Number.isFinite(options?.limit) ? Math.max(1, Math.min(30, Math.trunc(options!.limit!))) : 20;
  const foldedQuery = fold(query);
  const terms = foldedQuery.split(/\s+/u).filter(Boolean);

  const byTarget = new Map<string, PersonSearchItem & { score: number }>();
  const addCandidate = (item: PersonSearchItem, score: number) => {
    if (score < 0) return;
    const existing = byTarget.get(item.target);
    if (!existing || score > existing.score) {
      byTarget.set(item.target, { ...item, score });
    }
  };

  // 1. Library authors (scholars)
  const authors = db.prepare(`SELECT id, name, birth_year, death_year, bio FROM author WHERE TRIM(name) <> ''`).all() as Array<{
    id: string;
    name: string;
    birth_year: string | null;
    death_year: string | null;
    bio: string | null;
  }>;
  for (const row of authors) {
    const name = row.name.trim();
    if (!name || PLACEHOLDER_AUTHORS.has(name.toLowerCase())) continue;
    const era = [row.birth_year?.trim(), row.death_year?.trim()].filter(Boolean).join(' – ');
    const bio = (row.bio ?? '').trim();
    const score = scoreMatch(fold(name), fold([era, bio].filter(Boolean).join(' ')), foldedQuery, terms);
    if (score >= 0) {
      const detail = [era, bio.slice(0, 100)].filter(Boolean).join(' · ');
      addCandidate({
        id: row.id,
        target: `person:scholar:${row.id}`,
        name,
        role: 'scholar',
        ...(detail ? { detail } : {}),
      }, score);
    }
  }

  // 2. Person & Narrator card notes (migrations 036 & 034)
  const notes = db.prepare(
    `SELECT n.id, n.note_type_id, n.fields_json, n.source_ref
     FROM card_note n
     WHERE n.note_type_id IN (?, ?) AND n.copied_from_note_id IS NULL
       AND EXISTS (SELECT 1 FROM card_detail c JOIN knowledge k ON k.id = c.knowledge_id WHERE c.note_id = n.id AND k.deleted_at IS NULL)`
  ).all(PERSON_NOTE_TYPE_ID, NARRATOR_NOTE_TYPE_ID) as Array<{
    id: string;
    note_type_id: string;
    fields_json: string;
    source_ref: string | null;
  }>;

  for (const row of notes) {
    let fields: Record<string, string> = {};
    try {
      const parsed = JSON.parse(row.fields_json);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        fields = parsed as Record<string, string>;
      }
    } catch {
      continue;
    }
    const name = stripTags(fields.Name ?? '');
    if (!name) continue;
    const isNarrator = row.note_type_id === NARRATOR_NOTE_TYPE_ID || Boolean(row.source_ref?.startsWith('narrator:'));
    const role: 'scholar' | 'narrator' = isNarrator ? 'narrator' : 'scholar';
    const target = row.source_ref?.startsWith('narrator:')
      ? `person:${row.source_ref}`
      : row.source_ref?.startsWith('author:')
        ? `person:scholar:${row.source_ref.slice(7)}`
        : `person:card:${row.id}`;
    const extraFields = Object.entries(fields)
      .filter(([key]) => key !== 'Name' && key !== 'Source')
      .map(([, val]) => stripTags(String(val ?? '')))
      .filter(Boolean);
    const score = scoreMatch(fold(name), fold(extraFields.join(' ')), foldedQuery, terms);
    if (score >= 0) {
      const detail = extraFields.slice(0, 2).join(' · ').slice(0, 120);
      addCandidate({
        id: row.id,
        target,
        name,
        role,
        ...(detail ? { detail } : {}),
      }, score);
    }
  }

  // 3. Sunnah research corpus narrators (if present and query is non-empty)
  if (query && options?.searchNarrators) {
    const narrators = await options.searchNarrators(query, limit).catch(() => []);
    for (const narrator of narrators) {
      const name = narrator.name.trim();
      if (!name) continue;
      const score = scoreMatch(fold(name), fold(narrator.detail ?? ''), foldedQuery, terms);
      addCandidate({
        id: narrator.id,
        target: `person:narrator:${narrator.id}`,
        name,
        role: 'narrator',
        ...(narrator.detail ? { detail: narrator.detail } : {}),
      }, Math.max(score, 100));
    }
  }

  return [...byTarget.values()]
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map(({ score: _score, ...item }) => item);
}
