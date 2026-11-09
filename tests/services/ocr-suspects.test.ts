import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  findOcrSuspects,
  detectHeuristicSuspectReason,
  applyWordCorrection,
  applyStoredCorrections,
  ocrCorrectionsKey,
  ocrAcceptedKey,
  legacyOcrCorrectionsKey,
  legacyOcrAcceptedKey,
  resolveAndMigratePageCorrections,
} from '../../src/shared/ocr-suspects';
import type { OcrPageResult, OcrWord } from '../../src/shared/types/ocr';

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
    const words: OcrWord[] = [
      { text: 'line2-left', bbox: { x: 50, y: 60, width: 40, height: 20 }, confidence: 0.3 },
      { text: 'line1-left', bbox: { x: 50, y: 20, width: 40, height: 20 }, confidence: 0.4 },
      { text: 'line2-right', bbox: { x: 200, y: 60, width: 40, height: 20 }, confidence: 0.2 },
      { text: 'line1-right', bbox: { x: 200, y: 20, width: 40, height: 20 }, confidence: 0.5 },
    ];

    const rtlSuspects = findOcrSuspects(words, { isRtl: true });
    assert.deepEqual(rtlSuspects.map(s => s.word.text), [
      'line1-right',
      'line1-left',
      'line2-right',
      'line2-left',
    ]);

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
      const normalized = word.replace(/[\u064b-\u065f\u0670\u0640]/gu, '').replace(/[^\p{L}\p{N}]/gu, '');
      return dict.has(normalized);
    };

    assert.equal(isMatch(rawWord, mockDictionary), true);
    assert.equal(rawWord, 'الْحَيَاةُ؛');
  });

  it('applies word correction and produces updated page text and line text', () => {
    const pageResult: OcrPageResult = {
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
      engine: 'ocrmypdf',
      durationMs: 100,
    };

    const updated = applyWordCorrection(pageResult, 2, 'بدراً');
    assert.equal(updated.words[2].text, 'بدراً');
    assert.equal(updated.lines[0].words[2].text, 'بدراً');
    assert.equal(updated.lines[0].text, 'وكان شهد بدراً وهو أحد');
    assert.equal(updated.text, 'وكان شهد بدراً وهو أحد');
  });

  const baseSamplePage: OcrPageResult = {
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
    engine: 'ocrmypdf',
    durationMs: 100,
  };

  it('safely applies stored corrections on happy path matching original text and engine', () => {
    const corrections = {
      2: { original: 'بدراء', corrected: 'بدراً', engine: 'ocrmypdf' },
    };

    const res = applyStoredCorrections(baseSamplePage, corrections);
    assert.equal(res.appliedCount, 1);
    assert.equal(res.staleCorrections.length, 0);
    assert.equal(res.patchedResult.words[2].text, 'بدراً');
    assert.equal(res.patchedResult.text, 'وكان شهد بدراً وهو أحد');
  });

  it('rejects corrections when word text at index shifted (re-OCR shifted indices)', () => {
    // Simulate re-OCR where an extra token inserted earlier shifted indices:
    // Index 2 is now 'شهد', while saved correction expected 'بدراء' at index 2
    const shiftedPage: OcrPageResult = {
      ...baseSamplePage,
      words: [
        { text: 'قد', bbox: { x: 280, y: 20, width: 20, height: 30 }, confidence: 0.9 },
        { text: 'وكان', bbox: { x: 250, y: 20, width: 40, height: 30 }, confidence: 0.9 },
        { text: 'شهد', bbox: { x: 200, y: 20, width: 40, height: 30 }, confidence: 0.9 },
        { text: 'بدراء', bbox: { x: 150, y: 20, width: 40, height: 30 }, confidence: 0.5 },
      ],
    };

    const corrections = {
      2: { original: 'بدراء', corrected: 'بدراً', engine: 'ocrmypdf' },
    };

    const res = applyStoredCorrections(shiftedPage, corrections);
    assert.equal(res.appliedCount, 0);
    assert.equal(res.staleCorrections.length, 1);
    assert.equal(res.staleCorrections[0].reason, 'text-mismatch');
    assert.equal(res.staleCorrections[0].original, 'بدراء');
    assert.equal(res.staleCorrections[0].corrected, 'بدراً');
    // Ensure word at index 2 ('شهد') was NOT overwritten
    assert.equal(res.patchedResult.words[2].text, 'شهد');
  });

  it('rejects corrections when engine does not match (engine switch)', () => {
    const corrections = {
      2: { original: 'بدراء', corrected: 'بدراً', engine: 'paddleocr-vl' },
    };

    const res = applyStoredCorrections(baseSamplePage, corrections, 'ocrmypdf');
    assert.equal(res.appliedCount, 0);
    assert.equal(res.staleCorrections.length, 1);
    assert.equal(res.staleCorrections[0].reason, 'engine-mismatch');
    assert.equal(res.patchedResult.words[2].text, 'بدراء');
  });

  it('treats legacy shape Record<index, string> as stale and never applies blindly', () => {
    const legacyCorrections = {
      2: 'بدراً',
    };

    const res = applyStoredCorrections(baseSamplePage, legacyCorrections);
    assert.equal(res.appliedCount, 0);
    assert.equal(res.staleCorrections.length, 1);
    assert.equal(res.staleCorrections[0].reason, 'legacy-shape');
    assert.equal(res.staleCorrections[0].corrected, 'بدراً');
    assert.equal(res.patchedResult.words[2].text, 'بدراء');
  });

  it('flags index out of bounds as stale when page word count decreased', () => {
    const corrections = {
      99: { original: 'غير-موجود', corrected: 'تصحيح', engine: 'ocrmypdf' },
    };

    const res = applyStoredCorrections(baseSamplePage, corrections);
    assert.equal(res.appliedCount, 0);
    assert.equal(res.staleCorrections.length, 1);
    assert.equal(res.staleCorrections[0].reason, 'index-out-of-bounds');
  });

  it('formats storage keys correctly for source and legacy book keys', () => {
    assert.equal(ocrCorrectionsKey('src-123', 5), 'ocr.corrections.v1:src-123:5');
    assert.equal(ocrAcceptedKey('src-123', 5), 'ocr.accepted.v1:src-123:5');
    assert.equal(legacyOcrCorrectionsKey('book-abc', 5), 'ocr.corrections.v1:book-abc:5');
    assert.equal(legacyOcrAcceptedKey('book-abc', 5), 'ocr.accepted.v1:book-abc:5');
    assert.equal(ocrCorrectionsKey(null, 5), null);
  });

  it('migrates legacy book-keyed data ONLY when work has exactly one source', async () => {
    const store = new Map<string, unknown>();
    store.set('ocr.corrections.v1:book-single:1', {
      2: { original: 'بدراء', corrected: 'بدراً', engine: 'ocrmypdf' },
    });
    store.set('ocr.accepted.v1:book-single:1', [0, 1]);

    const getSetting = async (k: string, def: unknown) => store.get(k) ?? def;
    const setSetting = async (k: string, v: unknown) => { store.set(k, v); };

    // Case 1: Exactly 1 source -> should migrate
    const migrated = await resolveAndMigratePageCorrections({
      sourceId: 'src-single',
      bookId: 'book-single',
      sourcesCount: 1,
      page: 1,
      getSetting,
      setSetting,
    });

    assert.equal(Object.keys(migrated.corrections).length, 1);
    assert.deepEqual(migrated.acceptedIndices, [0, 1]);
    // Verifies it wrote to source key
    assert.ok(store.has('ocr.corrections.v1:src-single:1'));
    assert.ok(store.has('ocr.accepted.v1:src-single:1'));

    // Case 2: Multi-source work (sourcesCount > 1) -> must NOT migrate book-keyed entries
    const storeMulti = new Map<string, unknown>();
    storeMulti.set('ocr.corrections.v1:book-multi:1', {
      2: { original: 'بدراء', corrected: 'بدراً', engine: 'ocrmypdf' },
    });
    const multiRes = await resolveAndMigratePageCorrections({
      sourceId: 'src-multi-2',
      bookId: 'book-multi',
      sourcesCount: 2,
      page: 1,
      getSetting: async (k: string, def: unknown) => storeMulti.get(k) ?? def,
      setSetting: async (k: string, v: unknown) => { storeMulti.set(k, v); },
    });

    assert.equal(Object.keys(multiRes.corrections).length, 0);
    assert.deepEqual(multiRes.acceptedIndices, []);
    assert.equal(storeMulti.has('ocr.corrections.v1:src-multi-2:1'), false);
  });
});
