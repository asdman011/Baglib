/**
 * Baglib — S3-Compatible Object Storage Provider
 *
 * Implements IStorageProvider for Amazon S3, MinIO, Cloudflare R2,
 * Backblaze B2, and Wasabi using native AWS Signature Version 4 (SigV4).
 * Completely zero external dependencies!
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { IStorageProvider } from '../storage-provider.interface';
import type { CloudProviderType, RemoteFileInfo, S3Config, SyncOperationResult } from '../../../../shared/types/cloud-sync';

export class S3StorageProvider implements IStorageProvider {
  public readonly providerType: CloudProviderType = 's3';
  private config: S3Config;
  private endpointUrl: URL;

  constructor(config: S3Config) {
    this.config = {
      ...config,
      region: config.region || 'us-east-1',
      pathStyle: config.pathStyle !== false, // default true for MinIO/custom S3
    };

    let ep = config.endpoint.trim();
    if (!/^https?:\/\//i.test(ep)) {
      ep = `https://${ep}`;
    }
    this.endpointUrl = new URL(ep);
  }

  private getSignatureKey(key: string, dateStamp: string, regionName: string, serviceName: string): Buffer {
    const kDate = crypto.createHmac('sha256', 'AWS4' + key).update(dateStamp).digest();
    const kRegion = crypto.createHmac('sha256', kDate).update(regionName).digest();
    const kService = crypto.createHmac('sha256', kRegion).update(serviceName).digest();
    const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
    return kSigning;
  }

  private buildSignedRequest(
    method: 'GET' | 'PUT' | 'DELETE' | 'HEAD',
    objectKey: string = '',
    queryParams: Record<string, string> = {},
    payload: Buffer = Buffer.alloc(0),
    contentType: string = 'application/octet-stream',
  ): { url: string; headers: Record<string, string> } {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.substring(0, 8);
    const region = this.config.region || 'us-east-1';
    const service = 's3';

    let host = this.endpointUrl.host;
    let canonicalUri = '';

    if (this.config.pathStyle) {
      canonicalUri = `/${this.config.bucket}/${objectKey.replace(/^\/+/, '')}`;
    } else {
      host = `${this.config.bucket}.${this.endpointUrl.host}`;
      canonicalUri = `/${objectKey.replace(/^\/+/, '')}`;
    }

    // Clean URI encoding
    canonicalUri = canonicalUri.split('/').map((s) => encodeURIComponent(decodeURIComponent(s))).join('/');

    // Canonical query string
    const sortedQueryKeys = Object.keys(queryParams).sort();
    const canonicalQueryString = sortedQueryKeys
      .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`)
      .join('&');

    const payloadHash = crypto.createHash('sha256').update(payload).digest('hex');

    const headers: Record<string, string> = {
      host,
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
    };

    if (method === 'PUT' && payload.length > 0) {
      headers['content-type'] = contentType;
      headers['content-length'] = payload.length.toString();
    }

    const sortedHeaderKeys = Object.keys(headers).sort();
    const canonicalHeaders = sortedHeaderKeys.map((k) => `${k.toLowerCase()}:${headers[k].trim()}\n`).join('');
    const signedHeaders = sortedHeaderKeys.map((k) => k.toLowerCase()).join(';');

    const canonicalRequest = [
      method,
      canonicalUri,
      canonicalQueryString,
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n');

    const signingKey = this.getSignatureKey(this.config.secretAccessKey, dateStamp, region, service);
    const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

    const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${this.config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    headers['Authorization'] = authorizationHeader;

    const protocol = this.endpointUrl.protocol;
    const queryString = canonicalQueryString ? `?${canonicalQueryString}` : '';
    const fullUrl = `${protocol}//${host}${canonicalUri}${queryString}`;

    return { url: fullUrl, headers };
  }

  public async testConnection(): Promise<SyncOperationResult<{ reachable: boolean; details?: any }>> {
    if (!this.config.bucket || !this.config.accessKeyId || !this.config.secretAccessKey) {
      return { success: false, message: 'Bucket, Access Key ID, and Secret Access Key are required for S3.' };
    }

    try {
      // Test listing with max-keys=1
      const { url, headers } = this.buildSignedRequest('GET', '', { 'list-type': '2', 'max-keys': '1' });
      const response = await fetch(url, { method: 'GET', headers });

      if (response.ok) {
        return { success: true, message: 'Connected to S3 bucket successfully.', data: { reachable: true } };
      }

      if (response.status === 403) {
        return { success: false, message: 'S3 Access Denied. Check Access Key ID and Secret Access Key.' };
      }

      if (response.status === 404) {
        return { success: false, message: `S3 Bucket "${this.config.bucket}" does not exist.` };
      }

      return { success: false, message: `S3 server returned status: ${response.status} (${response.statusText})` };
    } catch (e: any) {
      return { success: false, message: `S3 connection failed: ${e?.message || e}` };
    }
  }

  public async listFiles(remotePath: string = ''): Promise<RemoteFileInfo[]> {
    const prefix = remotePath.replace(/^\/+/, '');
    const queryParams: Record<string, string> = { 'list-type': '2' };
    if (prefix) {
      queryParams['prefix'] = prefix.endsWith('/') ? prefix : `${prefix}/`;
    }

    try {
      const { url, headers } = this.buildSignedRequest('GET', '', queryParams);
      const response = await fetch(url, { method: 'GET', headers });

      if (!response.ok) {
        console.error(`[S3] listFiles failed with status ${response.status}`);
        return [];
      }

      const xml = await response.text();
      return this.parseListObjectsV2(xml);
    } catch (e) {
      console.error('[S3] listFiles error:', e);
      return [];
    }
  }

  public async uploadFile(remotePath: string, localFilePathOrBuffer: string | Buffer): Promise<boolean> {
    const objectKey = remotePath.replace(/^\/+/, '');
    let buffer: Buffer;

    if (Buffer.isBuffer(localFilePathOrBuffer)) {
      buffer = localFilePathOrBuffer;
    } else if (typeof localFilePathOrBuffer === 'string') {
      if (!fs.existsSync(localFilePathOrBuffer)) {
        throw new Error(`File not found for S3 upload: ${localFilePathOrBuffer}`);
      }
      buffer = fs.readFileSync(localFilePathOrBuffer);
    } else {
      throw new Error('Invalid file input for S3 upload.');
    }

    try {
      const { url, headers } = this.buildSignedRequest(
        'PUT',
        objectKey,
        {},
        buffer,
        'application/octet-stream',
      );

      const response = await fetch(url, {
        method: 'PUT',
        headers,
        body: new Uint8Array(buffer),
      });

      return response.ok;
    } catch (e) {
      console.error(`[S3] uploadFile error for ${remotePath}:`, e);
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
      console.error(`[S3] downloadFile failed saving to ${localDestinationPath}:`, e);
      return false;
    }
  }

  public async readFile(remotePath: string): Promise<Buffer | null> {
    const objectKey = remotePath.replace(/^\/+/, '');
    try {
      const { url, headers } = this.buildSignedRequest('GET', objectKey);
      const response = await fetch(url, { method: 'GET', headers });

      if (!response.ok) {
        console.error(`[S3] readFile failed for ${remotePath}: HTTP ${response.status}`);
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (e) {
      console.error(`[S3] readFile error for ${remotePath}:`, e);
      return null;
    }
  }

  public async deleteFile(remotePath: string): Promise<boolean> {
    const objectKey = remotePath.replace(/^\/+/, '');
    try {
      const { url, headers } = this.buildSignedRequest('DELETE', objectKey);
      const response = await fetch(url, { method: 'DELETE', headers });
      return response.status === 204 || response.ok;
    } catch (e) {
      console.error(`[S3] deleteFile error for ${remotePath}:`, e);
      return false;
    }
  }

  private parseListObjectsV2(xml: string): RemoteFileInfo[] {
    const results: RemoteFileInfo[] = [];
    const contentsRegex = /<Contents>([\s\S]*?)<\/Contents>/gi;

    let match: RegExpExecArray | null;
    while ((match = contentsRegex.exec(xml)) !== null) {
      const block = match[1];

      const keyMatch = /<Key>(.*?)<\/Key>/i.exec(block);
      if (!keyMatch) continue;
      const key = keyMatch[1].trim();

      const sizeMatch = /<Size>(\d+)<\/Size>/i.exec(block);
      const size = sizeMatch ? parseInt(sizeMatch[1], 10) : 0;

      const modifiedMatch = /<LastModified>(.*?)<\/LastModified>/i.exec(block);
      const lastModified = modifiedMatch ? modifiedMatch[1].trim() : undefined;

      const etagMatch = /<ETag>(.*?)<\/ETag>/i.exec(block);
      const etag = etagMatch ? etagMatch[1].replace(/&quot;|"/g, '').trim() : undefined;

      const isDirectory = key.endsWith('/');
      const name = path.basename(key) || key;

      results.push({
        name,
        path: key,
        size,
        isDirectory,
        lastModified,
        etag,
      });
    }

    return results;
  }
}
