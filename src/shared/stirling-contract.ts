import { STIRLING_REQUIRED_DEFAULTS } from './stirling-required-defaults';

export type StirlingOutputFormat = 'pdf' | 'zip' | 'docx' | 'odt' | 'xlsx' | 'pptx' | 'ppt' | 'odp' | 'html' | 'json' | 'txt' | 'md' | 'csv' | 'xml' | 'rtf' | 'png' | 'jpg';

/** Endpoints saved by older Hub versions, mapped to the API that Stirling-PDF v3.2.2 really exposes. */
const ENDPOINT_ALIASES: Record<string, { operation: string; parameters?: Record<string, unknown> }> = {
  '/api/v1/general/extract-pages': { operation: '/api/v1/general/rearrange-pages', parameters: { customMode: 'CUSTOM' } },
  '/api/v1/convert/pdf/rtf': { operation: '/api/v1/convert/pdf/text', parameters: { outputFormat: 'rtf' } },
  '/api/v1/misc/watermark': { operation: '/api/v1/security/add-watermark' },
  '/api/v1/security/change-permissions': { operation: '/api/v1/security/add-password' },
  '/api/v1/misc/adjust-colors': { operation: '/api/v1/misc/replace-invert-pdf' },
  '/api/v1/misc/metadata': { operation: '/api/v1/misc/update-metadata' },
  '/api/v1/misc/document-properties': { operation: '/api/v1/analysis/document-properties' },
  '/api/v1/misc/remove-images': { operation: '/api/v1/general/remove-image-pdf' },
  '/api/v1/general/auto-split-pdf': { operation: '/api/v1/misc/auto-split-pdf' },
  '/api/v1/general/overlay-pdf': { operation: '/api/v1/general/overlay-pdfs' },
  '/api/v1/misc/linearize': { operation: '/api/v1/misc/compress-pdf', parameters: { linearize: true, optimizeLevel: 1 } },
};

/** These tools need a person in the loop, so the Hub opens the workstation instead of posting a request. */
export const STIRLING_INTERACTIVE_ENDPOINTS = new Set([
  '/api/v1/general/multi-tool',
  '/api/v1/security/manual-redaction',
  '/api/v1/security/sign',
  '/api/v1/edit/pdf-text-editor',
  '/api/v1/misc/annotate',
  '/api/v1/misc/compare',
]);

/** Stirling's API has no annotation remover, so Baglib runs this step with its local pikepdf helper. */
export const STIRLING_LOCAL_ENDPOINTS = new Set(['/api/v1/misc/remove-annotations']);

/** Parameters holding local files must travel as multipart parts, which handleData's JSON cannot carry. */
export const STIRLING_FILE_PARAMETERS = new Set(['overlayFiles', 'imageFile', 'attachments', 'watermarkImage', 'stampImage', 'p12File', 'jksFile', 'certFile', 'privateKeyFile']);

/** Values the OpenAPI document marks optional, yet the Java controllers dereference without a null check. */
const RUNTIME_DEFAULTS: Record<string, Record<string, unknown>> = {
  '/api/v1/security/add-watermark': { alphabet: 'roman', fontSize: 30, rotation: 0, opacity: 0.5, widthSpacer: 50, heightSpacer: 50, customColor: '#d3d3d3' },
  '/api/v1/misc/add-stamp': { alphabet: 'roman', customColor: '#d3d3d3' },
  '/api/v1/general/split-by-size-or-count': { splitType: 0, splitValue: '10MB' },
};

const PDFA_FORMATS = new Set(['pdfa', 'pdfa-1', 'pdfa-2', 'pdfa-2b', 'pdfa-3', 'pdfa-3b', 'pdfa-1a', 'pdfa-2a', 'pdfa-3a', 'pdfx']);

export function resolveStirlingOperation(endpoint: string, input: Record<string, unknown>): { operation: string; parameters: Record<string, unknown> } {
  const alias = ENDPOINT_ALIASES[endpoint];
  const operation = alias?.operation ?? endpoint;
  const parameters: Record<string, unknown> = { ...input };
  if (operation === '/api/v1/convert/pdf/pdfa' && parameters.conformance !== undefined) {
    const conformance = String(parameters.conformance).toLowerCase();
    delete parameters.conformance;
    parameters.outputFormat = PDFA_FORMATS.has(conformance) ? conformance : `pdfa-${conformance}`;
  }
  if (operation === '/api/v1/security/auto-redact' && parameters.words !== undefined) {
    parameters.listOfText = Array.isArray(parameters.words) ? parameters.words.join('\n') : parameters.words;
    delete parameters.words;
  }
  if (parameters.pages !== undefined && parameters.pageNumbers === undefined) {
    parameters.pageNumbers = parameters.pages;
    delete parameters.pages;
  }
  const resolved = { ...STIRLING_REQUIRED_DEFAULTS[operation], ...RUNTIME_DEFAULTS[operation], ...alias?.parameters, ...parameters };
  if (operation === '/api/v1/general/crop' && [resolved.x, resolved.y, resolved.width, resolved.height].some(value => value === undefined)) resolved.autoCrop ??= true;
  // A target size picks its own level, so the required default must not compete with it.
  if (operation === '/api/v1/misc/compress-pdf' && resolved.expectedOutputSize !== undefined && parameters.optimizeLevel === undefined) delete resolved.optimizeLevel;
  // Stamping renders text with a bundled font, so Arabic needs its own alphabet to shape correctly.
  if (/[\u0600-\u06FF]/u.test(String(resolved.watermarkText ?? resolved.stampText ?? ''))) resolved.alphabet = 'arabic';
  return { operation, parameters: resolved };
}

const CONTENT_TYPES: [RegExp, StirlingOutputFormat][] = [
  [/application\/pdf/u, 'pdf'], [/wordprocessingml|msword/u, 'docx'], [/presentationml|powerpoint/u, 'pptx'], [/spreadsheetml|excel/u, 'xlsx'],
  [/application\/json/u, 'json'], [/text\/csv/u, 'csv'], [/text\/html/u, 'html'], [/text\/markdown/u, 'md'], [/rtf/u, 'rtf'], [/text\/plain/u, 'txt'],
  [/xml/u, 'xml'], [/image\/png/u, 'png'], [/image\/jpe?g/u, 'jpg'], [/zip/u, 'zip'],
];
const OFFICE_ARCHIVES = ['docx', 'odt', 'xlsx', 'pptx', 'odp'];
const FILE_FORMATS = new Set<string>(['pdf', 'zip', ...OFFICE_ARCHIVES, 'ppt', 'html', 'json', 'txt', 'md', 'csv', 'xml', 'rtf', 'png', 'jpg']);

/** Stirling reports endpoints it switched off, usually because an external tool such as LibreOffice is absent. */
export const STIRLING_DISABLED_ENDPOINT = /endpoint is disabled|Cannot run program|No module named|service not found|Invalid OCR languages/iu;

export function isPdfBytes(data: Uint8Array): boolean {
  const head = String.fromCharCode(...data.subarray(0, 1024));
  return head.includes('%PDF-');
}
export function isZipBytes(data: Uint8Array): boolean {
  return data.length >= 4 && data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04;
}
/** A ZIP holding no entries is how handleData reports that every file was filtered out. */
export function isEmptyZipBytes(data: Uint8Array): boolean {
  return data.length >= 4 && data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x05 && data[3] === 0x06;
}

export function stirlingFilename(disposition: string | null): string {
  const match = disposition && /filename\*?=(?:UTF-8'')?"?([^";]+)"?/iu.exec(disposition);
  if (!match) return '';
  try { return decodeURIComponent(match[1].trim()); } catch { return match[1].trim(); }
}

/** Magic bytes decide first: handleData labels every single-file response as application/octet-stream. */
export function classifyStirlingOutput(data: Uint8Array, contentType: string | null, disposition: string | null): StirlingOutputFormat {
  const name = stirlingFilename(disposition).toLowerCase();
  const extension = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).replace('jpeg', 'jpg').replace('markdown', 'md') : '';
  if (isPdfBytes(data)) return 'pdf';
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) return 'png';
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'jpg';
  const type = (contentType || '').toLowerCase();
  if (isZipBytes(data)) {
    if (OFFICE_ARCHIVES.includes(extension)) return extension as StirlingOutputFormat;
    return (CONTENT_TYPES.find(([pattern]) => pattern.test(type) && !/json|csv|html|markdown|plain|xml/u.test(type))?.[1] ?? 'zip');
  }
  if (FILE_FORMATS.has(extension) && !['pdf', 'zip', ...OFFICE_ARCHIVES, 'png', 'jpg'].includes(extension)) return extension as StirlingOutputFormat;
  return CONTENT_TYPES.find(([pattern]) => pattern.test(type))?.[1] ?? 'txt';
}
