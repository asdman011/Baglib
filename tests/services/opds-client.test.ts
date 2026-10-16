import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OpdsClientService, BUILT_IN_OPDS_CATALOGS } from '../../src/main/services/opds/opds-client.service';

const SAMPLE_OPDS_ATOM_XML = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/terms/" xmlns:opds="http://opds-spec.org/2010/catalog">
  <id>https://example.com/opds</id>
  <title>Sample Library Catalog</title>
  <updated>2026-10-16T12:00:00Z</updated>
  <author>
    <name>Sample Curator</name>
  </author>
  <link rel="self" href="https://example.com/opds" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  <link rel="search" href="https://example.com/opds/search?q={searchTerms}" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>

  <entry>
    <id>urn:example:book:1</id>
    <title>كتاب الفهرست للمسعودي</title>
    <author>
      <name>المسعودي</name>
    </author>
    <summary>كتاب تاريخي وجغرافي نفيس</summary>
    <dc:language>ar</dc:language>
    <dc:publisher>دار الفكر</dc:publisher>
    <category term="History" label="تاريخ"/>
    <link rel="http://opds-spec.org/image" href="/covers/book1.jpg" type="image/jpeg"/>
    <link rel="http://opds-spec.org/acquisition" href="/downloads/book1.epub" type="application/epub+zip"/>
    <link rel="http://opds-spec.org/acquisition/open-access" href="/downloads/book1.pdf" type="application/pdf"/>
  </entry>

  <entry>
    <id>urn:example:category:philosophy</id>
    <title>قسم الفلسفة والمنطق</title>
    <summary>كتب الفلسفة وعلم الكلام</summary>
    <link rel="subsection" href="/opds/philosophy" type="application/atom+xml;profile=opds-catalog"/>
  </entry>
</feed>`;

const SAMPLE_OPDS_JSON = JSON.stringify({
  metadata: {
    title: 'Sample OPDS 2.0 Feed',
    identifier: 'https://example.com/opds/v2',
  },
  links: [
    { rel: 'self', href: 'https://example.com/opds/v2', type: 'application/opds+json' },
    { rel: 'search', href: 'https://example.com/opds/v2/search?q={searchTerms}', type: 'application/opds+json' },
  ],
  publications: [
    {
      metadata: {
        identifier: 'urn:book:2',
        title: ' مقدمة ابن خلدون',
        author: 'ابن خلدون',
        description: 'ديوان المبتدأ والخبر في تاريخ العرب والبربر',
        language: 'ar',
      },
      links: [
        { rel: 'http://opds-spec.org/acquisition', href: '/books/khaldun.epub', type: 'application/epub+zip' },
      ],
      images: [
        { href: '/covers/khaldun.jpg', type: 'image/jpeg' },
      ],
    },
  ],
  navigation: [
    { title: 'علوم القرآن', href: '/opds/v2/quran' },
  ],
});

describe('OpdsClientService (Task 5.2 / KEY-148)', () => {
  const client = OpdsClientService.getInstance();

  it('provides built-in public domain catalogs', () => {
    const list = client.getBuiltInCatalogs();
    assert.ok(Array.isArray(list));
    assert.ok(list.length >= 3);
    const gutenberg = list.find((c) => c.id === 'project-gutenberg');
    assert.ok(gutenberg);
    assert.equal(gutenberg.title, 'Project Gutenberg');
  });

  it('parses OPDS 1.2 Atom XML feed correctly', () => {
    const feed = client.parseOpdsAtomXml(SAMPLE_OPDS_ATOM_XML, 'https://example.com/opds');
    assert.equal(feed.title, 'Sample Library Catalog');
    assert.equal(feed.entries.length, 2);

    // Book entry
    const bookEntry = feed.entries[0];
    assert.equal(bookEntry.title, 'كتاب الفهرست للمسعودي');
    assert.deepEqual(bookEntry.authors, ['المسعودي']);
    assert.equal(bookEntry.language, 'ar');
    assert.equal(bookEntry.publisher, 'دار الفكر');
    assert.equal(bookEntry.coverUrl, 'https://example.com/covers/book1.jpg');
    assert.equal(bookEntry.downloadLinks.length, 2);
    assert.equal(bookEntry.downloadLinks[0].href, 'https://example.com/downloads/book1.epub');
    assert.equal(bookEntry.downloadLinks[0].type, 'application/epub+zip');

    // Navigation entry
    const navEntry = feed.entries[1];
    assert.equal(navEntry.title, 'قسم الفلسفة والمنطق');
    assert.equal(navEntry.navigationLinks.length, 1);
    assert.equal(navEntry.navigationLinks[0].href, 'https://example.com/opds/philosophy');

    // Feed Search link
    assert.ok(feed.searchLink);
    assert.equal(feed.searchLink.href, 'https://example.com/opds/search?q={searchTerms}');
  });

  it('parses OPDS 2.0 JSON feed correctly', () => {
    const feed = client.parseOpdsJson(SAMPLE_OPDS_JSON, 'https://example.com/opds/v2');
    assert.equal(feed.title, 'Sample OPDS 2.0 Feed');
    assert.equal(feed.entries.length, 2);

    const pub = feed.entries[0];
    assert.equal(pub.title.trim(), 'مقدمة ابن خلدون');
    assert.deepEqual(pub.authors, ['ابن خلدون']);
    assert.equal(pub.coverUrl, 'https://example.com/covers/khaldun.jpg');
    assert.equal(pub.downloadLinks.length, 1);
    assert.equal(pub.downloadLinks[0].href, 'https://example.com/books/khaldun.epub');

    const nav = feed.entries[1];
    assert.equal(nav.title, 'علوم القرآن');
    assert.equal(nav.navigationLinks[0].href, 'https://example.com/opds/v2/quran');
  });
});
