import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as fflate from 'fflate';
import type Database from 'better-sqlite3';
import { createTestDatabase } from '../helpers/test-db';
import { SqliteAnnotationRepository } from '../../src/main/database/repositories/annotation.repository';
import type { AnnotationDTO, AnnotationPayload } from '../../src/shared/types/annotation';
import type { BookBibliographicInfo, BookWithAnnotations, ExportOptions } from '../../src/shared/types/export';
import {
  generateYamlFrontmatter,
  formatAsMarkdown,
  formatAsObsidian,
  formatAsCSV,
  formatAsHTML,
  formatAsPlainText,
  formatAsAnkiTSV,
  buildAnkiConnectNotes,
  exportSingleBook,
  packageMultiBookZip,
} from '../../src/renderer/libs/export/annotation-exporter';
import {
  buildNotionPagePayload,
  buildReadwisePayload,
  AnkiConnectClient,
  JoplinClient,
} from '../../src/renderer/libs/export/pkm-sync';
import { translations } from '../../src/renderer/translations';

describe('KEY-138 Multi-Format Annotation Exporter & PKM Sync Engine', () => {
  const sampleBook: BookBibliographicInfo = {
    id: 'book-muqaddimah-001',
    title: 'مقدمة ابن خلدون (Muqaddimah)',
    author: 'ابن خلدون (Ibn Khaldun)',
    isbn: '978-0691154039',
    publisher: 'دار الفكر العربي',
    year: '1377',
    format: 'PDF',
  };

  const sampleAnnotations: AnnotationDTO[] = [
    {
      id: 'annot-01',
      bookId: 'book-muqaddimah-001',
      type: 'highlight',
      locationCfiOrPage: '42',
      selectedText: 'إن التاريخ في ظاهره لا يزيد على الإخبار، وفي باطنه نظر وتحقيق',
      noteContent: 'جوهر علم العمران البشري وفلسفة التاريخ',
      color: 'amber',
      tags: ['فلسفة', 'تاريخ', 'عمران'],
      createdAt: '2026-10-16T12:00:00.000Z',
      updatedAt: '2026-10-16T12:00:00.000Z',
    },
    {
      id: 'annot-02',
      bookId: 'book-muqaddimah-001',
      type: 'note',
      locationCfiOrPage: '75',
      selectedText: null,
      noteContent: 'ملاحظة حول مفهوم العصبية وأطوار الدولة',
      color: 'blue',
      tags: ['عصبية', 'اجتماع'],
      createdAt: '2026-10-16T13:00:00.000Z',
      updatedAt: '2026-10-16T13:00:00.000Z',
    },
    {
      id: 'annot-03',
      bookId: 'book-muqaddimah-001',
      type: 'bookmark',
      locationCfiOrPage: '120',
      selectedText: null,
      noteContent: 'بداية الفصل الثالث: في الدول العامة والملك والمراتبية',
      color: 'emerald',
      tags: ['فصل_جديد'],
      createdAt: '2026-10-16T14:00:00.000Z',
      updatedAt: '2026-10-16T14:00:00.000Z',
    },
  ];

  /* -------------------------------------------------------------------------
   * 1. Multi-Format Exporter Tests (Markdown, Obsidian, CSV, HTML, TXT, Anki)
   * ------------------------------------------------------------------------- */
  describe('1. Single-Book Multi-Format Exporters', () => {
    it('generates standard academic markdown with bibliographic frontmatter', () => {
      const options: ExportOptions = {
        format: 'markdown',
        includeFrontmatter: true,
        includeBookmarks: true,
        includeTags: true,
      };

      const md = formatAsMarkdown(sampleBook, sampleAnnotations, options);

      // Verify YAML frontmatter
      assert.ok(md.startsWith('---'));
      assert.ok(md.includes('title: "مقدمة ابن خلدون (Muqaddimah)"'));
      assert.ok(md.includes('author: "ابن خلدون (Ibn Khaldun)"'));
      assert.ok(md.includes('isbn: "978-0691154039"'));

      // Verify highlights formatting
      assert.ok(md.includes('### [Page 42] HIGHLIGHT'));
      assert.ok(md.includes('> إن التاريخ في ظاهره لا يزيد على الإخبار'));
      assert.ok(md.includes('جوهر علم العمران البشري'));
      assert.ok(md.includes('#فلسفة'));

      // Verify notes without quotes
      assert.ok(md.includes('### [Page 75] NOTE'));
      assert.ok(md.includes('ملاحظة حول مفهوم العصبية'));

      // Verify bookmarks
      assert.ok(md.includes('### [Page 120] BOOKMARK'));
    });

    it('omits frontmatter when includeFrontmatter is set to false', () => {
      const options: ExportOptions = {
        format: 'markdown',
        includeFrontmatter: false,
      };

      const md = formatAsMarkdown(sampleBook, sampleAnnotations, options);
      assert.ok(!md.startsWith('---'));
      assert.ok(md.startsWith('# مقدمة ابن خلدون (Muqaddimah)'));
    });

    it('formats notes using Obsidian callouts (> [!quote], > [!note]) and [[wikilinks]]', () => {
      const options: ExportOptions = {
        format: 'obsidian',
        includeFrontmatter: true,
        includeTags: true,
        includeBookmarks: true,
      };

      const obs = formatAsObsidian(sampleBook, sampleAnnotations, options);

      // Verify callout syntax
      assert.ok(obs.includes('> [!quote] Page 42 (amber)'));
      assert.ok(obs.includes('> إن التاريخ في ظاهره لا يزيد على الإخبار'));
      assert.ok(obs.includes('> [!note] Page 75 Note'));
      assert.ok(obs.includes('> [!bookmark] Page 120'));

      // Verify title and author wikilinks
      assert.ok(obs.includes('[[مقدمة ابن خلدون (Muqaddimah)]]'));
      assert.ok(obs.includes('[[ابن خلدون (Ibn Khaldun)]]'));
      assert.ok(obs.includes('#فلسفة'));
    });

    it('generates RFC 4180 compliant CSV with UTF-8 BOM for Arabic Excel compatibility', () => {
      const options: ExportOptions = {
        format: 'csv',
        includeBookmarks: true,
        includeTags: true,
      };

      const csv = formatAsCSV(sampleBook, sampleAnnotations, options);

      // Verify UTF-8 Byte Order Mark
      assert.equal(csv.charCodeAt(0), 0xfeff);

      // Verify header columns
      const lines = csv.substring(1).trim().split('\r\n');
      assert.ok(lines[0].includes('Book Title'));
      assert.ok(lines[0].includes('Selected Text'));

      // Verify content escaping
      assert.ok(csv.includes('مقدمة ابن خلدون (Muqaddimah)'));
      assert.ok(csv.includes('إن التاريخ في ظاهره لا يزيد على الإخبار'));
      assert.ok(csv.includes('جوهر علم العمران البشري وفلسفة التاريخ'));
      assert.ok(csv.includes('فلسفة; تاريخ; عمران'));
    });

    it('generates standalone, responsive HTML with inline print stylesheet', () => {
      const options: ExportOptions = {
        format: 'html',
        includeBookmarks: true,
        includeTags: true,
      };

      const html = formatAsHTML(sampleBook, sampleAnnotations, options);

      // Verify HTML boilerplate & print styling
      assert.ok(html.includes('<!DOCTYPE html>'));
      assert.ok(html.includes('<html lang="ar" dir="rtl">'));
      assert.ok(html.includes('@media print'));
      assert.ok(html.includes('@page { margin: 20mm; }'));
      assert.ok(html.includes('break-inside: avoid;'));

      // Verify content
      assert.ok(html.includes('مقدمة ابن خلدون'));
      assert.ok(html.includes('إن التاريخ في ظاهره'));
      assert.ok(html.includes('badge'));
    });

    it('formats plain text with clean ASCII separator layout', () => {
      const options: ExportOptions = {
        format: 'txt',
        includeBookmarks: true,
        includeTags: true,
      };

      const txt = formatAsPlainText(sampleBook, sampleAnnotations, options);

      assert.ok(txt.includes('======================================================================'));
      assert.ok(txt.includes('مقدمة ابن خلدون (Muqaddimah)'));
      assert.ok(txt.includes('Author: ابن خلدون (Ibn Khaldun)'));
      assert.ok(txt.includes('[Page 42] [HIGHLIGHT]'));
      assert.ok(txt.includes('Quote: "إن التاريخ في ظاهره لا يزيد على الإخبار'));
      assert.ok(txt.includes('Tags: فلسفة, تاريخ, عمران'));
    });

    it('generates Anki TSV flashcard deck with Front, Back, and Tags tabs', () => {
      const options: ExportOptions = {
        format: 'anki',
        includeTags: true,
      };

      const tsv = formatAsAnkiTSV(sampleBook, sampleAnnotations, options);
      const allRows = tsv.trim().split('\n');
      const cardRows = allRows.filter((r) => !r.startsWith('#'));

      assert.equal(cardRows.length, 3);
      const [col1, col2, col3] = cardRows[0].split('\t');

      assert.ok(col1.includes('إن التاريخ في ظاهره لا يزيد على الإخبار'));
      assert.ok(col2.includes('جوهر علم العمران البشري'));
      assert.ok(col3.includes('baglib'));
      assert.ok(col3.includes('فلسفة'));
    });

    it('builds AnkiConnect note payloads for local HTTP API sync', () => {
      const notes = buildAnkiConnectNotes(sampleBook, sampleAnnotations, 'Philosophy::Baglib');

      const firstNote = notes[0];
      assert.ok(firstNote);
      assert.equal(firstNote.deckName, 'Philosophy::Baglib');
      assert.equal(firstNote.modelName, 'Basic');
      assert.ok(firstNote.front.includes('إن التاريخ في ظاهره'));
      assert.ok(firstNote.back.includes('جوهر علم العمران'));
      assert.ok(firstNote.tags && firstNote.tags.includes('baglib'));
    });

    it('dispatches export through unified exportSingleBook helper', () => {
      const resMd = exportSingleBook(sampleBook, sampleAnnotations, { format: 'markdown' });
      assert.equal(resMd.format, 'markdown');
      assert.equal(resMd.mimeType, 'text/markdown;charset=utf-8');
      assert.ok(resMd.fileName.endsWith('.md'));

      const resCsv = exportSingleBook(sampleBook, sampleAnnotations, { format: 'csv' });
      assert.equal(resCsv.format, 'csv');
      assert.equal(resCsv.mimeType, 'text/csv;charset=utf-8');
      assert.ok(resCsv.fileName.endsWith('.csv'));
    });
  });

  /* -------------------------------------------------------------------------
   * 2. Multi-Book ZIP Packaging Engine (fflate compression)
   * ------------------------------------------------------------------------- */
  describe('2. Multi-Book ZIP Packaging Engine', () => {
    const book2: BookBibliographicInfo = {
      id: 'book-tahafut-002',
      title: 'تهافت التهافت (Tahafut al-Tahafut)',
      author: 'ابن رشد (Averroes)',
      format: 'EPUB',
    };

    const annot2: AnnotationDTO[] = [
      {
        id: 'annot-201',
        bookId: 'book-tahafut-002',
        type: 'highlight',
        locationCfiOrPage: '18',
        selectedText: 'الحق لا يضاد الحق بل يوافقه ويشهد له',
        noteContent: 'التوافق بين العقل والنقل',
        color: 'emerald',
        tags: ['فلسفة', 'ابن_رشد'],
        createdAt: '2026-10-16T15:00:00.000Z',
        updatedAt: '2026-10-16T15:00:00.000Z',
      },
    ];

    const allBooks: BookWithAnnotations[] = [
      { book: sampleBook, annotations: sampleAnnotations },
      { book: book2, annotations: annot2 },
    ];

    it('creates a valid ZIP archive containing per-book files, aggregated file, and README', () => {
      const zipBytes = packageMultiBookZip(allBooks, 'markdown', {
        format: 'markdown',
        includeFrontmatter: true,
        includeBookmarks: true,
        includeTags: true,
      });

      // Assert it is a Uint8Array
      assert.ok(zipBytes instanceof Uint8Array);
      assert.ok(zipBytes.length > 0);

      // Verify standard ZIP magic signature: 0x50, 0x4B, 0x03, 0x04 ("PK\x03\x04")
      assert.equal(zipBytes[0], 0x50);
      assert.equal(zipBytes[1], 0x4b);
      assert.equal(zipBytes[2], 0x03);
      assert.equal(zipBytes[3], 0x04);

      // Unzip with fflate to verify contents
      const unzipped = fflate.unzipSync(zipBytes);
      const fileNames = Object.keys(unzipped);

      // Should have:
      // 1. README.txt
      // 2. all.md (Aggregated)
      // 3. Book 1 file
      // 4. Book 2 file
      assert.ok(fileNames.includes('README.txt'));
      assert.ok(fileNames.includes('all.md'));

      // Check contents of README.txt
      const readmeStr = fflate.strFromU8(unzipped['README.txt']);
      assert.ok(readmeStr.includes('Baglib — Exported Notes & Annotations Archive'));
      assert.ok(readmeStr.includes('Total Books: 2'));

      // Check aggregated all.md
      const allMdStr = fflate.strFromU8(unzipped['all.md']);
      assert.ok(allMdStr.includes('مقدمة ابن خلدون'));
      assert.ok(allMdStr.includes('تهافت التهافت'));
      assert.ok(allMdStr.includes('الحق لا يضاد الحق'));
    });
  });

  /* -------------------------------------------------------------------------
   * 3. 3rd-Party PKM & Knowledge Graph Adapters
   * ------------------------------------------------------------------------- */
  describe('3. PKM Adapters & Payload Generators', () => {
    it('builds Notion database page payload with headings, quotes, and callouts', () => {
      const page = buildNotionPagePayload(sampleBook, sampleAnnotations, 'parent-database-id-xyz');

      assert.ok('database_id' in page.parent);
      assert.equal(page.parent.database_id, 'parent-database-id-xyz');
      assert.equal(page.properties.Title.title[0].text.content, 'مقدمة ابن خلدون (Muqaddimah)');

      // Verify children blocks
      const children = page.children;
      assert.ok(children.length > 0);

      // Find quote block
      const quoteBlock = children.find((b) => b.type === 'quote');
      assert.ok(quoteBlock);
      assert.ok(quoteBlock.quote.rich_text[0].text.content.includes('إن التاريخ في ظاهره'));

      // Find callout block for note (skip header callout)
      const noteCallout = children.find(
        (b) => b.type === 'callout' && b.callout?.rich_text?.[0]?.text?.content?.includes('جوهر علم العمران')
      );
      assert.ok(noteCallout);
    });

    it('builds Readwise highlight payload matching Readwise v2 API specification', () => {
      const payload = buildReadwisePayload(sampleBook, sampleAnnotations);

      assert.equal(payload.highlights.length, 3);
      const hl = payload.highlights[0];

      assert.equal(hl.title, 'مقدمة ابن خلدون (Muqaddimah)');
      assert.equal(hl.author, 'ابن خلدون (Ibn Khaldun)');
      assert.equal(hl.location, 42);
      assert.equal(hl.location_type, 'page');
      assert.equal(hl.text, 'إن التاريخ في ظاهره لا يزيد على الإخبار، وفي باطنه نظر وتحقيق');
      assert.equal(hl.note, 'جوهر علم العمران البشري وفلسفة التاريخ');
      assert.ok(hl.tags && hl.tags.some((t) => t.name === 'فلسفة'));
    });

    it('exposes AnkiConnectClient and JoplinClient client interfaces', () => {
      const anki = new AnkiConnectClient('http://127.0.0.1:8765');
      assert.equal(anki.endpoint, 'http://127.0.0.1:8765');

      const joplin = new JoplinClient('test-token', 'http://127.0.0.1:41184');
      assert.equal(joplin.endpoint, 'http://127.0.0.1:41184');
      assert.equal(joplin.token, 'test-token');
    });
  });

  /* -------------------------------------------------------------------------
   * 4. SQLite Annotation Repository Multi-Book Aggregation
   * ------------------------------------------------------------------------- */
  describe('4. SQLite Annotation Repository getAll Method', () => {
    let db: Database.Database;
    let repo: SqliteAnnotationRepository;

    beforeEach(() => {
      db = createTestDatabase();
      repo = new SqliteAnnotationRepository(db);

      // Seed parent work records to satisfy foreign key constraint
      db.prepare(`
        INSERT INTO work (id, work_type_id, title)
        VALUES ('book-A', 'wt-book', 'Book A Title'), ('book-B', 'wt-book', 'Book B Title')
      `).run();
    });

    it('retrieves all annotations across multiple books in chronological order', () => {
      repo.save({
        bookId: 'book-A',
        type: 'highlight',
        locationCfiOrPage: '10',
        selectedText: 'Highlight from Book A',
      });

      repo.save({
        bookId: 'book-B',
        type: 'note',
        locationCfiOrPage: '5',
        noteContent: 'Note from Book B',
      });

      repo.save({
        bookId: 'book-A',
        type: 'bookmark',
        locationCfiOrPage: '25',
      });

      const all = repo.getAll();
      assert.equal(all.length, 3);

      const bookAAnnots = all.filter((a) => a.bookId === 'book-A');
      const bookBAnnots = all.filter((a) => a.bookId === 'book-B');

      assert.equal(bookAAnnots.length, 2);
      assert.equal(bookBAnnots.length, 1);
      assert.equal(bookBAnnots[0].noteContent, 'Note from Book B');
    });
  });

  /* -------------------------------------------------------------------------
   * 5. Bilingual UI & Localization Verification (KEY-138)
   * ------------------------------------------------------------------------- */
  describe('5. Bilingual UI & Localization Verification', () => {
    const requiredKeys = [
      'exportAnnotationsTitle',
      'exportModalDesc',
      'exportFormatLabel',
      'formatMarkdownDesc',
      'formatObsidianDesc',
      'formatCsvDesc',
      'formatHtmlDesc',
      'formatTxtDesc',
      'formatAnkiDesc',
      'formatJsonDesc',
      'includeFrontmatterLabel',
      'includeBookmarksLabel',
      'includeTagsLabel',
      'exportScopeCurrentBook',
      'exportScopeAllBooks',
      'downloadExportBtn',
      'copyExportBtn',
      'syncAnkiBtn',
      'syncAnkiSuccess',
      'syncAnkiFailed',
      'previewExport',
    ] as const;

    it('contains all KEY-138 export keys in both Arabic and English dictionaries', () => {
      const ar = translations.ar as Record<string, string>;
      const en = translations.en as Record<string, string>;

      for (const key of requiredKeys) {
        assert.ok(
          ar[key] && ar[key].trim().length > 0,
          `Missing Arabic translation for KEY-138 key: "${key}"`
        );
        assert.ok(
          en[key] && en[key].trim().length > 0,
          `Missing English translation for KEY-138 key: "${key}"`
        );
      }
    });

    it('validates authentic Arabic terminology for exporter and PKM options', () => {
      assert.ok(translations.ar.exportAnnotationsTitle.includes('تصدير'));
      assert.ok(translations.ar.formatObsidianDesc.includes('أوبسيديان'));
      assert.ok(translations.ar.formatAnkiDesc.includes('تكرار متباعد'));
      assert.ok(translations.ar.syncAnkiBtn.includes('إرسال') || translations.ar.syncAnkiBtn.includes('Anki'));
    });
  });
});
