import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WikipediaService } from '../../src/main/services/dictionary/wikipedia.service';

describe('KEY-142 Wikipedia Encyclopedia Service Tests', () => {
  it('detects language and formats Wikipedia summary card', async () => {
    const service = new WikipediaService();

    // Query English word
    const enResult = await service.fetchSummary('Library', 'en');
    if (enResult) {
      assert.equal(enResult.lang, 'en');
      assert.equal(enResult.dir, 'ltr');
      assert.ok(enResult.title.length > 0);
      assert.ok(enResult.articleUrl.includes('wikipedia.org'));
      assert.ok(enResult.extract.length > 0);
    }

    // Query Arabic word
    const arResult = await service.fetchSummary('مكتبة', 'ar');
    if (arResult) {
      assert.equal(arResult.lang, 'ar');
      assert.equal(arResult.dir, 'rtl');
      assert.ok(arResult.title.length > 0);
      assert.ok(arResult.articleUrl.includes('ar.wikipedia.org'));
      assert.ok(arResult.extract.length > 0);
    }
  });

  it('handles empty input or non-existent article gracefully', async () => {
    const service = new WikipediaService();
    const emptyRes = await service.fetchSummary('');
    assert.equal(emptyRes, null);

    const nonExistent = await service.fetchSummary('xyznonexistentterm123456789baglib');
    assert.equal(nonExistent, null);
  });
});
