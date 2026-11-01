import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PdfPackagerService, inlineClippedImages, sanitizeForPrint } from '../../src/main/services/clipper/pdf-packager.service';
import { EpubPackagerService } from '../../src/main/services/clipper/epub-packager.service';
import { WebClipperService } from '../../src/main/services/clipper/web-clipper.service';
import { resolvePublicUrl } from '../../src/main/services/pdf-editor/weasyprint';
import { chaptersFromPages } from '../../src/renderer/libs/reader/book-pdf-export';
import type { FormattedPage } from '../../src/renderer/libs/reader/epub-paginator';

const pixel = 'data:image/png;base64,iVBORw0KGgo=';

describe('PDF packaging for WeasyPrint', () => {
  it('strips everything that could load outside content or change the print layout', () => {
    const html = sanitizeForPrint(`<p style="position:fixed" onclick="x()">نص</p><script>x()</script><style>p{}</style>
      <link rel="attachment" href="file:///C:/Windows/win.ini"><iframe src="https://a.example"></iframe>
      <img src="file:///C:/secret.png" alt="a"><img src="https://a.example/b.png" alt="b"><img src="${pixel}">
      <a href="javascript:x()">one</a><a href="https://a.example">two</a><a href="#note">three</a>`);
    assert.equal(/<script|<style|<link|<iframe|onclick|style=|file:|javascript:/iu.test(html), false);
    assert.equal(html.includes('https://a.example/b.png'), false);
    assert.ok(html.includes(pixel));
    assert.match(html, /<img[^>]*alt=""/u);
    assert.ok(html.includes('href="https://a.example"'));
    assert.ok(html.includes('href="#note"'));
    assert.ok(html.includes('نص'));
  });

  it('inlines bundled images as data URLs', () => {
    const html = inlineClippedImages('<img src="images/img_1.png">', [{ src: 'https://a.example/a.png', localPath: 'images/img_1.png', mimeType: 'image/png', data: Buffer.from([1, 2, 3]) }]);
    assert.ok(html.includes('data:image/png;base64,AQID'));
  });

  it('builds an RTL document with a language, a title and no contents page for one chapter', () => {
    const packager = new PdfPackagerService(async () => Buffer.alloc(0));
    const html = packager.buildDocument([{ title: 'عنوان <المقال>', contentHtml: '<p>نص</p>', index: 1 }], { title: 'عنوان <المقال>', author: 'كاتب', sourceUrl: 'https://a.example' });
    assert.match(html, /<html lang="ar" dir="rtl">/u);
    assert.ok(html.includes('<title>عنوان &lt;المقال&gt;</title>'));
    assert.equal(html.includes('class="contents"'), false);
    assert.ok(html.includes('https://a.example'));
  });

  it('gives a book a cover, linked contents and one article per chapter without repeating headings', () => {
    const packager = new PdfPackagerService(async () => Buffer.alloc(0));
    const html = packager.buildDocument(
      [{ title: 'One', contentHtml: '<p>a</p>', index: 1 }, { title: 'Two', contentHtml: '<h2>Two</h2><p>b</p>', index: 2 }],
      { title: 'Book', language: 'not a tag', contentsLabel: 'Contents' }
    );
    assert.match(html, /<html lang="en" dir="ltr">/u);
    assert.ok(html.includes('class="cover"'));
    assert.ok(html.includes('<h2>Contents</h2>'));
    assert.ok(html.includes('href="#chapter-2"'));
    assert.ok(html.includes('<h1>One</h1>'));
    assert.equal(html.includes('<h1>Two</h1>'), false);
  });

  it('passes a clipped article through the PDF packager and keeps the failure code', async () => {
    const rendered: string[] = [];
    const extractor = { extractFromHtml: () => ({ title: 'مقال', url: 'https://a.example', content: '<p>نص</p>', textContent: 'نص', length: 2, images: [] }) };
    const clipper = new WebClipperService(extractor as never, undefined, undefined, new PdfPackagerService(async html => { rendered.push(html); return Buffer.from('%PDF-'); }));
    const result = await clipper.clipArticle({ url: 'https://a.example', html: '<p></p>', targetFormat: 'pdf', importToLibrary: false });
    assert.equal(result.success, true);
    assert.equal(result.format, 'pdf');
    assert.ok(result.fileName?.endsWith('.pdf'));
    assert.ok(rendered[0].includes('dir="rtl"'));

    const failing = new WebClipperService(extractor as never, undefined, undefined, new PdfPackagerService(async () => { throw new Error('engine-missing'); }));
    const failed = await failing.clipArticle({ url: 'https://a.example', html: '<p></p>', targetFormat: 'pdf', importToLibrary: false });
    assert.equal(failed.success, false);
    assert.equal(failed.error, 'engine-missing');
  });

  it('writes serialized chapters to one Markdown document', () => {
    const markdown = EpubPackagerService.getInstance().packageSerializedNovelToMarkdown(
      [{ title: 'الفصل الأول', contentHtml: '<p>نص</p>', index: 1 }],
      { title: 'رواية', author: 'كاتب', sourceUrl: 'https://a.example' }
    );
    assert.ok(markdown.includes('dir: "rtl"'));
    assert.ok(markdown.includes('## الفصل الأول\n\nنص'));
  });

  it('joins reader pages back into one chapter per section', () => {
    const page = (pageNumber: number, sectionIndex: number, chapterLabel: string, html: string): FormattedPage => ({ pageNumber, sectionIndex, sectionId: String(sectionIndex), chapterLabel, html, text: '' });
    const chapters = chaptersFromPages([page(1, 0, 'A', '<p>1</p>'), page(2, 0, 'A', '<p>2</p>'), page(3, 2, 'B', '<p>3</p>')]);
    assert.deepEqual(chapters.map(chapter => [chapter.title, chapter.index]), [['A', 1], ['B', 2]]);
    assert.ok(chapters[0].contentHtml.includes('<p>2</p>'));
  });

  it('refuses URLs that are not public http pages before any request is made', async () => {
    for (const url of ['file:///C:/Windows/win.ini', 'ftp://a.example/', 'http://127.0.0.1:3000/', 'http://192.168.1.1/', 'http://169.254.169.254/', 'http://[::1]/', 'http://user:pass@8.8.8.8/', 'not a url']) {
      await assert.rejects(resolvePublicUrl(url), /invalid-request/u, url);
    }
  });
});
