import fs from 'fs';
import path from 'path';
import type { DigitalFormat } from '../../../shared/types/work';
import type {
  DigitalFileValidationResult,
  DigitalFileErrorCode,
  BatchValidationSummary,
} from '../../../shared/types/digital-file';

/**
 * Maximum header slice read into memory for magic-byte and structure inspection.
 */
const HEADER_PROBE_SIZE = 4096;

/**
 * Supported digital formats and their standard configurations.
 */
const SUPPORTED_EXTENSIONS_MAP: Record<string, { format: DigitalFormat; mimeType: string }> = {
  '.pdf': { format: 'PDF', mimeType: 'application/pdf' },
  '.epub': { format: 'EPUB', mimeType: 'application/epub+zip' },
  '.mobi': { format: 'MOBI', mimeType: 'application/x-mobipocket-ebook' },
  '.prc': { format: 'MOBI', mimeType: 'application/x-mobipocket-ebook' },
  '.azw3': { format: 'AZW3', mimeType: 'application/vnd.amazon.ebook' },
  '.azw': { format: 'AZW3', mimeType: 'application/vnd.amazon.ebook' },
  '.html': { format: 'HTML', mimeType: 'text/html' },
  '.htm': { format: 'HTML', mimeType: 'text/html' },
  '.xhtml': { format: 'HTML', mimeType: 'application/xhtml+xml' },
  '.txt': { format: 'TXT', mimeType: 'text/plain' },
};

export class DigitalFileValidatorService {
  private static instance: DigitalFileValidatorService;

  public static getInstance(): DigitalFileValidatorService {
    if (!this.instance) {
      this.instance = new DigitalFileValidatorService();
    }
    return this.instance;
  }

  /**
   * Returns list of all supported canonical digital formats.
   */
  public getSupportedFormats(): DigitalFormat[] {
    return ['PDF', 'EPUB', 'MOBI', 'AZW3', 'HTML', 'TXT'];
  }

  /**
   * Checks whether an extension (e.g. '.pdf') or format (e.g. 'PDF') is supported.
   */
  public isFormatSupported(extOrFormat: string): boolean {
    const clean = extOrFormat.toLowerCase().trim();
    if (SUPPORTED_EXTENSIONS_MAP[clean.startsWith('.') ? clean : `.${clean}`]) {
      return true;
    }
    return this.getSupportedFormats().some((f) => f.toLowerCase() === clean);
  }

  /**
   * Validates a local digital file on disk by inspecting file stats and magic bytes.
   */
  public async validateFile(filePath: string): Promise<DigitalFileValidationResult> {
    const fileName = path.basename(filePath);
    const extension = path.extname(filePath).toLowerCase();

    // 1. File existence and accessibility
    let stats: fs.Stats;
    try {
      stats = await fs.promises.stat(filePath);
    } catch (err: any) {
      return this.buildFailureResult({
        fileName,
        extension,
        filePath,
        fileSizeBytes: 0,
        errorCode: 'FILE_NOT_FOUND',
        error: `الملف غير موجود أو لا يمكن الوصول إليه: ${fileName} / File not found or inaccessible: ${fileName}`,
      });
    }

    // 2. Ensure it's a regular file
    if (!stats.isFile()) {
      return this.buildFailureResult({
        fileName,
        extension,
        filePath,
        fileSizeBytes: stats.size,
        errorCode: 'UNSUPPORTED_FORMAT',
        error: `المسار المحدد ليس ملفاً صالحاً: ${fileName} / The specified path is not a regular file: ${fileName}`,
      });
    }

    // 3. Early check: Zero-byte empty file
    if (stats.size === 0) {
      return this.buildFailureResult({
        fileName,
        extension,
        filePath,
        fileSizeBytes: 0,
        errorCode: 'EMPTY_FILE',
        error: `الملف فارغ (0 بايت): ${fileName} / File is empty (0 bytes): ${fileName}`,
      });
    }

    // 4. Read header probe slice
    let headerBuffer: Buffer;
    let fileHandle: fs.promises.FileHandle | null = null;
    try {
      fileHandle = await fs.promises.open(filePath, 'r');
      const readLength = Math.min(stats.size, HEADER_PROBE_SIZE);
      headerBuffer = Buffer.alloc(readLength);
      await fileHandle.read(headerBuffer, 0, readLength, 0);
    } catch (err: any) {
      return this.buildFailureResult({
        fileName,
        extension,
        filePath,
        fileSizeBytes: stats.size,
        errorCode: 'READ_ERROR',
        error: `فشل قراءة الملف: ${err?.message || fileName} / Failed to read file bytes: ${err?.message || fileName}`,
      });
    } finally {
      if (fileHandle) {
        await fileHandle.close().catch(() => {});
      }
    }

    // 5. Inspect magic bytes and structure
    return this.validateBuffer(headerBuffer, fileName, filePath, stats.size);
  }

  /**
   * Validates in-memory buffer against magic bytes and format signatures.
   */
  public validateBuffer(
    buffer: Buffer,
    fileName: string,
    filePath?: string,
    fileSizeBytes?: number
  ): DigitalFileValidationResult {
    const extension = path.extname(fileName).toLowerCase();
    const size = fileSizeBytes ?? buffer.length;

    // Zero-byte check
    if (size === 0) {
      return this.buildFailureResult({
        fileName,
        extension,
        filePath,
        fileSizeBytes: 0,
        errorCode: 'EMPTY_FILE',
        error: `الملف فارغ (0 بايت) / File is empty (0 bytes)`,
      });
    }

    // Detect format from buffer bytes
    const detected = this.detectSignature(buffer, extension);

    // If extension is known and supported
    const expected = SUPPORTED_EXTENSIONS_MAP[extension];

    // Case 1: Extension is supported, but buffer is unrecognized or completely mismatching
    if (expected) {
      if (!detected) {
        return this.buildFailureResult({
          fileName,
          extension,
          filePath,
          fileSizeBytes: size,
          errorCode: 'CORRUPTED_FILE',
          error: `ترويسة الملف تالفة أو غير صالحة لصيغة ${expected.format}: ${fileName} / Corrupted or invalid header for format ${expected.format}: ${fileName}`,
        });
      }

      // Check format family compatibility (e.g. MOBI and AZW3 share the PalmDOC container)
      const isFormatCompatible =
        detected.format === expected.format ||
        (detected.format === 'MOBI' && expected.format === 'AZW3') ||
        (detected.format === 'AZW3' && expected.format === 'MOBI');

      if (!isFormatCompatible) {
        return this.buildFailureResult({
          fileName,
          extension,
          filePath,
          fileSizeBytes: size,
          errorCode: 'SIGNATURE_MISMATCH',
          signatureDetected: detected.signature,
          error: `امتداد الملف (${extension}) لا يطابق الصيغة المكتشفة في المحتوى (${detected.format}) / Extension (${extension}) does not match content signature (${detected.format})`,
        });
      }

      // Successful validation with extension match
      return {
        isValid: true,
        format: expected.format, // retain specific expected format if compatible (e.g. AZW3)
        mimeType: expected.mimeType,
        filePath,
        fileName,
        extension,
        fileSizeBytes: size,
        signatureDetected: detected.signature,
        metadataHint: detected.hint,
      };
    }

    // Case 2: Extension is unsupported or missing, but magic bytes match an e-book format
    if (detected) {
      return {
        isValid: true,
        format: detected.format,
        mimeType: detected.mimeType,
        filePath,
        fileName,
        extension,
        fileSizeBytes: size,
        signatureDetected: detected.signature,
        metadataHint: detected.hint,
      };
    }

    // Case 3: Unsupported format and unknown signature
    return this.buildFailureResult({
      fileName,
      extension,
      filePath,
      fileSizeBytes: size,
      errorCode: 'UNSUPPORTED_FORMAT',
      error: `صيغة الملف غير مدعومة (${extension || 'بدون امتداد'}): ${fileName} / Unsupported file format (${extension || 'no extension'}): ${fileName}`,
    });
  }

  /**
   * Batch validates multiple files sequentially or concurrently.
   */
  public async validateFiles(filePaths: string[]): Promise<BatchValidationSummary> {
    const results: DigitalFileValidationResult[] = [];
    for (let offset = 0; offset < filePaths.length; offset += 4) {
      results.push(...await Promise.all(filePaths.slice(offset, offset + 4).map(filePath => this.validateFile(filePath))));
    }
    const validFiles = results.filter((r) => r.isValid).length;
    return {
      totalFiles: results.length,
      validFiles,
      invalidFiles: results.length - validFiles,
      results,
    };
  }

  /**
   * Probes the buffer bytes for recognized digital document signatures.
   */
  private detectSignature(
    buf: Buffer,
    hintExtension?: string
  ): {
    format: DigitalFormat;
    mimeType: string;
    signature: string;
    hint?: { isEncrypted?: boolean; title?: string; charset?: string };
  } | null {
    if (buf.length < 4) return null;

    // 1. PDF Signature: %PDF-
    // PDF spec allows up to 1024 leading bytes before %PDF- header
    const pdfOffset = buf.indexOf('%PDF-');
    if (pdfOffset !== -1 && pdfOffset <= 1024) {
      const versionStr = buf.slice(pdfOffset, pdfOffset + 8).toString('ascii').trim();
      const isEncrypted = buf.includes(Buffer.from('/Encrypt'));
      return {
        format: 'PDF',
        mimeType: 'application/pdf',
        signature: versionStr.startsWith('%PDF-') ? versionStr : '%PDF',
        hint: { isEncrypted },
      };
    }

    // 2. EPUB Signature: PK\x03\x04 with mimetype application/epub+zip
    // ZIP local file header signature: 0x50 0x4B 0x03 0x04
    if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) {
      const probeStr = buf.toString('latin1', 0, Math.min(buf.length, 256));
      const hasEpubMime = probeStr.includes('application/epub+zip');
      const hasMimetypeEntry = probeStr.includes('mimetype');

      if (hasEpubMime || hasMimetypeEntry || hintExtension === '.epub') {
        return {
          format: 'EPUB',
          mimeType: 'application/epub+zip',
          signature: hasEpubMime ? 'PK/EPUB (application/epub+zip)' : 'PK/ZIP (EPUB container)',
        };
      }
    }

    // 3. MOBI & AZW3: PalmDOC Database Header
    // Standard Palm Database header:
    // Offset 60..67: Type 'BOOK', Creator 'MOBI'
    if (buf.length >= 68) {
      const type = buf.slice(60, 64).toString('latin1');
      const creator = buf.slice(64, 68).toString('latin1');

      if (type === 'BOOK' && creator === 'MOBI') {
        // Distinguish AZW3 (KF8) vs standard MOBI
        const isAzw3Hint = hintExtension === '.azw3' || hintExtension === '.azw';
        const hasKf8Marker = buf.includes(Buffer.from('KF8')) || buf.includes(Buffer.from('BOUNDARY'));

        if (isAzw3Hint || hasKf8Marker) {
          return {
            format: 'AZW3',
            mimeType: 'application/vnd.amazon.ebook',
            signature: 'BOOKMOBI (KF8 / AZW3)',
          };
        }

        return {
          format: 'MOBI',
          mimeType: 'application/x-mobipocket-ebook',
          signature: 'BOOKMOBI (PalmDOC)',
        };
      }

      // Alternative Palm types: TEXtREAd or PalmDOC
      if ((type === 'TEXt' && creator === 'REAd') || creator === 'MOBI') {
        return {
          format: 'MOBI',
          mimeType: 'application/x-mobipocket-ebook',
          signature: `PalmDOC (${type}/${creator})`,
        };
      }
    }

    // 4. HTML / XHTML
    const textPrefix = buf.toString('utf-8', 0, Math.min(buf.length, 1024)).trim().toLowerCase();
    if (
      textPrefix.startsWith('<!doctype html') ||
      textPrefix.startsWith('<html') ||
      (textPrefix.startsWith('<?xml') && (textPrefix.includes('<html') || textPrefix.includes('xhtml'))) ||
      /<(html|head|body|div|p)\b/i.test(textPrefix)
    ) {
      // Extract title if present
      const titleMatch = buf.toString('utf-8', 0, Math.min(buf.length, 2048)).match(/<title[^>]*>([^<]+)<\/title>/i);
      return {
        format: 'HTML',
        mimeType: 'text/html',
        signature: textPrefix.startsWith('<!doctype html') ? '<!DOCTYPE html>' : '<html...>',
        hint: {
          title: titleMatch ? titleMatch[1].trim() : undefined,
        },
      };
    }

    // 5. Plain Text (TXT)
    // Validate text: either UTF-8 BOM, UTF-16 BOM, or pure printable text without control null-bytes
    if (hintExtension === '.txt' || this.isLikelyPlainText(buf)) {
      if (hintExtension === '.txt') {
        const isBinary = this.hasBinaryControlBytes(buf);
        if (!isBinary) {
          const charset = this.detectTextEncoding(buf);
          return {
            format: 'TXT',
            mimeType: 'text/plain',
            signature: `Plain Text (${charset})`,
            hint: { charset },
          };
        }
      }
    }

    return null;
  }

  /**
   * Checks if buffer contains text rather than compiled binary data.
   */
  private isLikelyPlainText(buf: Buffer): boolean {
    // Check BOMs
    if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return true; // UTF-8 BOM
    if (buf[0] === 0xfe && buf[1] === 0xff) return true; // UTF-16 BE
    if (buf[0] === 0xff && buf[1] === 0xfe) return true; // UTF-16 LE

    // Probe first 512 bytes for null bytes or illegal control codes
    return !this.hasBinaryControlBytes(buf);
  }

  /**
   * Checks for binary control bytes (excluding standard whitespace like CR, LF, TAB).
   */
  private hasBinaryControlBytes(buf: Buffer): boolean {
    const probeLen = Math.min(buf.length, 512);
    let nullCount = 0;
    for (let i = 0; i < probeLen; i++) {
      const byte = buf[i];
      if (byte === 0) {
        nullCount++;
      }
    }
    // More than 1 null byte in 512 bytes strongly indicates binary data
    return nullCount > 1;
  }

  /**
   * Detects basic character encoding BOM or falls back to UTF-8.
   */
  private detectTextEncoding(buf: Buffer): string {
    if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return 'UTF-8 with BOM';
    if (buf[0] === 0xfe && buf[1] === 0xff) return 'UTF-16 BE';
    if (buf[0] === 0xff && buf[1] === 0xfe) return 'UTF-16 LE';
    return 'UTF-8 / Plain';
  }

  /**
   * Helper to construct a standardized invalid validation result.
   */
  private buildFailureResult(params: {
    fileName: string;
    extension: string;
    filePath?: string;
    fileSizeBytes: number;
    errorCode: DigitalFileErrorCode;
    error: string;
    signatureDetected?: string;
  }): DigitalFileValidationResult {
    return {
      isValid: false,
      fileName: params.fileName,
      extension: params.extension,
      filePath: params.filePath,
      fileSizeBytes: params.fileSizeBytes,
      errorCode: params.errorCode,
      error: params.error,
      signatureDetected: params.signatureDetected,
    };
  }
}
