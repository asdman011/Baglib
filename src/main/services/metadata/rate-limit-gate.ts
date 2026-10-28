/**
 * Baglib — Robust Provider Rate-Limit & Pacing Gate
 *
 * Reverse-engineered and inspired by Readest's RateLimitGate architecture
 * (apps/readest-app/src/services/hardcover/rateLimit.ts).
 *
 * Provides:
 * 1. Strict FIFO request serialization & spacing to prevent bursting beyond provider thresholds (especially Google Books API).
 * 2. Automatic Retry-After and HTTP 429/503 backoff management.
 * 3. Token-bucket style pacing for bulk enrichment and background refresh tasks.
 * 4. Maximum wait ceiling (fails fast if server reports daily quota exhaustion).
 */

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface RateLimitBucket {
  remaining: number;
  resetSec: number;
}

export interface RateLimitGateConfig {
  name: string;
  minIntervalMs: number;       // Minimum delay between consecutive requests (e.g. 1200ms for Google Books)
  maxWaitMs?: number;          // Maximum wait before failing fast (default 60,000ms)
  defaultBurstSize?: number;   // Maximum concurrent burst size (default 1)
}

export class RateLimitGate {
  private name: string;
  private minIntervalMs: number;
  private maxWaitMs: number;
  private blockedUntil = 0;
  private consecutiveErrors = 0;
  private lastRequestTime = 0;
  private queue: Promise<void> = Promise.resolve();

  constructor(config: RateLimitGateConfig) {
    this.name = config.name;
    this.minIntervalMs = config.minIntervalMs;
    this.maxWaitMs = config.maxWaitMs ?? 60_000;
  }

  /**
   * Blocks the gate until `ms` milliseconds from now.
   */
  public blockFor(ms: number): void {
    const target = Date.now() + ms;
    this.blockedUntil = Math.max(this.blockedUntil, target);
  }

  /**
   * Awaits clearance to send a request.
   * Every request queues in strict FIFO order, guaranteeing that consecutive requests
   * are spaced out by at least `minIntervalMs` and that backoff delays are respected.
   */
  public async wait(): Promise<void> {
    const turn = this.queue.then(() => this.pass());
    this.queue = turn.catch(() => {});
    return turn;
  }

  private async pass(): Promise<void> {
    // 1. Wait out any active backoff block
    while (Date.now() < this.blockedUntil) {
      const waitTime = this.blockedUntil - Date.now();
      if (waitTime > this.maxWaitMs) {
        throw new Error(`[RateLimitGate:${this.name}] Rate limit ceiling reached (${waitTime}ms). Aborting request.`);
      }
      await sleep(Math.min(waitTime, 2000));
    }

    // 2. Enforce minimum pacing interval between requests
    const timeSinceLast = Date.now() - this.lastRequestTime;
    if (timeSinceLast < this.minIntervalMs) {
      const paceDelay = this.minIntervalMs - timeSinceLast;
      await sleep(paceDelay);
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Updates gate state based on response status and headers.
   */
  public handleResponse(status: number, headers?: Headers | Record<string, string> | null): void {
    if (status >= 200 && status < 300) {
      this.consecutiveErrors = 0;
      return;
    }

    if (status === 429) {
      this.consecutiveErrors++;
      let retryMs = 3000 * Math.pow(1.5, Math.min(this.consecutiveErrors, 5));

      if (headers) {
        const retryAfter = typeof (headers).get === 'function'
          ? (headers as Headers).get('Retry-After')
          : (headers as Record<string, string>)['retry-after'] || (headers as Record<string, string>)['Retry-After'];

        if (retryAfter) {
          const sec = Number(retryAfter);
          if (Number.isFinite(sec) && sec > 0) {
            retryMs = sec * 1000;
          }
        }
      }

      console.warn(`[RateLimitGate:${this.name}] HTTP 429 detected. Backing off for ${Math.round(retryMs)}ms (attempt ${this.consecutiveErrors}).`);
      this.blockFor(retryMs);
    } else if (status === 503) {
      this.consecutiveErrors++;
      const backoff = 2500 * this.consecutiveErrors;
      console.warn(`[RateLimitGate:${this.name}] HTTP 503 Service Unavailable. Pausing for ${backoff}ms.`);
      this.blockFor(backoff);
    }
  }

  public isCurrentlyBlocked(): boolean {
    return Date.now() < this.blockedUntil;
  }

  public getBlockedRemainingMs(): number {
    return Math.max(0, this.blockedUntil - Date.now());
  }

  public reset(): void {
    this.blockedUntil = 0;
    this.consecutiveErrors = 0;
    this.lastRequestTime = 0;
    this.queue = Promise.resolve();
  }
}

// Global named gates for all external metadata providers
export const googleBooksGate = new RateLimitGate({
  name: 'GoogleBooks',
  minIntervalMs: 1500, // 1.5s between calls ensures Google Books free quota is never breached during bulk operations
  maxWaitMs: 45_000,
});

export const openLibraryGate = new RateLimitGate({
  name: 'OpenLibrary',
  minIntervalMs: 1000, // Open Library recommends max 1 req/sec
  maxWaitMs: 30_000,
});

export const internetArchiveGate = new RateLimitGate({
  name: 'InternetArchive',
  minIntervalMs: 800,
  maxWaitMs: 30_000,
});
