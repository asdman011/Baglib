import { describe, it } from 'node:test';
import assert from 'node:assert';
import { EmbeddedMetadataExtractor } from '../../../src/main/services/metadata/embedded-metadata.extractor';
import { coverResolverService } from '../../../src/main/services/metadata/cover-resolver.service';
import { bibliographicMetadataService } from '../../../src/main/services/metadata/bibliographic-metadata.service';

/**
 * Creates a synthetic in-memory PDF with an embedded JPEG image
 */
function createSyntheticPdfWithImage(options?: { width?: number; height?: number }): Buffer {
  const width = options?.width || 200;
  const height = options?.height || 300;

  // Minimal valid 1x1 JPEG buffer
  const jpegBase64 =
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
  const jpegBuffer = Buffer.from(jpegBase64, 'base64');

  const pdfParts: Buffer[] = [];
  pdfParts.push(Buffer.from('%PDF-1.4\n'));
  pdfParts.push(Buffer.from('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'));
  pdfParts.push(Buffer.from('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n'));
  pdfParts.push(
    Buffer.from(
      '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /XObject << /Cover 4 0 R >> >> >>\nendobj\n'
    )
  );

  const streamHeader = Buffer.from(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBuffer.length} >>\nstream\n`
  );
  const streamFooter = Buffer.from('\nendstream\nendobj\n');

  pdfParts.push(streamHeader);
  pdfParts.push(jpegBuffer);
  pdfParts.push(streamFooter);
  pdfParts.push(
    Buffer.from('xref\n0 5\n0000000000 65535 f \ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n500\n%%EOF')
  );

  return Buffer.concat(pdfParts);
}

/**
 * Creates a text-only PDF without images
 */
function createSyntheticTextOnlyPdf(): Buffer {
  const pdfParts: Buffer[] = [];
  pdfParts.push(Buffer.from('%PDF-1.4\n'));
  pdfParts.push(Buffer.from('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'));
  pdfParts.push(Buffer.from('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n'));
  pdfParts.push(Buffer.from('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] >>\nendobj\n'));
  pdfParts.push(Buffer.from('xref\n0 4\n0000000000 65535 f \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n300\n%%EOF'));
  return Buffer.concat(pdfParts);
}

/**
 * Creates a synthetic multi-page PDF with an image on page 1 and an image on page 2
 */
function createSyntheticMultiPagePdfWithImages(): Buffer {
  const jpegBase64 =
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
  const jpegBuffer = Buffer.from(jpegBase64, 'base64');

  const pdfParts: Buffer[] = [];
  pdfParts.push(Buffer.from('%PDF-1.4\n'));
  pdfParts.push(Buffer.from('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'));
  pdfParts.push(Buffer.from('2 0 obj\n<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>\nendobj\n'));

  // Page 1
  pdfParts.push(
    Buffer.from(
      '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /XObject << /Img1 4 0 R >> >> >>\nendobj\n'
    )
  );
  pdfParts.push(
    Buffer.from(
      `4 0 obj\n<< /Type /XObject /Subtype /Image /Width 200 /Height 300 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBuffer.length} >>\nstream\n`
    )
  );
  pdfParts.push(jpegBuffer);
  pdfParts.push(Buffer.from('\nendstream\nendobj\n'));

  // Page 2
  pdfParts.push(
    Buffer.from(
      '5 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /XObject << /Img2 6 0 R >> >> >>\nendobj\n'
    )
  );
  pdfParts.push(
    Buffer.from(
      `6 0 obj\n<< /Type /XObject /Subtype /Image /Width 400 /Height 600 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBuffer.length} >>\nstream\n`
    )
  );
  pdfParts.push(jpegBuffer);
  pdfParts.push(Buffer.from('\nendstream\nendobj\n'));

  pdfParts.push(
    Buffer.from('xref\n0 7\n0000000000 65535 f \ntrailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n800\n%%EOF')
  );

  return Buffer.concat(pdfParts);
}

describe('PDF Cover Extractor Unit Tests', () => {
  it('extracts the first embedded JPEG image from a PDF buffer', () => {
    const pdfBuf = createSyntheticPdfWithImage({ width: 300, height: 450 });
    const result = EmbeddedMetadataExtractor.extractFirstPdfImage(pdfBuf);

    assert.ok(result, 'Expected PDF cover extraction to succeed');
    assert.strictEqual(result.coverMimeType, 'image/jpeg');
    assert.strictEqual(result.width, 300);
    assert.strictEqual(result.height, 450);
    assert.ok(result.dataUrl.startsWith('data:image/jpeg;base64,'));
    assert.ok(result.coverBuffer.length > 50);
    assert.strictEqual(result.isPageOne, true);
  });

  it('gracefully returns null when a PDF contains no embedded images', () => {
    const textPdf = createSyntheticTextOnlyPdf();
    const result = EmbeddedMetadataExtractor.extractFirstPdfImage(textPdf);

    assert.strictEqual(result, null);
  });

  it('safely handles empty or corrupt PDF buffers', () => {
    const corruptBuf = Buffer.from('not a pdf at all');
    const result = EmbeddedMetadataExtractor.extractFirstPdfImage(corruptBuf);

    assert.strictEqual(result, null);
  });

  it('integrates with CoverResolverService.extractPdfCover', async () => {
    const pdfBuf = createSyntheticPdfWithImage();
    const os = await import('os');
    const path = await import('path');
    const fs = await import('fs');
    const tempFile = path.join(os.tmpdir(), `temp_test_pdf_${Date.now()}.pdf`);
    fs.writeFileSync(tempFile, pdfBuf);

    try {
      const resolution = await coverResolverService.extractPdfCover(tempFile);
      assert.strictEqual(resolution.verified, true);
      assert.strictEqual(resolution.source, 'embedded');
      assert.ok(resolution.coverUrl?.startsWith('data:image/jpeg;base64,'));
    } finally {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }
  });

  it('integrates with BibliographicMetadataService.extractPdfCover', async () => {
    const pdfBuf = createSyntheticPdfWithImage();
    const os = await import('os');
    const path = await import('path');
    const fs = await import('fs');
    const tempFile = path.join(os.tmpdir(), `temp_bib_test_pdf_${Date.now()}.pdf`);
    fs.writeFileSync(tempFile, pdfBuf);

    try {
      const coverUrl = await bibliographicMetadataService.extractPdfCover(tempFile);
      assert.ok(coverUrl, 'Expected coverUrl to be resolved');
      assert.ok(coverUrl.startsWith('data:image/jpeg;base64,'));
    } finally {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }
  });

  it('allows navigating between next and previous pages in a multi-page PDF', async () => {
    const multiPdf = createSyntheticMultiPagePdfWithImages();

    // 1. Extract first page (candidate 1)
    const page1Result = EmbeddedMetadataExtractor.extractPdfImage(multiPdf, 1);
    assert.ok(page1Result, 'Expected page 1 image extraction');
    assert.strictEqual(page1Result.width, 200);
    assert.strictEqual(page1Result.height, 300);
    assert.strictEqual(page1Result.pageIndex, 1);
    assert.strictEqual(page1Result.totalPages, 2);

    // 2. Extract next page (candidate 2)
    const page2Result = EmbeddedMetadataExtractor.extractPdfImage(multiPdf, 2);
    assert.ok(page2Result, 'Expected page 2 image extraction');
    assert.strictEqual(page2Result.width, 400);
    assert.strictEqual(page2Result.height, 600);
    assert.strictEqual(page2Result.pageIndex, 2);
    assert.strictEqual(page2Result.totalPages, 2);

    // 3. Navigate back to previous page (candidate 1)
    const prevResult = EmbeddedMetadataExtractor.extractPdfImage(multiPdf, 1);
    assert.ok(prevResult);
    assert.strictEqual(prevResult.pageIndex, 1);
    assert.strictEqual(prevResult.width, 200);
  });
});
