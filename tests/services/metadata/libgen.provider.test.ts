import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LibgenProvider, LIBGEN_MIRRORS } from '../../../src/main/services/metadata/libgen.provider';

describe('LibgenProvider (Task 5.8)', () => {
  const provider = new LibgenProvider();

  describe('Mirrors & Direct Download URL Transformation', () => {
    it('defines valid mirror endpoints including libgen.li and libgen.bz', () => {
      assert.ok(LIBGEN_MIRRORS.includes('https://libgen.li'));
      assert.ok(LIBGEN_MIRRORS.includes('https://libgen.bz'));
      assert.ok(LIBGEN_MIRRORS.length >= 3);
    });

    it('transforms /ads.php?md5= URLs to direct /get.php?md5= links', () => {
      const adsUrl = '/ads.php?md5=d3848357ae109884a140c7b3662e0e30';
      const transformed = provider.transformDownloadUrl(adsUrl, 'https://libgen.li');
      assert.strictEqual(transformed, 'https://libgen.li/get.php?md5=d3848357ae109884a140c7b3662e0e30');
    });

    it('transforms /ads<md5> URLs to direct /get.php?md5= links', () => {
      const adsUrl = '/ads976993b85e921f0e0d0f57424e29416f';
      const transformed = provider.transformDownloadUrl(adsUrl, 'https://libgen.li');
      assert.strictEqual(transformed, 'https://libgen.li/get.php?md5=976993b85e921f0e0d0f57424e29416f');
    });

    it('preserves existing full URLs if no md5 pattern matched', () => {
      const regularUrl = 'https://custom-mirror.org/download/book.pdf';
      const transformed = provider.transformDownloadUrl(regularUrl, 'https://libgen.li');
      assert.strictEqual(transformed, regularUrl);
    });
  });

  describe('HTML Table Parsing and Extraction', () => {
    const mockHtml = `
      <!DOCTYPE html>
      <html>
      <body>
        <table class="table table-striped">
          <thead>
            <tr>
              <th></th>
              <th>Title</th>
              <th>Author(s)</th>
              <th>Publisher</th>
              <th>Year</th>
              <th>Language</th>
              <th>Pages</th>
              <th>Size</th>
              <th>Ext.</th>
              <th>Mirrors</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <a href="edition.php?id=101"><img src="/covers/test_cover.jpg"></a>
              </td>
              <td>
                <b>Series Name</b><br>
                <a title="Tooltip info<br>extra note" href="edition.php?id=101">Clean Architecture: A Craftsman's Guide</a><br>
                <i><font color="green">978-0134494166</font></i>
              </td>
              <td>Robert C. Martin</td>
              <td>Prentice Hall</td>
              <td>2017</td>
              <td>English</td>
              <td>432</td>
              <td>12 MB</td>
              <td>epub</td>
              <td>
                <a href="/ads.php?md5=aabbccddeeff00112233445566778899">Mirror 1</a>
              </td>
            </tr>
            <tr>
              <td></td>
              <td>
                <a href="edition.php?id=102">Refactoring: Improving the Design of Existing Code</a>
              </td>
              <td>Martin Fowler</td>
              <td>Addison-Wesley</td>
              <td>2018</td>
              <td>English</td>
              <td>448</td>
              <td>8.5 MB</td>
              <td>pdf</td>
              <td>
                <a href="/ads00112233445566778899aabbccddeeff">Mirror 1</a>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
      </html>
    `;

    it('parses valid LibGen HTML table rows into structured results', () => {
      const results = provider.parseHtml(mockHtml, 'https://libgen.li', 10);
      assert.strictEqual(results.length, 2);

      const first = results[0];
      assert.strictEqual(first.title, "Clean Architecture: A Craftsman's Guide");
      assert.strictEqual(first.author, 'Robert C. Martin');
      assert.strictEqual(first.publisher, 'Prentice Hall');
      assert.strictEqual(first.year, 2017);
      assert.strictEqual(first.language, 'English');
      assert.strictEqual(first.pages, '432');
      assert.strictEqual(first.fileSize, '12 MB');
      assert.strictEqual(first.format, 'EPUB');
      assert.strictEqual(first.isbn, '978-0134494166');
      assert.strictEqual(first.md5, 'aabbccddeeff00112233445566778899');
      assert.strictEqual(first.coverUrl, 'https://libgen.li/covers/test_cover.jpg');
      assert.strictEqual(first.downloadUrl, 'https://libgen.li/get.php?md5=aabbccddeeff00112233445566778899');

      const second = results[1];
      assert.strictEqual(second.title, 'Refactoring: Improving the Design of Existing Code');
      assert.strictEqual(second.author, 'Martin Fowler');
      assert.strictEqual(second.publisher, 'Addison-Wesley');
      assert.strictEqual(second.year, 2018);
      assert.strictEqual(second.format, 'PDF');
      assert.strictEqual(second.coverUrl, undefined);
      assert.strictEqual(second.md5, '00112233445566778899aabbccddeeff');
      assert.strictEqual(second.downloadUrl, 'https://libgen.li/get.php?md5=00112233445566778899aabbccddeeff');
    });

    it('returns empty array when HTML contains no results table', () => {
      const emptyHtml = '<html><body><p>No results found</p></body></html>';
      const results = provider.parseHtml(emptyHtml, 'https://libgen.li');
      assert.deepStrictEqual(results, []);
    });

    it('respects maxResults limit', () => {
      const results = provider.parseHtml(mockHtml, 'https://libgen.li', 1);
      assert.strictEqual(results.length, 1);
    });
  });
});
