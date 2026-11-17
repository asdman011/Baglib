import type { Database } from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { createEmptyCard, fsrs, generatorParameters, State, type Card, type FSRS } from 'ts-fsrs';
import {
  getSrsDayBounds,
  parseFilteredSearch,
  SRS_ROLLOVER_SETTING_KEY,
  validateReview,
  type DeckItem,
  type DeckTreeNode,
  type GradeReviewInput,
  type LeechAlert,
  type PropOperator,
  type ReviewCard,
  type ReviewQueue,
  type SrsCardState,
  type SrsEntryKind,
  type SrsPreset,
} from '../../shared/srs';
import { DeckRepository } from '../database/repositories/deck.repository';
import { SqliteSettingsRepository } from '../database/repositories/settings.repository';
import { MEMORIZATION_DECK_ID } from '../database/migrations/031_decks_and_scheduler';

interface Schedule {
  knowledge_id: string;
  state: SrsCardState;
  due_at: string;
  stability: number | null;
  difficulty: number | null;
  reps: number;
  lapses: number;
  last_review: string | null;
  learning_step?: number;
  buried_until?: string | null;
  new_position?: number | null;
  desired_retention?: number | null;
}

interface JoinedCardRow extends Schedule {
  questionKind: ReviewCard['questionKind'];
  payloadJson: string | null;
  cardRevision: number;
  front: string;
  back: string;
  sourceKind: ReviewCard['sourceKind'];
  sourceRef: string | null;
  sourceLabel: string | null;
  language: string | null;
  workId: string | null;
  createdAt: string;
  noteId: string | null;
  ord: number | null;
  deckId?: string | null;
  deckPosition?: number;
}

const states: SrsCardState[] = ['new', 'learning', 'review', 'relearning'];
const revision = (row: Schedule) => JSON.stringify([row.state, row.due_at, row.reps, row.last_review]);

function compareProp(actual: number, op: PropOperator, expected: number): boolean {
  switch (op) {
    case '<':
      return actual < expected;
    case '<=':
      return actual <= expected;
    case '>':
      return actual > expected;
    case '>=':
      return actual >= expected;
    case '=':
      return Math.abs(actual - expected) < 1e-6;
  }
}

export class SrsService {
  private deckRepo: DeckRepository;
  private settings: SqliteSettingsRepository;
  private schedulerCache = new Map<string, { updatedAt: string; instance: FSRS }>();
  private defaultScheduler = fsrs({ enable_fuzz: false });

  constructor(
    private db: Database,
    private clock: () => Date = () => new Date()
  ) {
    this.deckRepo = new DeckRepository(db);
    this.settings = new SqliteSettingsRepository(db);
  }

  private hasDeckTables(): boolean {
    return Boolean(
      this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='deck'").get()
    );
  }

  private hasExtendedLogCols(): boolean {
    try {
      return Boolean(
        this.db.prepare("SELECT 1 FROM pragma_table_info('srs_review_log') WHERE name='entry_kind'").get()
      );
    } catch {
      return false;
    }
  }

  private hasExtendedStateCols(): boolean {
    try {
      return Boolean(
        this.db.prepare("SELECT 1 FROM pragma_table_info('srs_state') WHERE name='learning_step'").get()
      );
    } catch {
      return false;
    }
  }

  private hasNoteCols(): boolean {
    try {
      return Boolean(
        this.db.prepare("SELECT 1 FROM pragma_table_info('card_detail') WHERE name='note_id'").get()
      );
    } catch {
      return false;
    }
  }

  private activeKnowledge(): string {
    const columns = this.db.prepare('PRAGMA table_info(knowledge)').all() as { name: string }[];
    return columns.some(column => column.name === 'deleted_at') ? ' AND k.deleted_at IS NULL' : '';
  }

  getRolloverHour(): 0 | 4 {
    try {
      const raw = this.settings.get<number | string>(SRS_ROLLOVER_SETTING_KEY, 4);
      if (raw === 0 || raw === '0') return 0;
    } catch {}
    return 4;
  }

  setRolloverHour(hour: 0 | 4): 0 | 4 {
    const valid: 0 | 4 = hour === 0 ? 0 : 4;
    this.settings.set(SRS_ROLLOVER_SETTING_KEY, valid);
    return valid;
  }

  /**
   * Clears expired burials when a day rollover has passed.
   */
  private clearExpiredBurials(now: Date, dayStart: Date, rolloverHour: 0 | 4): void {
    if (!this.hasExtendedStateCols()) return;
    const nowIso = now.toISOString();
    this.db
      .prepare(`UPDATE srs_state SET buried_until = NULL WHERE buried_until IS NOT NULL AND buried_until <= ?`)
      .run(nowIso);

    // If rollover hour was switched to midnight (0), any card buried yesterday for 04:00 today
    // has already crossed midnight rollover and should be unburied.
    if (rolloverHour === 0) {
      const fourAmTodayIso = new Date(dayStart.getTime() + 4 * 3600_000).toISOString();
      this.db
        .prepare(`UPDATE srs_state SET buried_until = NULL WHERE buried_until IS NOT NULL AND buried_until <= ?`)
        .run(fourAmTodayIso);
    }
  }

  private getSchedulerForPreset(preset: SrsPreset): FSRS {
    const cached = this.schedulerCache.get(preset.id);
    if (cached && cached.updatedAt === preset.updatedAt) {
      return cached.instance;
    }

    const learnSteps = preset.learnSteps.map(m => `${m}m` as `${number}m`);
    const relearnSteps = preset.relearnSteps.map(m => `${m}m` as `${number}m`);

    const params = generatorParameters({
      enable_fuzz: false,
      enable_short_term: learnSteps.length > 0 || relearnSteps.length > 0,
      learning_steps: learnSteps,
      relearning_steps: relearnSteps,
      request_retention: preset.desiredRetention,
      maximum_interval: preset.maximumInterval,
      ...(preset.fsrsParams && preset.fsrsParams.length === 21 ? { w: preset.fsrsParams } : {}),
    });

    const instance = fsrs(params);
    this.schedulerCache.set(preset.id, { updatedAt: preset.updatedAt, instance });
    return instance;
  }

  private getPrimaryDeckForCard(cardId: string, preferredDeckId?: string | null): string | null {
    if (!this.hasDeckTables()) return null;
    if (preferredDeckId) {
      const deck = this.deckRepo.getDeck(preferredDeckId);
      if (deck && deck.kind === 'normal') {
        const inDeck = this.db
          .prepare(`SELECT 1 FROM deck_card WHERE deck_id = ? AND knowledge_id = ?`)
          .get(preferredDeckId, cardId);
        if (inDeck) return preferredDeckId;
      }
    }
    const row = this.db
      .prepare(
        `SELECT deck_id FROM deck_card
         WHERE knowledge_id = ?
         ORDER BY CASE WHEN deck_id = 'memorization' THEN 1 ELSE 0 END ASC, added_at ASC
         LIMIT 1`
      )
      .get(cardId) as { deck_id: string } | undefined;
    return row?.deck_id ?? null;
  }

  private getSchedulerForCard(cardId: string, preferredDeckId?: string | null): {
    scheduler: FSRS;
    preset: SrsPreset;
  } {
    if (!this.hasDeckTables()) {
      const fallbackPreset: SrsPreset = {
        id: 'default',
        name: 'Default',
        learnSteps: [1, 10],
        relearnSteps: [10],
        newPerDay: 20,
        reviewsPerDay: 200,
        desiredRetention: 0.9,
        maximumInterval: 36500,
        buryNew: false,
        buryReviews: false,
        buryInterday: false,
        leechThreshold: 8,
        leechAction: 'tag',
        newOrder: 'position',
        fsrsParams: null,
        ankiId: null,
        ankiExtra: null,
        createdAt: '',
        updatedAt: '',
      };
      return { scheduler: this.defaultScheduler, preset: fallbackPreset };
    }
    const deckId = this.getPrimaryDeckForCard(cardId, preferredDeckId);
    const preset = this.deckRepo.getEffectivePresetForDeck(deckId);
    return { scheduler: this.getSchedulerForPreset(preset), preset };
  }

  /**
   * Reconstructs the FSRS Card from `srs_state`, using `srs_state.learning_step` directly.
   */
  private cardFor(row: Schedule, now: Date): Card {
    const stateIdx = Math.max(0, states.indexOf(row.state));
    let card: Card = {
      ...createEmptyCard(now),
      due: new Date(row.due_at),
      state: stateIdx as State,
      stability: row.stability ?? 0,
      difficulty: row.difficulty ?? 0,
      reps: row.reps,
      lapses: row.lapses,
      learning_steps: row.learning_step ?? 0,
      last_review: row.last_review ? new Date(row.last_review) : undefined,
    };

    const previous = this.db
      .prepare(
        `SELECT state_before FROM srs_review_log
         WHERE knowledge_id = ?
         ORDER BY reviewed_at DESC, rowid DESC LIMIT 1`
      )
      .get(row.knowledge_id) as { state_before: string | null } | undefined;

    if (previous?.state_before) {
      try {
        const saved = JSON.parse(previous.state_before).after as Card | undefined;
        if (saved && saved.reps === row.reps && new Date(saved.due).toISOString() === row.due_at) {
          card = {
            ...saved,
            state: card.state,
            learning_steps: row.learning_step ?? saved.learning_steps ?? 0,
            due: new Date(saved.due),
            last_review: saved.last_review ? new Date(saved.last_review) : undefined,
          };
        }
      } catch {}
    }
    return card;
  }

  /** KEY-234 follow-up: the review screen shows the real next interval for each rating, not fixed guesses. */
  private intervals(
    row: Schedule,
    now: Date,
    scheduler: FSRS
  ): Partial<Record<1 | 2 | 3 | 4, number>> {
    const card = this.cardFor(row, now);
    const result: Partial<Record<1 | 2 | 3 | 4, number>> = {};
    for (const rating of [1, 2, 3, 4] as const) {
      result[rating] = Math.max(
        1,
        Math.round((scheduler.next(card, now, rating).card.due.getTime() - now.getTime()) / 60000)
      );
    }
    return result;
  }

  private toReviewCard(row: JoinedCardRow, now: Date, preferredDeckId?: string | null): ReviewCard {
    const { scheduler } = this.getSchedulerForCard(row.knowledge_id, preferredDeckId ?? row.deckId);
    return {
      id: row.knowledge_id,
      questionKind: row.questionKind,
      payload: row.payloadJson ? JSON.parse(row.payloadJson) : null,
      cardRevision: row.cardRevision,
      front: row.front,
      back: row.back,
      sourceKind: row.sourceKind,
      sourceRef: row.sourceRef,
      sourceLabel: row.sourceLabel,
      language: row.language,
      workId: row.workId,
      createdAt: row.createdAt,
      memorizing: row.state !== 'suspended',
      noteId: row.noteId,
      ord: row.ord,
      state: row.state,
      lapses: row.lapses,
      reps: row.reps,
      learningStep: row.learning_step ?? 0,
      buriedUntil: row.buried_until ?? null,
      deckId: preferredDeckId ?? row.deckId ?? null,
      revision: revision(row),
      intervals: this.intervals(row, now, scheduler),
    };
  }

  /**
   * Ensures any active card in `srs_state` that has no `deck_card` entry (for example in raw-SQL tests)
   * is linked into the built-in Memorization deck so deck-based queue gathering includes it.
   */
  private syncOrphanSrsCardsToMemorizationDeck(nowIso: string): void {
    if (!this.hasDeckTables()) return;
    const orphans = this.db
      .prepare(
        `SELECT s.knowledge_id
         FROM srs_state s
         JOIN knowledge k ON k.id = s.knowledge_id
         LEFT JOIN deck_card dc ON dc.knowledge_id = s.knowledge_id
         WHERE dc.knowledge_id IS NULL AND s.state <> 'suspended'${this.activeKnowledge()}`
      )
      .all() as Array<{ knowledge_id: string }>;

    if (orphans.length > 0) {
      this.deckRepo.ensureMemorizationDeck();
      const maxPos = (
        this.db
          .prepare(`SELECT COALESCE(MAX(position), 0) AS maxPos FROM deck_card WHERE deck_id = ?`)
          .get(MEMORIZATION_DECK_ID) as { maxPos: number }
      ).maxPos;
      let pos = maxPos;
      const insert = this.db.prepare(
        `INSERT OR IGNORE INTO deck_card (deck_id, knowledge_id, position, added_at) VALUES (?, ?, ?, ?)`
      );
      for (const o of orphans) {
        pos += 1;
        insert.run(MEMORIZATION_DECK_ID, o.knowledge_id, pos, nowIso);
      }
    }
  }

  /**
   * Computes how many New cards and how many Review cards were already studied today
   * within a set of deck IDs.
   */
  private getDoneTodayForDecks(
    deckIds: string[],
    dayStartIso: string,
    dayEndIso: string
  ): { newDone: number; reviewsDone: number } {
    if (deckIds.length === 0) return { newDone: 0, reviewsDone: 0 };
    const placeholders = deckIds.map(() => '?').join(',');

    // New cards introduced today: cards in these decks that have an entry_kind='learn' review today
    // where their state before that review was 'new' (or first learn review since last reset)
    // and whose current state is no longer 'new' (not subsequently Forgotten).
    const newDone = (
      this.db
        .prepare(
          `SELECT COUNT(DISTINCT r.knowledge_id) AS count
           FROM srs_review_log r
           JOIN deck_card dc ON dc.knowledge_id = r.knowledge_id
           JOIN srs_state s ON s.knowledge_id = r.knowledge_id
           JOIN knowledge k ON k.id = r.knowledge_id
           WHERE dc.deck_id IN (${placeholders})
             AND r.reviewed_at >= ? AND r.reviewed_at < ?
             AND r.entry_kind = 'learn' AND r.rating >= 1
             AND s.state <> 'new'
             AND (r.state_before LIKE '%"state":0%' OR r.state_before IS NULL)
             ${this.activeKnowledge()}`
        )
        .get(...deckIds, dayStartIso, dayEndIso) as { count: number }
    ).count;

    const reviewsDone = (
      this.db
        .prepare(
          `SELECT COUNT(DISTINCT r.knowledge_id) AS count
           FROM srs_review_log r
           JOIN deck_card dc ON dc.knowledge_id = r.knowledge_id
           JOIN knowledge k ON k.id = r.knowledge_id
           WHERE dc.deck_id IN (${placeholders})
             AND r.reviewed_at >= ? AND r.reviewed_at < ?
             AND r.entry_kind = 'review' AND r.rating >= 1
             ${this.activeKnowledge()}`
        )
        .get(...deckIds, dayStartIso, dayEndIso) as { count: number }
    ).count;

    return { newDone, reviewsDone };
  }

  /**
   * Evaluates a filtered deck's search query live without moving cards or writing `deck_card`.
   */
  private evaluateFilteredDeck(
    deck: DeckItem,
    now: Date,
    dayStart: Date,
    dayEnd: Date
  ): {
    cards: JoinedCardRow[];
    newCount: number;
    learningCount: number;
    dueCount: number;
    buriedCount: number;
  } {
    const clauses = parseFilteredSearch(deck.filterSearch || '');
    const includeSuspended = clauses.some(c => c.kind === 'is_suspended');
    const includeBuried = clauses.some(c => c.kind === 'is_buried');
    const nowIso = now.toISOString();
    const dayStartIso = dayStart.toISOString();
    const dayEndIso = dayEnd.toISOString();
    const noteCols = this.hasNoteCols()
      ? 'c.note_id AS noteId, c.ord AS ord'
      : 'NULL AS noteId, NULL AS ord';

    const allRows = this.db
      .prepare(
        `SELECT s.*, c.question_kind AS questionKind, c.payload_json AS payloadJson,
           (SELECT COALESCE(MAX(revision),0) FROM entity_version WHERE entity_type='knowledge' AND entity_id=k.id) AS cardRevision,
           c.front, c.back, c.source_kind AS sourceKind, c.source_ref AS sourceRef,
           c.source_label AS sourceLabel, c.language, k.work_id AS workId, k.created_at AS createdAt,
           ${noteCols}
         FROM srs_state s
         JOIN knowledge k ON k.id = s.knowledge_id
         JOIN card_detail c ON c.knowledge_id = k.id
         WHERE 1=1 ${this.activeKnowledge()}`
      )
      .all() as JoinedCardRow[];

    // Preload tags per card if any tag clause is present
    const hasTagClause = clauses.some(c => c.kind === 'tag');
    const cardTags = new Map<string, Set<string>>();
    if (hasTagClause) {
      const tagRows = this.db
        .prepare(
          `SELECT kt.knowledge_id, LOWER(t.name) AS name, LOWER(kt.tag_id) AS tagId
           FROM knowledge_tag kt
           LEFT JOIN tag t ON t.id = kt.tag_id`
        )
        .all() as Array<{ knowledge_id: string; name: string | null; tagId: string }>;
      for (const tr of tagRows) {
        const set = cardTags.get(tr.knowledge_id) ?? new Set<string>();
        if (tr.name) set.add(tr.name);
        if (tr.tagId) set.add(tr.tagId);
        cardTags.set(tr.knowledge_id, set);
      }
    }

    // Preload deck memberships if any deck clause is present
    const deckClauses = clauses.filter(c => c.kind === 'deck');
    const matchingDeckCardIds = new Map<string, Set<string>>();
    if (deckClauses.length > 0) {
      const allDecks = this.deckRepo.listDecks();
      for (const dc of deckClauses) {
        const targetName = (dc.strValue || '').toLowerCase();
        const matchedDeckIds = allDecks
          .filter(
            d =>
              d.name.toLowerCase() === targetName ||
              d.fullName.toLowerCase() === targetName ||
              d.fullName.toLowerCase().startsWith(`${targetName}::`)
          )
          .map(d => d.id);
        const cardSet = new Set<string>();
        if (matchedDeckIds.length > 0) {
          const ph = matchedDeckIds.map(() => '?').join(',');
          const rows = this.db
            .prepare(`SELECT knowledge_id FROM deck_card WHERE deck_id IN (${ph})`)
            .all(...matchedDeckIds) as Array<{ knowledge_id: string }>;
          for (const r of rows) cardSet.add(r.knowledge_id);
        }
        matchingDeckCardIds.set(targetName, cardSet);
      }
    }

    // If preview mode (filterReschedule === false), exclude cards already answered in this filtered run
    let previewedIds = new Set<string>();
    if (!deck.filterReschedule && this.hasExtendedLogCols()) {
      const runStartIso =
        deck.updatedAt && deck.updatedAt <= nowIso && deck.updatedAt > dayStartIso
          ? deck.updatedAt
          : dayStartIso;
      const doneRows = this.db
        .prepare(
          `SELECT DISTINCT knowledge_id FROM srs_review_log
           WHERE entry_kind = 'filtered' AND reviewed_at >= ? AND reviewed_at < ?`
        )
        .all(runStartIso, dayEndIso) as Array<{ knowledge_id: string }>;
      previewedIds = new Set(doneRows.map(r => r.knowledge_id));
    }

    const retrievabilityMap = new Map<string, number>();

    const matched = allRows.filter(row => {
      if (previewedIds.has(row.knowledge_id)) return false;

      const isBuried = Boolean(row.buried_until && row.buried_until > nowIso);
      const isSuspended = row.state === 'suspended';

      if (!includeSuspended && isSuspended) return false;
      if (!includeBuried && isBuried) return false;

      for (const clause of clauses) {
        switch (clause.kind) {
          case 'is_due': {
            if (isSuspended || isBuried) return false;
            if (row.state === 'new') return false;
            if (row.due_at > nowIso) return false;
            break;
          }
          case 'is_new': {
            if (row.state !== 'new') return false;
            break;
          }
          case 'is_learn': {
            if (row.state !== 'learning' && row.state !== 'relearning') return false;
            break;
          }
          case 'is_review': {
            if (row.state !== 'review') return false;
            break;
          }
          case 'is_suspended': {
            if (!isSuspended) return false;
            break;
          }
          case 'is_buried': {
            if (!isBuried) return false;
            break;
          }
          case 'is_lapsed': {
            if ((row.lapses ?? 0) <= 0) return false;
            break;
          }
          case 'prop_r': {
            if (row.state === 'new' || !row.stability || row.stability <= 0 || !row.last_review) {
              return false;
            }
            const elapsedDays = Math.max(
              0,
              (now.getTime() - Date.parse(row.last_review)) / 86_400_000
            );
            const r = this.defaultScheduler.forgetting_curve(elapsedDays, row.stability);
            retrievabilityMap.set(row.knowledge_id, r);
            if (!compareProp(r, clause.op!, clause.numValue!)) return false;
            break;
          }
          case 'prop_d': {
            if (row.difficulty === null || row.difficulty === undefined) return false;
            if (!compareProp(row.difficulty, clause.op!, clause.numValue!)) return false;
            break;
          }
          case 'deck': {
            const target = (clause.strValue || '').toLowerCase();
            const set = matchingDeckCardIds.get(target);
            if (!set || !set.has(row.knowledge_id)) return false;
            break;
          }
          case 'tag': {
            const target = (clause.strValue || '').toLowerCase();
            const tags = cardTags.get(row.knowledge_id);
            if (!tags || !tags.has(target)) return false;
            break;
          }
          case 'source': {
            const target = clause.strValue || '';
            if (row.sourceKind.toLowerCase() !== target) return false;
            break;
          }
          case 'text': {
            const term = (clause.strValue || '').toLowerCase();
            if (
              !row.front.toLowerCase().includes(term) &&
              !row.back.toLowerCase().includes(term) &&
              !(row.sourceLabel || '').toLowerCase().includes(term)
            ) {
              return false;
            }
            break;
          }
        }
      }
      return true;
    });

    // Order matched cards
    const order = deck.filterOrder || 'due';
    if (order === 'retrievability_asc') {
      matched.sort((a, b) => {
        const ra =
          retrievabilityMap.get(a.knowledge_id) ??
          (a.stability && a.last_review
            ? this.defaultScheduler.forgetting_curve(
                Math.max(0, (now.getTime() - Date.parse(a.last_review)) / 86_400_000),
                a.stability
              )
            : 1);
        const rb =
          retrievabilityMap.get(b.knowledge_id) ??
          (b.stability && b.last_review
            ? this.defaultScheduler.forgetting_curve(
                Math.max(0, (now.getTime() - Date.parse(b.last_review)) / 86_400_000),
                b.stability
              )
            : 1);
        return ra - rb || a.due_at.localeCompare(b.due_at);
      });
    } else if (order === 'lapses_desc') {
      matched.sort((a, b) => b.lapses - a.lapses || a.due_at.localeCompare(b.due_at));
    } else if (order === 'added') {
      matched.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    } else {
      matched.sort((a, b) => a.due_at.localeCompare(b.due_at) || a.knowledge_id.localeCompare(b.knowledge_id));
    }

    const limited = matched.slice(0, deck.filterLimit ?? 100);
    let newCount = 0;
    let learningCount = 0;
    let dueCount = 0;
    for (const c of limited) {
      if (c.state === 'new') newCount += 1;
      else if (c.state === 'learning' || c.state === 'relearning') learningCount += 1;
      else dueCount += 1;
    }

    return {
      cards: limited.map(c => ({ ...c, deckId: deck.id })),
      newCount,
      learningCount,
      dueCount,
      buriedCount: 0,
    };
  }

  /**
   * Gathers cards across the normal deck hierarchy with per-deck presets and
   * parent deck limits capping children (Anki v3 style).
   */
  private gatherNormalDeckQueue(
    rootDeckId: string | undefined,
    now: Date,
    dayStart: Date,
    dayEnd: Date
  ): {
    cards: JoinedCardRow[];
    newCount: number;
    learningCount: number;
    dueCount: number;
    buriedCount: number;
  } {
    const nowIso = now.toISOString();
    const dayStartIso = dayStart.toISOString();
    const dayEndIso = dayEnd.toISOString();

    this.syncOrphanSrsCardsToMemorizationDeck(nowIso);

    const allDecks = this.deckRepo.listDecks().filter(d => d.kind === 'normal');
    const byId = new Map(allDecks.map(d => [d.id, d]));
    const childrenMap = new Map<string | null, DeckItem[]>();
    for (const d of allDecks) {
      const list = childrenMap.get(d.parentId) ?? [];
      list.push(d);
      childrenMap.set(d.parentId, list);
    }

    // Compute subtree IDs for each deck
    const subtreeIdsMap = new Map<string, string[]>();
    const getSubtreeIds = (id: string): string[] => {
      if (subtreeIdsMap.has(id)) return subtreeIdsMap.get(id)!;
      const result = [id];
      for (const child of childrenMap.get(id) ?? []) {
        result.push(...getSubtreeIds(child.id));
      }
      subtreeIdsMap.set(id, result);
      return result;
    };
    for (const d of allDecks) getSubtreeIds(d.id);

    // Compute each deck's own remaining new & review budget based on its preset and subtree done today
    const ownRemNew = new Map<string, number>();
    const ownRemRev = new Map<string, number>();
    for (const d of allDecks) {
      const preset = this.deckRepo.getEffectivePresetForDeck(d.id);
      const { newDone, reviewsDone } = this.getDoneTodayForDecks(
        getSubtreeIds(d.id),
        dayStartIso,
        dayEndIso
      );
      ownRemNew.set(d.id, Math.max(0, preset.newPerDay - newDone));
      ownRemRev.set(d.id, Math.max(0, preset.reviewsPerDay - reviewsDone));
    }

    const noteCols = this.hasNoteCols()
      ? 'c.note_id AS noteId, c.ord AS ord'
      : 'NULL AS noteId, NULL AS ord';

    // Load all active cards in normal decks
    const allDeckCards = this.db
      .prepare(
        `SELECT s.*, dc.deck_id AS deckId, dc.position AS deckPosition,
           c.question_kind AS questionKind, c.payload_json AS payloadJson,
           (SELECT COALESCE(MAX(revision),0) FROM entity_version WHERE entity_type='knowledge' AND entity_id=k.id) AS cardRevision,
           c.front, c.back, c.source_kind AS sourceKind, c.source_ref AS sourceRef,
           c.source_label AS sourceLabel, c.language, k.work_id AS workId, k.created_at AS createdAt,
           ${noteCols}
         FROM deck_card dc
         JOIN srs_state s ON s.knowledge_id = dc.knowledge_id
         JOIN knowledge k ON k.id = s.knowledge_id
         JOIN card_detail c ON c.knowledge_id = k.id
         WHERE s.state <> 'suspended' ${this.activeKnowledge()}
         ORDER BY dc.position ASC, k.created_at ASC, k.id ASC`
      )
      .all() as JoinedCardRow[];

    const cardsByDeck = new Map<string, JoinedCardRow[]>();
    for (const row of allDeckCards) {
      if (!row.deckId) continue;
      const list = cardsByDeck.get(row.deckId) ?? [];
      list.push(row);
      cardsByDeck.set(row.deckId, list);
    }

    const seenCards = new Set<string>();
    const seenBuried = new Set<string>();
    const gatheredLearning: JoinedCardRow[] = [];
    const gatheredReviews: JoinedCardRow[] = [];
    const gatheredNew: JoinedCardRow[] = [];

    const gatherNode = (
      deck: DeckItem,
      capNew: number,
      capRev: number
    ): { usedNew: number; usedRev: number } => {
      let remNew = Math.min(capNew, ownRemNew.get(deck.id) ?? 0);
      let remRev = Math.min(capRev, ownRemRev.get(deck.id) ?? 0);
      let totalUsedNew = 0;
      let totalUsedRev = 0;

      const directCards = cardsByDeck.get(deck.id) ?? [];
      const preset = this.deckRepo.getEffectivePresetForDeck(deck.id);

      const directNewCandidates: JoinedCardRow[] = [];
      const directLearnCandidates: JoinedCardRow[] = [];
      const directRevCandidates: JoinedCardRow[] = [];

      for (const row of directCards) {
        if (row.buried_until && row.buried_until > nowIso) {
          seenBuried.add(row.knowledge_id);
          continue;
        }
        if (seenCards.has(row.knowledge_id)) continue;

        if (row.state === 'new') {
          directNewCandidates.push(row);
        } else if (
          (row.state === 'learning' || row.state === 'relearning') &&
          row.due_at <= nowIso
        ) {
          directLearnCandidates.push(row);
        } else if (row.state === 'review' && row.due_at <= nowIso) {
          directRevCandidates.push(row);
        }
      }

      // Learning cards (never capped by daily limits)
      directLearnCandidates.sort(
        (a, b) => a.due_at.localeCompare(b.due_at) || a.knowledge_id.localeCompare(b.knowledge_id)
      );
      for (const c of directLearnCandidates) {
        if (seenCards.has(c.knowledge_id)) continue;
        seenCards.add(c.knowledge_id);
        gatheredLearning.push(c);
      }

      // Review cards (up to remRev)
      directRevCandidates.sort(
        (a, b) => a.due_at.localeCompare(b.due_at) || a.knowledge_id.localeCompare(b.knowledge_id)
      );
      for (const c of directRevCandidates) {
        if (remRev <= 0) break;
        if (seenCards.has(c.knowledge_id)) continue;
        seenCards.add(c.knowledge_id);
        gatheredReviews.push(c);
        remRev -= 1;
        totalUsedRev += 1;
      }

      // New cards (up to remNew)
      if (preset.newOrder === 'random') {
        directNewCandidates.sort((a, b) => a.knowledge_id.localeCompare(b.knowledge_id));
      } else {
        directNewCandidates.sort(
          (a, b) =>
            (a.new_position ?? a.deckPosition ?? 0) - (b.new_position ?? b.deckPosition ?? 0) ||
            a.createdAt.localeCompare(b.createdAt) ||
            a.knowledge_id.localeCompare(b.knowledge_id)
        );
      }
      for (const c of directNewCandidates) {
        if (remNew <= 0) break;
        if (seenCards.has(c.knowledge_id)) continue;
        seenCards.add(c.knowledge_id);
        gatheredNew.push(c);
        remNew -= 1;
        totalUsedNew += 1;
      }

      // Children capped by remaining parent allowance
      for (const child of childrenMap.get(deck.id) ?? []) {
        const childUsed = gatherNode(child, remNew, remRev);
        remNew = Math.max(0, remNew - childUsed.usedNew);
        remRev = Math.max(0, remRev - childUsed.usedRev);
        totalUsedNew += childUsed.usedNew;
        totalUsedRev += childUsed.usedRev;
      }

      return { usedNew: totalUsedNew, usedRev: totalUsedRev };
    };

    if (rootDeckId) {
      const targetDeck = byId.get(rootDeckId);
      if (targetDeck) {
        // Ancestor caps still apply when studying a child deck directly
        let ancestorCapNew = ownRemNew.get(targetDeck.id) ?? 0;
        let ancestorCapRev = ownRemRev.get(targetDeck.id) ?? 0;
        let pId = targetDeck.parentId;
        const visited = new Set<string>([targetDeck.id]);
        while (pId && !visited.has(pId)) {
          visited.add(pId);
          const p = byId.get(pId);
          if (!p) break;
          ancestorCapNew = Math.min(ancestorCapNew, ownRemNew.get(p.id) ?? ancestorCapNew);
          ancestorCapRev = Math.min(ancestorCapRev, ownRemRev.get(p.id) ?? ancestorCapRev);
          pId = p.parentId;
        }
        gatherNode(targetDeck, ancestorCapNew, ancestorCapRev);
      }
    } else {
      for (const topDeck of childrenMap.get(null) ?? []) {
        gatherNode(
          topDeck,
          ownRemNew.get(topDeck.id) ?? 20,
          ownRemRev.get(topDeck.id) ?? 200
        );
      }
    }

    // Order queue: intraday learning first, then due reviews, then new cards
    gatheredLearning.sort(
      (a, b) => a.due_at.localeCompare(b.due_at) || a.knowledge_id.localeCompare(b.knowledge_id)
    );
    gatheredReviews.sort(
      (a, b) => a.due_at.localeCompare(b.due_at) || a.knowledge_id.localeCompare(b.knowledge_id)
    );

    const combined = [...gatheredLearning, ...gatheredReviews, ...gatheredNew];

    return {
      cards: combined,
      newCount: gatheredNew.length,
      learningCount: gatheredLearning.length,
      dueCount: gatheredReviews.length,
      buriedCount: seenBuried.size,
    };
  }

  /**
   * Builds the full deck tree with New / Learning / Due / Buried counts for the Deck Manager UI.
   */
  deckTree(): DeckTreeNode[] {
    if (!this.hasDeckTables()) return [];
    const now = this.clock();
    const rolloverHour = this.getRolloverHour();
    const { dayStart, dayEnd } = getSrsDayBounds(now, rolloverHour);
    this.clearExpiredBurials(now, dayStart, rolloverHour);
    this.syncOrphanSrsCardsToMemorizationDeck(now.toISOString());

    const allDecks = this.deckRepo.listDecks();
    const directCardCounts = new Map<string, number>();
    const countRows = this.db
      .prepare(
        `SELECT dc.deck_id AS deckId, COUNT(DISTINCT k.id) AS count
         FROM deck_card dc
         JOIN knowledge k ON k.id = dc.knowledge_id
         WHERE k.deleted_at IS NULL AND k.knowledge_type = 'card'
         GROUP BY dc.deck_id`
      )
      .all() as Array<{ deckId: string; count: number }>;
    for (const r of countRows) {
      directCardCounts.set(r.deckId, r.count);
    }

    const nodesById = new Map<string, DeckTreeNode>();
    for (const d of allDecks) {
      // Hide empty built-in Memorization deck if it has 0 cards and no children
      if (d.id === MEMORIZATION_DECK_ID && (directCardCounts.get(d.id) ?? 0) === 0) {
        continue;
      }

      const q =
        d.kind === 'filtered'
          ? this.evaluateFilteredDeck(d, now, dayStart, dayEnd)
          : this.gatherNormalDeckQueue(d.id, now, dayStart, dayEnd);

      const directCount =
        d.kind === 'filtered' ? q.cards.length : directCardCounts.get(d.id) ?? 0;

      nodesById.set(d.id, {
        ...d,
        cardsCount: directCount,
        totalCardsCount: directCount,
        newCount: q.newCount,
        learningCount: q.learningCount,
        dueCount: q.dueCount,
        buriedCount: q.buriedCount,
        children: [],
      });
    }

    const roots: DeckTreeNode[] = [];
    for (const node of nodesById.values()) {
      if (node.parentId && nodesById.has(node.parentId)) {
        nodesById.get(node.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    const sumTotalCards = (node: DeckTreeNode): number => {
      let total = node.cardsCount;
      for (const child of node.children) {
        total += sumTotalCards(child);
      }
      node.totalCardsCount = total;
      return total;
    };
    for (const root of roots) sumTotalCards(root);

    return roots;
  }

  queue(deckId?: string | null, leechAlert?: LeechAlert | null): ReviewQueue {
    const now = this.clock();
    const rolloverHour = this.getRolloverHour();
    const { dayStart, dayEnd } = getSrsDayBounds(now, rolloverHour);
    this.clearExpiredBurials(now, dayStart, rolloverHour);

    const logFilter = this.hasExtendedLogCols()
      ? ` AND r.entry_kind IN ('learn', 'review', 'relearn', 'filtered') AND r.rating >= 1`
      : '';

    const reviewedToday = (
      this.db
        .prepare(
          `SELECT COUNT(*) AS count
           FROM srs_review_log r
           JOIN knowledge k ON k.id = r.knowledge_id
           WHERE r.reviewed_at >= ? AND r.reviewed_at < ?${logFilter}${this.activeKnowledge()}`
        )
        .get(dayStart.toISOString(), dayEnd.toISOString()) as { count: number }
    ).count;

    if (!this.hasDeckTables()) {
      const filter = `FROM srs_state s JOIN knowledge k ON k.id=s.knowledge_id JOIN card_detail c ON c.knowledge_id=k.id WHERE s.state <> 'suspended'${this.activeKnowledge()}`;
      const rows = this.db
        .prepare(
          `SELECT s.*, c.question_kind AS questionKind, c.payload_json AS payloadJson,
             (SELECT COALESCE(MAX(revision),0) FROM entity_version WHERE entity_type='knowledge' AND entity_id=k.id) AS cardRevision,
             c.front, c.back, c.source_kind AS sourceKind, c.source_ref AS sourceRef,
             c.source_label AS sourceLabel, c.language, k.work_id AS workId, k.created_at AS createdAt,
             NULL AS noteId, NULL AS ord
           ${filter} AND s.due_at <= ?
           ORDER BY s.due_at, s.knowledge_id LIMIT 50`
        )
        .all(now.toISOString()) as JoinedCardRow[];
      const due = (
        this.db.prepare(`SELECT COUNT(*) AS count ${filter} AND s.due_at <= ?`).get(now.toISOString()) as {
          count: number;
        }
      ).count;
      const nextDue = (
        this.db.prepare(`SELECT MIN(s.due_at) AS due ${filter} AND s.due_at > ?`).get(now.toISOString()) as {
          due: string | null;
        }
      ).due;
      return {
        cards: rows.map(r => this.toReviewCard(r, now)),
        due,
        newCount: rows.filter(r => r.state === 'new').length,
        learningCount: rows.filter(r => r.state === 'learning' || r.state === 'relearning').length,
        dueCount: rows.filter(r => r.state === 'review').length,
        buriedCount: 0,
        reviewedToday,
        nextDue,
      };
    }

    const cleanDeckId = deckId ? deckId.trim() : undefined;
    const targetDeck = cleanDeckId ? this.deckRepo.getDeck(cleanDeckId) : null;

    const gathered =
      targetDeck && targetDeck.kind === 'filtered'
        ? this.evaluateFilteredDeck(targetDeck, now, dayStart, dayEnd)
        : this.gatherNormalDeckQueue(cleanDeckId, now, dayStart, dayEnd);

    const totalDue = gathered.newCount + gathered.learningCount + gathered.dueCount;
    const boundedCards = gathered.cards
      .slice(0, 50)
      .map(row => this.toReviewCard(row, now, cleanDeckId));

    // Next due timestamp for cards scheduled in the future
    let nextDue: string | null = null;
    if (cleanDeckId && targetDeck && targetDeck.kind === 'normal') {
      const subIds = [cleanDeckId, ...this.deckRepo.getDescendantIds(cleanDeckId)];
      const ph = subIds.map(() => '?').join(',');
      nextDue = (
        this.db
          .prepare(
            `SELECT MIN(s.due_at) AS due
             FROM srs_state s
             JOIN deck_card dc ON dc.knowledge_id = s.knowledge_id
             JOIN knowledge k ON k.id = s.knowledge_id
             WHERE dc.deck_id IN (${ph})
               AND s.state <> 'suspended'
               AND (s.buried_until IS NULL OR s.buried_until <= ?)
               AND s.due_at > ?${this.activeKnowledge()}`
          )
          .get(...subIds, now.toISOString(), now.toISOString()) as { due: string | null }
      ).due;
    } else {
      nextDue = (
        this.db
          .prepare(
            `SELECT MIN(s.due_at) AS due
             FROM srs_state s
             JOIN knowledge k ON k.id = s.knowledge_id
             WHERE s.state <> 'suspended'
               AND (s.buried_until IS NULL OR s.buried_until <= ?)
               AND s.due_at > ?${this.activeKnowledge()}`
          )
          .get(now.toISOString(), now.toISOString()) as { due: string | null }
      ).due;
    }

    return {
      cards: boundedCards,
      due: totalDue,
      newCount: gathered.newCount,
      learningCount: gathered.learningCount,
      dueCount: gathered.dueCount,
      buriedCount: gathered.buriedCount,
      reviewedToday,
      nextDue,
      deckId: targetDeck?.id ?? null,
      deckName: targetDeck?.fullName ?? null,
      isFiltered: targetDeck?.kind === 'filtered',
      filterReschedule: targetDeck?.kind === 'filtered' ? targetDeck.filterReschedule : true,
      ...(leechAlert ? { leechAlert } : {}),
    };
  }

  grade(input: GradeReviewInput): ReviewQueue {
    const validated = validateReview(input);
    let leechAlert: LeechAlert | null = null;

    this.db.transaction(() => {
      const now = this.clock();
      const rolloverHour = this.getRolloverHour();
      const { dayStart, dayEnd } = getSrsDayBounds(now, rolloverHour);
      this.clearExpiredBurials(now, dayStart, rolloverHour);

      const noteSelect = this.hasNoteCols() ? ', c.note_id AS noteId, c.front AS cardFront' : ', NULL AS noteId, c.front AS cardFront';
      const row = this.db
        .prepare(
          `SELECT s.*${noteSelect}
           FROM srs_state s
           JOIN knowledge k ON k.id = s.knowledge_id
           JOIN card_detail c ON c.knowledge_id = k.id
           WHERE s.knowledge_id = ?${this.activeKnowledge()}`
        )
        .get(validated.id) as (Schedule & { noteId: string | null; cardFront: string }) | undefined;

      const targetDeck =
        validated.deckId && this.hasDeckTables() ? this.deckRepo.getDeck(validated.deckId) : null;
      const isFiltered = targetDeck?.kind === 'filtered';

      if (
        !row ||
        (!isFiltered && row.state === 'suspended') ||
        (!isFiltered && row.buried_until && row.buried_until > now.toISOString()) ||
        revision(row) !== validated.revision ||
        (!isFiltered && row.state !== 'new' && row.due_at > now.toISOString()) ||
        (row.last_review && Date.parse(row.last_review) > now.getTime())
      ) {
        throw new Error('review-changed');
      }

      const { scheduler, preset } = this.getSchedulerForCard(validated.id, validated.deckId);
      const card = this.cardFor(row, now);
      const next = scheduler.next(card, now, validated.rating).card;

      // Determine entry_kind, interval, last_interval, factor
      // Only preview mode (a filtered deck that does not reschedule) logs `filtered`; a rescheduling
      // filtered deck logs the normal learn/review/relearn kinds, as Anki does, so it counts toward
      // the daily limits (KEY-407).
      const entryKind: SrsEntryKind = isFiltered && !targetDeck!.filterReschedule
        ? 'filtered'
        : row.state === 'new' || row.state === 'learning'
        ? 'learn'
        : row.state === 'relearning'
        ? 'relearn'
        : 'review';

      const interval =
        next.state === State.Review || next.scheduled_days >= 1
          ? Math.max(1, Math.round(next.scheduled_days))
          : -Math.max(1, Math.round((next.due.getTime() - now.getTime()) / 1000));

      const lastInterval =
        row.state === 'new' || !row.last_review
          ? 0
          : row.state === 'review'
          ? Math.max(1, Math.round((Date.parse(row.due_at) - Date.parse(row.last_review)) / 86_400_000))
          : -Math.max(1, Math.round((Date.parse(row.due_at) - Date.parse(row.last_review)) / 1000));

      const factor = next.difficulty ? Math.round(next.difficulty * 100) : null;

      if (this.hasExtendedLogCols()) {
        this.db
          .prepare(
            `INSERT INTO srs_review_log (
              id, knowledge_id, reviewed_at, rating, duration_ms, state_before,
              entry_kind, interval, last_interval, factor
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            randomUUID(),
            validated.id,
            now.toISOString(),
            validated.rating,
            validated.durationMs,
            JSON.stringify({ version: 1, before: card, after: next }),
            entryKind,
            interval,
            lastInterval,
            factor
          );
      } else {
        this.db
          .prepare(
            `INSERT INTO srs_review_log (id, knowledge_id, reviewed_at, rating, duration_ms, state_before)
             VALUES (?, ?, ?, ?, ?, ?)`
          )
          .run(
            randomUUID(),
            validated.id,
            now.toISOString(),
            validated.rating,
            validated.durationMs,
            JSON.stringify({ version: 1, before: card, after: next })
          );
      }

      // Preview mode in filtered decks: when filterReschedule is false, do NOT update srs_state
      if (isFiltered && !targetDeck!.filterReschedule) {
        return;
      }

      let nextStateName: SrsCardState = states[next.state] ?? 'review';

      // Leech check: when lapses increases and reaches preset.leechThreshold
      if (next.lapses > row.lapses && next.lapses >= preset.leechThreshold) {
        this.db
          .prepare(`INSERT OR IGNORE INTO tag (id, name, origin) VALUES ('tag-leech', 'leech', 'system')`)
          .run();
        const leechTag = this.db.prepare(`SELECT id FROM tag WHERE name = 'leech'`).get() as
          | { id: string }
          | undefined;
        if (leechTag) {
          this.db
            .prepare(`INSERT OR IGNORE INTO knowledge_tag (knowledge_id, tag_id) VALUES (?, ?)`)
            .run(validated.id, leechTag.id);
        }
        const shouldSuspend = preset.leechAction === 'suspend';
        if (shouldSuspend) {
          nextStateName = 'suspended';
        }
        leechAlert = {
          cardId: validated.id,
          front: row.cardFront,
          lapses: next.lapses,
          suspended: shouldSuspend,
        };
      }

      if (this.hasExtendedStateCols()) {
        this.db
          .prepare(
            `UPDATE srs_state SET
              state = ?, due_at = ?, stability = ?, difficulty = ?, reps = ?, lapses = ?,
              last_review = ?, learning_step = ?, desired_retention = ?
             WHERE knowledge_id = ?`
          )
          .run(
            nextStateName,
            next.due.toISOString(),
            next.stability,
            next.difficulty,
            next.reps,
            next.lapses,
            now.toISOString(),
            next.learning_steps ?? 0,
            preset.desiredRetention,
            validated.id
          );
      } else {
        this.db
          .prepare(
            `UPDATE srs_state SET state = ?, due_at = ?, stability = ?, difficulty = ?, reps = ?, lapses = ?, last_review = ?
             WHERE knowledge_id = ?`
          )
          .run(
            nextStateName,
            next.due.toISOString(),
            next.stability,
            next.difficulty,
            next.reps,
            next.lapses,
            now.toISOString(),
            validated.id
          );
      }

      // Sibling burying: only siblings of the same note_id (never across different notes sharing a source_ref)
      if (
        row.noteId &&
        this.hasExtendedStateCols() &&
        (preset.buryNew || preset.buryReviews || preset.buryInterday)
      ) {
        const siblings = this.db
          .prepare(
            `SELECT s.knowledge_id, s.state, s.due_at
             FROM card_detail c
             JOIN srs_state s ON s.knowledge_id = c.knowledge_id
             JOIN knowledge k ON k.id = c.knowledge_id
             WHERE c.note_id = ? AND c.knowledge_id <> ? AND s.state <> 'suspended'${this.activeKnowledge()}`
          )
          .all(row.noteId, validated.id) as Array<{ knowledge_id: string; state: SrsCardState; due_at: string }>;

        const buryUntilIso = dayEnd.toISOString();
        const buryStmt = this.db.prepare(
          `UPDATE srs_state SET buried_until = ? WHERE knowledge_id = ?`
        );

        for (const sib of siblings) {
          const shouldBury =
            (sib.state === 'new' && preset.buryNew) ||
            (sib.state === 'review' && preset.buryReviews) ||
            // Anki never buries intraday learning siblings; `bury_interday` covers only learning
            // cards whose next step falls on a later day (KEY-407).
            ((sib.state === 'learning' || sib.state === 'relearning') &&
              preset.buryInterday &&
              sib.due_at >= buryUntilIso);
          if (shouldBury) {
            buryStmt.run(buryUntilIso, sib.knowledge_id);
          }
        }
      }
    })();

    return this.queue(validated.deckId, leechAlert);
  }

  /**
   * Manually buries a card until the next day rollover.
   */
  buryCard(cardId: string, deckId?: string | null): ReviewQueue {
    const now = this.clock();
    const rolloverHour = this.getRolloverHour();
    const { dayEnd } = getSrsDayBounds(now, rolloverHour);

    this.db
      .prepare(
        `UPDATE srs_state SET buried_until = ?
         WHERE knowledge_id = ? AND state <> 'suspended'`
      )
      .run(dayEnd.toISOString(), cardId);

    return this.queue(deckId);
  }

  /**
   * Manually buries all sibling cards of the same note (`card_detail.note_id`) until the next rollover.
   * Never buries cards of other notes even if they share the same `source_ref`.
   */
  buryNoteSiblings(cardId: string, deckId?: string | null): ReviewQueue {
    const now = this.clock();
    const rolloverHour = this.getRolloverHour();
    const { dayEnd } = getSrsDayBounds(now, rolloverHour);

    this.db.transaction(() => {
      const row = this.db
        .prepare(`SELECT note_id FROM card_detail WHERE knowledge_id = ?`)
        .get(cardId) as { note_id: string | null } | undefined;
      if (!row?.note_id) return;

      this.db
        .prepare(
          `UPDATE srs_state SET buried_until = ?
           WHERE knowledge_id IN (
             SELECT knowledge_id FROM card_detail WHERE note_id = ? AND knowledge_id <> ?
           ) AND state <> 'suspended'`
        )
        .run(dayEnd.toISOString(), row.note_id, cardId);
    })();

    return this.queue(deckId);
  }

  /**
   * Unburies a single card or all buried cards in a deck (or all decks).
   */
  unbury(deckId?: string | null, cardId?: string | null): ReviewQueue {
    if (cardId) {
      this.db.prepare(`UPDATE srs_state SET buried_until = NULL WHERE knowledge_id = ?`).run(cardId);
    } else if (deckId && this.hasDeckTables()) {
      const subIds = [deckId, ...this.deckRepo.getDescendantIds(deckId)];
      const ph = subIds.map(() => '?').join(',');
      this.db
        .prepare(
          `UPDATE srs_state SET buried_until = NULL
           WHERE knowledge_id IN (SELECT knowledge_id FROM deck_card WHERE deck_id IN (${ph}))`
        )
        .run(...subIds);
    } else {
      this.db.prepare(`UPDATE srs_state SET buried_until = NULL WHERE buried_until IS NOT NULL`).run();
    }
    return this.queue(deckId);
  }

  /**
   * Suspends or unsuspends a card.
   */
  suspendCard(cardId: string, suspended: boolean, deckId?: string | null): ReviewQueue {
    if (suspended) {
      this.db
        .prepare(`UPDATE srs_state SET state = 'suspended', buried_until = NULL WHERE knowledge_id = ?`)
        .run(cardId);
    } else {
      this.db
        .prepare(
          `UPDATE srs_state SET state = CASE WHEN reps = 0 THEN 'new' ELSE 'review' END
           WHERE knowledge_id = ? AND state = 'suspended'`
        )
        .run(cardId);
    }
    return this.queue(deckId);
  }

  /**
   * "Forget" action: resets the card to `new` state and records an `entry_kind = 'reset'` row with `rating = 0`.
   */
  forgetCard(cardId: string, deckId?: string | null): ReviewQueue {
    const now = this.clock();
    const nowIso = now.toISOString();

    this.db.transaction(() => {
      const prev = this.db.prepare(`SELECT * FROM srs_state WHERE knowledge_id = ?`).get(cardId) as
        | Schedule
        | undefined;
      if (!prev) throw new Error('invalid-request: card has no srs_state');

      this.db
        .prepare(
          `UPDATE srs_state SET
            state = 'new', due_at = ?, stability = NULL, difficulty = NULL,
            reps = 0, lapses = 0, last_review = NULL,
            learning_step = 0, buried_until = NULL, new_position = 0, desired_retention = NULL
           WHERE knowledge_id = ?`
        )
        .run(nowIso, cardId);

      this.db
        .prepare(
          `INSERT INTO srs_review_log (
            id, knowledge_id, reviewed_at, rating, duration_ms, state_before,
            entry_kind, interval, last_interval, factor
          ) VALUES (?, ?, ?, 0, 0, ?, 'reset', 0, NULL, NULL)`
        )
        .run(randomUUID(), cardId, nowIso, JSON.stringify({ version: 1, before: prev }));
    })();

    return this.queue(deckId);
  }

  /**
   * "Set due date" action: schedules the card `days` from today (or at an explicit ISO date)
   * and records an `entry_kind = 'rescheduled'` row with `rating = 0`.
   */
  setDueDate(cardId: string, days: number, deckId?: string | null): ReviewQueue {
    if (!Number.isInteger(days) || days < 0 || days > 36500) {
      throw new Error('invalid-request: days must be an integer between 0 and 36500');
    }
    const now = this.clock();
    const nowIso = now.toISOString();
    const rolloverHour = this.getRolloverHour();
    const { dayStart } = getSrsDayBounds(now, rolloverHour);

    const targetDate =
      days === 0
        ? now
        : new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate() + days, rolloverHour, 0, 0, 0);
    const targetIso = targetDate.toISOString();

    this.db.transaction(() => {
      const prev = this.db.prepare(`SELECT * FROM srs_state WHERE knowledge_id = ?`).get(cardId) as
        | Schedule
        | undefined;
      if (!prev) throw new Error('invalid-request: card has no srs_state');

      const nextState: SrsCardState =
        prev.state === 'new' || prev.state === 'learning' || prev.state === 'relearning'
          ? 'review'
          : prev.state;

      this.db
        .prepare(
          `UPDATE srs_state SET
            state = ?, due_at = ?, learning_step = 0, buried_until = NULL
           WHERE knowledge_id = ?`
        )
        .run(nextState, targetIso, cardId);

      const factor = prev.difficulty ? Math.round(prev.difficulty * 100) : null;
      this.db
        .prepare(
          `INSERT INTO srs_review_log (
            id, knowledge_id, reviewed_at, rating, duration_ms, state_before,
            entry_kind, interval, last_interval, factor
          ) VALUES (?, ?, ?, 0, 0, ?, 'rescheduled', ?, NULL, ?)`
        )
        .run(
          randomUUID(),
          cardId,
          nowIso,
          JSON.stringify({ version: 1, before: prev }),
          days,
          factor
        );
    })();

    return this.queue(deckId);
  }
}
