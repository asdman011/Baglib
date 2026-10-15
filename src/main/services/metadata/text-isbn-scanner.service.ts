/**
 * Baglib — Text ISBN Scanner Service
 *
 * Reverse-engineered from Calibre's "Extract ISBN" plugin (KiwiDude / Grant Drake)
 * - scan.py: RE_ISBN regex pattern, HTML/markup stripping, multiline un-wrapping,
 *            repeating dummy digit rejection, prefix validation ('978', '979', '977'),
 *            and prioritized ISBN-13 > ISBN-10 organization.
 * - pdf.py: Page budgeting (FRONT_PAGES = 10, BACK_PAGES = 5) to scan copyright/title
 *           pages and colophons without scanning huge middle textbook bodies.
 * - nonpdf.py: EPUB spine iteration (first files in spine -> last files in reverse -> middle).
 *
 * Fully bilingual: Supports English 'ISBN', 'ISBN-10', 'ISBN-13' as well as Arabic
 * 'ردمك', 'الترقيم الدولي', and 'الرقم الدولي المعياري'.
 */

import fs from 'fs';
import path from 'path';
import {
  isValidIsbn10,
  isValidIsbn13,
  isValidIsbn,
  isbn10ToIsbn13,
  isValidIsbn13Prefix,
  isRepeatedDummyDigits,
} from '../../../shared/validators/metadata-validator';

// Use require for pdf-parse and yauzl
const pdfParse = require('pdf-parse');
const yauzl = require('yauzl');

export interface ScannedIsbnResult {
  isbn?: string;
  isbn10?: string;
  isbn13?: string;
  allIsbns: string[];
}

export class TextIsbnScannerService {
  private static instance: TextIsbnScannerService;

  public static getInstance(): TextIsbnScannerService {
    if (!TextIsbnScannerService.instance) {
      TextIsbnScannerService.instance = new TextIsbnScannerService();
    }
    return TextIsbnScannerService.instance;
  }

  /**
   * Scans raw text for ISBN identifiers using Calibre Extract ISBN regex and validation rules.
   */
  public scanText(text: string): ScannedIsbnResult {
    if (!text || typeof text !== 'string') {
      return { allIsbns: [] };
    }

    // 1. Strip <style> and <script> blocks
    let cleanText = text
      .replace(/<style[^<]*<\/style>/gi, ' ')
      .replace(/<script[^<]*<\/script>/gi, ' ');

    // 2. Strip HTML tags, replacing them with a space/boundary to avoid merging adjacent words/numbers
    cleanText = cleanText.replace(/<[^>]+>/g, ' ! ');

    // 3. Normalize non-standard Unicode dashes and spaces
    cleanText = cleanText
      .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u00ad]/g, '-')
      .replace(/[\u00a0\u2000-\u200b\u202f\u205f\u3000]/g, ' ');

    // 4. Normalize Eastern Arabic (٠-٩) and Persian (۰-۹) digits to standard Latin digits (0-9)
    cleanText = cleanText
      .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
      .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));

    // 5. Unwrap linebreaks often found in PDF/EPUB text (e.g. "978-\n0-13-235088-4" or "978 013\n2350884")
    cleanText = cleanText.replace(/([0-9])-\s*[\r\n]+\s*([0-9])/g, '$1-$2');
    cleanText = cleanText.replace(/([0-9])\s*[\r\n]+\s*([0-9])/g, '$1 $2');

    // 6. Pattern matching:
    // Matches labeled strings (ISBN, ISBN-10, ISBN-13, ردمك, الترقيم الدولي) as well as
    // Calibre's RE_ISBN: [0-9\-\.–­―—\^ ]{9,22}[0-9xX] with optional "-10 " / "-13 ".
    // Note: uses [ \t] instead of \s so linebreaks cleanly delimit ISBN candidates.
    const isbnPattern =
      /(?:(?:ISBN(?:-?1[03])?|ردمك|ر\.د\.م\.ك|الترقيم\s+الدولي|الرقم\s+الدولي(?:\s+المعياري)?)\s*[:=]?\s*)?(-?(?:1[03][ \t]+)?[0-9][0-9\-. \t\^]{7,25}[0-9xX])/gi;

    const isbns13: string[] = [];
    const isbns10: string[] = [];
    const allFound: string[] = [];

    const matches = Array.from(cleanText.matchAll(isbnPattern));

    for (const match of matches) {
      let rawCandidate = match[1].trim();

      // Calibre fix: If regex captured leading '-10 ' or '-13 ' from "ISBN-10 xxx"
      if (rawCandidate.startsWith('-10 ') || rawCandidate.startsWith('-13 ')) {
        rawCandidate = rawCandidate.slice(4).trim();
      }

      // Strip all characters except digits and 'X'
      const digits = rawCandidate.replace(/[^0-9xX]/g, '').toUpperCase();

      // Check repeating dummy digits (e.g. 0000000000, 1111111111111)
      if (isRepeatedDummyDigits(digits)) {
        continue;
      }

      if (digits.length === 13) {
        if (isValidIsbn13Prefix(digits) && isValidIsbn13(digits)) {
          if (!isbns13.includes(digits)) isbns13.push(digits);
          if (!allFound.includes(digits)) allFound.push(digits);
        }
      } else if (digits.length === 10) {
        if (isValidIsbn10(digits)) {
          if (!isbns10.includes(digits)) isbns10.push(digits);
          if (!allFound.includes(digits)) allFound.push(digits);

          // Calculate derived ISBN-13
          const derived13 = isbn10ToIsbn13(digits);
          if (derived13 && !isbns13.includes(derived13)) {
            isbns13.push(derived13);
          }
        }
      } else if (digits.length > 13) {
        // If candidate captured trailing digits (e.g. printing runs like "10 9 8 7"), test prefix 13
        const candidate13 = digits.slice(0, 13);
        if (isValidIsbn13Prefix(candidate13) && isValidIsbn13(candidate13)) {
          if (!isbns13.includes(candidate13)) isbns13.push(candidate13);
          if (!allFound.includes(candidate13)) allFound.push(candidate13);
        }
      } else if (digits.length > 10) {
        // Test prefix 10
        const candidate10 = digits.slice(0, 10);
        if (isValidIsbn10(candidate10)) {
          if (!isbns10.includes(candidate10)) isbns10.push(candidate10);
          if (!allFound.includes(candidate10)) allFound.push(candidate10);

          const derived13 = isbn10ToIsbn13(candidate10);
          if (derived13 && !isbns13.includes(derived13)) {
            isbns13.push(derived13);
          }
        }
      }
    }

    // Calibre priority: ISBN-13 is strongly preferred over ISBN-10
    const primary13 = isbns13[0];
    const primary10 = isbns10[0];
    const primaryIsbn = primary13 || primary10;

    return {
      isbn: primaryIsbn,
      isbn10: primary10,
      isbn13: primary13,
      allIsbns: allFound,
    };
  }

  /**
   * Scans a PDF buffer or file path for ISBN text.
   * Adopts Calibre extract_isbn page budget:
   * First 10 pages (FRONT_PAGES) forwards, then last 5 pages (BACK_PAGES) backwards.
   */
  public async scanPdf(
    filePathOrBuffer: string | Buffer | Uint8Array,
    pageBudget: { front?: number; back?: number } = { front: 10, back: 5 }
  ): Promise<ScannedIsbnResult | null> {
    try {
      let buffer: Buffer;
      if (typeof filePathOrBuffer === 'string') {
        if (!fs.existsSync(filePathOrBuffer)) return null;
        buffer = fs.readFileSync(filePathOrBuffer);
      } else if (Buffer.isBuffer(filePathOrBuffer)) {
        buffer = filePathOrBuffer;
      } else if (filePathOrBuffer instanceof Uint8Array) {
        buffer = Buffer.from(filePathOrBuffer);
      } else {
        return null;
      }

      const pdfFn = typeof pdfParse === 'function' ? pdfParse : pdfParse.default || pdfParse.PDF;
      if (typeof pdfFn !== 'function') return null;

      const frontLimit = pageBudget.front ?? 10;
      const backLimit = pageBudget.back ?? 5;

      // Pass 1: Scan front pages (1 to frontLimit)
      const frontParsed = await pdfFn(new Uint8Array(buffer), { max: frontLimit });
      if (frontParsed && frontParsed.text) {
        const frontRes = this.scanText(frontParsed.text);
        if (frontRes.isbn) {
          return frontRes;
        }
      }

      const totalPages = frontParsed?.numpages || 1;

      // Pass 2: If not found in front pages and totalPages > frontLimit, scan back pages in reverse
      if (totalPages > frontLimit) {
        const backCutoff = Math.max(frontLimit + 1, totalPages - backLimit + 1);
        const backTexts: { pageNum: number; text: string }[] = [];

        const pagerender = async (pageData: any) => {
          const pageNum = pageData.pageNumber || (pageData.pageIndex !== undefined ? pageData.pageIndex + 1 : 1);
          if (pageNum < backCutoff) {
            return '';
          }
          const textContent = await pageData.getTextContent();
          let pageStr = '';
          for (const item of textContent.items) {
            pageStr += item.str + ' ';
          }
          backTexts.push({ pageNum, text: pageStr });
          return pageStr;
        };

        await pdfFn(new Uint8Array(buffer), { pagerender, max: 0 });

        // Scan in reverse (from last page backwards)
        backTexts.sort((a, b) => b.pageNum - a.pageNum);
        for (const item of backTexts) {
          const res = this.scanText(item.text);
          if (res.isbn) {
            return res;
          }
        }
      }

      return null;
    } catch (err) {
      console.warn('[TextIsbnScannerService] scanPdf error:', err);
      return null;
    }
  }

  /**
   * Scans an EPUB file for ISBN text across its spine documents.
   * Adopts Calibre nonpdf.py ordering:
   * First few files in spine -> last files in reverse -> remaining files.
   */
  public async scanEpub(filePath: string): Promise<ScannedIsbnResult | null> {
    if (!filePath || !fs.existsSync(filePath)) return null;

    return new Promise((resolve) => {
      yauzl.open(filePath, { lazyEntries: true }, (err: any, zipfile: any) => {
        if (err || !zipfile) {
          resolve(null);
          return;
        }

        const entries: Record<string, any> = {};
        let opfPath: string | null = null;
        let opfDir = '';

        zipfile.readEntry();

        zipfile.on('entry', (entry: any) => {
          entries[entry.fileName] = entry;

          if (entry.fileName === 'META-INF/container.xml') {
            this.readZipEntry(zipfile, entry).then((buf) => {
              const xml = buf.toString('utf8');
              const match = xml.match(/full-path="([^"]+)"/i);
              if (match) {
                opfPath = match[1];
                opfDir = path.posix.dirname(opfPath);
                if (opfDir === '.') opfDir = '';
              }
              zipfile.readEntry();
            });
          } else {
            zipfile.readEntry();
          }
        });

        zipfile.on('end', async () => {
          if (!opfPath || !entries[opfPath]) {
            resolve(null);
            return;
          }

          try {
            const opfBuf = await this.readZipEntry(zipfile, entries[opfPath]);
            const opfXml = opfBuf.toString('utf8');

            // 1. Check dc:identifier in OPF first
            const idMatches = Array.from(opfXml.matchAll(/<dc:identifier[^>]*>([^<]+)<\/dc:identifier>/gi));
            for (const idm of idMatches) {
              const clean = idm[1].replace(/urn:isbn:/i, '').replace(/[-\s]/g, '').trim();
              if (isValidIsbn(clean)) {
                resolve(this.scanText(clean));
                return;
              }
            }

            // 2. Parse spine items
            const manifestMap = new Map<string, string>(); // id -> href
            const manifestMatches = Array.from(
              opfXml.matchAll(/<item\s+[^>]*id="([^"]+)"[^>]*href="([^"]+)"/gi)
            );
            for (const m of manifestMatches) {
              manifestMap.set(m[1], m[2]);
            }
            // Reverse attribute order check: href before id
            const manifestMatches2 = Array.from(
              opfXml.matchAll(/<item\s+[^>]*href="([^"]+)"[^>]*id="([^"]+)"/gi)
            );
            for (const m of manifestMatches2) {
              if (!manifestMap.has(m[2])) manifestMap.set(m[2], m[1]);
            }

            const itemrefMatches = Array.from(opfXml.matchAll(/<itemref\s+[^>]*idref="([^"]+)"/gi));
            const spineHrefs: string[] = [];
            for (const ir of itemrefMatches) {
              const href = manifestMap.get(ir[1]);
              if (href) {
                const fullEntryPath = opfDir ? path.posix.join(opfDir, href) : href;
                spineHrefs.push(fullEntryPath);
              }
            }

            // Calibre EPUB scanning priority:
            // First 5 spine files (cover, title, copyright) -> Last 3 in reverse (colophon) -> Middle
            const frontSpine = spineHrefs.slice(0, 5);
            const backSpine = spineHrefs.slice(-3).reverse();
            const middleSpine = spineHrefs.slice(5, -3);

            const filesToScan = [...frontSpine, ...backSpine, ...middleSpine];

            for (const entryPath of filesToScan) {
              const entry = entries[entryPath];
              if (!entry) continue;

              const contentBuf = await this.readZipEntry(zipfile, entry);
              const text = contentBuf.toString('utf8');
              const res = this.scanText(text);

              if (res.isbn) {
                resolve(res);
                return;
              }
            }

            resolve(null);
          } catch {
            resolve(null);
          }
        });

        zipfile.on('error', () => {
          resolve(null);
        });
      });
    });
  }

  /**
   * Scans a file by path based on its extension (PDF, EPUB, TXT, HTML).
   */
  public async scanFile(filePath: string): Promise<ScannedIsbnResult | null> {
    if (!filePath || !fs.existsSync(filePath)) return null;

    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.pdf') {
      return this.scanPdf(filePath);
    } else if (ext === '.epub') {
      return this.scanEpub(filePath);
    } else if (ext === '.txt' || ext === '.html' || ext === '.htm' || ext === '.xhtml') {
      try {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        // Scan first 50KB and last 20KB to keep it fast
        const frontChunk = fileContent.slice(0, 50000);
        const frontRes = this.scanText(frontChunk);
        if (frontRes.isbn) return frontRes;

        if (fileContent.length > 50000) {
          const backChunk = fileContent.slice(-20000);
          const backRes = this.scanText(backChunk);
          if (backRes.isbn) return backRes;
        }
      } catch {
        return null;
      }
    }

    return null;
  }

  private readZipEntry(zipfile: any, entry: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      zipfile.openReadStream(entry, (err: any, readStream: any) => {
        if (err || !readStream) {
          reject(err || new Error('Failed to open read stream'));
          return;
        }

        const chunks: Buffer[] = [];
        readStream.on('data', (chunk: Buffer) => chunks.push(chunk));
        readStream.on('end', () => resolve(Buffer.concat(chunks)));
        readStream.on('error', (streamErr: any) => reject(streamErr));
      });
    });
  }
}

export const textIsbnScannerService = TextIsbnScannerService.getInstance();
