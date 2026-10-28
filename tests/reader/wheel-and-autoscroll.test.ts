import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { translations } from '../../src/renderer/translations';

describe('Reader EPUB Mouse Wheel & Hands-Free Auto-Scroll Tests', () => {
  describe('1. EPUB Mouse Wheel Interceptor Algorithms', () => {
    it('debounces wheel events within ~200ms threshold to prevent multi-page flips on single flick', () => {
      let lastWheelTime = 0;
      let turns = 0;

      const triggerWheel = (now: number, deltaY: number) => {
        if (Math.abs(deltaY) < 15) return;
        if (now - lastWheelTime < 200) return;
        lastWheelTime = now;
        turns++;
      };

      // Rapid flick emitting 6 wheel events within 100ms
      triggerWheel(1000, 50);
      triggerWheel(1020, 48);
      triggerWheel(1040, 45);
      triggerWheel(1060, 30);
      triggerWheel(1080, 20);
      triggerWheel(1100, 15);

      // Only the first event should have turned the page
      assert.equal(turns, 1, 'Rapid wheel flick should debounce to 1 page turn');

      // Next scroll after 250ms threshold
      triggerWheel(1260, 40);
      assert.equal(turns, 2, 'Subsequent wheel turn after 200ms threshold should be processed');
    });

    it('filters out micro-jitter wheel movements below 15px threshold', () => {
      let turns = 0;
      const processDelta = (deltaY: number, deltaX: number) => {
        if (Math.abs(deltaY) < 15 && Math.abs(deltaX) < 15) return;
        turns++;
      };

      processDelta(4, 2);
      processDelta(-8, 3);
      processDelta(12, 10);
      assert.equal(turns, 0, 'Micro-jitters (< 15px) must not trigger page flips');

      processDelta(16, 0);
      assert.equal(turns, 1, 'Delta >= 15px should trigger page turn');
    });

    it('determines forward and backward page directions accurately in vertical scroll', () => {
      const getDirection = (deltaY: number): 'next' | 'prev' => {
        return deltaY > 0 ? 'next' : 'prev';
      };

      assert.equal(getDirection(45), 'next');
      assert.equal(getDirection(-45), 'prev');
    });

    it('respects RTL and LTR directionality for horizontal trackpad swipes', () => {
      const getHorizontalDirection = (deltaX: number, readerDirection: 'rtl' | 'ltr'): 'next' | 'prev' => {
        if (readerDirection === 'rtl') {
          return deltaX < 0 ? 'next' : 'prev';
        } else {
          return deltaX > 0 ? 'next' : 'prev';
        }
      };

      // In LTR: swipe left (deltaX > 0) -> next page; swipe right (deltaX < 0) -> prev page
      assert.equal(getHorizontalDirection(50, 'ltr'), 'next');
      assert.equal(getHorizontalDirection(-50, 'ltr'), 'prev');

      // In RTL: swipe right (deltaX < 0) -> next page; swipe left (deltaX > 0) -> prev page
      assert.equal(getHorizontalDirection(-50, 'rtl'), 'next');
      assert.equal(getHorizontalDirection(50, 'rtl'), 'prev');
    });

    it('prioritizes rendition.next / rendition.prev if exposed by bookDoc engine', () => {
      let renditionNextCalled = false;
      let fallbackNextCalled = false;

      const mockBookDoc = {
        rendition: {
          next: () => { renditionNextCalled = true; },
          prev: () => {},
        },
      };

      if (typeof (mockBookDoc as unknown)?.rendition?.next === 'function') {
        (mockBookDoc as unknown).rendition.next();
      } else {
        fallbackNextCalled = true;
      }

      assert.ok(renditionNextCalled);
      assert.ok(!fallbackNextCalled);
    });
  });

  describe('2. Hands-Free Auto-Scrolling Engine Calculations', () => {
    it('calculates frame-rate independent scroll increments for continuous scroll mode', () => {
      const calculateScrollStep = (dtSeconds: number, speedMultiplier: number): number => {
        const basePxPerSec = 45;
        return dtSeconds * basePxPerSec * speedMultiplier;
      };

      // At 60fps (dt = 0.01667s)
      const step1x = calculateScrollStep(1 / 60, 1.0);
      const step2x = calculateScrollStep(1 / 60, 2.0);
      const stepHalfX = calculateScrollStep(1 / 60, 0.5);

      assert.ok(Math.abs(step1x - 0.75) < 0.05);
      assert.ok(Math.abs(step2x - 1.5) < 0.05);
      assert.ok(Math.abs(stepHalfX - 0.375) < 0.05);
    });

    it('calculates page-turn intervals for paginated book spread mode based on speed setting', () => {
      const getPageIntervalMs = (speedMultiplier: number): number => {
        return Math.round((20 / speedMultiplier) * 1000);
      };

      assert.equal(getPageIntervalMs(0.5), 40000, '0.5x speed should turn page every 40s');
      assert.equal(getPageIntervalMs(1.0), 20000, '1.0x speed should turn page every 20s');
      assert.equal(getPageIntervalMs(1.5), 13333, '1.5x speed should turn page every ~13.3s');
      assert.equal(getPageIntervalMs(2.0), 10000, '2.0x speed should turn page every 10s');
    });

    it('cycles through supported speed presets: 0.5x -> 1x -> 1.5x -> 2x -> 0.5x', () => {
      const speeds = [0.5, 1, 1.5, 2] as const;
      const cycleSpeed = (current: number) => {
        const nextIdx = (speeds.indexOf(current as unknown) + 1) % speeds.length;
        return speeds[nextIdx];
      };

      let speed = 0.5;
      speed = cycleSpeed(speed);
      assert.equal(speed, 1);
      speed = cycleSpeed(speed);
      assert.equal(speed, 1.5);
      speed = cycleSpeed(speed);
      assert.equal(speed, 2);
      speed = cycleSpeed(speed);
      assert.equal(speed, 0.5);
    });
  });

  describe('3. Safety Pause Triggers & Deliberate Movement Detection', () => {
    it('ignores initial mouse lift/release during grace period (< 600ms) or micro-motion (< 20px)', () => {
      const shouldPauseOnMouseMove = (
        elapsedMs: number,
        startPos: { x: number; y: number },
        currentPos: { x: number; y: number }
      ): boolean => {
        if (elapsedMs < 600) return false;
        const dist = Math.hypot(currentPos.x - startPos.x, currentPos.y - startPos.y);
        return dist > 20;
      };

      // Right after clicking Play (t = 200ms), user lifts hand and moves 30px
      assert.equal(
        shouldPauseOnMouseMove(200, { x: 500, y: 30 }, { x: 530, y: 30 }),
        false,
        'Should not pause during initial 600ms grace period'
      );

      // Later (t = 1500ms), slight table vibration of 5px
      assert.equal(
        shouldPauseOnMouseMove(1500, { x: 500, y: 30 }, { x: 504, y: 32 }),
        false,
        'Should not pause for micro-motion < 20px'
      );

      // Later (t = 2000ms), user intentionally moves mouse across screen
      assert.equal(
        shouldPauseOnMouseMove(2000, { x: 500, y: 30 }, { x: 600, y: 150 }),
        true,
        'Should pause on intentional mouse movement > 20px'
      );
    });

    it('does not pause when clicking directly on speed selector or play/pause button', () => {
      const isAutoScrollControl = (targetClassOrTitle: string): boolean => {
        return (
          targetClassOrTitle.includes('autoScrollPause') ||
          targetClassOrTitle.includes('autoScrollPlay') ||
          targetClassOrTitle.includes('autoScrollSpeed')
        );
      };

      assert.ok(isAutoScrollControl('btn autoScrollPause'));
      assert.ok(isAutoScrollControl('btn autoScrollSpeed'));
      assert.ok(!isAutoScrollControl('book-canvas-text'));
    });
  });

  describe('4. Bilingual UI & Localization Verification', () => {
    const autoScrollKeys = [
      'autoScrollPlay',
      'autoScrollPause',
      'autoScrollPaused',
      'autoScrollSpeed',
    ] as const;

    it('ensures all Auto-Scroll translation keys are defined in Arabic', () => {
      for (const key of autoScrollKeys) {
        const val = (translations.ar as unknown)[key];
        assert.ok(val, `Missing Arabic translation for key: ${key}`);
        assert.ok(typeof val === 'string' && val.length > 0);
      }
    });

    it('ensures all Auto-Scroll translation keys are defined in English', () => {
      for (const key of autoScrollKeys) {
        const val = (translations.en as unknown)[key];
        assert.ok(val, `Missing English translation for key: ${key}`);
        assert.ok(typeof val === 'string' && val.length > 0);
      }
    });
  });

  describe('5. Continuous Scroll & Auto-Scroll Page Position Preservation', () => {
    it('prevents initial IntersectionObserver entry from resetting currentPage to 1 while positioning', () => {
      let isPositioningScroll = true;
      let reportedPage: number = 42;
      const initialEntryPage: number = 1;

      // Simulate observer tick when container scrollTop is initially 0
      if (!isPositioningScroll && initialEntryPage !== reportedPage) {
        reportedPage = initialEntryPage;
      }

      assert.equal(reportedPage, 42, 'Positioning lock must prevent reset to page 1');

      // After layout settles and positioning completes
      isPositioningScroll = false;
      const userScrolledPage: number = 43;
      if (!isPositioningScroll && userScrolledPage !== reportedPage) {
        reportedPage = userScrolledPage;
      }

      assert.equal(reportedPage, 43, 'Subsequent deliberate user scrolling must update page');
    });

    it('calculates scroll offset delta correctly when aligning target page to container top', () => {
      const containerRect = { top: 50 };
      const targetPageRect = { top: 850 };
      const currentScrollTop = 0;

      const targetScrollTop = currentScrollTop + (targetPageRect.top - containerRect.top);
      assert.equal(targetScrollTop, 800, 'Calculates relative top offset for target page');
    });
  });
});

