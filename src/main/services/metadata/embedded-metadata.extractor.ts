/**
 * Baglib — Embedded File Metadata & Cover Extractor
 *
 * Extracts internal bibliographic metadata and embedded cover art directly from
 * local EPUB and PDF book files without requiring network access.
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
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

export interface ExtractedPdfCover {
  coverBuffer: Buffer;
  coverMimeType: string;
  dataUrl: string;
  width?: number;
  height?: number;
  isPageOne?: boolean;
  pageIndex: number;
  totalPages: number;
  pageNumber?: number;
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
   * Extracts the first image of a PDF file (defaults to page/candidate index 1).
   */
  static extractFirstPdfImage(filePathOrBuffer: string | Buffer): ExtractedPdfCover | null {
    return this.extractPdfImage(filePathOrBuffer, 1);
  }

  /**
   * Extracts an image from a PDF file by index (1-based: 1, 2, 3...) to allow switching
   * between previous/next pages and candidate covers.
   */
  static extractPdfImage(
    filePathOrBuffer: string | Buffer,
    targetIndex: number = 1
  ): ExtractedPdfCover | null {
    try {
      let pdfBuffer: Buffer;
      if (typeof filePathOrBuffer === 'string') {
        if (!fs.existsSync(filePathOrBuffer)) return null;
        pdfBuffer = fs.readFileSync(filePathOrBuffer);
      } else if (Buffer.isBuffer(filePathOrBuffer)) {
        pdfBuffer = filePathOrBuffer;
      } else {
        return null;
      }

      if (!pdfBuffer || pdfBuffer.length < 50) return null;

      const pdfStr = pdfBuffer.toString('latin1');
      const pageMap = this.findAllPagesXObjectMap(pdfStr);
      const page1XObjectIds = pageMap.get(1) || this.findFirstPageXObjectIds(pdfStr);

      const streamMarker = Buffer.from('stream');
      const endStreamMarker = Buffer.from('endstream');
      const rawCandidates: Array<{
        buffer: Buffer;
        mimeType: string;
        width: number;
        height: number;
        length: number;
        isPageOne: boolean;
        objId?: number;
        pageNumber?: number;
      }> = [];

      let searchPos = 0;
      while (searchPos < pdfBuffer.length) {
        const streamIndex = pdfBuffer.indexOf(streamMarker, searchPos);
        if (streamIndex === -1) break;

        // Skip 'stream' and following newline (\r\n or \n or \r)
        let dataStart = streamIndex + streamMarker.length;
        if (pdfBuffer[dataStart] === 0x0d && pdfBuffer[dataStart + 1] === 0x0a) {
          dataStart += 2;
        } else if (pdfBuffer[dataStart] === 0x0a || pdfBuffer[dataStart] === 0x0d) {
          dataStart += 1;
        }

        // Inspect dictionary before 'stream' to inspect object ID, width, height, subtype
        const dictWindowStart = Math.max(0, streamIndex - 1200);
        const dictStr = pdfBuffer.slice(dictWindowStart, streamIndex).toString('latin1');
        const isImageDict = /\/Subtype\s*\/Image\b/i.test(dictStr);

        // Detect object ID: find the most immediate object declaration preceding this stream
        let objId: number | undefined;
        const allObjMatches = Array.from(dictStr.matchAll(/(\d+)\s+\d+\s+obj\b/g));
        if (allObjMatches.length > 0) {
          objId = parseInt(allObjMatches[allObjMatches.length - 1][1], 10);
        }

        let pageNumber: number | undefined;
        if (objId !== undefined) {
          for (const [pNum, ids] of pageMap.entries()) {
            if (ids.includes(objId)) {
              pageNumber = pNum;
              break;
            }
          }
        }
        const isPageOne = pageNumber === 1 || (objId !== undefined && page1XObjectIds.includes(objId));

        // 1. Check for JPEG (DCTDecode)
        if (
          pdfBuffer[dataStart] === 0xff &&
          pdfBuffer[dataStart + 1] === 0xd8 &&
          pdfBuffer[dataStart + 2] === 0xff
        ) {
          const endStreamIndex = pdfBuffer.indexOf(endStreamMarker, dataStart);
          if (endStreamIndex !== -1) {
            let eoiIndex = -1;
            for (let i = endStreamIndex - 1; i >= dataStart + 2; i--) {
              if (pdfBuffer[i - 1] === 0xff && pdfBuffer[i] === 0xd9) {
                eoiIndex = i + 1;
                break;
              }
            }
            const imgEnd = eoiIndex !== -1 ? eoiIndex : endStreamIndex;
            const imgBuffer = pdfBuffer.slice(dataStart, imgEnd);

            let width = 0;
            let height = 0;
            const allWidthMatches = Array.from(dictStr.matchAll(/\/Width\s+(\d+)/g));
            if (allWidthMatches.length > 0) {
              width = parseInt(allWidthMatches[allWidthMatches.length - 1][1], 10);
            }
            const allHeightMatches = Array.from(dictStr.matchAll(/\/Height\s+(\d+)/g));
            if (allHeightMatches.length > 0) {
              height = parseInt(allHeightMatches[allHeightMatches.length - 1][1], 10);
            }

            rawCandidates.push({
              buffer: imgBuffer,
              mimeType: 'image/jpeg',
              width,
              height,
              length: imgBuffer.length,
              isPageOne,
              objId,
              pageNumber,
            });
          }
        } else if (isImageDict && /\/Filter\s*(?:\[\s*)?\/FlateDecode/i.test(dictStr)) {
          // 2. Check for FlateDecode (PNG / uncompressed raster pixel stream)
          const endStreamIndex = pdfBuffer.indexOf(endStreamMarker, dataStart);
          if (endStreamIndex !== -1) {
            const rawStream = pdfBuffer.slice(dataStart, endStreamIndex);
            try {
              const inflated = zlib.inflateSync(rawStream);
              let width = 0;
              let height = 0;
              const allWidthMatches = Array.from(dictStr.matchAll(/\/Width\s+(\d+)/g));
              if (allWidthMatches.length > 0) {
                width = parseInt(allWidthMatches[allWidthMatches.length - 1][1], 10);
              }
              const allHeightMatches = Array.from(dictStr.matchAll(/\/Height\s+(\d+)/g));
              if (allHeightMatches.length > 0) {
                height = parseInt(allHeightMatches[allHeightMatches.length - 1][1], 10);
              }

              if (width > 0 && height > 0) {
                let rgbBuf: Buffer | null = null;
                if (inflated.length >= width * height * 3) {
                  rgbBuf = inflated;
                } else if (inflated.length >= width * height) {
                  // Convert 8-bit grayscale to 24-bit RGB
                  rgbBuf = Buffer.alloc(width * height * 3);
                  for (let i = 0; i < width * height; i++) {
                    const g = inflated[i];
                    rgbBuf[i * 3] = g;
                    rgbBuf[i * 3 + 1] = g;
                    rgbBuf[i * 3 + 2] = g;
                  }
                }

                if (rgbBuf) {
                  const bmpBuf = this.rgbToBmp(width, height, rgbBuf);
                  rawCandidates.push({
                    buffer: bmpBuf,
                    mimeType: 'image/bmp',
                    width,
                    height,
                    length: bmpBuf.length,
                    isPageOne,
                    objId,
                    pageNumber,
                  });
                }
              }
            } catch {
              // Ignore non-image streams
            }
          }
        }

        searchPos = streamIndex + streamMarker.length;
      }

      if (rawCandidates.length === 0) return null;

      // Filter to significant images (ignore tiny icons or line ornaments)
      let filtered = rawCandidates.filter(
        (c) => c.length >= 500 || (c.width >= 50 && c.height >= 50)
      );
      if (filtered.length === 0) {
        filtered = rawCandidates;
      }

      // Deduplicate candidates by object ID or size
      const seenObjIds = new Set<number>();
      const deduplicated: typeof filtered = [];
      for (const c of filtered) {
        if (c.objId !== undefined) {
          if (seenObjIds.has(c.objId)) continue;
          seenObjIds.add(c.objId);
        }
        deduplicated.push(c);
      }

      // Sort candidates logically:
      // Candidates with known pageNumbers are sorted in page order, then by size descending
      deduplicated.sort((a, b) => {
        const pageA = a.pageNumber || 9999;
        const pageB = b.pageNumber || 9999;
        if (pageA !== pageB) return pageA - pageB;
        return b.length - a.length;
      });

      // Limit candidates to the first 30 pages/images for fast and responsive switching
      const candidateList = deduplicated.slice(0, 30);
      if (candidateList.length === 0) return null;

      const totalPages = candidateList.length;
      const safeIndex = Math.max(1, Math.min(totalPages, targetIndex || 1));
      const chosen = candidateList[safeIndex - 1];

      const base64 = chosen.buffer.toString('base64');
      return {
        coverBuffer: chosen.buffer,
        coverMimeType: chosen.mimeType,
        dataUrl: `data:${chosen.mimeType};base64,${base64}`,
        width: chosen.width,
        height: chosen.height,
        isPageOne: chosen.pageNumber === 1 || safeIndex === 1,
        pageIndex: safeIndex,
        totalPages,
        pageNumber: chosen.pageNumber || safeIndex,
      };
    } catch (err) {
      console.warn('[EmbeddedMetadataExtractor] extractPdfImage error:', err);
      return null;
    }
  }

  /**
   * Helper to map all pages in the PDF to their referenced XObject IDs
   */
  private static findAllPagesXObjectMap(pdfStr: string): Map<number, number[]> {
    const pageMap = new Map<number, number[]>();
    try {
      const pageRegex = /(\d+)\s+\d+\s+obj([\s\S]*?)endobj/g;
      let match;
      let pageNum = 1;
      while ((match = pageRegex.exec(pdfStr)) !== null) {
        const body = match[2];
        if (!/\/Type\s*\/Page\b/.test(body) || /\/Type\s*\/Pages\b/.test(body)) {
          continue;
        }

        const ids: number[] = [];

        // 1. Direct /XObject dictionary
        const xobjectPos = body.indexOf('/XObject');
        if (xobjectPos !== -1) {
          const snippet = body.slice(xobjectPos, xobjectPos + 1000);
          const refRegex = /\/(\w+)\s+(\d+)\s+\d+\s+R/g;
          let refMatch;
          while ((refMatch = refRegex.exec(snippet)) !== null) {
            ids.push(parseInt(refMatch[2], 10));
          }
        }

        // 2. Indirect /Resources dictionary reference: /Resources 15 0 R
        const resMatch = body.match(/\/Resources\s+(\d+)\s+\d+\s+R/);
        if (resMatch) {
          const resObjId = resMatch[1];
          const resObjRegex = new RegExp(`${resObjId}\\s+\\d+\\s+obj([\\s\\S]*?)endobj`);
          const resObjMatch = resObjRegex.exec(pdfStr);
          if (resObjMatch) {
            const resBody = resObjMatch[1];
            const resXPos = resBody.indexOf('/XObject');
            if (resXPos !== -1) {
              const resSnippet = resBody.slice(resXPos, resXPos + 1000);
              const refRegex = /\/(\w+)\s+(\d+)\s+\d+\s+R/g;
              let refMatch;
              while ((refMatch = refRegex.exec(resSnippet)) !== null) {
                ids.push(parseInt(refMatch[2], 10));
              }
            }
          }
        }

        pageMap.set(pageNum, ids);
        pageNum++;
      }
    } catch {
      // Fallback
    }
    return pageMap;
  }

  /**
   * Helper to find XObject object IDs referenced by the first Page in the PDF
   */
  private static findFirstPageXObjectIds(pdfStr: string): number[] {
    try {
      const map = this.findAllPagesXObjectMap(pdfStr);
      return map.get(1) || [];
    } catch {
      return [];
    }
  }

  /**
   * Converts raw RGB buffer to a standard 24-bit uncompressed BMP buffer
   */
  private static rgbToBmp(width: number, height: number, rgbBuffer: Buffer): Buffer {
    const rowSize = Math.floor((24 * width + 31) / 32) * 4;
    const pixelArraySize = rowSize * height;
    const fileSize = 54 + pixelArraySize;
    const buf = Buffer.alloc(fileSize);

    buf.write('BM', 0);
    buf.writeUInt32LE(fileSize, 2);
    buf.writeUInt32LE(0, 6);
    buf.writeUInt32LE(54, 10);

    buf.writeUInt32LE(40, 14);
    buf.writeInt32LE(width, 18);
    buf.writeInt32LE(-height, 22); // Top-down
    buf.writeUInt16LE(1, 26);
    buf.writeUInt16LE(24, 28);
    buf.writeUInt32LE(0, 30);
    buf.writeUInt32LE(pixelArraySize, 34);
    buf.writeInt32LE(2835, 38);
    buf.writeInt32LE(2835, 42);
    buf.writeUInt32LE(0, 46);
    buf.writeUInt32LE(0, 50);

    let srcOffset = 0;
    let dstOffset = 54;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (srcOffset + 2 < rgbBuffer.length) {
          buf[dstOffset] = rgbBuffer[srcOffset + 2]; // B
          buf[dstOffset + 1] = rgbBuffer[srcOffset + 1]; // G
          buf[dstOffset + 2] = rgbBuffer[srcOffset]; // R
        }
        srcOffset += 3;
        dstOffset += 3;
      }
      const padding = rowSize - width * 3;
      for (let p = 0; p < padding; p++) {
        buf[dstOffset++] = 0;
      }
    }
    return buf;
  }

  /**
   * PDF Metadata & Cover Extraction via pdf-parse & extractFirstPdfImage
   */
  private static async extractFromPdf(filePath: string): Promise<EmbeddedBookMetadata | null> {
    const dataBuffer = fs.readFileSync(filePath);
    const pdfFn = typeof pdfParse === 'function' ? pdfParse : pdfParse.default || pdfParse.PDF;

    let title: string | undefined;
    const authors: string[] = [];
    let publicationYear: number | undefined;
    let description: string | undefined;

    if (typeof pdfFn === 'function') {
      try {
        const pdfData = await pdfFn(dataBuffer, { max: 1 }); // only parse first page for fast header info
        const info = pdfData.info || {};

        if (typeof info.Title === 'string' && info.Title.trim()) {
          title = info.Title.trim();
        }
        // Discard generic printer/generator titles like "untitled", "Microsoft Word - ..."
        if (title && /^(untitled|microsoft word|export|document\d*)$/i.test(title)) {
          title = undefined;
        }

        if (typeof info.Author === 'string' && info.Author.trim()) {
          authors.push(info.Author.trim());
        }

        if (info.CreationDate) {
          // PDF CreationDate format: "D:YYYYMMDD..."
          const yearMatch = String(info.CreationDate).match(/(?:D:)?(18\d{2}|19\d{2}|20\d{2})/);
          if (yearMatch) {
            publicationYear = parseInt(yearMatch[1], 10);
          }
        }

        if (typeof info.Subject === 'string') {
          description = info.Subject.trim();
        }
      } catch (err) {
        console.warn(`[EmbeddedMetadataExtractor] pdf-parse warning for ${filePath}:`, err);
      }
    }

    // Extract the first image of the PDF to make it the cover
    const pdfCover = this.extractFirstPdfImage(dataBuffer);

    return {
      title,
      authors,
      publicationYear,
      description,
      coverBuffer: pdfCover?.coverBuffer,
      coverMimeType: pdfCover?.coverMimeType,
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
