/**
 * Baglib — Deck & SRS Preset Repository (ADR-017 / KEY-389)
 *
 * Manages the hierarchical `deck` tree (`parent_id`), `deck_card` memberships,
 * `srs_preset` CRUD with inheritance and validation, and filtered deck definitions.
 */

import { randomUUID } from 'node:crypto';
import type { Database } from 'better-sqlite3';
import {
  validateSrsPresetInput,
  type DeckItem,
  type DeckKind,
  type FilteredDeckOrder,
  type SaveDeckInput,
  type SaveFilteredDeckInput,
  type SrsPreset,
} from '../../../shared/srs';
import { DEFAULT_PRESET_ID, MEMORIZATION_DECK_ID } from '../migrations/031_decks_and_scheduler';

interface PresetRow {
  id: string;
  name: string;
  learn_steps: string;
  relearn_steps: string;
  new_per_day: number;
  reviews_per_day: number;
  desired_retention: number;
  maximum_interval: number;
  bury_new: number;
  bury_reviews: number;
  bury_interday: number;
  leech_threshold: number;
  leech_action: 'tag' | 'suspend';
  new_order: 'position' | 'random';
  fsrs_params: string | null;
  anki_id: number | null;
  anki_extra: string | null;
  created_at: string;
  updated_at: string;
}

interface DeckRow {
  id: string;
  name: string;
  parent_id: string | null;
  kind: DeckKind;
  preset_id: string | null;
  filter_search: string | null;
  filter_limit: number | null;
  filter_order: string | null;
  filter_reschedule: number | null;
  description: string | null;
  anki_id: number | null;
  anki_extra: string | null;
  created_at: string;
  updated_at: string;
}

export class DeckRepository {
  constructor(private db: Database) {}

  /* -------------------------------------------------------------------------- */
  /*                               PRESETS API                                  */
  /* -------------------------------------------------------------------------- */

  private ensureDefaultPreset(): void {
    const existing = this.db
      .prepare(`SELECT id FROM srs_preset WHERE id = ?`)
      .get(DEFAULT_PRESET_ID) as { id: string } | undefined;
    if (!existing) {
      const now = new Date().toISOString();
      this.db
        .prepare(
          `INSERT OR IGNORE INTO srs_preset (
            id, name, learn_steps, relearn_steps, new_per_day, reviews_per_day,
            desired_retention, maximum_interval, bury_new, bury_reviews, bury_interday,
            leech_threshold, leech_action, new_order, fsrs_params, created_at, updated_at
          ) VALUES (?, 'Default', '[1,10]', '[10]', 20, 200, 0.9, 36500, 0, 0, 0, 8, 'tag', 'position', NULL, ?, ?)`
        )
        .run(DEFAULT_PRESET_ID, now, now);
    }
  }

  private hydratePreset(row: PresetRow): SrsPreset {
    let learnSteps = [1, 10];
    let relearnSteps = [10];
    let fsrsParams: number[] | null = null;
    try {
      const parsedLearn = JSON.parse(row.learn_steps);
      if (Array.isArray(parsedLearn)) learnSteps = parsedLearn.map(Number);
    } catch {}
    try {
      const parsedRelearn = JSON.parse(row.relearn_steps);
      if (Array.isArray(parsedRelearn)) relearnSteps = parsedRelearn.map(Number);
    } catch {}
    if (row.fsrs_params) {
      try {
        const parsedParams = JSON.parse(row.fsrs_params);
        if (Array.isArray(parsedParams) && parsedParams.length === 21) {
          fsrsParams = parsedParams.map(Number);
        }
      } catch {}
    }

    return {
      id: row.id,
      name: row.name,
      learnSteps,
      relearnSteps,
      newPerDay: row.new_per_day,
      reviewsPerDay: row.reviews_per_day,
      desiredRetention: row.desired_retention,
      maximumInterval: row.maximum_interval,
      buryNew: Boolean(row.bury_new),
      buryReviews: Boolean(row.bury_reviews),
      buryInterday: Boolean(row.bury_interday),
      leechThreshold: row.leech_threshold,
      leechAction: row.leech_action,
      newOrder: row.new_order,
      fsrsParams,
      ankiId: row.anki_id,
      ankiExtra: row.anki_extra,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  listPresets(): SrsPreset[] {
    this.ensureDefaultPreset();
    const rows = this.db
      .prepare(`SELECT * FROM srs_preset ORDER BY CASE WHEN id = 'default' THEN 0 ELSE 1 END, name ASC`)
      .all() as PresetRow[];
    return rows.map(r => this.hydratePreset(r));
  }

  getPreset(id: string): SrsPreset | null {
    this.ensureDefaultPreset();
    const row = this.db.prepare(`SELECT * FROM srs_preset WHERE id = ?`).get(id) as PresetRow | undefined;
    return row ? this.hydratePreset(row) : null;
  }

  getDefaultPreset(): SrsPreset {
    this.ensureDefaultPreset();
    return this.getPreset(DEFAULT_PRESET_ID)!;
  }

  savePreset(rawInput: unknown): SrsPreset {
    this.ensureDefaultPreset();
    const input = validateSrsPresetInput(rawInput);
    const now = new Date().toISOString();

    return this.db.transaction(() => {
      let id = input.id;
      const existing = id
        ? (this.db.prepare(`SELECT id FROM srs_preset WHERE id = ?`).get(id) as { id: string } | undefined)
        : undefined;

      if (!existing) {
        id = id ?? randomUUID();
        this.db
          .prepare(
            `INSERT INTO srs_preset (
              id, name, learn_steps, relearn_steps, new_per_day, reviews_per_day,
              desired_retention, maximum_interval, bury_new, bury_reviews, bury_interday,
              leech_threshold, leech_action, new_order, fsrs_params, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            id,
            input.name,
            JSON.stringify(input.learnSteps),
            JSON.stringify(input.relearnSteps),
            input.newPerDay,
            input.reviewsPerDay,
            input.desiredRetention,
            input.maximumInterval,
            input.buryNew ? 1 : 0,
            input.buryReviews ? 1 : 0,
            input.buryInterday ? 1 : 0,
            input.leechThreshold,
            input.leechAction,
            input.newOrder,
            input.fsrsParams ? JSON.stringify(input.fsrsParams) : null,
            now,
            now
          );
      } else {
        this.db
          .prepare(
            `UPDATE srs_preset SET
              name = ?, learn_steps = ?, relearn_steps = ?, new_per_day = ?, reviews_per_day = ?,
              desired_retention = ?, maximum_interval = ?, bury_new = ?, bury_reviews = ?, bury_interday = ?,
              leech_threshold = ?, leech_action = ?, new_order = ?, fsrs_params = ?, updated_at = ?
             WHERE id = ?`
          )
          .run(
            input.name,
            JSON.stringify(input.learnSteps),
            JSON.stringify(input.relearnSteps),
            input.newPerDay,
            input.reviewsPerDay,
            input.desiredRetention,
            input.maximumInterval,
            input.buryNew ? 1 : 0,
            input.buryReviews ? 1 : 0,
            input.buryInterday ? 1 : 0,
            input.leechThreshold,
            input.leechAction,
            input.newOrder,
            input.fsrsParams ? JSON.stringify(input.fsrsParams) : null,
            now,
            id!
          );
      }
      return this.getPreset(id!)!;
    })();
  }

  copyPreset(sourceId: string, newName?: string): SrsPreset {
    const source = this.getPreset(sourceId);
    if (!source) throw new Error('invalid-request: source preset not found');
    const name = (newName?.trim() || `${source.name} (Copy)`).slice(0, 200);
    return this.savePreset({
      name,
      learnSteps: source.learnSteps,
      relearnSteps: source.relearnSteps,
      newPerDay: source.newPerDay,
      reviewsPerDay: source.reviewsPerDay,
      desiredRetention: source.desiredRetention,
      maximumInterval: source.maximumInterval,
      buryNew: source.buryNew,
      buryReviews: source.buryReviews,
      buryInterday: source.buryInterday,
      leechThreshold: source.leechThreshold,
      leechAction: source.leechAction,
      newOrder: source.newOrder,
      fsrsParams: source.fsrsParams,
    });
  }

  deletePreset(id: string): boolean {
    if (id === DEFAULT_PRESET_ID) {
      throw new Error('Cannot delete the built-in Default preset');
    }
    const existing = this.getPreset(id);
    if (!existing) return false;
    this.db.transaction(() => {
      this.db.prepare(`UPDATE deck SET preset_id = NULL WHERE preset_id = ?`).run(id);
      this.db.prepare(`DELETE FROM srs_preset WHERE id = ?`).run(id);
    })();
    return true;
  }

  /* -------------------------------------------------------------------------- */
  /*                                DECKS API                                   */
  /* -------------------------------------------------------------------------- */

  ensureMemorizationDeck(): void {
    this.ensureDefaultPreset();
    const existing = this.db
      .prepare(`SELECT id FROM deck WHERE id = ?`)
      .get(MEMORIZATION_DECK_ID) as { id: string } | undefined;
    if (!existing) {
      const now = new Date().toISOString();
      this.db
        .prepare(
          `INSERT OR IGNORE INTO deck (id, name, parent_id, kind, preset_id, description, created_at, updated_at)
           VALUES (?, 'Memorization', NULL, 'normal', ?, NULL, ?, ?)`
        )
        .run(MEMORIZATION_DECK_ID, DEFAULT_PRESET_ID, now, now);
    }
  }

  private getAllDeckRows(): DeckRow[] {
    return this.db
      .prepare(
        `SELECT * FROM deck
         ORDER BY CASE WHEN id = 'memorization' THEN 0 ELSE 1 END, name ASC, id ASC`
      )
      .all() as DeckRow[];
  }

  private buildFullNameAndPreset(
    row: DeckRow,
    byId: Map<string, DeckRow>
  ): { fullName: string; effectivePresetId: string } {
    const parts: string[] = [row.name];
    let effectivePresetId: string | null = row.preset_id;
    const visited = new Set<string>([row.id]);
    let currParentId = row.parent_id;

    while (currParentId && !visited.has(currParentId)) {
      visited.add(currParentId);
      const parent = byId.get(currParentId);
      if (!parent) break;
      parts.unshift(parent.name);
      if (!effectivePresetId && parent.preset_id) {
        effectivePresetId = parent.preset_id;
      }
      currParentId = parent.parent_id;
    }

    return {
      fullName: parts.join('::'),
      effectivePresetId: effectivePresetId || DEFAULT_PRESET_ID,
    };
  }

  private hydrateDeck(row: DeckRow, byId: Map<string, DeckRow>): DeckItem {
    const { fullName, effectivePresetId } = this.buildFullNameAndPreset(row, byId);
    return {
      id: row.id,
      name: row.name,
      fullName,
      parentId: row.parent_id,
      kind: row.kind,
      presetId: row.preset_id,
      effectivePresetId,
      filterSearch: row.filter_search,
      filterLimit: row.filter_limit,
      filterOrder: (row.filter_order as FilteredDeckOrder | null) ?? null,
      filterReschedule: Boolean(row.filter_reschedule),
      description: row.description,
      ankiId: row.anki_id,
      ankiExtra: row.anki_extra,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  listDecks(): DeckItem[] {
    const rows = this.getAllDeckRows();
    const byId = new Map(rows.map(r => [r.id, r]));
    return rows.map(r => this.hydrateDeck(r, byId));
  }

  getDeck(id: string): DeckItem | null {
    const rows = this.getAllDeckRows();
    const byId = new Map(rows.map(r => [r.id, r]));
    const row = byId.get(id);
    return row ? this.hydrateDeck(row, byId) : null;
  }

  getEffectivePresetForDeck(deckId: string | null | undefined): SrsPreset {
    this.ensureDefaultPreset();
    if (!deckId) return this.getDefaultPreset();
    const deck = this.getDeck(deckId);
    if (!deck) return this.getDefaultPreset();
    return this.getPreset(deck.effectivePresetId) ?? this.getDefaultPreset();
  }

  /**
   * Finds or creates a normal deck hierarchy given a name or `Parent::Child` path.
   */
  findOrCreateByPath(rawPath: string): DeckItem {
    this.ensureDefaultPreset();
    const cleanPath = rawPath.replace(/\s+/gu, ' ').trim();
    if (!cleanPath) throw new Error('invalid-request: deck name is required');
    const segments = cleanPath
      .split('::')
      .map(s => s.trim())
      .filter(Boolean);
    if (segments.length === 0) throw new Error('invalid-request: deck name is required');

    return this.db.transaction(() => {
      const now = new Date().toISOString();
      let parentId: string | null = null;
      let lastId = '';

      for (const segment of segments) {
        const existing = (
          parentId === null
            ? this.db.prepare(`SELECT id FROM deck WHERE parent_id IS NULL AND name = ?`).get(segment)
            : this.db.prepare(`SELECT id FROM deck WHERE parent_id = ? AND name = ?`).get(parentId, segment)
        ) as { id: string } | undefined;

        if (existing) {
          lastId = existing.id;
        } else {
          lastId = randomUUID();
          this.db
            .prepare(
              `INSERT INTO deck (id, name, parent_id, kind, preset_id, created_at, updated_at)
               VALUES (?, ?, ?, 'normal', NULL, ?, ?)`
            )
            .run(lastId, segment, parentId, now, now);
        }
        parentId = lastId;
      }

      return this.getDeck(lastId)!;
    })();
  }

  createDeck(input: SaveDeckInput): DeckItem {
    this.ensureDefaultPreset();
    const rawName = typeof input?.name === 'string' ? input.name.trim() : '';
    if (!rawName || rawName.length > 200) {
      throw new Error('invalid-request: deck name must be 1 to 200 chars');
    }
    if (!input.parentId && rawName.includes('::')) {
      return this.findOrCreateByPath(rawName);
    }

    const parentId = input.parentId ? String(input.parentId).trim() : null;
    if (parentId) {
      const parent = this.getDeck(parentId);
      if (!parent || parent.kind !== 'normal') {
        throw new Error('invalid-request: parent deck must be an existing normal deck');
      }
    }

    const presetId = input.presetId ? String(input.presetId).trim() : null;
    if (presetId && !this.getPreset(presetId)) {
      throw new Error('invalid-request: preset not found');
    }

    const now = new Date().toISOString();
    const id = input.id?.trim() || randomUUID();

    this.db
      .prepare(
        `INSERT INTO deck (id, name, parent_id, kind, preset_id, description, created_at, updated_at)
         VALUES (?, ?, ?, 'normal', ?, ?, ?, ?)`
      )
      .run(id, rawName, parentId, presetId, input.description ?? null, now, now);

    return this.getDeck(id)!;
  }

  createFilteredDeck(input: SaveFilteredDeckInput): DeckItem {
    this.ensureDefaultPreset();
    const name = typeof input?.name === 'string' ? input.name.trim() : '';
    if (!name || name.length > 200) {
      throw new Error('invalid-request: filtered deck name is required');
    }
    const filterSearch = typeof input?.filterSearch === 'string' ? input.filterSearch.trim() : '';
    if (!filterSearch || filterSearch.length > 500) {
      throw new Error('invalid-request: filterSearch is required');
    }
    const filterLimit = input.filterLimit !== undefined ? Number(input.filterLimit) : 100;
    if (!Number.isInteger(filterLimit) || filterLimit < 1 || filterLimit > 9999) {
      throw new Error('invalid-request: filterLimit must be between 1 and 9999');
    }
    const filterOrder = input.filterOrder || 'due';
    const filterReschedule = input.filterReschedule !== false ? 1 : 0;
    const parentId = input.parentId ? String(input.parentId).trim() : null;
    const now = new Date().toISOString();

    return this.db.transaction(() => {
      if (input.id) {
        const existing = this.getDeck(input.id);
        if (existing && existing.kind === 'filtered') {
          this.db
            .prepare(
              `UPDATE deck SET name = ?, parent_id = ?, filter_search = ?, filter_limit = ?,
               filter_order = ?, filter_reschedule = ?, description = ?, updated_at = ?
               WHERE id = ?`
            )
            .run(
              name,
              parentId,
              filterSearch,
              filterLimit,
              filterOrder,
              filterReschedule,
              input.description ?? null,
              now,
              input.id
            );
          return this.getDeck(input.id)!;
        }
      }

      const id = input.id?.trim() || randomUUID();
      this.db
        .prepare(
          `INSERT INTO deck (
            id, name, parent_id, kind, preset_id,
            filter_search, filter_limit, filter_order, filter_reschedule,
            description, created_at, updated_at
          ) VALUES (?, ?, ?, 'filtered', NULL, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          name,
          parentId,
          filterSearch,
          filterLimit,
          filterOrder,
          filterReschedule,
          input.description ?? null,
          now,
          now
        );
      return this.getDeck(id)!;
    })();
  }

  renameDeck(id: string, newName: string): DeckItem {
    if (id === MEMORIZATION_DECK_ID) {
      throw new Error('Cannot rename the built-in Memorization deck');
    }
    const clean = typeof newName === 'string' ? newName.trim() : '';
    if (!clean || clean.length > 200) {
      throw new Error('invalid-request: deck name must be 1 to 200 chars');
    }
    const deck = this.getDeck(id);
    if (!deck) throw new Error('invalid-request: deck not found');

    const now = new Date().toISOString();
    this.db.prepare(`UPDATE deck SET name = ?, updated_at = ? WHERE id = ?`).run(clean, now, id);
    return this.getDeck(id)!;
  }

  moveDeck(id: string, newParentId: string | null): DeckItem {
    if (id === MEMORIZATION_DECK_ID) {
      throw new Error('Cannot move the built-in Memorization deck');
    }
    const deck = this.getDeck(id);
    if (!deck) throw new Error('invalid-request: deck not found');

    const targetParent = newParentId ? newParentId.trim() : null;
    if (targetParent === id) {
      throw new Error('invalid-request: cannot move a deck into itself');
    }

    if (targetParent) {
      const parent = this.getDeck(targetParent);
      if (!parent || parent.kind !== 'normal') {
        throw new Error('invalid-request: target parent deck must be a normal deck');
      }
      // Check cycle: ensure targetParent is not a descendant of id
      const descendants = this.getDescendantIds(id);
      if (descendants.includes(targetParent)) {
        throw new Error('invalid-request: cannot move a deck into its own descendant');
      }
    }

    const now = new Date().toISOString();
    this.db.prepare(`UPDATE deck SET parent_id = ?, updated_at = ? WHERE id = ?`).run(targetParent, now, id);
    return this.getDeck(id)!;
  }

  assignPreset(deckId: string, presetId: string | null): DeckItem {
    const deck = this.getDeck(deckId);
    if (!deck) throw new Error('invalid-request: deck not found');
    const cleanPresetId = presetId ? presetId.trim() : null;
    if (cleanPresetId && !this.getPreset(cleanPresetId)) {
      throw new Error('invalid-request: preset not found');
    }
    const now = new Date().toISOString();
    this.db.prepare(`UPDATE deck SET preset_id = ?, updated_at = ? WHERE id = ?`).run(cleanPresetId, now, deckId);
    return this.getDeck(deckId)!;
  }

  getDescendantIds(deckId: string): string[] {
    const rows = this.getAllDeckRows();
    const byParent = new Map<string, string[]>();
    for (const r of rows) {
      if (r.parent_id) {
        const list = byParent.get(r.parent_id) ?? [];
        list.push(r.id);
        byParent.set(r.parent_id, list);
      }
    }
    const result: string[] = [];
    const stack = [...(byParent.get(deckId) ?? [])];
    while (stack.length > 0) {
      const curr = stack.pop()!;
      result.push(curr);
      const children = byParent.get(curr);
      if (children) stack.push(...children);
    }
    return result;
  }

  /**
   * Deletes a deck (and its child decks).
   * Refused if it is the built-in Memorization deck.
   * Refused if the deck or its children contain cards unless `confirmWithCards === true`.
   */
  deleteDeck(id: string, confirmWithCards = false): boolean {
    if (id === MEMORIZATION_DECK_ID) {
      throw new Error('Cannot delete the built-in Memorization deck');
    }
    const deck = this.getDeck(id);
    if (!deck) return false;

    const allIds = [id, ...this.getDescendantIds(id)];
    const placeholders = allIds.map(() => '?').join(',');

    const cardCount = (
      this.db
        .prepare(
          `SELECT COUNT(DISTINCT dc.knowledge_id) AS count
           FROM deck_card dc
           JOIN knowledge k ON k.id = dc.knowledge_id
           WHERE dc.deck_id IN (${placeholders}) AND k.deleted_at IS NULL`
        )
        .get(...allIds) as { count: number }
    ).count;

    if (cardCount > 0 && !confirmWithCards) {
      throw new Error('deck-has-cards');
    }

    this.db.transaction(() => {
      // Find cards in these decks so we can suspend any that become deckless
      const affectedCards = (
        this.db
          .prepare(`SELECT DISTINCT knowledge_id FROM deck_card WHERE deck_id IN (${placeholders})`)
          .all(...allIds) as Array<{ knowledge_id: string }>
      ).map(r => r.knowledge_id);

      // Delete bottom-up so ON DELETE RESTRICT on parent_id is respected
      for (const targetId of [...allIds].reverse()) {
        this.db.prepare(`DELETE FROM deck_card WHERE deck_id = ?`).run(targetId);
        this.db.prepare(`DELETE FROM deck WHERE id = ?`).run(targetId);
      }

      // Suspend cards that are no longer in any deck
      const checkRemaining = this.db.prepare(`SELECT COUNT(*) AS count FROM deck_card WHERE knowledge_id = ?`);
      const suspendStmt = this.db.prepare(`UPDATE srs_state SET state = 'suspended' WHERE knowledge_id = ?`);
      for (const cardId of affectedCards) {
        const rem = (checkRemaining.get(cardId) as { count: number }).count;
        if (rem === 0) {
          suspendStmt.run(cardId);
        }
      }
    })();

    return true;
  }

  /**
   * Links cards into `deck_card` for a normal deck and ensures each card has an `srs_state` row.
   */
  addCardsToDeck(deckId: string, cardIds: string[], memorize = true): number {
    const deck = this.getDeck(deckId);
    if (!deck || deck.kind !== 'normal') {
      throw new Error('invalid-request: target must be a normal deck');
    }

    return this.db.transaction(() => {
      const now = new Date().toISOString();
      const maxPosRow = this.db
        .prepare(`SELECT COALESCE(MAX(position), 0) AS maxPos FROM deck_card WHERE deck_id = ?`)
        .get(deckId) as { maxPos: number };
      let nextPos = maxPosRow.maxPos;

      const insertLink = this.db.prepare(
        `INSERT OR IGNORE INTO deck_card (deck_id, knowledge_id, position, added_at) VALUES (?, ?, ?, ?)`
      );
      const getSrs = this.db.prepare(
        `SELECT state, reps FROM srs_state WHERE knowledge_id = ?`
      );
      const insertSrs = this.db.prepare(
        `INSERT OR IGNORE INTO srs_state (
          knowledge_id, state, due_at, stability, difficulty, reps, lapses, last_review,
          learning_step, buried_until, new_position, desired_retention
        ) VALUES (?, ?, ?, NULL, NULL, 0, 0, NULL, 0, NULL, ?, NULL)`
      );
      const resumeSrs = this.db.prepare(
        `UPDATE srs_state SET state = CASE WHEN reps = 0 THEN 'new' ELSE 'review' END
         WHERE knowledge_id = ? AND state = 'suspended'`
      );

      let added = 0;
      for (const cardId of new Set(cardIds)) {
        nextPos += 1;
        const res = insertLink.run(deckId, cardId, nextPos, now);
        added += res.changes;

        const existingSrs = getSrs.get(cardId) as { state: string; reps: number } | undefined;
        if (!existingSrs) {
          insertSrs.run(cardId, memorize ? 'new' : 'suspended', now, nextPos);
        } else if (memorize && existingSrs.state === 'suspended') {
          resumeSrs.run(cardId);
        }
      }
      return added;
    })();
  }

  removeCardFromDeck(deckId: string, cardId: string): boolean {
    return this.db.transaction(() => {
      const res = this.db
        .prepare(`DELETE FROM deck_card WHERE deck_id = ? AND knowledge_id = ?`)
        .run(deckId, cardId);
      const rem = (
        this.db.prepare(`SELECT COUNT(*) AS count FROM deck_card WHERE knowledge_id = ?`).get(cardId) as {
          count: number;
        }
      ).count;
      if (rem === 0) {
        this.db.prepare(`UPDATE srs_state SET state = 'suspended' WHERE knowledge_id = ?`).run(cardId);
      }
      return res.changes > 0;
    })();
  }
}
