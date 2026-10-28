import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as fflate from 'fflate';
import {
  dedupedZipLoadText,
  inflightMap,
  detectFormat,
  DocumentLoader,
} from '../../src/renderer/libs/reader/document-loader';
import {
  getDirFromLanguage,
  transformClassicalGlosses,
  getReaderStyles,
} from '../../src/renderer/libs/reader/typography';
import {
  highlightCodeBlocks,
  getSyntaxHighlightStyles,
} from '../../src/renderer/libs/reader/syntax-highlight';
import {
  naturalPathSort,
  makeArchiveBookDoc,
} from '../../src/renderer/libs/reader/archive-stream';

describe('KEY-133 Multi-Format Document Rendering Engine Tests', () => {

  describe('1. In-Flight Concurrent Promise Deduplication & Cache (Readest Pattern)', () => {
    it('collapses concurrent loadText calls on the same href into a single execution', async () => {
      let callCount = 0;
      const fakeZipLoad = async (name: string): Promise<string> => {
        callCount++;
        // Simulate decompression delay
        await new Promise((r) => setTimeout(r, 25));
        return `content_of_${name}`;
      };

      // Issue two concurrent calls simultaneously
      const [res1, res2] = await Promise.all([
        dedupedZipLoadText(fakeZipLoad, 'chapter1.xhtml'),
        dedupedZipLoadText(fakeZipLoad, 'chapter1.xhtml'),
      ]);

      assert.strictEqual(res1, 'content_of_chapter1.xhtml');
      assert.strictEqual(res2, 'content_of_chapter1.xhtml');
      // Only 1 decompression call should have been triggered!
      assert.strictEqual(callCount, 1);

      // Verify that after settling, the inflightMap dropped the promise so RAM is released
      assert.strictEqual(inflightMap.has('chapter1.xhtml'), false);
    });

    it('allows a subsequent call after settlement without stale memory lock', async () => {
      let callCount = 0;
      const fakeZipLoad = async (name: string): Promise<string> => {
        callCount++;
        return `fresh_${name}`;
      };

      const first = await dedupedZipLoadText(fakeZipLoad, 'chapter2.xhtml');
      assert.strictEqual(first, 'fresh_chapter2.xhtml');
      assert.strictEqual(callCount, 1);

      const second = await dedupedZipLoadText(fakeZipLoad, 'chapter2.xhtml');
      assert.strictEqual(second, 'fresh_chapter2.xhtml');
      assert.strictEqual(callCount, 2);
    });
  });

  describe('2. Multi-Format Detection Engine', () => {
    it('detects extensions accurately across all supported formats', () => {
      assert.strictEqual(detectFormat('book.epub'), 'EPUB');
      assert.strictEqual(detectFormat('paper.pdf'), 'PDF');
      assert.strictEqual(detectFormat('novel.mobi'), 'MOBI');
      assert.strictEqual(detectFormat('kindle.azw3'), 'AZW3');
      assert.strictEqual(detectFormat('kindle.azw'), 'AZW');
      assert.strictEqual(detectFormat('classic.fb2'), 'FB2');
      assert.strictEqual(detectFormat('classic.fbz'), 'FBZ');
      assert.strictEqual(detectFormat('comic.cbz'), 'CBZ');
      assert.strictEqual(detectFormat('comic.cbr'), 'CBR');
      assert.strictEqual(detectFormat('comic.cbt'), 'CBT');
      assert.strictEqual(detectFormat('comic.cb7'), 'CB7');
      assert.strictEqual(detectFormat('notes.txt'), 'TXT');
      assert.strictEqual(detectFormat('research.md'), 'MD');
      assert.strictEqual(detectFormat('document.docx'), 'DOCX');
      assert.strictEqual(detectFormat('page.html'), 'HTML');
      assert.strictEqual(detectFormat('article.mhtml'), 'HTML');
    });

    it('falls back to magic bytes when extension is ambiguous', () => {
      // PDF: %PDF- (0x25 0x50 0x44 0x46)
      const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x31, 0x2e, 0x34]);
      assert.strictEqual(detectFormat('unknown_file', pdfBytes), 'PDF');

      // Zip: PK\x03\x04
      const zipBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
      assert.strictEqual(detectFormat('unknown_file', zipBytes), 'EPUB');
    });
  });

  describe('3. Bi-Directional (RTL/LTR) & Classical Typography Engine', () => {
    it('detects RTL direction from Arabic, Persian, Urdu, and Hebrew language codes', () => {
      assert.strictEqual(getDirFromLanguage('ar'), 'rtl');
      assert.strictEqual(getDirFromLanguage('ara'), 'rtl');
      assert.strictEqual(getDirFromLanguage('ar-EG'), 'rtl');
      assert.strictEqual(getDirFromLanguage('fa'), 'rtl');
      assert.strictEqual(getDirFromLanguage('ur'), 'rtl');
      assert.strictEqual(getDirFromLanguage('he'), 'rtl');
      assert.strictEqual(getDirFromLanguage('en'), 'ltr');
      assert.strictEqual(getDirFromLanguage('fr'), 'ltr');
      assert.strictEqual(getDirFromLanguage(null), 'ltr');
    });

    it('detects RTL direction heuristically from Arabic script in sample text', () => {
      const arabicSample = 'كتاب تاريخ بغداد للخطيب البغدادي رحمه الله';
      assert.strictEqual(getDirFromLanguage(null, arabicSample), 'rtl');

      const englishSample = 'The History of Baghdad and Islamic Civilization';
      assert.strictEqual(getDirFromLanguage(null, englishSample), 'ltr');
    });

    it('transforms classical commentary glosses (<sharh> and <warichu>) into two-line structures', () => {
      const input = '<p>قال المصنف رحمه الله <sharh>أي غفر له ذنوبه وستر عيوبه في الدارين</sharh> وجزاه عنا خيراً</p>';
      const transformed = transformClassicalGlosses(input);

      assert.ok(transformed.includes('class="sharh-chunk"'));
      assert.ok(transformed.includes('class="sharh-line"'));
      assert.ok(transformed.includes('class="sharh-open"'));
      assert.ok(transformed.includes('class="sharh-close"'));
      assert.ok(!transformed.includes('<sharh>'));
    });

    it('generates reader styles with CSS logical properties and Tashkeel protection', () => {
      const styles = getReaderStyles({ direction: 'rtl', theme: 'sepia', fontSize: 20 });
      assert.ok(styles.includes('direction: rtl !important'));
      assert.ok(styles.includes('padding-inline-start'));
      assert.ok(styles.includes('padding-inline-end'));
      assert.ok(styles.includes('text-align: start !important'));
      assert.ok(styles.includes('line-height: 1.85 !important'));
      assert.ok(styles.includes('font-feature-settings'));
      assert.ok(styles.includes('.sharh-chunk'));
    });
  });

  describe('4. Code Syntax Highlighting Engine', () => {
    it('generates valid light and dark syntax highlight stylesheets', () => {
      const lightStyles = getSyntaxHighlightStyles(false);
      const darkStyles = getSyntaxHighlightStyles(true);

      assert.ok(lightStyles.includes('.hljs-keyword'));
      assert.ok(lightStyles.includes('#f6f8fa'));
      assert.ok(darkStyles.includes('.hljs-keyword'));
      assert.ok(darkStyles.includes('#1e293b'));
    });
  });

  describe('5. Natural Archive & Comic Sorter (Issue #5745 Regression Prevention)', () => {
    it('correctly sorts nested segments and chapter prefixes naturally', () => {
      const unsorted = [
        'Chapter 0060 (10)/001.jpg',
        'Chapter 0060 (2)/001.jpg',
        'Chapter 0060 (2)/002.jpg',
        'Chapter 0060 (3)/001.jpg',
        'Chapter 0060/001.jpg',
        'Chapter 0060/002.jpg',
        'Chapter 0061/001.jpg',
      ];

      const sorted = naturalPathSort(unsorted);

      assert.deepStrictEqual(sorted, [
        'Chapter 0060/001.jpg',
        'Chapter 0060/002.jpg',
        'Chapter 0060 (2)/001.jpg',
        'Chapter 0060 (2)/002.jpg',
        'Chapter 0060 (3)/001.jpg',
        'Chapter 0060 (10)/001.jpg',
        'Chapter 0061/001.jpg',
      ]);
    });

    it('creates an archive BookDoc with lazy blob loading and metadata parsing', async () => {
      // Build an in-memory zip archive containing a couple of mock images
      const zipData = fflate.zipSync({
        'pages/01.jpg': new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
        'pages/02.jpg': new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
        'ComicInfo.xml': fflate.strToU8(
          '<ComicInfo><Title>Al-Majalla Comic</Title><Writer>Baghdad Studio</Writer></ComicInfo>'
        ),
      });

      const bookDoc = await makeArchiveBookDoc(zipData, { filename: 'test_comic.cbz' });

      assert.strictEqual(bookDoc.metadata.title, 'Al-Majalla Comic');
      assert.strictEqual(bookDoc.metadata.author, 'Baghdad Studio');
      assert.strictEqual(bookDoc.rendition.layout, 'pre-paginated');
      assert.strictEqual(bookDoc.sections.length, 2);
      assert.strictEqual(bookDoc.sections[0].id, 'pages/01.jpg');

      const coverBlob = await bookDoc.getCover?.();
      assert.ok(coverBlob);
      assert.strictEqual(coverBlob.type, 'image/jpeg');

      // Cleanup
      bookDoc.destroy?.();
    });
  });

  describe('6. Reflowable Markdown and Text Document Loader', () => {
    it('parses markdown text into structured sections with automatic TOC', async () => {
      const mdContent = `# مقدمة الكتاب\n\nهذا نص الفصل الأول من الكتاب الأكاديمي.\n\n# الفصل الثاني\n\nنص الفصل الثاني مع تفاصيل البحث.`;
      const bytes = fflate.strToU8(mdContent);

      const loader = new DocumentLoader(bytes, 'research_paper.md');
      const { book, format } = await loader.open();

      assert.strictEqual(format, 'MD');
      assert.strictEqual(book.dir, 'rtl');
      assert.strictEqual(book.sections.length, 2);
      assert.strictEqual(book.toc?.length, 2);
      assert.strictEqual(book.toc[0].label, 'مقدمة الكتاب');
      assert.strictEqual(book.toc[1].label, 'الفصل الثاني');
    });

    it('parses DOCX documents extracting word/document.xml into paragraphs', async () => {
      const docxZip = fflate.zipSync({
        'word/document.xml': fflate.strToU8(
          '<w:document><w:body><w:p><w:r><w:t>المقدمة التاريخية</w:t></w:r></w:p><w:p><w:r><w:t>تفاصيل البحث العلمي</w:t></w:r></w:p></w:body></w:document>'
        ),
      });

      const loader = new DocumentLoader(docxZip, 'historical_doc.docx');
      const { book, format } = await loader.open();

      assert.strictEqual(format, 'DOCX');
      assert.strictEqual(book.dir, 'rtl');
      assert.strictEqual(book.sections.length, 1);
      const text = await book.sections[0].loadText?.();
      assert.ok(text?.includes('المقدمة التاريخية'));
      assert.ok(text?.includes('تفاصيل البحث العلمي'));
    });
  });

  describe('7. Standard Reflowable EPUB Document Loader (foliate-js + prefetch cache)', () => {
    it('initializes EPUB book with prefetch cache and extracts metadata and spine sections', async () => {
      // Ensure DOMParser is polyfilled for headless test environment if needed
      if (typeof DOMParser === 'undefined') {
        const { DOMParser: XDOMParser } = await import('@xmldom/xmldom');
        // Polyfill Symbol.iterator for xmldom's NodeList/HTMLCollection
        const dummyDoc = new XDOMParser().parseFromString('<root><child/></root>', 'text/xml');
        const nodeListProto = Object.getPrototypeOf(dummyDoc.getElementsByTagName('child'));
        if (nodeListProto && !nodeListProto[Symbol.iterator]) {
          nodeListProto[Symbol.iterator] = function* () {
            for (let i = 0; i < this.length; i++) {
              yield this.item(i);
            }
          };
        }
        class TestDOMParser extends XDOMParser {
          parseFromString(str: string, type: unknown) {
            const doc = super.parseFromString(str, type);
            const enhance = (node: unknown) => {
              if (!node || typeof node !== 'object') return;
              if (!node.querySelector) {
                node.querySelector = (sel: string) => {
                  if (sel.startsWith('#')) {
                    return doc.getElementById ? doc.getElementById(sel.slice(1)) : null;
                  }
                  const tag = sel.split(/[[.:#\s]/)[0];
                  if (tag && node.getElementsByTagName) {
                    const list = node.getElementsByTagName(tag);
                    return list && list.length > 0 ? list[0] : null;
                  }
                  return null;
                };
              }
              if (!node.querySelectorAll) {
                node.querySelectorAll = (sel: string) => {
                  const tag = sel.split(/[[.:#\s]/)[0];
                  if (tag && node.getElementsByTagName) {
                    return Array.from(node.getElementsByTagName(tag));
                  }
                  return [];
                };
              }
              if (!node.children || !node.children[Symbol.iterator]) {
                Object.defineProperty(node, 'children', {
                  get() {
                    const result: unknown[] = [];
                    if (node.childNodes) {
                      for (let i = 0; i < node.childNodes.length; i++) {
                        if (node.childNodes[i].nodeType === 1) {
                          result.push(node.childNodes[i]);
                        }
                      }
                    }
                    return result;
                  },
                  configurable: true,
                });
              }
              if (node.childNodes) {
                for (let i = 0; i < node.childNodes.length; i++) {
                  enhance(node.childNodes[i]);
                }
              }
            };
            enhance(doc);
            return doc;
          }
        }
        (globalThis as unknown).DOMParser = TestDOMParser;
      }

      const containerXml = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

      const opfXml = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>تاريخ بغداد</dc:title>
    <dc:creator>الخطيب البغدادي</dc:creator>
    <dc:language>ar</dc:language>
  </metadata>
  <manifest>
    <item id="ch1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
  </manifest>
  <spine page-progression-direction="rtl">
    <itemref idref="ch1"/>
  </spine>
</package>`;

      const ch1Html = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>الفصل الأول</title></head>
  <body>
    <h1>مخطوطة بغداد</h1>
    <p>ذكر بناء مدينة السلام بغداد حرسها الله تعالى.</p>
  </body>
</html>`;

      const navHtml = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <body>
    <nav epub:type="toc">
      <ol>
        <li><a href="chapter1.xhtml">الفصل الأول</a></li>
      </ol>
    </nav>
  </body>
</html>`;

      const epubZip = fflate.zipSync({
        'mimetype': fflate.strToU8('application/epub+zip'),
        'META-INF/container.xml': fflate.strToU8(containerXml),
        'OEBPS/content.opf': fflate.strToU8(opfXml),
        'OEBPS/chapter1.xhtml': fflate.strToU8(ch1Html),
        'OEBPS/nav.xhtml': fflate.strToU8(navHtml),
      });

      const loader = new DocumentLoader(epubZip, 'tarikh_baghdad.epub');
      const { book, format } = await loader.open();

      assert.strictEqual(format, 'EPUB');
      assert.strictEqual(book.metadata.title, 'تاريخ بغداد');
      assert.strictEqual(book.metadata.author, 'الخطيب البغدادي');
      assert.strictEqual(book.dir, 'rtl');
      assert.strictEqual(book.sections.length, 1);
      assert.strictEqual(book.sections[0].id, 'OEBPS/chapter1.xhtml');

      const chapterText = await book.sections[0].loadText?.();
      assert.ok(chapterText?.includes('مخطوطة بغداد'));

      book.destroy?.();
    });
  });

});
