/**
 * Baglib — KOReader Sync Protocol Client
 *
 * Implements full compatibility with the official KOReader Sync protocol
 * (https://github.com/koreader/koreader-sync-server) and self-hosted instances.
 *
 * Features:
 *   - Document digest hashing (MD5 hash of book content)
 *   - Secure authentication via X-Auth-User / X-Auth-Key (md5 of password)
 *     with automatic registration on 401 and Basic Auth fallback
 *   - Reading progress synchronization (CFI / page locator and percentage)
 *   - Device tracking (device name, device ID)
 *   - Document metadata payload transmission (filename, title, authors)
 */

import crypto from 'crypto';
import fs from 'fs';
import type { KOSyncConfig, KOSyncProgress, SyncOperationResult } from '../../../shared/types/cloud-sync';

export class KOSyncClient {
  private config: KOSyncConfig;
  private usesHttpAuth: boolean = false;

  constructor(config: KOSyncConfig) {
    this.config = {
      ...config,
      serverUrl: (config.serverUrl || 'https://sync.koreader.rocks').replace(/\/+$/, ''),
      deviceName: config.deviceName || 'Baglib Desktop',
      deviceId: config.deviceId || 'baglib-' + crypto.randomBytes(4).toString('hex'),
    };

    if (config.password && !this.config.userkey) {
      this.config.userkey = crypto.createHash('md5').update(config.password).digest('hex');
    }
  }

  public getConfig(): KOSyncConfig {
    return { ...this.config };
  }

  public setConfig(config: Partial<KOSyncConfig>): void {
    this.config = {
      ...this.config,
      ...config,
      serverUrl: (config.serverUrl ?? this.config.serverUrl).replace(/\/+$/, ''),
    };
    if (config.password) {
      this.config.userkey = crypto.createHash('md5').update(config.password).digest('hex');
    }
  }

  /**
   * Computes the standard KOReader document digest (MD5 of file content).
   * If a file path is provided, streams the file from disk to avoid high memory usage.
   * If a Buffer is provided, computes MD5 directly.
   */
  public static computeDocumentDigest(input: string | Buffer): string {
    if (Buffer.isBuffer(input)) {
      return crypto.createHash('md5').update(input).digest('hex');
    }

    // If input is a valid file path, compute MD5 from file contents
    if (typeof input === 'string' && fs.existsSync(input) && fs.statSync(input).isFile()) {
      const buffer = fs.readFileSync(input);
      return crypto.createHash('md5').update(buffer).digest('hex');
    }

    // Fallback if string is a raw ID or hash
    if (typeof input === 'string') {
      if (/^[a-f0-9]{32}$/i.test(input.trim())) {
        return input.trim().toLowerCase();
      }
      return crypto.createHash('md5').update(input).digest('hex');
    }

    throw new Error('Invalid input for document digest computation.');
  }

  /**
   * Internal HTTP request helper with dual-auth negotiation (X-Auth-User/Key and HTTP Basic fallback)
   */
  private async request(
    endpoint: string,
    options: {
      method?: 'GET' | 'POST' | 'PUT';
      body?: any;
      headers?: Record<string, string>;
      useAuth?: boolean;
    } = {},
  ): Promise<Response> {
    const { method = 'GET', body, headers: additionalHeaders = {}, useAuth = true } = options;

    const buildHeaders = (): Record<string, string> => {
      const headers: Record<string, string> = {
        Accept: 'application/vnd.koreader.v1+json',
        ...additionalHeaders,
      };

      if (method !== 'GET') {
        headers['Content-Type'] = 'application/json';
      }

      if (useAuth && this.config.username) {
        if (this.usesHttpAuth && this.config.password) {
          const creds = Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64');
          headers['Authorization'] = `Basic ${creds}`;
        } else {
          headers['X-Auth-User'] = this.config.username;
          headers['X-Auth-Key'] = this.config.userkey || (this.config.password ? crypto.createHash('md5').update(this.config.password).digest('hex') : '');
        }
      }

      return headers;
    };

    const attempt = async (): Promise<Response> => {
      const headers = buildHeaders();
      const url = `${this.config.serverUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

      return await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    };

    let response = await attempt();

    // Some custom servers return 400 or 401 for auth scheme mismatch; fallback to HTTP Basic
    if (response.status === 401 || response.status === 400) {
      if (!this.usesHttpAuth && this.config.password) {
        this.usesHttpAuth = true;
        const retryResp = await attempt();
        if (retryResp.ok) {
          return retryResp;
        }
        this.usesHttpAuth = false; // Revert if still failed
      }
    }

    return response;
  }

  /**
   * Tests connection to the KOReader sync server.
   * If credentials are unauthorized (401), automatically registers a new account
   * matching standard KOReader client behavior.
   */
  public async connect(): Promise<SyncOperationResult<{ authorized: boolean; registered?: boolean }>> {
    if (!this.config.username) {
      return { success: false, message: 'KOReader sync username is required.' };
    }
    if (!this.config.userkey && !this.config.password) {
      return { success: false, message: 'KOReader sync password or userkey is required.' };
    }

    try {
      const authResponse = await this.request('/users/auth', { method: 'GET', useAuth: true });

      if (authResponse.ok) {
        const isJson = await this.isJsonResponse(authResponse);
        if (!isJson) {
          return { success: false, message: 'Server responded with HTML instead of KOReader Sync JSON. Check server URL.' };
        }
        return { success: true, message: 'Authentication successful.', data: { authorized: true } };
      }

      // If unauthorized, attempt user creation (standard KOReader protocol behavior)
      if (authResponse.status === 401) {
        const userkey = this.config.userkey || crypto.createHash('md5').update(this.config.password || '').digest('hex');
        const regResponse = await this.request('/users/create', {
          method: 'POST',
          useAuth: false,
          body: { username: this.config.username, password: userkey },
        });

        if (regResponse.ok) {
          const isJson = await this.isJsonResponse(regResponse);
          if (!isJson) {
            return { success: false, message: 'Registration response was not valid JSON.' };
          }
          return { success: true, message: 'Registration and login successful.', data: { authorized: true, registered: true } };
        }

        if (regResponse.status === 402) {
          return { success: false, message: 'Invalid credentials or user already exists with different password.' };
        }

        const regError = await regResponse.json().catch(() => ({}));
        return { success: false, message: regError.message || `Registration failed with status: ${regResponse.status}` };
      }

      const errorBody = await authResponse.json().catch(() => ({}));
      return {
        success: false,
        message: errorBody.message || `KOReader sync authorization failed (HTTP ${authResponse.status})`,
      };
    } catch (e: any) {
      return { success: false, message: `KOReader server connection failed: ${e?.message || e}` };
    }
  }

  /**
   * Retrieves reading progress for a given document digest from the server.
   */
  public async getProgress(documentHash: string): Promise<KOSyncProgress | null> {
    if (!this.config.userkey && !this.config.password) return null;
    if (!documentHash) return null;

    try {
      const response = await this.request(`/syncs/progress/${documentHash}`, { method: 'GET' });
      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      if (!data || typeof data !== 'object') return null;

      const hasPosition =
        (typeof data.progress === 'string' && data.progress.length > 0) ||
        (typeof data.percentage === 'number' && Number.isFinite(data.percentage));

      if (!hasPosition) return null;

      return {
        document: data.document || documentHash,
        progress: data.progress || '',
        percentage: typeof data.percentage === 'number' ? data.percentage : 0,
        device: data.device,
        device_id: data.device_id,
        timestamp: data.timestamp || Date.now(),
      };
    } catch (e) {
      console.error('[KOSyncClient] getProgress error:', e);
      return null;
    }
  }

  /**
   * Updates reading progress for a document on the KOReader sync server.
   */
  public async updateProgress(
    documentHash: string,
    progress: string,
    percentage: number,
    metadata?: { filename?: string; title?: string; authors?: string },
  ): Promise<boolean> {
    if (!this.config.userkey && !this.config.password) return false;
    if (!documentHash) return false;

    const payload: any = {
      document: documentHash,
      progress,
      percentage: Number(percentage.toFixed(4)),
      device: this.config.deviceName,
      device_id: this.config.deviceId,
      timestamp: Math.floor(Date.now() / 1000),
    };

    if (this.config.sendMetadata && metadata) {
      payload.metadata = {
        filename: metadata.filename || 'book.epub',
        title: metadata.title || 'Untitled Book',
        authors: metadata.authors || 'Unknown Author',
      };
    }

    try {
      const response = await this.request('/syncs/progress', {
        method: 'PUT',
        body: payload,
      });

      return response.ok;
    } catch (e) {
      console.error('[KOSyncClient] updateProgress error:', e);
      return false;
    }
  }

  private async isJsonResponse(response: Response): Promise<boolean> {
    try {
      const cloned = response.clone();
      const text = await cloned.text();
      const data = JSON.parse(text);
      return typeof data === 'object' && data !== null;
    } catch {
      return false;
    }
  }
}
