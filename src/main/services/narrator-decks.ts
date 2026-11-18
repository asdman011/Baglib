/**
 * Baglib — narrator (rijal al-isnad) decks (KEY-396).
 *
 * One "Narrator" note per narrator in the chains of a set of hadiths: either the hadiths the user
 * has mastered in their decks, or a chosen Sunnah book (kitab) or bab. The user chooses which
 * details go on the cards (the user's decision, 2026-11-18); fields they didn't choose stay empty
 * and are not shown. Text is copied verbatim from the research corpus (ADR-006).
 *
 * The same narrator is one note (`source_ref` `narrator:<rijal id>`): generating again, or for
 * another deck, updates its fields in place and links the same card, so its schedule is kept.
 */

import type { Database } from 'better-sqlite3';
import { CardNoteRepository } from '../database/repositories/card-note.repository';
import { DeckRepository } from '../database/repositories/deck.repository';
import { hashFields, type SourceReaders } from './deck-sync';
import { NARRATOR_NOTE_TYPE_ID } from '../database/migrations/034_sunnah_deck_note_types';
import type { SunnahNarrator } from '../../shared/types/sunnah';

export const NARRATOR_CARD_FIELDS = ['kunya', 'nasab', 'laqab', 'tabaqah', 'death', 'grade', 'teachers', 'students'] as const;
export type NarratorCardField = (typeof NARRATOR_CARD_FIELDS)[number];

export interface NarratorReaders extends SourceReaders {
  narratorIdsForHadiths(researchIds: number[]): Promise<string[]>;
  narrator(id: string): Promise<SunnahNarrator | null>;
}

export type NarratorSource = { kind: 'mastered' } | { kind: 'sunnah_book' | 'sunnah_bab'; ref: string };

export interface NarratorDeckInput {
  deckName: string;
  source: NarratorSource;
  fields: NarratorCardField[];
}

/** Cards Anki would call mature: in review with an interval (stability) of at least 21 days. */
export const MASTERED_STABILITY_DAYS = 21;
/** The most narrators one deck may hold. */
export const MAX_NARRATORS = 500;

const escapeHtml = (text: string) => text.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/\r?\n/gu, '<br>');

export function validateNarratorDeckInput(input: unknown): NarratorDeckInput {
  const value = (input ?? {}) as Record<string, unknown>;
  const extra = Object.keys(value).filter(k => !['deckName', 'source', 'fields'].includes(k));
  if (extra.length) throw new Error('invalid-request');
  if (typeof value.deckName !== 'string' || !value.deckName.trim() || value.deckName.length > 200) throw new Error('invalid-request');
  const source = (value.source ?? {}) as Record<string, unknown>;
  let parsed: NarratorSource;
  if (source.kind === 'mastered') parsed = { kind: 'mastered' };
  else if ((source.kind === 'sunnah_book' && typeof source.ref === 'string' && /^[A-Za-z0-9]{1,40}:[1-9]\d{0,4}$/u.test(source.ref)) || (source.kind === 'sunnah_bab' && typeof source.ref === 'string' && /^[A-Za-z0-9]{1,40}:[1-9]\d{0,4}:[A-Za-z0-9_-]{1,40}$/u.test(source.ref))) {
    parsed = { kind: source.kind, ref: source.ref };
  } else throw new Error('invalid-request');
  if (!Array.isArray(value.fields) || value.fields.length > NARRATOR_CARD_FIELDS.length) throw new Error('invalid-request');
  const fields = [...new Set(value.fields)];
  if (!fields.every(f => (NARRATOR_CARD_FIELDS as readonly string[]).includes(f as string))) throw new Error('invalid-request');
  return { deckName: value.deckName.trim(), source: parsed, fields: fields as NarratorCardField[] };
}

/** Narrator note fields for the chosen details; unchosen ones stay empty (hidden on the card). */
export function narratorFields(narrator: SunnahNarrator, chosen: readonly NarratorCardField[]): Record<string, string> {
  const want = (field: NarratorCardField, value: string) => (chosen.includes(field) ? escapeHtml(value.trim()) : '');
  const links = (items: Array<{ name: string }>, total: number) => {
    const names = items.map(i => i.name).filter(Boolean);
    const more = total - names.length;
    return names.join('، ') + (more > 0 ? ` (+${more})` : '');
  };
  const death = narrator.deathYear != null ? `${narrator.deathYear} هـ${narrator.deathText ? ` — ${narrator.deathText}` : ''}` : narrator.deathText;
  return {
    Name: escapeHtml(narrator.name.trim()),
    Kunya: want('kunya', narrator.kunya ?? ''),
    Nasab: want('nasab', narrator.nasab ?? ''),
    Laqab: want('laqab', narrator.laqab ?? ''),
    Tabaqah: want('tabaqah', narrator.tabaqah ?? ''),
    Death: want('death', death ?? ''),
    // The grade text only: the tier is an internal English code (e.g. "Ungraded"), not card content.
    Grade: want('grade', narrator.grade ?? ''),
    Teachers: want('teachers', links(narrator.teachers, narrator.teacherCount)),
    Students: want('students', links(narrator.students, narrator.studentCount)),
  };
}

export class NarratorDeckService {
  private notes: CardNoteRepository;
  private decks: DeckRepository;

  constructor(private db: Database, private readers: NarratorReaders) {
    this.notes = new CardNoteRepository(db);
    this.decks = new DeckRepository(db);
  }

  /** Research ids of the hadiths the user has mastered, read from their hadith cards' references. */
  async masteredHadithIds(): Promise<number[]> {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT COALESCE(n.source_ref, c.source_ref) AS ref
         FROM srs_state s
         JOIN card_detail c ON c.knowledge_id = s.knowledge_id
         JOIN knowledge k ON k.id = s.knowledge_id AND k.deleted_at IS NULL
         LEFT JOIN card_note n ON n.id = c.note_id
         WHERE s.state = 'review' AND COALESCE(s.stability, 0) >= ?
           AND (COALESCE(n.source_ref, c.source_ref) LIKE 'sunnah-hadith:%' OR COALESCE(n.source_ref, c.source_ref) LIKE 'sunnah:%')`
      )
      .all(MASTERED_STABILITY_DAYS) as Array<{ ref: string }>;
    // Group by chapter so each chapter is read once.
    const byChapter = new Map<string, Set<string>>();
    for (const { ref } of rows) {
      const rest = ref.startsWith('sunnah-hadith:') ? ref.slice(14) : ref.slice(7);
      const [collection, chapter, ...idParts] = rest.split(':');
      const hadithId = idParts.join(':');
      if (!collection || !chapter || !hadithId) continue;
      const key = `${collection}:${chapter}`;
      if (!byChapter.has(key)) byChapter.set(key, new Set());
      byChapter.get(key)!.add(hadithId);
    }
    const ids: number[] = [];
    for (const [key, wanted] of byChapter) {
      const [collection, chapter] = key.split(':');
      const found = await this.readers.sunnahChapter(collection, Number(chapter));
      for (const h of found?.hadiths ?? []) if (wanted.has(h.id) && h.researchId) ids.push(h.researchId);
    }
    return ids;
  }

  private async hadithIdsFor(source: NarratorSource): Promise<number[]> {
    if (source.kind === 'mastered') return this.masteredHadithIds();
    const [collection, chapter, section] = source.ref.split(':');
    const found = await this.readers.sunnahChapter(collection, Number(chapter));
    if (!found) throw new Error('source-not-found');
    return found.hadiths.filter(h => source.kind === 'sunnah_book' || h.sectionNumber === section).flatMap(h => (h.researchId ? [h.researchId] : []));
  }

  async generate(input: NarratorDeckInput): Promise<{ deckId: string; added: number; updated: number; linked: number; narrators: number }> {
    const hadithIds = await this.hadithIdsFor(input.source);
    if (!hadithIds.length) throw new Error(input.source.kind === 'mastered' ? 'no-mastered-hadith' : 'source-not-found');
    const narratorIds = (await this.readers.narratorIdsForHadiths(hadithIds)).slice(0, MAX_NARRATORS);
    if (!narratorIds.length) throw new Error('narrators-unavailable');
    const profiles: SunnahNarrator[] = [];
    for (const id of narratorIds) {
      const profile = await this.readers.narrator(id);
      if (profile?.name?.trim()) profiles.push(profile);
    }
    if (!profiles.length) throw new Error('narrators-unavailable');

    const existingDeck = this.db.prepare(`SELECT id FROM deck WHERE parent_id IS NULL AND name = ? AND kind = 'normal'`).get(input.deckName) as { id: string } | undefined;
    const deckId = existingDeck?.id ?? this.decks.createDeck({ name: input.deckName }).id;
    const result = { deckId, added: 0, updated: 0, linked: 0, narrators: profiles.length };
    this.db.transaction(() => {
      for (const profile of profiles) {
        const fields = narratorFields(profile, input.fields);
        const ref = `narrator:${profile.id}`;
        const hash = hashFields(fields);
        const existing = this.db
          .prepare(
            `SELECT n.id, n.fields_json FROM card_note n WHERE n.source_ref = ? AND n.note_type_id = ? AND n.copied_from_note_id IS NULL
             AND EXISTS (SELECT 1 FROM card_detail c JOIN knowledge k ON k.id = c.knowledge_id WHERE c.note_id = n.id AND k.deleted_at IS NULL)`
          )
          .get(ref, NARRATOR_NOTE_TYPE_ID) as { id: string; fields_json: string } | undefined;
        if (!existing) {
          this.notes.saveNote({ noteTypeId: NARRATOR_NOTE_TYPE_ID, fields, sourceRef: ref, deckId, sourceSnapshot: fields, sourceHash: hash });
          result.added += 1;
          continue;
        }
        if (existing.fields_json !== JSON.stringify(fields)) {
          this.notes.saveNote({ id: existing.id, noteTypeId: NARRATOR_NOTE_TYPE_ID, fields, deckId });
          this.db.prepare(`UPDATE card_note SET source_snapshot_json = ?, source_hash = ? WHERE id = ?`).run(JSON.stringify(fields), hash, existing.id);
          result.updated += 1;
        } else {
          this.notes.linkNoteToDeck(existing.id, deckId);
          result.linked += 1;
        }
      }
    })();
    return result;
  }
}
