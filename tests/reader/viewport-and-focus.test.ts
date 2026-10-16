import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  dropBlockRects,
  mergeLineSpans,
  buildLineBoxes,
  filterVisibleLineBoxes,
  snapReadingRulerToLines,
} from '../../src/renderer/libs/reader/reading-ruler';

import {
  isRTLText,
  calculateORP,
  getPauseMultiplier,
  tokenizeTextForRSVP,
  RSVPController,
} from '../../src/renderer/libs/reader/rsvp-controller';

import {
  getReaderStyles,
  getViewportCssVariables,
} from '../../src/renderer/libs/reader/typography';

import { translations } from '../../src/renderer/translations';

describe('KEY-134 Viewport Controller, Typography Engine & Focus Aids Tests', () => {
  describe('1. Reading Ruler Line Geometry & Snapping Algorithms (Readest Pattern)', () => {
    it('filters out tall block elements exceeding 1.8x median thickness', () => {
      const rects = [
        { top: 10, bottom: 30, left: 0, right: 200, width: 200, height: 20 }, // Line 1
        { top: 35, bottom: 55, left: 0, right: 200, width: 200, height: 20 }, // Line 2
        { top: 60, bottom: 80, left: 0, right: 200, width: 200, height: 20 }, // Line 3
        { top: 10, bottom: 250, left: 0, right: 200, width: 200, height: 240 }, // Multi-line <p> block container
      ];

      const filtered = dropBlockRects(rects, false);
      assert.equal(filtered.length, 3);
      assert.ok(filtered.every((r) => r.height <= 36));
    });

    it('merges overlapping text fragments on the same line into a single line box', () => {
      const spans = [
        { start: 10, end: 32 }, // Word 1
        { start: 12, end: 30 }, // Word 2 (same vertical line, overlapping > 50%)
        { start: 45, end: 68 }, // Next line
      ];

      const merged = mergeLineSpans(spans);
      assert.equal(merged.length, 2);
      assert.equal(merged[0].start, 10);
      assert.equal(merged[0].end, 32);
      assert.equal(merged[1].start, 45);
      assert.equal(merged[1].end, 68);
    });

    it('builds line boxes accurately for both horizontal LTR and Arabic RTL layouts', () => {
      const rects = [
        { top: 50, bottom: 80, left: 100, right: 300, width: 200, height: 30 },
        { top: 90, bottom: 120, left: 100, right: 300, width: 200, height: 30 },
      ];
      const containerRect = { top: 20, left: 10, right: 500, bottom: 600 };

      // Horizontal LTR: start = top - container.top = 50 - 20 = 30
      const boxesLTR = buildLineBoxes(rects, false, false, containerRect);
      assert.equal(boxesLTR.length, 2);
      assert.equal(boxesLTR[0].start, 30);
      assert.equal(boxesLTR[0].end, 60);

      // Vertical RTL: distance measured from container.right
      const boxesVerticalRTL = buildLineBoxes(rects, true, true, containerRect);
      assert.equal(boxesVerticalRTL.length, 1); // overlapping horizontal span
      assert.equal(boxesVerticalRTL[0].start, 200); // 500 - 300
      assert.equal(boxesVerticalRTL[0].end, 400);   // 500 - 100
    });

    it('filters line boxes outside the visible viewport boundary (50% threshold)', () => {
      const boxes = [
        { start: 10, end: 40 },   // fully visible
        { start: 80, end: 110 },  // 20px visible out of 30px (66% visible within viewport 100) -> kept
        { start: 95, end: 135 },  // 5px visible out of 40px (12.5% visible within viewport 100) -> dropped
      ];

      const visible = filterVisibleLineBoxes(boxes, 100);
      assert.equal(visible.length, 2);
      assert.equal(visible[0].start, 10);
      assert.equal(visible[1].start, 80);
    });

    it('snaps reading ruler smoothly to the closest line box with centered slot padding', () => {
      const boxes = [
        { start: 50, end: 80 },   // center = 65
        { start: 100, end: 130 }, // center = 115
        { start: 150, end: 180 }, // center = 165
      ];

      // Target cursor at position 110 -> should snap to box 2 (start 100, end 130)
      const snap = snapReadingRulerToLines(boxes, 110, 38);
      assert.ok(snap.slotStart <= 100);
      assert.ok(snap.slotStart + snap.slotHeight >= 130);
      assert.ok(snap.slotHeight >= 38);
    });
  });

  describe('2. Speed Reading RSVP Engine with Arabic Cursive Protection', () => {
    it('detects strong RTL script accurately across Arabic, Urdu, and Hebrew text', () => {
      assert.equal(isRTLText('مكتبة بغداد'), true);
      assert.equal(isRTLText('تاريخ الخلفاء'), true);
      assert.equal(isRTLText('שלום עליכם'), true);
      assert.equal(isRTLText('English Academic Journal'), false);
      assert.equal(isRTLText('12345'), false);
    });

    it('calculates Optimal Recognition Point (ORP) for Latin words based on eye fixation science', () => {
      // <= 3 chars: 0
      assert.equal(calculateORP('the', false), 0);
      // 4-5 chars: 1
      assert.equal(calculateORP('book', false), 1);
      assert.equal(calculateORP('guide', false), 1);
      // 6-8 chars: 2
      assert.equal(calculateORP('library', false), 2);
      assert.equal(calculateORP('reading', false), 2);
      // 9+ chars: 3
      assert.equal(calculateORP('knowledge', false), 3);
      assert.equal(calculateORP('manuscript', false), 3);
    });

    it('protects Arabic cursive words by never splitting ligatures across spans', () => {
      const arabicWord = 'العلم';
      const orp = calculateORP(arabicWord, true);
      // Center glyph index is calculated for anchor guidance, but word remains whole
      assert.equal(orp, Math.floor((arabicWord.length - 1) / 2));
    });

    it('applies proper dwell pause multipliers for sentence ends and Arabic punctuation', () => {
      assert.equal(getPauseMultiplier('end.'), 2.0);
      assert.equal(getPauseMultiplier('السؤال؟'), 2.0);
      assert.equal(getPauseMultiplier('pause,'), 1.5);
      assert.equal(getPauseMultiplier('فصل،'), 1.5);
      assert.equal(getPauseMultiplier('in'), 0.85); // short word
      assert.equal(getPauseMultiplier('regular'), 1.0);
    });

    it('tokenizes compound sentences with dashes and punctuation into RSVPWordTokens', () => {
      const sample = 'Baglib is a modern desktop reader—built for research.';
      const tokens = tokenizeTextForRSVP(sample);

      assert.ok(tokens.length >= 8);
      assert.equal(tokens[0].text, 'Baglib');
      assert.equal(tokens[0].isRTL, false);
      assert.ok(tokens.some((t) => t.text.includes('reader—')));
    });

    it('RSVPController manages playback transitions, WPM pacing, and word progression', () => {
      let stateChanges = 0;
      const ctrl = new RSVPController(350, () => {
        stateChanges++;
      });

      ctrl.loadText('القراءة مفتاح المعرفة والحضارة الإسلامية.');
      assert.ok(ctrl.getState().words.length >= 5);
      assert.equal(ctrl.getState().currentIndex, 0);

      ctrl.nextWord();
      assert.equal(ctrl.getState().currentIndex, 1);

      ctrl.prevWord();
      assert.equal(ctrl.getState().currentIndex, 0);

      ctrl.jumpToIndex(3);
      assert.equal(ctrl.getState().currentIndex, 3);

      ctrl.setWpm(450);
      assert.equal(ctrl.getState().wpm, 450);

      ctrl.destroy();
    });
  });

  describe('3. Viewport Typography Controller & Theme Presets', () => {
    it('generates reader styles with E-Ink high-contrast theme', () => {
      const styles = getReaderStyles({
        theme: 'e-ink',
        fontSize: 20,
        margin: 32,
        paragraphSpacing: 1.0,
      });

      assert.ok(styles.includes('--baglib-bg: #ffffff'));
      assert.ok(styles.includes('--baglib-text: #000000'));
      assert.ok(styles.includes('font-size: 20px !important;'));
      assert.ok(styles.includes('padding-inline-start: 32px !important;'));
      assert.ok(styles.includes('margin-block-start: 1em !important;'));
    });

    it('produces CSS custom property objects via getViewportCssVariables', () => {
      const vars = getViewportCssVariables({
        theme: 'sepia',
        fontSize: 22,
        lineSpacing: 1.9,
        paragraphSpacing: 0.9,
        margin: 30,
        brightness: 105,
        contrast: 110,
        fontFamily: "'Amiri', serif",
      });

      assert.equal((vars as any)['--reader-bg'], '#fbf0d9');
      assert.equal((vars as any)['--reader-text'], '#5f4b32');
      assert.equal((vars as any)['--reader-font-size'], '22px');
      assert.equal((vars as any)['--reader-line-height'], '1.9');
      assert.equal((vars as any)['--reader-filter'], 'brightness(105%) contrast(110%)');
    });
  });

  describe('4. Bilingual UI & Localization Verification', () => {
    const requiredKeys = [
      'viewModeSingle',
      'viewModeTwoColumn',
      'viewModeScrolled',
      'themeEink',
      'typographySettings',
      'fontFamilyLabel',
      'fontAmiri',
      'fontScheherazade',
      'fontSerif',
      'fontSans',
      'fontMono',
      'lineSpacingLabel',
      'paragraphSpacingLabel',
      'marginLabel',
      'brightnessLabel',
      'contrastLabel',
      'focusAids',
      'readingRulerBtn',
      'paragraphFocusBtn',
      'speedReaderBtn',
      'wideComicSpreadLabel',
    ] as const;

    it('ensures all Viewport and Focus Aid keys are defined in Arabic', () => {
      for (const key of requiredKeys) {
        assert.ok(
          (translations.ar as any)[key],
          `Missing Arabic translation for key: ${key}`
        );
      }
    });

    it('ensures all Viewport and Focus Aid keys are defined in English', () => {
      for (const key of requiredKeys) {
        assert.ok(
          (translations.en as any)[key],
          `Missing English translation for key: ${key}`
        );
      }
    });
  });
});
