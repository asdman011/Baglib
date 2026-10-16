/**
 * RSVP (Rapid Serial Visual Presentation) Speed Reading Controller
 * Reverse-engineered from Readest (RSVPOverlay.tsx & services/rsvp)
 * 
 * Features:
 * - Optimal Recognition Point (ORP) calculation
 * - Arabic & RTL cursive letter shaping protection (no character slicing)
 * - Punctuation-based dwell timers (Arabic Harakat & comma/question mark awareness)
 * - Dynamic WPM pacing (100 - 1000 WPM)
 */

import { RSVPWordToken, RSVPState } from './types';

// Arabic and strong RTL Unicode ranges
const RTL_PATTERN = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;

export function isRTLText(text: string): boolean {
  return RTL_PATTERN.test(text);
}

/**
 * Calculates the Optimal Recognition Point (ORP) index for a word.
 * For Latin text, the eye fixates slightly to the left of center (1/3 of word).
 * For Arabic text, the entire word is preserved intact to maintain cursive ligatures.
 */
export function calculateORP(word: string, isRTL: boolean): number {
  if (isRTL) {
    // For Arabic words, center index
    const len = word.length;
    return Math.floor(Math.max(len - 1, 0) / 2);
  }

  const cleanWord = word.replace(/[^\p{L}\p{N}_]/gu, '');
  const len = cleanWord.length;

  if (len <= 1) return 0;
  if (len <= 3) return 0;
  if (len <= 5) return 1;
  if (len <= 8) return 2;
  return 3;
}

/**
 * Returns dwell pause multiplier based on punctuation (periods, commas, Arabic punctuation).
 */
export function getPauseMultiplier(word: string): number {
  const trimmed = word.trim();
  if (!trimmed) return 1.0;

  const lastChar = trimmed[trimmed.length - 1];

  // Strong sentence breaks (. ! ? ؟)
  if (['.', '!', '?', '؟'].includes(lastChar) || trimmed.endsWith('...')) {
    return 2.0;
  }

  // Clause breaks (, ; : ، ؛)
  if ([',', ';', ':', '،', '؛', '-'].includes(lastChar)) {
    return 1.5;
  }

  // Short words read slightly faster
  if (trimmed.length <= 2) {
    return 0.85;
  }

  // Very long academic words dwell slightly longer
  if (trimmed.length >= 12) {
    return 1.25;
  }

  return 1.0;
}

function splitOnLongDashes(token: string): string[] {
  if (!/[–—]/.test(token)) return [token];
  const parts = token.split(/([–—])/);
  const result: string[] = [];
  for (const part of parts) {
    if (!part) continue;
    if (/^[–—]$/.test(part) && result.length > 0) {
      result[result.length - 1] = result[result.length - 1] + part;
    } else {
      result.push(part);
    }
  }
  return result;
}

/**
 * Tokenizes text into RSVPWordTokens with punctuation and RTL awareness.
 */
export function tokenizeTextForRSVP(text: string): RSVPWordToken[] {
  if (!text || !text.trim()) return [];

  // Split on whitespace while preserving words and trailing punctuation
  const rawTokens = text
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0);

  const tokens: RSVPWordToken[] = [];

  for (const raw of rawTokens) {
    const subParts = splitOnLongDashes(raw);

    for (const part of subParts) {
      if (!part || !part.trim()) continue;
      const isRTL = isRTLText(part);
      const orpIndex = calculateORP(part, isRTL);
      const pauseMultiplier = getPauseMultiplier(part);

      tokens.push({
        text: part,
        orpIndex,
        pauseMultiplier,
        isRTL,
      });
    }
  }

  return tokens;
}

export class RSVPController {
  private state: RSVPState;
  private timer: any = null;
  private onStateChange: ((state: RSVPState) => void) | null = null;

  constructor(initialWpm = 300, onStateChange?: (state: RSVPState) => void) {
    this.state = {
      words: [],
      currentIndex: 0,
      wpm: Math.min(1000, Math.max(100, initialWpm)),
      isPlaying: false,
    };
    if (onStateChange) {
      this.onStateChange = onStateChange;
    }
  }

  public loadText(text: string) {
    this.pause();
    this.state.words = tokenizeTextForRSVP(text);
    this.state.currentIndex = 0;
    this.notify();
  }

  public play() {
    if (this.state.words.length === 0 || this.state.currentIndex >= this.state.words.length) {
      this.state.currentIndex = 0;
    }
    this.state.isPlaying = true;
    this.notify();
    this.scheduleNextWord();
  }

  public pause() {
    this.state.isPlaying = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.notify();
  }

  public togglePlay() {
    if (this.state.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  public setWpm(wpm: number) {
    this.state.wpm = Math.min(1000, Math.max(100, Math.round(wpm)));
    this.notify();
    if (this.state.isPlaying) {
      this.scheduleNextWord();
    }
  }

  public nextWord() {
    if (this.state.currentIndex < this.state.words.length - 1) {
      this.state.currentIndex++;
      this.notify();
    } else {
      this.pause();
    }
  }

  public prevWord() {
    if (this.state.currentIndex > 0) {
      this.state.currentIndex--;
      this.notify();
    }
  }

  public jumpToIndex(index: number) {
    this.state.currentIndex = Math.max(0, Math.min(this.state.words.length - 1, index));
    this.notify();
  }

  public getState(): RSVPState {
    return { ...this.state };
  }

  public getCurrentWord(): RSVPWordToken | null {
    return this.state.words[this.state.currentIndex] || null;
  }

  public destroy() {
    this.pause();
    this.onStateChange = null;
  }

  private scheduleNextWord() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.state.isPlaying) return;

    const currentWord = this.getCurrentWord();
    const pause = currentWord ? currentWord.pauseMultiplier : 1.0;
    // Base delay per word in milliseconds
    const baseDelay = (60 * 1000) / this.state.wpm;
    const delay = Math.round(baseDelay * pause);

    this.timer = setTimeout(() => {
      if (!this.state.isPlaying) return;
      if (this.state.currentIndex < this.state.words.length - 1) {
        this.state.currentIndex++;
        this.notify();
        this.scheduleNextWord();
      } else {
        this.pause();
      }
    }, delay);
  }

  private notify() {
    if (this.onStateChange) {
      this.onStateChange({ ...this.state });
    }
  }
}
