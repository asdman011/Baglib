import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { OpdsServerService } from '../../src/main/services/opds/opds-server.service';
import type { BookItem } from '../../src/shared/types/repository';

const mockBooks: BookItem[] = [
  {
    id: 'test-book-1',
    title: 'تاريخ بغداد للخطيب البغدادي',
    author: 'الخطيب البغدادي',
    description: 'كتاب في تراجم أهل بغداد وعلمائها',
    digitalFormat: 'EPUB',
    bookType: 'digital',
    readingStatus: 'unread',
    readingProgress: 0,
    language: 'ar',
    categories: ['تاريخ'],
    tags: [],
    lendingHistory: [],
  },
  {
    id: 'test-book-2',
    title: 'Clean Architecture',
    author: 'Robert C. Martin',
    description: 'A Craftsman Guide to Software Structure and Design',
    digitalFormat: 'PDF',
    bookType: 'digital',
    readingStatus: 'reading',
    readingProgress: 25,
    language: 'en',
    categories: ['Software'],
    tags: [],
    lendingHistory: [],
  },
];

const mockRepo: any = {
  getAllWorks: () => mockBooks,
  getById: (id: string) => mockBooks.find((b) => b.id === id) || null,
};

describe('OpdsServerService (Task 5.2 / KEY-148)', () => {
  const TEST_PORT = 19085;
  let service: OpdsServerService;

  before(async () => {
    service = new OpdsServerService(mockRepo);
    await service.startServer(TEST_PORT);
  });

  after(async () => {
    await service.stopServer();
  });

  it('reports server running status and detected LAN URLs', () => {
    const status = service.getStatus();
    assert.equal(status.running, true);
    assert.equal(status.port, TEST_PORT);
    assert.equal(status.localUrl, `http://localhost:${TEST_PORT}/opds`);
    assert.equal(status.bookCount, 2);
    assert.ok(Array.isArray(status.lanUrls));
  });

  it('serves root navigation feed (/opds) with valid Atom XML', async () => {
    const res = await fetch(`http://localhost:${TEST_PORT}/opds`);
    assert.equal(res.status, 200);
    const ct = res.headers.get('content-type') || '';
    assert.ok(ct.includes('application/atom+xml'));

    const xml = await res.text();
    assert.ok(xml.includes('<feed'));
    assert.ok(xml.includes('<title>Baglib OPDS Catalog</title>'));
    assert.ok(xml.includes('/opds/books'));
  });

  it('serves acquisition feed (/opds/books) with library books', async () => {
    const res = await fetch(`http://localhost:${TEST_PORT}/opds/books`);
    assert.equal(res.status, 200);
    const xml = await res.text();

    assert.ok(xml.includes('تاريخ بغداد للخطيب البغدادي'));
    assert.ok(xml.includes('الخطيب البغدادي'));
    assert.ok(xml.includes('Clean Architecture'));
    assert.ok(xml.includes('Robert C. Martin'));
  });

  it('filters books by search query (/opds/search?q=...)', async () => {
    const res = await fetch(`http://localhost:${TEST_PORT}/opds/search?q=بغداد`);
    assert.equal(res.status, 200);
    const xml = await res.text();

    assert.ok(xml.includes('تاريخ بغداد للخطيب البغدادي'));
    assert.equal(xml.includes('Clean Architecture'), false);
  });

  it('serves OpenSearch XML description document', async () => {
    const res = await fetch(`http://localhost:${TEST_PORT}/opds/opensearch.xml`);
    assert.equal(res.status, 200);
    const xml = await res.text();

    assert.ok(xml.includes('<OpenSearchDescription'));
    assert.ok(xml.includes('/opds/search?q={searchTerms}'));
  });

  it('enforces Basic Authentication when requireAuth is enabled', async () => {
    service.setConfig({
      requireAuth: true,
      username: 'baglibuser',
      password: 'secretpassword',
    });

    // 1. Without Auth Header -> 401
    const unauthRes = await fetch(`http://localhost:${TEST_PORT}/opds`);
    assert.equal(unauthRes.status, 401);
    assert.ok(unauthRes.headers.get('www-authenticate')?.includes('Basic'));

    // 2. With Auth Header -> 200
    const creds = Buffer.from('baglibuser:secretpassword').toString('base64');
    const authRes = await fetch(`http://localhost:${TEST_PORT}/opds`, {
      headers: { Authorization: `Basic ${creds}` },
    });
    assert.equal(authRes.status, 200);

    // Reset auth
    service.setConfig({ requireAuth: false });
  });
});
