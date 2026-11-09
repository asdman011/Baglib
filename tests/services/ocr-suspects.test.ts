import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  findOcrSuspects,
  detectHeuristicSuspectReason,
  applyWordCorrection,
} from '../../src/shared/ocr-suspects';
import type { OcrWord } from '../../src/shared/types/ocr';

describe('KEY-275 OCR Suspect Detection & Review Service', () => {
  it('identifies words below confidence threshold as score-based suspects', () => {
    const words: OcrWord[] = [
      { text: 'كتاب', bbox: { x: 100, y: 10, width: 50, height: 20 }, confidence: 0.95 },
      { text: 'العلم', bbox: { x: 40, y: 10, width: 50, height: 20 }, confidence: 0.45 },
      { text: 'معروف', bbox: { x: 0, y: 10, width: 40, height: 20 }, confidence: 0.88 },
    ];

    const suspects = findOcrSuspects(words, { threshold: 0.6, isRtl: true });
    assert.equal(suspects.length, 1);
    assert.equal(suspects[0].word.text, 'العلم');
    assert.equal(suspects[0].kind, 'confidence');
    assert.equal(suspects[0].confidence, 0.45);
    assert.equal(suspects[0].originalIndex, 1);
  });

  it('detects heuristic suspects when confidence is missing', () => {
    const words: OcrWord[] = [
      { text: 'طبيعي', bbox: { x: 100, y: 10, width: 50, height: 20 } }, // normal
      { text: 'Bookكتاب', bbox: { x: 50, y: 10, width: 50, height: 20 } }, // mixed script
      { text: 'س', bbox: { x: 20, y: 10, width: 10, height: 20 } }, // isolated non-standalone letter
      { text: 'كلمة\uFFFD', bbox: { x: 0, y: 10, width: 20, height: 20 } }, // replacement char
    ];

    const suspects = findOcrSuspects(words, { isRtl: true });
    assert.equal(suspects.length, 3);
    assert.equal(suspects[0].word.text, 'Bookكتاب');
    assert.equal(suspects[0].kind, 'heuristic');
    assert.equal(suspects[0].heuristicReason, 'mixed-scripts');

    assert.equal(suspects[1].word.text, 'س');
    assert.equal(suspects[1].kind, 'heuristic');
    assert.equal(suspects[1].heuristicReason, 'isolated-arabic');

    assert.equal(suspects[2].word.text, 'كلمة\uFFFD');
    assert.equal(suspects[2].kind, 'heuristic');
    assert.equal(suspects[2].heuristicReason, 'invalid-chars');
  });

  it('permits valid standalone Arabic prepositions/conjunctions without false positives', () => {
    const words: OcrWord[] = [
      { text: 'و', bbox: { x: 100, y: 10, width: 10, height: 20 } },
      { text: 'ف', bbox: { x: 80, y: 10, width: 10, height: 20 } },
      { text: 'ب', bbox: { x: 60, y: 10, width: 10, height: 20 } },
      { text: 'ل', bbox: { x: 40, y: 10, width: 10, height: 20 } },
      { text: 'ك', bbox: { x: 20, y: 10, width: 10, height: 20 } },
    ];

    for (const w of words) {
      assert.equal(detectHeuristicSuspectReason(w.text), null, `"${w.text}" should not be flagged`);
    }
  });

  it('sorts suspects by reading order: RTL (Arabic) vs LTR (English)', () => {
    // Two lines, each with 2 words
    // Line 1 (y: 20): right word (x: 200), left word (x: 50)
    // Line 2 (y: 60): right word (x: 200), left word (x: 50)
    const words: OcrWord[] = [
      { text: 'line2-left', bbox: { x: 50, y: 60, width: 40, height: 20 }, confidence: 0.3 },
      { text: 'line1-left', bbox: { x: 50, y: 20, width: 40, height: 20 }, confidence: 0.4 },
      { text: 'line2-right', bbox: { x: 200, y: 60, width: 40, height: 20 }, confidence: 0.2 },
      { text: 'line1-right', bbox: { x: 200, y: 20, width: 40, height: 20 }, confidence: 0.5 },
    ];

    // In RTL reading order: line 1 top-to-bottom, right-to-left -> line1-right, line1-left, line2-right, line2-left
    const rtlSuspects = findOcrSuspects(words, { isRtl: true });
    assert.deepEqual(rtlSuspects.map(s => s.word.text), [
      'line1-right',
      'line1-left',
      'line2-right',
      'line2-left',
    ]);

    // In LTR reading order: line 1 top-to-bottom, left-to-right -> line1-left, line1-right, line2-left, line2-right
    const ltrSuspects = findOcrSuspects(words, { isRtl: false });
    assert.deepEqual(ltrSuspects.map(s => s.word.text), [
      'line1-left',
      'line1-right',
      'line2-left',
      'line2-right',
    ]);
  });

  it('normalizes Arabic for dictionary lookup without modifying original text', () => {
    const rawWord = 'الْحَيَاةُ؛';
    const mockDictionary = new Set(['الحياة']);

    const isMatch = (word: string, dict: Set<string>) => {
      // Strips tashkeel and punctuation, preserves original for display
      const normalized = word.replace(/[\u064b-\u065f\u0670\u0640]/gu, '').replace(/[^\p{L}\p{N}]/gu, '');
      return dict.has(normalized);
    };

    assert.equal(isMatch(rawWord, mockDictionary), true);
    assert.equal(rawWord, 'الْحَيَاةُ؛'); // Unmodified
  });

  it('applies word correction and produces updated page text and line text', () => {
    const pageResult = {
      pageNumber: 1,
      text: 'وكان شهد بدراء وهو أحد',
      lines: [
        {
          text: 'وكان شهد بدراء وهو أحد',
          bbox: { x: 100, y: 20, width: 200, height: 30 },
          words: [
            { text: 'وكان', bbox: { x: 250, y: 20, width: 40, height: 30 }, confidence: 0.9 },
            { text: 'شهد', bbox: { x: 200, y: 20, width: 40, height: 30 }, confidence: 0.9 },
            { text: 'بدراء', bbox: { x: 150, y: 20, width: 40, height: 30 }, confidence: 0.5 },
            { text: 'وهو', bbox: { x: 120, y: 20, width: 25, height: 30 }, confidence: 0.9 },
            { text: 'أحد', bbox: { x: 100, y: 20, width: 20, height: 30 }, confidence: 0.9 },
          ],
        },
      ],
      words: [
        { text: 'وكان', bbox: { x: 250, y: 20, width: 40, height: 30 }, confidence: 0.9 },
        { text: 'شهد', bbox: { x: 200, y: 20, width: 40, height: 30 }, confidence: 0.9 },
        { text: 'بدراء', bbox: { x: 150, y: 20, width: 40, height: 30 }, confidence: 0.5 },
        { text: 'وهو', bbox: { x: 120, y: 20, width: 25, height: 30 }, confidence: 0.9 },
        { text: 'أحد', bbox: { x: 100, y: 20, width: 20, height: 30 }, confidence: 0.9 },
      ],
      width: 1000,
      height: 1400,
      engine: 'ocrmypdf' as const,
      durationMs: 100,
    };

    const updated = applyWordCorrection(pageResult, 2, 'بدراً');
    assert.equal(updated.words[2].text, 'بدراً');
    assert.equal(updated.lines[0].words[2].text, 'بدراً');
    assert.equal(updated.lines[0].text, 'وكان شهد بدراً وهو أحد');
    assert.equal(updated.text, 'وكان شهد بدراً وهو أحد');
  });
});
