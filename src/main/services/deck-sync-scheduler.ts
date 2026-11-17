/**
 * Baglib — background runner for live deck sync (KEY-393).
 *
 * Annotation saves and deletes ask for a sync of the decks that follow that book. Requests are
 * debounced and run one at a time, in batches that yield to the event loop, so the app stays
 * responsive. On start, every subscription is synced once (catching changes made while the app
 * was closed, or a sync interrupted by quitting).
 */

import { BrowserWindow } from 'electron';
import { getDatabase } from '../database/connection';
import { DeckSyncService, type SyncResult } from './deck-sync';
import { notificationLanguage, notificationService } from '../ipc/notifications';
import { translations } from '../../renderer/translations';

const DEBOUNCE_MS = 800;
const STARTUP_DELAY_MS = 15_000;

class DeckSyncScheduler {
  private pendingWorks = new Set<string>();
  private pendingSubs = new Set<string>();
  private timer: NodeJS.Timeout | null = null;
  private chain: Promise<void> = Promise.resolve();

  /** A book's highlights or comments changed. */
  requestForWork(workId: string | null | undefined): void {
    if (!workId) return;
    this.pendingWorks.add(workId);
    this.schedule();
  }

  requestSubscription(id: string): void {
    this.pendingSubs.add(id);
    this.schedule();
  }

  start(): void {
    setTimeout(() => {
      try {
        for (const sub of new DeckSyncService(getDatabase()).list()) this.pendingSubs.add(sub.id);
        this.schedule(0);
      } catch (error) {
        console.warn('[baglib:deck-sync] startup sync skipped', error);
      }
    }, STARTUP_DELAY_MS).unref?.();
  }

  /** Runs one subscription now (the "Sync now" button), queued behind any running sync. */
  runNow(id: string): Promise<SyncResult> {
    let resolveResult!: (r: SyncResult) => void;
    let rejectResult!: (e: unknown) => void;
    const result = new Promise<SyncResult>((res, rej) => {
      resolveResult = res;
      rejectResult = rej;
    });
    this.chain = this.chain.then(async () => {
      try {
        const r = await new DeckSyncService(getDatabase()).sync(id);
        this.report(r);
        resolveResult(r);
      } catch (error) {
        rejectResult(error);
      }
    });
    return result;
  }

  private schedule(delay = DEBOUNCE_MS): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.chain = this.chain.then(() => this.flush());
    }, delay);
  }

  private async flush(): Promise<void> {
    const service = new DeckSyncService(getDatabase());
    const ids = new Set(this.pendingSubs);
    for (const workId of this.pendingWorks) for (const sub of service.forWork(workId)) ids.add(sub.id);
    this.pendingSubs.clear();
    this.pendingWorks.clear();
    for (const id of ids) {
      try {
        this.report(await service.sync(id));
      } catch (error) {
        console.warn('[baglib:deck-sync] sync failed', id, error);
      }
    }
  }

  private report(result: SyncResult): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('deck-sync:changed', result);
    }
    if (result.added + result.linked === 0) return;
    const service = new DeckSyncService(getDatabase());
    const sub = service.get(result.subscriptionId);
    if (!sub || sub.newItems !== 'toast') return;
    const deck = getDatabase().prepare(`SELECT name FROM deck WHERE id = ?`).get(result.deckId) as { name: string } | undefined;
    const text = translations[notificationLanguage()];
    notificationService.publish({
      key: `deck-sync:${result.subscriptionId}:${Date.now()}`,
      kind: 'study',
      title: text.deckSyncNewTitle.replace('{deck}', deck?.name ?? ''),
      body: text.deckSyncNewBody.replace('{count}', String(result.added + result.linked)).replace('{source}', sub.label),
      target: 'dashboard',
    });
  }
}

export const deckSyncScheduler = new DeckSyncScheduler();
