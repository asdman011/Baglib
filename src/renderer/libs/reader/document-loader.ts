import * as fflate from 'fflate';
import type { BookDoc, BookFormat, DocumentLoaderOptions, SectionItem, TOCItem, BookMetadata } from './types';
import { getDirFromLanguage, getReaderStyles, transformClassicalGlosses } from './typography';
import { highlightCodeBlocks, getSyntaxHighlightStyles } from './syntax-highlight';
import { makeArchiveBookDoc } from './archive-stream';

// In-flight concurrent decompression deduplication map
// Collapses duplicate loadText() & createDocument() calls during spine & CFI navigation indexing.
export const inflightMap = new Map<string, Promise<string | null>>();

export const dedupedZipLoadText = (
  zipLoadText: (name: string) => Promise<string | null>,
  name: string
): Promise<string | null> => {
  const existing = inflightMap.get(name);
  if (existing) return existing;

  const promise = Promise.resolve(zipLoadText(name)).finally(() => {
    if (inflightMap.get(name) === wrapped) inflightMap.delete(name);
  });
  const wrapped = promise;
  inflightMap.set(name, wrapped);
  return wrapped;
};

/**
 * Detects format of document based on file extension, MIME type, or leading magic bytes.
 */
export function detectFormat(filename: string, bytes?: Uint8Array, mimeType?: string): BookFormat {
  const ext = filename.split('.').pop()?.toLowerCase() || '';

  if (ext === 'epub') return 'EPUB';
  if (ext === 'pdf') return 'PDF';
  if (ext === 'mobi') return 'MOBI';
  if (ext === 'azw3') return 'AZW3';
  if (ext === 'azw') return 'AZW';
  if (ext === 'fb2') return 'FB2';
  if (ext === 'fbz' || filename.endsWith('.fb2.zip')) return 'FBZ';
  if (ext === 'cbz') return 'CBZ';
  if (ext === 'cbr') return 'CBR';
  if (ext === 'cbt') return 'CBT';
  if (ext === 'cb7') return 'CB7';
  if (ext === 'txt') return 'TXT';
  if (ext === 'md' || ext === 'markdown') return 'MD';
  if (ext === 'docx') return 'DOCX';
  if (ext === 'html' || ext === 'htm' || ext === 'xhtml' || ext === 'xml' || ext === 'mhtml') return 'HTML';

  // Magic bytes inspection if extension is generic
  if (bytes && bytes.length >= 4) {
    // PDF: %PDF-
    if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
      return 'PDF';
    }
    // Zip: PK\x03\x04
    if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
      return 'EPUB';
    }
    // MOBI/Palmdoc: offset 60-68 holds "BOOKMOBI"
    if (bytes.length >= 68) {
      const palmMagic = String.fromCharCode(...bytes.slice(60, 68));
      if (palmMagic === 'BOOKMOBI') return 'MOBI';
    }
  }

  return 'EPUB';
}

export class DocumentLoader {
  private file: File | Uint8Array;
  private filename: string;
  private options: DocumentLoaderOptions;

  constructor(file: File | Uint8Array, filename: string, options: DocumentLoaderOptions = {}) {
    this.file = file;
    this.filename = filename;
    this.options = options;
  }

  private async getBytes(): Promise<Uint8Array> {
    if (this.file instanceof Uint8Array) return this.file;
    return new Uint8Array(await this.file.arrayBuffer());
  }

  public async open(): Promise<{ book: BookDoc; format: BookFormat }> {
    const bytes = await this.getBytes();
    const format = detectFormat(this.filename, bytes);

    let book: BookDoc;

    switch (format) {
      case 'CBZ':
      case 'CBR':
      case 'CBT':
      case 'CB7': {
        book = await makeArchiveBookDoc(bytes, { filename: this.filename });
        break;
      }
      case 'PDF': {
        book = await this.makePDFBook(bytes);
        break;
      }
      case 'TXT': {
        book = await this.makeTextBook(bytes, false);
        break;
      }
      case 'MD': {
        book = await this.makeTextBook(bytes, true);
        break;
      }
      case 'DOCX': {
        book = await this.makeDocxBook(bytes);
        break;
      }
      case 'HTML': {
        book = await this.makeHtmlBook(bytes);
        break;
      }
      case 'MOBI':
      case 'AZW':
      case 'AZW3': {
        book = await this.makeMobiBook(bytes);
        break;
      }
      case 'FB2':
      case 'FBZ': {
        book = await this.makeFb2Book(bytes);
        break;
      }
      case 'EPUB':
      default: {
        book = await this.makeEpubBook(bytes);
        break;
      }
    }

    // Auto-detect reading direction from metadata or chapter text
    const sampleText = book.sections[0]?.loadText ? await book.sections[0].loadText() : '';
    book.dir = getDirFromLanguage(book.metadata.language || this.options.languageHint, sampleText);

    return { book, format };
  }

  /**
   * EPUB Loader with in-flight zip deduplication and container/OPF/NCX prefetch cache
   */
  private async makeEpubBook(bytes: Uint8Array): Promise<BookDoc> {
    // Unzip archive using fflate
    const unzipped = fflate.unzipSync(bytes);
    const entryMap = new Map<string, Uint8Array>();
    const textCache = new Map<string, string>();

    for (const [name, u8] of Object.entries(unzipped)) {
      entryMap.set(name, u8);
      // Pre-fetch critical container files into in-memory text cache
      const lower = name.toLowerCase();
      if (
        lower.endsWith('container.xml') ||
        lower.endsWith('.opf') ||
        lower.endsWith('.ncx') ||
        lower.endsWith('nav.xhtml')
      ) {
        textCache.set(name, fflate.strFromU8(u8));
      }
    }

    const zipLoadText = async (name: string): Promise<string | null> => {
      const cached = textCache.get(name);
      if (cached !== undefined) return cached;
      const data = entryMap.get(name);
      if (!data) return null;
      return fflate.strFromU8(data);
    };

    const loadText = (name: string) => dedupedZipLoadText(zipLoadText, name);

    const loadBlob = async (name: string): Promise<Blob | null> => {
      const data = entryMap.get(name);
      if (!data) return null;
      const ext = name.split('.').pop()?.toLowerCase();
      const mime =
        ext === 'css' ? 'text/css' :
        ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
        ext === 'png' ? 'image/png' :
        ext === 'svg' ? 'image/svg+xml' : 'application/octet-stream';
      return new Blob([new Uint8Array(data)], { type: mime });
    };

    const getSize = (name: string) => entryMap.get(name)?.length || 0;

    // Load foliate-js EPUB engine
    const { EPUB } = await import('foliate-js/epub.js');
    const epub = new EPUB({
      loadText,
      loadBlob,
      getSize,
      sha1: undefined,
    });

    const initialized = await epub.init();

    const blobUrls = new Map<string, string>();

    const getBlobUrl = (zipPath: string): string | null => {
      let data = entryMap.get(zipPath);
      let foundPath = zipPath;

      if (!data) {
        try {
          const decoded = decodeURIComponent(zipPath);
          data = entryMap.get(decoded);
          if (data) foundPath = decoded;
        } catch {}
      }

      if (!data) {
        const clean = zipPath.replace(/^\/+/, '').toLowerCase();
        for (const [key, val] of entryMap.entries()) {
          const kLower = key.toLowerCase();
          if (kLower === clean || kLower.endsWith('/' + clean)) {
            data = val;
            foundPath = key;
            break;
          }
        }
      }

      if (!data) return null;

      const cached = blobUrls.get(foundPath);
      if (cached) return cached;

      const ext = foundPath.split('.').pop()?.toLowerCase();
      const mime =
        ext === 'css' ? 'text/css' :
        ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
        ext === 'png' ? 'image/png' :
        ext === 'gif' ? 'image/gif' :
        ext === 'webp' ? 'image/webp' :
        ext === 'svg' ? 'image/svg+xml' :
        ext === 'woff' ? 'font/woff' :
        ext === 'woff2' ? 'font/woff2' :
        ext === 'ttf' ? 'font/ttf' :
        ext === 'otf' ? 'font/otf' :
        'application/octet-stream';

      const blob = new Blob([new Uint8Array(data)], { type: mime });
      const url = URL.createObjectURL(blob);
      blobUrls.set(foundPath, url);
      return url;
    };

    const resolveZipRelativePath = (relativeHref: string, baseDocPath: string): string => {
      try {
        if (!relativeHref || /^(https?:|data:|blob:|file:)/i.test(relativeHref)) return relativeHref;
        const cleanHref = relativeHref.split('#')[0].split('?')[0];
        if (!cleanHref) return '';

        const baseDir = baseDocPath.includes('/') ? baseDocPath.substring(0, baseDocPath.lastIndexOf('/') + 1) : '';
        const combined = baseDir + cleanHref;
        const segments = combined.split('/');
        const resolved: string[] = [];
        for (const seg of segments) {
          if (seg === '.' || seg === '') continue;
          if (seg === '..') {
            resolved.pop();
          } else {
            resolved.push(seg);
          }
        }
        return resolved.join('/');
      } catch {
        return relativeHref;
      }
    };

    // Enhance sections with Warichu / Sharh transformation, styling, and syntax highlighting
    const enhancedSections: SectionItem[] = initialized.sections.map((section: SectionItem, idx: number) => {
      const originalCreateDoc = section.createDocument ? section.createDocument.bind(section) : null;

      return {
        id: section.id || `section_${idx}`,
        cfi: section.cfi,
        size: section.size || 0,
        linear: section.linear || 'yes',
        pageSpread: section.pageSpread || '',
        loadText: () => loadText(section.id),
        loadBlob: section.loadBlob ? section.loadBlob.bind(section) : undefined,
        createDocument: async () => {
          let doc: Document;
          if (originalCreateDoc) {
            doc = await originalCreateDoc();
          } else {
            const rawText = section.loadText ? await section.loadText() : '';
            doc = document.implementation.createHTMLDocument();
            doc.body.innerHTML = rawText || '';
          }

          // Strip any <base> tags that could distort browser URL resolution
          doc.querySelectorAll('base').forEach((b) => b.remove());

          // Rewrite all relative images, SVG image tags, and stylesheets to in-memory blob URLs
          const basePath = section.id || '';

          doc.querySelectorAll('img[src]').forEach((img) => {
            const src = img.getAttribute('src');
            if (src && !/^(https?:|data:|blob:|file:)/i.test(src)) {
              const zipPath = resolveZipRelativePath(src, basePath);
              const bUrl = getBlobUrl(zipPath);
              if (bUrl) img.setAttribute('src', bUrl);
            }
          });

          doc.querySelectorAll('image').forEach((svgImg) => {
            const xlinkHref = svgImg.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || svgImg.getAttribute('xlink:href');
            if (xlinkHref && !/^(https?:|data:|blob:|file:)/i.test(xlinkHref)) {
              const zipPath = resolveZipRelativePath(xlinkHref, basePath);
              const bUrl = getBlobUrl(zipPath);
              if (bUrl) {
                svgImg.setAttributeNS('http://www.w3.org/1999/xlink', 'href', bUrl);
                svgImg.setAttribute('xlink:href', bUrl);
              }
            }
            const href = svgImg.getAttribute('href');
            if (href && !/^(https?:|data:|blob:|file:)/i.test(href)) {
              const zipPath = resolveZipRelativePath(href, basePath);
              const bUrl = getBlobUrl(zipPath);
              if (bUrl) svgImg.setAttribute('href', bUrl);
            }
          });

          doc.querySelectorAll('link[rel="stylesheet"][href], link[type="text/css"][href]').forEach((link) => {
            const href = link.getAttribute('href');
            if (href && !/^(https?:|data:|blob:|file:)/i.test(href)) {
              const zipPath = resolveZipRelativePath(href, basePath);
              const bUrl = getBlobUrl(zipPath);
              if (bUrl) link.setAttribute('href', bUrl);
            }
          });

          doc.querySelectorAll('[style*="url("]').forEach((el) => {
            const style = el.getAttribute('style');
            if (style) {
              const replaced = style.replace(/url\(['"]?([^'"\)]+)['"]?\)/gi, (match, u) => {
                if (/^(https?:|data:|blob:|file:)/i.test(u)) return match;
                const zipPath = resolveZipRelativePath(u, basePath);
                const bUrl = getBlobUrl(zipPath);
                return bUrl ? `url("${bUrl}")` : match;
              });
              el.setAttribute('style', replaced);
            }
          });

          // Apply classical commentary (Sharh) transformation
          doc.body.innerHTML = transformClassicalGlosses(doc.body.innerHTML);

          // Apply code syntax highlighting on <pre><code> blocks
          highlightCodeBlocks(doc);

          // Inject styling and syntax theme
          const styleEl = doc.createElement('style');
          const isDark = this.options.theme === 'dark' || this.options.theme === 'night';
          styleEl.textContent =
            getReaderStyles({ direction: initialized.dir || 'ltr', theme: this.options.theme }) +
            '\n' +
            getSyntaxHighlightStyles(isDark);
          doc.head.appendChild(styleEl);

          return doc;
        },
      };
    });

    const mapTocItem = (t: import('foliate-js/epub.js').FoliateTOC, idx: number, parentPrefix = ''): TOCItem => {
      const id = t.id ?? (parentPrefix ? `${parentPrefix}-${idx + 1}` : idx + 1);
      const subitems = t.subitems || t.children;
      return {
        id,
        label: (t.label || t.title || `Chapter ${idx + 1}`).trim(),
        href: t.href || '',
        index: typeof t.index === 'number' ? t.index : (parentPrefix ? -1 : idx),
        subitems: Array.isArray(subitems) && subitems.length > 0
          ? subitems.map((sub, sIdx: number) => mapTocItem(sub, sIdx, String(id)))
          : undefined,
      };
    };

    const bookDoc: BookDoc = {
      metadata: {
        title: initialized.metadata?.title || this.filename.replace(/\.[^/.]+$/, ''),
        author: typeof initialized.metadata?.author === 'string'
          ? initialized.metadata.author
          : initialized.metadata?.author?.name || undefined,
        language: initialized.metadata?.language,
        publisher: initialized.metadata?.publisher,
        description: initialized.metadata?.description,
      },
      rendition: initialized.rendition || { layout: 'reflowable', spread: 'auto' },
      dir: initialized.dir === 'rtl' ? 'rtl' : 'ltr',
      toc: (initialized.toc || []).map((t: import('foliate-js/epub.js').FoliateTOC, i: number) => mapTocItem(t, i)),
      sections: enhancedSections,
      splitTOCHref: initialized.splitTOCHref?.bind(initialized),
      resolveHref: initialized.resolveHref?.bind(initialized),
      resolveCFI: initialized.resolveCFI?.bind(initialized),
      getCover: initialized.getCover ? initialized.getCover.bind(initialized) : undefined,
      destroy: () => {
        initialized.destroy?.();
        blobUrls.forEach((url) => URL.revokeObjectURL(url));
        blobUrls.clear();
        entryMap.clear();
        textCache.clear();
      },
    };

    return bookDoc;
  }

  /**
   * MOBI / AZW / AZW3 (KF8) Loader
   */
  private async makeMobiBook(bytes: Uint8Array): Promise<BookDoc> {
    const { MOBI } = await import('foliate-js/mobi.js');
    const mobi = new MOBI({ unzlib: fflate.unzlibSync });
    const opened = await mobi.open(bytes);

    return {
      metadata: {
        title: opened.metadata?.title || this.filename.replace(/\.[^/.]+$/, ''),
        author: opened.metadata?.author,
        language: opened.metadata?.language,
        description: opened.metadata?.description,
      },
      rendition: opened.rendition || { layout: 'reflowable', spread: 'auto' },
      dir: opened.dir === 'rtl' ? 'rtl' : 'ltr',
      toc: opened.toc || [],
      sections: (opened.sections || []).map((sec: SectionItem, idx: number) => ({
        id: sec.id || `mobi_sec_${idx}`,
        size: sec.size || 0,
        loadText: sec.loadText ? sec.loadText.bind(sec) : undefined,
        createDocument: async () => {
          const doc = sec.createDocument ? await sec.createDocument() : document.implementation.createHTMLDocument();
          doc.body.innerHTML = transformClassicalGlosses(doc.body.innerHTML);
          highlightCodeBlocks(doc);
          const styleEl = doc.createElement('style');
          styleEl.textContent = getReaderStyles({ direction: opened.dir || 'ltr', theme: this.options.theme });
          doc.head.appendChild(styleEl);
          return doc;
        },
      })),
      getCover: opened.getCover ? opened.getCover.bind(opened) : undefined,
      destroy: () => opened.destroy?.(),
    };
  }

  /**
   * FictionBook 2 (FB2 / FBZ) Loader
   */
  private async makeFb2Book(bytes: Uint8Array): Promise<BookDoc> {
    let rawXml = '';
    if (this.filename.endsWith('.fbz') || this.filename.endsWith('.fb2.zip')) {
      const unzipped = fflate.unzipSync(bytes);
      const fb2Key = Object.keys(unzipped).find((k) => k.endsWith('.fb2')) || Object.keys(unzipped)[0];
      rawXml = fflate.strFromU8(unzipped[fb2Key]);
    } else {
      rawXml = fflate.strFromU8(bytes);
    }

    const { makeFB2 } = await import('foliate-js/fb2.js');
    const fb2Blob = new Blob([rawXml], { type: 'application/x-fictionbook+xml' });
    const fb2 = await (makeFB2)(fb2Blob);

    return {
      metadata: fb2.metadata || { title: this.filename.replace(/\.[^/.]+$/, '') },
      rendition: { layout: 'reflowable', spread: 'auto' },
      dir: fb2.dir === 'rtl' ? 'rtl' : 'ltr',
      toc: fb2.toc || [],
      sections: (fb2.sections || []).map((s: SectionItem, idx: number) => ({
        id: s.id || `fb2_sec_${idx}`,
        size: s.size || 0,
        loadText: s.loadText ? s.loadText.bind(s) : undefined,
        createDocument: async () => {
          const doc = s.createDocument ? await s.createDocument() : document.implementation.createHTMLDocument();
          doc.body.innerHTML = transformClassicalGlosses(doc.body.innerHTML);
          highlightCodeBlocks(doc);
          return doc;
        },
      })),
      getCover: fb2.getCover ? fb2.getCover.bind(fb2) : undefined,
      destroy: () => fb2.destroy?.(),
    };
  }

  /**
   * Plain Text & Markdown Loader
   * Splits into structured sections with automatic heading-based TOC.
   */
  private async makeTextBook(bytes: Uint8Array, isMarkdown: boolean): Promise<BookDoc> {
    const raw = fflate.strFromU8(bytes);
    const title = this.filename.replace(/\.[^/.]+$/, '');

    // Split text into chapters based on headers (# Chapter, الفصل, الباب, Chapter)
    const chapterRegex = isMarkdown
      ? /(?=^#{1,3}\s+.+$)/m
      : /(?=^(?:الفصل|الباب|المبحث|القسم|Chapter|Part|Section)\s+[0-9IVXLCDM\u0660-\u0669]+)/im;

    const rawSections = raw.split(chapterRegex).filter((s) => s.trim().length > 0);
    const sectionsToUse = rawSections.length > 0 ? rawSections : [raw];

    const toc: TOCItem[] = [];
    const sections: SectionItem[] = sectionsToUse.map((secText, idx) => {
      const firstLine = secText.trim().split('\n')[0].replace(/^#+\s*/, '').trim();
      const label = firstLine.length > 0 && firstLine.length < 80 ? firstLine : `Section ${idx + 1}`;
      toc.push({
        id: idx + 1,
        label,
        href: `sec_${idx}`,
        index: idx,
      });

      return {
        id: `sec_${idx}`,
        size: secText.length,
        loadText: async () => secText,
        createDocument: async () => {
          let bodyHtml = '';

          if (isMarkdown) {
            // Render basic markdown formatting (headers, bold, code, paragraphs)
            const lines = secText.split('\n');
            let inCode = false;
            let codeBuffer: string[] = [];

            for (const line of lines) {
              if (line.startsWith('```')) {
                if (inCode) {
                  bodyHtml += `<pre><code>${codeBuffer.join('\n')}</code></pre>`;
                  codeBuffer = [];
                  inCode = false;
                } else {
                  inCode = true;
                }
              } else if (inCode) {
                codeBuffer.push(line.replace(/&/g, '&amp;').replace(/</g, '&lt;'));
              } else if (line.startsWith('# ')) {
                bodyHtml += `<h1>${line.replace(/^#\s*/, '')}</h1>`;
              } else if (line.startsWith('## ')) {
                bodyHtml += `<h2>${line.replace(/^##\s*/, '')}</h2>`;
              } else if (line.startsWith('### ')) {
                bodyHtml += `<h3>${line.replace(/^###\s*/, '')}</h3>`;
              } else if (line.trim().length > 0) {
                const formatted = line
                  .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                  .replace(/\*(.*?)\*/g, '<em>$1</em>')
                  .replace(/`([^`]+)`/g, '<code>$1</code>');
                bodyHtml += `<p>${formatted}</p>`;
              }
            }
          } else {
            // Plain text paragraphs
            bodyHtml = secText
              .split(/\n\s*\n/)
              .map((p) => `<p>${p.trim()}</p>`)
              .join('');
          }

          const formattedHtml = transformClassicalGlosses(bodyHtml);
          if (typeof document === 'undefined') {
            return { body: { innerHTML: formattedHtml } } as unknown as Document;
          }

          const doc = document.implementation.createHTMLDocument(label);
          doc.body.innerHTML = formattedHtml;
          highlightCodeBlocks(doc);

          const styleEl = doc.createElement('style');
          styleEl.textContent = getReaderStyles({
            direction: getDirFromLanguage(null, secText),
            theme: this.options.theme,
          });
          doc.head.appendChild(styleEl);

          return doc;
        },
      };
    });

    return {
      metadata: { title },
      rendition: { layout: 'reflowable', spread: 'auto' },
      dir: getDirFromLanguage(null, raw),
      toc,
      sections,
    };
  }

  /**
   * Microsoft Word (DOCX) Loader
   * Extracts paragraphs and headings directly from word/document.xml without external heavy dependencies.
   */
  private async makeDocxBook(bytes: Uint8Array): Promise<BookDoc> {
    const title = this.filename.replace(/\.[^/.]+$/, '');
    const unzipped = fflate.unzipSync(bytes);
    const docXmlBytes = unzipped['word/document.xml'];

    if (!docXmlBytes) {
      throw new Error('Invalid DOCX file: word/document.xml not found.');
    }

    const docXmlStr = fflate.strFromU8(docXmlBytes);
    // Extract text paragraphs <w:p>
    const pMatches = docXmlStr.match(/<w:p(?:\s+[^>]*)?>([\s\S]*?)<\/w:p>/gi) || [];

    const paragraphs: string[] = [];
    for (const pXml of pMatches) {
      const textMatches = pXml.match(/<w:t(?:\s+[^>]*)?>([\s\S]*?)<\/w:t>/gi) || [];
      const text = textMatches
        .map((t) => t.replace(/<[^>]+>/g, ''))
        .join('');
      if (text.trim().length > 0) {
        paragraphs.push(text);
      }
    }

    const fullText = paragraphs.join('\n\n');

    return {
      metadata: { title },
      rendition: { layout: 'reflowable', spread: 'auto' },
      dir: getDirFromLanguage(null, fullText),
      toc: [{ id: 1, label: title, href: 'doc', index: 0 }],
      sections: [
        {
          id: 'doc',
          size: fullText.length,
          loadText: async () => fullText,
          createDocument: async () => {
            const bodyHtml = paragraphs.map((p) => `<p>${p}</p>`).join('');
            if (typeof document === 'undefined') {
              return { body: { innerHTML: bodyHtml } } as unknown as Document;
            }
            const d = document.implementation.createHTMLDocument(title);
            d.body.innerHTML = transformClassicalGlosses(bodyHtml);
            highlightCodeBlocks(d);
            const style = d.createElement('style');
            style.textContent = getReaderStyles({
              direction: getDirFromLanguage(null, fullText),
              theme: this.options.theme,
            });
            d.head.appendChild(style);
            return d;
          },
        },
      ],
    };
  }

  /**
   * HTML & Web Article Loader
   */
  private async makeHtmlBook(bytes: Uint8Array): Promise<BookDoc> {
    const rawHtml = fflate.strFromU8(bytes);
    const title = this.filename.replace(/\.[^/.]+$/, '');

    return {
      metadata: { title },
      rendition: { layout: 'reflowable', spread: 'auto' },
      dir: getDirFromLanguage(null, rawHtml),
      toc: [{ id: 1, label: title, href: 'html_body', index: 0 }],
      sections: [
        {
          id: 'html_body',
          size: rawHtml.length,
          loadText: async () => rawHtml,
          createDocument: async () => {
            const doc = document.implementation.createHTMLDocument(title);
            doc.body.innerHTML = transformClassicalGlosses(rawHtml);
            highlightCodeBlocks(doc);
            const style = doc.createElement('style');
            style.textContent = getReaderStyles({
              direction: getDirFromLanguage(null, rawHtml),
              theme: this.options.theme,
            });
            doc.head.appendChild(style);
            return doc;
          },
        },
      ],
    };
  }

  /**
   * Fixed-Layout PDF Book Stub
   */
  private async makePDFBook(bytes: Uint8Array): Promise<BookDoc> {
    const title = this.filename.replace(/\.[^/.]+$/, '');

    return {
      metadata: { title },
      rendition: { layout: 'pre-paginated', spread: 'none' },
      dir: 'ltr',
      toc: [],
      sections: [
        {
          id: 'pdf_full',
          size: bytes.length,
          loadBlob: async () => new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
          createDocument: async () => {
            const doc = document.implementation.createHTMLDocument(title);
            return doc;
          },
        },
      ],
    };
  }
}
