import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import type { DigitalFormat } from '../../../shared/types/work';
import type { ExtractedEbookMetadata } from '../../../shared/types/digital-file';
import { FilenameParser } from '../metadata/filename-parser';
import { EmbeddedMetadataExtractor } from '../metadata/embedded-metadata.extractor';
import { isValidIsbn, isPlaceholderAuthor, isPlaceholderTitle } from '../../../shared/validators/metadata-validator';
import { languageDetectorService } from '../metadata/language-detector.service';
import { textIsbnScannerService } from '../metadata/text-isbn-scanner.service';

const pdfParse = require('pdf-parse');
const yauzl = require('yauzl');

export class EbookMetadataExtractorService {
  private static instance: EbookMetadataExtractorService;

  public static getInstance(): EbookMetadataExtractorService {
    if (!this.instance) {
      this.instance = new EbookMetadataExtractorService();
    }
    return this.instance;
  }

  /**
   * Main entry point: Extracts available embedded metadata from any supported e-book format.
   * If metadata is missing or partial, falls back gracefully to FilenameParser and clean file basename.
   */
  public async extract(filePath: string, formatHint?: DigitalFormat): Promise<ExtractedEbookMetadata> {
    const ext = path.extname(filePath).toLowerCase();
    const resolvedFormat: DigitalFormat = formatHint || this.detectFormatFromExtension(ext);

    let meta: Partial<ExtractedEbookMetadata> = {};

    try {
      switch (resolvedFormat) {
        case 'PDF':
          meta = await this.extractFromPdf(filePath);
          break;
        case 'EPUB':
          meta = await this.extractFromEpub(filePath);
          break;
        case 'MOBI':
        case 'AZW3':
          meta = await this.extractFromMobiOrAzw(filePath, resolvedFormat);
          break;
        case 'HTML':
          meta = await this.extractFromHtml(filePath);
          break;
        case 'TXT':
          meta = await this.extractFromTxt(filePath);
          break;
      }
    } catch (err) {
      console.warn(`[EbookMetadataExtractor] Warning while parsing ${filePath}:`, err);
    }

    // Apply Calibre-style smart fallbacks: FilenameParser and Clean Basename
    return this.applyFallbacks(filePath, resolvedFormat, meta);
  }

  /**
   * Resolves format from extension
   */
  private detectFormatFromExtension(ext: string): DigitalFormat {
    switch (ext) {
      case '.epub':
        return 'EPUB';
      case '.mobi':
      case '.prc':
        return 'MOBI';
      case '.azw3':
      case '.azw':
        return 'AZW3';
      case '.html':
      case '.htm':
      case '.xhtml':
        return 'HTML';
      case '.txt':
        return 'TXT';
      case '.pdf':
      default:
        return 'PDF';
    }
  }

  /**
   * 1. PDF Metadata & Adobe XMP Stream Extraction
   */
  private async extractFromPdf(filePath: string): Promise<Partial<ExtractedEbookMetadata>> {
    const fileBuffer = await fs.promises.readFile(filePath);
    if (fileBuffer.length < 10 || !fileBuffer.slice(0, 1024).toString('latin1').includes('%PDF-')) {
      return {};
    }

    const pdfFn = typeof pdfParse === 'function' ? pdfParse : pdfParse.default || pdfParse.PDF;

    let title: string | undefined;
    let authors: string[] = [];
    let publisher: string | undefined;
    let publicationYear: number | undefined;
    let description: string | undefined;
    let language: string | undefined;
    let isbn: string | undefined;
    const tags: string[] = [];
    const identifiers: Record<string, string> = {};

    // Step A: Parse basic Info dictionary via pdf-parse
    let parsedText = '';
    if (typeof pdfFn === 'function') {
      try {
        const parsed = await pdfFn(new Uint8Array(fileBuffer), { max: 1 });
        if (parsed.text) parsedText = parsed.text;
        const info = parsed.info || {};

        if (typeof info.Title === 'string' && info.Title.trim()) {
          title = info.Title.trim();
        }
        if (typeof info.Author === 'string' && info.Author.trim()) {
          const split = FilenameParser.splitMultiAuthors(info.Author.trim());
          authors = split.filter((a) => !isPlaceholderAuthor(a));
        }
        if (info.CreationDate) {
          const yearMatch = String(info.CreationDate).match(/(?:D:)?(18\d{2}|19\d{2}|20\d{2})/);
          if (yearMatch) {
            publicationYear = parseInt(yearMatch[1], 10);
          }
        }
        if (typeof info.Subject === 'string' && info.Subject.trim()) {
          description = info.Subject.trim();
        }
        if (typeof info.Keywords === 'string' && info.Keywords.trim()) {
          const kwList = info.Keywords.split(/[,;]/).map((k: string) => k.trim()).filter(Boolean);
          for (const kw of kwList) {
            const cleanKw = kw.replace(/[-\s]/g, '');
            if (isValidIsbn(cleanKw)) {
              isbn = cleanKw;
            } else {
              tags.push(kw);
            }
          }
        }
      } catch (err) {
        // Continue to XMP inspection
      }
    }

    // Step B: Deep Adobe XMP Packet Extraction (Reverse-Engineered from Calibre xmp.py)
    try {
      const xmpXml = this.extractPdfXmpXml(fileBuffer);
      if (xmpXml) {
        // dc:title
        const dcTitle = this.extractXmlTag(xmpXml, 'dc:title');
        if (dcTitle && !this.isPlaceholderTitle(dcTitle)) {
          title = dcTitle; // XMP title takes precedence over Info dict
        }

        // dc:creator
        const dcCreators = this.extractXmlTags(xmpXml, 'dc:creator');
        if (dcCreators.length > 0) {
          const split = dcCreators.flatMap((c) => FilenameParser.splitMultiAuthors(c));
          const valid = split.filter((c) => !isPlaceholderAuthor(c));
          if (valid.length > 0) {
            authors = valid;
          }
        }

        // dc:publisher
        const dcPublisher = this.extractXmlTag(xmpXml, 'dc:publisher');
        if (dcPublisher) {
          publisher = dcPublisher;
        }

        // dc:description
        const dcDesc = this.extractXmlTag(xmpXml, 'dc:description');
        if (dcDesc && dcDesc.length > (description?.length || 0)) {
          description = dcDesc;
        }

        // dc:date
        const dcDate = this.extractXmlTag(xmpXml, 'dc:date');
        if (dcDate) {
          const yMatch = dcDate.match(/(18\d{2}|19\d{2}|20\d{2})/);
          if (yMatch) {
            publicationYear = parseInt(yMatch[1], 10);
          }
        }

        // dc:language
        const dcLang = this.extractXmlTag(xmpXml, 'dc:language');
        if (dcLang) {
          language = dcLang;
        }

        // dc:subject (Tags)
        const dcSubjects = this.extractXmlTags(xmpXml, 'dc:subject');
        for (const s of dcSubjects) {
          if (!tags.includes(s)) tags.push(s);
        }

        // Identifiers (xmp:Identifier, MOBI-ASIN, ISBN, DOI)
        const asinMatch = xmpXml.match(/<xmpidq:Scheme>MOBI-ASIN<\/xmpidq:Scheme>[\s\S]*?<rdf:value>([^<]+)<\/rdf:value>/i);
        if (asinMatch) {
          identifiers['mobi-asin'] = asinMatch[1].trim();
        }

        const isbnMatch = xmpXml.match(/<(?:xmpidq:Scheme>ISBN<\/xmpidq:Scheme>[\s\S]*?<rdf:value>|prism:isbn>|pdfx:isbn>)([^<]+)/i);
        if (isbnMatch) {
          const cleanIsbn = isbnMatch[1].replace(/[-\s]/g, '').trim();
          if (isValidIsbn(cleanIsbn)) {
            isbn = cleanIsbn;
            identifiers['isbn'] = cleanIsbn;
          }
        }
      }
    } catch (err) {
      // Continue to cover extraction
    }

    // Step B2: Text ISBN Scan (Calibre Extract ISBN page budgeting)
    if (!isbn) {
      try {
        const scanned = await textIsbnScannerService.scanPdf(fileBuffer);
        if (scanned?.isbn) {
          isbn = scanned.isbn;
          identifiers['isbn'] = scanned.isbn;
          if (scanned.isbn10) identifiers['isbn10'] = scanned.isbn10;
          if (scanned.isbn13) identifiers['isbn13'] = scanned.isbn13;
        }
      } catch (scanErr) {
        console.warn(`[EbookMetadataExtractor] PDF ISBN scan warning for ${filePath}:`, scanErr);
      }
    }

    // Step C: Cover Image Extraction
    let coverBuffer: Buffer | undefined;
    let coverMimeType: string | undefined;
    try {
      const pdfCover = EmbeddedMetadataExtractor.extractFirstPdfImage(fileBuffer);
      if (pdfCover && pdfCover.coverBuffer) {
        coverBuffer = pdfCover.coverBuffer;
        coverMimeType = pdfCover.coverMimeType;
      }
    } catch {
      // fallback
    }

    // Step D: Reliable Content & Metadata Language Detection
    let detectedLanguage: string | undefined;
    const langDetect = languageDetectorService.detectLanguage({
      contentSample: parsedText,
      embeddedLanguage: language,
      title,
      description,
      author: authors[0],
      tags,
    });
    if (langDetect.isReliable) {
      detectedLanguage = langDetect.language;
    }

    return {
      title,
      authors,
      publisher,
      publicationYear,
      description,
      language: language || detectedLanguage,
      isbn,
      tags,
      coverBuffer,
      coverMimeType,
      identifiers,
      format: 'PDF',
    };
  }

  /**
   * Decompresses and extracts Adobe XMP XML packet from PDF buffer
   */
  private extractPdfXmpXml(buf: Buffer): string | null {
    const latinStr = buf.toString('latin1');

    // Method 1: Check for uncompressed XML packet
    const uncompressedStart = latinStr.indexOf('<x:xmpmeta');
    const uncompressedEnd = latinStr.indexOf('</x:xmpmeta>');
    if (uncompressedStart !== -1 && uncompressedEnd !== -1 && uncompressedEnd > uncompressedStart) {
      return latinStr.slice(uncompressedStart, uncompressedEnd + 12);
    }

    // Method 2: Locate /Metadata stream object and inflate
    const metaRefMatch = latinStr.match(/\/Metadata\s+(\d+)\s+(\d+)\s+R/);
    if (metaRefMatch) {
      const objDef = `${metaRefMatch[1]} ${metaRefMatch[2]} obj`;
      const objIdx = latinStr.indexOf(objDef);
      if (objIdx !== -1) {
        const streamWordIdx = latinStr.indexOf('stream', objIdx);
        if (streamWordIdx !== -1) {
          let dataStart = streamWordIdx + 6;
          if (buf[dataStart] === 13 && buf[dataStart + 1] === 10) dataStart += 2;
          else if (buf[dataStart] === 10 || buf[dataStart] === 13) dataStart += 1;

          const endStreamIdx = latinStr.indexOf('endstream', dataStart);
          if (endStreamIdx !== -1 && endStreamIdx > dataStart) {
            const streamSlice = buf.slice(dataStart, endStreamIdx);
            try {
              const decompressed = zlib.inflateSync(streamSlice);
              return decompressed.toString('utf8');
            } catch {
              // Might be uncompressed or different filter
              return streamSlice.toString('utf8');
            }
          }
        }
      }
    }

    return null;
  }

  /**
   * 2. EPUB Metadata Extraction via content.opf and container
   */
  private async extractFromEpub(filePath: string): Promise<Partial<ExtractedEbookMetadata>> {
    return new Promise((resolve) => {
      yauzl.open(filePath, { lazyEntries: true, autoClose: false }, (err: any, zipfile: any) => {
        if (err || !zipfile) {
          resolve({ format: 'EPUB' });
          return;
        }

        const entries: Record<string, any> = {};
        let opfPath: string | null = null;
        let opfDir = '';

        zipfile.readEntry();

        zipfile.on('entry', (entry: any) => {
          entries[entry.fileName] = entry;
          zipfile.readEntry();
        });

        zipfile.on('error', () => {
          try {
            zipfile.close();
          } catch {}
          resolve({ format: 'EPUB' });
        });

        zipfile.on('end', async () => {
          try {
            // Step A: Parse container.xml to find content.opf path
            if (entries['META-INF/container.xml']) {
              try {
                const containerBuf = await this.readZipEntryBuffer(zipfile, entries['META-INF/container.xml']);
                const xml = containerBuf.toString('utf8');
                const match = xml.match(/full-path="([^"]+)"/i);
                if (match) {
                  opfPath = match[1];
                  opfDir = path.posix.dirname(opfPath);
                  if (opfDir === '.') opfDir = '';
                }
              } catch {}
            }

            if (!opfPath) {
              opfPath = Object.keys(entries).find((k) => k.endsWith('.opf')) || null;
              if (opfPath) {
                opfDir = path.posix.dirname(opfPath);
                if (opfDir === '.') opfDir = '';
              }
            }

            if (!opfPath || !entries[opfPath]) {
              resolve({ format: 'EPUB' });
              return;
            }

            const opfBuf = await this.readZipEntryBuffer(zipfile, entries[opfPath]);
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

            const subjectMatches = [...opfXml.matchAll(/<dc:subject[^>]*>([^<]+)<\/dc:subject>/gi)];
            const tags = subjectMatches.map((m) => m[1].trim()).filter(Boolean);

            // Find ISBN in dc:identifier
            const idMatches = [...opfXml.matchAll(/<dc:identifier[^>]*>([^<]+)<\/dc:identifier>/gi)];
            let isbn: string | undefined;
            const identifiers: Record<string, string> = {};
            for (const idm of idMatches) {
              const clean = idm[1].replace(/urn:isbn:/i, '').replace(/[-\s]/g, '').trim();
              if (isValidIsbn(clean)) {
                isbn = clean;
                identifiers['isbn'] = clean;
                break;
              }
            }

            // Calibre Extract ISBN adaptation: If not found in dc:identifier, scan EPUB spine files
            if (!isbn) {
              try {
                const scanned = await textIsbnScannerService.scanEpub(filePath);
                if (scanned?.isbn) {
                  isbn = scanned.isbn;
                  identifiers['isbn'] = scanned.isbn;
                  if (scanned.isbn10) identifiers['isbn10'] = scanned.isbn10;
                  if (scanned.isbn13) identifiers['isbn13'] = scanned.isbn13;
                }
              } catch (scanErr) {
                console.warn(`[EbookMetadataExtractor] EPUB ISBN scan warning for ${filePath}:`, scanErr);
              }
            }

            // Cover Image resolution
            let coverBuffer: Buffer | undefined;
            let coverMimeType: string | undefined;

            let coverHref: string | null = null;
            const itemMatches = [...opfXml.matchAll(/<item\s+[^>]*href="([^"]+)"[^>]*>/gi)];
            for (const im of itemMatches) {
              const fullTag = im[0];
              const href = im[1];
              if (/properties="[^"]*cover-image[^"]*"/i.test(fullTag)) {
                coverHref = href;
                break;
              }
            }

            if (!coverHref) {
              const metaCover = opfXml.match(/<meta\s+name="cover"\s+content="([^"]+)"/i);
              if (metaCover) {
                const coverId = metaCover[1];
                const idTag = new RegExp(`<item\\s+[^>]*id="${coverId}"[^>]*href="([^"]+)"`, 'i').exec(opfXml);
                if (idTag) {
                  coverHref = idTag[1];
                }
              }
            }

            if (coverHref) {
              const resolvedCoverPath = opfDir ? path.posix.join(opfDir, coverHref) : coverHref;
              const coverEntry = entries[resolvedCoverPath] || entries[coverHref];
              if (coverEntry) {
                coverBuffer = await this.readZipEntryBuffer(zipfile, coverEntry);
                const coverExt = path.extname(resolvedCoverPath).toLowerCase();
                coverMimeType = coverExt === '.png' ? 'image/png' : 'image/jpeg';
              }
            }

            // Extract sample text from first XHTML/HTML document for content-based language detection
            let chapterText = '';
            const htmlEntry = Object.keys(entries).find((k) => k.endsWith('.xhtml') || k.endsWith('.html') || k.endsWith('.htm'));
            if (htmlEntry && entries[htmlEntry]) {
              try {
                const chapBuf = await this.readZipEntryBuffer(zipfile, entries[htmlEntry]);
                chapterText = chapBuf.toString('utf8').replace(/<[^>]+>/g, ' ').slice(0, 4000);
              } catch {}
            }

            const rawLang = language;
            const langDetect = languageDetectorService.detectLanguage({
              contentSample: chapterText,
              embeddedLanguage: rawLang,
              title,
              description,
              author: authors[0],
              tags,
            });
            const detectedLanguage = langDetect.isReliable ? langDetect.language : undefined;

            resolve({
              title,
              authors,
              publisher,
              publicationYear,
              description,
              language: rawLang || detectedLanguage,
              isbn,
              tags,
              coverBuffer,
              coverMimeType,
              identifiers,
              format: 'EPUB',
            });
          } catch (err) {
            resolve({ format: 'EPUB' });
          } finally {
            try {
              zipfile.close();
            } catch {}
          }
        });
      });
    });
  }

  /**
   * 3. MOBI & AZW3: PalmDOC Database & EXTH Records
   */
  private async extractFromMobiOrAzw(
    filePath: string,
    format: 'MOBI' | 'AZW3'
  ): Promise<Partial<ExtractedEbookMetadata>> {
    const buf = await fs.promises.readFile(filePath);
    if (buf.length < 68) return { format };

    // Palm title at bytes 0..31
    const palmTitle = buf.slice(0, 32).toString('latin1').replace(/\0.*$/g, '').trim();
    let title: string | undefined = palmTitle || undefined;
    let authors: string[] = [];
    let publisher: string | undefined;
    let description: string | undefined;
    let isbn: string | undefined;
    let publicationYear: number | undefined;

    // Record 0 offset is at byte 78 (uint32 BE)
    try {
      if (buf.length > 82) {
        const rec0Offset = buf.readUInt32BE(78);
        if (rec0Offset < buf.length - 16) {
          const rec0 = buf.slice(rec0Offset);
          // Check MOBI identifier at offset 16 of record 0
          if (rec0.length >= 20 && rec0.slice(16, 20).toString('latin1') === 'MOBI') {
            const headerLength = rec0.readUInt32BE(20);
            const exthFlags = rec0.readUInt32BE(128);

            // Check if EXTH header exists
            if (exthFlags & 0x40 && rec0.length > 16 + headerLength + 12) {
              const exthOffset = 16 + headerLength;
              if (rec0.slice(exthOffset, exthOffset + 4).toString('latin1') === 'EXTH') {
                const exthCount = rec0.readUInt32BE(exthOffset + 8);
                let currentPos = exthOffset + 12;

                for (let i = 0; i < exthCount && currentPos + 8 <= rec0.length; i++) {
                  const tagType = rec0.readUInt32BE(currentPos);
                  const tagLength = rec0.readUInt32BE(currentPos + 4);
                  if (tagLength < 8 || currentPos + tagLength > rec0.length) break;

                  const data = rec0.slice(currentPos + 8, currentPos + tagLength).toString('utf8').trim();

                  switch (tagType) {
                    case 100: // Author
                      if (data) authors.push(data);
                      break;
                    case 101: // Publisher
                      if (data) publisher = data;
                      break;
                    case 103: // Description
                      if (data) description = data;
                      break;
                    case 104: // ISBN
                      if (data && isValidIsbn(data.replace(/[-\s]/g, ''))) {
                        isbn = data.replace(/[-\s]/g, '');
                      }
                      break;
                    case 106: // Publication Date
                      const yMatch = data.match(/(18\d{2}|19\d{2}|20\d{2})/);
                      if (yMatch) publicationYear = parseInt(yMatch[1], 10);
                      break;
                    case 503: // Updated Title
                      if (data) title = data;
                      break;
                  }

                  currentPos += tagLength;
                }
              }
            }
          }
        }
      }
    } catch {
      // Return whatever was read from Palm header
    }

    return {
      title,
      authors,
      publisher,
      description,
      isbn,
      publicationYear,
      format,
    };
  }

  /**
   * 4. HTML Extraction
   */
  private async extractFromHtml(filePath: string): Promise<Partial<ExtractedEbookMetadata>> {
    const text = await fs.promises.readFile(filePath, 'utf8');

    const titleMatch = text.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : undefined;

    const authorMatch = text.match(/<meta\s+name=["']author["']\s+content=["']([^"']+)["']/i);
    const authors = authorMatch ? FilenameParser.splitMultiAuthors(authorMatch[1]) : [];

    const descMatch = text.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i);
    const description = descMatch ? descMatch[1].trim() : undefined;

    const kwMatch = text.match(/<meta\s+name=["']keywords["']\s+content=["']([^"']+)["']/i);
    const tags = kwMatch ? kwMatch[1].split(/[,;]/).map((k) => k.trim()).filter(Boolean) : [];

    // Check html lang attribute or meta content-language
    const langAttrMatch =
      text.match(/<html[^>]*\blang=["']([^"']+)["']/i) ||
      text.match(/<meta\s+http-equiv=["']content-language["']\s+content=["']([^"']+)["']/i);
    const embeddedLang = langAttrMatch ? langAttrMatch[1].trim() : undefined;

    // Extract text content sample (strip HTML tags)
    const textSample = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 4000);

    const langDetect = languageDetectorService.detectLanguage({
      contentSample: textSample,
      embeddedLanguage: embeddedLang,
      title,
      description,
      author: authors[0],
      tags,
    });
    const detectedLanguage = langDetect.isReliable ? langDetect.language : undefined;

    let isbn: string | undefined;
    const identifiers: Record<string, string> = {};
    try {
      const scanned = await textIsbnScannerService.scanFile(filePath);
      if (scanned?.isbn) {
        isbn = scanned.isbn;
        identifiers['isbn'] = scanned.isbn;
        if (scanned.isbn10) identifiers['isbn10'] = scanned.isbn10;
        if (scanned.isbn13) identifiers['isbn13'] = scanned.isbn13;
      }
    } catch {}

    return {
      title,
      authors,
      description,
      language: detectedLanguage,
      tags,
      isbn,
      identifiers,
      format: 'HTML',
    };
  }

  /**
   * 5. Plain Text (.txt)
   */
  private async extractFromTxt(filePath: string): Promise<Partial<ExtractedEbookMetadata>> {
    let contentSample = '';
    try {
      const buffer = Buffer.alloc(4096);
      const fd = await fs.promises.open(filePath, 'r');
      const { bytesRead } = await fd.read(buffer, 0, 4096, 0);
      await fd.close();
      contentSample = buffer.slice(0, bytesRead).toString('utf8');
    } catch {
      try {
        contentSample = await fs.promises.readFile(filePath, 'utf8');
      } catch {}
    }

    const langDetect = languageDetectorService.detectLanguage({
      contentSample,
    });

    let isbn: string | undefined;
    const identifiers: Record<string, string> = {};
    try {
      const scanned = await textIsbnScannerService.scanFile(filePath);
      if (scanned?.isbn) {
        isbn = scanned.isbn;
        identifiers['isbn'] = scanned.isbn;
        if (scanned.isbn10) identifiers['isbn10'] = scanned.isbn10;
        if (scanned.isbn13) identifiers['isbn13'] = scanned.isbn13;
      }
    } catch {}

    return {
      language: langDetect.isReliable ? langDetect.language : undefined,
      isbn,
      identifiers,
      format: 'TXT',
    };
  }

  /**
   * Smart Merge and Graceful Basename Fallback
   */
  private applyFallbacks(
    filePath: string,
    format: DigitalFormat,
    meta: Partial<ExtractedEbookMetadata>
  ): ExtractedEbookMetadata {
    const parsedFilename = FilenameParser.parse(filePath);

    // Title Resolution: Embedded > FilenameParser > Clean Basename
    let finalTitle = meta.title?.trim();
    if (!finalTitle || this.isPlaceholderTitle(finalTitle)) {
      finalTitle = parsedFilename.title?.trim();
    }
    if (!finalTitle) {
      finalTitle = parsedFilename.cleanedFilename || path.basename(filePath, path.extname(filePath));
    }

    // Authors Resolution: Valid Embedded > Valid FilenameParser > Localized Fallback ('غير معروف' for Arabic, 'Unknown Author' for English)
    const validMetaAuthors = (meta.authors || []).filter((a) => !isPlaceholderAuthor(a));
    const validFilenameAuthors = (parsedFilename.authors || []).filter((a) => !isPlaceholderAuthor(a));

    const isArabic =
      (meta.language && (meta.language.toLowerCase().startsWith('ar') || meta.language === 'العربية')) ||
      parsedFilename.language === 'ar' ||
      /[\u0600-\u06FF]/.test(finalTitle);

    const defaultUnknownAuthor = isArabic ? 'غير معروف' : 'Unknown Author';

    let finalAuthors: string[];
    if (validMetaAuthors.length > 0) {
      finalAuthors = validMetaAuthors;
    } else if (validFilenameAuthors.length > 0) {
      finalAuthors = validFilenameAuthors;
    } else {
      finalAuthors = [defaultUnknownAuthor];
    }

    // Supplementary bibliographic attributes
    const finalPublisher = meta.publisher || parsedFilename.publisher;
    const finalYear = meta.publicationYear || parsedFilename.publicationYear;
    const finalIsbn = meta.isbn || parsedFilename.isbn;
    const finalDescription = meta.description || undefined;

    // Language Resolution: Content/Embedded > Reliable Filename/Metadata Detection > Undefined
    let finalLanguage: string | undefined = meta.language;
    if (!finalLanguage && parsedFilename.language) {
      const norm = languageDetectorService.normalizeLanguageCode(parsedFilename.language);
      if (norm) {
        finalLanguage = norm.name;
      }
    }
    if (!finalLanguage) {
      const detectResult = languageDetectorService.detectLanguage({
        title: finalTitle,
        description: finalDescription,
        author: finalAuthors[0],
        tags: meta.tags,
      });
      if (detectResult.isReliable) {
        finalLanguage = detectResult.language;
      }
    }

    // Generate Cover Data URL if cover buffer is present
    let coverDataUrl: string | undefined;
    if (meta.coverBuffer && meta.coverBuffer.length >= 100) {
      const mime = meta.coverMimeType || 'image/jpeg';
      coverDataUrl = `data:${mime};base64,${meta.coverBuffer.toString('base64')}`;
    }

    return {
      title: finalTitle,
      authors: finalAuthors,
      publisher: finalPublisher,
      publicationYear: finalYear,
      isbn: finalIsbn,
      description: finalDescription,
      language: finalLanguage,
      tags: meta.tags || [],
      coverBuffer: meta.coverBuffer,
      coverMimeType: meta.coverMimeType,
      coverDataUrl,
      identifiers: meta.identifiers || {},
      format,
    };
  }

  /**
   * Helper to detect generic/placeholder titles
   */
  private isPlaceholderTitle(title: string): boolean {
    return isPlaceholderTitle(title);
  }

  /**
   * Helper to read zip entry buffer asynchronously
   */
  private readZipEntryBuffer(zipfile: any, entry: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      zipfile.openReadStream(entry, (err: any, readStream: any) => {
        if (err || !readStream) return reject(err);
        const chunks: Buffer[] = [];
        readStream.on('data', (c: Buffer) => chunks.push(c));
        readStream.on('end', () => resolve(Buffer.concat(chunks)));
        readStream.on('error', reject);
      });
    });
  }

  /**
   * XML Tag Extraction Helper
   */
  private extractXmlTag(xml: string, tag: string): string | undefined {
    const pat = new RegExp(`<${tag}[^>]*>(?:<rdf:li[^>]*>)?([\\s\\S]*?)(?:<\\/rdf:li>)?<\\/${tag}>`, 'i');
    const m = xml.match(pat);
    return m ? m[1].replace(/<[^>]+>/g, '').trim() : undefined;
  }

  private extractXmlTags(xml: string, tag: string): string[] {
    const pat = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
    const results: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = pat.exec(xml)) !== null) {
      const liMatches = [...match[1].matchAll(/<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/gi)];
      if (liMatches.length > 0) {
        for (const lm of liMatches) {
          const val = lm[1].replace(/<[^>]+>/g, '').trim();
          if (val && !results.includes(val)) results.push(val);
        }
      } else {
        const val = match[1].replace(/<[^>]+>/g, '').trim();
        if (val && !results.includes(val)) results.push(val);
      }
    }

    return results;
  }
}
