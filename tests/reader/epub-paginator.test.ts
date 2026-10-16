import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  extractContentBlocks,
  paginateBookSections,
} from '../../src/renderer/libs/reader/epub-paginator';
import type { SectionItem, TOCItem } from '../../src/renderer/libs/reader/types';

describe('EPUB Paginator & Multi-Format Screen Chunking Engine Tests', () => {
  describe('1. Content Block Extraction & Sentence Boundary Splitting', () => {
    it('extracts plain text into paragraph blocks', () => {
      const text = 'Paragraph 1 text.\n\nParagraph 2 text.\n\nParagraph 3 text.';
      const blocks = extractContentBlocks(text);

      assert.equal(blocks.length, 3);
      assert.equal(blocks[0].tag, 'p');
      assert.equal(blocks[0].text, 'Paragraph 1 text.');
      assert.equal(blocks[1].text, 'Paragraph 2 text.');
      assert.equal(blocks[2].text, 'Paragraph 3 text.');
    });

    it('extracts structured HTML headings and paragraphs into discrete blocks', () => {
      const html = `
        <h1>باب في أصول العلم</h1>
        <p>العلم معرفة المعلوم على ما هو به في الواقع.</p>
        <h2>فصل في أقسام الإدراك</h2>
        <p>ينقسم الإدراك إلى ضروري ونظري.</p>
      `;
      const blocks = extractContentBlocks(html);

      assert.equal(blocks.length, 4);
      assert.equal(blocks[0].tag, 'h1');
      assert.ok(blocks[0].text.includes('أصول العلم'));
      assert.equal(blocks[1].tag, 'p');
      assert.equal(blocks[2].tag, 'h2');
      assert.equal(blocks[3].tag, 'p');
    });

    it('splits excessively long paragraphs at sentence boundaries', () => {
      // Create a 2500-char paragraph
      const sentence = 'هذه جملة توضيحية لشرح المسألة وبيان تفاصيلها الفقهية والأصولية بدقة واضحة. ';
      const longText = sentence.repeat(35); // ~2600 chars

      const blocks = extractContentBlocks(longText);
      assert.ok(blocks.length > 1, 'Should split long paragraph into multiple chunks');
      assert.ok(blocks.every((b) => b.text.length <= 1800));
    });
  });

  describe('2. Multi-Chapter Section Pagination (Eliminating Endless Scrolling)', () => {
    it('paginates a large chapter into multiple screen-sized pages instead of 1 compressed section', async () => {
      // Simulate an EPUB chapter with 10 paragraphs totaling ~5000 characters
      const paragraphs = Array.from({ length: 12 }, (_, i) => 
        `<p>فقرة تفصيلية رقم ${i + 1} تتناول المبحث العلمي بشرح موسع وتفاصيل دقيقة لاستعراض كافة الفروع المترتبة على القاعدة الأصولية مع التمثيل والتطبيق العملي. ويزداد الشرح بياناً بذكر أدلة الجمهور ومناقشة الاعتراضات الواردة عليها.</p>`
      ).join('\n');

      const mockSection: SectionItem = {
        id: 'chap_1',
        size: paragraphs.length,
        createDocument: async () => {
          return {
            body: {
              innerHTML: `<h1>الفصل الأول</h1>\n${paragraphs}`,
            },
          } as any;
        },
      };

      const result = await paginateBookSections([mockSection], undefined, 1200);

      // Verify that this single chapter was expanded into multiple pages
      assert.ok(result.pages.length >= 3, `Expected at least 3 pages, got ${result.pages.length}`);
      assert.equal(result.pages[0].pageNumber, 1);
      assert.equal(result.pages[result.pages.length - 1].pageNumber, result.pages.length);

      // Verify that all pages have comfortable character counts
      for (const page of result.pages) {
        assert.ok(page.text.length > 0);
        assert.ok(page.html.length > 0);
      }
    });

    it('maps Table of Contents items to accurate target page numbers', async () => {
      const section1: SectionItem = {
        id: 'intro',
        size: 800,
        loadText: async () => 'مقدمة الكتاب في بيان أهمية البحث ومنهج المؤلف.\n\nبيان خطة البحث وتقسيم الأبواب.',
      };

      // Long chapter 1 that will take 2-3 pages
      const longText = 'نص علمي مفصل يستغرق صفحات متعددة لاستيعاب المباحث. '.repeat(50);
      const section2: SectionItem = {
        id: 'chap_1',
        size: longText.length,
        loadText: async () => longText,
      };

      const section3: SectionItem = {
        id: 'chap_2',
        size: 500,
        loadText: async () => 'الفصل الثاني في الخاتمة والنتائج والتوصيات.',
      };

      const mockTOC: TOCItem[] = [
        { id: 't1', label: 'المقدمة', href: 'intro', index: 0 },
        { id: 't2', label: 'الفصل الأول', href: 'chap_1', index: 1 },
        { id: 't3', label: 'الفصل الثاني', href: 'chap_2', index: 2 },
      ];

      const result = await paginateBookSections([section1, section2, section3], mockTOC, 1000);

      // Section 1 should start at page 1
      assert.equal(result.sectionStartPages[0], 1);
      assert.equal(result.tocMap.get('t1'), 1);

      // Section 2 should start after Section 1
      const chap1Start = result.sectionStartPages[1];
      assert.ok(chap1Start > 1);
      assert.equal(result.tocMap.get('t2'), chap1Start);

      // Section 3 should start after Section 2
      const chap2Start = result.sectionStartPages[2];
      assert.ok(chap2Start > chap1Start);
      assert.equal(result.tocMap.get('t3'), chap2Start);
    });
  });

  describe('3. PDF Page Split Regex Integrity', () => {
    it('correctly splits multi-page extracted PDF text without empty-string fragmentation', () => {
      const pdfText = 'First Page Text\n---PAGE_SPLIT_MARKER---\nSecond Page Text\n---PAGE_SPLIT_MARKER---\nThird Page Text';
      const pageRegex = /(?:\r?\n---PAGE_SPLIT_MARKER---\r?\n|\f)/g;

      const rawPages = pdfText.split(pageRegex).map((p) => p.trim()).filter((p) => p.length > 0);

      assert.equal(rawPages.length, 3);
      assert.equal(rawPages[0], 'First Page Text');
      assert.equal(rawPages[1], 'Second Page Text');
      assert.equal(rawPages[2], 'Third Page Text');
    });
  });
});
