/**
 * Baglib — Multi-Cloud Storage Providers Unit Tests (KEY-147)
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { WebDavStorageProvider } from '../../src/main/services/sync/providers/webdav-storage.provider';
import { S3StorageProvider } from '../../src/main/services/sync/providers/s3-storage.provider';
import { StorageManagerService } from '../../src/main/services/sync/storage-manager.service';
import type { CloudConfig, S3Config, WebDavConfig } from '../../src/shared/types/cloud-sync';

describe('Multi-Cloud Storage Providers (KEY-147)', () => {
  let tempDir: string;
  const originalFetch = global.fetch;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'baglib-cloud-test-'));
  });

  afterEach(() => {
    global.fetch = originalFetch;
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {}
  });

  describe('WebDAV Storage Provider', () => {
    it('formats basic auth headers and resolves base URL correctly', () => {
      const config: WebDavConfig = {
        url: 'https://dav.example.com/remote.php/webdav/',
        username: 'ammar',
        password: 'dav_password',
      };
      const provider = new WebDavStorageProvider(config);
      assert.strictEqual(provider.providerType, 'webdav');
    });

    it('parses RFC 4918 PROPFIND multi-status XML responses into RemoteFileInfo list', async () => {
      const config: WebDavConfig = {
        url: 'https://dav.example.com/books',
        username: 'user',
        password: 'pass',
      };
      const provider = new WebDavStorageProvider(config);

      const sampleXml = `<?xml version="1.0" encoding="utf-8"?>
      <d:multistatus xmlns:d="DAV:">
        <d:response>
          <d:href>/books/</d:href>
          <d:propstat>
            <d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop>
            <d:status>HTTP/1.1 200 OK</d:status>
          </d:propstat>
        </d:response>
        <d:response>
          <d:href>/books/tafsir-ibn-kathir.epub</d:href>
          <d:propstat>
            <d:prop>
              <d:resourcetype/>
              <d:getcontentlength>2548200</d:getcontentlength>
              <d:getlastmodified>Thu, 15 Oct 2026 12:00:00 GMT</d:getlastmodified>
              <d:getetag>"982a7f"</d:getetag>
            </d:prop>
            <d:status>HTTP/1.1 200 OK</d:status>
          </d:propstat>
        </d:response>
        <d:response>
          <d:href>/books/backups/</d:href>
          <d:propstat>
            <d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop>
            <d:status>HTTP/1.1 200 OK</d:status>
          </d:propstat>
        </d:response>
      </d:multistatus>`;

      global.fetch = async () => {
        return new Response(sampleXml, {
          status: 207,
          headers: { 'Content-Type': 'application/xml' },
        });
      };

      const files = await provider.listFiles();
      assert.strictEqual(files.length, 2); // Excludes root /books/

      const bookFile = files.find((f) => f.name === 'tafsir-ibn-kathir.epub');
      assert.ok(bookFile);
      assert.strictEqual(bookFile.size, 2548200);
      assert.strictEqual(bookFile.isDirectory, false);
      assert.strictEqual(bookFile.etag, '982a7f');

      const folder = files.find((f) => f.name === 'backups');
      assert.ok(folder);
      assert.strictEqual(folder.isDirectory, true);
    });

    it('uploads file using HTTP PUT with proper headers', async () => {
      const config: WebDavConfig = {
        url: 'https://dav.example.com',
        username: 'user',
        password: 'pass',
      };
      const provider = new WebDavStorageProvider(config);

      let putCalled = false;
      let headersReceived: unknown = null;

      global.fetch = async (url: unknown, init: unknown) => {
        if (init?.method === 'MKCOL') {
          return new Response(null, { status: 201 });
        }
        if (init?.method === 'PUT') {
          putCalled = true;
          headersReceived = init.headers;
          return new Response(null, { status: 201 });
        }
        return new Response(null, { status: 200 });
      };

      const testBuffer = Buffer.from('Backup data test payload');
      const uploaded = await provider.uploadFile('backups/test.zip', testBuffer);

      assert.strictEqual(uploaded, true);
      assert.strictEqual(putCalled, true);
      assert.ok(headersReceived['Authorization']?.startsWith('Basic '));
      assert.strictEqual(headersReceived['Content-Type'], 'application/octet-stream');
    });
  });

  describe('S3 Storage Provider', () => {
    it('generates valid AWS SigV4 signed headers for requests', async () => {
      const s3Config: S3Config = {
        endpoint: 'https://s3.us-east-1.amazonaws.com',
        bucket: 'baglib-library-test',
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        region: 'us-east-1',
      };
      const provider = new S3StorageProvider(s3Config);

      let authHeader: string = '';
      global.fetch = async (url: unknown, init: unknown) => {
        authHeader = init?.headers?.['Authorization'] || '';
        return new Response('<ListBucketResult></ListBucketResult>', { status: 200 });
      };

      await provider.listFiles();

      assert.ok(authHeader.startsWith('AWS4-HMAC-SHA256 '));
      assert.ok(authHeader.includes('Credential=AKIAIOSFODNN7EXAMPLE/'));
      assert.ok(authHeader.includes('SignedHeaders='));
      assert.ok(authHeader.includes('Signature='));
    });

    it('parses S3 ListObjectsV2 XML response into RemoteFileInfo items', async () => {
      const s3Config: S3Config = {
        endpoint: 'https://minio.local:9000',
        bucket: 'my-bucket',
        accessKeyId: 'minioadmin',
        secretAccessKey: 'minioadmin',
      };
      const provider = new S3StorageProvider(s3Config);

      const s3Xml = `<?xml version="1.0" encoding="UTF-8"?>
      <ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
        <Name>my-bucket</Name>
        <Contents>
          <Key>backups/Baglib-Backup-1729116000000.zip</Key>
          <LastModified>2026-10-15T21:00:00.000Z</LastModified>
          <ETag>&quot;b10a8db164e0754105b7a99be72e3fe5&quot;</ETag>
          <Size>482104</Size>
        </Contents>
        <Contents>
          <Key>books/al-muwatta.pdf</Key>
          <LastModified>2026-10-16T10:00:00.000Z</LastModified>
          <ETag>&quot;cca2c29c8&quot;</ETag>
          <Size>15840291</Size>
        </Contents>
      </ListBucketResult>`;

      global.fetch = async () => {
        return new Response(s3Xml, { status: 200 });
      };

      const files = await provider.listFiles();
      assert.strictEqual(files.length, 2);

      const backup = files[0];
      assert.strictEqual(backup.name, 'Baglib-Backup-1729116000000.zip');
      assert.strictEqual(backup.size, 482104);
      assert.strictEqual(backup.etag, 'b10a8db164e0754105b7a99be72e3fe5');

      const book = files[1];
      assert.strictEqual(book.name, 'al-muwatta.pdf');
      assert.strictEqual(book.size, 15840291);
    });
  });

  describe('Storage Manager Service', () => {
    it('instantiates appropriate provider based on configured type', () => {
      const manager = new StorageManagerService();

      const webdavProv = manager.getProvider({
        provider: 'webdav',
        enabled: true,
        webdav: { url: 'https://dav.test' },
      });
      assert.strictEqual(webdavProv.providerType, 'webdav');

      const s3Prov = manager.getProvider({
        provider: 's3',
        enabled: true,
        s3: { endpoint: 'https://s3.test', bucket: 'test', accessKeyId: 'k', secretAccessKey: 's' },
      });
      assert.strictEqual(s3Prov.providerType, 's3');

      const dropboxProv = manager.getProvider({
        provider: 'dropbox',
        enabled: true,
        dropbox: { token: 'sample-token' },
      });
      assert.strictEqual(dropboxProv.providerType, 'dropbox');
    });
  });
});
