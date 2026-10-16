import * as fflate from 'fflate';
import type { ClippedArticle, ClippedImage } from '../../../shared/types/web-clipper';

export interface EpubChapterInput {
  title: string;
  contentHtml: string;
  index: number;
}

export interface EpubPackageMetadata {
  title: string;
  author?: string;
  language?: string;
  sourceUrl?: string;
  identifier?: string;
  description?: string;
  date?: string;
}

function escapeXml(str?: string | null): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export class EpubPackagerService {
  private static instance: EpubPackagerService;

  public static getInstance(): EpubPackagerService {
    if (!this.instance) {
      this.instance = new EpubPackagerService();
    }
    return this.instance;
  }

  /**
   * Package a single clipped article into a complete EPUB archive buffer
   */
  public packageArticleToEpub(
    article: ClippedArticle,
    contentHtml: string,
    images: ClippedImage[] = []
  ): Buffer {
    const chapters: EpubChapterInput[] = [
      {
        title: article.title,
        contentHtml,
        index: 1,
      },
    ];

    const metadata: EpubPackageMetadata = {
      title: article.title,
      author: article.byline || article.siteName || 'Web Clip',
      language: article.language || 'en',
      sourceUrl: article.url,
      identifier: `baglib:clip:${Date.now()}`,
      description: article.excerpt,
      date: article.publishedTime || new Date().toISOString().split('T')[0],
    };

    return this.buildEpub(chapters, metadata, images);
  }

  /**
   * Package multiple serialized chapters (e.g. serialized novel or multi-part essay) into an EPUB buffer
   */
  public packageSerializedNovelToEpub(
    chapters: EpubChapterInput[],
    metadata: EpubPackageMetadata,
    images: ClippedImage[] = []
  ): Buffer {
    return this.buildEpub(chapters, metadata, images);
  }

  /**
   * Package article into a clean Markdown string with YAML frontmatter
   */
  public packageToMarkdown(article: ClippedArticle, rawMarkdownBody?: string): string {
    const isRtl = article.language === 'ar' || /[\u0600-\u06FF]/.test(article.title);
    const body = rawMarkdownBody || this.htmlToSimpleMarkdown(article.content);

    return `---
title: "${article.title.replace(/"/g, '\\"')}"
author: "${(article.byline || article.siteName || '').replace(/"/g, '\\"')}"
source: "${article.url}"
date: "${article.publishedTime || new Date().toISOString()}"
language: "${article.language || (isRtl ? 'ar' : 'en')}"
dir: "${isRtl ? 'rtl' : 'ltr'}"
---

# ${article.title}

${article.byline ? `*By ${article.byline}* | [Original Source](${article.url})\n` : ''}
${body}
`;
  }

  /**
   * Build complete EPUB archive using fflate.zipSync
   */
  public buildEpub(
    chapters: EpubChapterInput[],
    metadata: EpubPackageMetadata,
    images: ClippedImage[] = []
  ): Buffer {
    const isRtl = metadata.language === 'ar' || /[\u0600-\u06FF]/.test(metadata.title);
    const textDir = isRtl ? 'rtl' : 'ltr';
    const lang = metadata.language || (isRtl ? 'ar' : 'en');
    const identifier = metadata.identifier || `urn:uuid:${Date.now()}`;
    const title = escapeXml(metadata.title);
    const author = escapeXml(metadata.author || 'Baglib Web Clipper');
    const updated = new Date().toISOString();

    const zipFiles: fflate.AsyncZippable = {};

    // 1. mimetype (MUST be uncompressed)
    zipFiles['mimetype'] = [fflate.strToU8('application/epub+zip'), { level: 0 }];

    // 2. META-INF/container.xml
    const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
    zipFiles['META-INF/container.xml'] = fflate.strToU8(containerXml);

    // 3. OEBPS/style.css
    const cssContent = `
@charset "utf-8";
body {
  margin: 5%;
  text-align: justify;
  line-height: 1.6;
  direction: ${textDir};
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Cairo", "Amiri", sans-serif;
}
h1, h2, h3, h4 {
  line-height: 1.3;
  margin-block-start: 1.2em;
  margin-block-end: 0.6em;
  text-align: start;
}
h1 { font-size: 1.8em; }
h2 { font-size: 1.4em; }
p { margin-block: 0.8em; text-indent: 0; }
img {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 1.5em auto;
}
blockquote {
  margin-inline-start: 1.5em;
  margin-inline-end: 1.5em;
  padding-inline-start: 1em;
  border-inline-start: 3px solid #6366f1;
  color: #555;
}
pre, code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  background-color: rgba(0, 0, 0, 0.05);
}
pre {
  padding: 1em;
  overflow-x: auto;
  white-space: pre-wrap;
}
`;
    zipFiles['OEBPS/style.css'] = fflate.strToU8(cssContent);

    // 4. Manifest items & spine items
    let manifestItems = `    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="style" href="style.css" media-type="text/css"/>\n`;
    let spineItems = '';
    let navPoints = '';

    chapters.forEach((ch, idx) => {
      const chId = `chapter_${idx + 1}`;
      const chFileName = `${chId}.xhtml`;
      const chTitle = escapeXml(ch.title || `Chapter ${idx + 1}`);

      manifestItems += `    <item id="${chId}" href="${chFileName}" media-type="application/xhtml+xml"/>\n`;
      spineItems += `    <itemref idref="${chId}"/>\n`;

      navPoints += `    <navPoint id="navPoint-${idx + 1}" playOrder="${idx + 1}">
      <navLabel><text>${chTitle}</text></navLabel>
      <content src="${chFileName}"/>
    </navPoint>\n`;

      const xhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="${lang}" dir="${textDir}">
<head>
  <meta charset="utf-8"/>
  <title>${chTitle}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <h1>${chTitle}</h1>
  ${ch.contentHtml}
</body>
</html>`;

      zipFiles[`OEBPS/${chFileName}`] = fflate.strToU8(xhtml);
    });

    // 5. Embed Images
    images.forEach((img, idx) => {
      const imgId = `img_${idx + 1}`;
      const relativeHref = img.localPath.replace(/^OEBPS\//, '');
      manifestItems += `    <item id="${imgId}" href="${relativeHref}" media-type="${img.mimeType}"/>\n`;
      zipFiles[`OEBPS/${relativeHref}`] = new Uint8Array(img.data);
    });

    // 6. OEBPS/content.opf
    const opfContent = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.openpackagingformats.org/2007/opf" unique-identifier="BookID" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.openpackagingformats.org/2007/opf">
    <dc:title>${title}</dc:title>
    <dc:creator opf:role="aut">${author}</dc:creator>
    <dc:language>${lang}</dc:language>
    <dc:identifier id="BookID" opf:scheme="URN">${escapeXml(identifier)}</dc:identifier>
    <dc:date>${metadata.date || updated.split('T')[0]}</dc:date>
    ${metadata.sourceUrl ? `<dc:source>${escapeXml(metadata.sourceUrl)}</dc:source>` : ''}
    ${metadata.description ? `<dc:description>${escapeXml(metadata.description)}</dc:description>` : ''}
  </metadata>
  <manifest>
${manifestItems}  </manifest>
  <spine toc="ncx">
${spineItems}  </spine>
</package>`;
    zipFiles['OEBPS/content.opf'] = fflate.strToU8(opfContent);

    // 7. OEBPS/toc.ncx
    const ncxContent = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${escapeXml(identifier)}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle>
    <text>${title}</text>
  </docTitle>
  <navMap>
${navPoints}  </navMap>
</ncx>`;
    zipFiles['OEBPS/toc.ncx'] = fflate.strToU8(ncxContent);

    // Compress synchronously
    const zipData = fflate.zipSync(zipFiles, { level: 6 });
    return Buffer.from(zipData);
  }

  private htmlToSimpleMarkdown(html: string): string {
    return html
      .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '\n# $1\n')
      .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '\n## $1\n')
      .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '\n### $1\n')
      .replace(/<p[^>]*>(.*?)<\/p>/gi, '\n$1\n')
      .replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi, '\n> $1\n')
      .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
      .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
      .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
      .replace(/<img[^>]*src=["'](.*?)["'][^>]*>/gi, '\n![]($1)\n')
      .replace(/<a[^>]*href=["'](.*?)["'][^>]*>(.*?)<\/a>/gi, '[$2]($1)')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}
