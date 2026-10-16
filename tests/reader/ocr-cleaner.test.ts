import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanOcrText,
  resolveOcrLanguage,
  calculateOcrWordPercentBox,
} from '../../src/shared/utils/ocr-cleaner';

describe('KEY-141 OCR Cleaner & Coordinate Utilities', () => {
  describe('resolveOcrLanguage', () => {
    it('maps language codes correctly for Windows', () => {
      assert.equal(resolveOcrLanguage('ar', 'win32'), 'ar-SA');
      assert.equal(resolveOcrLanguage('ar-SA', 'win32'), 'ar-SA');
      assert.equal(resolveOcrLanguage('en', 'win32'), 'en-US');
      assert.equal(resolveOcrLanguage('en-US', 'win32'), 'en-US');
      assert.equal(resolveOcrLanguage('ja', 'win32'), 'ja');
      assert.equal(resolveOcrLanguage('auto', 'win32'), 'auto');
    });

    it('maps language codes correctly for macOS Vision', () => {
      assert.equal(resolveOcrLanguage('ar', 'darwin'), 'ar');
      assert.equal(resolveOcrLanguage('en', 'darwin'), 'en-US');
      assert.equal(resolveOcrLanguage('ja', 'darwin'), 'ja-JP');
      assert.equal(resolveOcrLanguage('fr', 'darwin'), 'fr-FR');
    });

    it('maps language codes correctly for Tesseract/Linux fallback', () => {
      assert.equal(resolveOcrLanguage('ar', 'linux'), 'ara');
      assert.equal(resolveOcrLanguage('en', 'linux'), 'eng');
      assert.equal(resolveOcrLanguage('fr', 'linux'), 'fra');
      assert.equal(resolveOcrLanguage('ja', 'linux'), 'jpn');
    });

    it('falls back to input when code is unmapped', () => {
      assert.equal(resolveOcrLanguage('custom-tag', 'win32'), 'custom-tag');
      assert.equal(resolveOcrLanguage(null, 'win32'), 'auto');
    });
  });

  describe('cleanOcrText', () => {
    it('removes spaces between CJK unified ideographs', () => {
      const raw = '符 号 学 与 现 代 文 学';
      const cleaned = cleanOcrText(raw);
      assert.equal(cleaned, '符号学与现代文学');
    });

    it('removes spaces between Japanese Kana characters', () => {
      const raw = 'ひ ら が な と カ タ カ ナ';
      const cleaned = cleanOcrText(raw);
      assert.equal(cleaned, 'ひらがなとカタカナ');
    });

    it('removes spaces between Korean Hangul syllables', () => {
      const raw = '대 한 민 국';
      const cleaned = cleanOcrText(raw);
      assert.equal(cleaned, '대한민국');
    });

    it('preserves spaces between English words and numbers', () => {
      const raw = 'Baglib Digital Library 2026';
      const cleaned = cleanOcrText(raw);
      assert.equal(cleaned, 'Baglib Digital Library 2026');
    });

    it('preserves spaces in mixed Arabic and English sentences', () => {
      const raw = 'مكتبة بغداد Baglib Library';
      const cleaned = cleanOcrText(raw);
      assert.equal(cleaned, 'مكتبة بغداد Baglib Library');
    });

    it('removes non-printable control characters and normalizes whitespace', () => {
      const raw = 'Line 1\x00\x07  with   extra   spaces\r\nLine 2\x1B\twith tab';
      const cleaned = cleanOcrText(raw);
      assert.equal(cleaned, 'Line 1 with extra spaces\nLine 2 with tab');
    });

    it('handles empty or null text safely', () => {
      assert.equal(cleanOcrText(''), '');
      assert.equal(cleanOcrText('   '), '');
    });
  });

  describe('calculateOcrWordPercentBox', () => {
    it('calculates exact CSS percentage coordinates for word boxes', () => {
      const bbox = { x: 100, y: 200, width: 300, height: 50 };
      const percentBox = calculateOcrWordPercentBox(bbox, 1000, 2000);

      assert.equal(percentBox.left, '10.00%');
      assert.equal(percentBox.top, '10.00%');
      assert.equal(percentBox.width, '30.00%');
      assert.equal(percentBox.height, '2.50%');
    });

    it('clamps coordinates safely when bounding boxes exceed boundaries', () => {
      const bbox = { x: -20, y: -10, width: 1200, height: 2200 };
      const percentBox = calculateOcrWordPercentBox(bbox, 1000, 2000);

      assert.equal(percentBox.left, '0.00%');
      assert.equal(percentBox.top, '0.00%');
      assert.equal(percentBox.width, '100.00%');
      assert.equal(percentBox.height, '100.00%');
    });

    it('gracefully handles zero or negative dimensions', () => {
      const bbox = { x: 50, y: 50, width: 100, height: 20 };
      const percentBox = calculateOcrWordPercentBox(bbox, 0, 0);

      assert.equal(percentBox.left, '0%');
      assert.equal(percentBox.top, '0%');
      assert.equal(percentBox.width, '0%');
      assert.equal(percentBox.height, '0%');
    });
  });
});
