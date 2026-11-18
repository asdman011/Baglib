/**
 * Baglib — biography (tarajim) decks and Wikipedia quick-cards (KEY-401).
 *
 * - Biography deck: one "Person" note per author in the library (all, or the authors of a
 *   category's books): name; era and dates; main works (their books here); field (their books'
 *   categories); the short biography the library holds. The same author is one note
 *   (`source_ref` `author:<id>`), updated in place when made again, so its schedule is kept.
 *   Hadith narrators have their own decks (KEY-396).
 * - Wikipedia quick-card: front = the article title exactly as Wikipedia has it; back = the
 *   article's summary paragraph, with the link and the language edition. The summary is fetched
 *   again here, so the card holds Wikipedia's own text, never text sent by the renderer.
 */

import type { Database } from 'better-sqlite3';
import { CardNoteRepository } from '../database/repositories/card-note.repository';
import { DeckRepository } from '../database/repositories/deck.repository';
import { PERSON_NOTE_TYPE_ID } from '../database/migrations/036_person_note_type';
import { hashFields } from './deck-sync';
import { translations } from '../../renderer/translations';
import type { WikipediaSummaryCard } from '../../shared/types/dictionary';

export const MAX_PEOPLE = 500;
/** Names the library gives a book with no known author; they are not people to revise. */
const NOT_PLACEHOLDER = "a.name NOT IN ('غير معروف', 'Unknown Author')";
const MAX_WORKS_SHOWN = 6;

const escapeHtml = (text: string) => text.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;').replace(/\r?\n/gu, '<br>');
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/u;

export interface AuthorDeckInput {
  deckName: string;
  categoryId: string | null;
  language: 'ar' | 'en';
}

export function validateAuthorDeckInput(input: unknown): AuthorDeckInput {
  const v = (input ?? {}) as Record<string, unknown>;
  if (Object.keys(v).some(k => !['deckName', 'categoryId', 'language'].includes(k))) throw new Error('invalid-request');
  if (typeof v.deckName !== 'string' || !v.deckName.trim() || v.deckName.length > 200) throw new Error('invalid-request');
  if (v.categoryId !== undefined && v.categoryId !== null && (typeof v.categoryId !== 'string' || !SAFE_ID.test(v.categoryId))) throw new Error('invalid-request');
  return { deckName: v.deckName.trim(), categoryId: (v.categoryId as string | null | undefined) ?? null, language: v.language === 'ar' ? 'ar' : 'en' };
}

export interface WikipediaCardInput {
  title: string;
  lang: string;
  language: 'ar' | 'en';
  deckId: string | null;
}

export function validateWikipediaCardInput(input: unknown): WikipediaCardInput {
  const v = (input ?? {}) as Record<string, unknown>;
  if (Object.keys(v).some(k => !['title', 'lang', 'language', 'deckId'].includes(k))) throw new Error('invalid-request');
  if (typeof v.title !== 'string' || !v.title.trim() || v.title.length > 300) throw new Error('invalid-request');
  if (typeof v.lang !== 'string' || !/^[a-z]{2,3}(?:-[a-z]{2,8})?$/u.test(v.lang)) throw new Error('invalid-request');
  if (v.deckId !== undefined && v.deckId !== null && (typeof v.deckId !== 'string' || !SAFE_ID.test(v.deckId))) throw new Error('invalid-request');
  return { title: v.title.trim(), lang: v.lang, language: v.language === 'ar' ? 'ar' : 'en', deckId: (v.deckId as string | null | undefined) ?? null };
}

export type FetchSummary = (title: string, lang: string) => Promise<WikipediaSummaryCard | null>;

export class PersonDeckService {
  private notes: CardNoteRepository;
  private decks: DeckRepository;

  constructor(private db: Database) {
    this.notes = new CardNoteRepository(db);
    this.decks = new DeckRepository(db);
  }

  private rootDeck(name: string): string {
    const existing = this.db.prepare(`SELECT id FROM deck WHERE parent_id IS NULL AND name = ? AND kind = 'normal'`).get(name) as { id: string } | undefined;
    return existing?.id ?? this.decks.createDeck({ name }).id;
  }

  /** Saves a person note, or updates the one with this reference in place and links it (schedule kept). */
  private upsert(ref: string, fields: Record<string, string>, deckId: string): 'added' | 'updated' | 'linked' {
    const existing = this.db
      .prepare(
        `SELECT n.id, n.fields_json FROM card_note n WHERE n.source_ref = ? AND n.note_type_id = ? AND n.copied_from_note_id IS NULL
         AND EXISTS (SELECT 1 FROM card_detail c JOIN knowledge k ON k.id = c.knowledge_id WHERE c.note_id = n.id AND k.deleted_at IS NULL)`
      )
      .get(ref, PERSON_NOTE_TYPE_ID) as { id: string; fields_json: string } | undefined;
    const hash = hashFields(fields);
    if (!existing) {
      this.notes.saveNote({ noteTypeId: PERSON_NOTE_TYPE_ID, fields, sourceRef: ref, deckId, sourceSnapshot: fields, sourceHash: hash });
      return 'added';
    }
    if (existing.fields_json !== JSON.stringify(fields)) {
      this.notes.saveNote({ id: existing.id, noteTypeId: PERSON_NOTE_TYPE_ID, fields, deckId });
      this.db.prepare(`UPDATE card_note SET source_snapshot_json = ?, source_hash = ? WHERE id = ?`).run(JSON.stringify(fields), hash, existing.id);
      return 'updated';
    }
    this.notes.linkNoteToDeck(existing.id, deckId);
    return 'linked';
  }

  /** The fields of one author's card, labelled in the user's language. */
  authorFields(authorId: string, language: 'ar' | 'en'): Record<string, string> | null {
    const t = translations[language];
    const author = this.db.prepare(`SELECT id, name, birth_year, death_year, bio FROM author WHERE id = ?`).get(authorId) as
      | { id: string; name: string; birth_year: string | null; death_year: string | null; bio: string | null }
      | undefined;
    if (!author?.name?.trim()) return null;
    const works = this.db
      .prepare(`SELECT w.title FROM work_author wa JOIN work w ON w.id = wa.work_id WHERE wa.author_id = ? ORDER BY w.title COLLATE NOCASE`)
      .all(authorId) as Array<{ title: string }>;
    const fields = this.db
      .prepare(
        `SELECT DISTINCT c.name_ar, c.name_en FROM work_author wa JOIN work w ON w.id = wa.work_id JOIN category c ON c.id = w.primary_category_id
         WHERE wa.author_id = ? ORDER BY c.display_order, c.name_en`
      )
      .all(authorId) as Array<{ name_ar: string; name_en: string }>;
    const birth = (author.birth_year ?? '').trim();
    const death = (author.death_year ?? '').trim();
    const era = [birth && t.personBorn.replace('{year}', birth), death && t.personDied.replace('{year}', death)].filter(Boolean).join(' · ');
    const titles = works.map(w => w.title.trim()).filter(Boolean);
    const shown = titles.slice(0, MAX_WORKS_SHOWN).join(language === 'ar' ? '، ' : ', ') + (titles.length > MAX_WORKS_SHOWN ? ` (+${titles.length - MAX_WORKS_SHOWN})` : '');
    const fieldNames = fields.map(f => (language === 'ar' ? f.name_ar || f.name_en : f.name_en || f.name_ar)).filter(Boolean);
    return {
      Name: escapeHtml(author.name.trim()),
      Era: escapeHtml(era),
      Works: titles.length ? `${escapeHtml(t.personWorks)}: ${escapeHtml(shown)}` : '',
      Field: fieldNames.length ? `${escapeHtml(t.personField)}: ${escapeHtml(fieldNames.join(language === 'ar' ? '، ' : ', '))}` : '',
      Bio: escapeHtml((author.bio ?? '').trim().slice(0, 1500)),
      Source: escapeHtml(t.personSourceLibrary),
    };
  }

  /** A deck with one card per author in the library, or per author of a category's books. */
  authorDeck(input: AuthorDeckInput): { deckId: string; people: number; added: number; updated: number; linked: number } {
    const rows = (
      input.categoryId
        ? this.db
            .prepare(
              `SELECT DISTINCT a.id FROM author a JOIN work_author wa ON wa.author_id = a.id JOIN work w ON w.id = wa.work_id
               WHERE w.primary_category_id = ? AND TRIM(a.name) <> '' AND ${NOT_PLACEHOLDER} ORDER BY a.name COLLATE NOCASE LIMIT ?`
            )
            .all(input.categoryId, MAX_PEOPLE)
        : this.db
            .prepare(`SELECT DISTINCT a.id FROM author a JOIN work_author wa ON wa.author_id = a.id WHERE TRIM(a.name) <> '' AND ${NOT_PLACEHOLDER} ORDER BY a.name COLLATE NOCASE LIMIT ?`)
            .all(MAX_PEOPLE)
    ) as Array<{ id: string }>;
    if (!rows.length) throw new Error('no-people');
    const deckId = this.rootDeck(input.deckName);
    const result = { deckId, people: 0, added: 0, updated: 0, linked: 0 };
    this.db.transaction(() => {
      for (const row of rows) {
        const fields = this.authorFields(row.id, input.language);
        if (!fields) continue;
        result[this.upsert(`author:${row.id}`, fields, deckId)] += 1;
        result.people += 1;
      }
    })();
    return result;
  }

  /** A card from a Wikipedia article, fetched again here (summary verbatim, with link and edition). */
  async wikipediaCard(input: WikipediaCardInput, fetchSummary: FetchSummary): Promise<{ deckId: string; noteId: string; created: boolean; title: string }> {
    const summary = await fetchSummary(input.title, input.lang);
    if (!summary || !summary.extract?.trim()) throw new Error('not-found');
    const lang = summary.lang || input.lang;
    let url: URL;
    try {
      url = new URL(summary.articleUrl);
    } catch {
      throw new Error('not-found');
    }
    if (url.protocol !== 'https:' || url.hostname !== `${lang}.wikipedia.org`) throw new Error('not-found');
    const t = translations[input.language];
    const edition = lang === 'ar' ? t.wikipediaEditionAr : lang === 'en' ? t.wikipediaEditionEn : `${lang}.wikipedia.org`;
    let shownUrl = url.href;
    try {
      shownUrl = decodeURI(url.href);
    } catch {
      /* keep the encoded form */
    }
    const fields: Record<string, string> = {
      Name: escapeHtml(summary.title),
      Era: '',
      Works: '',
      Field: summary.description ? escapeHtml(summary.description) : '',
      Bio: escapeHtml(summary.extract.trim()),
      Source: `${escapeHtml(edition)} — <a href="${escapeHtml(url.href)}">${escapeHtml(shownUrl)}</a>`,
    };
    const deckId = input.deckId ?? this.rootDeck(t.wikipediaDeckName);
    const deck = this.decks.getDeck(deckId);
    if (!deck || deck.kind !== 'normal') throw new Error('invalid-request');
    const ref = `wikipedia:${lang}:${summary.title}`;
    const outcome = this.db.transaction(() => this.upsert(ref, fields, deckId))();
    const note = this.db.prepare(`SELECT id FROM card_note WHERE source_ref = ? AND note_type_id = ? ORDER BY created_at LIMIT 1`).get(ref, PERSON_NOTE_TYPE_ID) as { id: string };
    return { deckId, noteId: note.id, created: outcome === 'added', title: summary.title };
  }
}
