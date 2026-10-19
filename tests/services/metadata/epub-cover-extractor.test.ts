import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import * as fflate from 'fflate';
import { EpubCoverExtractor } from '../../../src/main/services/metadata/epub-cover-extractor.service';
import { coverResolverService } from '../../../src/main/services/metadata/cover-resolver.service';
import { bibliographicMetadataService } from '../../../src/main/services/metadata/bibliographic-metadata.service';
import { EmbeddedMetadataExtractor } from '../../../src/main/services/metadata/embedded-metadata.extractor';

const validJpegBase64 =
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
const minimalJpeg = Buffer.from(validJpegBase64, 'base64');
const largeJpeg = Buffer.concat([minimalJpeg, Buffer.alloc(6000, 0x20)]);

function createEpubZip(files: Record<string, Uint8Array | string>): Buffer {
  const zipData: Record<string, Uint8Array> = {
    mimetype: fflate.strToU8('application/epub+zip'),
  };
  for (const [p, content] of Object.entries(files)) {
    zipData[p] = typeof content === 'string' ? fflate.strToU8(content) : content;
  }
  return Buffer.from(fflate.zipSync(zipData));
}

function writeTempEpub(name: string, files: Record<string, Uint8Array | string>): string {
  const buf = createEpubZip(files);
  const tempPath = path.join(os.tmpdir(), `test_epub_${Date.now()}_${name}.epub`);
  fs.writeFileSync(tempPath, buf);
  return tempPath;
}

describe('EPUB Cover Extractor Comprehensive Test Suite', () => {
  it('Tier 1: extracts cover from EPUB 3 manifest properties="cover-image" with nested OPF directory', async () => {
    const containerXml = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/package.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

    const packageOpf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>EPUB 3 Sample</dc:title>
  </metadata>
  <manifest>
    <item id="cover" href="images/cover_art.jpeg" media-type="image/jpeg" properties="cover-image"/>
    <item id="chapter1" href="text/ch1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="chapter1"/>
  </spine>
</package>`;

    const tempFile = writeTempEpub('tier1', {
      'META-INF/container.xml': containerXml,
      'OEBPS/package.opf': packageOpf,
      'OEBPS/images/cover_art.jpeg': minimalJpeg,
    });

    try {
      const result = await EpubCoverExtractor.extractCover(tempFile);
      assert.ok(result, 'Expected cover extraction to succeed');
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.tierUsed, 1);
      assert.strictEqual(result.coverMimeType, 'image/jpeg');
      assert.ok(result.dataUrl?.startsWith('data:image/jpeg;base64,'));
      assert.ok(result.coverBuffer && result.coverBuffer.length > 50);
      assert.ok(result.savedFilePath && fs.existsSync(result.savedFilePath));
    } finally {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }
  });

  it('Tier 2: extracts cover from EPUB 2 <meta name="cover"> with reversed attribute order and URL-encoded href', async () => {
    const containerXml = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

    // Calibre-style attribute ordering: content before name, href before id
    const contentOpf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0">
  <metadata>
    <meta content="my_cover_id" name="cover" />
  </metadata>
  <manifest>
    <item href="Covers/Book%20Cover.jpg" id="my_cover_id" media-type="image/jpeg" />
  </manifest>
  <spine></spine>
</package>`;

    const tempFile = writeTempEpub('tier2', {
      'META-INF/container.xml': containerXml,
      'content.opf': contentOpf,
      'Covers/Book Cover.jpg': minimalJpeg,
    });

    try {
      const result = await EpubCoverExtractor.extractCover(tempFile);
      assert.ok(result, 'Expected cover extraction to succeed');
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.tierUsed, 2);
      assert.strictEqual(result.coverMimeType, 'image/jpeg');
      assert.ok(result.dataUrl?.startsWith('data:image/jpeg;base64,'));
    } finally {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }
  });

  it('Tier 3: extracts cover image wrapped in SVG inside XHTML cover page with relative path navigation', async () => {
    const containerXml = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OPS/package.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

    const packageOpf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0">
  <manifest>
    <item id="coverpage" href="xhtml/cover.xhtml" media-type="application/xhtml+xml"/>
    <item id="img1" href="images/actual_cover.png" media-type="image/png"/>
  </manifest>
  <spine>
    <itemref idref="coverpage"/>
  </spine>
  <guide>
    <reference type="cover" title="Cover" href="xhtml/cover.xhtml"/>
  </guide>
</package>`;

    // Relative link uses ../images/actual_cover.png from xhtml/cover.xhtml
    const coverXhtml = `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Cover</title></head>
<body>
  <div style="text-align: center;">
    <svg xmlns="http://www.w3.org/2000/svg" height="100%" width="100%" viewBox="0 0 600 800">
      <image width="600" height="800" xlink:href="../images/actual_cover.png"/>
    </svg>
  </div>
</body>
</html>`;

    const tempFile = writeTempEpub('tier3', {
      'META-INF/container.xml': containerXml,
      'OPS/package.opf': packageOpf,
      'OPS/xhtml/cover.xhtml': coverXhtml,
      'OPS/images/actual_cover.png': minimalJpeg,
    });

    try {
      const result = await EpubCoverExtractor.extractCover(tempFile);
      assert.ok(result, 'Expected cover extraction to succeed');
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.tierUsed, 3);
      assert.ok(result.dataUrl?.startsWith('data:image/png;base64,'));
    } finally {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }
  });

  it('Tier 4: discovers cover from archive filename heuristics including Arabic names', async () => {
    const containerXml = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="book.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

    const bookOpf = `<?xml version="1.0"?>
<package version="2.0">
  <metadata></metadata>
  <manifest>
    <item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine><itemref idref="c1"/></spine>
</package>`;

    const tempFile = writeTempEpub('tier4', {
      'META-INF/container.xml': containerXml,
      'book.opf': bookOpf,
      'c1.xhtml': '<html/>',
      'media/غلاف_الرواية.jpg': minimalJpeg,
    });

    try {
      const result = await EpubCoverExtractor.extractCover(tempFile);
      assert.ok(result, 'Expected Tier 4 cover extraction to succeed');
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.tierUsed, 4);
      assert.ok(result.dataUrl?.startsWith('data:image/jpeg;base64,'));
    } finally {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }
  });

  it('Tier 5: extracts the first substantial image (>5KB) referenced in the initial spine document', async () => {
    const containerXml = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

    const contentOpf = `<?xml version="1.0"?>
<package version="2.0">
  <manifest>
    <item id="p1" href="first_page.html" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="p1"/>
  </spine>
</package>`;

    const firstPageHtml = `<html><body><img src="assets/main_graphic.jpg" alt="graphic"/></body></html>`;

    const tempFile = writeTempEpub('tier5', {
      'META-INF/container.xml': containerXml,
      'content.opf': contentOpf,
      'first_page.html': firstPageHtml,
      'assets/main_graphic.jpg': largeJpeg,
    });

    try {
      const result = await EpubCoverExtractor.extractCover(tempFile);
      assert.ok(result, 'Expected Tier 5 cover extraction to succeed');
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.tierUsed, 5);
      assert.ok(result.dataUrl?.startsWith('data:image/jpeg;base64,'));
    } finally {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }
  });

  it('gracefully returns null for text-only EPUB or corrupted archives without throwing', async () => {
    const corruptFile = path.join(os.tmpdir(), `corrupt_${Date.now()}.epub`);
    fs.writeFileSync(corruptFile, Buffer.from('not an epub archive at all'));

    try {
      const result = await EpubCoverExtractor.extractCover(corruptFile);
      assert.ok(result);
      assert.strictEqual(result.success, false);
      assert.ok(result.error);
    } finally {
      if (fs.existsSync(corruptFile)) fs.unlinkSync(corruptFile);
    }
  });

  it('integrates seamlessly with CoverResolverService.extractEpubCover', async () => {
    const containerXml = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

    const contentOpf = `<?xml version="1.0"?>
<package version="3.0">
  <manifest>
    <item id="cov" href="cov.jpg" media-type="image/jpeg" properties="cover-image"/>
  </manifest>
  <spine></spine>
</package>`;

    const tempFile = writeTempEpub('resolver', {
      'META-INF/container.xml': containerXml,
      'OEBPS/content.opf': contentOpf,
      'OEBPS/cov.jpg': minimalJpeg,
    });

    try {
      const resolution = await coverResolverService.extractEpubCover(tempFile);
      assert.strictEqual(resolution.verified, true);
      assert.strictEqual(resolution.source, 'embedded');
      assert.ok(resolution.coverUrl?.startsWith('data:image/jpeg;base64,'));
    } finally {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }
  });

  it('integrates seamlessly with BibliographicMetadataService.extractEpubCover', async () => {
    const containerXml = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

    const contentOpf = `<?xml version="1.0"?>
<package version="2.0">
  <metadata><meta name="cover" content="cimg"/></metadata>
  <manifest><item id="cimg" href="cover.jpg" media-type="image/jpeg"/></manifest>
  <spine></spine>
</package>`;

    const tempFile = writeTempEpub('bibservice', {
      'META-INF/container.xml': containerXml,
      'content.opf': contentOpf,
      'cover.jpg': minimalJpeg,
    });

    try {
      const coverUrl = await bibliographicMetadataService.extractEpubCover(tempFile);
      assert.ok(coverUrl);
      assert.ok(coverUrl.startsWith('data:image/jpeg;base64,'));
    } finally {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }
  });

  it('integrates with EmbeddedMetadataExtractor.extract', async () => {
    const containerXml = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

    const contentOpf = `<?xml version="1.0"?>
<package version="2.0">
  <metadata>
    <meta name="cover" content="cimg"/>
    <dc:title xmlns:dc="http://purl.org/dc/elements/1.1/">Integrated Book</dc:title>
  </metadata>
  <manifest><item id="cimg" href="cover.jpg" media-type="image/jpeg"/></manifest>
  <spine></spine>
</package>`;

    const tempFile = writeTempEpub('embedded_meta', {
      'META-INF/container.xml': containerXml,
      'content.opf': contentOpf,
      'cover.jpg': minimalJpeg,
    });

    try {
      const meta = await EmbeddedMetadataExtractor.extract(tempFile);
      assert.ok(meta);
      assert.strictEqual(meta.title, 'Integrated Book');
      assert.ok(meta.coverBuffer && meta.coverBuffer.length > 50);
      assert.strictEqual(meta.coverMimeType, 'image/jpeg');
    } finally {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }
  });
});
