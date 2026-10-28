import { errorMessage } from '../../../shared/errors';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { parseHTML } from 'linkedom';
import type { OPDSCatalog, OPDSEntry, OPDSFeed, OPDSLink, OPDSDownloadResult } from '../../../shared/types/opds';
import { DigitalImportPipelineService } from '../digital/digital-import-pipeline.service';

export const BUILT_IN_OPDS_CATALOGS: OPDSCatalog[] = [
  {
    id: 'project-gutenberg',
    title: 'Project Gutenberg',
    url: 'https://www.gutenberg.org/ebooks.opds/',
    isBuiltIn: true,
  },
  {
    id: 'standard-ebooks',
    title: 'Standard Ebooks',
    url: 'https://standardebooks.org/opds/all',
    isBuiltIn: true,
  },
  {
    id: 'manybooks',
    title: 'ManyBooks',
    url: 'https://manybooks.net/opds/index.php',
    isBuiltIn: true,
  },
  {
    id: 'feedbooks-free',
    title: 'Feedbooks Public Domain',
    url: 'https://catalog.feedbooks.com/publicdomain/browse/recent.atom',
    isBuiltIn: true,
  },
];

const ACQUISITION_RELS = [
  'http://opds-spec.org/acquisition',
  'http://opds-spec.org/acquisition/open-access',
  'http://opds-spec.org/acquisition/buy',
  'http://opds-spec.org/acquisition/borrow',
  'http://opds-spec.org/acquisition/sample',
];

const IMAGE_RELS = [
  'http://opds-spec.org/image',
  'http://opds-spec.org/image/thumbnail',
  'http://opds-spec.org/thumbnail',
];

export class OpdsClientService {
  private static instance: OpdsClientService;

  public static getInstance(): OpdsClientService {
    if (!this.instance) {
      this.instance = new OpdsClientService();
    }
    return this.instance;
  }

  public getBuiltInCatalogs(): OPDSCatalog[] {
    return BUILT_IN_OPDS_CATALOGS;
  }

  /**
   * Fetch and parse an OPDS feed (Atom XML 1.2 or JSON 2.0)
   */
  public async fetchFeed(url: string, catalog?: Partial<OPDSCatalog>): Promise<OPDSFeed> {
    const headers: Record<string, string> = {
      Accept: 'application/atom+xml, application/xml, application/opds+json, text/xml, text/html, */*',
      'User-Agent': 'Baglib/0.1.0 OPDS-Client',
    };

    if (catalog?.username || catalog?.password) {
      const auth = Buffer.from(`${catalog.username || ''}:${catalog.password || ''}`).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
    }

    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`OPDS request failed: ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();

    if (contentType.includes('json') || text.trim().startsWith('{')) {
      return this.parseOpdsJson(text, url);
    }

    return this.parseOpdsAtomXml(text, url);
  }

  /**
   * Search an OPDS catalog using query searchTerms
   */
  public async searchCatalog(searchTemplate: string, query: string, catalog?: Partial<OPDSCatalog>): Promise<OPDSFeed> {
    const resolvedUrl = searchTemplate.replace('{searchTerms}', encodeURIComponent(query))
      .replace('{q}', encodeURIComponent(query));
    return this.fetchFeed(resolvedUrl, catalog);
  }

  /**
   * Download a book file from an OPDS acquisition link and import it into Baglib
   */
  public async downloadAndImportBook(
    downloadUrl: string,
    catalog?: Partial<OPDSCatalog>,
    suggestedFileName?: string
  ): Promise<OPDSDownloadResult> {
    try {
      const headers: Record<string, string> = {
        'User-Agent': 'Baglib/0.1.0 OPDS-Client',
      };
      if (catalog?.username || catalog?.password) {
        const auth = Buffer.from(`${catalog.username || ''}:${catalog.password || ''}`).toString('base64');
        headers['Authorization'] = `Basic ${auth}`;
      }

      const res = await fetch(downloadUrl, { headers });
      if (!res.ok) {
        throw new Error(`Download failed: ${res.status} ${res.statusText}`);
      }

      // Determine file name from Content-Disposition or URL
      let fileName = suggestedFileName;
      const cd = res.headers.get('content-disposition');
      if (cd && cd.includes('filename=')) {
        const match = cd.match(/filename=["']?([^"';]+)["']?/i);
        if (match && match[1]) {
          fileName = path.basename(match[1]);
        }
      }

      if (!fileName) {
        const parsedUrl = new URL(downloadUrl);
        fileName = path.basename(parsedUrl.pathname) || 'downloaded-book.epub';
      }

      if (!path.extname(fileName)) {
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('epub')) fileName += '.epub';
        else if (ct.includes('pdf')) fileName += '.pdf';
        else if (ct.includes('mobi')) fileName += '.mobi';
        else fileName += '.epub';
      }

      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Write to temp directory
      const tempDir = path.join(os.tmpdir(), 'baglib-opds-downloads');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const safeName = fileName.replace(/[\\/:*?"<>|]+/g, '_');
      const targetFilePath = path.join(tempDir, safeName);
      fs.writeFileSync(targetFilePath, buffer);

      // Ingest via DigitalImportPipelineService
      const pipeline = DigitalImportPipelineService.getInstance();
      const importResult = await pipeline.importFile({ filePath: targetFilePath });

      return {
        success: importResult.success,
        workId: importResult.workId,
        filePath: targetFilePath,
        fileName: safeName,
        fileSizeBytes: buffer.byteLength,
        error: importResult.error,
      };
    } catch (err: unknown) {
      return {
        success: false,
        error: err instanceof Error ? errorMessage(err) : String(err),
      };
    }
  }

  /**
   * Parse OPDS 1.2 Atom XML feed
   */
  public parseOpdsAtomXml(xmlString: string, baseUrl: string): OPDSFeed {
    const { document } = parseHTML(xmlString);
    const feedEl = document.querySelector('feed');

    const id = feedEl?.querySelector('id')?.textContent?.trim() || baseUrl;
    const title = feedEl?.querySelector('title')?.textContent?.trim() || 'OPDS Catalog';
    const updated = feedEl?.querySelector('updated')?.textContent?.trim();
    const author = feedEl?.querySelector('author > name')?.textContent?.trim();
    const icon = feedEl?.querySelector('icon')?.textContent?.trim();

    // Parse feed-level links
    const linkEls = Array.from(feedEl ? feedEl.querySelectorAll(':scope > link') : document.querySelectorAll('link'));
    const links: OPDSLink[] = [];
    let searchLink: OPDSLink | undefined;

    for (const linkEl of linkEls) {
      const rel = linkEl.getAttribute('rel') || '';
      const href = linkEl.getAttribute('href') || '';
      const type = linkEl.getAttribute('type') || undefined;
      const linkTitle = linkEl.getAttribute('title') || undefined;

      if (!href) continue;
      const absoluteHref = this.resolveUrl(href, baseUrl);
      const linkObj: OPDSLink = { rel, href: absoluteHref, type, title: linkTitle };
      links.push(linkObj);

      if (rel === 'search') {
        searchLink = linkObj;
      }
    }

    // Parse entries
    const entryEls = Array.from(document.querySelectorAll('entry'));
    const entries: OPDSEntry[] = [];

    let isNavigationFeed = false;

    for (const entryEl of entryEls) {
      const entryId = entryEl.querySelector('id')?.textContent?.trim() || '';
      const entryTitle = entryEl.querySelector('title')?.textContent?.trim() || 'Untitled';
      const entryUpdated = entryEl.querySelector('updated')?.textContent?.trim();
      const entryPublished = entryEl.querySelector('published')?.textContent?.trim();
      const summary = entryEl.querySelector('summary')?.textContent?.trim();
      const content = entryEl.querySelector('content')?.textContent?.trim();
      const language = entryEl.querySelector('dc\\:language, language')?.textContent?.trim();
      const publisher = entryEl.querySelector('dc\\:publisher, publisher')?.textContent?.trim();

      const authors: string[] = [];
      const authorEls = Array.from(entryEl.querySelectorAll('author > name'));
      for (const a of authorEls) {
        if (a.textContent?.trim()) authors.push(a.textContent.trim());
      }

      const categories: string[] = [];
      const catEls = Array.from(entryEl.querySelectorAll('category'));
      for (const cat of catEls) {
        const term = cat.getAttribute('term') || cat.getAttribute('label');
        if (term) categories.push(term);
      }

      const downloadLinks: OPDSLink[] = [];
      const navigationLinks: OPDSLink[] = [];
      let coverUrl: string | undefined;
      let thumbnailUrl: string | undefined;

      const entryLinks = Array.from(entryEl.querySelectorAll('link'));
      for (const l of entryLinks) {
        const rel = l.getAttribute('rel') || '';
        const href = l.getAttribute('href') || '';
        const type = l.getAttribute('type') || undefined;
        const lTitle = l.getAttribute('title') || undefined;
        if (!href) continue;

        const absHref = this.resolveUrl(href, baseUrl);
        const lObj: OPDSLink = { rel, href: absHref, type, title: lTitle };

        if (ACQUISITION_RELS.some((r) => rel.includes(r))) {
          downloadLinks.push(lObj);
        } else if (rel === 'subsection' || rel.includes('navigation') || rel === 'alternate') {
          if (!type || type.includes('atom') || type.includes('opds') || type.includes('html')) {
            navigationLinks.push(lObj);
          }
        }

        if (rel.includes('thumbnail') || rel === 'http://opds-spec.org/thumbnail') {
          thumbnailUrl = absHref;
        } else if (IMAGE_RELS.some((r) => rel.includes(r))) {
          coverUrl = absHref;
        }
      }

      if (navigationLinks.length > 0 && downloadLinks.length === 0) {
        isNavigationFeed = true;
      }

      entries.push({
        id: entryId,
        title: entryTitle,
        authors: authors.length > 0 ? authors : undefined,
        summary: summary || content,
        content,
        updated: entryUpdated,
        published: entryPublished,
        language,
        publisher,
        categories: categories.length > 0 ? categories : undefined,
        coverUrl: coverUrl || thumbnailUrl,
        thumbnailUrl: thumbnailUrl || coverUrl,
        downloadLinks,
        navigationLinks,
      });
    }

    return {
      id,
      title,
      updated,
      author,
      icon,
      links,
      searchLink,
      entries,
      isNavigationFeed: entries.length > 0 && isNavigationFeed,
    };
  }

  /**
   * Parse OPDS 2.0 JSON feed
   */
  public parseOpdsJson(jsonString: string, baseUrl: string): OPDSFeed {
    const data = JSON.parse(jsonString);
    const metadata = data.metadata || {};
    const title = metadata.title || 'OPDS 2.0 Catalog';
    const id = metadata.identifier || baseUrl;

    const links: OPDSLink[] = [];
    let searchLink: OPDSLink | undefined;

    if (Array.isArray(data.links)) {
      for (const l of data.links) {
        const rel = l.rel || '';
        const href = this.resolveUrl(l.href || '', baseUrl);
        const lObj: OPDSLink = { rel, href, type: l.type, title: l.title };
        links.push(lObj);
        if (rel === 'search') searchLink = lObj;
      }
    }

    const entries: OPDSEntry[] = [];

    // Publications
    if (Array.isArray(data.publications)) {
      for (const pub of data.publications) {
        const pubMeta = pub.metadata || {};
        const pId = pubMeta.identifier || '';
        const pTitle = pubMeta.title || 'Untitled';
        const authors: string[] = [];
        if (typeof pubMeta.author === 'string') authors.push(pubMeta.author);
        else if (Array.isArray(pubMeta.author)) {
          for (const a of pubMeta.author) {
            authors.push(typeof a === 'string' ? a : a.name || '');
          }
        }

        const downloadLinks: OPDSLink[] = [];
        let coverUrl: string | undefined;

        if (Array.isArray(pub.links)) {
          for (const l of pub.links) {
            const rel = l.rel || '';
            const href = this.resolveUrl(l.href || '', baseUrl);
            const lObj: OPDSLink = { rel, href, type: l.type, title: l.title };
            if (rel === 'http://opds-spec.org/acquisition' || rel === 'acquisition' || l.type?.includes('epub')) {
              downloadLinks.push(lObj);
            }
          }
        }

        if (Array.isArray(pub.images)) {
          for (const img of pub.images) {
            coverUrl = this.resolveUrl(img.href || '', baseUrl);
            break;
          }
        }

        entries.push({
          id: pId,
          title: pTitle,
          authors: authors.length > 0 ? authors : undefined,
          summary: pubMeta.description,
          language: pubMeta.language,
          publisher: typeof pubMeta.publisher === 'string' ? pubMeta.publisher : pubMeta.publisher?.name,
          coverUrl,
          downloadLinks,
          navigationLinks: [],
        });
      }
    }

    // Navigation items
    if (Array.isArray(data.navigation)) {
      for (const nav of data.navigation) {
        const href = this.resolveUrl(nav.href || '', baseUrl);
        entries.push({
          id: href,
          title: nav.title || 'Navigation',
          downloadLinks: [],
          navigationLinks: [{ rel: 'subsection', href, type: nav.type, title: nav.title }],
        });
      }
    }

    return {
      id,
      title,
      links,
      searchLink,
      entries,
      isNavigationFeed: Array.isArray(data.navigation) && data.navigation.length > 0 && entries.every(e => e.downloadLinks.length === 0),
    };
  }

  private resolveUrl(href: string, base: string): string {
    try {
      return new URL(href, base).toString();
    } catch {
      return href;
    }
  }
}
