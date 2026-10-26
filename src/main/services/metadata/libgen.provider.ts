/**
 * Baglib — Library Genesis (LibGen / libgen.li) Metadata Provider
 *
 * Implements full specification of the official libgen.li/json.php API
 * and resilient 3-Path lookup pipeline:
 * - Path A: Direct Hash Lookup (file md5, sha1, sha256)
 * - Path B: Direct Identifier Lookup (ISBN, DOI)
 * - Path C: Free-Text Title/Author 2-Step Scrape & JSON Hydration
 *
 * Supported json.php API specification:
 * - object: 'e' (editions), 'f' (files), 'w' (works), 'a' (authors), 's' (series), 'p' (publishers)
 * - relational subarrays: 'files', 'works', 'editions'
 * - addkeys: 10 (title orig), 101 (lang), 401 (author role), 505 (isbn), 630 (series),
 *            851 (sha1), 852 (sha256), 863 (cover), 877 (ipfs cid), 995 (toc), 996 (desc)
 */

import { isValidIsbn } from '../../../shared/validators/metadata-validator';
import { parseHTML } from 'linkedom';
import type { EnrichmentCandidateEdition } from '../../../shared/types/enrichment';

export interface LibgenSearchResult {
  id: string;
  title: string;
  author: string;
  publisher?: string;
  year?: number;
  language?: string;
  pages?: string;
  fileSize?: string;
  format: string; // 'PDF' | 'EPUB' | 'MOBI' | 'DJVU' | etc.
  coverUrl?: string;
  detailUrl: string;
  downloadUrl?: string;
  isbn?: string;
  md5?: string;
  ipfsCid?: string;
  editionId?: string;
  fileId?: string;
  description?: string;
  series?: string;
}

export const LIBGEN_MIRRORS = [
  'https://libgen.li',
  'https://libgen.bz',
  'https://libgen.is',
  'https://libgen.rs',
  'https://libgen.vg',
  'https://libgen.gs',
];

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export class LibgenProvider {
  private coverUrl(value: unknown, base: string): string | undefined {
    if (typeof value !== 'string' || !value.trim()) return undefined;
    try {
      const url = new URL(value.trim().replace(/&amp;/g, '&'), base);
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined;
    } catch { return undefined; }
  }
  private activeMirror: string | null = null;
  private lastMirrorCheck = 0;
  private readonly checkCacheMs = 10 * 60 * 1000; // 10 minutes cache
  private readonly defaultTimeoutMs = 10000; // 10 seconds timeout

  /**
   * Ping mirrors in priority order and select the first responding one.
   */
  async getActiveMirror(): Promise<string> {
    const now = Date.now();
    if (this.activeMirror && now - this.lastMirrorCheck < this.checkCacheMs) {
      return this.activeMirror;
    }

    for (const mirror of LIBGEN_MIRRORS) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3500);

        const response = await fetch(`${mirror}/json.php?object=e&ids=1`, {
          method: 'GET',
          signal: controller.signal,
          headers: { 'User-Agent': USER_AGENT },
        });
        clearTimeout(timeout);

        if (response.ok || response.status === 200) {
          this.activeMirror = mirror;
          this.lastMirrorCheck = now;
          return mirror;
        }
      } catch {
        // Fallback to testing base index
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 2500);
          const baseResp = await fetch(mirror, {
            method: 'GET',
            signal: controller.signal,
            headers: { 'User-Agent': USER_AGENT },
          });
          clearTimeout(timeout);
          if (baseResp.ok) {
            this.activeMirror = mirror;
            this.lastMirrorCheck = now;
            return mirror;
          }
        } catch {}
      }
    }

    this.activeMirror = LIBGEN_MIRRORS[0];
    return this.activeMirror;
  }

  /**
   * Transforms an ad/gateway link into a direct download URL.
   */
  transformDownloadUrl(url: string, baseUrl: string): string {
    const md5Match = url.match(/md5=([a-fA-F0-9]{32})/i) || url.match(/\/ads([a-fA-F0-9]{32})/i);
    if (md5Match) {
      return `${baseUrl}/get.php?md5=${md5Match[1]}`;
    }
    return url.startsWith('http') ? url : `${baseUrl}${url}`;
  }

  /**
   * Helper: Performs a resilient JSON GET request with AbortController timeout
   */
  public async fetchJson<T = any>(endpointUrl: string, timeoutMs = this.defaultTimeoutMs): Promise<T | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const resp = await fetch(endpointUrl, {
        method: 'GET',
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json,text/javascript,*/*',
        },
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!resp.ok) {
        console.warn(`[LibgenProvider] HTTP ${resp.status} fetching ${endpointUrl}`);
        return null;
      }

      return (await resp.json()) as T;
    } catch (err: any) {
      clearTimeout(timer);
      console.warn(`[LibgenProvider] Error fetching ${endpointUrl}:`, err?.message || err);
      return null;
    }
  }

  /**
   * Helper: Extract values for a specific numeric key from the 'add' map
   */
  public getAddValues(addObj?: Record<string, any>, targetKey?: string): string[] {
    if (!addObj || typeof addObj !== 'object') return [];
    const values: string[] = [];
    for (const item of Object.values(addObj)) {
      if (item && typeof item === 'object') {
        if (!targetKey || String(item.key) === String(targetKey)) {
          if (item.value && typeof item.value === 'string' && item.value.trim()) {
            values.push(item.value.trim());
          }
        }
      }
    }
    return values;
  }

  /**
   * Primary Search Entry Point:
   * Dynamically routes to Path B (ISBN/DOI), Path A (MD5), or Path C (Free-Text Hydrated)
   */
  async search(query: string, maxResults = 25): Promise<LibgenSearchResult[]> {
    if (!query || !query.trim()) return [];
    const cleanQuery = query.trim();

    // 1. Direct Hash Check (32 hex characters)
    if (/^[a-f0-9]{32}$/i.test(cleanQuery)) {
      const hashResults = await this.lookupByHash(cleanQuery, 'md5');
      if (hashResults.length > 0) return hashResults.slice(0, maxResults);
    }

    // 2. Direct ISBN Check
    const cleanIsbnCandidate = cleanQuery.replace(/[-\s]/g, '');
    if (isValidIsbn(cleanIsbnCandidate)) {
      const isbnResults = await this.lookupByIdentifier(cleanIsbnCandidate, 'isbn');
      if (isbnResults.length > 0) return isbnResults.slice(0, maxResults);
    }

    // 3. Direct DOI Check (10.xxxx/...)
    if (/^10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+$/i.test(cleanQuery)) {
      const doiResults = await this.lookupByIdentifier(cleanQuery, 'doi');
      if (doiResults.length > 0) return doiResults.slice(0, maxResults);
    }

    // 4. Default: Path C (Free-Text Search via 2-Step Scrape & JSON Hydration)
    return await this.searchFreeTextHydrated(cleanQuery, maxResults);
  }

  /**
   * Path A: Direct Hash Lookup (When Local File Exists)
   * Calls: GET json.php?object=f&md5={md5}&fields=*&addkeys=851,852,877
   * Then hydrates full edition metadata via: GET json.php?object=e&ids={e_id}&fields=*&addkeys=...
   */
  async lookupByHash(
    hash: string,
    hashType: 'md5' | 'sha1' | 'sha256' = 'md5'
  ): Promise<LibgenSearchResult[]> {
    const mirror = await this.getActiveMirror();
    const cleanHash = hash.trim().toLowerCase();
    const fileUrl = `${mirror}/json.php?object=f&${hashType}=${encodeURIComponent(cleanHash)}&fields=*&addkeys=851,852,877`;

    const fileData = await this.fetchJson<Record<string, any>>(fileUrl);
    if (!fileData || typeof fileData !== 'object' || Object.keys(fileData).length === 0) {
      return [];
    }

    const editionIds: string[] = [];
    const filesByEid: Record<string, any[]> = {};
    const fileRecords: any[] = [];

    for (const [fid, fRec] of Object.entries(fileData)) {
      const fileObj = { ...fRec, f_id: fRec.f_id || fid };
      fileRecords.push(fileObj);

      if (fileObj.editions && typeof fileObj.editions === 'object') {
        for (const [_, eInfo] of Object.entries(fileObj.editions)) {
          const eid = String((eInfo as any).e_id || (eInfo as any).id || '');
          if (eid && !editionIds.includes(eid)) {
            editionIds.push(eid);
            if (!filesByEid[eid]) filesByEid[eid] = [];
            filesByEid[eid].push(fileObj);
          }
        }
      }
    }

    if (editionIds.length === 0) {
      // Return file-only fallback candidate if no edition was linked
      return fileRecords.map((f, i) => this.mapFileOnlyResult(f, mirror, i));
    }

    // Step 4 of Path A: Hydrate edition metadata
    const addKeys = '10,101,102,401,505,606,630,863,920,945,990,995,996';
    const editionUrl = `${mirror}/json.php?object=e&ids=${editionIds.slice(0, 10).join(',')}&fields=*&addkeys=${addKeys}`;
    const editionData = await this.fetchJson<Record<string, any>>(editionUrl);

    if (!editionData || typeof editionData !== 'object') {
      return fileRecords.map((f, i) => this.mapFileOnlyResult(f, mirror, i));
    }

    const results: LibgenSearchResult[] = [];
    for (const [eid, eRec] of Object.entries(editionData)) {
      const linkedFiles = filesByEid[eid] || fileRecords;
      results.push(...this.mapEditionToSearchResults(eid, eRec, linkedFiles, mirror));
    }

    return results;
  }

  /**
   * Path B: Direct Identifier Lookup (When ISBN or DOI Exists)
   * Calls: GET json.php?object=e&isbn={isbn}&fields=*&addkeys=*
   */
  async lookupByIdentifier(identifier: string, type: 'isbn' | 'doi' = 'isbn'): Promise<LibgenSearchResult[]> {
    const mirror = await this.getActiveMirror();
    const cleanId = identifier.trim().replace(/[-\s]/g, '');
    const url = `${mirror}/json.php?object=e&${type}=${encodeURIComponent(cleanId)}&fields=*&addkeys=*`;

    const data = await this.fetchJson<Record<string, any>>(url);
    if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
      return [];
    }

    const eIds = Object.keys(data);
    // Re-query with ids mode to ensure nested files subarray is fully embedded
    const batchUrl = `${mirror}/json.php?object=e&ids=${eIds.slice(0, 10).join(',')}&fields=*&addkeys=10,101,102,401,505,606,630,863,920,945,990,995,996`;
    const hydrated = await this.fetchJson<Record<string, any>>(batchUrl);
    const sourceData = hydrated && typeof hydrated === 'object' ? hydrated : data;

    const results: LibgenSearchResult[] = [];
    for (const [eid, eRec] of Object.entries(sourceData)) {
      // Gather files from files subarray or query object=f
      const nestedFiles = eRec.files && typeof eRec.files === 'object' ? Object.values(eRec.files) : [];
      results.push(...this.mapEditionToSearchResults(eid, eRec, nestedFiles, mirror));
    }

    return results;
  }

  /**
   * Path C: Free-Text Title / Author Search (2-Step Scrape -> JSON Hydration)
   * 1. GET index.php?req={encodedQuery}
   * 2. Extract edition.php?id=(\d+) and ads.php?md5=([a-fA-F0-9]{32})
   * 3. Batch hydrate via json.php?object=e&ids={ids}&fields=*&addkeys=...
   */
  async searchFreeTextHydrated(query: string, maxResults = 25): Promise<LibgenSearchResult[]> {
    const mirror = await this.getActiveMirror();
    const encodedQuery = encodeURIComponent(query.trim());
    const searchUrl = `${mirror}/index.php?req=${encodedQuery}&curtab=e&covers=on`;

    let html = '';
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.defaultTimeoutMs);
      const res = await fetch(searchUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });
      clearTimeout(timer);

      if (!res.ok) {
        console.warn(`[LibgenProvider] HTTP ${res.status} from search gateway ${mirror}`);
        return [];
      }
      html = await res.text();
    } catch (err: any) {
      console.warn(`[LibgenProvider] Gateway scrape failed:`, err?.message || err);
      return [];
    }

    const previews = this.parseHtml(html, mirror, maxResults);

    // Extract unique Edition IDs
    const editionIds = [
      ...new Set([...html.matchAll(/edition\.php\?id=(\d+)/gi)].map((m) => m[1])),
    ];

    // Extract File MD5s if present in table
    const md5List = [
      ...new Set(
        [...html.matchAll(/(?:ads\.php\?md5=|get\.php\?md5=|\/ads|\/get)([a-fA-F0-9]{32})/gi)].map((m) =>
          m[1].toLowerCase()
        )
      ),
    ];

    // If edition IDs were found, batch hydrate via json.php
    if (editionIds.length > 0) {
      const topIds = editionIds.slice(0, Math.min(maxResults, 20)).join(',');
      const addKeys = '10,101,102,401,505,606,630,863,995,996';
      const hydrateUrl = `${mirror}/json.php?object=e&ids=${topIds}&fields=*&addkeys=${addKeys}`;

      const jsonRecords = await this.fetchJson<Record<string, any>>(hydrateUrl);
      if (jsonRecords && typeof jsonRecords === 'object' && Object.keys(jsonRecords).length > 0) {
        const results: LibgenSearchResult[] = [];
        for (const [eid, eRec] of Object.entries(jsonRecords)) {
          const nestedFiles = eRec.files && typeof eRec.files === 'object' ? Object.values(eRec.files) : [];
          const preview = previews.find(item => item.editionId === eid);
          results.push(...this.mapEditionToSearchResults(eid, eRec, nestedFiles, mirror).map(item => ({ ...item, coverUrl: preview?.coverUrl || item.coverUrl })));
        }

        if (results.length > 0) {
          return results.slice(0, maxResults);
        }
      }
    }

    // Secondary fallback: parse the HTML table rows directly if json.php returned empty
    return previews;
  }

  /**
   * Helper: Map a hydrated edition record and its nested files into LibgenSearchResult items
   */
  public mapEditionToSearchResults(
    editionId: string,
    eRec: any,
    filesList: any[],
    mirror: string
  ): LibgenSearchResult[] {
    const title = (eRec.title || '').trim() || 'Untitled Document';
    const author = (eRec.author || '').trim() || 'Unknown Author';
    const publisher = (eRec.publisher || '').trim() || undefined;
    const year = parseInt(String(eRec.year || ''), 10) || undefined;
    const pages = eRec.pages ? String(eRec.pages).trim() : undefined;
    const series = eRec.series_name ? String(eRec.series_name).trim() : undefined;

    // Extract extended fields from 'add' map
    const isbnList = this.getAddValues(eRec.add, '505');
    const isbn = isbnList[0] || undefined;

    const descList = this.getAddValues(eRec.add, '996');
    const description = descList[0] ? descList[0].replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim() : undefined;

    const langList = this.getAddValues(eRec.add, '101');
    const language = langList[0] || 'English';

    // Cover Resolution
    let coverUrl: string | undefined = undefined;
    const addCover = this.getAddValues(eRec.add, '863')[0];
    if (addCover) {
      coverUrl = this.coverUrl(addCover, mirror);
    } else if (eRec.cover_url && typeof eRec.cover_url === 'string' && eRec.cover_url.trim()) {
      coverUrl = this.coverUrl(eRec.cover_url, mirror);
    } else if (String(eRec.cover_exists) === '1') {
      const eNum = Number(editionId);
      const folder = !isNaN(eNum) ? Math.floor(eNum / 1000) * 1000 : 0;
      coverUrl = `${mirror}/editioncovers/${folder}/${editionId}.jpg`;
    }

    const detailUrl = `${mirror}/edition.php?id=${editionId}`;

    // If no nested files attached, create a single edition entry
    if (!filesList || filesList.length === 0) {
      return [
        {
          id: `libgen-e-${editionId}`,
          title,
          author,
          publisher,
          year,
          language,
          pages,
          format: 'PDF',
          coverUrl,
          detailUrl,
          isbn,
          editionId,
          description,
          series,
        },
      ];
    }

    // Emit a distinct candidate for each file representation (PDF, EPUB, etc.)
    return filesList.map((f: any, idx: number) => {
      const md5 = (f.md5 || '').trim().toLowerCase();
      const format = (f.extension || 'PDF').toUpperCase();
      const ipfsCid = this.getAddValues(f.add, '877')[0];

      let fileSizeStr: string | undefined = undefined;
      if (f.filesize) {
        const bytes = parseInt(String(f.filesize), 10);
        if (!isNaN(bytes) && bytes > 0) {
          fileSizeStr = `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        }
      }

      const downloadUrl = md5 ? `${mirror}/get.php?md5=${md5}` : undefined;

      return {
        id: md5 ? `libgen-${md5}` : `libgen-e-${editionId}-f-${idx}`,
        title,
        author,
        publisher,
        year,
        language,
        pages: f.pages ? String(f.pages) : pages,
        fileSize: fileSizeStr,
        format,
        coverUrl,
        detailUrl,
        downloadUrl,
        isbn,
        md5: md5 || undefined,
        ipfsCid,
        editionId,
        fileId: f.f_id ? String(f.f_id) : undefined,
        description,
        series,
      };
    });
  }

  /**
   * Helper: Map a file-only record when no edition was linked
   */
  private mapFileOnlyResult(f: any, mirror: string, index: number): LibgenSearchResult {
    const md5 = (f.md5 || '').trim().toLowerCase();
    const format = (f.extension || 'PDF').toUpperCase();
    const title = f.locator || (md5 ? `LibGen Document ${md5.slice(0, 8)}` : `Document ${index + 1}`);
    const ipfsCid = this.getAddValues(f.add, '877')[0];

    let fileSize: string | undefined = undefined;
    if (f.filesize) {
      const bytes = parseInt(String(f.filesize), 10);
      if (!isNaN(bytes) && bytes > 0) {
        fileSize = `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
      }
    }

    let coverUrl: string | undefined = undefined;
    if (String(f.cover_exists) === '1' && md5) {
      const lNum = Number(f.libgen_id);
      const folder = !isNaN(lNum) ? Math.floor(lNum / 1000) * 1000 : 0;
      coverUrl = `${mirror}/covers/${folder}/${md5}_small.jpg`;
    }

    return {
      id: md5 ? `libgen-${md5}` : `libgen-f-${f.f_id || index}`,
      title,
      author: 'Unknown Author',
      format,
      pages: f.pages ? String(f.pages) : undefined,
      fileSize,
      coverUrl,
      detailUrl: `${mirror}/file.php?id=${f.f_id || md5}`,
      downloadUrl: md5 ? `${mirror}/get.php?md5=${md5}` : undefined,
      md5: md5 || undefined,
      ipfsCid,
      fileId: f.f_id ? String(f.f_id) : undefined,
    };
  }

  /**
   * Convert LibgenSearchResult to Normalized Baglib EnrichmentCandidateEdition
   */
  public toCandidateEdition(res: LibgenSearchResult): EnrichmentCandidateEdition {
    return {
      id: res.id,
      providerId: res.md5 || res.editionId || res.id,
      providerName: 'LibGen',
      title: res.title,
      authors: res.author ? [res.author] : [],
      publisher: res.publisher,
      publicationYear: res.year,
      isbn: res.isbn,
      language: res.language,
      description: res.description,
      coverUrl: res.coverUrl,
      downloadUrl: res.downloadUrl,
      downloadFormat: (res.format || 'PDF') as any,
      sourceUrl: res.detailUrl,
      pageCount: res.pages ? parseInt(res.pages, 10) : undefined,
      matchConfidence: res.isbn ? 0.95 : res.md5 ? 0.9 : 0.8,
    };
  }

  /**
   * Legacy HTML parser fallback when json.php is unavailable or empty
   */
  parseHtml(html: string, baseUrl: string, maxResults = 25): LibgenSearchResult[] {
    const { document } = parseHTML(html);
    const table = document.querySelector('#tablelibgen, table.table-striped');
    if (!table) return [];
    for (const node of table.querySelectorAll('script, style')) node.remove();
    const rows = [...table.querySelectorAll('tr')];
    const header = rows[0];
    if (!header) return [];
    const columns = [...header.children].map(cell => cell.textContent?.toLowerCase().trim() || '');
    const column = (name: string) => columns.findIndex(value => value.includes(name));
    const titleColumn = column('title') >= 0 ? column('title') : 1;
    const text = (cells: Element[], name: string) => cells[column(name)]?.textContent?.replace(/\s+/g, ' ').trim() || undefined;
    const results: LibgenSearchResult[] = [];
    for (const row of rows.slice(1)) {
      const cells = [...row.children];
      const titleCell = cells[titleColumn];
      if (!titleCell) continue;
      const editionLink = [...titleCell.querySelectorAll('a[href]')].find(link => /edition\.php\?id=\d+/i.test(link.getAttribute('href') || ''));
      const title = (editionLink?.textContent || titleCell.textContent || '').replace(/\s+/g, ' ').trim();
      if (title.length < 2) continue;
      const editionId = editionLink?.getAttribute('href')?.match(/edition\.php\?id=(\d+)/i)?.[1];
      const image = row.querySelector('img');
      const coverUrl = this.coverUrl(image?.getAttribute('data-src') || image?.getAttribute('src'), baseUrl);
      const fileLink = [...row.querySelectorAll('a[href]')].map(link => link.getAttribute('href') || '').find(href => /(?:md5=|\/ads|\/get)([a-f\d]{32})/i.test(href));
      const md5 = fileLink?.match(/(?:md5=|\/ads|\/get)([a-f\d]{32})/i)?.[1]?.toLowerCase();
      const isbn = titleCell.querySelector('font[color="green"]')?.textContent?.trim().split(';')[0];
      results.push({
        id: md5 ? `libgen-${md5}` : editionId ? `libgen-e-${editionId}` : `libgen-row-${results.length}`,
        title, author: text(cells, 'author') || 'Unknown Author',
        publisher: text(cells, 'publisher'), year: Number.parseInt(text(cells, 'year') || '', 10) || undefined,
        language: text(cells, 'language'), pages: text(cells, 'pages'), fileSize: text(cells, 'size'),
        format: (text(cells, 'ext') || 'PDF').toUpperCase(), coverUrl, editionId,
        detailUrl: editionId ? `${baseUrl}/edition.php?id=${editionId}` : this.coverUrl(fileLink, baseUrl) || baseUrl,
        downloadUrl: md5 ? `${baseUrl}/get.php?md5=${md5}` : undefined,
        isbn: isbn || titleCell.textContent?.match(/\b97[89][-\d ]{10,17}\b/)?.[0],
        md5, series: titleCell.querySelector('b')?.textContent?.trim() || undefined,
      });
      if (results.length >= maxResults) break;
    }
    return results;
  }
}

export const libgenProvider = new LibgenProvider();
