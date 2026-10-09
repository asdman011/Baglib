import type { Database } from 'better-sqlite3';

export interface BookItemInput {
  id?: string;
  title: string;
  author: string;
  edition?: string;
  publisher?: string;
  publicationYear?: number | string;
  isbn?: string;
  coverImage?: string;
  pagesCount?: number;
  shelf?: string;
  room?: string;
  language?: string;
  categories?: string[];
  tags?: string[];
  purchaseDate?: string;
  price?: string;
  condition?: string;
  bookType?: 'digital' | 'physical' | 'hybrid';
  digitalFormat?: string;
  filePath?: string;
  fileSize?: string;
  onlineSource?: string;
  sourceUrl?: string;
}

export class WorkRepository {
  constructor(private db: Database) {}

  /**
   * Fetch all works with their primary edition and digital/physical sources.
   * Bridges the normalized DB schema to the flat UI BookItem interface.
   */
  getAllWorks() {
    const rows = this.db.prepare(`
      SELECT 
        w.id as id,
        w.title as title,
        w.original_language as language,
        e.id as editionId,
        e.label as edition,
        e.publisher as publisher,
        e.publication_year as publicationYear,
        e.isbn as isbn,
        fsd.file_path as filePath,
        fsd.file_format as digitalFormat,
        psd.shelf as shelf,
        psd.room as room,
        psd.condition as condition,
        s.source_type as sourceType,
        GROUP_CONCAT(DISTINCT a.name) as author,
        GROUP_CONCAT(DISTINCT t.name) as categories,
        w.primary_category_id as primaryCategoryId,
        cat.name_ar as pcNameAr,
        cat.name_en as pcNameEn
      FROM work w
      LEFT JOIN edition e ON e.work_id = w.id
      LEFT JOIN source s ON s.edition_id = e.id
      LEFT JOIN file_source_detail fsd ON fsd.source_id = s.id
      LEFT JOIN physical_source_detail psd ON psd.source_id = s.id
      LEFT JOIN work_author wa ON wa.work_id = w.id
      LEFT JOIN author a ON a.id = wa.author_id
      LEFT JOIN work_tag wt ON wt.work_id = w.id
      LEFT JOIN tag t ON t.id = wt.tag_id
      LEFT JOIN category cat ON cat.id = w.primary_category_id
      GROUP BY w.id
      ORDER BY w.created_at DESC
    `).all() as any[];

    return rows.map((r) => ({
      id: r.id,
      title: r.title || 'بدون عنوان',
      author: r.author || 'مؤلف مجهول',
      edition: r.edition || undefined,
      publisher: r.publisher || undefined,
      publicationYear: r.publicationYear || undefined,
      isbn: r.isbn || undefined,
      shelf: r.shelf || undefined,
      room: r.room || undefined,
      language: r.language || 'العربية',
      categories: r.categories ? r.categories.split(',') : [],
      primaryCategory: r.primaryCategoryId ? {
        id: r.primaryCategoryId,
        nameAr: r.pcNameAr,
        nameEn: r.pcNameEn
      } : null,
      tags: [],
      lendingHistory: [],
      condition: r.condition || undefined,
      bookType: (r.sourceType as any) || (r.filePath ? 'digital' : 'physical'),
      digitalFormat: r.digitalFormat || (r.filePath?.toLowerCase().endsWith('.pdf') ? 'PDF' : undefined),
      filePath: r.filePath || undefined,
    }));
  }

  /**
   * Adds a new Work, Author, Edition, Source, and File/Physical Details in a single transaction.
   */
  addBook(data: BookItemInput) {
    if (data.id) {
      const existing = this.db.prepare('SELECT id FROM work WHERE id = ?').get(data.id);
      if (existing) {
        return this.updateBook(data);
      }
    }

    const insertTransaction = this.db.transaction(() => {
      const workId = data.id || crypto.randomUUID();
      const authorId = crypto.randomUUID();
      const editionId = crypto.randomUUID();
      const sourceId = crypto.randomUUID();
      const now = new Date().toISOString();

      // 1. Insert Work
      this.db.prepare(`
        INSERT INTO work (id, work_type_id, title, original_language, primary_category_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(workId, 'wt-book', data.title, data.language || 'العربية', data.primaryCategory?.id || null, now);

      // 2. Insert Author (or reuse existing if same name)
      const existingAuthor = this.db.prepare('SELECT id FROM author WHERE name = ?').get(data.author) as { id: string } | undefined;
      const finalAuthorId = existingAuthor ? existingAuthor.id : authorId;

      if (!existingAuthor) {
        this.db.prepare('INSERT INTO author (id, name) VALUES (?, ?)').run(finalAuthorId, data.author || 'مؤلف مجهول');
      }

      // 3. Link Work to Author
      this.db.prepare('INSERT OR IGNORE INTO work_author (work_id, author_id, role) VALUES (?, ?, ?)').run(workId, finalAuthorId, 'author');

      // 4. Insert Edition
      const pubYear = typeof data.publicationYear === 'number' 
        ? data.publicationYear 
        : data.publicationYear ? parseInt(String(data.publicationYear), 10) || null : null;

      this.db.prepare(`
        INSERT INTO edition (id, work_id, label, publisher, publication_year, language, isbn)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(editionId, workId, data.edition || null, data.publisher || null, pubYear, data.language || 'العربية', data.isbn || null);

      // 5. Insert Source
      const bookType = data.bookType || (data.filePath ? 'digital' : 'physical');
      this.db.prepare(`
        INSERT INTO source (id, edition_id, source_type, status, added_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(sourceId, editionId, bookType, 'available', now);

      // 6. Insert Source Detail
      if (data.filePath || bookType === 'digital') {
        const fmt = data.digitalFormat || (data.filePath?.toLowerCase().endsWith('.pdf') ? 'PDF' : 'PDF');
        this.db.prepare(`
          INSERT INTO file_source_detail (source_id, file_path, file_format, is_managed)
          VALUES (?, ?, ?, ?)
        `).run(sourceId, data.filePath || null, fmt, 0);
      }

      if (bookType === 'physical' || data.shelf || data.room) {
        this.db.prepare(`
          INSERT INTO physical_source_detail (source_id, shelf, room, condition)
          VALUES (?, ?, ?, ?)
        `).run(sourceId, data.shelf || null, data.room || null, data.condition || null);
      }

      // 7. Insert Categories
      if (data.categories && data.categories.length > 0) {
        const insertTag = this.db.prepare('INSERT OR IGNORE INTO tag (id, name, category, origin) VALUES (?, ?, ?, ?)');
        const getTag = this.db.prepare('SELECT id FROM tag WHERE name = ? AND category = ?');
        const insertWorkTag = this.db.prepare('INSERT OR IGNORE INTO work_tag (work_id, tag_id) VALUES (?, ?)');
        
        for (const catName of data.categories) {
          // Try to insert (ignores if name already exists)
          insertTag.run(crypto.randomUUID(), catName, 'subject', 'manual');
          // Retrieve the tag id (whether it just inserted or already existed)
          const tagRow = getTag.get(catName, 'subject') as { id: string } | undefined;
          if (tagRow) {
            insertWorkTag.run(workId, tagRow.id);
          }
        }
      }

      return {
        id: workId,
        title: data.title,
        author: data.author,
        edition: data.edition,
        publisher: data.publisher,
        publicationYear: data.publicationYear,
        isbn: data.isbn,
        shelf: data.shelf,
        room: data.room,
        language: data.language || 'العربية',
        categories: data.categories || [],
        tags: data.tags || [],
        lendingHistory: [],
        condition: data.condition as any,
        bookType: bookType as any,
        digitalFormat: data.digitalFormat as any,
        filePath: data.filePath,
      };
    });

    return insertTransaction();
  }

  updateBook(data: BookItemInput) {
    const updateTransaction = this.db.transaction(() => {
      // 1. Update Work
      this.db.prepare(`
        UPDATE work 
        SET title = ?, original_language = ?, primary_category_id = ?
        WHERE id = ?
      `).run(data.title, data.language || 'العربية', data.primaryCategory?.id || null, data.id);

      // 2. Author
      this.db.prepare('DELETE FROM work_author WHERE work_id = ?').run(data.id);
      
      const existingAuthor = this.db.prepare('SELECT id FROM author WHERE name = ?').get(data.author) as { id: string } | undefined;
      const finalAuthorId = existingAuthor ? existingAuthor.id : crypto.randomUUID();
      if (!existingAuthor) {
        this.db.prepare('INSERT INTO author (id, name) VALUES (?, ?)').run(finalAuthorId, data.author || 'مؤلف مجهول');
      }
      this.db.prepare('INSERT INTO work_author (work_id, author_id, role) VALUES (?, ?, ?)').run(data.id, finalAuthorId, 'author');

      // 3. Edition
      const pubYear = typeof data.publicationYear === 'number' 
        ? data.publicationYear 
        : data.publicationYear ? parseInt(String(data.publicationYear), 10) || null : null;

      const edition = this.db.prepare('SELECT id FROM edition WHERE work_id = ? LIMIT 1').get(data.id) as { id: string } | undefined;
      if (edition) {
        this.db.prepare(`
          UPDATE edition 
          SET label = ?, publisher = ?, publication_year = ?, language = ?, isbn = ?
          WHERE id = ?
        `).run(data.edition || null, data.publisher || null, pubYear, data.language || 'العربية', data.isbn || null, edition.id);

        const source = this.db.prepare('SELECT id FROM source WHERE edition_id = ? LIMIT 1').get(edition.id) as { id: string } | undefined;
        if (source) {
           const bookType = data.bookType || (data.filePath ? 'digital' : 'physical');
           this.db.prepare('UPDATE source SET source_type = ? WHERE id = ?').run(bookType, source.id);
           
           if (data.filePath || bookType === 'digital') {
              const fmt = data.digitalFormat || (data.filePath?.toLowerCase().endsWith('.pdf') ? 'PDF' : 'PDF');
              this.db.prepare('UPDATE file_source_detail SET file_path = ?, file_format = ? WHERE source_id = ?').run(data.filePath || null, fmt, source.id);
           }
           if (bookType === 'physical' || data.shelf || data.room) {
              this.db.prepare('UPDATE physical_source_detail SET shelf = ?, room = ?, condition = ? WHERE source_id = ?').run(data.shelf || null, data.room || null, data.condition || null, source.id);
           }
        }
      }

      return data;
    });
    return updateTransaction();
  }

  /**
   * Deletes a Work by ID (cascades to edition, source, details, etc.).
   */
  deleteBook(workId: string) {
    const stmt = this.db.prepare('DELETE FROM work WHERE id = ?');
    const result = stmt.run(workId);
    return result.changes > 0;
  }
}

