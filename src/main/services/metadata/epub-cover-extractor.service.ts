/**
 * Baglib — Robust 5-Tier EPUB Cover Extraction Engine
 *
 * Implements a resilient, end-to-end extraction engine that reliably captures
 * book covers across EPUB 2, EPUB 3, Calibre, Kotobee, Hindawi, and Arabic EPUBs.
 *
 * Pitfalls resolved:
 * 1. Broken Relative Path Resolution: All <item href> paths are joined with the OPF directory.
 * 2. URL-Encoded Paths & Case Sensitivity: Resolves percent-encoded characters and case differences.
 * 3. SVG/XHTML Cover Wrappers: Parses <svg><image xlink:href="..."/></svg> and <img> inside cover XHTML files,
 *    resolving relative to the XHTML document's own directory.
 * 4. Electron File Protocol Blocking: Produces clean Data URLs and saves to userData/covers.
 */

import yauzl from 'yauzl';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import { app } from 'electron';

export interface ExtractedEpubCoverResult {
  success: boolean;
  coverBuffer?: Buffer;
  coverMimeType?: string;
  dataUrl?: string;
  savedFilePath?: string;
  tierUsed?: 1 | 2 | 3 | 4 | 5;
  resolvedEntryPath?: string;
  byteSize?: number;
  error?: string;
}

interface ManifestItem {
  tag: string;
  id?: string;
  href?: string;
  mediaType?: string;
  properties?: string;
}

export class EpubCoverExtractor {
  /**
   * Helper: Parse XML tag attributes safely regardless of ordering, casing, or quoting style.
   */
  public static parseXmlAttributes(tagStr: string): Record<string, string> {
    const attrs: Record<string, string> = {};
    const attrRegex = /([a-zA-Z0-9:_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
    let match: RegExpExecArray | null;
    while ((match = attrRegex.exec(tagStr)) !== null) {
      const key = match[1].toLowerCase();
      const val = match[2] ?? match[3] ?? match[4] ?? '';
      attrs[key] = val;
    }
    return attrs;
  }

  /**
   * Helper: Resolves any href inside the EPUB ZIP archive:
   * - Strips URL hash fragments (#...) and query parameters (?...)
   * - Runs decodeURIComponent(href)
   * - Joins baseDir with href using POSIX path normalization, stripping leading slashes
   * - Matches against entries exactly, case-insensitively, and by basename fallback
   */
  public static resolveZipEntry(
    entries: Record<string, yauzl.Entry>,
    baseDir: string,
    rawHref: string
  ): yauzl.Entry | null {
    if (!rawHref) return null;

    // 1. Strip URL hash fragments and query strings
    let href = rawHref.split('#')[0].split('?')[0].trim();
    if (!href) return null;

    // 2. Decode URL encoding (e.g. %20, Arabic percent-encoded characters)
    try {
      href = decodeURIComponent(href);
    } catch {
      // Keep as-is if malformed percent sequence
    }

    // 3. POSIX path normalization
    href = href.replace(/^\/+/g, '');
    const targetPath = baseDir ? path.posix.join(baseDir, href) : href;
    const cleanPath = path.posix.normalize(targetPath).replace(/^\/+/g, '');

    // A. Exact match on normalized path
    if (entries[cleanPath]) return entries[cleanPath];

    // B. Exact match on raw href (in case baseDir was omitted in manifest)
    if (entries[href]) return entries[href];

    // C. Case-insensitive lookup against normalized path
    const lowerClean = cleanPath.toLowerCase();
    for (const [key, entry] of Object.entries(entries)) {
      if (key.toLowerCase() === lowerClean) return entry;
    }

    // D. Case-insensitive lookup against raw href
    const lowerHref = href.toLowerCase();
    for (const [key, entry] of Object.entries(entries)) {
      if (key.toLowerCase() === lowerHref) return entry;
    }

    // E. Basename match fallback if directory depth differed
    const targetBase = path.posix.basename(cleanPath).toLowerCase();
    for (const [key, entry] of Object.entries(entries)) {
      if (path.posix.basename(key).toLowerCase() === targetBase) return entry;
    }

    return null;
  }

  /**
   * Helper: Asynchronously read a zip entry into a Buffer
   */
  public static readZipEntry(zipfile: yauzl.ZipFile, entry: yauzl.Entry): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      zipfile.openReadStream(entry, (err, stream) => {
        if (err || !stream) return reject(err || new Error(`Failed to open stream for ${entry.fileName}`));
        const chunks: Buffer[] = [];
        stream.on('data', (c: Buffer) => chunks.push(c));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
      });
    });
  }

  /**
   * Helper: Extract image href from HTML/XHTML/SVG content
   */
  public static extractImageHrefFromHtml(htmlStr: string): string | null {
    // 1. SVG <image> or <svg:image> tag (Calibre, Hindawi, Kotobee wrappers)
    const svgImgRegex = /<(?:[a-zA-Z0-9]+:)?image\b[^>]*>/gi;
    let svgMatch: RegExpExecArray | null;
    while ((svgMatch = svgImgRegex.exec(htmlStr)) !== null) {
      const attrs = this.parseXmlAttributes(svgMatch[0]);
      const href = attrs['xlink:href'] || attrs['href'] || attrs['src'];
      if (href) return href;
    }

    // 2. Standard <img> tag
    const imgRegex = /<img\b[^>]*>/gi;
    let imgMatch: RegExpExecArray | null;
    while ((imgMatch = imgRegex.exec(htmlStr)) !== null) {
      const attrs = this.parseXmlAttributes(imgMatch[0]);
      if (attrs['src']) return attrs['src'];
    }

    // 3. CSS background-image: url(...)
    const cssBgMatch = htmlStr.match(/background(?:-image)?\s*:\s*url\(\s*['"]?([^'")]+)['"]?\s*\)/i);
    if (cssBgMatch && cssBgMatch[1]) {
      return cssBgMatch[1].trim();
    }

    return null;
  }

  /**
   * Determine MIME type from file extension or buffer magic bytes
   */
  public static detectImageMimeType(fileName: string, buffer?: Buffer): string {
    const ext = path.extname(fileName).toLowerCase();
    if (ext === '.png') return 'image/png';
    if (ext === '.webp') return 'image/webp';
    if (ext === '.gif') return 'image/gif';
    if (ext === '.svg') return 'image/svg+xml';
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';

    if (buffer && buffer.length >= 4) {
      if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png';
      if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg';
      if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return 'image/gif';
      if (buffer.slice(0, 4).toString('ascii') === 'RIFF') return 'image/webp';
    }

    return 'image/jpeg';
  }

  /**
   * Persist cover buffer to userData/covers directory (with graceful test fallback)
   */
  public static persistCoverBuffer(buffer: Buffer, mimeType: string): string | undefined {
    try {
      let baseDir: string;
      if (typeof app?.getPath === 'function') {
        try {
          baseDir = app.getPath('userData');
        } catch {
          baseDir = path.join(os.tmpdir(), 'baglib-userdata');
        }
      } else {
        baseDir = path.join(os.tmpdir(), 'baglib-userdata');
      }

      const coversDir = path.join(baseDir, 'covers');
      if (!fs.existsSync(coversDir)) {
        fs.mkdirSync(coversDir, { recursive: true });
      }

      const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 16);
      const ext = mimeType === 'image/png' ? '.png' : mimeType === 'image/webp' ? '.webp' : mimeType === 'image/gif' ? '.gif' : '.jpg';
      const targetPath = path.join(coversDir, `${hash}${ext}`);

      if (!fs.existsSync(targetPath)) {
        fs.writeFileSync(targetPath, buffer);
      }
      return targetPath;
    } catch {
      return undefined;
    }
  }

  /**
   * Primary entry point: Extracts cover image from EPUB file path using the 5-Tier Engine
   */
  public static async extractCover(filePath: string): Promise<ExtractedEpubCoverResult> {
    return new Promise((resolve) => {
      // CRITICAL: autoClose MUST be false so yauzl does not close fd on 'end'
      yauzl.open(filePath, { lazyEntries: true, autoClose: false }, async (err, zipfile) => {
        if (err || !zipfile) {
          return resolve({
            success: false,
            error: err?.message || `Failed to open EPUB archive: ${filePath}`,
          });
        }

        try {
          const result = await this.extractCoverFromZip(zipfile);
          resolve(result);
        } catch (execErr: any) {
          resolve({
            success: false,
            error: execErr?.message || 'Unexpected EPUB cover extraction failure',
          });
        } finally {
          try {
            zipfile.close();
          } catch {}
        }
      });
    });
  }

  /**
   * Primary entry point for In-Memory EPUB buffers
   */
  public static async extractCoverFromBuffer(buffer: Buffer): Promise<ExtractedEpubCoverResult> {
    return new Promise((resolve) => {
      yauzl.fromBuffer(buffer, { lazyEntries: true, autoClose: false }, async (err, zipfile) => {
        if (err || !zipfile) {
          return resolve({
            success: false,
            error: err?.message || 'Failed to read EPUB from buffer',
          });
        }

        try {
          const result = await this.extractCoverFromZip(zipfile);
          resolve(result);
        } catch (execErr: any) {
          resolve({
            success: false,
            error: execErr?.message || 'Unexpected EPUB buffer extraction failure',
          });
        } finally {
          try {
            zipfile.close();
          } catch {}
        }
      });
    });
  }

  /**
   * Internal core 5-Tier Cover Extraction on an open yauzl ZipFile
   */
  private static async extractCoverFromZip(zipfile: yauzl.ZipFile): Promise<ExtractedEpubCoverResult> {
    return new Promise((resolve) => {
      const entries: Record<string, yauzl.Entry> = {};

      zipfile.readEntry();

      zipfile.on('entry', (entry: yauzl.Entry) => {
        entries[entry.fileName] = entry;
        zipfile.readEntry();
      });

      zipfile.on('end', async () => {
        try {
          // -----------------------------------------------------------------
          // Step 1: Locate OPF package file via META-INF/container.xml
          // -----------------------------------------------------------------
          let opfPath: string | null = null;
          let opfDir = '';

          const containerEntry = this.resolveZipEntry(entries, '', 'META-INF/container.xml');
          if (containerEntry) {
            try {
              const cBuf = await this.readZipEntry(zipfile, containerEntry);
              const m = cBuf.toString('utf8').match(/full-path="([^"]+)"/i);
              if (m) {
                opfPath = m[1].trim();
                opfDir = path.posix.dirname(opfPath);
                if (opfDir === '.') opfDir = '';
              }
            } catch {}
          }

          if (!opfPath) {
            opfPath = Object.keys(entries).find((k) => k.toLowerCase().endsWith('.opf')) || null;
            if (opfPath) {
              opfDir = path.posix.dirname(opfPath);
              if (opfDir === '.') opfDir = '';
            }
          }

          if (!opfPath) {
            // If no OPF exists, jump straight to Tier 4 (Filename heuristics)
            return resolve(await this.executeTier4And5(zipfile, entries, opfDir, ''));
          }

          const opfEntry = this.resolveZipEntry(entries, '', opfPath);
          if (!opfEntry) {
            return resolve(await this.executeTier4And5(zipfile, entries, opfDir, ''));
          }

          const opfBuf = await this.readZipEntry(zipfile, opfEntry);
          const opfXml = opfBuf.toString('utf8');

          // Parse all manifest items
          const manifestItems: ManifestItem[] = [];
          const itemTagRegex = /<(?:[a-zA-Z0-9]+:)?item\b[^>]*>/gi;
          let itemMatch: RegExpExecArray | null;
          while ((itemMatch = itemTagRegex.exec(opfXml)) !== null) {
            const attrs = this.parseXmlAttributes(itemMatch[0]);
            manifestItems.push({
              tag: itemMatch[0],
              id: attrs['id'],
              href: attrs['href'],
              mediaType: attrs['media-type'],
              properties: attrs['properties'] || '',
            });
          }

          // -----------------------------------------------------------------
          // TIER 1: EPUB 3 Manifest Property (properties="cover-image")
          // -----------------------------------------------------------------
          for (const it of manifestItems) {
            const props = (it.properties || '').split(/\s+/);
            if (props.includes('cover-image') && it.href) {
              const resolved = this.resolveZipEntry(entries, opfDir, it.href);
              if (resolved) {
                const buf = await this.readZipEntry(zipfile, resolved);
                if (buf && buf.length > 0) {
                  return resolve(this.formatSuccessResult(buf, resolved.fileName, 1));
                }
              }
            }
          }

          // -----------------------------------------------------------------
          // TIER 2: EPUB 2 <meta name="cover" content="{coverId}">
          // -----------------------------------------------------------------
          const metaTags = [...opfXml.matchAll(/<(?:[a-zA-Z0-9]+:)?meta\b[^>]*>/gi)];
          let coverId: string | null = null;
          for (const m of metaTags) {
            const attrs = this.parseXmlAttributes(m[0]);
            if (attrs['name'] === 'cover' && attrs['content']) {
              coverId = attrs['content'];
              break;
            }
            if (attrs['content'] === 'cover' && attrs['name']) {
              coverId = attrs['name'];
              break;
            }
          }

          if (coverId) {
            const item = manifestItems.find((it) => it.id === coverId);
            if (item && item.href) {
              const isImage =
                (item.mediaType && item.mediaType.startsWith('image/')) ||
                /\.(jpe?g|png|webp|gif)$/i.test(item.href);
              const isHtml =
                (item.mediaType && /xhtml|html/i.test(item.mediaType)) ||
                /\.(x?html?)$/i.test(item.href);

              if (isImage) {
                // Case A: Item points directly to an image file
                const resolved = this.resolveZipEntry(entries, opfDir, item.href);
                if (resolved) {
                  const buf = await this.readZipEntry(zipfile, resolved);
                  if (buf && buf.length > 0) {
                    return resolve(this.formatSuccessResult(buf, resolved.fileName, 2));
                  }
                }
              } else if (isHtml) {
                // Case B: Item points to a cover XHTML/HTML document -> inspect it
                const resolvedXhtml = this.resolveZipEntry(entries, opfDir, item.href);
                if (resolvedXhtml) {
                  const xhtmlBuf = await this.readZipEntry(zipfile, resolvedXhtml);
                  const imgHref = this.extractImageHrefFromHtml(xhtmlBuf.toString('utf8'));
                  if (imgHref) {
                    const xhtmlDir = path.posix.dirname(resolvedXhtml.fileName);
                    const resolvedImg = this.resolveZipEntry(entries, xhtmlDir, imgHref);
                    if (resolvedImg) {
                      const buf = await this.readZipEntry(zipfile, resolvedImg);
                      if (buf && buf.length > 0) {
                        return resolve(this.formatSuccessResult(buf, resolvedImg.fileName, 3));
                      }
                    }
                  }
                }
              }
            } else {
              // Case C: coverId itself is directly a path to an image in the ZIP
              const directImg = this.resolveZipEntry(entries, opfDir, coverId);
              if (directImg) {
                const buf = await this.readZipEntry(zipfile, directImg);
                if (buf && buf.length > 0) {
                  return resolve(this.formatSuccessResult(buf, directImg.fileName, 2));
                }
              }
            }
          }

          // -----------------------------------------------------------------
          // TIER 3: <guide> & First Spine XHTML / SVG Inspection
          // -----------------------------------------------------------------
          const candidateXhtmlHrefs: string[] = [];

          // 1. Guide reference type="cover"
          const guideMatches = [...opfXml.matchAll(/<(?:[a-zA-Z0-9]+:)?reference\b[^>]*>/gi)];
          for (const gm of guideMatches) {
            const attrs = this.parseXmlAttributes(gm[0]);
            if (attrs['type'] === 'cover' && attrs['href']) {
              candidateXhtmlHrefs.push(attrs['href']);
            }
          }

          // 2. Manifest items whose id or href matches cover with html/xhtml media-type
          for (const it of manifestItems) {
            if (
              it.href &&
              (/\bcover\b/i.test(it.id || '') || /\bcover\b/i.test(it.href)) &&
              (it.mediaType && /xhtml|html/i.test(it.mediaType))
            ) {
              candidateXhtmlHrefs.push(it.href);
            }
          }

          for (const xHref of candidateXhtmlHrefs) {
            const resolvedXhtml = this.resolveZipEntry(entries, opfDir, xHref);
            if (resolvedXhtml) {
              const xBuf = await this.readZipEntry(zipfile, resolvedXhtml);
              const imgHref = this.extractImageHrefFromHtml(xBuf.toString('utf8'));
              if (imgHref) {
                const xDir = path.posix.dirname(resolvedXhtml.fileName);
                const resolvedImg = this.resolveZipEntry(entries, xDir, imgHref);
                if (resolvedImg) {
                  const buf = await this.readZipEntry(zipfile, resolvedImg);
                  if (buf && buf.length > 0) {
                    return resolve(this.formatSuccessResult(buf, resolvedImg.fileName, 3));
                  }
                }
              }
            }
          }

          // If Tiers 1-3 yield nothing, execute Tiers 4 & 5
          const fallbackRes = await this.executeTier4And5(zipfile, entries, opfDir, opfXml, manifestItems);
          resolve(fallbackRes);
        } catch (zipErr: any) {
          resolve({
            success: false,
            error: zipErr?.message || 'Error parsing EPUB structure',
          });
        }
      });
    });
  }

  /**
   * Helper: Executes Tier 4 (Filename Heuristics) and Tier 5 (Spine image > 5KB fallback)
   */
  private static async executeTier4And5(
    zipfile: yauzl.ZipFile,
    entries: Record<string, yauzl.Entry>,
    opfDir: string,
    opfXml: string,
    manifestItems: ManifestItem[] = []
  ): Promise<ExtractedEpubCoverResult> {
    const imageEntries = Object.values(entries).filter((e) =>
      /\.(jpe?g|png|webp|gif)$/i.test(e.fileName)
    );

    // -----------------------------------------------------------------
    // TIER 4: ZIP Archive Filename Heuristics
    // -----------------------------------------------------------------
    const scoreEntry = (e: yauzl.Entry): number => {
      const base = path.posix.basename(e.fileName, path.posix.extname(e.fileName)).toLowerCase();
      const full = e.fileName.toLowerCase();

      // Highest: direct cover or Arabic غلاف
      if (base === 'cover' || base === 'front' || base === 'غلاف' || base === 'غلاف_الكتاب') return 100;
      if (/^(?:cover|front|غلاف)[_\-]/i.test(base)) return 90;
      if (/cover|front|غلاف/i.test(base)) return 80;
      if (/titlepage|title_page|title-page/i.test(base)) return 75;
      if (/title/i.test(base)) return 70;
      if (/\/covers?\//i.test(full) || /\/images\/cover/i.test(full)) return 60;
      return 0;
    };

    const scored = imageEntries
      .map((e) => ({ entry: e, score: scoreEntry(e) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);

    if (scored.length > 0) {
      const topEntry = scored[0].entry;
      const buf = await this.readZipEntry(zipfile, topEntry);
      if (buf && buf.length > 100) {
        return this.formatSuccessResult(buf, topEntry.fileName, 4);
      }
    }

    // -----------------------------------------------------------------
    // TIER 5: First Valid Image Fallback (> 5 KB)
    // -----------------------------------------------------------------
    if (opfXml) {
      const spineItemrefs = [...opfXml.matchAll(/<(?:[a-zA-Z0-9]+:)?itemref\b[^>]*>/gi)].slice(0, 2);
      for (const sir of spineItemrefs) {
        const attrs = this.parseXmlAttributes(sir[0]);
        const idref = attrs['idref'];
        if (idref) {
          const spineIt = manifestItems.find((it) => it.id === idref);
          if (spineIt && spineIt.href) {
            const resolvedX = this.resolveZipEntry(entries, opfDir, spineIt.href);
            if (resolvedX) {
              const xBuf = await this.readZipEntry(zipfile, resolvedX);
              const xStr = xBuf.toString('utf8');
              const imgTags = [...xStr.matchAll(/<img\b[^>]*>|<(?:[a-zA-Z0-9]+:)?image\b[^>]*>/gi)];
              for (const itag of imgTags) {
                const iattrs = this.parseXmlAttributes(itag[0]);
                const ihref = iattrs['src'] || iattrs['xlink:href'] || iattrs['href'];
                if (ihref) {
                  const xDir = path.posix.dirname(resolvedX.fileName);
                  const rImg = this.resolveZipEntry(entries, xDir, ihref);
                  if (rImg && (rImg.uncompressedSize || 0) > 5120) {
                    const buf = await this.readZipEntry(zipfile, rImg);
                    if (buf && buf.length > 5120) {
                      return this.formatSuccessResult(buf, rImg.fileName, 5);
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    // Global image > 5 KB fallback
    const largeImages = imageEntries
      .filter((e) => (e.uncompressedSize || 0) > 5120)
      .sort((a, b) => (b.uncompressedSize || 0) - (a.uncompressedSize || 0));

    if (largeImages.length > 0) {
      const buf = await this.readZipEntry(zipfile, largeImages[0]);
      if (buf && buf.length > 5120) {
        return this.formatSuccessResult(buf, largeImages[0].fileName, 5);
      }
    }

    return {
      success: false,
      error: 'No cover image could be extracted across all 5 tiers',
    };
  }

  /**
   * Helper: Formats a successful extraction result with Data URL and persistent disk storage
   */
  private static formatSuccessResult(
    buffer: Buffer,
    entryFileName: string,
    tier: 1 | 2 | 3 | 4 | 5
  ): ExtractedEpubCoverResult {
    const mimeType = this.detectImageMimeType(entryFileName, buffer);
    const dataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;
    const savedFilePath = this.persistCoverBuffer(buffer, mimeType);

    return {
      success: true,
      coverBuffer: buffer,
      coverMimeType: mimeType,
      dataUrl,
      savedFilePath,
      tierUsed: tier,
      resolvedEntryPath: entryFileName,
      byteSize: buffer.length,
    };
  }
}
