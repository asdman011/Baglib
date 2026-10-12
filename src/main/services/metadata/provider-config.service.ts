import Database from 'better-sqlite3';
import { getDatabase } from '../../database/connection';

export interface ProviderConfigItem {
  id: string;
  name: string;
  nameAr: string;
  enabled: boolean;
  priority: number; // 1 = highest precedence
}

export const DEFAULT_PROVIDER_CONFIGS: ProviderConfigItem[] = [
  {
    id: 'google-books',
    name: 'Google Books',
    nameAr: 'كتب جوجل (Google Books)',
    enabled: true,
    priority: 1,
  },
  {
    id: 'open-library',
    name: 'Open Library',
    nameAr: 'المكتبة المفتوحة (Open Library)',
    enabled: true,
    priority: 2,
  },
  {
    id: 'internet-archive',
    name: 'Internet Archive',
    nameAr: 'أرشيف الإنترنت (Internet Archive)',
    enabled: true,
    priority: 3,
  },
];

export class ProviderConfigService {
  private static instance: ProviderConfigService;
  private customDb: Database.Database | null = null;
  private fallbackDb: Database.Database | null = null;
  private cachedConfigs: ProviderConfigItem[] | null = null;

  constructor(db?: Database.Database) {
    if (db) {
      this.customDb = db;
    }
  }

  public static getInstance(db?: Database.Database): ProviderConfigService {
    if (!this.instance || db) {
      this.instance = new ProviderConfigService(db);
    }
    return this.instance;
  }

  public setDatabase(db: Database.Database | null): void {
    this.customDb = db;
    this.cachedConfigs = null;
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
        CREATE TABLE IF NOT EXISTS app_settings (
          key         TEXT PRIMARY KEY,
          value       TEXT NOT NULL,
          updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
    } catch {
      // ignore
    }
  }

  /**
   * Retrieves all provider configurations, ordered by priority ascending.
   */
  public getProviderConfigs(): ProviderConfigItem[] {
    this.ensureTableExists();
    try {
      const db = this.getDb();
      const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('metadata_providers') as
        | { value: string }
        | undefined;

      if (!row || !row.value) {
        // Seed default
        this.saveConfigs(DEFAULT_PROVIDER_CONFIGS);
        this.cachedConfigs = [...DEFAULT_PROVIDER_CONFIGS];
        return this.cachedConfigs;
      }

      const parsed: ProviderConfigItem[] = JSON.parse(row.value);
      // Ensure all standard providers are present in case new ones were added
      const merged = this.mergeWithDefaults(parsed);
      this.cachedConfigs = merged.sort((a, b) => a.priority - b.priority);
      return this.cachedConfigs;
    } catch (err) {
      console.warn('[ProviderConfigService] Error reading provider configs, using defaults:', err);
      return [...DEFAULT_PROVIDER_CONFIGS];
    }
  }

  private mergeWithDefaults(configs: ProviderConfigItem[]): ProviderConfigItem[] {
    const existingIds = new Set(configs.map((c) => c.id));
    const merged = [...configs];
    for (const def of DEFAULT_PROVIDER_CONFIGS) {
      if (!existingIds.has(def.id)) {
        merged.push({ ...def, priority: merged.length + 1 });
      }
    }
    return merged;
  }

  /**
   * Updates provider configurations and persists them to SQLite app_settings table.
   */
  public updateProviderConfigs(configs: ProviderConfigItem[]): ProviderConfigItem[] {
    this.ensureTableExists();
    // Normalize priorities 1..N
    const sorted = [...configs].sort((a, b) => a.priority - b.priority);
    const normalized = sorted.map((item, idx) => ({
      ...item,
      priority: idx + 1,
    }));

    this.saveConfigs(normalized);
    this.cachedConfigs = normalized;
    return normalized;
  }

  private saveConfigs(configs: ProviderConfigItem[]): void {
    try {
      const db = this.getDb();
      const jsonStr = JSON.stringify(configs);
      db.prepare(`
        INSERT INTO app_settings (key, value, updated_at)
        VALUES ('metadata_providers', ?, datetime('now'))
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = datetime('now');
      `).run(jsonStr);
    } catch (err) {
      console.error('[ProviderConfigService] Failed to save provider configs:', err);
    }
  }

  /**
   * Helper to get list of active/enabled provider names in user priority order.
   */
  public getEnabledProviderNames(): string[] {
    const configs = this.getProviderConfigs();
    return configs.filter((c) => c.enabled).map((c) => c.name);
  }
}

export const providerConfigService = ProviderConfigService.getInstance();
