import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeArabicText,
  normalizeSearchString,
  stripArabicDiacritics,
  buildAlignmentMap,
  findMatchesInText,
  formatFts5Query,
  matchesSearchQuery,
} from '../../src/shared/utils/text-normalizer';

describe('KEY-140 Arabic & Multilingual Morphology Normalizer', () => {
  describe('1. Tashkeel, Diacritics & Tatweel Stripping', () => {
    it('strips all classical Arabic Harakat and Tashkeel correctly', () => {
      const vowelled = 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ';
      const stripped = stripArabicDiacritics(vowelled);
      assert.equal(stripped, 'بسم الله الرحمن الرحيم');
    });

    it('strips Tatweel (Kashida) while maintaining readable text', () => {
      const stretched = 'كـــــتــــاب فـــلـــســـفـــة';
      const normalized = normalizeArabicText(stretched);
      assert.ok(!normalized.includes('ـ'));
      assert.ok(normalized.includes('كتاب'));
      assert.ok(normalized.includes('فلسفه'));
    });
  });

  describe('2. Orthographic Variant Normalization', () => {
    it('normalizes all Alef variants (أ, إ, آ, ٱ) to bare Alef (ا)', () => {
      assert.equal(normalizeArabicText('أحمد'), 'احمد');
      assert.equal(normalizeArabicText('إبراهيم'), 'ابراهيم');
      assert.equal(normalizeArabicText('آثار'), 'اثار');
      assert.equal(normalizeArabicText('ٱبن'), 'ابن');
    });

    it('normalizes Taa Marbuta (ة) to Haa (ه)', () => {
      assert.equal(normalizeArabicText('مقدمة'), 'مقدمه');
      assert.equal(normalizeArabicText('فلسفة الحضارة'), 'فلسفه الحضاره');
    });

    it('normalizes Alef Maksura (ى) to Yaa (ي)', () => {
      assert.equal(normalizeArabicText('على'), 'علي');
      assert.equal(normalizeArabicText('موسى'), 'موسي');
    });

    it('normalizes Waw with Hamza (ؤ) and Yaa with Hamza (ئ)', () => {
      assert.equal(normalizeArabicText('مؤلف'), 'مولف');
      assert.equal(normalizeArabicText('قارئ'), 'قاري');
    });
  });

  describe('3. Character Index Alignment & Exact Original Highlighting', () => {
    it('accurately maps normalized search back to vowelled source text', () => {
      const rawText = 'إِنَّ التَّارِيخَ فِي ظَاهِرِهِ لَا يَزِيدُ عَلَى الْإِخْبَارِ';
      const query = 'التاريخ';

      const matches = findMatchesInText(rawText, query);
      assert.equal(matches.length, 1);
      assert.equal(matches[0].matchText, 'التَّارِيخَ');
      assert.ok(matches[0].fullSnippet.includes('<mark>التَّارِيخَ</mark>'));
    });

    it('finds multiple occurrences in a paragraph without dropping vowels', () => {
      const rawText = 'قال ابن خلدون: فالعُمْرَانُ هو الأصل. وكل عِمْرَانٍ بشري له أجل.';
      const query = 'عمران';

      const matches = findMatchesInText(rawText, query);
      assert.equal(matches.length, 2);
      assert.equal(matches[0].matchText, 'عُمْرَانُ');
      assert.equal(matches[1].matchText, 'عِمْرَانٍ');
    });

    it('respects whole-word boundaries when requested', () => {
      const rawText = 'تاريخ المؤرخون يقرأون التاريخ بتأمل';
      const allMatches = findMatchesInText(rawText, 'تاريخ', { matchWholeWord: false });
      assert.equal(allMatches.length, 2); // 'تاريخ' and 'التاريخ'

      const wordMatches = findMatchesInText(rawText, 'تاريخ', { matchWholeWord: true });
      assert.equal(wordMatches.length, 1);
      assert.equal(wordMatches[0].matchText, 'تاريخ');
    });
  });

  describe('4. FTS5 Query Syntax Formatter', () => {
    it('normalizes Arabic tokens while preserving Boolean AND, OR, NOT', () => {
      const raw = 'التاريخ AND "علم العمران" OR فلسفة NOT خرافة';
      const ftsQuery = formatFts5Query(raw);

      assert.ok(ftsQuery.includes('التاريخ') || ftsQuery.includes('تاريخ'));
      assert.ok(ftsQuery.includes('AND'));
      assert.ok(ftsQuery.includes('OR'));
      assert.ok(ftsQuery.includes('NOT'));
      assert.ok(ftsQuery.includes('"علم العمران"') || ftsQuery.includes('"علم عمران"'));
    });

    it('preserves prefix wildcard operators (*)', () => {
      const raw = 'مقد* AND خلد*';
      const ftsQuery = formatFts5Query(raw);

      assert.ok(ftsQuery.includes('*'));
      assert.ok(ftsQuery.includes('AND'));
    });
  });
});
