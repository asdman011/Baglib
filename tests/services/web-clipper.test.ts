import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ReadabilityExtractorService } from '../../src/main/services/clipper/readability-extractor.service';
import { EpubPackagerService } from '../../src/main/services/clipper/epub-packager.service';
import type { ClippedArticle } from '../../src/shared/types/web-clipper';

const SAMPLE_HTML = `<!DOCTYPE html>
<html lang="ar">
<head>
  <meta charset="utf-8">
  <title>المخطوطات العربية في بيت الحكمة</title>
  <meta name="author" content="د. أحمد الشامي">
  <meta name="description" content="دراسة تاريخية حول ترجمة وحفظ العلوم في بغداد العباسية.">
  <meta property="og:title" content="المخطوطات العربية في بيت الحكمة">
  <meta property="og:site_name" content="مجلة التراث">
  <meta property="article:published_time" content="2026-05-10">
</head>
<body>
  <nav>Navigation header to be stripped</nav>
  <div class="ad-banner">Promotional ad banner</div>
  <article>
    <h1>المخطوطات العربية في بيت الحكمة</h1>
    <p class="byline">بقلم: د. أحمد الشامي</p>
    <p>كان بيت الحكمة في بغداد يمثل أعظم صرح علمي وأكاديمي في العصر الذهبي للحضارة الإسلامية.</p>
    <p>تجمع فيه نخبة من العلماء والمترجمين لنقل العلوم الفلسفية والطبية والفلكية إلى لغة الضاد.</p>
    <img src="/assets/small.jpg" srcset="/assets/small.jpg 300w, /assets/large.jpg 1200w" alt="صورة المخطوطة"/>
    <img data-src="/assets/lazy-diagram.png" src="data:image/svg+xml;..." alt="مخطط بيت الحكمة"/>
  </article>
  <footer>Footer copyright to be removed</footer>
</body>
</html>`;

describe('ReadabilityExtractorService & Clipper (Task 5.2 / KEY-148)', () => {
  const extractor = ReadabilityExtractorService.getInstance();
  const packager = EpubPackagerService.getInstance();

  it('extracts clean article metadata and content using Readability and Linkedom', () => {
    const article: ClippedArticle = extractor.extractFromHtml(SAMPLE_HTML, 'https://example.com/heritage/bayt-al-hikma');

    assert.equal(article.title, 'المخطوطات العربية في بيت الحكمة');
    assert.ok(article.byline?.includes('أحمد الشامي'));
    assert.equal(article.siteName, 'مجلة التراث');
    assert.equal(article.language, 'ar');
    assert.ok(article.textContent.includes('كان بيت الحكمة في بغداد'));
    assert.equal(article.textContent.includes('Navigation header to be stripped'), false);
    assert.equal(article.textContent.includes('Promotional ad banner'), false);
  });

  it('picks highest resolution images from srcset and lazy load attributes', () => {
    const article = extractor.extractFromHtml(SAMPLE_HTML, 'https://example.com/heritage/bayt-al-hikma');

    // Should resolve /assets/large.jpg from srcset 1200w
    assert.ok(article.images.includes('https://example.com/assets/large.jpg'));
    // Should resolve /assets/lazy-diagram.png from data-src
    assert.ok(article.images.includes('https://example.com/assets/lazy-diagram.png'));
  });

  it('packages article into clean Markdown with YAML frontmatter', () => {
    const article: ClippedArticle = {
      title: 'تاريخ الوراقة في بغداد',
      byline: 'المؤرخ البغدادي',
      url: 'https://example.com/waraqah',
      content: '<p>انتشرت صناعة الورق في بغداد في عهد الرشيد.</p>',
      textContent: 'انتشرت صناعة الورق في بغداد في عهد الرشيد.',
      length: 100,
      language: 'ar',
      images: [],
    };

    const markdown = packager.packageToMarkdown(article);
    assert.ok(markdown.startsWith('---'));
    assert.ok(markdown.includes('title: "تاريخ الوراقة في بغداد"'));
    assert.ok(markdown.includes('author: "المؤرخ البغدادي"'));
    assert.ok(markdown.includes('dir: "rtl"'));
    assert.ok(markdown.includes('# تاريخ الوراقة في بغداد'));
    assert.ok(markdown.includes('انتشرت صناعة الورق في بغداد'));
  });
});
