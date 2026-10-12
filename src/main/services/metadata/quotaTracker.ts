import Database from 'better-sqlite3';
import { BrowserWindow } from 'electron';
import { getDatabase } from '../../database/connection';

export interface QuotaWarningPayload {
  level: 'warning' | 'depleted';
  remainingPercentage: number;
  resetsAt: string; // ISO date / human-readable time until midnight
  messageEn: string;
  messageAr: string;
}

export interface QuotaStatus {
  count: number;
  dailyLimit: number;
  mode: 'normal' | 'conservation' | 'depleted';
  remainingPercentage: number;
  resetsAt: string;
  pacingDelayMs: number;
  retryBackoffMs: number;
}

export class QuotaTracker {
  private static instance: QuotaTracker;
  private customDb: Database.Database | null = null;
  private fallbackDb: Database.Database | null = null;

  public static readonly DAILY_LIMIT = 1000;
  public static readonly CONSERVATION_THRESHOLD = 750; // 75% used, 25% remaining

  private customPacingDelayMs: number | null = null;
  private customRetryBackoffMs: number | null = null;

  private lastNotifiedDate: string = '';
  private hasNotifiedWarningToday: boolean = false;
  private hasNotifiedDepletedToday: boolean = false;

  private warningListeners: Array<(payload: QuotaWarningPayload) => void> = [];

  constructor(db?: Database.Database) {
    if (db) {
      this.customDb = db;
    }
  }

  public static getInstance(db?: Database.Database): QuotaTracker {
    if (!this.instance || db) {
      this.instance = new QuotaTracker(db);
    }
    return this.instance;
  }

  public setDatabase(db: Database.Database | null): void {
    this.customDb = db;
    this.ensureTableExists();
  }

  private getDb(): Database.Database {
    if (this.customDb) {
      return this.customDb;
    }
    try {
      return getDatabase();
    } catch {
      if (!this.fallbackDb) {
        this.fallbackDb = new Database(':memory:');
      }
      return this.fallbackDb;
    }
  }

  private ensureTableExists(): void {
    try {
      const db = this.getDb();
      db.exec(`
        CREATE TABLE IF NOT EXISTS api_quota_logs (
          date          TEXT PRIMARY KEY,
          request_count INTEGER NOT NULL DEFAULT 0,
          updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
    } catch (err) {
      // In non-initialized or mock environments, silently proceed
    }
  }

  public getTodayDate(): string {
    return new Date().toISOString().slice(0, 10);
  }

  public getResetsAt(): string {
    const now = new Date();
    const tomorrowUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    return tomorrowUtc.toISOString();
  }

  private checkDateRollover(today: string): void {
    if (this.lastNotifiedDate !== today) {
      this.lastNotifiedDate = today;
      this.hasNotifiedWarningToday = false;
      this.hasNotifiedDepletedToday = false;
    }
  }

  /**
   * Retrieves the current request count for today (UTC).
   * Automatically initializes today's record if it does not exist yet.
   */
  public getCurrentCount(): number {
    this.ensureTableExists();
    const today = this.getTodayDate();
    this.checkDateRollover(today);

    try {
      const db = this.getDb();
      const row = db.prepare('SELECT request_count FROM api_quota_logs WHERE date = ?').get(today) as
        | { request_count: number }
        | undefined;

      if (!row) {
        db.prepare('INSERT OR IGNORE INTO api_quota_logs (date, request_count, updated_at) VALUES (?, 0, datetime(\'now\'))').run(today);
        return 0;
      }
      return row.request_count;
    } catch (err) {
      console.warn('[QuotaTracker] Error retrieving quota count, defaulting to 0:', err);
      return 0;
    }
  }

  /**
   * Increments the daily request counter by 1.
   * Checks thresholds and triggers warning events if crossed.
   */
  public recordRequest(): number {
    this.ensureTableExists();
    const today = this.getTodayDate();
    this.checkDateRollover(today);

    try {
      const db = this.getDb();
      const info = db
        .prepare(`
          INSERT INTO api_quota_logs (date, request_count, updated_at)
          VALUES (?, 1, datetime('now'))
          ON CONFLICT(date) DO UPDATE SET
            request_count = request_count + 1,
            updated_at = datetime('now')
          RETURNING request_count;
        `)
        .get(today) as { request_count: number } | undefined;

      const newCount = info?.request_count ?? (this.getCurrentCount() + 1);
      this.evaluateThresholds(newCount);
      return newCount;
    } catch (err) {
      // Fallback for sqlite drivers without RETURNING
      try {
        const db = this.getDb();
        db.prepare(`
          INSERT INTO api_quota_logs (date, request_count, updated_at)
          VALUES (?, 1, datetime('now'))
          ON CONFLICT(date) DO UPDATE SET
            request_count = request_count + 1,
            updated_at = datetime('now');
        `).run(today);
        const count = this.getCurrentCount();
        this.evaluateThresholds(count);
        return count;
      } catch (innerErr) {
        console.error('[QuotaTracker] Failed to record request:', innerErr);
        return 0;
      }
    }
  }

  /**
   * Evaluates thresholds and emits quota-warning events when crossed for the first time.
   */
  private evaluateThresholds(count: number): void {
    if (count >= QuotaTracker.DAILY_LIMIT && !this.hasNotifiedDepletedToday) {
      this.hasNotifiedDepletedToday = true;
      this.dispatchWarning({
        level: 'depleted',
        remainingPercentage: 0,
        resetsAt: this.getResetsAt(),
        messageEn: "Daily search limit reached. We'll use alternative book sources until tomorrow.",
        messageAr: 'اكتمل الحد اليومي للبحث لهذا اليوم. سنعتمد على مصادر الكتب البديلة حتى يوم غد.',
      });
    } else if (
      count >= QuotaTracker.CONSERVATION_THRESHOLD &&
      count < QuotaTracker.DAILY_LIMIT &&
      !this.hasNotifiedWarningToday
    ) {
      this.hasNotifiedWarningToday = true;
      const remainingPercentage = Math.max(
        0,
        Math.round(((QuotaTracker.DAILY_LIMIT - count) / QuotaTracker.DAILY_LIMIT) * 100)
      );
      this.dispatchWarning({
        level: 'warning',
        remainingPercentage,
        resetsAt: this.getResetsAt(),
        messageEn:
          'Daily search limit is running low. Lookups may take a brief moment longer as Baglib spaces out requests and checks secondary catalogs. Full speed will refresh tomorrow.',
        messageAr:
          'قارب الحد اليومي للبحث السريع عن الكتب على الانتهاء. قد يستغرق البحث لحظات إضافية لتنظيم الاستخدام والاعتماد على فهارس بديلة، وسيتجدد الحد بالكامل غدًا.',
      });
    }
  }

  /**
   * Broadcasts the quota warning payload to all renderer windows and in-memory listeners.
   */
  private dispatchWarning(payload: QuotaWarningPayload): void {
    // Notify in-process listeners (useful for testing and main process observers)
    for (const listener of this.warningListeners) {
      try {
        listener(payload);
      } catch (err) {
        console.error('[QuotaTracker] Error in warning listener:', err);
      }
    }

    // Broadcast via IPC to all open BrowserWindows
    try {
      if (typeof BrowserWindow !== 'undefined' && typeof BrowserWindow.getAllWindows === 'function') {
        const windows = BrowserWindow.getAllWindows();
        for (const win of windows) {
          if (!win.isDestroyed()) {
            win.webContents.send('metadata:quota-warning', payload);
          }
        }
      }
    } catch (err) {
      console.warn('[QuotaTracker] BrowserWindow broadcast unavailable:', err);
    }
  }

  public onWarning(listener: (payload: QuotaWarningPayload) => void): () => void {
    this.warningListeners.push(listener);
    return () => {
      this.warningListeners = this.warningListeners.filter((l) => l !== listener);
    };
  }

  public isConservationMode(): boolean {
    const count = this.getCurrentCount();
    return count >= QuotaTracker.CONSERVATION_THRESHOLD;
  }

  public isDepleted(): boolean {
    const count = this.getCurrentCount();
    return count >= QuotaTracker.DAILY_LIMIT;
  }

  public canRequest(): boolean {
    return !this.isDepleted();
  }

  public getPacingDelayMs(): number {
    if (this.customPacingDelayMs !== null) {
      return this.customPacingDelayMs;
    }
    return this.isConservationMode() ? 2500 : 0;
  }

  public getRetryBackoffMs(): number {
    if (this.customRetryBackoffMs !== null) {
      return this.customRetryBackoffMs;
    }
    return this.isConservationMode() ? 3000 : 0;
  }

  /**
   * Intentional pacing sleep to be injected before Google Books requests in Quota-Saver mode.
   */
  public async applyPacingDelay(): Promise<void> {
    const delay = this.getPacingDelayMs();
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  /**
   * Intentional backoff sleep to be injected before a single retry on transient failure in Quota-Saver mode.
   */
  public async applyRetryBackoff(): Promise<void> {
    const backoff = this.getRetryBackoffMs();
    if (backoff > 0) {
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }

  public getQuotaStatus(): QuotaStatus {
    const count = this.getCurrentCount();
    let mode: 'normal' | 'conservation' | 'depleted' = 'normal';
    if (count >= QuotaTracker.DAILY_LIMIT) {
      mode = 'depleted';
    } else if (count >= QuotaTracker.CONSERVATION_THRESHOLD) {
      mode = 'conservation';
    }

    const remainingPercentage = Math.max(
      0,
      Math.round(((QuotaTracker.DAILY_LIMIT - count) / QuotaTracker.DAILY_LIMIT) * 100)
    );

    return {
      count,
      dailyLimit: QuotaTracker.DAILY_LIMIT,
      mode,
      remainingPercentage,
      resetsAt: this.getResetsAt(),
      pacingDelayMs: this.getPacingDelayMs(),
      retryBackoffMs: this.getRetryBackoffMs(),
    };
  }

  // --- Test & Simulation Helpers ---

  public setCountForTesting(count: number, date?: string): void {
    this.ensureTableExists();
    const targetDate = date || this.getTodayDate();
    this.checkDateRollover(targetDate);
    const db = this.getDb();
    db.prepare(`
      INSERT INTO api_quota_logs (date, request_count, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(date) DO UPDATE SET
        request_count = excluded.request_count,
        updated_at = datetime('now');
    `).run(targetDate, count);
  }

  public setPacingDelayMsForTesting(delayMs: number | null): void {
    this.customPacingDelayMs = delayMs;
  }

  public setRetryBackoffMsForTesting(backoffMs: number | null): void {
    this.customRetryBackoffMs = backoffMs;
  }

  public resetForTesting(): void {
    this.hasNotifiedWarningToday = false;
    this.hasNotifiedDepletedToday = false;
    this.lastNotifiedDate = '';
    this.customPacingDelayMs = null;
    this.customRetryBackoffMs = null;
    this.warningListeners = [];
    try {
      const db = this.getDb();
      db.prepare('DELETE FROM api_quota_logs').run();
    } catch {
      // ignore
    }
  }
}

export const quotaTracker = QuotaTracker.getInstance();
