import crypto from 'node:crypto';
import fs from 'fs';
import path from 'path';
import type { Database } from 'better-sqlite3';
import type { IWorkRepository, BookItem, BookItemInput, WorkQueryOptions, PaginatedWorksResult, ReadingStatus } from '../../../shared/types/repository';
import {
  WORK_TYPES,
  WORK_TYPE_ID_MAP,
  getWorkTypeInfo,
  type WorkTypeKey,
  type Contributor,
  type LendingRecord
} from '../../../shared/types/metadata';
import type {
  FileHealthInfo,
  StorageHealthSummary,
  FileStorageStatus,
} from '../../../shared/types/digital-file';
import type { DigitalFormat, MetadataProvenance } from '../../../shared/types/work';
import { bookVolumeIssue } from '../../../shared/book-volumes';

type WorkRow = Omit<Partial<BookItem>, 'categories' | 'readingProgress'> & Pick<BookItem, 'id' | 'title'> & {
  metadataJson?: string; categories?: string; dbTags?: string; readingProgress?: number | string;
  authorName?: string; workTypeId?: string; sourceType?: BookItem['bookType']; fileSizeBytes?: number;
  primaryCategoryId?: string; pcNameAr?: string; pcNameEn?: string;
};
type LoanRow = Omit<LendingRecord, 'isReturned'> & { isReturned: number; workId: string; workTitle: string };

export class SqliteWorkRepository implements IWorkRepository {
  constructor(private db: Database) {}

  private formatFileSize(bytes: number): string {
    if (!bytes || bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }

  private mapRowToBookItem(r: WorkRow): BookItem {
    let meta: Partial<BookItem> = {};
    if (r.metadataJson) {
      try {
        meta = JSON.parse(r.metadataJson);
      } catch {
        meta = {};
      }
    }

    const workTypeKey: WorkTypeKey = (r.workTypeId && WORK_TYPE_ID_MAP[r.workTypeId])
      || (meta.workType && meta.workType in WORK_TYPES ? meta.workType as WorkTypeKey : undefined)
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
      author: r.author || meta.speaker || meta.scribe || meta.advisor || (/[\u0600-\u06FF]/.test(r.title || '') ? 'غير معروف' : 'Unknown Author'),
      edition: r.edition || meta.edition || undefined,
      editionRawMatch: meta.editionRawMatch || undefined,
      editionSource: meta.editionSource || undefined,
      editionConfidence: meta.editionConfidence || undefined,
      publisher: r.publisher || meta.publisher || undefined,
      publicationYear: r.publicationYear !== undefined && r.publicationYear !== null
        ? r.publicationYear
        : (meta.publicationYear || undefined),
      isbn: r.isbn || meta.isbn || undefined,
      pagesCount: meta.pagesCount !== undefined && meta.pagesCount !== null ? Number(meta.pagesCount) : undefined,
      coverImage: meta.coverImage || undefined,
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
      tags: r.dbTags ? Array.from(new Set([...(meta.tags || []), ...r.dbTags.split(',')])) : (meta.tags || []),
      readingStatus: r.readingStatus || 'unread',
      readingProgress: typeof r.readingProgress === 'number' ? r.readingProgress : (r.readingProgress ? parseInt(r.readingProgress, 10) : 0),
      lastReadLocation: r.lastReadLocation || undefined,
      createdAt: r.createdAt || undefined,
      lendingHistory: meta.lendingHistory || [],
      condition,
      purchaseDate,
      price: priceStr,
      acquisition,
      bookType: r.sourceType || (r.filePath ? 'digital' : 'physical'),
      digitalFormat: r.digitalFormat || (r.filePath?.toLowerCase().endsWith('.pdf') ? 'PDF' : undefined),
      filePath: r.filePath || undefined,
      fileSize: meta.fileSize || (r.fileSizeBytes ? this.formatFileSize(r.fileSizeBytes) : undefined),
      fileHash: r.fileHash || undefined,
      storageState: r.storageState || (r.filePath ? 'available' : undefined),
      lastVerifiedAt: r.lastVerifiedAt || undefined,
      onlineSource: meta.onlineSource || undefined,
      sourceUrl: meta.sourceUrl || undefined,
      description: r.description || meta.description || meta.abstract || undefined,
      authorBio: r.authorBio || meta.authorBio || undefined,

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
      seriesTitle: meta.seriesTitle || undefined,
      totalVolumes: meta.totalVolumes !== undefined ? Number(meta.totalVolumes) : undefined,
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

      // Metadata Provenance (Geek Details)
      metadataProvenance: meta.metadataProvenance || this.deriveProvenanceFallback(r, meta),
    };
  }

  private deriveProvenanceFallback(r: WorkRow, meta: Partial<BookItem>): MetadataProvenance {
    const cover = meta.coverImage || '';
    const onlineSource = meta.onlineSource || '';
    const isbn = r.isbn || meta.isbn;
    const filePath = r.filePath || '';

    let primaryProvider = 'Manual Entry';
    let method: MetadataProvenance['method'] = 'manual';

    if (cover.includes('books.google.com')) {
      primaryProvider = 'Google Books API';
      method = 'online_api';
    } else if (cover.includes('covers.openlibrary.org')) {
      primaryProvider = 'Open Library API';
      method = 'online_api';
    } else if (cover.includes('archive.org')) {
      primaryProvider = 'Internet Archive API';
      method = 'online_api';
    } else if (onlineSource) {
      primaryProvider = `${onlineSource} Archive`;
      method = 'online_api';
    } else if (filePath) {
      primaryProvider = 'Offline File Extraction';
      method = 'offline_embedded';
    }

    const fieldSources: NonNullable<MetadataProvenance['fieldSources']> = {};
    if (r.title) {
      fieldSources['title'] = {
        source: primaryProvider,
        status: method === 'online_api' ? 'verified' : 'extracted',
        value: r.title,
      };
    }
    if (r.authorName || meta.author) {
      fieldSources['author'] = {
        source: primaryProvider,
        status: method === 'online_api' ? 'verified' : 'extracted',
        value: r.authorName || meta.author,
      };
    }
    if (isbn) {
      fieldSources['isbn'] = {
        source: method === 'offline_embedded' ? 'Embedded Barcode / Stream Scan' : primaryProvider,
        status: 'verified',
        value: isbn,
      };
    }
    if (meta.pagesCount || r.pagesCount) {
      fieldSources['pagesCount'] = {
        source: filePath.toLowerCase().endsWith('.epub') ? 'EPUB Layout Standard (ADE)' : 'Document Stream',
        status: 'calculated',
        value: meta.pagesCount || r.pagesCount,
      };
    }
    if (cover) {
      fieldSources['coverImage'] = {
        source: primaryProvider,
        status: 'verified',
        value: cover,
      };
    }
    if (r.publisher || meta.publisher) {
      fieldSources['publisher'] = {
        source: primaryProvider,
        status: 'extracted',
        value: r.publisher || meta.publisher,
      };
    }
    if (r.edition || meta.edition) {
      const edVal = r.edition || meta.edition;
      const edRaw = meta.editionRawMatch;
      const edSrc = meta.editionSource;
      fieldSources['edition'] = {
        source: edRaw ? edRaw : (edSrc ? `Tier: ${edSrc}` : primaryProvider),
        status: 'extracted',
        value: edVal,
        confidence: meta.editionConfidence || 0.85,
        rawMatch: edRaw,
      };
    }

    const auditTrace: string[] = [
      `[Provenance Audit] Initialized diagnostic record for book "${r.title || 'Untitled'}"`,
      `[Target File] ${filePath ? `Linked storage: ${filePath}` : 'Physical or non-file material'}`,
      `[Attribution] Primary bibliographic source attributed to ${primaryProvider}`,
      (r.edition || meta.edition)
        ? (meta.editionRawMatch
            ? `[Edition Engine] ${meta.editionRawMatch} -> "${r.edition || meta.edition}"`
            : `[Edition Engine] Edition registered on record: "${r.edition || meta.edition}"`)
        : `[Edition Engine] No edition registered`,
      `[Identifiers] ${isbn ? `Registered ISBN: ${isbn}` : 'No ISBN registered'}`,
      `[Cover Resolution] ${cover ? `Cover source: ${cover.slice(0, 60)}...` : 'Default placeholder cover'}`,
    ];

    return {
      primaryProvider,
      sourceUrl: meta.sourceUrl || undefined,
      discoveredAt: r.createdAt || new Date().toISOString(),
      method,
      confidence: isbn ? 0.95 : 0.85,
      fieldSources,
      auditTrace,
      rawBibliographic: {
        title: r.title,
        author: r.authorName || meta.author,
        publisher: r.publisher || meta.publisher,
        year: r.publicationYear,
        isbn,
        pages: meta.pagesCount,
        format: r.digitalFormat,
        source: primaryProvider,
        storedMetadata: meta,
      },
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
        w.last_read_location as lastReadLocation,
        w.created_at as createdAt,
        w.metadata_json as metadataJson,
        e.id as editionId,
        e.label as edition,
        e.publisher as publisher,
        e.publication_year as publicationYear,
        e.isbn as isbn,
        fsd.file_path as filePath,
        fsd.file_hash as fileHash,
        fsd.file_format as digitalFormat,
        fsd.file_size_bytes as fileSizeBytes,
        fsd.storage_state as storageState,
        fsd.last_verified_at as lastVerifiedAt,
        s.id as sourceId,
        psd.shelf as shelf,
        psd.room as room,
        psd.bookcase as bookcase,
        psd.shelf_section as shelfSection,
        psd.condition as condition,
        psd.purchase_date as purchaseDate,
        psd.price as price,
        s.source_type as sourceType,
        GROUP_CONCAT(DISTINCT a.name) as author,
        GROUP_CONCAT(DISTINCT a.bio) as authorBio,
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
    `).all() as WorkRow[];

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
      `).all() as LoanRow[];

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

  getDuplicateCandidates(): Pick<BookItem, 'id' | 'title' | 'author'>[] {
    return this.db.prepare(`
      SELECT w.id, w.title, GROUP_CONCAT(DISTINCT a.name) AS author
      FROM work w
      LEFT JOIN work_author wa ON wa.work_id = w.id
      LEFT JOIN author a ON a.id = wa.author_id
      GROUP BY w.id ORDER BY w.created_at DESC
    `).all() as Pick<BookItem, 'id' | 'title' | 'author'>[];
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
        w.last_read_location as lastReadLocation,
        w.created_at as createdAt,
        w.metadata_json as metadataJson,
        e.id as editionId,
        e.label as edition,
        e.publisher as publisher,
        e.publication_year as publicationYear,
        e.isbn as isbn,
        fsd.file_path as filePath,
        fsd.file_hash as fileHash,
        fsd.file_format as digitalFormat,
        fsd.file_size_bytes as fileSizeBytes,
        fsd.storage_state as storageState,
        fsd.last_verified_at as lastVerifiedAt,
        s.id as sourceId,
        psd.shelf as shelf,
        psd.room as room,
        psd.bookcase as bookcase,
        psd.shelf_section as shelfSection,
        psd.condition as condition,
        psd.purchase_date as purchaseDate,
        psd.price as price,
        s.source_type as sourceType,
        GROUP_CONCAT(DISTINCT a.name) as author,
        GROUP_CONCAT(DISTINCT a.bio) as authorBio,
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
    `).get(workId) as WorkRow | undefined;

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
    if (getWorkTypeInfo(data.workTypeId || data.workType).key === 'book' && bookVolumeIssue(data)) throw new Error('invalid-volume-metadata');
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
      const metadataPayload: Record<string, unknown> = {
        workType: workTypeInfo.key,
        workTypeId,
        coverImage: data.coverImage,
        pagesCount: data.pagesCount !== undefined && data.pagesCount !== null ? Number(data.pagesCount) : undefined,
        edition: data.edition,
        description: data.description,
        authorBio: data.authorBio,
        fileSize: data.fileSize,
        tags: data.tags,
        categories: data.categories,
        onlineSource: data.onlineSource,
        sourceUrl: data.sourceUrl,
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
        volumeNumber: data.volumeNumber !== undefined && data.volumeNumber !== null && String(data.volumeNumber).trim() !== '' ? data.volumeNumber : undefined,
        seriesTitle: data.seriesTitle !== undefined && data.seriesTitle !== null && String(data.seriesTitle).trim() !== '' ? data.seriesTitle : undefined,
        totalVolumes: data.totalVolumes !== undefined && data.totalVolumes !== null && String(data.totalVolumes) !== '' && !Number.isNaN(Number(data.totalVolumes)) ? Number(data.totalVolumes) : undefined,
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
        acquisition: (data).acquisition,
        physicalLocation: (data).physicalLocation,
        metadataProvenance: (data).metadataProvenance,
        editionRawMatch: (data).editionRawMatch,
        editionSource: (data).editionSource,
        editionConfidence: (data).editionConfidence,
      };

      // Strip undefined
      const cleanMetadata: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(metadataPayload)) {
        if (v !== undefined) {
          cleanMetadata[k] = v;
        }
      }
      const metadataJson = Object.keys(cleanMetadata).length > 0 ? JSON.stringify(cleanMetadata) : null;
      const description = data.description || data.abstract || (data).description || null;

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
      const isArabic = /[\u0600-\u06FF]/.test(data.title || '');
      const defaultAuthorName = data.author || data.speaker || data.scribe || data.advisor || (isArabic ? 'غير معروف' : 'Unknown Author');
      const existingAuthor = this.db.prepare('SELECT id FROM author WHERE name = ?').get(defaultAuthorName) as { id: string } | undefined;
      const finalAuthorId = existingAuthor ? existingAuthor.id : authorId;

      if (!existingAuthor) {
        this.db.prepare('INSERT INTO author (id, name, bio) VALUES (?, ?, ?)').run(finalAuthorId, defaultAuthorName, data.authorBio || null);
      } else if (data.authorBio) {
        this.db.prepare('UPDATE author SET bio = ? WHERE id = ?').run(data.authorBio, finalAuthorId);
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
          INSERT INTO file_source_detail (source_id, file_path, file_hash, file_format, is_managed)
          VALUES (?, ?, ?, ?, ?)
        `).run(sourceId, data.filePath || null, data.fileHash || null, fmt, 0);
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
      
      let existingMeta: Partial<BookItem> & Record<string, unknown> = {};
      if (existingWork?.metadata_json) {
        try {
          existingMeta = JSON.parse(existingWork.metadata_json);
        } catch {}
      }

      const workTypeKey = (data.workTypeId || data.workType)
        ? getWorkTypeInfo(data.workTypeId || data.workType).key
        : (WORK_TYPE_ID_MAP[existingWork?.work_type_id || ''] || 'book');
      const workTypeId = WORK_TYPES[workTypeKey]?.id || existingWork?.work_type_id || 'wt-book';

      const updatePayload: Record<string, unknown> = {
        workType: workTypeKey,
        workTypeId,
        coverImage: data.coverImage,
        pagesCount: data.pagesCount !== undefined ? (data.pagesCount !== null ? Number(data.pagesCount) : null) : undefined,
        edition: data.edition !== undefined ? data.edition : undefined,
        description: data.description,
        authorBio: data.authorBio,
        fileSize: data.fileSize,
        tags: data.tags,
        categories: data.categories,
        onlineSource: data.onlineSource,
        sourceUrl: data.sourceUrl,
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
        volumeNumber: data.volumeNumber !== undefined && data.volumeNumber !== null && String(data.volumeNumber).trim() !== '' ? data.volumeNumber : undefined,
        seriesTitle: data.seriesTitle !== undefined && data.seriesTitle !== null && String(data.seriesTitle).trim() !== '' ? data.seriesTitle : undefined,
        totalVolumes: data.totalVolumes !== undefined && data.totalVolumes !== null && String(data.totalVolumes) !== '' && !Number.isNaN(Number(data.totalVolumes)) ? Number(data.totalVolumes) : undefined,
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
        acquisition: (data).acquisition,
        physicalLocation: (data).physicalLocation,
        metadataProvenance: (data).metadataProvenance,
        editionRawMatch: (data).editionRawMatch,
        editionSource: (data).editionSource,
        editionConfidence: (data).editionConfidence,
      };

      for (const [k, v] of Object.entries(updatePayload)) {
        if (v !== undefined) {
          existingMeta[k] = v;
        }
      }

      if (Object.prototype.hasOwnProperty.call(data, 'totalVolumes') && (data.totalVolumes === undefined || data.totalVolumes === null || String(data.totalVolumes) === '')) delete existingMeta.totalVolumes;
      if (Object.prototype.hasOwnProperty.call(data, 'volumeNumber') && (data.volumeNumber === undefined || data.volumeNumber === null || String(data.volumeNumber).trim() === '')) delete existingMeta.volumeNumber;
      if (Object.prototype.hasOwnProperty.call(data, 'seriesTitle') && (data.seriesTitle === undefined || data.seriesTitle === null || String(data.seriesTitle).trim() === '')) delete existingMeta.seriesTitle;
      if (workTypeKey === 'book' && bookVolumeIssue(existingMeta)) throw new Error('invalid-volume-metadata');

      const metadataJson = Object.keys(existingMeta).length > 0 ? JSON.stringify(existingMeta) : null;
      const description = data.description !== undefined ? data.description : (data.abstract || (data).description || existingWork?.description || null);

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
        
        const isArabic = /[\u0600-\u06FF]/.test(data.title || '');
        const mainAuthorName = data.author || data.speaker || data.scribe || (isArabic ? 'غير معروف' : 'Unknown Author');
        const existingAuthor = this.db.prepare('SELECT id FROM author WHERE name = ?').get(mainAuthorName) as { id: string } | undefined;
        const finalAuthorId = existingAuthor ? existingAuthor.id : crypto.randomUUID();
        if (!existingAuthor) {
          this.db.prepare('INSERT INTO author (id, name, bio) VALUES (?, ?, ?)').run(finalAuthorId, mainAuthorName, data.authorBio || null);
        } else if (data.authorBio) {
          this.db.prepare('UPDATE author SET bio = ? WHERE id = ?').run(data.authorBio, finalAuthorId);
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
      } else if (data.authorBio) {
        const workAuthorRow = this.db.prepare('SELECT author_id FROM work_author WHERE work_id = ? LIMIT 1').get(data.id) as { author_id: string } | undefined;
        if (workAuthorRow?.author_id) {
          this.db.prepare('UPDATE author SET bio = ? WHERE id = ?').run(data.authorBio, workAuthorRow.author_id);
        }
      }

      // 3. Edition & Sources
      const pubYear = typeof data.publicationYear === 'number' 
        ? data.publicationYear 
        : data.publicationYear ? parseInt(String(data.publicationYear), 10) || null : null;

      const edition = this.db.prepare('SELECT id FROM edition WHERE work_id = ? LIMIT 1').get(data.id) as { id: string } | undefined;
      let editionId = edition?.id;
      if (!editionId) {
        editionId = crypto.randomUUID();
        this.db.prepare(`
          INSERT INTO edition (id, work_id, label, publisher, publication_year, language, isbn)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(editionId, data.id, data.edition || null, data.publisher || null, pubYear, data.language || 'العربية', data.isbn || null);
      } else {
        this.db.prepare(`
          UPDATE edition 
          SET label = ?, publisher = ?, publication_year = ?, language = ?, isbn = ?
          WHERE id = ?
        `).run(data.edition || null, data.publisher || null, pubYear, data.language || 'العربية', data.isbn || null, editionId);
      }

      let source = this.db.prepare('SELECT id FROM source WHERE edition_id = ? LIMIT 1').get(editionId) as { id: string } | undefined;
      if (!source) {
        const sourceId = crypto.randomUUID();
        const bookType = data.bookType || (data.filePath ? 'digital' : 'physical');
        this.db.prepare('INSERT INTO source (id, edition_id, source_type) VALUES (?, ?, ?)').run(sourceId, editionId, bookType);
        source = { id: sourceId };
      }
      if (source) {
        const bookType = data.bookType || (data.filePath ? 'digital' : 'physical');
        this.db.prepare('UPDATE source SET source_type = ? WHERE id = ?').run(bookType, source.id);
          
          if (data.filePath || bookType === 'digital') {
            const fmt = data.digitalFormat || (data.filePath?.toLowerCase().endsWith('.pdf') ? 'PDF' : 'PDF');
            const fsd = this.db.prepare('SELECT source_id FROM file_source_detail WHERE source_id = ?').get(source.id);
            if (fsd) {
              this.db.prepare('UPDATE file_source_detail SET file_path = ?, file_hash = COALESCE(?, file_hash), file_format = ? WHERE source_id = ?').run(data.filePath || null, data.fileHash || null, fmt, source.id);
            } else {
              this.db.prepare('INSERT INTO file_source_detail (source_id, file_path, file_hash, file_format, is_managed) VALUES (?, ?, ?, ?, ?)').run(source.id, data.filePath || null, data.fileHash || null, fmt, 0);
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
                (loan).borrowerContact || null,
                loan.borrowDate,
                loan.expectedReturnDate || null,
                loan.actualReturnDate || null,
                loan.isReturned ? 1 : 0,
                (loan).conditionOnReturn || null,
                loan.notes || null,
                loan.id
              );
            }
          }
        }
      }

      return (this.getById(data.id!) as BookItem) || data;
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
      (loanData).borrowerContact || null,
      borrowDate,
      expectedReturnDate,
      loanData.actualReturnDate || null,
      isReturned,
      status,
      (loanData).conditionOut || null,
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
      borrowerContact: (loanData).borrowerContact,
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

    const existing = this.db.prepare('SELECT work_id, borrower_name, borrow_date, expected_return_date FROM lending_record WHERE id = ?').get(loanId) as { work_id: string; borrower_name: string; borrow_date: string; expected_return_date?: string } | undefined;
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
    `).all(workId) as LoanRow[];

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
    `).all() as LoanRow[];

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

  /**
   * Finds a work by its digital file SHA-256 content hash.
   */
  findWorkByFileHash(fileHash: string): BookItem | null {
    if (!fileHash) return null;
    const row = this.db.prepare(`
      SELECT w.id FROM work w
      JOIN edition e ON e.work_id = w.id
      JOIN source s ON s.edition_id = e.id
      JOIN file_source_detail fsd ON fsd.source_id = s.id
      WHERE fsd.file_hash = ?
      LIMIT 1
    `).get(fileHash) as { id: string } | undefined;

    return row ? this.getById(row.id) : null;
  }

  /**
   * Finds a work by its digital file path on disk.
   */
  findWorkByFilePath(filePath: string): BookItem | null {
    if (!filePath) return null;
    const normalized = path.resolve(filePath);
    const row = this.db.prepare(`
      SELECT w.id FROM work w
      JOIN edition e ON e.work_id = w.id
      JOIN source s ON s.edition_id = e.id
      JOIN file_source_detail fsd ON fsd.source_id = s.id
      WHERE fsd.file_path = ? OR fsd.file_path = ?
      LIMIT 1
    `).get(filePath, normalized) as { id: string } | undefined;

    return row ? this.getById(row.id) : null;
  }

  /**
   * Finds a work by normalized ISBN (ISBN-10 or ISBN-13).
   */
  findWorkByIsbn(isbn: string): BookItem | null {
    if (!isbn) return null;
    const cleanIsbn = isbn.replace(/[^0-9xX]/g, '').toUpperCase();
    if (!cleanIsbn) return null;

    const row = this.db.prepare(`
      SELECT w.id FROM work w
      JOIN edition e ON e.work_id = w.id
      WHERE REPLACE(REPLACE(UPPER(e.isbn), '-', ''), ' ', '') = ?
      LIMIT 1
    `).get(cleanIsbn) as { id: string } | undefined;

    return row ? this.getById(row.id) : null;
  }

  /**
   * Verifies the storage health of a digital file associated with a work.
   */
  verifyFileHealth(workId: string): FileHealthInfo | null {
    const work = this.getById(workId);
    if (!work || work.bookType !== 'digital' || !work.filePath) {
      return null;
    }

    const now = new Date().toISOString();
    let exists = false;
    let fileSizeBytes: number | undefined;
    let status: FileStorageStatus = 'missing';

    try {
      if (fs.existsSync(work.filePath)) {
        exists = true;
        const stat = fs.statSync(work.filePath);
        fileSizeBytes = stat.size;
        status = stat.size === 0 ? 'corrupted' : 'available';
      } else {
        exists = false;
        const parsed = path.parse(work.filePath);
        const driveExists = parsed.root ? fs.existsSync(parsed.root) : true;
        status = driveExists ? 'missing' : 'unmounted';
      }
    } catch {
      status = 'missing';
      exists = false;
    }

    try {
      this.db.prepare(`
        UPDATE file_source_detail
        SET storage_state = ?, last_verified_at = ?, file_size_bytes = COALESCE(?, file_size_bytes)
        WHERE source_id IN (
          SELECT s.id FROM source s
          JOIN edition e ON e.id = s.edition_id
          WHERE e.work_id = ?
        )
      `).run(status, now, fileSizeBytes || null, workId);
    } catch {
      // Table column may not exist in legacy schema
    }

    return {
      workId,
      title: work.title,
      filePath: work.filePath,
      format: work.digitalFormat,
      status,
      fileSizeBytes,
      exists,
      lastVerified: now,
    };
  }

  /**
   * Verifies all digital works in the library, returning an aggregated storage health report.
   */
  verifyAllDigitalFiles(): StorageHealthSummary {
    const rows = this.db.prepare(`
      SELECT DISTINCT
        w.id as workId,
        w.title as title,
        fsd.file_path as filePath,
        fsd.file_format as format
      FROM work w
      JOIN edition e ON e.work_id = w.id
      JOIN source s ON s.edition_id = e.id
      JOIN file_source_detail fsd ON fsd.source_id = s.id
      WHERE fsd.file_path IS NOT NULL
    `).all() as Array<{ workId: string; title: string; filePath: string; format?: DigitalFormat }>;

    const items: FileHealthInfo[] = [];
    let availableFiles = 0;
    let missingFiles = 0;
    let unmountedFiles = 0;
    let corruptedFiles = 0;
    const duplicateFiles = 0;
    let totalSizeBytes = 0;
    const formatBreakdown: Record<string, { count: number; totalBytes: number }> = {};

    for (const r of rows) {
      const health = this.verifyFileHealth(r.workId);
      if (health) {
        items.push(health);
        if (health.status === 'available') availableFiles++;
        else if (health.status === 'unmounted') unmountedFiles++;
        else if (health.status === 'corrupted') corruptedFiles++;
        else missingFiles++;

        const size = health.fileSizeBytes || 0;
        if (health.exists) {
          totalSizeBytes += size;
        }

        const fmt = health.format || 'OTHER';
        if (!formatBreakdown[fmt]) {
          formatBreakdown[fmt] = { count: 0, totalBytes: 0 };
        }
        formatBreakdown[fmt].count++;
        if (health.exists) {
          formatBreakdown[fmt].totalBytes += size;
        }
      }
    }

    return {
      totalDigitalWorks: rows.length,
      totalFiles: items.length,
      availableFiles,
      missingFiles,
      unmountedFiles,
      corruptedFiles,
      duplicateFiles,
      totalSizeBytes,
      reclaimableSizeBytes: 0,
      formatBreakdown,
      items,
    };
  }

  /**
   * Adds a new edition and digital file source to an existing work.
   */
  addEditionToWork(
    workId: string,
    data: {
      edition?: string;
      publisher?: string;
      publicationYear?: number | string;
      isbn?: string;
      language?: string;
      filePath?: string;
      fileHash?: string;
      digitalFormat?: DigitalFormat;
      fileSize?: string;
    }
  ): BookItem | null {
    const existing = this.getById(workId);
    if (!existing) return null;

    const editionId = crypto.randomUUID();
    const sourceId = crypto.randomUUID();
    const now = new Date().toISOString();
    const pubYear = typeof data.publicationYear === 'number'
      ? data.publicationYear
      : data.publicationYear ? parseInt(String(data.publicationYear), 10) || null : null;

    const insertTx = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO edition (id, work_id, label, publisher, publication_year, language, isbn)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(editionId, workId, data.edition || null, data.publisher || null, pubYear, data.language || 'العربية', data.isbn || null);

      this.db.prepare(`
        INSERT INTO source (id, edition_id, source_type, status, added_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(sourceId, editionId, 'digital', 'available', now);

      if (data.filePath) {
        const fmt = data.digitalFormat || 'PDF';
        this.db.prepare(`
          INSERT INTO file_source_detail (source_id, file_path, file_hash, file_format, is_managed, storage_state, last_verified_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(sourceId, path.resolve(data.filePath), data.fileHash || null, fmt, 0, 'available', now);
      }
    });

    insertTx();
    return this.getById(workId);
  }

  /**
   * Retrieves paginated works using multi-criteria filtering and SQL sorting.
   */
  getPaginatedWorks(options: WorkQueryOptions = {}): PaginatedWorksResult {
    const page = Math.max(1, Number(options.page) || 1);
    const pageSize = Math.min(1000, Math.max(1, Number(options.pageSize) || 24));
    const offset = (page - 1) * pageSize;

    const whereClauses: string[] = [];
    const params: unknown[] = [];

    // 1. Text Search across Title, Description, Author, Publisher, and ISBN
    if (options.search && options.search.trim()) {
      const term = `%${options.search.trim()}%`;
      whereClauses.push(`(
        w.title LIKE ?
        OR w.description LIKE ?
        OR EXISTS (
          SELECT 1 FROM work_author wa_s
          JOIN author a_s ON a_s.id = wa_s.author_id
          WHERE wa_s.work_id = w.id AND a_s.name LIKE ?
        )
        OR EXISTS (
          SELECT 1 FROM edition e_s
          WHERE e_s.work_id = w.id AND (e_s.publisher LIKE ? OR e_s.isbn LIKE ?)
        )
      )`);
      params.push(term, term, term, term, term);
    }

    // 2. Book Type filter (digital, physical, hybrid)
    if (options.bookType && options.bookType !== 'ALL') {
      if (options.bookType === 'digital') {
        whereClauses.push(`EXISTS (
          SELECT 1 FROM edition e_bt
          JOIN source s_bt ON s_bt.edition_id = e_bt.id
          LEFT JOIN file_source_detail fsd_bt ON fsd_bt.source_id = s_bt.id
          WHERE e_bt.work_id = w.id AND (s_bt.source_type = 'digital' OR fsd_bt.file_path IS NOT NULL)
        )`);
      } else if (options.bookType === 'physical') {
        whereClauses.push(`EXISTS (
          SELECT 1 FROM edition e_bt
          JOIN source s_bt ON s_bt.edition_id = e_bt.id
          LEFT JOIN physical_source_detail psd_bt ON psd_bt.source_id = s_bt.id
          WHERE e_bt.work_id = w.id AND (s_bt.source_type IN ('physical', 'hybrid') OR psd_bt.shelf IS NOT NULL OR psd_bt.room IS NOT NULL)
        )`);
      } else if (options.bookType === 'hybrid') {
        whereClauses.push(`EXISTS (
          SELECT 1 FROM edition e_bt
          JOIN source s_bt ON s_bt.edition_id = e_bt.id
          WHERE e_bt.work_id = w.id AND s_bt.source_type = 'hybrid'
        )`);
      }
    }

    // 3. Reading Status filter
    if (options.readingStatus && options.readingStatus !== 'ALL') {
      whereClauses.push('w.reading_status = ?');
      params.push(options.readingStatus);
    }

    // 4. Digital Format filter
    if (options.digitalFormat && options.digitalFormat !== 'ALL') {
      whereClauses.push(`EXISTS (
        SELECT 1 FROM edition e_df
        JOIN source s_df ON s_df.edition_id = e_df.id
        JOIN file_source_detail fsd_df ON fsd_df.source_id = s_df.id
        WHERE e_df.work_id = w.id AND fsd_df.file_format = ?
      )`);
      params.push(options.digitalFormat);
    }

    // 5. Category filter (primary category and recursive subcategories)
    if (options.categoryId && options.categoryId !== 'ALL') {
      whereClauses.push(`(
        w.primary_category_id = ?
        OR w.primary_category_id IN (
          WITH RECURSIVE subcats AS (
            SELECT id FROM category WHERE id = ?
            UNION ALL
            SELECT c.id FROM category c JOIN subcats sc ON c.parent_id = sc.id
          )
          SELECT id FROM subcats
        )
      )`);
      params.push(options.categoryId, options.categoryId);
    }

    // 6. Tag filter
    if (options.tag && options.tag !== 'ALL') {
      whereClauses.push(`EXISTS (
        SELECT 1 FROM work_tag wt_t
        JOIN tag t_t ON t_t.id = wt_t.tag_id
        WHERE wt_t.work_id = w.id AND t_t.name = ?
      )`);
      params.push(options.tag);
    }

    // 7. Lending Status filter
    if (options.lendingStatus && options.lendingStatus !== 'ALL') {
      if (options.lendingStatus === 'AVAILABLE') {
        whereClauses.push(`NOT EXISTS (
          SELECT 1 FROM lending_record lr_a
          WHERE lr_a.work_id = w.id AND lr_a.is_returned = 0
        )`);
      } else if (options.lendingStatus === 'LENT') {
        whereClauses.push(`EXISTS (
          SELECT 1 FROM lending_record lr_l
          WHERE lr_l.work_id = w.id AND lr_l.is_returned = 0
        )`);
      } else if (options.lendingStatus === 'OVERDUE') {
        whereClauses.push(`EXISTS (
          SELECT 1 FROM lending_record lr_o
          WHERE lr_o.work_id = w.id AND lr_o.is_returned = 0 AND lr_o.expected_return_date IS NOT NULL AND lr_o.expected_return_date < date('now')
        )`);
      }
    }

    // 8. Physical Location filter
    if (options.location && options.location !== 'ALL') {
      whereClauses.push(`EXISTS (
        SELECT 1 FROM edition e_loc
        JOIN source s_loc ON s_loc.edition_id = e_loc.id
        JOIN physical_source_detail psd_loc ON psd_loc.source_id = s_loc.id
        WHERE e_loc.work_id = w.id AND (
          psd_loc.room = ? OR psd_loc.shelf = ? OR psd_loc.bookcase = ? OR psd_loc.shelf_section = ?
        )
      )`);
      params.push(options.location, options.location, options.location, options.location);
    }

    // 9. Storage Health filter
    if (options.storageFilter && options.storageFilter !== 'ALL') {
      if (options.storageFilter === 'HEALTHY') {
        whereClauses.push(`NOT EXISTS (
          SELECT 1 FROM edition e_sf
          JOIN source s_sf ON s_sf.edition_id = e_sf.id
          JOIN file_source_detail fsd_sf ON fsd_sf.source_id = s_sf.id
          WHERE e_sf.work_id = w.id AND fsd_sf.storage_state IN ('missing', 'unmounted', 'corrupted', 'duplicate')
        )`);
      } else if (options.storageFilter === 'ATTENTION') {
        whereClauses.push(`EXISTS (
          SELECT 1 FROM edition e_sf
          JOIN source s_sf ON s_sf.edition_id = e_sf.id
          JOIN file_source_detail fsd_sf ON fsd_sf.source_id = s_sf.id
          WHERE e_sf.work_id = w.id AND fsd_sf.storage_state IN ('missing', 'unmounted', 'corrupted')
        )`);
      } else if (options.storageFilter === 'DUPLICATES') {
        whereClauses.push(`EXISTS (
          SELECT 1 FROM edition e_sf
          JOIN source s_sf ON s_sf.edition_id = e_sf.id
          JOIN file_source_detail fsd_sf ON fsd_sf.source_id = s_sf.id
          WHERE e_sf.work_id = w.id AND fsd_sf.storage_state = 'duplicate'
        )`);
      }
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Fast count query
    const countRow = this.db.prepare(`
      SELECT COUNT(DISTINCT w.id) as total
      FROM work w
      ${whereSql}
    `).get(...params) as { total: number } | undefined;

    const totalCount = countRow?.total || 0;
    const totalPages = Math.ceil(totalCount / pageSize) || 1;

    // Sorting
    const sortField = options.sortBy || 'newest';
    const sortDir = (options.sortDirection?.toLowerCase() === 'asc') ? 'ASC' : 'DESC';

    let orderClause = `w.created_at ${sortDir}`;
    switch (sortField) {
      case 'title':
        orderClause = `w.title COLLATE NOCASE ${sortDir}`;
        break;
      case 'author':
        orderClause = `author COLLATE NOCASE ${sortDir}`;
        break;
      case 'year':
        orderClause = `CASE WHEN e.publication_year IS NULL THEN 1 ELSE 0 END, e.publication_year ${sortDir}`;
        break;
      case 'category':
        orderClause = `cat.name_ar COLLATE NOCASE ${sortDir}`;
        break;
      case 'format':
        orderClause = `fsd.file_format COLLATE NOCASE ${sortDir}`;
        break;
      case 'status':
        orderClause = `CASE w.reading_status WHEN 'reading' THEN 1 WHEN 'unread' THEN 2 WHEN 'completed' THEN 3 WHEN 'paused' THEN 4 WHEN 'abandoned' THEN 5 ELSE 99 END ${sortDir}`;
        break;
      case 'location':
        orderClause = `COALESCE(psd.room, psd.shelf, '') COLLATE NOCASE ${sortDir}`;
        break;
      case 'rating':
      case 'progress':
        orderClause = `w.reading_progress ${sortDir}`;
        break;
      case 'newest':
      default:
        orderClause = `w.created_at ${sortDir}`;
        break;
    }

    const selectSql = `
      SELECT 
        w.id as id,
        w.work_type_id as workTypeId,
        wtype.name as workTypeName,
        w.title as title,
        w.description as description,
        w.original_language as language,
        w.reading_status as readingStatus,
        w.reading_progress as readingProgress,
        w.last_read_location as lastReadLocation,
        w.created_at as createdAt,
        w.metadata_json as metadataJson,
        e.id as editionId,
        e.label as edition,
        e.publisher as publisher,
        e.publication_year as publicationYear,
        e.isbn as isbn,
        fsd.file_path as filePath,
        fsd.file_hash as fileHash,
        fsd.file_format as digitalFormat,
        fsd.file_size_bytes as fileSizeBytes,
        fsd.storage_state as storageState,
        fsd.last_verified_at as lastVerifiedAt,
        s.id as sourceId,
        psd.shelf as shelf,
        psd.room as room,
        psd.bookcase as bookcase,
        psd.shelf_section as shelfSection,
        psd.condition as condition,
        psd.purchase_date as purchaseDate,
        psd.price as price,
        s.source_type as sourceType,
        GROUP_CONCAT(DISTINCT a.name) as author,
        GROUP_CONCAT(DISTINCT a.bio) as authorBio,
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
      ${whereSql}
      GROUP BY w.id
      ORDER BY ${orderClause}
      LIMIT ? OFFSET ?
    `;

    const rows = this.db.prepare(selectSql).all(...params, pageSize, offset) as WorkRow[];
    const items = rows.map((r) => this.mapRowToBookItem(r));

    // Batch load lending history for paged books
    if (items.length > 0) {
      try {
        const workIds = items.map((i) => i.id);
        const placeholders = workIds.map(() => '?').join(',');
        const loans = this.db.prepare(`
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
          WHERE work_id IN (${placeholders})
          ORDER BY borrow_date DESC, created_at DESC
        `).all(...workIds) as LoanRow[];

        const loansByWork = new Map<string, LendingRecord[]>();
        for (const r of loans) {
          const record: LendingRecord = {
            id: r.id,
            borrowerName: r.borrowerName,
            borrowerContact: r.borrowerContact || undefined,
            borrowDate: r.borrowDate,
            expectedReturnDate: r.expectedReturnDate || 'غير محدد',
            actualReturnDate: r.actualReturnDate || undefined,
            isReturned: Boolean(r.isReturned),
            conditionOnReturn: r.conditionOnReturn || undefined,
            notes: r.notes || undefined,
          };
          const list = loansByWork.get(r.workId) || [];
          list.push(record);
          loansByWork.set(r.workId, list);
        }

        for (const item of items) {
          const itemLoans = loansByWork.get(item.id);
          if (itemLoans && itemLoans.length > 0) {
            item.lendingHistory = itemLoans;
          }
        }
      } catch {
        // graceful fallback if lending_record table does not exist
      }
    }

    return {
      items,
      totalCount,
      page,
      pageSize,
      totalPages,
    };
  }

  /**
   * Bulk updates category assignment for multiple works.
   */
  bulkUpdateCategory(workIds: string[], categoryId: string): number {
    if (!workIds || workIds.length === 0) return 0;
    const stmt = this.db.prepare('UPDATE work SET primary_category_id = ? WHERE id = ?');
    const tx = this.db.transaction(() => {
      let count = 0;
      for (const id of workIds) {
        const res = stmt.run(categoryId || null, id);
        count += res.changes;
      }
      return count;
    });
    return tx();
  }

  /**
   * Bulk updates reading status and progress for multiple works.
   */
  bulkUpdateReadingStatus(workIds: string[], status: ReadingStatus, progress?: number): number {
    if (!workIds || workIds.length === 0) return 0;
    const calcProgress = typeof progress === 'number'
      ? progress
      : (status === 'completed' ? 100 : (status === 'unread' ? 0 : 50));
    const stmt = this.db.prepare('UPDATE work SET reading_status = ?, reading_progress = ? WHERE id = ?');
    const tx = this.db.transaction(() => {
      let count = 0;
      for (const id of workIds) {
        const res = stmt.run(status, calcProgress, id);
        count += res.changes;
      }
      return count;
    });
    return tx();
  }

  /**
   * Bulk adds tags to multiple works.
   */
  bulkAddTags(workIds: string[], tags: string[]): number {
    if (!workIds || workIds.length === 0 || !tags || tags.length === 0) return 0;
    const insertTag = this.db.prepare('INSERT OR IGNORE INTO tag (id, name, category, origin) VALUES (?, ?, ?, ?)');
    const getTag = this.db.prepare('SELECT id FROM tag WHERE name = ?');
    const insertWorkTag = this.db.prepare('INSERT OR IGNORE INTO work_tag (work_id, tag_id) VALUES (?, ?)');
    const tx = this.db.transaction(() => {
      let added = 0;
      for (const tag of tags) {
        const trimmed = tag.trim();
        if (!trimmed) continue;
        insertTag.run(crypto.randomUUID(), trimmed, 'subject', 'manual');
        const tagRow = getTag.get(trimmed) as { id: string } | undefined;
        if (tagRow) {
          for (const workId of workIds) {
            const res = insertWorkTag.run(workId, tagRow.id);
            added += res.changes;
          }
        }
      }

      // Also sync tags in metadata_json so both representations stay consistent
      const selectWork = this.db.prepare('SELECT metadata_json FROM work WHERE id = ?');
      const updateWork = this.db.prepare('UPDATE work SET metadata_json = ? WHERE id = ?');
      for (const workId of workIds) {
        const row = selectWork.get(workId) as { metadata_json?: string } | undefined;
        let meta: Partial<BookItem> = {};
        if (row?.metadata_json) {
          try {
            meta = JSON.parse(row.metadata_json);
          } catch {}
        }
        const currentTags: string[] = Array.isArray(meta.tags) ? meta.tags : [];
        for (const tag of tags) {
          const trimmed = tag.trim();
          if (trimmed && !currentTags.includes(trimmed)) {
            currentTags.push(trimmed);
          }
        }
        meta.tags = currentTags;
        updateWork.run(JSON.stringify(meta), workId);
      }

      return added;
    });
    return tx();
  }

  /**
   * Bulk deletes multiple works atomically.
   */
  bulkDelete(workIds: string[]): number {
    if (!workIds || workIds.length === 0) return 0;
    const stmt = this.db.prepare('DELETE FROM work WHERE id = ?');
    const tx = this.db.transaction(() => {
      let deleted = 0;
      for (const id of workIds) {
        const res = stmt.run(id);
        deleted += res.changes;
      }
      return deleted;
    });
    return tx();
  }
}

// Backwards-compatible aliases and type exports
export { SqliteWorkRepository as WorkRepository };
export type { BookItemInput };
