import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type Database from 'better-sqlite3';
import { createTestDatabase } from '../helpers/test-db';
import { SqliteWorkRepository } from '../../src/main/database/repositories/work.repository';
import type { BookItemInput } from '../../src/shared/types/work';

describe('Metadata Persistence Repository Tests (Task 4.2)', () => {
  let db: Database.Database;
  let repo: SqliteWorkRepository;

  beforeEach(() => {
    db = createTestDatabase();
    repo = new SqliteWorkRepository(db);
  });

  describe('Academic & Research Paper Persistence', () => {
    it('persists and retrieves academic paper metadata (DOI, journal, abstract, peerReviewed)', () => {
      const input: BookItemInput = {
        id: 'paper-101',
        title: 'Deep Learning for Classical Arabic Manuscript Restoration',
        author: 'Dr. Zaid Al-Baghdadi',
        workType: 'research_paper',
        doi: '10.1000/182.baglib.2026',
        journalName: 'Journal of Computational Linguistics & Arabic Heritage',
        conferenceName: 'ACL 2026',
        abstract: 'This paper presents an end-to-end transformer model designed for restoring lacunae in ancient Arabic codices.',
        peerReviewed: true,
        arxivId: '2601.12345v1',
        pagesRange: '145-168',
        publicationYear: 2026,
        language: 'English',
        categories: ['ذكاء اصطناعي', 'لسانيات حاسوبية'],
        bookType: 'digital',
        filePath: 'C:/papers/arabic_nlp_2026.pdf',
        digitalFormat: 'PDF',
      };

      const saved = repo.addBook(input);
      assert.strictEqual(saved.id, 'paper-101');
      assert.strictEqual(saved.workType, 'research_paper');
      assert.strictEqual(saved.workTypeId, 'wt-research-paper');
      assert.strictEqual(saved.doi, '10.1000/182.baglib.2026');
      assert.strictEqual(saved.journalName, 'Journal of Computational Linguistics & Arabic Heritage');
      assert.strictEqual(saved.conferenceName, 'ACL 2026');
      assert.strictEqual(saved.peerReviewed, true);
      assert.strictEqual(saved.arxivId, '2601.12345v1');
      assert.strictEqual(saved.pagesRange, '145-168');
      assert.ok(saved.abstract?.includes('transformer model'));

      // Retrieve via getById
      const retrieved = repo.getById('paper-101');
      assert.ok(retrieved);
      assert.strictEqual(retrieved.workType, 'research_paper');
      assert.strictEqual(retrieved.workTypeId, 'wt-research-paper');
      assert.strictEqual(retrieved.doi, '10.1000/182.baglib.2026');
      assert.strictEqual(retrieved.journalName, 'Journal of Computational Linguistics & Arabic Heritage');
      assert.strictEqual(retrieved.peerReviewed, true);
      assert.strictEqual(retrieved.pagesRange, '145-168');

      // Verify in getAllWorks
      const all = repo.getAllWorks();
      const match = all.find((w) => w.id === 'paper-101');
      assert.ok(match);
      assert.strictEqual(match.workType, 'research_paper');
      assert.strictEqual(match.doi, '10.1000/182.baglib.2026');
    });
  });

  describe('Recorded Lectures & Speeches Persistence', () => {
    it('persists and retrieves lecture metadata (speaker, institution, duration, recording URL)', () => {
      const input: BookItemInput = {
        id: 'lecture-201',
        title: 'مدخل إلى مناهج البحث وتحقيق المخطوطات',
        speaker: 'د. عبد الله الأنصاري',
        hostInstitution: 'معهد المخطوطات العربية',
        courseOrEventTitle: 'دورة التحقيق التراثي المتقدمة',
        durationMinutes: 125,
        recordingUrl: 'https://archive.org/details/arabic-manuscripts-lecture-1',
        workType: 'lecture',
        publicationYear: 2025,
        language: 'العربية',
        categories: ['تحقيق النصوص', 'تراث'],
        bookType: 'digital',
      };

      const saved = repo.addBook(input);
      assert.strictEqual(saved.id, 'lecture-201');
      assert.strictEqual(saved.workType, 'lecture');
      assert.strictEqual(saved.workTypeId, 'wt-lecture');
      assert.strictEqual(saved.speaker, 'د. عبد الله الأنصاري');
      assert.strictEqual(saved.author, 'د. عبد الله الأنصاري');
      assert.strictEqual(saved.hostInstitution, 'معهد المخطوطات العربية');
      assert.strictEqual(saved.courseOrEventTitle, 'دورة التحقيق التراثي المتقدمة');
      assert.strictEqual(saved.durationMinutes, 125);
      assert.strictEqual(saved.recordingUrl, 'https://archive.org/details/arabic-manuscripts-lecture-1');

      const retrieved = repo.getById('lecture-201');
      assert.ok(retrieved);
      assert.strictEqual(retrieved.durationMinutes, 125);
      assert.strictEqual(retrieved.speaker, 'د. عبد الله الأنصاري');
      assert.strictEqual(retrieved.hostInstitution, 'معهد المخطوطات العربية');
    });
  });

  describe('Periodicals & Magazines Persistence', () => {
    it('persists and retrieves magazine/periodical metadata (title, issue, volume, ISSN)', () => {
      const input: BookItemInput = {
        id: 'periodical-301',
        title: 'مجلة مجمع اللغة العربية - العدد 120',
        author: 'مجمع اللغة العربية بدمشق',
        workType: 'periodical',
        periodicalTitle: 'مجلة مجمع اللغة العربية',
        issueNumber: 120,
        volumeNumber: 45,
        publicationSeasonOrMonth: 'ربيع 2024',
        issn: '0258-1094',
        publicationYear: 2024,
        language: 'العربية',
        bookType: 'physical',
        shelf: 'رف المجلات 2',
      };

      const saved = repo.addBook(input);
      assert.strictEqual(saved.id, 'periodical-301');
      assert.strictEqual(saved.workType, 'periodical');
      assert.strictEqual(saved.workTypeId, 'wt-periodical');
      assert.strictEqual(saved.periodicalTitle, 'مجلة مجمع اللغة العربية');
      assert.strictEqual(saved.issueNumber, 120);
      assert.strictEqual(saved.volumeNumber, 45);
      assert.strictEqual(saved.publicationSeasonOrMonth, 'ربيع 2024');
      assert.strictEqual(saved.issn, '0258-1094');

      const retrieved = repo.getById('periodical-301');
      assert.ok(retrieved);
      assert.strictEqual(retrieved.workType, 'periodical');
      assert.strictEqual(retrieved.issn, '0258-1094');
      assert.strictEqual(retrieved.issueNumber, 120);
      assert.strictEqual(retrieved.volumeNumber, 45);
    });
  });

  describe('Theses & Dissertations Persistence', () => {
    it('persists and retrieves thesis metadata (degreeLevel, advisor, defenseDate)', () => {
      const input: BookItemInput = {
        id: 'thesis-401',
        title: 'المرويات التاريخية في كتاب الأغاني: دراسة نقدية',
        author: 'الباحث مصطفى الهاشمي',
        workType: 'thesis',
        degreeLevel: 'phd',
        facultyOrDepartment: 'كلية الآداب - قسم التاريخ الإسلامي',
        advisor: 'أ.د. فاروق السامرائي',
        defenseDate: '2023-06-15',
        publicationYear: 2023,
        language: 'العربية',
        categories: ['تاريخ إسلامي', 'أطروحات'],
        bookType: 'digital',
      };

      const saved = repo.addBook(input);
      assert.strictEqual(saved.id, 'thesis-401');
      assert.strictEqual(saved.workType, 'thesis');
      assert.strictEqual(saved.workTypeId, 'wt-thesis');
      assert.strictEqual(saved.degreeLevel, 'phd');
      assert.strictEqual(saved.advisor, 'أ.د. فاروق السامرائي');
      assert.strictEqual(saved.defenseDate, '2023-06-15');
      assert.strictEqual(saved.facultyOrDepartment, 'كلية الآداب - قسم التاريخ الإسلامي');

      const retrieved = repo.getById('thesis-401');
      assert.ok(retrieved);
      assert.strictEqual(retrieved.advisor, 'أ.د. فاروق السامرائي');
      assert.strictEqual(retrieved.degreeLevel, 'phd');
    });
  });

  describe('Manuscripts Persistence', () => {
    it('persists and retrieves manuscript metadata (codexOrShelfmark, scribe, scriptType, folios)', () => {
      const input: BookItemInput = {
        id: 'manuscript-501',
        title: 'مخطوط تهذيب الآثار للطبري',
        author: 'محمد بن جرير الطبري',
        workType: 'manuscript',
        holdingInstitution: 'دار الكتب والوثائق القومية - القاهرة',
        codexOrShelfmark: 'مخطوط رقم 458 حديث',
        scribe: 'علي بن الحسين البغدادي',
        scriptType: 'ثلث قديم',
        folioCount: 284,
        condition: 'أثرية/قديمة',
        bookType: 'physical',
        shelf: 'خزانة المخطوطات النادرة',
      };

      const saved = repo.addBook(input);
      assert.strictEqual(saved.id, 'manuscript-501');
      assert.strictEqual(saved.workType, 'manuscript');
      assert.strictEqual(saved.workTypeId, 'wt-manuscript');
      assert.strictEqual(saved.holdingInstitution, 'دار الكتب والوثائق القومية - القاهرة');
      assert.strictEqual(saved.codexOrShelfmark, 'مخطوط رقم 458 حديث');
      assert.strictEqual(saved.scribe, 'علي بن الحسين البغدادي');
      assert.strictEqual(saved.scriptType, 'ثلث قديم');
      assert.strictEqual(saved.folioCount, 284);
      assert.strictEqual(saved.condition, 'أثرية/قديمة');

      const retrieved = repo.getById('manuscript-501');
      assert.ok(retrieved);
      assert.strictEqual(retrieved.codexOrShelfmark, 'مخطوط رقم 458 حديث');
      assert.strictEqual(retrieved.scribe, 'علي بن الحسين البغدادي');
      assert.strictEqual(retrieved.folioCount, 284);
    });
  });

  describe('Physical Location & Acquisition Granularity', () => {
    it('persists and reconstructs physical location hierarchy and acquisition data', () => {
      const input: BookItemInput = {
        id: 'book-loc-601',
        title: 'تاريخ بغداد للخطيب البغدادي - 14 مجلد',
        author: 'الخطيب البغدادي',
        workType: 'book',
        room: 'المكتبة الخاصة',
        bookcase: 'خزانة رقم 3 - كتب التراجم',
        shelf: 'رف رقم 2',
        shelfSection: 'القسم الأوسط',
        condition: 'ممتازة',
        purchaseDate: '2024-03-20',
        price: '180000',
        bookType: 'physical',
      };

      const saved = repo.addBook(input);
      assert.strictEqual(saved.id, 'book-loc-601');
      assert.strictEqual(saved.room, 'المكتبة الخاصة');
      assert.strictEqual(saved.bookcase, 'خزانة رقم 3 - كتب التراجم');
      assert.strictEqual(saved.shelf, 'رف رقم 2');
      assert.strictEqual(saved.shelfSection, 'القسم الأوسط');
      assert.strictEqual(saved.condition, 'ممتازة');
      assert.strictEqual(saved.purchaseDate, '2024-03-20');
      assert.strictEqual(saved.price, '180000');

      // Verify nested objects
      assert.ok(saved.physicalLocation);
      assert.strictEqual(saved.physicalLocation.room, 'المكتبة الخاصة');
      assert.strictEqual(saved.physicalLocation.bookcase, 'خزانة رقم 3 - كتب التراجم');
      assert.strictEqual(saved.physicalLocation.shelf, 'رف رقم 2');
      assert.strictEqual(saved.physicalLocation.shelfSection, 'القسم الأوسط');

      assert.ok(saved.acquisition);
      assert.strictEqual(saved.acquisition.purchaseDate, '2024-03-20');
      assert.strictEqual(saved.acquisition.price, '180000');

      const retrieved = repo.getById('book-loc-601');
      assert.ok(retrieved);
      assert.strictEqual(retrieved.bookcase, 'خزانة رقم 3 - كتب التراجم');
      assert.strictEqual(retrieved.shelfSection, 'القسم الأوسط');
      assert.deepStrictEqual(retrieved.physicalLocation, {
        room: 'المكتبة الخاصة',
        bookcase: 'خزانة رقم 3 - كتب التراجم',
        shelf: 'رف رقم 2',
        shelfSection: 'القسم الأوسط',
      });
    });
  });

  describe('Contributors Breakdown Persistence', () => {
    it('persists structured contributor roles (authors, translators, commentators)', () => {
      const input: BookItemInput = {
        id: 'work-contrib-701',
        title: 'منطق أرسطو مع حواشي الفارابي',
        author: 'أرسطوطاليس',
        workType: 'book',
        contributors: [
          { name: 'أرسطوطاليس', role: 'author' },
          { name: 'إسحاق بن حنين', role: 'translator' },
          { name: 'أبو نصر الفارابي', role: 'commentator' },
        ],
      };

      const saved = repo.addBook(input);
      assert.ok(saved.contributors);
      assert.strictEqual(saved.contributors.length, 3);
      assert.strictEqual(saved.contributors[1].role, 'translator');
      assert.strictEqual(saved.contributors[1].name, 'إسحاق بن حنين');

      const retrieved = repo.getById('work-contrib-701');
      assert.ok(retrieved);
      assert.ok(retrieved.contributors);
      assert.strictEqual(retrieved.contributors.length, 3);
      assert.strictEqual(retrieved.contributors[2].role, 'commentator');
      assert.strictEqual(retrieved.contributors[2].name, 'أبو نصر الفارابي');
    });
  });

  describe('Update Operations and Non-destructive Merging', () => {
    it('preserves existing polymorphic metadata when partially updating works', () => {
      const initial: BookItemInput = {
        id: 'paper-update-801',
        title: 'Novel Quantum Algorithms for Classical Search',
        author: 'Dr. Tariq Al-Najjar',
        workType: 'research_paper',
        doi: '10.1145/3344556.778899',
        journalName: 'ACM Computing Reviews',
        peerReviewed: true,
      };

      repo.addBook(initial);

      // Partial update: add abstract and reading status without passing doi or journalName
      repo.updateBook({
        id: 'paper-update-801',
        title: 'Novel Quantum Algorithms for Classical Search (Revised Edition)',
        author: 'Dr. Tariq Al-Najjar',
        abstract: 'An updated analysis of Grover search algorithm variants.',
        readingStatus: 'reading',
        readingProgress: 45,
      });

      const updated = repo.getById('paper-update-801');
      assert.ok(updated);
      assert.strictEqual(updated.title, 'Novel Quantum Algorithms for Classical Search (Revised Edition)');
      // DOI and journalName should still be preserved
      assert.strictEqual(updated.doi, '10.1145/3344556.778899');
      assert.strictEqual(updated.journalName, 'ACM Computing Reviews');
      assert.strictEqual(updated.peerReviewed, true);
      assert.strictEqual(updated.workType, 'research_paper');
      assert.strictEqual(updated.readingStatus, 'reading');
      assert.strictEqual(updated.readingProgress, 45);
      assert.strictEqual(updated.abstract, 'An updated analysis of Grover search algorithm variants.');
    });

    it('updates physical location fields cleanly', () => {
      const initial: BookItemInput = {
        id: 'book-reloc-901',
        title: 'صحيح البخاري',
        author: 'محمد بن إسماعيل البخاري',
        room: 'الغرفة 1',
        bookcase: 'دولاب 1',
        shelf: 'رف 1',
        shelfSection: 'أسفل',
        bookType: 'physical',
      };

      repo.addBook(initial);

      repo.updateBook({
        id: 'book-reloc-901',
        title: 'صحيح البخاري',
        author: 'محمد بن إسماعيل البخاري',
        room: 'المكتبة المركزية',
        bookcase: 'خزانة الحديث الشريف',
        shelf: 'رف 3',
        shelfSection: 'أعلى',
        bookType: 'physical',
      });

      const updated = repo.getById('book-reloc-901');
      assert.ok(updated);
      assert.strictEqual(updated.room, 'المكتبة المركزية');
      assert.strictEqual(updated.bookcase, 'خزانة الحديث الشريف');
      assert.strictEqual(updated.shelf, 'رف 3');
      assert.strictEqual(updated.shelfSection, 'أعلى');
    });
  });
});
