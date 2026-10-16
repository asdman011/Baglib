/**
 * Baglib — KOReader Sync Service
 *
 * Coordinates reading progress synchronization between Baglib's library
 * and KOReader Sync instances.
 */

import { settingsRepository } from '../../database/repositories/settings.repository';
import { getDatabase } from '../../database/connection';
import { KOSyncClient } from './ko-sync-client';
import type { KOSyncConfig, KOSyncProgress, SyncOperationResult } from '../../../shared/types/cloud-sync';

const SETTINGS_KEY = 'koreader_sync_config';

const DEFAULT_CONFIG: KOSyncConfig = {
  serverUrl: 'https://sync.koreader.rocks',
  username: '',
  password: '',
  deviceName: 'Baglib Desktop',
  deviceId: '',
  autoSyncOnOpenClose: true,
  sendMetadata: true,
};

export class KOSyncService {
  private client: KOSyncClient | null = null;

  constructor() {
    this.initClient();
  }

  private initClient(): void {
    const config = this.getConfig();
    if (config.username && (config.password || config.userkey)) {
      this.client = new KOSyncClient(config);
    } else {
      this.client = null;
    }
  }

  public getConfig(): KOSyncConfig {
    const saved = settingsRepository.get<KOSyncConfig>(SETTINGS_KEY);
    return { ...DEFAULT_CONFIG, ...saved };
  }

  public saveConfig(config: Partial<KOSyncConfig>): KOSyncConfig {
    const current = this.getConfig();
    const updated: KOSyncConfig = { ...current, ...config };
    settingsRepository.set(SETTINGS_KEY, updated);
    this.initClient();
    return updated;
  }

  public async testConnection(customConfig?: KOSyncConfig): Promise<SyncOperationResult<{ authorized: boolean; registered?: boolean }>> {
    const configToTest = customConfig || this.getConfig();
    const client = new KOSyncClient(configToTest);
    return await client.connect();
  }

  /**
   * Resolves the KOReader document digest for a specific work/book in Baglib.
   */
  public resolveDocumentDigest(workId: string, customDigest?: string): string | null {
    if (customDigest && customDigest.trim()) {
      return customDigest.trim();
    }

    const db = getDatabase();
    // Query file_source_detail for filePath and fileHash
    const row = db.prepare(`
      SELECT fsd.file_path, fsd.file_hash, w.title
      FROM work w
      LEFT JOIN edition e ON e.work_id = w.id
      LEFT JOIN source s ON s.edition_id = e.id
      LEFT JOIN file_source_detail fsd ON fsd.source_id = s.id
      WHERE w.id = ? AND fsd.file_path IS NOT NULL
      LIMIT 1
    `).get(workId) as { file_path?: string; file_hash?: string; title?: string } | undefined;

    if (row?.file_path) {
      try {
        return KOSyncClient.computeDocumentDigest(row.file_path);
      } catch {
        // Fallback to hash or ID
      }
    }

    if (row?.file_hash) {
      return row.file_hash;
    }

    // Fallback: MD5 of work ID
    return KOSyncClient.computeDocumentDigest(workId);
  }

  /**
   * Pulls reading progress from KOReader server for a given work and updates local DB if remote is valid.
   */
  public async pullProgress(workId: string, customDigest?: string): Promise<SyncOperationResult<KOSyncProgress | null>> {
    const client = this.client || new KOSyncClient(this.getConfig());
    const digest = this.resolveDocumentDigest(workId, customDigest);

    if (!digest) {
      return { success: false, message: 'Could not determine document hash for book.' };
    }

    const progress = await client.getProgress(digest);
    if (!progress) {
      return { success: true, message: 'No remote progress found on KOReader server.', data: null };
    }

    // Update local database reading progress
    try {
      const db = getDatabase();
      const progressPercent = Math.min(100, Math.max(0, Math.round(progress.percentage > 1 ? progress.percentage : progress.percentage * 100)));
      const readingStatus = progressPercent >= 98 ? 'completed' : progressPercent > 0 ? 'reading' : 'unread';

      db.prepare(`
        UPDATE work
        SET reading_progress = ?, reading_status = ?
        WHERE id = ?
      `).run(progressPercent, readingStatus, workId);

      return {
        success: true,
        message: `Synced progress (${progressPercent}%) from KOReader server.`,
        data: progress,
      };
    } catch (e: any) {
      return { success: false, message: `Failed to update local progress: ${e.message}`, data: progress };
    }
  }

  /**
   * Pushes reading progress to KOReader sync server.
   */
  public async pushProgress(
    workId: string,
    progressLocator: string,
    percentage: number,
    customDigest?: string,
  ): Promise<SyncOperationResult<boolean>> {
    const client = this.client || new KOSyncClient(this.getConfig());
    const digest = this.resolveDocumentDigest(workId, customDigest);

    if (!digest) {
      return { success: false, message: 'Could not determine document hash for book.' };
    }

    const db = getDatabase();
    const work = db.prepare('SELECT title FROM work WHERE id = ?').get(workId) as { title: string } | undefined;

    // Normalizing percentage: KOReader accepts 0.0 - 1.0 (or 0 - 100 depending on client, standard is 0.0 - 1.0)
    const normalizedPercent = percentage > 1 ? percentage / 100 : percentage;

    const success = await client.updateProgress(
      digest,
      progressLocator,
      normalizedPercent,
      {
        title: work?.title || 'Book',
        filename: `${work?.title || 'book'}.epub`,
      },
    );

    if (success) {
      // Also ensure local work is updated
      const localIntPercent = Math.min(100, Math.max(0, Math.round(normalizedPercent * 100)));
      const readingStatus = localIntPercent >= 98 ? 'completed' : localIntPercent > 0 ? 'reading' : 'unread';
      db.prepare('UPDATE work SET reading_progress = ?, reading_status = ? WHERE id = ?').run(
        localIntPercent,
        readingStatus,
        workId,
      );

      return { success: true, message: 'Reading progress pushed to KOReader server.', data: true };
    }

    return { success: false, message: 'Failed to push progress to KOReader server.', data: false };
  }
}

export const koSyncService = new KOSyncService();
