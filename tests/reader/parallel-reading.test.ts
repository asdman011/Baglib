import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateReadingFraction,
  calculateProportionalPage,
  ParallelSyncController,
} from '../../src/renderer/libs/reader/parallel-sync';

import { translations } from '../../src/renderer/translations';

describe('KEY-135 Split-Screen Parallel Reading Workspace Tests', () => {
  describe('1. Proportional Reading Fraction Calculation (Readest Multi-ID Pattern)', () => {
    it('returns 0 for first page or single-page documents', () => {
      assert.equal(calculateReadingFraction(1, 100), 0);
      assert.equal(calculateReadingFraction(0, 100), 0);
      assert.equal(calculateReadingFraction(1, 1), 0);
      assert.equal(calculateReadingFraction(1, 0), 0);
    });

    it('returns 1 for last page or beyond', () => {
      assert.equal(calculateReadingFraction(100, 100), 1);
      assert.equal(calculateReadingFraction(105, 100), 1);
    });

    it('calculates accurate intermediate fractions', () => {
      // 5 of 9: (5 - 1) / (9 - 1) = 4 / 8 = 0.5
      assert.equal(calculateReadingFraction(5, 9), 0.5);
      // 26 of 51: (26 - 1) / (51 - 1) = 25 / 50 = 0.5
      assert.equal(calculateReadingFraction(26, 51), 0.5);
      // 25 of 100: (25 - 1) / (100 - 1) = 24 / 99 ≈ 0.2424...
      const frac = calculateReadingFraction(25, 100);
      assert.ok(Math.abs(frac - 24 / 99) < 1e-6);
    });
  });

  describe('2. Proportional Page Mapping Between Documents of Different Lengths', () => {
    it('maps page 1 to page 1 regardless of document lengths', () => {
      assert.equal(calculateProportionalPage(1, 50, 500), 1);
      assert.equal(calculateProportionalPage(1, 1000, 20), 1);
    });

    it('maps last page of source to last page of target', () => {
      assert.equal(calculateProportionalPage(50, 50, 500), 500);
      assert.equal(calculateProportionalPage(1000, 1000, 25), 25);
    });

    it('maps 50% through Matn to 50% through Sharh', () => {
      // Source Matn: 49 pages (midpoint is page 25: (25-1)/(49-1) = 24/48 = 0.5)
      // Target Sharh: 501 pages (midpoint is 0.5 * 500 + 1 = 251)
      const mappedPage = calculateProportionalPage(25, 49, 501);
      assert.equal(mappedPage, 251);
    });

    it('clamps outputs within [1, targetTotalPages] under edge inputs', () => {
      assert.equal(calculateProportionalPage(0, 50, 100), 1);
      assert.equal(calculateProportionalPage(999, 50, 100), 100);
      assert.equal(calculateProportionalPage(10, 1, 100), 1);
      assert.equal(calculateProportionalPage(10, 50, 1), 1);
    });
  });

  describe('3. ParallelSyncController State & Event Synchronization', () => {
    it('initializes with default or specified lock state', () => {
      const defaultCtrl = new ParallelSyncController();
      assert.equal(defaultCtrl.getLocked(), false);

      const lockedCtrl = new ParallelSyncController(true);
      assert.equal(lockedCtrl.getLocked(), true);
    });

    it('toggles and sets lock state properly', () => {
      const ctrl = new ParallelSyncController(false);
      assert.equal(ctrl.toggleLocked(), true);
      assert.equal(ctrl.getLocked(), true);

      ctrl.setLocked(false);
      assert.equal(ctrl.getLocked(), false);
    });

    it('does not propagate navigation events when unlocked', () => {
      let callCount = 0;
      const ctrl = new ParallelSyncController(false, () => {
        callCount++;
      });

      const resA = ctrl.handlePaneANavigate(10, 50, 100);
      const resB = ctrl.handlePaneBNavigate(20, 100, 50);

      assert.equal(resA, null);
      assert.equal(resB, null);
      assert.equal(callCount, 0);
    });

    it('propagates bi-directional navigation proportionally when locked', () => {
      const events: Array<{ target: 'A' | 'B'; page: number }> = [];
      const ctrl = new ParallelSyncController(true, (target, page) => {
        events.push({ target, page });
      });

      // Pane A (50 pages) moves to page 25 (halfway: 24/49 ~ 48.9%)
      // Pane B (100 pages): round(0.48979 * 99) + 1 = 49 + 1 = 50 (or 49 depending on exact rounding)
      const targetB = ctrl.handlePaneANavigate(25, 49, 99);
      assert.equal(events.length, 1);
      assert.equal(events[0].target, 'B');
      assert.equal(events[0].page, targetB);

      // Pane B moves to page 1 -> Pane A should move to page 1
      const targetA = ctrl.handlePaneBNavigate(1, 99, 49);
      assert.equal(events.length, 2);
      assert.equal(events[1].target, 'A');
      assert.equal(events[1].page, 1);
      assert.equal(targetA, 1);
    });

    it('prevents mutual recursion loops when synced pane emits an update back', () => {
      let pingPongCount = 0;
      let ctrl: ParallelSyncController;

      ctrl = new ParallelSyncController(true, (target, page) => {
        pingPongCount++;
        // Simulate Pane B receiving update and firing back to Pane A
        if (target === 'B') {
          ctrl.handlePaneBNavigate(page, 100, 50);
        }
      });

      const result = ctrl.handlePaneANavigate(25, 50, 100);

      // Should only trigger once because `isDispatching` guard blocks the recursive call
      assert.equal(pingPongCount, 1);
      assert.ok(result !== null);
    });

    it('cleans up handlers when destroyed', () => {
      let callCount = 0;
      const ctrl = new ParallelSyncController(true, () => {
        callCount++;
      });

      ctrl.destroy();
      assert.equal(ctrl.getLocked(), false);
      const res = ctrl.handlePaneANavigate(10, 50, 100);
      assert.equal(res, null);
      assert.equal(callCount, 0);
    });
  });

  describe('4. Bilingual Localization Integrity (Arabic & English)', () => {
    const requiredKeys: Array<keyof typeof translations.ar> = [
      'parallelReadingWorkspace',
      'paneB',
      'selectSecondaryBook',
      'clonePrimaryBookSameTitle',
      'linkPanesToggle',
      'panesLinked',
      'panesIndependent',
      'closeParallelReading',
      'parallelReadingBtn',
    ];

    it('contains all required keys in Arabic translations without empty values', () => {
      for (const key of requiredKeys) {
        assert.ok(
          key in translations.ar,
          `Missing key '${key}' in translations.ar`
        );
        const val = translations.ar[key];
        assert.ok(
          typeof val === 'string' && val.trim().length > 0,
          `Key '${key}' in translations.ar must be a non-empty string`
        );
      }
    });

    it('contains all required keys in English translations without empty values', () => {
      for (const key of requiredKeys) {
        assert.ok(
          key in translations.en,
          `Missing key '${key}' in translations.en`
        );
        const val = translations.en[key];
        assert.ok(
          typeof val === 'string' && val.trim().length > 0,
          `Key '${key}' in translations.en must be a non-empty string`
        );
      }
    });

    it('Arabic translations contain valid Arabic text', () => {
      assert.ok(translations.ar.parallelReadingWorkspace.includes('المتوازية'));
      assert.ok(translations.ar.panesLinked.includes('المزامنة'));
      assert.ok(translations.ar.panesIndependent.includes('مستقلة'));
    });
  });
});
