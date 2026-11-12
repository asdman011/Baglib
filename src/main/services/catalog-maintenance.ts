import type Database from 'better-sqlite3';
import { CATALOG_TABLES, type CatalogExport, type CatalogRow, type DatabaseHealth, type RebuildProgress } from '../../shared/catalog-export';

export function readCatalog(db: Database.Database): CatalogExport {
  return db.transaction(() => {
    const tables = Object.fromEntries(CATALOG_TABLES.map(table => [table, db.prepare('SELECT * FROM "' + table + '"').all() as CatalogRow[]])) as CatalogExport['tables'];
    return { format: 'baglib-catalog' as const, version: 1 as const, exportedAt: new Date().toISOString(), tables };
  })();
}

export function databaseHealth(db: Database.Database): DatabaseHealth {
  return db.transaction(() => {
    const integrity = (db.pragma('integrity_check') as { integrity_check: string }[]).map(row => row.integrity_check);
    const pageCount = db.pragma('page_count', { simple: true }) as number;
    const pageSize = db.pragma('page_size', { simple: true }) as number;
    const tables = db.pragma('table_list') as { schema: string; name: string; type: string }[];
    const rows = tables.filter(table => table.schema === 'main' && table.type === 'table' && !table.name.startsWith('sqlite_'))
      .sort((a, b) => a.name.localeCompare(b.name)).map(table => ({
        table: table.name,
        count: (db.prepare('SELECT COUNT(*) AS count FROM "' + table.name.replace(/"/g, '""') + '"').get() as { count: number }).count,
      }));
    return { integrity, pageCount, pageSize, sizeBytes: pageCount * pageSize, rows };
  })();
}

/** Rebuild only the catalog's existing content-bearing FTS5 table. SQLite makes the command atomic. */
export async function rebuildCatalogSearch(db: Database.Database, progress: (value: RebuildProgress) => void): Promise<RebuildProgress> {
  progress({ completed: 0, total: 1 });
  // Let the renderer paint progress before the synchronous SQLite command runs.
  await new Promise<void>(resolve => setTimeout(resolve, 50));
  db.prepare("INSERT INTO book_content_fts(book_content_fts) VALUES ('rebuild')").run();
  const result = { completed: 1, total: 1 };
  progress(result);
  return result;
}
