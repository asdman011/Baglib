/**
 * Baglib — SQLite FTS5 Book Content Repository (KEY-140)
 *
 * Provides high-performance full-text search indexing and retrieval
 * across the entire Baglib bookshelf using SQLite FTS5 with BM25 ranking
 * and morphology-aware Arabic/multilingual query parsing.
 */

import type Database from 'better-sqlite3';
import type { IndexedBookPage, LibraryFtsQuery, LibraryFtsResult } from '../../../shared/types/full-text-search';
import {
  normalizeArabicText,
  formatFts5Query,
  findMatchesInText,
} from '../../../shared/utils/text-normalizer';

export class ContentFtsRepository {
  constructor(private db: Database.Database) {}

  /**
   * Indexes pages of a book into the FTS5 virtual table.
   * Runs inside a transaction and replaces any existing indexed pages for this book.
   */
  public indexBook(bookId: string, pages: IndexedBookPage[]): void {
    if (!bookId || !pages || pages.length === 0) return;

    const deleteStmt = this.db.prepare('DELETE FROM book_content_fts WHERE book_id = ?');
    const insertStmt = this.db.prepare(`
      INSERT INTO book_content_fts (
        book_id,
        page_number,
        location_cfi_or_page,
        chapter_title,
        content,
        normalized_content
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction((pageList: IndexedBookPage[]) => {
      deleteStmt.run(bookId);

      for (const p of pageList) {
        if (!p.content || !p.content.trim()) continue;

        const normalized = normalizeArabicText(p.content);
        insertStmt.run(
          bookId,
          p.pageNumber,
          p.locationCfiOrPage || String(p.pageNumber),
          p.chapterTitle || '',
          p.content,
          normalized
        );
      }
    });

    transaction(pages);
  }

  /**
   * Deletes all indexed full-text content for a specific book.
   */
  public deleteBookIndex(bookId: string): void {
    if (!bookId) return;
    this.db.prepare('DELETE FROM book_content_fts WHERE book_id = ?').run(bookId);
  }

  /**
   * Checks whether a book is already indexed in the FTS5 table.
   */
  public isBookIndexed(bookId: string): boolean {
    if (!bookId) return false;
    const row = this.db
      .prepare('SELECT 1 FROM book_content_fts WHERE book_id = ? LIMIT 1')
      .get(bookId);
    return !!row;
  }

  /**
   * Returns the count of distinct books indexed in FTS5.
   */
  public getIndexedBooksCount(): number {
    const row = this.db
      .prepare('SELECT COUNT(DISTINCT book_id) AS cnt FROM book_content_fts')
      .get() as { cnt: number } | undefined;
    return row?.cnt || 0;
  }

  /**
   * Returns the total count of indexed pages, optionally filtered by book.
   */
  public getIndexedPagesCount(bookId?: string): number {
    if (bookId) {
      const row = this.db
        .prepare('SELECT COUNT(*) AS cnt FROM book_content_fts WHERE book_id = ?')
        .get(bookId) as { cnt: number } | undefined;
      return row?.cnt || 0;
    }

    const row = this.db
      .prepare('SELECT COUNT(*) AS cnt FROM book_content_fts')
      .get() as { cnt: number } | undefined;
    return row?.cnt || 0;
  }

  /**
   * Searches the entire library shelf or a specific book using SQLite FTS5.
   * Supports morphology normalization, Boolean queries (AND, OR, NOT),
   * phrases, prefix wildcards, and BM25 ranking.
   */
  public searchLibrary(query: string, options: LibraryFtsQuery = { query }): LibraryFtsResult[] {
    if (!query || !query.trim()) return [];

    const formattedQuery = formatFts5Query(query);
    if (!formattedQuery) return [];

    const limit = options.limit || 50;
    const offset = options.offset || 0;

    let sql = `
      SELECT
        f.book_id,
        f.page_number,
        f.location_cfi_or_page,
        f.chapter_title,
        f.content,
        w.title AS book_title,
        (
          SELECT a.name
          FROM work_author wa
          JOIN author a ON a.id = wa.author_id
          WHERE wa.work_id = f.book_id
          LIMIT 1
        ) AS book_author,
        bm25(book_content_fts) AS rank
      FROM book_content_fts f
      LEFT JOIN work w ON w.id = f.book_id
      WHERE book_content_fts MATCH ?
    `;

    const params: any[] = [`{chapter_title normalized_content}: (${formattedQuery})`];

    if (options.bookId) {
      sql += ` AND f.book_id = ?`;
      params.push(options.bookId);
    }

    sql += ` ORDER BY rank LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    let rows: any[] = [];
    try {
      rows = this.db.prepare(sql).all(...params);
    } catch {
      // Fallback: If column specifier is not supported or query syntax error,
      // fallback to standard FTS5 match without column filter
      try {
        const fallbackSql = sql.replace(
          'WHERE book_content_fts MATCH ?',
          'WHERE book_content_fts MATCH ?'
        );
        const fallbackParams: any[] = [formattedQuery];
        if (options.bookId) fallbackParams.push(options.bookId);
        fallbackParams.push(limit, offset);
        rows = this.db.prepare(fallbackSql).all(...fallbackParams);
      } catch (e) {
        console.warn('[baglib:fts] Search query error:', e);
        return [];
      }
    }

    return rows.map((r) => {
      // Highlight matching snippet preserving original vowels and typography
      const matches = findMatchesInText(r.content, query, { contextRadius: 40 });
      let snippet = '';

      if (matches.length > 0) {
        snippet = matches[0].fullSnippet;
      } else {
        // Fallback: extract the first 120 characters
        const clean = r.content.replace(/\s+/g, ' ').trim();
        snippet = clean.substring(0, 120) + (clean.length > 120 ? '...' : '');
      }

      return {
        bookId: r.book_id,
        bookTitle: r.book_title || 'Untitled Book',
        bookAuthor: r.book_author || undefined,
        pageNumber: Number(r.page_number) || 1,
        locationCfiOrPage: r.location_cfi_or_page || String(r.page_number),
        chapterTitle: r.chapter_title || undefined,
        snippet,
        rank: r.rank ?? 0,
      };
    });
  }
}
