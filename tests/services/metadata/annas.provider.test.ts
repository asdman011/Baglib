import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { annasProvider, AnnasProvider } from '../../../src/main/services/metadata/annas.provider';

describe("Anna's Archive Provider", () => {
  const provider = new AnnasProvider();

  describe('HTML Card Parsing and Extraction', () => {
    it('parses valid Anna Archive HTML cards into structured records', () => {
      const sampleHtml = `
        <div class="search-results">
          <a href="/md5/a1b2c3d4e5f60718293a4b5c6d7e8f90" class="custom-a block mr-2 sm:mr-4 hover:opacity-80">
            <img src="/covers/a1b2c3d4e5f60718293a4b5c6d7e8f90.jpg" />
          </a>
          <div class="max-w-full">
            <h3 class="font-bold">Clean Architecture: A Craftsman Guide</h3>
            <span class="italic">Robert C. Martin</span>
            <div class="text-gray-800">English [en] · EPUB · 14.2MB · 2017</div>
            <a href="/md5/a1b2c3d4e5f60718293a4b5c6d7e8f90">View</a>
          </div>

          <a href="/md5/11223344556677889900aabbccddeeff" class="custom-a block mr-2 sm:mr-4 hover:opacity-80">
            <img src="https://cdn.annas.org/covers/1122.jpg" />
          </a>
          <div class="max-w-full">
            <h3 class="font-bold">Designing Data-Intensive Applications</h3>
            <span class="italic">Martin Kleppmann</span>
            <div class="text-gray-800">English [en] · PDF · 8.5MB · 2016</div>
            <a href="/md5/11223344556677889900aabbccddeeff">View</a>
          </div>
        </div>
      `;

      const results = provider.parseHtml(sampleHtml, 'https://annas-archive.gl', 10);
      assert.strictEqual(results.length, 2);

      // First item
      assert.strictEqual(results[0]?.title, 'Clean Architecture: A Craftsman Guide');
      assert.strictEqual(results[0]?.author, 'Robert C. Martin');
      assert.strictEqual(results[0]?.format, 'EPUB');
      assert.strictEqual(results[0]?.fileSize, '14.2MB');
      assert.strictEqual(results[0]?.year, 2017);
      assert.strictEqual(results[0]?.md5, 'a1b2c3d4e5f60718293a4b5c6d7e8f90');
      assert.strictEqual(results[0]?.detailUrl, 'https://annas-archive.gl/md5/a1b2c3d4e5f60718293a4b5c6d7e8f90');

      // Second item
      assert.strictEqual(results[1]?.title, 'Designing Data-Intensive Applications');
      assert.strictEqual(results[1]?.author, 'Martin Kleppmann');
      assert.strictEqual(results[1]?.format, 'PDF');
      assert.strictEqual(results[1]?.fileSize, '8.5MB');
      assert.strictEqual(results[1]?.year, 2016);
      assert.strictEqual(results[1]?.coverUrl, 'https://cdn.annas.org/covers/1122.jpg');
    });

    it('returns empty array when HTML contains no cards', () => {
      const results = provider.parseHtml('<html><body>No records found</body></html>', 'https://annas-archive.gl');
      assert.deepStrictEqual(results, []);
    });

    it('respects maxResults limit', () => {
      const repeatedHtml = `
        <a href="/md5/11111111111111111111111111111111"></a><h3>Book 1</h3><div class="meta">PDF · 1MB</div>
        <a href="/md5/22222222222222222222222222222222"></a><h3>Book 2</h3><div class="meta">PDF · 2MB</div>
        <a href="/md5/33333333333333333333333333333333"></a><h3>Book 3</h3><div class="meta">PDF · 3MB</div>
      `;
      const results = provider.parseHtml(repeatedHtml, 'https://annas-archive.gl', 2);
      assert.strictEqual(results.length, 2);
    });
  });
});
