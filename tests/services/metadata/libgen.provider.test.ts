import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LibgenProvider, LIBGEN_MIRRORS } from '../../../src/main/services/metadata/libgen.provider';
import {
  LibgenDownloadService,
  PUBLIC_IPFS_GATEWAYS,
} from '../../../src/main/services/digital/libgen-download.service';

describe('LibgenProvider & Official json.php API Pipeline', () => {
  const provider = new LibgenProvider();
  const downloadService = LibgenDownloadService.getInstance();

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

  describe('Official json.php Specification & Extended Metadata Keys', () => {
    it('extracts values from add associative map using numeric keys', () => {
      const mockAdd = {
        '1001': { key: '505', value: '9780134494166', name_en: 'ISBN' },
        '1002': { key: '505', value: '0134494164', name_en: 'ISBN' },
        '1003': { key: '996', value: 'Essential reading for software architects.', name_en: 'Description' },
        '1004': { key: '101', value: 'eng', name_en: 'Language' },
        '1005': { key: '877', value: 'bafykbzacecw5orl3yia2aagm64vi5t4t4x7g7rss2u5v5t64gxzzjqf5cwato', name_en: 'IPFS CID' },
      };

      const isbns = provider.getAddValues(mockAdd, '505');
      assert.deepStrictEqual(isbns, ['9780134494166', '0134494164']);

      const desc = provider.getAddValues(mockAdd, '996');
      assert.strictEqual(desc[0], 'Essential reading for software architects.');

      const lang = provider.getAddValues(mockAdd, '101');
      assert.strictEqual(lang[0], 'eng');

      const ipfs = provider.getAddValues(mockAdd, '877');
      assert.strictEqual(ipfs[0], 'bafykbzacecw5orl3yia2aagm64vi5t4t4x7g7rss2u5v5t64gxzzjqf5cwato');
    });

    it('maps hydrated edition with relational files subarray into LibgenSearchResult items', () => {
      const editionId = '138119005';
      const mockEdition = {
        title: 'Clean Architecture: A Craftsman’s Guide',
        author: 'Robert C. Martin',
        publisher: 'Prentice Hall',
        year: '2017',
        pages: '432',
        series_name: 'Robert C. Martin Series',
        cover_exists: '1',
        add: {
          '1': { key: '505', value: '9780134494166' },
          '2': { key: '996', value: 'Detailed software architecture book.' },
          '3': { key: '101', value: 'eng' },
        },
      };

      const mockFiles = [
        {
          f_id: '93335846',
          md5: 'b1c94251908069df0a3dbe2462f52cdd',
          extension: 'pdf',
          filesize: '6677970',
          pages: '429',
          add: {
            '10': { key: '877', value: 'bafykbzacecw5orl3yia2aagm64vi5t4t4x7g7rss2u5v5t64gxzzjqf5cwato' },
          },
        },
        {
          f_id: '93127454',
          md5: '4443ee15eeb31720fcd1324d5652ede7',
          extension: 'epub',
          filesize: '6582626',
          pages: '432',
        },
      ];

      const results = provider.mapEditionToSearchResults(editionId, mockEdition, mockFiles, 'https://libgen.li');
      assert.strictEqual(results.length, 2);

      const pdfCandidate = results[0];
      assert.strictEqual(pdfCandidate.title, 'Clean Architecture: A Craftsman’s Guide');
      assert.strictEqual(pdfCandidate.author, 'Robert C. Martin');
      assert.strictEqual(pdfCandidate.format, 'PDF');
      assert.strictEqual(pdfCandidate.isbn, '9780134494166');
      assert.strictEqual(pdfCandidate.md5, 'b1c94251908069df0a3dbe2462f52cdd');
      assert.strictEqual(pdfCandidate.fileSize, '6.4 MB');
      assert.strictEqual(pdfCandidate.ipfsCid, 'bafykbzacecw5orl3yia2aagm64vi5t4t4x7g7rss2u5v5t64gxzzjqf5cwato');
      // Calculated edition cover: /editioncovers/138119000/138119005.jpg
      assert.strictEqual(pdfCandidate.coverUrl, 'https://libgen.li/editioncovers/138119000/138119005.jpg');
      assert.strictEqual(pdfCandidate.downloadUrl, 'https://libgen.li/get.php?md5=b1c94251908069df0a3dbe2462f52cdd');

      const epubCandidate = results[1];
      assert.strictEqual(epubCandidate.format, 'EPUB');
      assert.strictEqual(epubCandidate.md5, '4443ee15eeb31720fcd1324d5652ede7');
    });

    it('converts LibgenSearchResult into standard Baglib EnrichmentCandidateEdition', () => {
      const result = {
        id: 'libgen-b1c94251908069df0a3dbe2462f52cdd',
        title: 'Clean Architecture',
        author: 'Robert C. Martin',
        publisher: 'Prentice Hall',
        year: 2017,
        format: 'PDF',
        isbn: '9780134494166',
        md5: 'b1c94251908069df0a3dbe2462f52cdd',
        detailUrl: 'https://libgen.li/edition.php?id=138119005',
        downloadUrl: 'https://libgen.li/get.php?md5=b1c94251908069df0a3dbe2462f52cdd',
        pages: '432',
        language: 'English',
        description: 'Software principles.',
      };

      const candidate = provider.toCandidateEdition(result);
      assert.strictEqual(candidate.providerName, 'LibGen');
      assert.strictEqual(candidate.title, 'Clean Architecture');
      assert.deepStrictEqual(candidate.authors, ['Robert C. Martin']);
      assert.strictEqual(candidate.isbn, '9780134494166');
      assert.strictEqual(candidate.pageCount, 432);
      assert.ok(candidate.matchConfidence && candidate.matchConfidence >= 0.9);
    });
  });

  describe('LibgenDownloadService: Magic Bytes & Gateway Validation', () => {
    it('validates PDF magic bytes correctly (%PDF-)', () => {
      const pdfChunk = Buffer.from('%PDF-1.6 sample binary content');
      const validation = downloadService.validateMagicBytes(pdfChunk, 'pdf');
      assert.strictEqual(validation.isValid, true);
      assert.strictEqual(validation.detectedMime, 'application/pdf');
    });

    it('validates EPUB / ZIP magic bytes correctly (PK\x03\x04)', () => {
      const epubChunk = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x0a, 0x00, 0x00]);
      const validation = downloadService.validateMagicBytes(epubChunk, 'epub');
      assert.strictEqual(validation.isValid, true);
      assert.strictEqual(validation.detectedMime, 'application/epub+zip');
    });

    it('rejects disguised HTML error landing pages', () => {
      const htmlChunk = Buffer.from('<!DOCTYPE html><html><head><title>Cloudflare DDoS</title></head></html>');
      const validation = downloadService.validateMagicBytes(htmlChunk, 'pdf');
      assert.strictEqual(validation.isValid, false);
      assert.strictEqual(validation.detectedMime, 'text/html');
    });

    it('rejects disguised HTML without doctype (<html tag)', () => {
      const htmlChunk = Buffer.from('<html lang="en"><body><h1>Rate limited</h1></body></html>');
      const validation = downloadService.validateMagicBytes(htmlChunk, 'epub');
      assert.strictEqual(validation.isValid, false);
      assert.strictEqual(validation.detectedMime, 'text/html');
    });

    it('defines public IPFS gateways for decentralized CID fallback', () => {
      assert.ok(PUBLIC_IPFS_GATEWAYS.length >= 3);
      assert.ok(PUBLIC_IPFS_GATEWAYS.some((gw) => gw.includes('ipfs.io')));
      assert.ok(PUBLIC_IPFS_GATEWAYS.some((gw) => gw.includes('cloudflare-ipfs.com')));
    });
  });

  describe('HTML Table Parsing and Extraction (Legacy Fallback)', () => {
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

  describe('ContentShieldService & Ad Blocker Integration', () => {
    it('contains comprehensive pattern list for intrusive ad & popunder networks', async () => {
      const { BLOCKED_HOST_PATTERNS } = await import(
        '../../../src/main/services/shield/content-shield.service'
      );
      assert.ok(BLOCKED_HOST_PATTERNS.length >= 30);
      assert.ok(BLOCKED_HOST_PATTERNS.includes('popads.net'));
      assert.ok(BLOCKED_HOST_PATTERNS.includes('adsterra.com'));
      assert.ok(BLOCKED_HOST_PATTERNS.includes('monetag.com'));
      assert.ok(BLOCKED_HOST_PATTERNS.includes('clickadu.com'));
      assert.ok(BLOCKED_HOST_PATTERNS.includes('onclickalgo.com'));
    });

    it('strictly denies window open popups and delegates external URLs without spawning internal windows', async () => {
      const { ContentShieldService } = await import(
        '../../../src/main/services/shield/content-shield.service'
      );
      const shield = ContentShieldService.getInstance();

      let handler: ((details: { url: string }) => { action: 'deny' | 'allow' }) | null = null;
      const mockWebContents = {
        isDestroyed: () => false,
        setWindowOpenHandler: (fn: unknown) => {
          handler = fn;
        },
      } as unknown;

      shield.defuseWebContents(mockWebContents);
      assert.ok(handler !== null, 'Handler must be registered');

      // Test ad network popunder: denied
      const adResult = handler!({ url: 'https://popads.net/serve?aff=123' });
      assert.strictEqual(adResult.action, 'deny');

      // Test javascript: URI popup: denied
      const jsResult = handler!({ url: 'javascript:window.alert(1)' });
      assert.strictEqual(jsResult.action, 'deny');

      // Test about:blank popunder: denied
      const blankResult = handler!({ url: 'about:blank' });
      assert.strictEqual(blankResult.action, 'deny');

      // Test legitimate external web link: also returns action: 'deny' so Electron never spawns an unexpected visible BrowserWindow
      const externalResult = handler!({ url: 'https://libgen.li/ads.php?md5=b1c94251908069df0a3dbe2462f52cdd' });
      assert.strictEqual(externalResult.action, 'deny');
    });

    it('returns active shield diagnostics with registered domain count', async () => {
      const { ContentShieldService } = await import(
        '../../../src/main/services/shield/content-shield.service'
      );
      const shield = ContentShieldService.getInstance();
      const status = shield.getActiveShieldStatus();
      assert.ok(status.blockedDomainsCount >= 30);
      assert.strictEqual(typeof status.attachedSessionsCount, 'number');
    });
  });
});

