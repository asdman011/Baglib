import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  WORK_TYPES,
  getWorkTypeInfo,
  isBook,
  isResearchPaper,
  isArticle,
  isLecture,
  isPeriodical,
  isThesis,
  isManuscript,
  type WorkTypeKey,
} from '../../src/shared/types/metadata';
import type { BookItem } from '../../src/shared/types/work';

describe('Polymorphic Metadata Model & Work Types (Task 4.1)', () => {
  describe('Work Type Registry and Lookup', () => {
    it('defines all 9 core work types with Arabic and English metadata', () => {
      const expectedKeys: WorkTypeKey[] = [
        'book',
        'research_paper',
        'article',
        'lecture',
        'periodical',
        'thesis',
        'manuscript',
        'podcast',
        'video',
      ];

      for (const key of expectedKeys) {
        const info = WORK_TYPES[key];
        assert.ok(info, `Work type ${key} must exist`);
        assert.strictEqual(info.key, key);
        assert.ok(info.id.startsWith('wt-'));
        assert.ok(info.nameAr.length > 0);
        assert.ok(info.nameEn.length > 0);
        assert.ok(info.icon.length > 0);
      }
    });

    it('resolves WorkTypeInfo by key or by database ID', () => {
      assert.strictEqual(getWorkTypeInfo('book').nameAr, 'كتاب');
      assert.strictEqual(getWorkTypeInfo('wt-book').nameAr, 'كتاب');

      assert.strictEqual(getWorkTypeInfo('research_paper').nameAr, 'بحث أكاديمي');
      assert.strictEqual(getWorkTypeInfo('wt-research-paper').nameAr, 'بحث أكاديمي');

      assert.strictEqual(getWorkTypeInfo('lecture').nameAr, 'محاضرة');
      assert.strictEqual(getWorkTypeInfo('wt-lecture').nameAr, 'محاضرة');

      assert.strictEqual(getWorkTypeInfo('periodical').nameAr, 'مجلة / دورية');
      assert.strictEqual(getWorkTypeInfo('wt-periodical').nameAr, 'مجلة / دورية');

      assert.strictEqual(getWorkTypeInfo('thesis').nameAr, 'رسالة علمية');
      assert.strictEqual(getWorkTypeInfo('wt-thesis').nameAr, 'رسالة علمية');

      assert.strictEqual(getWorkTypeInfo('manuscript').nameAr, 'مخطوطة');
      assert.strictEqual(getWorkTypeInfo('wt-manuscript').nameAr, 'مخطوطة');

      // Falls back to book for undefined or invalid keys
      assert.strictEqual(getWorkTypeInfo(undefined).key, 'book');
      assert.strictEqual(getWorkTypeInfo('unknown-type').key, 'book');
    });
  });

  describe('Work Type Identification Guards', () => {
    it('accurately identifies books', () => {
      assert.strictEqual(isBook({ workType: 'book' }), true);
      assert.strictEqual(isBook({ workTypeId: 'wt-book' }), true);
      assert.strictEqual(isBook({ workType: 'lecture' }), false);
    });

    it('accurately identifies academic research papers', () => {
      assert.strictEqual(isResearchPaper({ workType: 'research_paper' }), true);
      assert.strictEqual(isResearchPaper({ workTypeId: 'wt-research-paper' }), true);
      assert.strictEqual(isResearchPaper({ workType: 'book' }), false);
    });

    it('accurately identifies articles', () => {
      assert.strictEqual(isArticle({ workType: 'article' }), true);
      assert.strictEqual(isArticle({ workTypeId: 'wt-article' }), true);
    });

    it('accurately identifies lectures and courses', () => {
      assert.strictEqual(isLecture({ workType: 'lecture' }), true);
      assert.strictEqual(isLecture({ workTypeId: 'wt-lecture' }), true);
    });

    it('accurately identifies periodicals and magazines', () => {
      assert.strictEqual(isPeriodical({ workType: 'periodical' }), true);
      assert.strictEqual(isPeriodical({ workTypeId: 'wt-periodical' }), true);
    });

    it('accurately identifies theses', () => {
      assert.strictEqual(isThesis({ workType: 'thesis' }), true);
      assert.strictEqual(isThesis({ workTypeId: 'wt-thesis' }), true);
    });

    it('accurately identifies historical manuscripts', () => {
      assert.strictEqual(isManuscript({ workType: 'manuscript' }), true);
      assert.strictEqual(isManuscript({ workTypeId: 'wt-manuscript' }), true);
    });
  });

  describe('Polymorphic Catalog Item Model Mapping', () => {
    it('supports academic research papers with DOI, abstract, and journal', () => {
      const paper: BookItem = {
        id: 'paper-001',
        title: 'Attention Is All You Need',
        author: 'Vaswani et al.',
        language: 'English',
        categories: ['Artificial Intelligence', 'Transformers'],
        tags: ['Deep Learning', 'NLP'],
        bookType: 'digital',
        digitalFormat: 'PDF',
        workType: 'research_paper',
        workTypeId: 'wt-research-paper',
        doi: '10.48550/arXiv.1706.03762',
        arxivId: '1706.03762',
        conferenceName: 'NeurIPS 2017',
        abstract: 'The dominant sequence transduction models are based on complex recurrent or convolutional neural networks...',
        peerReviewed: true,
        lendingHistory: [],
      };

      assert.strictEqual(paper.workType, 'research_paper');
      assert.strictEqual(paper.doi, '10.48550/arXiv.1706.03762');
      assert.strictEqual(paper.peerReviewed, true);
      assert.strictEqual(isResearchPaper(paper), true);
    });

    it('supports recorded lectures with speaker, institution, and duration', () => {
      const lecture: BookItem = {
        id: 'lecture-001',
        title: 'مدخل إلى علوم الحديث ورجاله',
        author: 'د. نور الدين عتر',
        language: 'العربية',
        categories: ['علوم الحديث', 'محاضرات أكاديمية'],
        tags: ['جامعة دمشق', 'منهج المحدثين'],
        bookType: 'hybrid',
        workType: 'lecture',
        workTypeId: 'wt-lecture',
        speaker: 'د. نور الدين عتر',
        hostInstitution: 'كلية الشريعة - جامعة دمشق',
        courseOrEventTitle: 'سلسلة المناهج التخصصية',
        durationMinutes: 95,
        recordingUrl: 'https://example.com/recordings/hadith-lecture-1.mp4',
        lendingHistory: [],
      };

      assert.strictEqual(lecture.workType, 'lecture');
      assert.strictEqual(lecture.speaker, 'د. نور الدين عتر');
      assert.strictEqual(lecture.durationMinutes, 95);
      assert.strictEqual(isLecture(lecture), true);
    });

    it('supports periodicals and magazines with issue, volume, and ISSN', () => {
      const magazine: BookItem = {
        id: 'mag-001',
        title: 'مجلة الرسالة',
        author: 'أحمد حسن الزيات (رئيس التحرير)',
        language: 'العربية',
        categories: ['أدب وثقافة', 'دوريات تاريخية'],
        tags: ['القاهرة', 'النهضة الأدبية'],
        bookType: 'physical',
        workType: 'periodical',
        workTypeId: 'wt-periodical',
        periodicalTitle: 'مجلة الرسالة الأسبوعية',
        issueNumber: 250,
        volumeNumber: 5,
        publicationSeasonOrMonth: 'شوال 1356هـ / ديسمبر 1937م',
        issn: '1110-2586',
        shelf: 'رف المجلات الأدبية - خزانة 2',
        room: 'المكتبة التراثية',
        condition: 'أثرية/قديمة',
        lendingHistory: [],
      };

      assert.strictEqual(magazine.workType, 'periodical');
      assert.strictEqual(magazine.issueNumber, 250);
      assert.strictEqual(magazine.issn, '1110-2586');
      assert.strictEqual(isPeriodical(magazine), true);
    });

    it('supports historical manuscripts with codex, scribe, and script type', () => {
      const manuscript: BookItem = {
        id: 'ms-001',
        title: 'كتاب سيبويه',
        author: 'عمرو بن عثمان بن قنبر (سيبويه)',
        language: 'العربية',
        categories: ['نحو ولغة', 'مخطوطات أثرية'],
        tags: ['نادر', 'خزانة بغداد'],
        bookType: 'physical',
        workType: 'manuscript',
        workTypeId: 'wt-manuscript',
        holdingInstitution: 'دار الكتب والوثائق القومية',
        codexOrShelfmark: 'مخطوط رقم 144/نحو',
        scribe: 'علي بن الحسين البغدادي',
        scriptType: 'خط نسخ مشرقي قديم',
        folioCount: 312,
        shelf: 'خزنة المخطوطات المحمية',
        room: 'قاعة النفائس',
        condition: 'أثرية/قديمة',
        lendingHistory: [],
      };

      assert.strictEqual(manuscript.workType, 'manuscript');
      assert.strictEqual(manuscript.codexOrShelfmark, 'مخطوط رقم 144/نحو');
      assert.strictEqual(manuscript.scriptType, 'خط نسخ مشرقي قديم');
      assert.strictEqual(isManuscript(manuscript), true);
    });
  });
});
