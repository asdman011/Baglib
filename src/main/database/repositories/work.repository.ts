import type { Database } from 'better-sqlite3';
import type { IWorkRepository, BookItem, BookItemInput } from '../../../shared/types/repository';
import {
  WORK_TYPES,
  WORK_TYPE_ID_MAP,
  getWorkTypeInfo,
  type WorkTypeKey,
  type Contributor,
  type LendingRecord
} from '../../../shared/types/metadata';

export class SqliteWorkRepository implements IWorkRepository {
  constructor(private db: Database) {}

  private mapRowToBookItem(r: any): BookItem {
    let meta: Record<string, any> = {};
    if (r.metadataJson) {
      try {
        meta = JSON.parse(r.metadataJson);
      } catch {
        meta = {};
      }
    }

    const workTypeKey: WorkTypeKey = (r.workTypeId && WORK_TYPE_ID_MAP[r.workTypeId])
      || meta.workType
      || 'book';

    const workTypeId = r.workTypeId || WORK_TYPES[workTypeKey]?.id || 'wt-book';

    const bookcase = r.bookcase || meta.bookcase || meta.physicalLocation?.bookcase || undefined;
    const shelfSection = r.shelfSection || meta.shelfSection || meta.physicalLocation?.shelfSection || undefined;
    const shelf = r.shelf || meta.shelf || meta.physicalLocation?.shelf || undefined;
    const room = r.room || meta.room || meta.physicalLocation?.room || undefined;

    const condition = r.condition || meta.condition || undefined;
    const purchaseDate = r.purchaseDate || meta.purchaseDate || meta.acquisition?.purchaseDate || undefined;
    const priceStr = r.price !== undefined && r.price !== null
      ? String(r.price)
      : (meta.price !== undefined ? String(meta.price) : (meta.acquisition?.price !== undefined ? String(meta.acquisition.price) : undefined));

    const physicalLocation = (room || bookcase || shelf || shelfSection || meta.physicalLocation)
      ? {
          room,
          bookcase,
          shelf,
          shelfSection,
          ...meta.physicalLocation,
        }
      : undefined;

    const acquisition = (purchaseDate || priceStr || meta.acquisition)
      ? {
          purchaseDate,
          price: priceStr,
          ...meta.acquisition,
        }
      : undefined;

    return {
      id: r.id,
      title: r.title || 'بدون عنوان',
      author: r.author || meta.speaker || meta.scribe || meta.advisor || 'مؤلف مجهول',
      edition: r.edition || meta.edition || undefined,
      publisher: r.publisher || meta.publisher || undefined,
      publicationYear: r.publicationYear !== undefined && r.publicationYear !== null
        ? r.publicationYear
        : (meta.publicationYear || undefined),
      isbn: r.isbn || meta.isbn || undefined,
      shelf,
      room,
      bookcase,
      shelfSection,
      physicalLocation,
      language: r.language || meta.language || 'العربية',
      categories: r.categories ? r.categories.split(',') : (meta.categories || []),
      primaryCategory: r.primaryCategoryId ? {
        id: r.primaryCategoryId,
        nameAr: r.pcNameAr || '',
        nameEn: r.pcNameEn || '',
      } : null,
      tags: meta.tags || [],
      readingStatus: (r.readingStatus as any) || 'unread',
      readingProgress: typeof r.readingProgress === 'number' ? r.readingProgress : (r.readingProgress ? parseInt(r.readingProgress, 10) : 0),
      lendingHistory: meta.lendingHistory || [],
      condition,
      purchaseDate,
      price: priceStr,
      acquisition,
      bookType: (r.sourceType as any) || (r.filePath ? 'digital' : 'physical'),
      digitalFormat: r.digitalFormat || (r.filePath?.toLowerCase().endsWith('.pdf') ? 'PDF' : undefined),
      filePath: r.filePath || undefined,

      // Work classification
      workTypeId,
      workType: workTypeKey,

      // Research papers & articles
      doi: meta.doi || undefined,
      journalName: meta.journalName || undefined,
      conferenceName: meta.conferenceName || undefined,
      abstract: meta.abstract || r.description || undefined,
      peerReviewed: meta.peerReviewed !== undefined ? Boolean(meta.peerReviewed) : undefined,
      arxivId: meta.arxivId || undefined,
      pagesRange: meta.pagesRange || undefined,
      publicationName: meta.publicationName || undefined,
      issueDate: meta.issueDate || undefined,

      // Lectures & talks
      speaker: meta.speaker || undefined,
      hostInstitution: meta.hostInstitution || undefined,
      courseOrEventTitle: meta.courseOrEventTitle || undefined,
      durationMinutes: meta.durationMinutes !== undefined ? Number(meta.durationMinutes) : undefined,
      recordingUrl: meta.recordingUrl || undefined,

      // Periodicals & magazines
      periodicalTitle: meta.periodicalTitle || undefined,
      issueNumber: meta.issueNumber !== undefined ? meta.issueNumber : undefined,
      volumeNumber: meta.volumeNumber !== undefined ? meta.volumeNumber : undefined,
      publicationSeasonOrMonth: meta.publicationSeasonOrMonth || undefined,
      issn: meta.issn || undefined,

      // Theses & dissertations
      degreeLevel: meta.degreeLevel || undefined,
      facultyOrDepartment: meta.facultyOrDepartment || undefined,
      advisor: meta.advisor || undefined,
      defenseDate: meta.defenseDate || undefined,

      // Manuscripts
      holdingInstitution: meta.holdingInstitution || undefined,
      codexOrShelfmark: meta.codexOrShelfmark || undefined,
      scribe: meta.scribe || undefined,
      scriptType: meta.scriptType || undefined,
      folioCount: meta.folioCount !== undefined ? meta.folioCount : undefined,

      // Contributors list
      contributors: meta.contributors || undefined,
    };
  }

  /**
   * Fetch all works with their primary edition, sources, extended metadata, and lending history.
   */
  getAllWorks(): BookItem[] {
    const rows = this.db.prepare(`
      SELECT 
        w.id as id,
        w.work_type_id as workTypeId,
        wtype.name as workTypeName,
        w.title as title,
        w.description as description,
        w.original_language as language,
        w.reading_status as readingStatus,
        w.reading_progress as readingProgress,
        w.metadata_json as metadataJson,
        e.id as editionId,
        e.label as edition,
        e.publisher as publisher,
        e.publication_year as publicationYear,
        e.isbn as isbn,
        fsd.file_path as filePath,
        fsd.file_format as digitalFormat,
        psd.shelf as shelf,
        psd.room as room,
        psd.bookcase as bookcase,
        psd.shelf_section as shelfSection,
        psd.condition as condition,
        psd.purchase_date as purchaseDate,
        psd.price as price,
        s.source_type as sourceType,
        GROUP_CONCAT(DISTINCT a.name) as author,
        GROUP_CONCAT(DISTINCT t.name) as categories,
        w.primary_category_id as primaryCategoryId,
        cat.name_ar as pcNameAr,
        cat.name_en as pcNameEn
      FROM work w
      LEFT JOIN work_type wtype ON wtype.id = w.work_type_id
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

    const items = rows.map((r) => this.mapRowToBookItem(r));

    // Try to load normalized lending records
    try {
      const allLoans = this.db.prepare(`
        SELECT 
          id,
          work_id as workId,
          borrower_name as borrowerName,
          borrower_contact as borrowerContact,
          borrow_date as borrowDate,
          expected_return_date as expectedReturnDate,
          actual_return_date as actualReturnDate,
          is_returned as isReturned,
          status,
          condition_return as conditionOnReturn,
          notes
        FROM lending_record
        ORDER BY borrow_date DESC, created_at DESC
      `).all() as any[];

      const today = new Date().toISOString().split('T')[0];
      const loansByWork = new Map<string, LendingRecord[]>();
      for (const r of allLoans) {
        const isRet = Boolean(r.isReturned);
        const record: LendingRecord = {
          id: r.id,
          borrowerName: r.borrowerName,
          borrowerContact: r.borrowerContact || undefined,
          borrowDate: r.borrowDate,
          expectedReturnDate: r.expectedReturnDate || 'غير محدد',
          actualReturnDate: r.actualReturnDate || undefined,
          isReturned: isRet,
          conditionOnReturn: r.conditionOnReturn || undefined,
          notes: r.notes || undefined,
        };
        const list = loansByWork.get(r.workId) || [];
        list.push(record);
        loansByWork.set(r.workId, list);
      }

      for (const item of items) {
        const loans = loansByWork.get(item.id);
        if (loans && loans.length > 0) {
          item.lendingHistory = loans;
        }
      }
    } catch {
      // If table doesn't exist yet, fallback gracefully to items' internal history
    }

    return items;
  }

  /**
   * Fetch a single work by ID with complete extended metadata and lending history.
   */
  getById(workId: string): BookItem | null {
    const row = this.db.prepare(`
      SELECT 
        w.id as id,
        w.work_type_id as workTypeId,
        wtype.name as workTypeName,
        w.title as title,
        w.description as description,
        w.original_language as language,
        w.reading_status as readingStatus,
        w.reading_progress as readingProgress,
        w.metadata_json as metadataJson,
        e.id as editionId,
        e.label as edition,
        e.publisher as publisher,
        e.publication_year as publicationYear,
        e.isbn as isbn,
        fsd.file_path as filePath,
        fsd.file_format as digitalFormat,
        psd.shelf as shelf,
        psd.room as room,
        psd.bookcase as bookcase,
        psd.shelf_section as shelfSection,
        psd.condition as condition,
        psd.purchase_date as purchaseDate,
        psd.price as price,
        s.source_type as sourceType,
        GROUP_CONCAT(DISTINCT a.name) as author,
        GROUP_CONCAT(DISTINCT t.name) as categories,
        w.primary_category_id as primaryCategoryId,
        cat.name_ar as pcNameAr,
        cat.name_en as pcNameEn
      FROM work w
      LEFT JOIN work_type wtype ON wtype.id = w.work_type_id
      LEFT JOIN edition e ON e.work_id = w.id
      LEFT JOIN source s ON s.edition_id = e.id
      LEFT JOIN file_source_detail fsd ON fsd.source_id = s.id
      LEFT JOIN physical_source_detail psd ON psd.source_id = s.id
      LEFT JOIN work_author wa ON wa.work_id = w.id
      LEFT JOIN author a ON a.id = wa.author_id
      LEFT JOIN work_tag wt ON wt.work_id = w.id
      LEFT JOIN tag t ON t.id = wt.tag_id
      LEFT JOIN category cat ON cat.id = w.primary_category_id
      WHERE w.id = ?
      GROUP BY w.id
    `).get(workId) as any;

    if (!row) {
      return null;
    }

    const item = this.mapRowToBookItem(row);
    try {
      const loans = this.getLendingHistory(workId);
      if (loans.length > 0) {
        item.lendingHistory = loans;
      }
    } catch {
      // fallback
    }

    return item;
  }

  /**
   * Adds a new Work, Author, Edition, Source, and Extended Details in a single atomic transaction.
   */
  addBook(data: BookItemInput): BookItem {
    if (data.id) {
      const existing = this.db.prepare('SELECT id FROM work WHERE id = ?').get(data.id);
      if (existing) {
        this.updateBook(data);
        return this.getById(data.id) as BookItem;
      }
    }

    const insertTransaction = this.db.transaction(() => {
      const workId = data.id || crypto.randomUUID();
      const authorId = crypto.randomUUID();
      const editionId = crypto.randomUUID();
      const sourceId = crypto.randomUUID();
      const now = new Date().toISOString();
      const primaryCategoryId = data.primaryCategory?.id || data.primaryCategoryId || null;
      const readingStatus = data.readingStatus || 'unread';
      const readingProgress = typeof data.readingProgress === 'number' ? data.readingProgress : 0;

      // Determine work type info
      const workTypeInfo = getWorkTypeInfo(data.workTypeId || data.workType);
      const workTypeId = workTypeInfo.id;

      // Prepare metadata JSON
      const metadataPayload: Record<string, any> = {
        workType: workTypeInfo.key,
        workTypeId,
        doi: data.doi,
        journalName: data.journalName,
        conferenceName: data.conferenceName,
        abstract: data.abstract,
        peerReviewed: data.peerReviewed,
        arxivId: data.arxivId,
        pagesRange: data.pagesRange,
        publicationName: data.publicationName,
        issueDate: data.issueDate,
        speaker: data.speaker,
        hostInstitution: data.hostInstitution,
        courseOrEventTitle: data.courseOrEventTitle,
        durationMinutes: data.durationMinutes,
        recordingUrl: data.recordingUrl,
        periodicalTitle: data.periodicalTitle,
        issueNumber: data.issueNumber,
        volumeNumber: data.volumeNumber,
        publicationSeasonOrMonth: data.publicationSeasonOrMonth,
        issn: data.issn,
        degreeLevel: data.degreeLevel,
        facultyOrDepartment: data.facultyOrDepartment,
        advisor: data.advisor,
        defenseDate: data.defenseDate,
        holdingInstitution: data.holdingInstitution,
        codexOrShelfmark: data.codexOrShelfmark,
        scribe: data.scribe,
        scriptType: data.scriptType,
        folioCount: data.folioCount,
        contributors: data.contributors,
        bookcase: data.bookcase,
        shelfSection: data.shelfSection,
        acquisition: (data as any).acquisition,
        physicalLocation: (data as any).physicalLocation,
      };

      // Strip undefined
      const cleanMetadata: Record<string, any> = {};
      for (const [k, v] of Object.entries(metadataPayload)) {
        if (v !== undefined) {
          cleanMetadata[k] = v;
        }
      }
      const metadataJson = Object.keys(cleanMetadata).length > 0 ? JSON.stringify(cleanMetadata) : null;
      const description = data.abstract || (data as any).description || null;

      // 1. Insert Work
      this.db.prepare(`
        INSERT INTO work (id, work_type_id, title, original_language, description, primary_category_id, reading_status, reading_progress, metadata_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        workId,
        workTypeId,
        data.title || 'بدون عنوان',
        data.language || 'العربية',
        description,
        primaryCategoryId,
        readingStatus,
        readingProgress,
        metadataJson,
        now
      );

      // 2. Main Author & Contributors
      const defaultAuthorName = data.author || data.speaker || data.scribe || data.advisor || 'مؤلف مجهول';
      const existingAuthor = this.db.prepare('SELECT id FROM author WHERE name = ?').get(defaultAuthorName) as { id: string } | undefined;
      const finalAuthorId = existingAuthor ? existingAuthor.id : authorId;

      if (!existingAuthor) {
        this.db.prepare('INSERT INTO author (id, name) VALUES (?, ?)').run(finalAuthorId, defaultAuthorName);
      }

      const defaultRole = data.speaker ? 'speaker' : (data.scribe ? 'scribe' : 'author');
      this.db.prepare('INSERT OR IGNORE INTO work_author (work_id, author_id, role) VALUES (?, ?, ?)').run(
        workId,
        finalAuthorId,
        defaultRole
      );

      // Record any structured contributors
      if (data.contributors && Array.isArray(data.contributors)) {
        const insertAuthor = this.db.prepare('INSERT OR IGNORE INTO author (id, name, bio) VALUES (?, ?, ?)');
        const getAuthor = this.db.prepare('SELECT id FROM author WHERE name = ?');
        const insertWorkAuthor = this.db.prepare('INSERT OR IGNORE INTO work_author (work_id, author_id, role) VALUES (?, ?, ?)');

        for (const contrib of data.contributors) {
          if (contrib.name) {
            insertAuthor.run(crypto.randomUUID(), contrib.name, contrib.bio || null);
            const aRow = getAuthor.get(contrib.name) as { id: string } | undefined;
            if (aRow) {
              insertWorkAuthor.run(workId, aRow.id, contrib.role || 'author');
            }
          }
        }
      }

      // 3. Insert Edition
      const pubYear = typeof data.publicationYear === 'number' 
        ? data.publicationYear 
        : data.publicationYear ? parseInt(String(data.publicationYear), 10) || null : null;

      this.db.prepare(`
        INSERT INTO edition (id, work_id, label, publisher, publication_year, language, isbn)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(editionId, workId, data.edition || null, data.publisher || null, pubYear, data.language || 'العربية', data.isbn || null);

      // 4. Insert Source
      const bookType = data.bookType || (data.filePath ? 'digital' : 'physical');
      this.db.prepare(`
        INSERT INTO source (id, edition_id, source_type, status, added_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(sourceId, editionId, bookType, 'available', now);

      // 5. Insert Source Detail
      if (data.filePath || bookType === 'digital') {
        const fmt = data.digitalFormat || (data.filePath?.toLowerCase().endsWith('.pdf') ? 'PDF' : 'PDF');
        this.db.prepare(`
          INSERT INTO file_source_detail (source_id, file_path, file_format, is_managed)
          VALUES (?, ?, ?, ?)
        `).run(sourceId, data.filePath || null, fmt, 0);
      }

      if (bookType === 'physical' || data.shelf || data.room || data.bookcase || data.shelfSection || data.condition || data.purchaseDate || data.price) {
        const priceNum = data.price ? parseFloat(data.price) || null : null;
        this.db.prepare(`
          INSERT INTO physical_source_detail (source_id, shelf, room, bookcase, shelf_section, condition, purchase_date, price)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          sourceId,
          data.shelf || null,
          data.room || null,
          data.bookcase || null,
          data.shelfSection || null,
          data.condition || null,
          data.purchaseDate || null,
          priceNum
        );
      }

      // 6. Insert Categories
      if (data.categories && data.categories.length > 0) {
        const insertTag = this.db.prepare('INSERT OR IGNORE INTO tag (id, name, category, origin) VALUES (?, ?, ?, ?)');
        const getTag = this.db.prepare('SELECT id FROM tag WHERE name = ? AND category = ?');
        const insertWorkTag = this.db.prepare('INSERT OR IGNORE INTO work_tag (work_id, tag_id) VALUES (?, ?)');
        
        for (const catName of data.categories) {
          insertTag.run(crypto.randomUUID(), catName, 'subject', 'manual');
          const tagRow = getTag.get(catName, 'subject') as { id: string } | undefined;
          if (tagRow) {
            insertWorkTag.run(workId, tagRow.id);
          }
        }
      }

      // 7. Insert Lending Records if present
      if (data.lendingHistory && Array.isArray(data.lendingHistory)) {
        for (const loan of data.lendingHistory) {
          if (loan.borrowerName) {
            this.recordLoan(workId, loan);
          }
        }
      }

      return this.getById(workId)!;
    });

    return insertTransaction();
  }

  /**
   * Updates an existing Work, Author, Edition, and Extended Details atomically.
   */
  updateBook(data: BookItemInput): BookItemInput {
    const updateTransaction = this.db.transaction(() => {
      const primaryCategoryId = data.primaryCategory?.id || data.primaryCategoryId || null;
      const readingStatus = data.readingStatus || 'unread';
      const readingProgress = typeof data.readingProgress === 'number' ? data.readingProgress : 0;

      // Existing work to preserve or merge metadata
      const existingWork = this.db.prepare('SELECT work_type_id, metadata_json, description FROM work WHERE id = ?').get(data.id) as { work_type_id: string; metadata_json?: string; description?: string } | undefined;
      
      let existingMeta: Record<string, any> = {};
      if (existingWork?.metadata_json) {
        try {
          existingMeta = JSON.parse(existingWork.metadata_json);
        } catch {}
      }

      const workTypeKey = (data.workTypeId || data.workType)
        ? getWorkTypeInfo(data.workTypeId || data.workType).key
        : (WORK_TYPE_ID_MAP[existingWork?.work_type_id || ''] || 'book');
      const workTypeId = WORK_TYPES[workTypeKey]?.id || existingWork?.work_type_id || 'wt-book';

      const updatePayload: Record<string, any> = {
        workType: workTypeKey,
        workTypeId,
        doi: data.doi,
        journalName: data.journalName,
        conferenceName: data.conferenceName,
        abstract: data.abstract,
        peerReviewed: data.peerReviewed,
        arxivId: data.arxivId,
        pagesRange: data.pagesRange,
        publicationName: data.publicationName,
        issueDate: data.issueDate,
        speaker: data.speaker,
        hostInstitution: data.hostInstitution,
        courseOrEventTitle: data.courseOrEventTitle,
        durationMinutes: data.durationMinutes,
        recordingUrl: data.recordingUrl,
        periodicalTitle: data.periodicalTitle,
        issueNumber: data.issueNumber,
        volumeNumber: data.volumeNumber,
        publicationSeasonOrMonth: data.publicationSeasonOrMonth,
        issn: data.issn,
        degreeLevel: data.degreeLevel,
        facultyOrDepartment: data.facultyOrDepartment,
        advisor: data.advisor,
        defenseDate: data.defenseDate,
        holdingInstitution: data.holdingInstitution,
        codexOrShelfmark: data.codexOrShelfmark,
        scribe: data.scribe,
        scriptType: data.scriptType,
        folioCount: data.folioCount,
        contributors: data.contributors,
        bookcase: data.bookcase,
        shelfSection: data.shelfSection,
        acquisition: (data as any).acquisition,
        physicalLocation: (data as any).physicalLocation,
      };

      for (const [k, v] of Object.entries(updatePayload)) {
        if (v !== undefined) {
          existingMeta[k] = v;
        }
      }

      const metadataJson = Object.keys(existingMeta).length > 0 ? JSON.stringify(existingMeta) : null;
      const description = data.abstract || (data as any).description || existingWork?.description || null;

      // 1. Update Work
      this.db.prepare(`
        UPDATE work 
        SET work_type_id = ?, title = ?, description = ?, original_language = ?, primary_category_id = ?, reading_status = ?, reading_progress = ?, metadata_json = ?
        WHERE id = ?
      `).run(
        workTypeId,
        data.title || 'بدون عنوان',
        description,
        data.language || 'العربية',
        primaryCategoryId,
        readingStatus,
        readingProgress,
        metadataJson,
        data.id
      );

      // 2. Author & Contributors
      if (data.author || data.speaker || data.scribe || data.contributors) {
        this.db.prepare('DELETE FROM work_author WHERE work_id = ?').run(data.id);
        
        const mainAuthorName = data.author || data.speaker || data.scribe || 'مؤلف مجهول';
        const existingAuthor = this.db.prepare('SELECT id FROM author WHERE name = ?').get(mainAuthorName) as { id: string } | undefined;
        const finalAuthorId = existingAuthor ? existingAuthor.id : crypto.randomUUID();
        if (!existingAuthor) {
          this.db.prepare('INSERT INTO author (id, name) VALUES (?, ?)').run(finalAuthorId, mainAuthorName);
        }
        this.db.prepare('INSERT OR IGNORE INTO work_author (work_id, author_id, role) VALUES (?, ?, ?)').run(
          data.id,
          finalAuthorId,
          data.speaker ? 'speaker' : (data.scribe ? 'scribe' : 'author')
        );

        if (data.contributors && Array.isArray(data.contributors)) {
          const insertAuthor = this.db.prepare('INSERT OR IGNORE INTO author (id, name, bio) VALUES (?, ?, ?)');
          const getAuthor = this.db.prepare('SELECT id FROM author WHERE name = ?');
          const insertWorkAuthor = this.db.prepare('INSERT OR IGNORE INTO work_author (work_id, author_id, role) VALUES (?, ?, ?)');

          for (const contrib of data.contributors) {
            if (contrib.name) {
              insertAuthor.run(crypto.randomUUID(), contrib.name, contrib.bio || null);
              const aRow = getAuthor.get(contrib.name) as { id: string } | undefined;
              if (aRow) {
                insertWorkAuthor.run(data.id, aRow.id, contrib.role || 'author');
              }
            }
          }
        }
      }

      // 3. Edition & Sources
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
            const fsd = this.db.prepare('SELECT source_id FROM file_source_detail WHERE source_id = ?').get(source.id);
            if (fsd) {
              this.db.prepare('UPDATE file_source_detail SET file_path = ?, file_format = ? WHERE source_id = ?').run(data.filePath || null, fmt, source.id);
            } else {
              this.db.prepare('INSERT INTO file_source_detail (source_id, file_path, file_format, is_managed) VALUES (?, ?, ?, ?)').run(source.id, data.filePath || null, fmt, 0);
            }
          }

          if (bookType === 'physical' || data.shelf || data.room || data.bookcase || data.shelfSection || data.condition || data.purchaseDate || data.price) {
            const priceNum = data.price ? parseFloat(data.price) || null : null;
            const psd = this.db.prepare('SELECT source_id FROM physical_source_detail WHERE source_id = ?').get(source.id);
            if (psd) {
              this.db.prepare(`
                UPDATE physical_source_detail 
                SET shelf = ?, room = ?, bookcase = ?, shelf_section = ?, condition = ?, purchase_date = ?, price = ?
                WHERE source_id = ?
              `).run(
                data.shelf || null,
                data.room || null,
                data.bookcase || null,
                data.shelfSection || null,
                data.condition || null,
                data.purchaseDate || null,
                priceNum,
                source.id
              );
            } else {
              this.db.prepare(`
                INSERT INTO physical_source_detail (source_id, shelf, room, bookcase, shelf_section, condition, purchase_date, price)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              `).run(
                source.id,
                data.shelf || null,
                data.room || null,
                data.bookcase || null,
                data.shelfSection || null,
                data.condition || null,
                data.purchaseDate || null,
                priceNum
              );
            }
          }
        }
      }

      // 4. Update Lending Records if passed
      if (data.lendingHistory && Array.isArray(data.lendingHistory)) {
        for (const loan of data.lendingHistory) {
          if (loan.borrowerName) {
            const existing = this.db.prepare('SELECT id FROM lending_record WHERE id = ?').get(loan.id);
            if (!existing) {
              this.recordLoan(data.id!, loan);
            } else {
              this.db.prepare(`
                UPDATE lending_record 
                SET borrower_name = ?, borrower_contact = ?, borrow_date = ?, expected_return_date = ?, actual_return_date = ?, is_returned = ?, condition_return = ?, notes = ?
                WHERE id = ?
              `).run(
                loan.borrowerName,
                (loan as any).borrowerContact || null,
                loan.borrowDate,
                loan.expectedReturnDate || null,
                loan.actualReturnDate || null,
                loan.isReturned ? 1 : 0,
                (loan as any).conditionOnReturn || null,
                loan.notes || null,
                loan.id
              );
            }
          }
        }
      }

      return data;
    });

    return updateTransaction();
  }

  /**
   * Updates reading status and progress directly for a book.
   */
  updateReadingStatus(workId: string, status: import('../../../shared/types/work').ReadingStatus, progress?: number): boolean {
    const calcProgress = typeof progress === 'number'
      ? progress
      : (status === 'completed' ? 100 : (status === 'unread' ? 0 : 50));

    const stmt = this.db.prepare('UPDATE work SET reading_status = ?, reading_progress = ? WHERE id = ?');
    const result = stmt.run(status, calcProgress, workId);
    return result.changes > 0;
  }

  /**
   * Deletes a Work by ID (cascades to edition, source, details, etc.).
   */
  deleteBook(workId: string): boolean {
    const stmt = this.db.prepare('DELETE FROM work WHERE id = ?');
    const result = stmt.run(workId);
    return result.changes > 0;
  }

  // ==========================================================================
  // LENDING REPOSITORY METHODS (Task 4.4)
  // ==========================================================================

  /**
   * Records a new loan for a work and updates physical source lending_status.
   */
  recordLoan(workId: string, loanData: Partial<LendingRecord>): LendingRecord {
    const loanId = loanData.id || crypto.randomUUID();
    const now = new Date().toISOString();
    const today = now.split('T')[0];
    const borrowDate = loanData.borrowDate || today;
    const expectedReturnDate = loanData.expectedReturnDate || null;
    const isReturned = loanData.isReturned ? 1 : 0;
    const status = isReturned ? 'returned' : (expectedReturnDate && expectedReturnDate < today ? 'overdue' : 'active');

    this.db.prepare(`
      INSERT INTO lending_record (
        id, work_id, borrower_name, borrower_contact, borrow_date, expected_return_date, actual_return_date, is_returned, status, condition_out, condition_return, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      loanId,
      workId,
      loanData.borrowerName || 'مستعير',
      (loanData as any).borrowerContact || null,
      borrowDate,
      expectedReturnDate,
      loanData.actualReturnDate || null,
      isReturned,
      status,
      (loanData as any).conditionOut || null,
      loanData.conditionOnReturn || null,
      loanData.notes || null,
      now
    );

    // Update physical_source_detail lending_status to 'loaned' if loan is active
    if (!isReturned) {
      this.db.prepare(`
        UPDATE physical_source_detail 
        SET lending_status = 'loaned'
        WHERE source_id IN (
          SELECT s.id FROM source s
          JOIN edition e ON e.id = s.edition_id
          WHERE e.work_id = ?
        )
      `).run(workId);
    }

    return {
      id: loanId,
      borrowerName: loanData.borrowerName || 'مستعير',
      borrowerContact: (loanData as any).borrowerContact,
      borrowDate,
      expectedReturnDate: expectedReturnDate || 'غير محدد',
      actualReturnDate: loanData.actualReturnDate,
      isReturned: Boolean(isReturned),
      conditionOnReturn: loanData.conditionOnReturn,
      notes: loanData.notes,
    };
  }

  /**
   * Marks a loan as returned and restores physical holding availability if no other active loans exist.
   */
  returnLoan(loanId: string, returnDate?: string, conditionOnReturn?: string): LendingRecord {
    const today = new Date().toISOString().split('T')[0];
    const actualReturn = returnDate || today;

    const existing = this.db.prepare('SELECT work_id, borrower_name, borrow_date, expected_return_date FROM lending_record WHERE id = ?').get(loanId) as any;
    if (!existing) {
      throw new Error(`Lending record with ID ${loanId} not found`);
    }

    this.db.prepare(`
      UPDATE lending_record
      SET is_returned = 1, actual_return_date = ?, status = 'returned', condition_return = ?
      WHERE id = ?
    `).run(actualReturn, conditionOnReturn || null, loanId);

    // Check if there are other active loans for this work
    const activeCount = this.db.prepare(`
      SELECT COUNT(*) as count FROM lending_record WHERE work_id = ? AND is_returned = 0
    `).get(existing.work_id) as { count: number };

    if (activeCount.count === 0) {
      this.db.prepare(`
        UPDATE physical_source_detail 
        SET lending_status = 'available'
        WHERE source_id IN (
          SELECT s.id FROM source s
          JOIN edition e ON e.id = s.edition_id
          WHERE e.work_id = ?
        )
      `).run(existing.work_id);
    }

    return {
      id: loanId,
      borrowerName: existing.borrower_name,
      borrowDate: existing.borrow_date,
      expectedReturnDate: existing.expected_return_date || 'غير محدد',
      actualReturnDate: actualReturn,
      isReturned: true,
      conditionOnReturn,
    };
  }

  /**
   * Retrieves all lending records for a specific work.
   */
  getLendingHistory(workId: string): LendingRecord[] {
    const rows = this.db.prepare(`
      SELECT 
        id,
        borrower_name as borrowerName,
        borrower_contact as borrowerContact,
        borrow_date as borrowDate,
        expected_return_date as expectedReturnDate,
        actual_return_date as actualReturnDate,
        is_returned as isReturned,
        status,
        condition_return as conditionOnReturn,
        notes
      FROM lending_record
      WHERE work_id = ?
      ORDER BY borrow_date DESC, created_at DESC
    `).all(workId) as any[];

    const today = new Date().toISOString().split('T')[0];
    return rows.map((r) => {
      const isRet = Boolean(r.isReturned);
      let calculatedStatus: 'active' | 'returned' | 'overdue' = 'active';
      if (isRet) {
        calculatedStatus = 'returned';
      } else if (r.expectedReturnDate && r.expectedReturnDate < today) {
        calculatedStatus = 'overdue';
      }
      return {
        id: r.id,
        borrowerName: r.borrowerName,
        borrowerContact: r.borrowerContact || undefined,
        borrowDate: r.borrowDate,
        expectedReturnDate: r.expectedReturnDate || 'غير محدد',
        actualReturnDate: r.actualReturnDate || undefined,
        isReturned: isRet,
        conditionOnReturn: r.conditionOnReturn || undefined,
        notes: r.notes || undefined,
        status: calculatedStatus,
      };
    });
  }

  /**
   * Retrieves all active and overdue loans across the entire library.
   */
  getActiveLoans(): Array<LendingRecord & { workTitle: string; workId: string }> {
    const rows = this.db.prepare(`
      SELECT 
        lr.id,
        lr.work_id as workId,
        w.title as workTitle,
        lr.borrower_name as borrowerName,
        lr.borrower_contact as borrowerContact,
        lr.borrow_date as borrowDate,
        lr.expected_return_date as expectedReturnDate,
        lr.is_returned as isReturned,
        lr.status,
        lr.notes
      FROM lending_record lr
      JOIN work w ON w.id = lr.work_id
      WHERE lr.is_returned = 0
      ORDER BY lr.expected_return_date ASC
    `).all() as any[];

    const today = new Date().toISOString().split('T')[0];
    return rows.map((r) => ({
      id: r.id,
      workId: r.workId,
      workTitle: r.workTitle,
      borrowerName: r.borrowerName,
      borrowerContact: r.borrowerContact || undefined,
      borrowDate: r.borrowDate,
      expectedReturnDate: r.expectedReturnDate || 'غير محدد',
      isReturned: false,
      notes: r.notes || undefined,
      status: (r.expectedReturnDate && r.expectedReturnDate < today) ? 'overdue' : 'active',
    }));
  }
}

// Backwards-compatible aliases and type exports
export { SqliteWorkRepository as WorkRepository };
export type { BookItemInput };
