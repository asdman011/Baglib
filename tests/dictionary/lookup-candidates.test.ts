import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  stripArabicDiacritics,
  normalizeArabicLetters,
  stripArabicAffixes,
  extractArabicRoots,
  buildLookupCandidates,
} from '../../src/shared/utils/lookup-candidates';

describe('KEY-142 Arabic Root & Morphology Candidate Generation', () => {
  describe('stripArabicDiacritics', () => {
    it('strips all Harakat diacritics including Tanwin and Shadda', () => {
      const input = 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ';
      const output = stripArabicDiacritics(input);
      assert.equal(output, 'بسم الله الرحمن الرحيم');
    });

    it('strips Tatweel (Kashida)', () => {
      const input = 'كــــتــــاب';
      const output = stripArabicDiacritics(input);
      assert.equal(output, 'كتاب');
    });
  });

  describe('normalizeArabicLetters', () => {
    it('normalizes Hamza forms to Alif and Ta Marbuta to Ha', () => {
      const input = 'أحمد إبراهيم آمنة مكتبة';
      const output = normalizeArabicLetters(input);
      assert.equal(output, 'احمد ابراهيم امنه مكتبه');
    });

    it('normalizes Alif Maqsura to Ya', () => {
      const input = 'موسى وعيسى';
      const output = normalizeArabicLetters(input);
      assert.equal(output, 'موسي وعيسي');
    });
  });

  describe('stripArabicAffixes', () => {
    it('strips common proclitics (الـ, و, ف, ب, ك, ل)', () => {
      const stems = stripArabicAffixes('بِالْمُعَلِّمِينَ');
      assert.ok(stems.includes('معلمين') || stems.includes('معلم'));
    });

    it('strips common enclitics (ها, هم, كم, ين, ات, ون)', () => {
      const stems = stripArabicAffixes('كِتَابُهُمْ');
      assert.ok(stems.includes('كتاب'));
    });

    it('strips combined prefixes and suffixes', () => {
      const stems = stripArabicAffixes('فَاسْتَخْرَجَهَا');
      assert.ok(stems.includes('استخرج') || stems.includes('استخرجها'));
    });
  });

  describe('extractArabicRoots', () => {
    it('extracts triliteral root from complex derived Arabic words (Lisan al-Arab pattern)', () => {
      const root1 = extractArabicRoots('كِتَابُهُمْ');
      assert.ok(root1.includes('كتب'), 'Should identify root كتب for كتابهم');

      const root2 = extractArabicRoots('بِالْمُعَلِّمِينَ');
      assert.ok(root2.includes('علم'), 'Should identify root علم for بالمعلمين');

      const root3 = extractArabicRoots('فَاسْتَخْرَجَهَا');
      assert.ok(root3.includes('خرج'), 'Should identify root خرج for فاستخرجها');

      const root4 = extractArabicRoots('تَدَارَسُوا');
      assert.ok(root4.includes('درس'), 'Should identify root درس for تدارسوا');
    });

    it('identifies quadriliteral roots directly', () => {
      const roots = extractArabicRoots('دَحْرَجَ');
      assert.ok(roots.includes('دحرج'), 'Should retain quadriliteral root دحرج');
    });
  });

  describe('buildLookupCandidates', () => {
    it('generates prioritized candidate tokens with exact, unvocalized, stems, and roots', () => {
      const candidates = buildLookupCandidates('كِتَابُهُمْ');
      assert.ok(candidates.length > 0);

      // Exact should have highest weight
      assert.equal(candidates[0]?.token, 'كِتَابُهُمْ');
      assert.equal(candidates[0]?.type, 'exact');

      // Unvocalized should be present
      const tokens = candidates.map((c) => c.token);
      assert.ok(tokens.includes('كتابهم'));
      assert.ok(tokens.includes('كتاب'));
      assert.ok(tokens.includes('كتب'));
    });

    it('generates case variants and Latin diacritic folding for English words', () => {
      const candidates = buildLookupCandidates('Café');
      const tokens = candidates.map((c) => c.token);
      assert.ok(tokens.includes('Café'));
      assert.ok(tokens.includes('café'));
      assert.ok(tokens.includes('cafe'));
    });

    it('handles empty or whitespace-only words gracefully', () => {
      assert.deepEqual(buildLookupCandidates(''), []);
      assert.deepEqual(buildLookupCandidates('   '), []);
    });
  });
});
