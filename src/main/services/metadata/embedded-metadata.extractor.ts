/**
 * Baglib — Embedded File Metadata & Cover Extractor
 *
 * Extracts internal bibliographic metadata and embedded cover art directly from
 * local EPUB and PDF book files without requiring network access.
 */

import fs from 'fs';
import path from 'path';
import { isValidIsbn } from '../../../shared/validators/metadata-validator';

// Use require for pdf-parse and yauzl
const pdfParse = require('pdf-parse');
const yauzl = require('yauzl');

export interface EmbeddedBookMetadata {
  title?: string;
  authors: string[];
  publisher?: string;
  publicationYear?: number;
  isbn?: string;
  language?: string;
  description?: string;
  coverBuffer?: Buffer;
  coverMimeType?: string;
}

export class EmbeddedMetadataExtractor {
  /**
   * Extracts embedded metadata and optional cover image from a local file.
   */
  static async extract(filePath: string): Promise<EmbeddedBookMetadata | null> {
    if (!filePath || !fs.existsSync(filePath)) {
      return null;
    }

    const ext = path.extname(filePath).toLowerCase();

    try {
      if (ext === '.pdf') {
        return await this.extractFromPdf(filePath);
      } else if (ext === '.epub') {
        return await this.extractFromEpub(filePath);
      }
    } catch (err) {
      console.warn(`[EmbeddedMetadataExtractor] Failed to extract metadata from ${filePath}:`, err);
    }

    return null;
  }

  /**
   * PDF Metadata Extraction via pdf-parse
   */
  private static async extractFromPdf(filePath: string): Promise<EmbeddedBookMetadata | null> {
    const dataBuffer = fs.readFileSync(filePath);
    const pdfFn = typeof pdfParse === 'function' ? pdfParse : pdfParse.default || pdfParse.PDF;

    if (typeof pdfFn !== 'function') return null;

    const pdfData = await pdfFn(dataBuffer, { max: 1 }); // only parse first page for fast header info
    const info = pdfData.info || {};

    let title = typeof info.Title === 'string' && info.Title.trim() ? info.Title.trim() : undefined;
    // Discard generic printer/generator titles like "untitled", "Microsoft Word - ..."
    if (title && /^(untitled|microsoft word|export|document\d*)$/i.test(title)) {
      title = undefined;
    }

    const authors: string[] = [];
    if (typeof info.Author === 'string' && info.Author.trim()) {
      authors.push(info.Author.trim());
    }

    let publicationYear: number | undefined;
    if (info.CreationDate) {
      // PDF CreationDate format: "D:YYYYMMDD..."
      const yearMatch = String(info.CreationDate).match(/(?:D:)?(18\d{2}|19\d{2}|20\d{2})/);
      if (yearMatch) {
        publicationYear = parseInt(yearMatch[1], 10);
      }
    }

    let description = typeof info.Subject === 'string' ? info.Subject.trim() : undefined;

    return {
      title,
      authors,
      publicationYear,
      description,
    };
  }

  /**
   * EPUB Metadata & Cover Extraction via yauzl
   */
  private static async extractFromEpub(filePath: string): Promise<EmbeddedBookMetadata | null> {
    return new Promise((resolve) => {
      yauzl.open(filePath, { lazyEntries: true }, (err: any, zipfile: any) => {
        if (err || !zipfile) {
          resolve(null);
          return;
        }

        const entries: Record<string, any> = {};
        let opfPath: string | null = null;
        let coverHref: string | null = null;
        let opfDir = '';

        zipfile.readEntry();

        zipfile.on('entry', (entry: any) => {
          entries[entry.fileName] = entry;

          // Check if this is the container
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
            return;
          }

          zipfile.readEntry();
        });

        zipfile.on('end', async () => {
          // If we found an OPF path, parse it
          if (!opfPath) {
            // Fallback: look for any .opf entry
            opfPath = Object.keys(entries).find((k) => k.endsWith('.opf')) || null;
            if (opfPath) {
              opfDir = path.posix.dirname(opfPath);
              if (opfDir === '.') opfDir = '';
            }
          }

          if (!opfPath || !entries[opfPath]) {
            resolve(null);
            return;
          }

          try {
            const opfBuf = await this.readZipEntry(zipfile, entries[opfPath]);
            const opfXml = opfBuf.toString('utf8');

            const titleMatch = opfXml.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/i);
            const title = titleMatch ? titleMatch[1].trim() : undefined;

            const authorMatches = [...opfXml.matchAll(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/gi)];
            const authors = authorMatches.map((m) => m[1].trim()).filter(Boolean);

            const publisherMatch = opfXml.match(/<dc:publisher[^>]*>([^<]+)<\/dc:publisher>/i);
            const publisher = publisherMatch ? publisherMatch[1].trim() : undefined;

            const dateMatch = opfXml.match(/<dc:date[^>]*>(18\d{2}|19\d{2}|20\d{2})/i);
            const publicationYear = dateMatch ? parseInt(dateMatch[1], 10) : undefined;

            const langMatch = opfXml.match(/<dc:language[^>]*>([^<]+)<\/dc:language>/i);
            const language = langMatch ? langMatch[1].trim() : undefined;

            const descMatch = opfXml.match(/<dc:description[^>]*>([^<]+)<\/dc:description>/i);
            const description = descMatch ? descMatch[1].trim() : undefined;

            // Find ISBN in dc:identifier
            const idMatches = [...opfXml.matchAll(/<dc:identifier[^>]*>([^<]+)<\/dc:identifier>/gi)];
            let isbn: string | undefined;
            for (const idm of idMatches) {
              const clean = idm[1].replace(/urn:isbn:/i, '').replace(/[-\s]/g, '').trim();
              if (isValidIsbn(clean)) {
                isbn = clean;
                break;
              }
            }

            // Find Cover Image
            // 1. Look for <item properties="cover-image" href="...">
            const coverPropMatch = opfXml.match(/<item[^>]*properties="[^"]*cover-image[^"]*"[^>]*href="([^"]+)"/i);
            if (coverPropMatch) {
              coverHref = coverPropMatch[1];
            } else {
              // 2. Look for <meta name="cover" content="cover-id" />
              const metaCoverMatch = opfXml.match(/<meta[^>]*name="cover"[^>]*content="([^"]+)"/i);
              if (metaCoverMatch) {
                const coverId = metaCoverMatch[1];
                const itemMatch = opfXml.match(new RegExp(`<item[^>]*id="${coverId}"[^>]*href="([^"]+)"`, 'i'));
                if (itemMatch) coverHref = itemMatch[1];
              }
            }

            // If not found, check standard cover item names
            if (!coverHref) {
              const fallbackItem = opfXml.match(/<item[^>]*href="([^"]*(?:cover|cover-image)[^"]*\.(?:jpg|jpeg|png|webp))"/i);
              if (fallbackItem) coverHref = fallbackItem[1];
            }

            let coverBuffer: Buffer | undefined;
            let coverMimeType: string | undefined;

            if (coverHref) {
              const fullCoverPath = opfDir ? path.posix.join(opfDir, coverHref) : coverHref;
              const coverEntry = entries[fullCoverPath] || entries[coverHref];
              if (coverEntry) {
                coverBuffer = await this.readZipEntry(zipfile, coverEntry);
                const ext = path.extname(fullCoverPath).toLowerCase();
                coverMimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
              }
            }

            resolve({
              title,
              authors,
              publisher,
              publicationYear,
              isbn,
              language,
              description,
              coverBuffer,
              coverMimeType,
            });
          } catch (e) {
            resolve(null);
          }
        });
      });
    });
  }

  private static readZipEntry(zipfile: any, entry: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      zipfile.openReadStream(entry, (err: any, stream: any) => {
        if (err || !stream) {
          reject(err);
          return;
        }
        const chunks: Buffer[] = [];
        stream.on('data', (c: Buffer) => chunks.push(c));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', (e: any) => reject(e));
      });
    });
  }
}
