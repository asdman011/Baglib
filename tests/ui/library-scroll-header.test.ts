import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeScrollHeaderState,
  type ScrollHeaderState,
} from '../../src/renderer/components/library/library-scroll-header';

describe('Library Scroll Header Logic (KEY-310)', () => {
  it('keeps header fully expanded when at or near the top', () => {
    const initial: ScrollHeaderState = { isCollapsed: false, lastScrollTop: 0 };

    const state1 = computeScrollHeaderState(initial, 20);
    assert.strictEqual(state1.isCollapsed, false);
    assert.strictEqual(state1.lastScrollTop, 20);

    const state2 = computeScrollHeaderState(state1, 48);
    assert.strictEqual(state2.isCollapsed, false);
    assert.strictEqual(state2.lastScrollTop, 48);
  });

  it('does not collapse header on tiny downward scrolls below downHysteresis', () => {
    const initial: ScrollHeaderState = { isCollapsed: false, lastScrollTop: 50 };
    // Delta = 20px (less than downHysteresis = 48px)
    const nextState = computeScrollHeaderState(initial, 70);
    assert.strictEqual(nextState.isCollapsed, false);
  });

  it('collapses header once downward scroll exceeds downHysteresis', () => {
    const initial: ScrollHeaderState = { isCollapsed: false, lastScrollTop: 50 };
    // Delta = 60px (greater than downHysteresis = 48px)
    const nextState = computeScrollHeaderState(initial, 110);
    assert.strictEqual(nextState.isCollapsed, true);
    assert.strictEqual(nextState.lastScrollTop, 110);
  });

  it('keeps header collapsed on small upward scrolls below upHysteresis', () => {
    const initial: ScrollHeaderState = { isCollapsed: true, lastScrollTop: 200 };
    // Upward delta = 10px (less than upHysteresis = 24px)
    const nextState = computeScrollHeaderState(initial, 190);
    assert.strictEqual(nextState.isCollapsed, true);
  });

  it('restores full header when scrolling up by more than upHysteresis', () => {
    const initial: ScrollHeaderState = { isCollapsed: true, lastScrollTop: 200 };
    // Upward delta = 30px (greater than upHysteresis = 24px)
    const nextState = computeScrollHeaderState(initial, 170);
    assert.strictEqual(nextState.isCollapsed, false);
    assert.strictEqual(nextState.lastScrollTop, 170);
  });

  it('always restores full header when scrolling back to the top threshold', () => {
    const initial: ScrollHeaderState = { isCollapsed: true, lastScrollTop: 200 };
    // Scrolled all the way back to top
    const nextState = computeScrollHeaderState(initial, 10);
    assert.strictEqual(nextState.isCollapsed, false);
    assert.strictEqual(nextState.lastScrollTop, 10);
  });

  it('handles negative or invalid scrollTop gracefully', () => {
    const initial: ScrollHeaderState = { isCollapsed: true, lastScrollTop: 100 };
    const nextState = computeScrollHeaderState(initial, -50);
    assert.strictEqual(nextState.isCollapsed, false);
    assert.strictEqual(nextState.lastScrollTop, 0);
  });

  it('respects custom threshold and hysteresis configuration', () => {
    const custom = {
      topThreshold: 20,
      downHysteresis: 30,
      upHysteresis: 15,
    };
    const initial: ScrollHeaderState = { isCollapsed: false, lastScrollTop: 25 };

    // 25 -> 50 (delta 25 < 30) => remains expanded
    const s1 = computeScrollHeaderState(initial, 50, custom);
    assert.strictEqual(s1.isCollapsed, false);

    // 25 -> 60 (delta 35 > 30) => collapses
    const s2 = computeScrollHeaderState(initial, 60, custom);
    assert.strictEqual(s2.isCollapsed, true);

    // 60 -> 40 (upward delta 20 > 15) => expands
    const s3 = computeScrollHeaderState(s2, 40, custom);
    assert.strictEqual(s3.isCollapsed, false);
  });
});
