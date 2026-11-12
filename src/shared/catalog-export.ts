export const CATALOG_TABLES = [
  'work_type', 'work', 'author', 'work_author', 'edition', 'source',
  'file_source_detail', 'physical_source_detail', 'wishlist_source_detail',
  'tag', 'work_tag', 'category', 'collection', 'work_collection',
] as const;
export type CatalogRow = Record<string, string | number | null>;
export interface CatalogExport {
  format: 'baglib-catalog';
  version: 1;
  exportedAt: string;
  tables: Record<typeof CATALOG_TABLES[number], CatalogRow[]>;
}
export interface DatabaseHealth {
  integrity: string[];
  pageCount: number;
  pageSize: number;
  sizeBytes: number;
  rows: { table: string; count: number }[];
}
export interface RebuildProgress { completed: number; total: number }
export interface AdvancedAPI {
  exportCatalog(format: 'json' | 'csv', language: 'ar' | 'en'): Promise<{ path: string } | null>;
  health(): Promise<DatabaseHealth>;
  rebuildSearch(): Promise<RebuildProgress>;
  onRebuildProgress(callback: (progress: RebuildProgress) => void): () => void;
}

/** One rectangular CSV includes the table identity and every stored catalog column. */
export function catalogToCsv(catalog: CatalogExport): string {
  const columns = [...new Set(CATALOG_TABLES.flatMap(table => catalog.tables[table].flatMap(row => Object.keys(row))))].sort();
  const quote = (value: string | number | null | undefined) => '"' + String(value ?? '').replace(/"/g, '""') + '"';
  const lines = [['table', ...columns].map(quote).join(',')];
  for (const table of CATALOG_TABLES) {
    for (const row of catalog.tables[table]) lines.push([table, ...columns.map(column => row[column])].map(quote).join(','));
  }
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}
