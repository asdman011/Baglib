import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import type { Database } from 'better-sqlite3';
import { getDatabase } from '../../database/connection';
import { SqliteWorkRepository } from '../../database/repositories/work.repository';
import type { OPDSServerConfig, OPDSServerStatus } from '../../../shared/types/opds';
import type { BookItem } from '../../../shared/types/repository';

const DEFAULT_PORT = 8085;
const OPDS_NS = 'http://opds-spec.org/2010/catalog';
const ATOM_NS = 'http://www.w3.org/2005/Atom';
const DC_NS = 'http://purl.org/dc/terms/';
const OPENSEARCH_NS = 'http://a9.com/-/spec/opensearch/1.1/';

const MIME_NAV = 'application/atom+xml;profile=opds-catalog;kind=navigation';
const MIME_ACQ = 'application/atom+xml;profile=opds-catalog;kind=acquisition';
const MIME_SEARCH = 'application/opensearchdescription+xml';

function escapeXml(str?: string | null): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function getMimeTypeByExt(filePath?: string): string {
  if (!filePath) return 'application/octet-stream';
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.epub':
      return 'application/epub+zip';
    case '.pdf':
      return 'application/pdf';
    case '.mobi':
      return 'application/x-mobipocket-ebook';
    case '.azw3':
      return 'application/vnd.amazon.mobi8-ebook';
    case '.azw':
      return 'application/vnd.amazon.ebook';
    case '.cbz':
      return 'application/vnd.comicbook+zip';
    case '.cbr':
      return 'application/vnd.comicbook-rar';
    case '.fb2':
      return 'application/x-fb2';
    case '.txt':
      return 'text/plain; charset=utf-8';
    case '.md':
      return 'text/markdown; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}

export class OpdsServerService {
  private static instance: OpdsServerService;
  private server: http.Server | null = null;
  private config: OPDSServerConfig = {
    enabled: false,
    port: DEFAULT_PORT,
    title: 'Baglib OPDS Catalog',
    requireAuth: false,
    username: '',
    password: '',
  };
  private workRepository?: SqliteWorkRepository;

  constructor(workRepository?: SqliteWorkRepository) {
    this.workRepository = workRepository;
  }

  public static getInstance(workRepository?: SqliteWorkRepository): OpdsServerService {
    if (!this.instance || workRepository) {
      this.instance = new OpdsServerService(workRepository);
    }
    return this.instance;
  }

  public getRepository(): SqliteWorkRepository {
    if (this.workRepository) return this.workRepository;
    const db = getDatabase();
    this.workRepository = new SqliteWorkRepository(db);
    return this.workRepository;
  }

  public getConfig(): OPDSServerConfig {
    return { ...this.config };
  }

  public setConfig(newConfig: Partial<OPDSServerConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  public isRunning(): boolean {
    return this.server !== null && this.server.listening;
  }

  /**
   * Start the OPDS HTTP server on the configured port
   */
  public async startServer(port?: number): Promise<OPDSServerStatus> {
    if (this.isRunning()) {
      return this.getStatus();
    }

    if (port) {
      this.config.port = port;
    }

    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        this.handleHttpRequest(req, res);
      });

      server.on('error', (err) => {
        this.server = null;
        reject(err);
      });

      server.listen(this.config.port, '0.0.0.0', () => {
        this.server = server;
        this.config.enabled = true;
        resolve(this.getStatus());
      });
    });
  }

  /**
   * Stop the running server
   */
  public async stopServer(): Promise<OPDSServerStatus> {
    if (!this.server) {
      this.config.enabled = false;
      return this.getStatus();
    }

    return new Promise((resolve) => {
      this.server?.close(() => {
        this.server = null;
        this.config.enabled = false;
        resolve(this.getStatus());
      });
    });
  }

  /**
   * Get server status and detected LAN URLs
   */
  public getStatus(): OPDSServerStatus {
    const running = this.isRunning();
    const port = this.config.port;
    const localUrl = `http://localhost:${port}/opds`;
    const lanUrls: string[] = [];

    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      const ifaceList = interfaces[name];
      if (!ifaceList) continue;
      for (const iface of ifaceList) {
        if (iface.family === 'IPv4' && !iface.internal) {
          lanUrls.push(`http://${iface.address}:${port}/opds`);
        }
      }
    }

    let bookCount = 0;
    try {
      const books = this.getRepository().getAllWorks();
      bookCount = books.length;
    } catch {
      bookCount = 0;
    }

    return {
      running,
      port,
      localUrl,
      lanUrls,
      requireAuth: this.config.requireAuth,
      bookCount,
    };
  }

  /**
   * Main HTTP request router
   */
  private handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const host = req.headers.host || `localhost:${this.config.port}`;
    const baseUrl = `http://${host}`;
    const url = new URL(req.url || '/', baseUrl);
    const pathname = url.pathname;

    // Check basic auth if required
    if (this.config.requireAuth) {
      const authHeader = req.headers['authorization'];
      if (!authHeader || !authHeader.startsWith('Basic ')) {
        res.writeHead(401, {
          'WWW-Authenticate': 'Basic realm="Baglib OPDS Catalog"',
          'Content-Type': 'text/plain; charset=utf-8',
        });
        res.end('Authentication required');
        return;
      }

      const credentials = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
      const [u, p] = credentials.split(':');
      if (u !== (this.config.username || '') || p !== (this.config.password || '')) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden');
        return;
      }
    }

    // CORS & caching headers for local readers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (pathname === '/' || pathname === '/opds' || pathname === '/opds/') {
      this.serveRootFeed(res, baseUrl);
    } else if (pathname === '/opds/books') {
      const recent = url.searchParams.get('recent') === 'true';
      const digitalOnly = url.searchParams.get('digitalOnly') === 'true';
      this.serveBooksFeed(res, baseUrl, '', recent, digitalOnly);
    } else if (pathname === '/opds/search') {
      const query = url.searchParams.get('q') || '';
      this.serveBooksFeed(res, baseUrl, query, false, false);
    } else if (pathname === '/opds/opensearch.xml') {
      this.serveOpenSearchXml(res, baseUrl);
    } else if (pathname.startsWith('/opds/download/')) {
      const workId = pathname.slice('/opds/download/'.length);
      this.serveBookDownload(res, workId);
    } else if (pathname.startsWith('/opds/cover/')) {
      const workId = pathname.slice('/opds/cover/'.length);
      this.serveBookCover(res, workId);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
    }
  }

  /**
   * Root Navigation Feed (`/opds`)
   */
  private serveRootFeed(res: http.ServerResponse, baseUrl: string): void {
    const updated = new Date().toISOString();
    const title = escapeXml(this.config.title);

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="${ATOM_NS}" xmlns:dc="${DC_NS}" xmlns:opds="${OPDS_NS}" xmlns:opensearch="${OPENSEARCH_NS}">
  <id>${baseUrl}/opds</id>
  <title>${title}</title>
  <updated>${updated}</updated>
  <author>
    <name>Baglib Library</name>
  </author>
  <link rel="self" href="${baseUrl}/opds" type="${MIME_NAV}"/>
  <link rel="start" href="${baseUrl}/opds" type="${MIME_NAV}"/>
  <link rel="search" href="${baseUrl}/opds/search?q={searchTerms}" type="${MIME_ACQ}"/>
  <link rel="search" href="${baseUrl}/opds/opensearch.xml" type="${MIME_SEARCH}"/>

  <entry>
    <id>${baseUrl}/opds/books</id>
    <title>All Books</title>
    <updated>${updated}</updated>
    <summary>Browse all titles in the Baglib collection</summary>
    <link rel="subsection" href="${baseUrl}/opds/books" type="${MIME_ACQ}"/>
  </entry>

  <entry>
    <id>${baseUrl}/opds/books?recent=true</id>
    <title>Recently Added</title>
    <updated>${updated}</updated>
    <summary>Books recently imported to the library</summary>
    <link rel="subsection" href="${baseUrl}/opds/books?recent=true" type="${MIME_ACQ}"/>
  </entry>

  <entry>
    <id>${baseUrl}/opds/books?digitalOnly=true</id>
    <title>Digital E-Books</title>
    <updated>${updated}</updated>
    <summary>Books available for immediate wireless download (EPUB, PDF, MOBI)</summary>
    <link rel="subsection" href="${baseUrl}/opds/books?digitalOnly=true" type="${MIME_ACQ}"/>
  </entry>
</feed>`;

    res.writeHead(200, {
      'Content-Type': `${MIME_NAV}; charset=utf-8`,
      'Cache-Control': 'no-cache',
    });
    res.end(xml);
  }

  /**
   * Books Acquisition Feed (`/opds/books` and `/opds/search`)
   */
  private serveBooksFeed(
    res: http.ServerResponse,
    baseUrl: string,
    query: string,
    recent: boolean,
    digitalOnly: boolean
  ): void {
    let books: BookItem[] = [];
    try {
      books = this.getRepository().getAllWorks();
    } catch {
      books = [];
    }

    if (query) {
      const q = query.toLowerCase();
      books = books.filter(
        (b) =>
          (b.title && b.title.toLowerCase().includes(q)) ||
          (b.author && b.author.toLowerCase().includes(q)) ||
          (b.description && b.description.toLowerCase().includes(q))
      );
    }

    if (digitalOnly) {
      books = books.filter((b) => b.filePath && fs.existsSync(b.filePath));
    }

    if (recent) {
      books = books.slice(0, 30);
    }

    const updated = new Date().toISOString();
    const feedTitle = query ? `Search: ${escapeXml(query)}` : 'Baglib Books';
    const selfHref = query
      ? `${baseUrl}/opds/search?q=${encodeURIComponent(query)}`
      : `${baseUrl}/opds/books${recent ? '?recent=true' : ''}${digitalOnly ? '?digitalOnly=true' : ''}`;

    let entriesXml = '';
    for (const b of books) {
      const entryId = `urn:baglib:work:${escapeXml(b.id)}`;
      const title = escapeXml(b.title || 'Untitled');
      const author = escapeXml(b.author || 'Unknown Author');
      const summary = escapeXml(b.description || '');
      const language = escapeXml(b.language || 'ar');
      const publisher = escapeXml(b.publisher || '');

      let linksXml = '';
      if (b.coverImage) {
        linksXml += `\n    <link rel="http://opds-spec.org/image" href="${baseUrl}/opds/cover/${b.id}" type="image/jpeg"/>`;
        linksXml += `\n    <link rel="http://opds-spec.org/image/thumbnail" href="${baseUrl}/opds/cover/${b.id}" type="image/jpeg"/>`;
      }

      if (b.filePath && fs.existsSync(b.filePath)) {
        const mime = getMimeTypeByExt(b.filePath);
        let statSize = 0;
        try {
          statSize = fs.statSync(b.filePath).size;
        } catch {}

        linksXml += `\n    <link rel="http://opds-spec.org/acquisition" href="${baseUrl}/opds/download/${b.id}" type="${mime}" length="${statSize}"/>`;
        linksXml += `\n    <link rel="http://opds-spec.org/acquisition/open-access" href="${baseUrl}/opds/download/${b.id}" type="${mime}"/>`;
      }

      entriesXml += `
  <entry>
    <id>${entryId}</id>
    <title>${title}</title>
    <updated>${updated}</updated>
    <author>
      <name>${author}</name>
    </author>
    <summary>${summary}</summary>
    <dc:language>${language}</dc:language>${publisher ? `\n    <dc:publisher>${publisher}</dc:publisher>` : ''}${linksXml}
  </entry>`;
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="${ATOM_NS}" xmlns:dc="${DC_NS}" xmlns:opds="${OPDS_NS}" xmlns:opensearch="${OPENSEARCH_NS}">
  <id>${selfHref}</id>
  <title>${escapeXml(feedTitle)}</title>
  <updated>${updated}</updated>
  <author>
    <name>Baglib Library</name>
  </author>
  <link rel="self" href="${selfHref}" type="${MIME_ACQ}"/>
  <link rel="start" href="${baseUrl}/opds" type="${MIME_NAV}"/>
  <link rel="search" href="${baseUrl}/opds/search?q={searchTerms}" type="${MIME_ACQ}"/>
  <opensearch:totalResults>${books.length}</opensearch:totalResults>
  <opensearch:itemsPerPage>${books.length}</opensearch:itemsPerPage>
  <opensearch:startIndex>1</opensearch:startIndex>${entriesXml}
</feed>`;

    res.writeHead(200, {
      'Content-Type': `${MIME_ACQ}; charset=utf-8`,
      'Cache-Control': 'no-cache',
    });
    res.end(xml);
  }

  /**
   * OpenSearch XML Description (`/opds/opensearch.xml`)
   */
  private serveOpenSearchXml(res: http.ServerResponse, baseUrl: string): void {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
  <ShortName>Baglib OPDS</ShortName>
  <Description>Search the Baglib Local Library Catalog</Description>
  <InputEncoding>UTF-8</InputEncoding>
  <OutputEncoding>UTF-8</OutputEncoding>
  <Url type="${MIME_ACQ}" template="${baseUrl}/opds/search?q={searchTerms}"/>
</OpenSearchDescription>`;

    res.writeHead(200, {
      'Content-Type': `${MIME_SEARCH}; charset=utf-8`,
      'Cache-Control': 'max-age=3600',
    });
    res.end(xml);
  }

  /**
   * Stream book file download (`/opds/download/:id`)
   */
  private serveBookDownload(res: http.ServerResponse, workId: string): void {
    const book = this.getRepository().getById(workId);
    if (!book || !book.filePath || !fs.existsSync(book.filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Book file not found');
      return;
    }

    const stat = fs.statSync(book.filePath);
    const mime = getMimeTypeByExt(book.filePath);
    const baseName = path.basename(book.filePath);

    res.writeHead(200, {
      'Content-Type': mime,
      'Content-Length': stat.size,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(baseName)}"`,
    });

    const stream = fs.createReadStream(book.filePath);
    stream.pipe(res);
  }

  /**
   * Serve book cover image (`/opds/cover/:id`)
   */
  private serveBookCover(res: http.ServerResponse, workId: string): void {
    const book = this.getRepository().getById(workId);
    if (!book || !book.coverImage) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Cover not found');
      return;
    }

    if (book.coverImage.startsWith('data:')) {
      const match = book.coverImage.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        const mime = match[1];
        const buffer = Buffer.from(match[2], 'base64');
        res.writeHead(200, {
          'Content-Type': mime,
          'Content-Length': buffer.length,
          'Cache-Control': 'public, max-age=86400',
        });
        res.end(buffer);
        return;
      }
    }

    if (fs.existsSync(book.coverImage)) {
      const stat = fs.statSync(book.coverImage);
      const ext = path.extname(book.coverImage).toLowerCase();
      const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
      res.writeHead(200, {
        'Content-Type': mime,
        'Content-Length': stat.size,
        'Cache-Control': 'public, max-age=86400',
      });
      fs.createReadStream(book.coverImage).pipe(res);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Cover image unavailable');
  }
}
