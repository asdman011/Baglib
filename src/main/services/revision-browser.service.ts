/**
 * KEY-395: Revision Browser & Deck Manager backend service.
 * Queries the EXISTING SRS tables (`knowledge`, `card_detail`, `srs_state`, `deck`, `deck_card`,
 * `knowledge_tag`, `tag`, `work_category`, `category`, `personal_list`, `personal_list_item`)
 * without adding any new DB tables or columns.
 */
import { randomUUID } from 'node:crypto';
import type { Database } from 'better-sqlite3';
import { normalizeArabicText } from '../../shared/utils/text-normalizer';
import {
  computeRetrievability,
  type RevisionBrowseQuery,
  type RevisionBrowseResult,
  type RevisionBulkAction,
  type RevisionBulkResult,
  type RevisionCardRow,
  type RevisionListFacet,
  type RevisionScienceFacet,
  type RevisionSourceFilter,
} from '../../shared/revision-browser';
import type { CardSourceKind } from '../../shared/types/knowledge-cards';
import { SrsService } from './srs';
import { KnowledgeCardRepository } from '../database/repositories/knowledge-card.repository';

interface RawCardRow {
  id: string;
  front: string;
  back: string;
  sourceKind: CardSourceKind;
  sourceRef: string | null;
  sourceLabel: string | null;
  workId: string | null;
  createdAt: string;
  dueAt: string | null;
  state: string | null;
  stability: number | null;
  difficulty: number | null;
  lapses: number | null;
  reps: number | null;
  lastReviewAt: string | null;
}

export class RevisionBrowserService {
  private srs: SrsService;
  private cards: KnowledgeCardRepository;

  constructor(private db: Database) {
    this.srs = new SrsService(db);
    this.cards = new KnowledgeCardRepository(db);
  }

  private collectDescendantDeckIds(rootDeckId: string): string[] {
    const rows = this.db.prepare('SELECT id, parent_id FROM deck').all() as { id: string; parent_id: string | null }[];
    const childrenMap = new Map<string, string[]>();
    for (const r of rows) {
      if (!r.parent_id) continue;
      const arr = childrenMap.get(r.parent_id) ?? [];
      arr.push(r.id);
      childrenMap.set(r.parent_id, arr);
    }
    const result = new Set<string>([rootDeckId]);
    const stack = [rootDeckId];
    while (stack.length > 0) {
      const current = stack.pop()!;
      for (const child of childrenMap.get(current) ?? []) {
        if (!result.has(child)) {
          result.add(child);
          stack.push(child);
        }
      }
    }
    return [...result];
  }

  private sourceSqlClause(sourceType: RevisionSourceFilter | undefined): string {
    switch (sourceType) {
      case 'sunnah':
        return `c.source_kind = 'hadith'`;
      case 'narrators':
        return `(c.source_kind = 'person' AND (COALESCE(c.source_ref, '') LIKE 'narrator:%' OR COALESCE(c.source_label, '') LIKE '%راوي%' OR LOWER(COALESCE(c.source_label, '')) LIKE '%narrator%'))`;
      case 'poetry':
        return `c.source_kind = 'poetry'`;
      case 'book':
        return `c.source_kind = 'book'`;
      case 'note':
        return `c.source_kind = 'note'`;
      case 'lexicon':
        return `c.source_kind = 'term'`;
      case 'person':
        return `c.source_kind = 'person'`;
      case 'tafsir':
        return `(COALESCE(c.source_ref, '') LIKE 'tafsir:%' OR COALESCE(c.source_label, '') LIKE '%تفسير%' OR LOWER(COALESCE(c.source_label, '')) LIKE '%tafsir%')`;
      case 'quran':
        return `c.source_kind = 'quran'`;
      default:
        return '';
    }
  }

  browse(query: RevisionBrowseQuery = {}, nowMs: number = Date.now()): RevisionBrowseResult {
    const where: string[] = [`k.deleted_at IS NULL`, `k.knowledge_type = 'card'`];
    const params: unknown[] = [];

    const sourceClause = this.sourceSqlClause(query.sourceType);
    if (sourceClause) where.push(sourceClause);

    if (query.state && query.state !== 'all') {
      if (query.state === 'new') {
        where.push(`(s.state IS NULL OR s.state = 'new')`);
      } else {
        where.push(`s.state = ?`);
        params.push(query.state);
      }
    }

    if (query.deckId) {
      const deckIds = this.collectDescendantDeckIds(query.deckId);
      const placeholders = deckIds.map(() => '?').join(',');
      where.push(`EXISTS (SELECT 1 FROM deck_card dc WHERE dc.knowledge_id = k.id AND dc.deck_id IN (${placeholders}))`);
      params.push(...deckIds);
    }

    if (query.science) {
      if (query.science.startsWith('cat:')) {
        const catId = query.science.slice(4);
        where.push(`EXISTS (SELECT 1 FROM work w WHERE w.id = k.work_id AND w.primary_category_id = ?)`);
        params.push(catId);
      } else if (query.science.startsWith('tag:')) {
        const tagId = query.science.slice(4);
        where.push(`EXISTS (SELECT 1 FROM knowledge_tag kt WHERE kt.knowledge_id = k.id AND kt.tag_id = ?)`);
        params.push(tagId);
      }
    }

    const listIds = Array.isArray(query.listIds) ? query.listIds.filter(id => typeof id === 'string' && id.trim()) : [];
    if (listIds.length > 0) {
      const placeholders = listIds.map(() => '?').join(',');
      if (query.listMatch === 'all') {
        where.push(`(
          SELECT COUNT(DISTINCT pli.list_id)
          FROM personal_list_item pli
          WHERE pli.list_id IN (${placeholders})
            AND (pli.item_ref = c.source_ref OR (k.work_id IS NOT NULL AND pli.item_ref = ('book:' || k.work_id)))
        ) = ?`);
        params.push(...listIds, listIds.length);
      } else {
        where.push(`EXISTS (
          SELECT 1
          FROM personal_list_item pli
          WHERE pli.list_id IN (${placeholders})
            AND (pli.item_ref = c.source_ref OR (k.work_id IS NOT NULL AND pli.item_ref = ('book:' || k.work_id)))
        )`);
        params.push(...listIds);
      }
    }

    const sql = `
      SELECT
        k.id,
        c.front,
        c.back,
        c.source_kind AS sourceKind,
        c.source_ref AS sourceRef,
        c.source_label AS sourceLabel,
        k.work_id AS workId,
        k.created_at AS createdAt,
        s.due_at AS dueAt,
        s.state AS state,
        s.stability AS stability,
        s.difficulty AS difficulty,
        s.lapses AS lapses,
        s.reps AS reps,
        s.last_review AS lastReviewAt
      FROM knowledge k
      JOIN card_detail c ON c.knowledge_id = k.id
      LEFT JOIN srs_state s ON s.knowledge_id = k.id
      WHERE ${where.join(' AND ')}
    `;

    let rows = this.db.prepare(sql).all(...params) as RawCardRow[];

    // Arabic-normalised search across front, back, sourceLabel, sourceRef
    const searchNorm = query.search ? normalizeArabicText(query.search.trim()).toLowerCase() : '';
    if (searchNorm) {
      rows = rows.filter(r => {
        const hay = normalizeArabicText(`${r.front} ${r.back} ${r.sourceLabel ?? ''} ${r.sourceRef ?? ''}`).toLowerCase();
        return hay.includes(searchNorm);
      });
    }

    // Compute retrievability and sort
    const enriched = rows.map(r => ({
      raw: r,
      retrievability: computeRetrievability(r.stability, r.lastReviewAt, nowMs),
    }));

    const sortBy = query.sortBy ?? 'due';
    const dirFactor = (query.sortDir ?? 'asc') === 'desc' ? -1 : 1;
    enriched.sort((a, b) => {
      switch (sortBy) {
        case 'due': {
          const av = a.raw.dueAt ?? '9999-12-31T23:59:59Z';
          const bv = b.raw.dueAt ?? '9999-12-31T23:59:59Z';
          return av.localeCompare(bv) * dirFactor;
        }
        case 'retrievability': {
          const av = a.retrievability ?? 2;
          const bv = b.retrievability ?? 2;
          return (av - bv) * dirFactor;
        }
        case 'difficulty': {
          const av = a.raw.difficulty ?? -1;
          const bv = b.raw.difficulty ?? -1;
          return (av - bv) * dirFactor;
        }
        case 'lapses': {
          return ((a.raw.lapses ?? 0) - (b.raw.lapses ?? 0)) * dirFactor;
        }
        case 'created': {
          return a.raw.createdAt.localeCompare(b.raw.createdAt) * dirFactor;
        }
        case 'source': {
          const av = `${a.raw.sourceKind}:${a.raw.sourceLabel ?? ''}`;
          const bv = `${b.raw.sourceKind}:${b.raw.sourceLabel ?? ''}`;
          return av.localeCompare(bv) * dirFactor;
        }
        default:
          return 0;
      }
    });

    const total = enriched.length;
    const limit = Math.max(1, Math.min(500, Math.trunc(query.limit ?? 100)));
    const offset = Math.max(0, Math.trunc(query.offset ?? 0));
    const page = enriched.slice(offset, offset + limit);

    // Hydrate deckNames, tags, and sciences only for the visible page
    const pageIds = page.map(p => p.raw.id);
    const workIds = [...new Set(page.map(p => p.raw.workId).filter((w): w is string => Boolean(w)))];

    const decksByCard = new Map<string, { id: string; name: string }[]>();
    const tagsByCard = new Map<string, string[]>();
    const catsByWork = new Map<string, string[]>();

    if (pageIds.length > 0) {
      const cardPlaceholders = pageIds.map(() => '?').join(',');
      const deckRows = this.db
        .prepare(`SELECT dc.knowledge_id AS cardId, d.id AS deckId, d.name AS deckName FROM deck_card dc JOIN deck d ON d.id = dc.deck_id WHERE dc.knowledge_id IN (${cardPlaceholders})`)
        .all(...pageIds) as { cardId: string; deckId: string; deckName: string }[];
      for (const dr of deckRows) {
        const arr = decksByCard.get(dr.cardId) ?? [];
        arr.push({ id: dr.deckId, name: dr.deckName });
        decksByCard.set(dr.cardId, arr);
      }

      const tagRows = this.db
        .prepare(`SELECT kt.knowledge_id AS cardId, t.name AS tagName FROM knowledge_tag kt JOIN tag t ON t.id = kt.tag_id WHERE kt.knowledge_id IN (${cardPlaceholders})`)
        .all(...pageIds) as { cardId: string; tagName: string }[];
      for (const tr of tagRows) {
        const arr = tagsByCard.get(tr.cardId) ?? [];
        arr.push(tr.tagName);
        tagsByCard.set(tr.cardId, arr);
      }
    }

    if (workIds.length > 0) {
      const workPlaceholders = workIds.map(() => '?').join(',');
      const catRows = this.db
        .prepare(`SELECT w.id AS workId, c.name_en AS catName FROM work w JOIN category c ON c.id = w.primary_category_id WHERE w.id IN (${workPlaceholders})`)
        .all(...workIds) as { workId: string; catName: string }[];
      for (const cr of catRows) {
        const arr = catsByWork.get(cr.workId) ?? [];
        arr.push(cr.catName);
        catsByWork.set(cr.workId, arr);
      }
    }

    const items: RevisionCardRow[] = page.map(({ raw, retrievability }) => {
      const cardDecks = decksByCard.get(raw.id) ?? [];
      const cardTags = tagsByCard.get(raw.id) ?? [];
      const workCats = raw.workId ? (catsByWork.get(raw.workId) ?? []) : [];
      return {
        id: raw.id,
        front: raw.front,
        back: raw.back,
        sourceKind: raw.sourceKind,
        sourceRef: raw.sourceRef,
        sourceLabel: raw.sourceLabel,
        createdAt: raw.createdAt,
        dueAt: raw.dueAt,
        state: raw.state ?? 'new',
        stability: raw.stability,
        difficulty: raw.difficulty,
        lapses: raw.lapses ?? 0,
        reps: raw.reps ?? 0,
        retrievability,
        deckIds: cardDecks.map(d => d.id),
        deckNames: cardDecks.map(d => d.name),
        tags: cardTags,
        sciences: [...new Set([...workCats, ...cardTags])],
      };
    });

    // Facets: sciences (book categories + card tags) and personal lists
    const sciences: RevisionScienceFacet[] = [];
    try {
      const catFacets = this.db
        .prepare(`
          SELECT DISTINCT c.id, c.name_en AS name
          FROM category c
          JOIN work w ON w.primary_category_id = c.id
          ORDER BY c.name_en
        `)
        .all() as { id: string; name: string }[];
      for (const cf of catFacets) sciences.push({ id: `cat:${cf.id}`, label: cf.name, kind: 'category' });
    } catch {}
    try {
      const tagFacets = this.db
        .prepare(`SELECT DISTINCT t.id, t.name FROM tag t JOIN knowledge_tag kt ON kt.tag_id = t.id ORDER BY t.name`)
        .all() as { id: string; name: string }[];
      for (const tf of tagFacets) sciences.push({ id: `tag:${tf.id}`, label: tf.name, kind: 'tag' });
    } catch {}

    let lists: RevisionListFacet[] = [];
    try {
      lists = this.db
        .prepare(`SELECT id, name FROM personal_list ORDER BY kind = 'starred' DESC, position, created_at`)
        .all() as RevisionListFacet[];
    } catch {}

    return { items, total, facets: { sciences, lists } };
  }

  bulkAction(input: RevisionBulkAction): RevisionBulkResult {
    const ids = Array.isArray(input.cardIds) ? [...new Set(input.cardIds.filter(id => typeof id === 'string' && id.trim()))] : [];
    if (ids.length === 0) return { affected: 0 };

    switch (input.action) {
      case 'suspend':
      case 'unsuspend': {
        const suspended = input.action === 'suspend';
        let affected = 0;
        for (const id of ids) {
          this.srs.suspendCard(id, suspended);
          affected++;
        }
        return { affected };
      }
      case 'reschedule': {
        const days = Number.isFinite(input.days) ? Math.max(0, Math.min(36500, Math.trunc(input.days))) : 0;
        let affected = 0;
        for (const id of ids) {
          this.srs.setDueDate(id, days);
          affected++;
        }
        return { affected };
      }
      case 'moveDeck': {
        if (!input.deckId || typeof input.deckId !== 'string') throw new Error('invalid-request');
        const deckExists = this.db.prepare('SELECT 1 FROM deck WHERE id = ?').get(input.deckId);
        if (!deckExists) throw new Error('not-found');
        const now = new Date().toISOString();
        const tx = this.db.transaction(() => {
          const del = this.db.prepare('DELETE FROM deck_card WHERE knowledge_id = ?');
          const ins = this.db.prepare('INSERT OR IGNORE INTO deck_card (deck_id, knowledge_id, added_at) VALUES (?, ?, ?)');
          for (const id of ids) {
            del.run(id);
            ins.run(input.deckId, id, now);
          }
        });
        tx();
        return { affected: ids.length };
      }
      case 'tag': {
        const tagName = typeof input.tag === 'string' ? input.tag.trim() : '';
        if (!tagName || tagName.length > 80) throw new Error('invalid-request');
        const tx = this.db.transaction(() => {
          let row = this.db.prepare('SELECT id FROM tag WHERE name = ?').get(tagName) as { id: string } | undefined;
          if (!row) {
            const tagId = randomUUID();
            this.db.prepare('INSERT INTO tag (id, name) VALUES (?, ?)').run(tagId, tagName);
            row = { id: tagId };
          }
          const ins = this.db.prepare('INSERT OR IGNORE INTO knowledge_tag (knowledge_id, tag_id) VALUES (?, ?)');
          for (const id of ids) {
            ins.run(id, row.id);
          }
        });
        tx();
        return { affected: ids.length };
      }
      case 'delete': {
        if (input.confirmed !== true) throw new Error('invalid-request');
        let affected = 0;
        for (const id of ids) {
          this.cards.remove(id);
          affected++;
        }
        return { affected };
      }
      default:
        throw new Error('invalid-request');
    }
  }
}
