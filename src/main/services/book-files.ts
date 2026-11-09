import { existsSync } from 'node:fs';
import { getDatabase } from '../database/connection';

/** The PDF file of a library book (Work → Edition → Source → file), if it has one on disk. */
export function bookPdfFile(workId: string): { title: string; path: string; sourceId: string } | null {
  const row = getDatabase().prepare(`SELECT w.title AS title, fsd.file_path AS path, s.id AS sourceId FROM work w
    JOIN edition e ON e.work_id = w.id JOIN source s ON s.edition_id = e.id JOIN file_source_detail fsd ON fsd.source_id = s.id
    WHERE w.id = ? AND fsd.file_path IS NOT NULL AND lower(fsd.file_path) LIKE '%.pdf' LIMIT 1`).get(workId) as { title: string; path: string; sourceId: string } | undefined;
  return row && existsSync(row.path) ? row : null;
}
