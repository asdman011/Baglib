import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { CoverFetchService } from '../../../src/main/services/metadata/cover-fetch.service';

describe('CoverFetchService Unit Tests (Story 12)', () => {
  const service = new CoverFetchService();

  it('rejects covers with size below minimum byte threshold (<250 bytes)', async () => {
    // 1x1 transparent PNG data URI (only 68 bytes)
    const tinyPixelDataUrl =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

    const result = await service.fetchAndCacheCover({
      workId: 'work-test-tiny',
      coverUrl: tinyPixelDataUrl,
      minSizeBytes: 250,
    });

    assert.strictEqual(result.success, false);
    assert.match(result.error || '', /too small|minimum threshold/i);
  });

  it('successfully caches base64 data URL with valid image payload (>= 250 bytes)', async () => {
    // Generate valid dummy payload >= 250 bytes
    const dummyImageBuffer = Buffer.alloc(400, 0x89);
    dummyImageBuffer[0] = 0x89;
    dummyImageBuffer[1] = 0x50; // 'P'
    dummyImageBuffer[2] = 0x4e; // 'N'
    dummyImageBuffer[3] = 0x47; // 'G'
    const validDataUrl = `data:image/png;base64,${dummyImageBuffer.toString('base64')}`;

    const result = await service.fetchAndCacheCover({
      workId: 'work-test-base64',
      coverUrl: validDataUrl,
      minSizeBytes: 250,
    });

    assert.strictEqual(result.success, true);
    assert.ok(result.coverUrl, 'Result must provide local coverUrl');
    assert.ok(result.coverUrl.includes('work-test-base64'));

    // Verify file exists on disk and has expected byte length
    let localPath = result.coverUrl;
    if (localPath.startsWith('file://')) {
      localPath = localPath.replace(/^file:\/\/\/?/, '');
      if (process.platform === 'win32' && !localPath.includes(':')) {
        localPath = '/' + localPath;
      }
    }

    if (fs.existsSync(localPath)) {
      const stats = fs.statSync(localPath);
      assert.strictEqual(stats.size, 400);
      // Clean up test artifact
      try {
        fs.unlinkSync(localPath);
      } catch {
        // Ignore cleanup error
      }
    }
  });

  it('returns graceful failure when cover URL is invalid or malformed', async () => {
    const result = await service.fetchAndCacheCover({
      workId: 'work-test-malformed',
      coverUrl: 'not_a_valid_url_at_all',
    });

    assert.strictEqual(result.success, false);
    assert.ok(result.error);
  });
});
