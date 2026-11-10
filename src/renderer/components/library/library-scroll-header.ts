/**
 * Pure state machine and helper logic for the auto-hiding library header (KEY-310).
 *
 * Implements threshold detection and directional hysteresis to prevent flickering
 * when scrolling through the library catalog.
 */

export interface ScrollHeaderState {
  isCollapsed: boolean;
  lastScrollTop: number;
}

export interface ScrollHeaderOptions {
  /** Distance from the very top (px) where the header is guaranteed to stay fully visible */
  topThreshold?: number;
  /** Downward scroll distance (px) required to trigger collapsing */
  downHysteresis?: number;
  /** Upward scroll distance (px) required to trigger expansion */
  upHysteresis?: number;
}

export const DEFAULT_SCROLL_HEADER_OPTIONS: Required<ScrollHeaderOptions> = {
  topThreshold: 48,
  downHysteresis: 48,
  upHysteresis: 24,
};

/**
 * Pure transition function calculating the next scroll header state given current state,
 * new scrollTop coordinate, and configured hysteresis thresholds.
 */
export function computeScrollHeaderState(
  currentState: ScrollHeaderState,
  newScrollTop: number,
  customOptions?: ScrollHeaderOptions
): ScrollHeaderState {
  const options = { ...DEFAULT_SCROLL_HEADER_OPTIONS, ...customOptions };
  const sanitizedScrollTop = Math.max(0, newScrollTop);

  // When at or near the very top of the scroll container, always show the full header
  if (sanitizedScrollTop <= options.topThreshold) {
    return {
      isCollapsed: false,
      lastScrollTop: sanitizedScrollTop,
    };
  }

  const scrollDelta = sanitizedScrollTop - currentState.lastScrollTop;

  // Scrolling Down
  if (scrollDelta > 0) {
    if (!currentState.isCollapsed && scrollDelta >= options.downHysteresis) {
      return {
        isCollapsed: true,
        lastScrollTop: sanitizedScrollTop,
      };
    }
    // Maintain state if delta doesn't exceed hysteresis, but track lowest anchor if not collapsed
    return {
      isCollapsed: currentState.isCollapsed,
      lastScrollTop: currentState.isCollapsed
        ? sanitizedScrollTop
        : Math.min(currentState.lastScrollTop, sanitizedScrollTop),
    };
  }

  // Scrolling Up (scrollDelta < 0)
  const upwardDelta = Math.abs(scrollDelta);
  if (currentState.isCollapsed && upwardDelta >= options.upHysteresis) {
    return {
      isCollapsed: false,
      lastScrollTop: sanitizedScrollTop,
    };
  }

  // Maintain state if upward delta doesn't meet hysteresis
  return {
    isCollapsed: currentState.isCollapsed,
    lastScrollTop: currentState.isCollapsed
      ? Math.max(currentState.lastScrollTop, sanitizedScrollTop)
      : sanitizedScrollTop,
  };
}

/**
 * Checks whether the user has requested reduced motion in their environment.
 */
export function isReducedMotionPreferred(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
