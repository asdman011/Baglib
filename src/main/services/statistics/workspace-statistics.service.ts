import type { Database } from 'better-sqlite3';
import type { StatisticsSnapshot } from '../../../shared/statistics-workspace';

/** Read-only projections of existing tables. Dates match the reading tracker civil-day convention. */
export function workspaceStatistics(db: Database): StatisticsSnapshot {
  return db.transaction(() => ({
    reading: db.prepare(`SELECT date(start_time,'unixepoch','localtime') AS date,
      SUM(duration) AS seconds, COUNT(DISTINCT id_book || ':' || page) AS pages,
      COUNT(DISTINCT id_book) AS activeBooks FROM reading_page_stat GROUP BY date ORDER BY date`).all() as StatisticsSnapshot['reading'],
    knowledge: db.prepare(`SELECT date(created_at,'localtime') AS date,
      SUM(knowledge_type IN ('note','study_note','reading_reflection')) AS notes,
      SUM(knowledge_type='card') AS cards FROM knowledge WHERE deleted_at IS NULL
      GROUP BY date ORDER BY date`).all() as StatisticsSnapshot['knowledge'],
    reviews: db.prepare(`SELECT date(reviewed_at,'localtime') AS date, COUNT(*) AS total,
      SUM(rating>1) AS retained FROM srs_review_log GROUP BY date ORDER BY date`).all() as StatisticsSnapshot['reviews'],
    due: db.prepare(`SELECT date(s.due_at,'localtime') AS dueAt, COUNT(*) AS count FROM srs_state s
      JOIN knowledge k ON k.id=s.knowledge_id WHERE s.state<>'suspended' AND k.deleted_at IS NULL
      GROUP BY dueAt ORDER BY dueAt`).all() as StatisticsSnapshot['due'],
    completions: db.prepare(`SELECT date(trim(value,'"'),'localtime') AS date, COUNT(*) AS value
      FROM app_settings WHERE key LIKE 'reading.log.completed:%' GROUP BY date ORDER BY date`).all() as StatisticsSnapshot['completions'],
    subjects: db.prepare(`SELECT c.name_ar AS ar, c.name_en AS en, COUNT(*) AS count FROM work w
      LEFT JOIN category c ON c.id=w.primary_category_id WHERE w.deleted_at IS NULL GROUP BY w.primary_category_id ORDER BY count DESC`).all() as StatisticsSnapshot['subjects'],
    inProgress: (db.prepare("SELECT COUNT(*) AS count FROM work WHERE deleted_at IS NULL AND reading_status='reading'").get() as { count: number }).count,
    completed: (db.prepare("SELECT COUNT(*) AS count FROM work WHERE deleted_at IS NULL AND reading_status='completed'").get() as { count: number }).count,
  }))();
}
