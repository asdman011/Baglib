import { errorMessage } from '../../../../shared/errors';
/**
 * Baglib — WebDAV & Nextcloud Storage Provider
 *
 * Implements IStorageProvider using standard RFC 4918 WebDAV protocol.
 * Native compatibility with:
 *   - Nextcloud / ownCloud (/remote.php/dav/files/<user>/)
 *   - Alist, TrueNAS, Synology NAS
 *   - Apache / Nginx WebDAV modules
 */

import fs from 'fs';
import path from 'path';
import type { IStorageProvider } from '../storage-provider.interface';
import type { CloudProviderType, RemoteFileInfo, SyncOperationResult, WebDavConfig } from '../../../../shared/types/cloud-sync';

export class WebDavStorageProvider implements IStorageProvider {
  public readonly providerType: CloudProviderType;
  private config: WebDavConfig;
  private baseUrl: string;

  constructor(config: WebDavConfig, providerType: CloudProviderType = 'webdav') {
    this.providerType = providerType;
    this.config = config;
    let url = (config.url || '').trim().replace(/\/+$/, '');

    // For Nextcloud, if user entered base instance URL and provided username, append webdav root if omitted
    if (providerType === 'nextcloud' && config.username && !url.includes('/remote.php/')) {
      url = `${url}/remote.php/dav/files/${encodeURIComponent(config.username)}`;
    }

    this.baseUrl = url;
  }

  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.config.username && this.config.password) {
      const creds = Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64');
      headers['Authorization'] = `Basic ${creds}`;
    }
    return headers;
  }

  private resolveUrl(remotePath: string = ''): string {
    const cleaned = remotePath.replace(/^\/+/, '');
    return cleaned ? `${this.baseUrl}/${cleaned}` : this.baseUrl;
  }

  public async testConnection(): Promise<SyncOperationResult<{ reachable: boolean; details?: unknown }>> {
    if (!this.baseUrl) {
      return { success: false, message: 'WebDAV server URL is required.' };
    }

    try {
      // Check Nextcloud status if nextcloud
      if (this.providerType === 'nextcloud') {
        try {
          const origin = new URL(this.config.url).origin;
          const statusResp = await fetch(`${origin}/status.php`, {
            headers: this.getAuthHeaders(),
          });
          if (statusResp.ok) {
            const statusJson = await statusResp.json().catch(() => null);
            if (statusJson && statusJson.installed) {
              // Proceed to test DAV endpoint
            }
          }
        } catch {
          // Fall through to PROPFIND
        }
      }

      const response = await fetch(this.resolveUrl(''), {
        method: 'PROPFIND',
        headers: {
          ...this.getAuthHeaders(),
          Depth: '0',
          'Content-Type': 'application/xml; charset=utf-8',
        },
      });

      if (response.status === 207 || response.ok) {
        return {
          success: true,
          message: 'Connected to WebDAV server successfully.',
          data: { reachable: true, details: { status: response.status } },
        };
      }

      if (response.status === 401) {
        return { success: false, message: 'WebDAV authentication failed. Check username and password.' };
      }

      if (response.status === 404) {
        return { success: false, message: `WebDAV directory path not found: ${this.baseUrl}` };
      }

      return {
        success: false,
        message: `WebDAV server responded with status: ${response.status} (${response.statusText})`,
      };
    } catch (e: unknown) {
      return { success: false, message: `Failed to connect to WebDAV server: ${errorMessage(e) || e}` };
    }
  }

  public async listFiles(remotePath: string = ''): Promise<RemoteFileInfo[]> {
    const targetUrl = this.resolveUrl(remotePath);

    try {
      const response = await fetch(targetUrl, {
        method: 'PROPFIND',
        headers: {
          ...this.getAuthHeaders(),
          Depth: '1',
          'Content-Type': 'application/xml; charset=utf-8',
        },
      });

      if (!response.ok && response.status !== 207) {
        console.error(`[WebDAV] listFiles failed with status ${response.status}`);
        return [];
      }

      const xmlText = await response.text();
      return this.parsePropfindXml(xmlText, targetUrl);
    } catch (e) {
      console.error('[WebDAV] listFiles error:', e);
      return [];
    }
  }

  public async createFolder(remotePath: string): Promise<boolean> {
    const targetUrl = this.resolveUrl(remotePath);
    try {
      const response = await fetch(targetUrl, {
        method: 'MKCOL',
        headers: this.getAuthHeaders(),
      });
      return response.status === 201 || response.status === 405 || response.ok;
    } catch {
      return false;
    }
  }

  public async uploadFile(remotePath: string, localFilePathOrBuffer: string | Buffer): Promise<boolean> {
    const targetUrl = this.resolveUrl(remotePath);

    let fileBuffer: Buffer;
    if (Buffer.isBuffer(localFilePathOrBuffer)) {
      fileBuffer = localFilePathOrBuffer;
    } else if (typeof localFilePathOrBuffer === 'string') {
      if (!fs.existsSync(localFilePathOrBuffer)) {
        throw new Error(`Local file not found for upload: ${localFilePathOrBuffer}`);
      }
      fileBuffer = fs.readFileSync(localFilePathOrBuffer);
    } else {
      throw new Error('Invalid file input for WebDAV upload.');
    }

    try {
      // Ensure parent directory exists if path has subfolders
      const segments = remotePath.split('/').filter(Boolean);
      if (segments.length > 1) {
        let currentFolder = '';
        for (let i = 0; i < segments.length - 1; i++) {
          currentFolder += (currentFolder ? '/' : '') + segments[i];
          await this.createFolder(currentFolder);
        }
      }

      const response = await fetch(targetUrl, {
        method: 'PUT',
        headers: {
          ...this.getAuthHeaders(),
          'Content-Type': 'application/octet-stream',
          'Content-Length': fileBuffer.length.toString(),
        },
        body: new Uint8Array(fileBuffer),
      });

      return response.status === 200 || response.status === 201 || response.status === 204;
    } catch (e) {
      console.error(`[WebDAV] Upload failed to ${remotePath}:`, e);
      return false;
    }
  }

  public async downloadFile(remotePath: string, localDestinationPath: string): Promise<boolean> {
    const buffer = await this.readFile(remotePath);
    if (!buffer) return false;

    try {
      const dir = path.dirname(localDestinationPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(localDestinationPath, buffer);
      return true;
    } catch (e) {
      console.error(`[WebDAV] Failed saving downloaded file to ${localDestinationPath}:`, e);
      return false;
    }
  }

  public async readFile(remotePath: string): Promise<Buffer | null> {
    const targetUrl = this.resolveUrl(remotePath);
    try {
      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        console.error(`[WebDAV] Read file ${remotePath} failed: HTTP ${response.status}`);
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (e) {
      console.error(`[WebDAV] readFile error for ${remotePath}:`, e);
      return null;
    }
  }

  public async deleteFile(remotePath: string): Promise<boolean> {
    const targetUrl = this.resolveUrl(remotePath);
    try {
      const response = await fetch(targetUrl, {
        method: 'DELETE',
        headers: this.getAuthHeaders(),
      });
      return response.status === 200 || response.status === 204 || response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Lightweight RFC 4918 Multi-Status XML parser extracting href, isDirectory, size, and date
   */
  private parsePropfindXml(xml: string, requestUrl: string): RemoteFileInfo[] {
    const results: RemoteFileInfo[] = [];
    const responseRegex = /<(?:[a-zA-Z0-9]+:)?response\b[^>]*>([\s\S]*?)<\/(?:[a-zA-Z0-9]+:)?response>/gi;

    let parsedReqPath = '';
    try {
      parsedReqPath = decodeURIComponent(new URL(requestUrl).pathname).replace(/\/+$/, '');
    } catch {
      parsedReqPath = '';
    }

    let match: RegExpExecArray | null;
    while ((match = responseRegex.exec(xml)) !== null) {
      const responseBlock = match[1];

      // Extract href
      const hrefMatch = /<(?:[a-zA-Z0-9]+:)?href\b[^>]*>(.*?)<\/(?:[a-zA-Z0-9]+:)?href>/i.exec(responseBlock);
      if (!hrefMatch) continue;

      const href = decodeURIComponent(hrefMatch[1].trim());

      // Check isDirectory
      const isCollection = /<(?:[a-zA-Z0-9]+:)?resourcetype\b[^>]*>[\s\S]*?<(?:[a-zA-Z0-9]+:)?collection\b/i.test(responseBlock);

      // Extract content length
      const lengthMatch = /<(?:[a-zA-Z0-9]+:)?getcontentlength\b[^>]*>(\d+)<\/(?:[a-zA-Z0-9]+:)?getcontentlength>/i.exec(responseBlock);
      const size = lengthMatch ? parseInt(lengthMatch[1], 10) : 0;

      // Extract last modified
      const modifiedMatch = /<(?:[a-zA-Z0-9]+:)?getlastmodified\b[^>]*>(.*?)<\/(?:[a-zA-Z0-9]+:)?getlastmodified>/i.exec(responseBlock);
      const lastModified = modifiedMatch ? modifiedMatch[1].trim() : undefined;

      // Extract etag
      const etagMatch = /<(?:[a-zA-Z0-9]+:)?getetag\b[^>]*>(.*?)<\/(?:[a-zA-Z0-9]+:)?getetag>/i.exec(responseBlock);
      const etag = etagMatch ? etagMatch[1].replace(/["']/g, '').trim() : undefined;

      // Skip the root request path itself if returned Depth: 1
      const normalizedHref = href.replace(/\/+$/, '');
      if (normalizedHref === parsedReqPath) {
        continue;
      }

      const fileName = path.basename(normalizedHref);
      if (!fileName) continue;

      results.push({
        name: fileName,
        path: href,
        size,
        isDirectory: isCollection,
        lastModified,
        etag,
      });
    }

    return results;
  }
}
