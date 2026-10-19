import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type Database from 'better-sqlite3';
import { createTestDatabase } from '../helpers/test-db';
import { SqliteAnnotationRepository } from '../../src/main/database/repositories/annotation.repository';
import type { AnnotationPayload, InkStroke } from '../../src/shared/types/annotation';
import {
  pressureScale,
  getQuadraticBezierPoint,
  computeContourPoints,
  traceOutline,
} from '../../src/renderer/libs/reader/ink-bezier';
import fs from 'node:fs';
import path from 'node:path';
import {
  HIGHLIGHT_COLORS,
  isCustomHighlightSupported,
  findRangesForText,
  setActiveSelectionHighlight,
  clearActiveSelectionHighlight,
} from '../../src/renderer/libs/reader/highlight-manager';
import { translations } from '../../src/renderer/translations';

describe('KEY-137 Highlighting, Bookmarking, Margin Notes & Freehand Ink System', () => {
  /* -------------------------------------------------------------------------
   * 1. Stylus Ink Engine & Bézier Disc Contour Math (Readest Algorithm)
   * ------------------------------------------------------------------------- */
  describe('1. Stylus Pressure Normalization & Bézier Disc Math', () => {
    it('normalizes stylus pressure according to pressureScale formula: 0.5 + (p ?? 0.5)', () => {
      assert.equal(pressureScale(undefined), 1.0);
      assert.equal(pressureScale(null as any), 1.0);
      assert.equal(pressureScale(0.0), 0.5);
      assert.equal(pressureScale(0.5), 1.0);
      assert.equal(pressureScale(1.0), 1.5);
      assert.equal(pressureScale(0.8), 1.3);
    });

    it('interpolates quadratic Bézier curve correctly at boundary and mid points', () => {
      const p0 = { x: 0, y: 0 };
      const p1 = { x: 50, y: 100 };
      const p2 = { x: 100, y: 0 };

      // At t = 0 -> p0
      const start = getQuadraticBezierPoint(p0, p1, p2, 0);
      assert.equal(start.x, 0);
      assert.equal(start.y, 0);

      // At t = 1 -> p2
      const end = getQuadraticBezierPoint(p0, p1, p2, 1);
      assert.equal(end.x, 100);
      assert.equal(end.y, 0);

      // At t = 0.5 -> B(0.5) = 0.25*0 + 0.5*50 + 0.25*100 = 50, y = 0.25*0 + 0.5*100 + 0.25*0 = 50
      const mid = getQuadraticBezierPoint(p0, p1, p2, 0.5);
      assert.equal(mid.x, 50);
      assert.equal(mid.y, 50);
    });

    it('generates outer perimeter contour polygon without NaN or discontinuities', () => {
      const points = [
        { x: 10, y: 10, pressure: 0.5 },
        { x: 25, y: 30, pressure: 0.8 },
        { x: 50, y: 60, pressure: 0.6 },
        { x: 80, y: 70, pressure: 0.4 },
      ];

      const contour = computeContourPoints(points, 4);
      assert.ok(contour.samples.length > points.length, 'Bézier sampling produces smooth subdivisions');
      assert.equal(contour.leftPoints.length, contour.samples.length);
      assert.equal(contour.rightPoints.length, contour.samples.length);

      // Check all vertices are finite valid numbers
      for (const pt of [...contour.leftPoints, ...contour.rightPoints]) {
        assert.ok(Number.isFinite(pt.x), `Vertex X must be finite: ${pt.x}`);
        assert.ok(Number.isFinite(pt.y), `Vertex Y must be finite: ${pt.y}`);
      }

      // Verify traceOutline returns a path object without throwing
      const path = traceOutline(points, 4);
      assert.ok(path !== null && path !== undefined);
    });

    it('handles single-point stroke as a circular disc contour', () => {
      const singlePoint = [{ x: 50, y: 50, pressure: 0.5 }];
      const contour = computeContourPoints(singlePoint, 6);
      assert.equal(contour.samples.length, 1);
      assert.equal(contour.leftPoints.length, 1);
      assert.equal(contour.rightPoints.length, 1);
      assert.equal(contour.samples[0].radius, 3); // 6/2 * 1.0 = 3

      const path = traceOutline(singlePoint, 6);
      assert.ok(path !== null && path !== undefined);
    });

    it('handles empty stroke gracefully', () => {
      const contour = computeContourPoints([], 4);
      assert.deepEqual(contour.leftPoints, []);
      assert.deepEqual(contour.rightPoints, []);

      const path = traceOutline([], 4);
      assert.ok(path !== null && path !== undefined);
    });
  });

  /* -------------------------------------------------------------------------
   * 2. Non-Destructive W3C CSS Custom Highlight Manager
   * ------------------------------------------------------------------------- */
  describe('2. W3C CSS Custom Highlight Color Palette & Range Locator', () => {
    it('defines 5 standard highlight colors with matching CSS highlight classes', () => {
      assert.equal(HIGHLIGHT_COLORS.length, 5);
      const colorIds = HIGHLIGHT_COLORS.map((c) => c.id);
      assert.ok(colorIds.includes('amber'));
      assert.ok(colorIds.includes('emerald'));
      assert.ok(colorIds.includes('rose'));
      assert.ok(colorIds.includes('sky'));
      assert.ok(colorIds.includes('violet'));

      for (const c of HIGHLIGHT_COLORS) {
        assert.ok(c.cssClass.startsWith('baglib-highlight-'));
        assert.ok(c.hex.startsWith('#'));
      }
    });

    it('detects CSS.highlights presence safely without throwing in node environment', () => {
      const supported = isCustomHighlightSupported();
      assert.equal(typeof supported, 'boolean');
      // In Node.js environment without DOM polyfill, it should return false
      assert.equal(supported, false);
    });
  });

  /* -------------------------------------------------------------------------
   * 3. SQLite Annotation Repository (Migration 010 & CRUD)
   * ------------------------------------------------------------------------- */
  describe('3. SQLite Annotation Repository & Persistence', () => {
    let db: Database.Database;
    let repo: SqliteAnnotationRepository;

    beforeEach(() => {
      db = createTestDatabase();
      repo = new SqliteAnnotationRepository(db);

      // Seed parent work to satisfy foreign key constraint
      db.prepare(`
        INSERT INTO work (id, work_type_id, title)
        VALUES ('work-annot-1', 'wt-book', 'صحيح البخاري')
      `).run();
    });

    it('saves a highlight annotation and retrieves it by book ID', () => {
      const payload: AnnotationPayload = {
        id: 'hl-1',
        bookId: 'work-annot-1',
        type: 'highlight',
        locationCfiOrPage: '12',
        selectedText: 'إنما الأعمال بالنيات وإنما لكل امرئ ما نوى',
        color: 'amber',
        tags: ['hadith', 'intention'],
      };

      const saved = repo.save(payload);
      assert.equal(saved.id, 'hl-1');
      assert.equal(saved.type, 'highlight');
      assert.equal(saved.selectedText, 'إنما الأعمال بالنيات وإنما لكل امرئ ما نوى');
      assert.equal(saved.color, 'amber');
      assert.deepEqual(saved.tags, ['hadith', 'intention']);

      const all = repo.getByBookId('work-annot-1');
      assert.equal(all.length, 1);
      assert.equal(all[0].id, 'hl-1');
    });

    it('saves a freehand ink stroke annotation with vector points and retrieves it', () => {
      const inkStrokes: InkStroke[] = [
        {
          id: 'stroke-1',
          points: [
            { x: 10, y: 20, pressure: 0.5 },
            { x: 30, y: 40, pressure: 0.7 },
          ],
          color: '#d97706',
          width: 3,
          tool: 'pen',
        },
      ];

      const payload: AnnotationPayload = {
        id: 'ink-1',
        bookId: 'work-annot-1',
        type: 'ink',
        locationCfiOrPage: '4',
        strokeData: inkStrokes,
      };

      repo.save(payload);

      const retrieved = repo.getByBookIdAndPage('work-annot-1', '4');
      assert.equal(retrieved.length, 1);
      assert.equal(retrieved[0].type, 'ink');
      assert.ok(retrieved[0].strokeData);
      assert.equal(retrieved[0].strokeData.length, 1);
      assert.equal(retrieved[0].strokeData[0].points.length, 2);
      assert.equal(retrieved[0].strokeData[0].tool, 'pen');
    });

    it('upserts an annotation when the same ID is saved again', () => {
      repo.save({
        id: 'note-up-1',
        bookId: 'work-annot-1',
        type: 'note',
        locationCfiOrPage: '7',
        noteContent: 'الملاحظة الأولى',
      });

      repo.save({
        id: 'note-up-1',
        bookId: 'work-annot-1',
        type: 'note',
        locationCfiOrPage: '7',
        noteContent: 'الملاحظة المنقحة والمعدلة',
      });

      const all = repo.getByBookId('work-annot-1');
      assert.equal(all.length, 1);
      assert.equal(all[0].noteContent, 'الملاحظة المنقحة والمعدلة');
    });

    it('filters annotations by type, color, page, and search query', () => {
      repo.save({
        id: 'a1',
        bookId: 'work-annot-1',
        type: 'highlight',
        locationCfiOrPage: '10',
        selectedText: 'العلم قبل القول والعمل',
        color: 'emerald',
      });

      repo.save({
        id: 'a2',
        bookId: 'work-annot-1',
        type: 'note',
        locationCfiOrPage: '10',
        noteContent: 'فائدة نفيسة في أولوية العلم',
        color: 'sky',
      });

      repo.save({
        id: 'a3',
        bookId: 'work-annot-1',
        type: 'bookmark',
        locationCfiOrPage: '25',
      });

      // Filter by type = 'bookmark'
      const bookmarks = repo.getFiltered({ bookId: 'work-annot-1', type: 'bookmark' });
      assert.equal(bookmarks.length, 1);
      assert.equal(bookmarks[0].id, 'a3');

      // Filter by page = '10'
      const page10 = repo.getFiltered({ bookId: 'work-annot-1', page: '10' });
      assert.equal(page10.length, 2);

      // Filter by color = 'emerald'
      const emeraldOnly = repo.getFiltered({ bookId: 'work-annot-1', color: 'emerald' });
      assert.equal(emeraldOnly.length, 1);
      assert.equal(emeraldOnly[0].id, 'a1');

      // Filter by search query = 'نفيسة'
      const searchMatches = repo.getFiltered({ bookId: 'work-annot-1', searchQuery: 'نفيسة' });
      assert.equal(searchMatches.length, 1);
      assert.equal(searchMatches[0].id, 'a2');
    });

    it('deletes an annotation by ID and cascades properly', () => {
      repo.save({
        id: 'del-me',
        bookId: 'work-annot-1',
        type: 'highlight',
        locationCfiOrPage: '1',
        selectedText: 'نص مؤقت للحذف',
      });

      assert.equal(repo.getByBookId('work-annot-1').length, 1);

      const deleted = repo.delete('del-me');
      assert.equal(deleted, true);
      assert.equal(repo.getByBookId('work-annot-1').length, 0);
    });

    it('deletes all annotations for a book by bookId', () => {
      repo.save({ id: 'b1', bookId: 'work-annot-1', type: 'highlight', locationCfiOrPage: '1' });
      repo.save({ id: 'b2', bookId: 'work-annot-1', type: 'bookmark', locationCfiOrPage: '2' });
      repo.save({ id: 'b3', bookId: 'work-annot-1', type: 'note', locationCfiOrPage: '3' });

      assert.equal(repo.getByBookId('work-annot-1').length, 3);

      repo.deleteByBookId('work-annot-1');
      assert.equal(repo.getByBookId('work-annot-1').length, 0);
    });
  });

  /* -------------------------------------------------------------------------
   * 4. Bilingual UI & Localization Verification (Arabic RTL & English LTR)
   * ------------------------------------------------------------------------- */
  describe('4. Bilingual UI & Localization Verification', () => {
    const requiredKeys = [
      'annotationsDrawerTitle',
      'tabHighlights',
      'tabNotes',
      'tabBookmarks',
      'tabInk',
      'filterAllColors',
      'instantModeToggle',
      'instantModeActiveToast',
      'instantModeDisabledToast',
      'addBookmarkBtn',
      'bookmarkAdded',
      'exportMarkdownBtn',
      'noAnnotationsFound',
      'searchAnnotations',
      'stylusInkMode',
      'underlineBtn',
      'copyTextBtn',
      'textCopiedToast',
    ];

    it('contains all required Story 2.1 localization keys in both Arabic and English dictionaries', () => {
      for (const key of requiredKeys) {
        assert.ok(
          (translations.ar as any)[key],
          `Missing Arabic translation for key: ${key}`
        );
        assert.ok(
          (translations.en as any)[key],
          `Missing English translation for key: ${key}`
        );
      }
    });

    it('ensures Arabic translations contain authentic, non-placeholder terminology', () => {
      assert.equal(translations.ar.annotationsDrawerTitle, 'سجل الإضاءات والحواشي');
      assert.equal(translations.ar.tabHighlights, 'التظليلات');
      assert.equal(translations.ar.tabBookmarks, 'العلامات المرجعية');
      assert.equal(translations.ar.tabInk, 'الخط اليدوي والرسومات');
      assert.equal(translations.ar.stylusInkMode, 'قلم الرسم والخط الحر');
    });
  });

  /* -------------------------------------------------------------------------
   * 5. Text Selection Locking & Active Custom Highlight Persistence
   * ------------------------------------------------------------------------- */
  describe('5. Text Selection Locking & Active Custom Highlight Persistence', () => {
    it('safely handles setActiveSelectionHighlight and clearActiveSelectionHighlight in Node/SSR environment', () => {
      assert.doesNotThrow(() => {
        setActiveSelectionHighlight(null);
        clearActiveSelectionHighlight();
      });
    });

    it('manages W3C Highlight registry with baglib-active-selection when CSS highlights API exists', () => {
      const mockHighlightMap = new Map<string, any>();
      const originalCSS = (globalThis as any).CSS;
      const originalHighlight = (globalThis as any).Highlight;
      const originalWindow = (globalThis as any).window;

      class MockHighlight {
        ranges: any[];
        constructor(...ranges: any[]) {
          this.ranges = ranges;
        }
      }

      (globalThis as any).CSS = {
        highlights: mockHighlightMap,
      };
      (globalThis as any).Highlight = MockHighlight;
      (globalThis as any).window = { Highlight: MockHighlight };

      try {
        const mockRange = { collapsed: false } as Range;
        const mockDoc = {
          head: { appendChild: () => {} },
          getElementById: () => null,
          createElement: () => ({ setAttribute: () => {} }),
        } as any;

        setActiveSelectionHighlight(mockRange, mockDoc);
        assert.ok(mockHighlightMap.has('baglib-active-selection'));

        clearActiveSelectionHighlight();
        assert.equal(mockHighlightMap.has('baglib-active-selection'), false);
      } finally {
        (globalThis as any).CSS = originalCSS;
        (globalThis as any).Highlight = originalHighlight;
        (globalThis as any).window = originalWindow;
      }
    });

    it('verifies ZenSelectionMenu stops mousedown propagation to prevent selection loss', () => {
      const menuCode = fs.readFileSync(
        path.join(__dirname, '../../src/renderer/components/reader/ZenSelectionMenu.tsx'),
        'utf8'
      );
      assert.match(
        menuCode,
        /onMouseDown=\{\(e\)\s*=>\s*\{[\s\S]*?e\.stopPropagation\(\)/,
        'ZenSelectionMenu must stop mousedown propagation on root dialog'
      );
      assert.match(
        menuCode,
        /e\.preventDefault\(\)/,
        'ZenSelectionMenu action buttons must call e.preventDefault() on mousedown to preserve document focus'
      );
    });

    it('verifies PdfNativeViewer renders transient activeSelectionRects overlay', () => {
      const pdfViewerCode = fs.readFileSync(
        path.join(__dirname, '../../src/renderer/components/reader/PdfNativeViewer.tsx'),
        'utf8'
      );
      assert.match(
        pdfViewerCode,
        /activeSelectionRects/,
        'PdfNativeViewer must accept and handle activeSelectionRects'
      );
      assert.match(
        pdfViewerCode,
        /pdf-active-selection-rect/,
        'PdfNativeViewer must render pdf-active-selection-rect in highlight layer'
      );
    });

    it('verifies FullPageBookReader captures and locks Range on mouseup', () => {
      const readerCode = fs.readFileSync(
        path.join(__dirname, '../../src/renderer/components/reader/FullPageBookReader.tsx'),
        'utf8'
      );
      assert.match(
        readerCode,
        /selection\.getRangeAt\(0\)\.cloneRange\(\)/,
        'FullPageBookReader must clone and lock the active Range on mouseup'
      );
      assert.match(
        readerCode,
        /setActiveSelectionHighlight\(range\)/,
        'FullPageBookReader must call setActiveSelectionHighlight on mouseup'
      );
      assert.match(
        readerCode,
        /activeSelectionInfo=\{pdfSelectionInfo\}/,
        'FullPageBookReader must pass activeSelectionInfo to PdfNativeViewer'
      );
    });
  });
});

