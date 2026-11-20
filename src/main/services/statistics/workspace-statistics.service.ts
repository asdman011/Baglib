import type { Database } from 'better-sqlite3';
import type { AiRetentionComparison, AiRetentionGroupStats, StatisticsSnapshot } from '../../../shared/statistics-workspace';

const MINIMUM_RECOMMENDED_SAMPLE = 10;

function emptyRetentionGroup(): AiRetentionGroupStats {
  return {
    cards: 0,
    reviewedCards: 0,
    reviews: 0,
    retainedReviews: 0,
    recallRate: null,
    avgStability: null,
    totalLapses: 0,
    avgLapses: null,
  };
}

function computeAiRetention(db: Database, reviewWhere: string): AiRetentionComparison {
  const hasTagTables = Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='knowledge_tag'").get());
  const aiExpr = hasTagTables
    ? "EXISTS (SELECT 1 FROM knowledge_tag kt JOIN tag tg ON tg.id = kt.tag_id WHERE kt.knowledge_id = k.id AND tg.name = 'ai-generated')"
    : '0';

  const cardRows = db.prepare(`
    SELECT ${aiExpr} AS aiAssisted,
      COUNT(*) AS cards,
      SUM(CASE WHEN COALESCE(s.reps, 0) > 0 THEN 1 ELSE 0 END) AS reviewedCards,
      AVG(CASE WHEN COALESCE(s.reps, 0) > 0 THEN s.stability END) AS avgStability,
      COALESCE(SUM(COALESCE(s.lapses, 0)), 0) AS totalLapses,
      AVG(CASE WHEN COALESCE(s.reps, 0) > 0 THEN s.lapses END) AS avgLapses
    FROM knowledge k
    JOIN card_detail c ON c.knowledge_id = k.id
    LEFT JOIN srs_state s ON s.knowledge_id = k.id
    WHERE k.deleted_at IS NULL
    GROUP BY aiAssisted
  `).all() as Array<{
    aiAssisted: number;
    cards: number;
    reviewedCards: number;
    avgStability: number | null;
    totalLapses: number;
    avgLapses: number | null;
  }>;

  const reviewRows = db.prepare(`
    SELECT ${aiExpr} AS aiAssisted,
      COUNT(*) AS reviews,
      SUM(CASE WHEN r.rating > 1 THEN 1 ELSE 0 END) AS retainedReviews
    FROM srs_review_log r
    JOIN knowledge k ON k.id = r.knowledge_id
    JOIN card_detail c ON c.knowledge_id = k.id
    ${reviewWhere} AND k.deleted_at IS NULL
    GROUP BY aiAssisted
  `).all() as Array<{ aiAssisted: number; reviews: number; retainedReviews: number }>;

  const aiAssisted = emptyRetentionGroup();
  const other = emptyRetentionGroup();

  for (const row of cardRows) {
    const target = row.aiAssisted ? aiAssisted : other;
    target.cards = Number(row.cards || 0);
    target.reviewedCards = Number(row.reviewedCards || 0);
    target.avgStability = row.avgStability !== null ? Number(row.avgStability) : null;
    target.totalLapses = Number(row.totalLapses || 0);
    target.avgLapses = row.avgLapses !== null ? Number(row.avgLapses) : null;
  }

  for (const row of reviewRows) {
    const target = row.aiAssisted ? aiAssisted : other;
    target.reviews = Number(row.reviews || 0);
    target.retainedReviews = Number(row.retainedReviews || 0);
    target.recallRate = target.reviews > 0 ? target.retainedReviews / target.reviews : null;
  }

  return {
    aiAssisted,
    other,
    minimumRecommendedSample: MINIMUM_RECOMMENDED_SAMPLE,
  };
}

/** Read-only projections of existing tables. Dates match the reading tracker civil-day convention. */
export function workspaceStatistics(db: Database): StatisticsSnapshot {
  const hasEntryKind = Boolean(db.prepare("SELECT 1 FROM pragma_table_info('srs_review_log') WHERE name='entry_kind'").get());
  const reviewWhere = hasEntryKind
    ? "WHERE entry_kind IN ('learn','review','relearn','filtered') AND rating >= 1"
    : "WHERE rating >= 1";
  return db.transaction(() => ({
    reading: db.prepare(`SELECT date(start_time,'unixepoch','localtime') AS date,
      SUM(duration) AS seconds, COUNT(DISTINCT id_book || ':' || page) AS pages,
      COUNT(DISTINCT id_book) AS activeBooks FROM reading_page_stat GROUP BY date ORDER BY date`).all() as StatisticsSnapshot['reading'],
    knowledge: db.prepare(`SELECT date(created_at,'localtime') AS date,
      SUM(knowledge_type IN ('note','study_note','reading_reflection')) AS notes,
      SUM(knowledge_type='card') AS cards FROM knowledge WHERE deleted_at IS NULL
      GROUP BY date ORDER BY date`).all() as StatisticsSnapshot['knowledge'],
    reviews: db.prepare(`SELECT date(reviewed_at,'localtime') AS date, COUNT(*) AS total,
      SUM(rating>1) AS retained FROM srs_review_log ${reviewWhere} GROUP BY date ORDER BY date`).all() as StatisticsSnapshot['reviews'],
    due: db.prepare(`SELECT date(s.due_at,'localtime') AS dueAt, COUNT(*) AS count FROM srs_state s
      JOIN knowledge k ON k.id=s.knowledge_id WHERE s.state<>'suspended' AND k.deleted_at IS NULL
      GROUP BY dueAt ORDER BY dueAt`).all() as StatisticsSnapshot['due'],
    completions: db.prepare(`SELECT date(trim(value,'"'),'localtime') AS date, COUNT(*) AS value
      FROM app_settings WHERE key LIKE 'reading.log.completed:%' GROUP BY date ORDER BY date`).all() as StatisticsSnapshot['completions'],
    subjects: db.prepare(`SELECT c.name_ar AS ar, c.name_en AS en, COUNT(*) AS count FROM work w
      LEFT JOIN category c ON c.id=w.primary_category_id WHERE w.deleted_at IS NULL GROUP BY w.primary_category_id ORDER BY count DESC`).all() as StatisticsSnapshot['subjects'],
    inProgress: (db.prepare("SELECT COUNT(*) AS count FROM work WHERE deleted_at IS NULL AND reading_status='reading'").get() as { count: number }).count,
    completed: (db.prepare("SELECT COUNT(*) AS count FROM work WHERE deleted_at IS NULL AND reading_status='completed'").get() as { count: number }).count,
    aiRetention: computeAiRetention(db, reviewWhere),
  }))();
}
