import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { InternetArchiveProvider } from '../../../src/main/services/metadata/providers/internet-archive.provider';
import { internetArchiveClient } from '../../../src/main/services/metadata/http-client';

describe('InternetArchiveProvider Unit Tests', () => {
  let provider: InternetArchiveProvider;
  let originalGetJson: any;

  beforeEach(() => {
    provider = new InternetArchiveProvider();
    originalGetJson = internetArchiveClient.getJson;
  });

  afterEach(() => {
    (internetArchiveClient as any).getJson = originalGetJson;
  });

  const mockIaSearchResponse = {
    response: {
      numFound: 1,
      start: 0,
      docs: [
        {
          identifier: 'cleancodercodeof0000mart',
          title: 'The Clean Coder: A Code of Conduct for Professional Programmers',
          creator: ['Martin, Robert C.'],
          year: 2011,
          isbn: ['9780137081073', '0137081073'],
          language: 'eng',
          publisher: 'Prentice Hall',
          description: 'A code of conduct for professional programmers.',
          subject: ['Computer programming', 'Software engineering'],
        },
      ],
    },
  };

  it('reports provider name correctly', () => {
    assert.strictEqual(provider.name, 'Internet Archive');
  });

  it('searches Internet Archive by query and maps to BibliographicWork with verified cover URL', async () => {
    (internetArchiveClient as any).getJson = async (url: string) => {
      assert.strictEqual(url.includes('/advancedsearch.php'), true);
      assert.strictEqual(url.includes('mediatype'), true);
      return mockIaSearchResponse;
    };

    const results = await provider.search({ title: 'Clean Coder', author: 'Robert Martin' });
    assert.strictEqual(results.length, 1);
    const work = results[0];

    assert.strictEqual(work.workId, 'ia-cleancodercodeof0000mart');
    assert.strictEqual(work.title, 'The Clean Coder: A Code of Conduct for Professional Programmers');
    assert.deepStrictEqual(work.authors, ['Robert C. Martin']);
    assert.strictEqual(work.firstPublishYear, 2011);
    assert.strictEqual(work.editions.length, 1);

    const ed = work.editions[0];
    assert.strictEqual(ed.isbn13, '9780137081073');
    assert.strictEqual(ed.isbn10, '0137081073');
    assert.strictEqual(ed.publisher, 'Prentice Hall');
    assert.strictEqual(ed.coverUrl, 'https://archive.org/services/img/cleancodercodeof0000mart');
    assert.strictEqual(ed.sources[0].provider, 'Internet Archive');
  });

  it('searches specifically by ISBN', async () => {
    (internetArchiveClient as any).getJson = async (url: string) => {
      assert.strictEqual(url.includes('isbn%3A(9780137081073)'), true);
      return mockIaSearchResponse;
    };

    const work = await provider.searchByIsbn('978-0-13-708107-3');
    assert.notStrictEqual(work, null);
    assert.strictEqual(work?.editions[0].isbn13, '9780137081073');
    assert.strictEqual(work?.editions[0].coverUrl, 'https://archive.org/services/img/cleancodercodeof0000mart');
  });

  it('handles empty results and network exceptions gracefully', async () => {
    (internetArchiveClient as any).getJson = async () => ({ response: { docs: [] } });
    const emptyResults = await provider.search('nonexistent book 999999');
    assert.deepStrictEqual(emptyResults, []);

    (internetArchiveClient as any).getJson = async () => {
      throw new Error('Connection reset');
    };
    const errorResults = await provider.search('error test');
    assert.deepStrictEqual(errorResults, []);
  });

  it('filters out placeholder authors and searches by title only', async () => {
    let queriedUrl = '';
    (internetArchiveClient as any).getJson = async (url: string) => {
      queriedUrl = url;
      return mockIaSearchResponse;
    };

    const results = await provider.search({ title: 'البداية والنهاية', author: 'مؤلف جديد' });
    assert.strictEqual(results.length, 1);
    assert.strictEqual(queriedUrl.includes('creator%3A'), false);
    assert.strictEqual(queriedUrl.includes('title'), true);
  });

  it('falls back to title-only search if title + author returns 0 docs', async () => {
    let callCount = 0;
    (internetArchiveClient as any).getJson = async (url: string) => {
      callCount++;
      if (callCount === 1) {
        // First call with creator: returns 0 docs
        assert.strictEqual(url.includes('creator%3A'), true);
        return { response: { docs: [] } };
      }
      // Second call fallback with title only: returns mock
      assert.strictEqual(url.includes('creator%3A'), false);
      assert.strictEqual(url.includes('title'), true);
      return mockIaSearchResponse;
    };

    const results = await provider.search({ title: 'صحيح البخاري', author: 'البخاري' });
    assert.strictEqual(callCount, 2);
    assert.strictEqual(results.length, 1);
  });
});
