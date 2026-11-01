import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fflate from 'fflate';
import { EpubPackagerService } from '../../src/main/services/clipper/epub-packager.service';
import { AssetBundlerService } from '../../src/main/services/clipper/asset-bundler.service';
import type { ClippedArticle, ClippedImage } from '../../src/shared/types/web-clipper';

describe('EpubPackagerService (Task 5.2 / KEY-148)', () => {
  const packager = EpubPackagerService.getInstance();

  it('keeps every chapter image when chapters use their own name prefix', async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string) => new Response(String(url), { headers: { 'content-type': 'image/png' } })) as typeof fetch;
    try {
      const bundler = AssetBundlerService.getInstance();
      const first = await bundler.bundleAssets('<img src="https://example.com/a.png">', 'https://example.com/1', undefined, 'ch1_img');
      const second = await bundler.bundleAssets('<img src="https://example.com/b.png">', 'https://example.com/2', undefined, 'ch2_img');
      const epub = packager.packageSerializedNovelToEpub(
        [{ title: 'one', contentHtml: first.rewrittenHtml, index: 1 }, { title: 'two', contentHtml: second.rewrittenHtml, index: 2 }],
        { title: 'book', author: 'author' },
        [...first.images, ...second.images],
      );
      const files = fflate.unzipSync(new Uint8Array(epub));
      assert.equal(fflate.strFromU8(files['OEBPS/images/ch1_img_1.png']), 'https://example.com/a.png');
      assert.equal(fflate.strFromU8(files['OEBPS/images/ch2_img_1.png']), 'https://example.com/b.png');
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('builds a valid EPUB container archive with spec-compliant files', () => {
    const article: ClippedArticle = {
      title: 'رسالة في الطب النبوي',
      byline: 'ابن القيم',
      url: 'https://example.com/medicine',
      content: '<p>فصل في قواعد حفظ الصحة والتداوي.</p>',
      textContent: 'فصل في قواعد حفظ الصحة والتداوي.',
      length: 120,
      language: 'ar',
      images: [],
    };

    const mockImage: ClippedImage = {
      src: 'https://example.com/cover.jpg',
      localPath: 'images/cover.jpg',
      mimeType: 'image/jpeg',
      data: Buffer.from([0xff, 0xd8, 0xff, 0xe0]), // Mock JPEG header
    };

    const epubBuffer = packager.packageArticleToEpub(
      article,
      '<p>فصل في قواعد حفظ الصحة والتداوي.</p><img src="images/cover.jpg"/>',
      [mockImage]
    );

    assert.ok(epubBuffer);
    assert.ok(epubBuffer.length > 500);

    // Unzip and inspect files
    const unzipped = fflate.unzipSync(new Uint8Array(epubBuffer));

    // 1. mimetype (first entry, exact string)
    assert.ok(unzipped['mimetype']);
    const mimetypeStr = fflate.strFromU8(unzipped['mimetype']);
    assert.equal(mimetypeStr, 'application/epub+zip');

    // 2. META-INF/container.xml
    assert.ok(unzipped['META-INF/container.xml']);
    const containerXml = fflate.strFromU8(unzipped['META-INF/container.xml']);
    assert.ok(containerXml.includes('full-path="OEBPS/content.opf"'));

    // 3. OEBPS/content.opf
    assert.ok(unzipped['OEBPS/content.opf']);
    const opf = fflate.strFromU8(unzipped['OEBPS/content.opf']);
    assert.ok(opf.includes('<dc:title>رسالة في الطب النبوي</dc:title>'));
    assert.ok(opf.includes('<dc:creator opf:role="aut">ابن القيم</dc:creator>'));
    assert.ok(opf.includes('<dc:language>ar</dc:language>'));
    assert.ok(opf.includes('href="chapter_1.xhtml"'));
    assert.ok(opf.includes('href="images/cover.jpg"'));

    // 4. OEBPS/toc.ncx
    assert.ok(unzipped['OEBPS/toc.ncx']);
    const ncx = fflate.strFromU8(unzipped['OEBPS/toc.ncx']);
    assert.ok(ncx.includes('src="chapter_1.xhtml"'));

    // 5. OEBPS/chapter_1.xhtml with RTL direction
    assert.ok(unzipped['OEBPS/chapter_1.xhtml']);
    const chapterHtml = fflate.strFromU8(unzipped['OEBPS/chapter_1.xhtml']);
    assert.ok(chapterHtml.includes('dir="rtl"'));
    assert.ok(chapterHtml.includes('lang="ar"'));
    assert.ok(chapterHtml.includes('فصل في قواعد حفظ الصحة والتداوي.'));

    // 6. OEBPS/style.css
    assert.ok(unzipped['OEBPS/style.css']);
    const css = fflate.strFromU8(unzipped['OEBPS/style.css']);
    assert.ok(css.includes('direction: rtl'));

    // 7. OEBPS/images/cover.jpg
    assert.ok(unzipped['OEBPS/images/cover.jpg']);
  });

  it('builds a multi-chapter serialized novel EPUB correctly', () => {
    const chapters = [
      { title: 'الفصل الأول: البداية', contentHtml: '<p>كان ياما كان...</p>', index: 1 },
      { title: 'الفصل الثاني: الرحلة', contentHtml: '<p>انطلق المسافر في رحلته...</p>', index: 2 },
      { title: 'الفصل الثالث: الخاتمة', contentHtml: '<p>وصل المسافر إلى بغداد...</p>', index: 3 },
    ];

    const epubBuffer = packager.packageSerializedNovelToEpub(chapters, {
      title: 'رحلة ابن بطوطة',
      author: 'ابن بطوطة',
      language: 'ar',
    });

    const unzipped = fflate.unzipSync(new Uint8Array(epubBuffer));

    assert.ok(unzipped['OEBPS/chapter_1.xhtml']);
    assert.ok(unzipped['OEBPS/chapter_2.xhtml']);
    assert.ok(unzipped['OEBPS/chapter_3.xhtml']);

    const ncx = fflate.strFromU8(unzipped['OEBPS/toc.ncx']);
    assert.ok(ncx.includes('الفصل الأول: البداية'));
    assert.ok(ncx.includes('الفصل الثاني: الرحلة'));
    assert.ok(ncx.includes('الفصل الثالث: الخاتمة'));
  });
});
