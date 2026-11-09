import type Database from 'better-sqlite3';
import {
  calculateReadingCoverage,
  calculateReviewsDue,
  evaluateCardMastery,
  evaluateAggregateMastery,
  type CardMasteryState,
  type PracticeAttemptRecord,
  type ProgressTargetItem,
  type TargetProgressSummary,
  type SectionMasterySummary,
} from '../../../shared/study-progress';

interface BookRow {
  id: string;
  title: string;
  authors: string | null;
  pages: number | null;
}

interface PathwayRow {
  id: string;
  name: string;
  description: string | null;
}

interface PathwayItemRow {
  id: string;
  section: string;
  kind: string;
  reference: string | null;
  title: string;
}

interface CardRow {
  id: string;
  work_id: string | null;
  source_ref: string | null;
  source_label: string | null;
  has_srs: number;
}

export class StudyProgressService {
  constructor(
    private readonly db: Database.Database,
    private readonly clock: () => Date = () => new Date()
  ) {}

  /**
   * Lists available progress targets (all pathways + books with reading stats or knowledge).
   */
  listTargets(): ProgressTargetItem[] {
    const targets: ProgressTargetItem[] = [];

    // 1. Pathways
    try {
      const pathways = this.db
        .prepare(
          `SELECT id, name, COALESCE(description, '') AS description
           FROM collection
           WHERE collection_type IN ('research', 'curriculum')
           ORDER BY name ASC`
        )
        .all() as PathwayRow[];

      for (const p of pathways) {
        targets.push({
          id: p.id,
          title: p.name,
          kind: 'pathway',
          subtitle: p.description || undefined,
        });
      }
    } catch {}

    // 2. Books
    try {
      const books = this.db
        .prepare(
          `SELECT b.id, b.title, b.authors, b.pages
           FROM reading_book_stat b
           UNION
           SELECT w.id, w.title, '' AS authors, 0 AS pages
           FROM work w
           WHERE w.deleted_at IS NULL
             AND NOT EXISTS (SELECT 1 FROM reading_book_stat WHERE id = w.id)
           ORDER BY title ASC`
        )
        .all() as BookRow[];

      for (const b of books) {
        targets.push({
          id: b.id,
          title: b.title,
          kind: 'book',
          subtitle: b.authors || undefined,
        });
      }
    } catch {}

    return targets;
  }

  /**
   * Computes the three separate measures for a pathway or book target.
   */
  getProgress(targetKind: 'pathway' | 'book', targetId: string): TargetProgressSummary | null {
    if (targetKind === 'book') {
      return this.getBookProgress(targetId);
    }
    if (targetKind === 'pathway') {
      return this.getPathwayProgress(targetId);
    }
    return null;
  }

  private getBookProgress(bookId: string): TargetProgressSummary | null {
    const now = this.clock();

    // 1. Book metadata
    let title = bookId;
    let subtitle: string | undefined;
    let totalPages = 1;

    try {
      const row = this.db
        .prepare(`SELECT id, title, authors, pages FROM reading_book_stat WHERE id = ?`)
        .get(bookId) as BookRow | undefined;
      if (row) {
        title = row.title;
        subtitle = row.authors || undefined;
        totalPages = Math.max(1, Number(row.pages) || 1);
      } else {
        const workRow = this.db
          .prepare(`SELECT id, title FROM work WHERE id = ? AND deleted_at IS NULL`)
          .get(bookId) as { id: string; title: string } | undefined;
        if (workRow) title = workRow.title;
      }
    } catch {}

    // 2. Measure 1: Reading Coverage
    let pageDwells: { page: number; totalDwellSeconds: number }[] = [];
    try {
      const dwellRows = this.db
        .prepare(
          `SELECT page, SUM(duration) AS totalDwellSeconds, MAX(total_pages) AS maxTotalPages
           FROM reading_page_stat
           WHERE id_book = ?
           GROUP BY page`
        )
        .all(bookId) as { page: number; totalDwellSeconds: number; maxTotalPages: number | null }[];

      pageDwells = dwellRows.map((r) => ({
        page: Number(r.page),
        totalDwellSeconds: Number(r.totalDwellSeconds || 0),
      }));

      const maxRecordedTotal = Math.max(0, ...dwellRows.map((r) => Number(r.maxTotalPages || 0)));
      if (maxRecordedTotal > totalPages) {
        totalPages = maxRecordedTotal;
      }
    } catch {}

    const readingCoverage = calculateReadingCoverage(totalPages, pageDwells);

    // 3. Measure 2: Demonstrated Knowledge
    const cardRows = this.getCardsForBook(bookId);
    const cardStates = this.evaluateCards(cardRows);

    // Group into sections by source_label
    const sectionMap = new Map<string, CardMasteryState[]>();
    for (let i = 0; i < cardRows.length; i++) {
      const label = cardRows[i].source_label?.trim() || 'General';
      const list = sectionMap.get(label) || [];
      list.push(cardStates[i]);
      sectionMap.set(label, list);
    }

    const sections: SectionMasterySummary[] = [];
    for (const [sectionName, states] of sectionMap.entries()) {
      sections.push(evaluateAggregateMastery(states, sectionName));
    }

    const overallAggregate = evaluateAggregateMastery(cardStates, 'Overall');

    // 4. Measure 3: Reviews Due
    const srsDueDates = this.getSrsDueDatesForBook(bookId);
    const reviewsDue = calculateReviewsDue(srsDueDates, now);

    return {
      targetKind: 'book',
      targetId: bookId,
      title,
      subtitle,
      readingCoverage,
      demonstratedKnowledge: {
        overallLevel: overallAggregate.level,
        levelCounts: overallAggregate.levelCounts,
        totalCards: overallAggregate.totalCards,
        demonstratedCardsCount: overallAggregate.demonstratedCardsCount,
        selfRatedCardsCount: overallAggregate.selfRatedCardsCount,
        sections,
      },
      reviewsDue,
    };
  }

  private getPathwayProgress(pathwayId: string): TargetProgressSummary | null {
    const now = this.clock();

    // 1. Pathway metadata
    let title = pathwayId;
    let subtitle: string | undefined;

    try {
      const row = this.db
        .prepare(`SELECT id, name, description FROM collection WHERE id = ?`)
        .get(pathwayId) as PathwayRow | undefined;
      if (!row) return null;
      title = row.name;
      subtitle = row.description || undefined;
    } catch {
      return null;
    }

    // 2. Pathway items & referenced books
    let items: PathwayItemRow[] = [];
    try {
      items = this.db
        .prepare(
          `SELECT id, section, kind, reference, title
           FROM pathway_item
           WHERE collection_id = ?
           ORDER BY sort_order ASC, created_at ASC`
        )
        .all(pathwayId) as PathwayItemRow[];
    } catch {}

    const referencedBookIds = new Set<string>();
    const pageRangesByBook = new Map<string, { start: number; end: number }[]>();

    for (const item of items) {
      if (item.reference) {
        const bookMatch = item.reference.match(/^book:([^@#]+)(?:@[^#]+)?(?:#p=(\d+)(?:-(\d+))?)?/);
        if (bookMatch) {
          const bookId = bookMatch[1];
          referencedBookIds.add(bookId);
          if (bookMatch[2]) {
            const start = parseInt(bookMatch[2], 10);
            const end = bookMatch[3] ? parseInt(bookMatch[3], 10) : start;
            const ranges = pageRangesByBook.get(bookId) || [];
            ranges.push({ start, end });
            pageRangesByBook.set(bookId, ranges);
          }
        }
      }
    }

    // Measure 1: Reading Coverage across referenced books
    let totalPages = 0;
    const allDwells: { page: number; totalDwellSeconds: number }[] = [];

    for (const bookId of referencedBookIds) {
      try {
        const bookRow = this.db
          .prepare(`SELECT pages FROM reading_book_stat WHERE id = ?`)
          .get(bookId) as { pages: number | null } | undefined;
        let bookTotal = Number(bookRow?.pages) || 0;

        const dwellRows = this.db
          .prepare(
            `SELECT page, SUM(duration) AS totalDwellSeconds, MAX(total_pages) AS maxTotalPages
             FROM reading_page_stat
             WHERE id_book = ?
             GROUP BY page`
          )
          .all(bookId) as { page: number; totalDwellSeconds: number; maxTotalPages: number | null }[];

        const maxTotal = Math.max(0, ...dwellRows.map((r) => Number(r.maxTotalPages || 0)));
        if (maxTotal > bookTotal) bookTotal = maxTotal;

        const ranges = pageRangesByBook.get(bookId);
        if (ranges && ranges.length > 0) {
          // If specific page ranges are set for this pathway step
          const targetPages = new Set<number>();
          for (const r of ranges) {
            for (let p = r.start; p <= r.end; p++) targetPages.add(p);
          }
          totalPages += targetPages.size;
          for (const d of dwellRows) {
            if (targetPages.has(Number(d.page))) {
              allDwells.push({
                page: Number(d.page),
                totalDwellSeconds: Number(d.totalDwellSeconds || 0),
              });
            }
          }
        } else {
          totalPages += Math.max(1, bookTotal);
          for (const d of dwellRows) {
            allDwells.push({
              page: Number(d.page),
              totalDwellSeconds: Number(d.totalDwellSeconds || 0),
            });
          }
        }
      } catch {}
    }

    const readingCoverage = calculateReadingCoverage(Math.max(1, totalPages), allDwells);

    // Measure 2: Demonstrated Knowledge per section & overall
    const cardRows = this.getCardsForPathway(pathwayId, Array.from(referencedBookIds));
    const cardStates = this.evaluateCards(cardRows);

    // Group by pathway section
    const sectionNames = Array.from(new Set(items.map((i) => i.section.trim()).filter(Boolean)));
    if (sectionNames.length === 0) sectionNames.push('Main');

    const sectionCardsMap = new Map<string, CardMasteryState[]>();
    for (const name of sectionNames) sectionCardsMap.set(name, []);

    for (let i = 0; i < cardRows.length; i++) {
      const card = cardRows[i];
      const state = cardStates[i];

      // Try to match card to a section
      let assignedSection = sectionNames[0];
      for (const item of items) {
        if (
          item.section &&
          ((card.source_ref && card.source_ref.includes(item.reference || item.id)) ||
            (card.source_label && card.source_label.includes(item.section)))
        ) {
          assignedSection = item.section;
          break;
        }
      }
      const list = sectionCardsMap.get(assignedSection) || [];
      list.push(state);
      sectionCardsMap.set(assignedSection, list);
    }

    const sections: SectionMasterySummary[] = [];
    for (const [secName, states] of sectionCardsMap.entries()) {
      sections.push(evaluateAggregateMastery(states, secName));
    }

    const overallAggregate = evaluateAggregateMastery(cardStates, 'Overall');

    // Measure 3: Reviews Due
    const srsDueDates = this.getSrsDueDatesForPathway(pathwayId, Array.from(referencedBookIds));
    const reviewsDue = calculateReviewsDue(srsDueDates, now);

    return {
      targetKind: 'pathway',
      targetId: pathwayId,
      title,
      subtitle,
      readingCoverage,
      demonstratedKnowledge: {
        overallLevel: overallAggregate.level,
        levelCounts: overallAggregate.levelCounts,
        totalCards: overallAggregate.totalCards,
        demonstratedCardsCount: overallAggregate.demonstratedCardsCount,
        selfRatedCardsCount: overallAggregate.selfRatedCardsCount,
        sections,
      },
      reviewsDue,
    };
  }

  private getCardsForBook(bookId: string): CardRow[] {
    try {
      return this.db
        .prepare(
          `SELECT k.id, k.work_id, cd.source_ref, cd.source_label,
                  CASE WHEN s.knowledge_id IS NOT NULL THEN 1 ELSE 0 END AS has_srs
           FROM knowledge k
           LEFT JOIN card_detail cd ON cd.knowledge_id = k.id
           LEFT JOIN srs_state s ON s.knowledge_id = k.id
           WHERE k.deleted_at IS NULL
             AND (k.work_id = ? OR cd.source_ref LIKE 'book:' || ? || '%')
           ORDER BY k.created_at ASC`
        )
        .all(bookId, bookId) as CardRow[];
    } catch {
      return [];
    }
  }

  private getCardsForPathway(pathwayId: string, bookIds: string[]): CardRow[] {
    try {
      const placeholders = bookIds.map(() => '?').join(',');
      const sql = `
        SELECT k.id, k.work_id, cd.source_ref, cd.source_label,
               CASE WHEN s.knowledge_id IS NOT NULL THEN 1 ELSE 0 END AS has_srs
        FROM knowledge k
        LEFT JOIN card_detail cd ON cd.knowledge_id = k.id
        LEFT JOIN srs_state s ON s.knowledge_id = k.id
        WHERE k.deleted_at IS NULL
          AND (
            cd.source_ref LIKE 'pathway:' || ? || '%'
            OR EXISTS (
              SELECT 1 FROM pathway_item pi
              WHERE pi.collection_id = ?
                AND pi.reference = 'card:' || k.id
            )
            ${bookIds.length ? `OR k.work_id IN (${placeholders})` : ''}
          )
        ORDER BY k.created_at ASC
      `;
      const params = [pathwayId, pathwayId, ...bookIds];
      return this.db.prepare(sql).all(...params) as CardRow[];
    } catch {
      return [];
    }
  }

  private evaluateCards(cards: CardRow[]): CardMasteryState[] {
    if (cards.length === 0) return [];

    const states: CardMasteryState[] = [];
    const hasPracticeTable = this.hasTable('practice_attempt');

    for (const card of cards) {
      let attempts: PracticeAttemptRecord[] = [];
      if (hasPracticeTable) {
        try {
          attempts = this.db
            .prepare(
              `SELECT id, knowledge_id AS knowledgeId, card_revision AS cardRevision,
                      question_kind AS questionKind, answer_text AS answerText,
                      result, check_method AS checkMethod,
                      mistake_category AS mistakeCategory, confidence,
                      duration_ms AS durationMs, source_ref AS sourceRef,
                      context, created_at AS createdAt
               FROM practice_attempt
               WHERE knowledge_id = ?
               ORDER BY created_at ASC`
            )
            .all(card.id) as PracticeAttemptRecord[];
        } catch {}
      }

      const mastery = evaluateCardMastery(attempts);

      // If no attempts but card is enrolled in SRS:
      if (attempts.length === 0 && card.has_srs) {
        mastery.isSelfRatedOnly = true;
      }

      states.push(mastery);
    }

    return states;
  }

  private getSrsDueDatesForBook(bookId: string): string[] {
    try {
      const rows = this.db
        .prepare(
          `SELECT s.due_at
           FROM srs_state s
           JOIN knowledge k ON k.id = s.knowledge_id
           LEFT JOIN card_detail cd ON cd.knowledge_id = k.id
           WHERE k.deleted_at IS NULL
             AND s.state <> 'suspended'
             AND (k.work_id = ? OR cd.source_ref LIKE 'book:' || ? || '%')`
        )
        .all(bookId, bookId) as { due_at: string }[];

      return rows.map((r) => r.due_at).filter(Boolean);
    } catch {
      return [];
    }
  }

  private getSrsDueDatesForPathway(pathwayId: string, bookIds: string[]): string[] {
    try {
      const placeholders = bookIds.map(() => '?').join(',');
      const sql = `
        SELECT s.due_at
        FROM srs_state s
        JOIN knowledge k ON k.id = s.knowledge_id
        LEFT JOIN card_detail cd ON cd.knowledge_id = k.id
        WHERE k.deleted_at IS NULL
          AND s.state <> 'suspended'
          AND (
            cd.source_ref LIKE 'pathway:' || ? || '%'
            OR EXISTS (
              SELECT 1 FROM pathway_item pi
              WHERE pi.collection_id = ?
                AND pi.reference = 'card:' || k.id
            )
            ${bookIds.length ? `OR k.work_id IN (${placeholders})` : ''}
          )
      `;
      const params = [pathwayId, pathwayId, ...bookIds];
      const rows = this.db.prepare(sql).all(...params) as { due_at: string }[];
      return rows.map((r) => r.due_at).filter(Boolean);
    } catch {
      return [];
    }
  }

  private hasTable(name: string): boolean {
    try {
      const row = this.db
        .prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`)
        .get(name);
      return !!row;
    } catch {
      return false;
    }
  }
}
