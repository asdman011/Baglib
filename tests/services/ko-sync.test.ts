/**
 * Baglib — KOReader Sync Protocol Unit Tests (KEY-147)
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { KOSyncClient } from '../../src/main/services/sync/ko-sync-client';
import type { KOSyncConfig } from '../../src/shared/types/cloud-sync';

describe('KOReader Sync Protocol Client (KEY-147)', () => {
  let tempDir: string;
  const originalFetch = global.fetch;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'baglib-kosync-test-'));
  });

  afterEach(() => {
    global.fetch = originalFetch;
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {}
  });

  describe('Document Digest Calculation', () => {
    it('computes MD5 digest correctly from Buffer', () => {
      const buffer = Buffer.from('Baglib KOReader Test Content');
      const expected = crypto.createHash('md5').update(buffer).digest('hex');

      const digest = KOSyncClient.computeDocumentDigest(buffer);
      assert.strictEqual(digest, expected);
      assert.strictEqual(digest.length, 32);
    });

    it('computes MD5 digest correctly from a disk file', () => {
      const filePath = path.join(tempDir, 'test-book.epub');
      fs.writeFileSync(filePath, 'Simulated EPUB book byte stream');

      const expected = crypto.createHash('md5').update(fs.readFileSync(filePath)).digest('hex');
      const digest = KOSyncClient.computeDocumentDigest(filePath);

      assert.strictEqual(digest, expected);
    });

    it('preserves valid 32-character hex hash strings', () => {
      const validHash = '5d41402abc4b2a76b9719d911017c592';
      const digest = KOSyncClient.computeDocumentDigest(validHash.toUpperCase());
      assert.strictEqual(digest, validHash);
    });
  });

  describe('Authentication & Connection Flow', () => {
    it('initializes userkey from password using MD5 hash', () => {
      const config: KOSyncConfig = {
        serverUrl: 'https://sync.koreader.rocks/',
        username: 'ammar_reader',
        password: 'secret_password_123',
      };
      const client = new KOSyncClient(config);
      const expectedUserKey = crypto.createHash('md5').update('secret_password_123').digest('hex');

      assert.strictEqual(client.getConfig().userkey, expectedUserKey);
      assert.strictEqual(client.getConfig().serverUrl, 'https://sync.koreader.rocks');
    });

    it('successfully connects when /users/auth returns 200 JSON', async () => {
      const client = new KOSyncClient({
        serverUrl: 'https://sync.koreader.rocks',
        username: 'test_user',
        password: 'test_password',
      });

      global.fetch = async (url: any) => {
        assert.ok(String(url).endsWith('/users/auth'));
        return new Response(JSON.stringify({ authorized: 'OK' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const result = await client.connect();
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data?.authorized, true);
    });

    it('automatically registers and logs in on 401 when account does not exist', async () => {
      const client = new KOSyncClient({
        serverUrl: 'https://sync.koreader.rocks',
        username: 'new_reader',
        password: 'new_password',
      });

      let authAttempted = false;
      let regAttempted = false;

      global.fetch = async (url: any) => {
        const urlStr = String(url);
        if (urlStr.endsWith('/users/auth')) {
          authAttempted = true;
          return new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 });
        }
        if (urlStr.endsWith('/users/create')) {
          regAttempted = true;
          return new Response(JSON.stringify({ message: 'User created' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        throw new Error(`Unexpected request to ${urlStr}`);
      };

      const result = await client.connect();
      assert.strictEqual(authAttempted, true);
      assert.strictEqual(regAttempted, true);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data?.registered, true);
    });

    it('rejects servers that return HTML error pages instead of JSON', async () => {
      const client = new KOSyncClient({
        serverUrl: 'https://example.com/wrong-url',
        username: 'test_user',
        password: 'test_password',
      });

      global.fetch = async () => {
        return new Response('<html><body>Welcome to My Server</body></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      };

      const result = await client.connect();
      assert.strictEqual(result.success, false);
      assert.ok(result.message?.includes('HTML instead of KOReader Sync JSON'));
    });
  });

  describe('Progress Synchronization', () => {
    it('retrieves reading progress successfully', async () => {
      const client = new KOSyncClient({
        serverUrl: 'https://sync.koreader.rocks',
        username: 'test_user',
        password: 'test_password',
      });

      const docHash = '5d41402abc4b2a76b9719d911017c592';

      global.fetch = async (url: any) => {
        assert.ok(String(url).endsWith(`/syncs/progress/${docHash}`));
        return new Response(
          JSON.stringify({
            document: docHash,
            progress: '/6/4[chapter-2]!/4/2/10',
            percentage: 0.45,
            device: 'Kindle Paperwhite',
            device_id: 'koreader-123',
            timestamp: 1729116000,
          }),
          { status: 200 },
        );
      };

      const progress = await client.getProgress(docHash);
      assert.ok(progress !== null);
      assert.strictEqual(progress.document, docHash);
      assert.strictEqual(progress.percentage, 0.45);
      assert.strictEqual(progress.progress, '/6/4[chapter-2]!/4/2/10');
      assert.strictEqual(progress.device, 'Kindle Paperwhite');
    });

    it('updates reading progress and attaches metadata when enabled', async () => {
      const client = new KOSyncClient({
        serverUrl: 'https://sync.koreader.rocks',
        username: 'test_user',
        password: 'test_password',
        deviceName: 'Baglib PC',
        sendMetadata: true,
      });

      const docHash = '5d41402abc4b2a76b9719d911017c592';
      let payloadSent: any = null;

      global.fetch = async (url: any, init: any) => {
        assert.ok(String(url).endsWith('/syncs/progress'));
        assert.strictEqual(init.method, 'PUT');
        payloadSent = JSON.parse(init.body);
        return new Response(JSON.stringify({ updated: true }), { status: 200 });
      };

      const ok = await client.updateProgress(docHash, '/6/8[chapter-4]', 0.72, {
        title: 'صحيح البخاري',
        authors: 'الإمام البخاري',
        filename: 'bukhari.epub',
      });

      assert.strictEqual(ok, true);
      assert.ok(payloadSent !== null);
      assert.strictEqual(payloadSent.document, docHash);
      assert.strictEqual(payloadSent.percentage, 0.72);
      assert.strictEqual(payloadSent.device, 'Baglib PC');
      assert.strictEqual(payloadSent.metadata.title, 'صحيح البخاري');
      assert.strictEqual(payloadSent.metadata.authors, 'الإمام البخاري');
    });
  });
});
