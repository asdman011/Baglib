/**
 * Baglib — "Revise next" (KEY-412): the rule-based first layer of the KEY-404 decision.
 *
 * Offline and deterministic. It only reads existing tables (FSRS state and log, decks, deck
 * subscriptions, card notes, annotations, reading status); a dismissal is remembered in one
 * `app_settings` key for `RECOMMENDATION_DISMISS_DAYS`. Every item names the rule behind it.
 */

import type { Database } from 'better-sqlite3';
import { fsrs } from 'ts-fsrs';
import { getSrsDayBounds, SRS_ROLLOVER_SETTING_KEY } from '../../shared/srs';
import {
  activeDismissals,
  BACKLOG_DAILY_CHUNK,
  LAPSE_AGAIN_COUNT,
  LAPSE_WINDOW_DAYS,
  MAX_RECOMMENDATIONS,
  NARRATOR_MIN_MASTERED,
  NEW_IDLE_DAYS,
  QUESTIONS_MIN_HIGHLIGHTS,
  RECOMMENDATION_DISMISS_DAYS,
  RECOMMENDATIONS_DISMISSED_SETTING,
  validateRecommendationId,
  WEAK_RETRIEVABILITY,
  type Recommendation,
} from '../../shared/revision-recommendations';
import { DeckRepository } from '../database/repositories/deck.repository';
import { SqliteSettingsRepository } from '../database/repositories/settings.repository';
import { MASTERED_STABILITY_DAYS } from './narrator-decks';

const DAY_MS = 86_400_000;

/** Higher comes first. A backlog with likely-forgotten cards is ranked by how many there are. */
const PRIORITY: Record<Recommendation['kind'], number> = {
  backlog: 70,
  leeches: 90,
  'finished-book': 80,
  narrators: 60,
  'book-questions': 50,
  'new-waiting': 40,
};

const HAS_TEXT = `(TRIM(COALESCE(a.selected_text, '')) <> '' OR TRIM(COALESCE(a.note_content, '')) <> '')`;

export class RevisionRecommendationService {
  private settings: SqliteSettingsRepository;
  private decks: DeckRepository;
  private scheduler = fsrs({ enable_fuzz: false });

  constructor(private db: Database, private clock: () => Date = () => new Date()) {
    this.settings = new SqliteSettingsRepository(db);
    this.decks = new DeckRepository(db);
  }

  private rolloverHour(): 0 | 4 {
    const raw = this.settings.get<number | string>(SRS_ROLLOVER_SETTING_KEY, 4);
    return raw === 0 || raw === '0' ? 0 : 4;
  }

  list(): Recommendation[] {
    const now = this.clock();
    const dismissed = activeDismissals(this.settings.get(RECOMMENDATIONS_DISMISSED_SETTING, {}), now);
    const names = new Map(this.decks.listDecks().filter(d => d.kind === 'normal').map(d => [d.id, d.fullName]));
    const backlog = this.backlog(now, names);
    const items = [
      ...backlog,
      ...this.leeches(now, names),
      ...this.finishedBooks(),
      ...this.narrators(),
      ...this.bookQuestions(),
      ...this.newWaiting(now, names, new Set(backlog.map(b => b.deckId ?? ''))),
    ].filter(item => !dismissed[item.id]);
    const score = (item: Recommendation) => PRIORITY[item.kind] + (item.kind === 'backlog' && item.weak ? 30 + Math.min(item.weak, 100) / 1000 : 0);
    return items.sort((a, b) => score(b) - score(a) || b.count - a.count).slice(0, MAX_RECOMMENDATIONS);
  }

  dismiss(rawId: unknown): void {
    const id = validateRecommendationId(rawId);
    const now = this.clock();
    const current = activeDismissals(this.settings.get(RECOMMENDATIONS_DISMISSED_SETTING, {}), now);
    current[id] = new Date(now.getTime() + RECOMMENDATION_DISMISS_DAYS * DAY_MS).toISOString();
    this.settings.set(RECOMMENDATIONS_DISMISSED_SETTING, current);
  }

  /** Overdue from earlier days, per deck, with how many are likely forgotten by now. */
  private backlog(now: Date, names: Map<string, string>): Recommendation[] {
    const { dayStart } = getSrsDayBounds(now, this.rolloverHour());
    const rows = this.db
      .prepare(
        `SELECT dc.deck_id, s.stability, s.last_review
         FROM srs_state s
         JOIN knowledge k ON k.id = s.knowledge_id AND k.deleted_at IS NULL
         JOIN deck_card dc ON dc.knowledge_id = s.knowledge_id
         WHERE s.state IN ('learning', 'review', 'relearning') AND s.due_at < ?
           AND (s.buried_until IS NULL OR s.buried_until <= ?)`
      )
      .all(dayStart.toISOString(), now.toISOString()) as Array<{ deck_id: string; stability: number | null; last_review: string | null }>;
    const byDeck = new Map<string, { count: number; weak: number }>();
    for (const row of rows) {
      if (!names.has(row.deck_id)) continue;
      const entry = byDeck.get(row.deck_id) ?? { count: 0, weak: 0 };
      entry.count += 1;
      if (row.stability && row.stability > 0 && row.last_review) {
        const elapsed = Math.max(0, (now.getTime() - Date.parse(row.last_review)) / DAY_MS);
        if (this.scheduler.forgetting_curve(elapsed, row.stability) < WEAK_RETRIEVABILITY) entry.weak += 1;
      }
      byDeck.set(row.deck_id, entry);
    }
    return [...byDeck].map(([deckId, { count, weak }]) => ({
      id: `backlog:${deckId}`,
      kind: 'backlog' as const,
      count,
      weak,
      suggested: Math.min(count, BACKLOG_DAILY_CHUNK),
      deckId,
      deckName: names.get(deckId),
    }));
  }

  /** Cards tagged leech, or rated "Again" repeatedly in the last two weeks. One item, pointing at the deck holding most. */
  private leeches(now: Date, names: Map<string, string>): Recommendation[] {
    const since = new Date(now.getTime() - LAPSE_WINDOW_DAYS * DAY_MS).toISOString();
    const rows = this.db
      .prepare(
        `SELECT s.knowledge_id FROM srs_state s
         JOIN knowledge k ON k.id = s.knowledge_id AND k.deleted_at IS NULL
         WHERE s.state <> 'suspended' AND (
           EXISTS (SELECT 1 FROM knowledge_tag kt JOIN tag t ON t.id = kt.tag_id WHERE kt.knowledge_id = s.knowledge_id AND t.name = 'leech')
           OR (SELECT COUNT(*) FROM srs_review_log r WHERE r.knowledge_id = s.knowledge_id AND r.rating = 1 AND r.reviewed_at >= ?) >= ?
         )`
      )
      .all(since, LAPSE_AGAIN_COUNT) as Array<{ knowledge_id: string }>;
    if (!rows.length) return [];
    const ids = rows.map(r => r.knowledge_id);
    const perDeck = new Map<string, number>();
    const inDeck = this.db.prepare(`SELECT deck_id FROM deck_card WHERE knowledge_id = ?`);
    for (const id of ids) {
      for (const { deck_id } of inDeck.all(id) as Array<{ deck_id: string }>) {
        if (names.has(deck_id)) perDeck.set(deck_id, (perDeck.get(deck_id) ?? 0) + 1);
      }
    }
    const top = [...perDeck].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return [{ id: 'leeches:all', kind: 'leeches', count: ids.length, deckId: top, deckName: top ? names.get(top) : undefined }];
  }

  /** Finished books with highlights or comments but no deck following them. */
  private finishedBooks(): Recommendation[] {
    const rows = this.db
      .prepare(
        `SELECT w.id, w.title, COUNT(a.id) AS n
         FROM work w JOIN annotations a ON a.book_id = w.id AND ${HAS_TEXT}
         WHERE w.reading_status = 'completed' AND w.deleted_at IS NULL
           AND NOT EXISTS (SELECT 1 FROM deck_subscription s WHERE s.source_kind IN ('book_highlights', 'book_comments') AND s.source_ref = w.id)
         GROUP BY w.id ORDER BY n DESC, w.title LIMIT 3`
      )
      .all() as Array<{ id: string; title: string; n: number }>;
    return rows.map(r => ({ id: `finished-book:${r.id}`, kind: 'finished-book' as const, count: r.n, workId: r.id, title: r.title }));
  }

  /** Enough mastered hadith, but no narrator cards yet. */
  private narrators(): Recommendation[] {
    const hasNarrators = this.db
      .prepare(`SELECT 1 FROM card_note WHERE source_ref LIKE 'narrator:%' UNION ALL SELECT 1 FROM card_detail WHERE source_ref LIKE 'narrator:%' LIMIT 1`)
      .get();
    if (hasNarrators) return [];
    const { n } = this.db
      .prepare(
        `SELECT COUNT(DISTINCT COALESCE(n.source_ref, c.source_ref)) AS n
         FROM srs_state s
         JOIN card_detail c ON c.knowledge_id = s.knowledge_id
         JOIN knowledge k ON k.id = s.knowledge_id AND k.deleted_at IS NULL
         LEFT JOIN card_note n ON n.id = c.note_id
         WHERE s.state = 'review' AND COALESCE(s.stability, 0) >= ?
           AND (COALESCE(n.source_ref, c.source_ref) LIKE 'sunnah-hadith:%' OR COALESCE(n.source_ref, c.source_ref) LIKE 'sunnah:%')`
      )
      .get(MASTERED_STABILITY_DAYS) as { n: number };
    return n >= NARRATOR_MIN_MASTERED ? [{ id: 'narrators:mastered', kind: 'narrators', count: n }] : [];
  }

  /** Books with a deck whose highlights and comments have no accepted AI question yet. */
  private bookQuestions(): Recommendation[] {
    const rows = this.db
      .prepare(
        `SELECT w.id, w.title, COUNT(a.id) AS n
         FROM work w JOIN annotations a ON a.book_id = w.id AND ${HAS_TEXT}
         WHERE w.deleted_at IS NULL
           AND EXISTS (SELECT 1 FROM deck_subscription s WHERE s.source_kind = 'book_highlights' AND s.source_ref = w.id)
           AND NOT EXISTS (SELECT 1 FROM card_note n WHERE n.source_ref LIKE 'ai-question:' || a.book_id || '/' || a.id || '/%')
         GROUP BY w.id HAVING n >= ? ORDER BY n DESC, w.title LIMIT 2`
      )
      .all(QUESTIONS_MIN_HIGHLIGHTS) as Array<{ id: string; title: string; n: number }>;
    return rows.map(r => ({ id: `book-questions:${r.id}`, kind: 'book-questions' as const, count: r.n, workId: r.id, title: r.title }));
  }

  /** Decks with new cards nobody has started for a few days (and new cards allowed by their preset). */
  private newWaiting(now: Date, names: Map<string, string>, skip: Set<string>): Recommendation[] {
    const idleSince = new Date(now.getTime() - NEW_IDLE_DAYS * DAY_MS).toISOString();
    const rows = this.db
      .prepare(
        `SELECT d.id, COUNT(s.knowledge_id) AS n
         FROM deck d
         JOIN deck_card dc ON dc.deck_id = d.id
         JOIN srs_state s ON s.knowledge_id = dc.knowledge_id AND s.state = 'new' AND (s.buried_until IS NULL OR s.buried_until <= ?)
         JOIN knowledge k ON k.id = s.knowledge_id AND k.deleted_at IS NULL
         WHERE d.kind = 'normal' AND d.created_at < ?
           AND NOT EXISTS (
             SELECT 1 FROM deck_card dc2 JOIN srs_review_log r ON r.knowledge_id = dc2.knowledge_id
             WHERE dc2.deck_id = d.id AND r.state_before = 'new' AND r.reviewed_at >= ?
           )
         GROUP BY d.id ORDER BY n DESC`
      )
      .all(now.toISOString(), idleSince, idleSince) as Array<{ id: string; n: number }>;
    return rows
      .filter(r => names.has(r.id) && !skip.has(r.id) && this.decks.getEffectivePresetForDeck(r.id).newPerDay > 0)
      .slice(0, 2)
      .map(r => ({ id: `new-waiting:${r.id}`, kind: 'new-waiting' as const, count: r.n, deckId: r.id, deckName: names.get(r.id) }));
  }
}
