/** Source-bound, dependency-neutral PDF workstation contracts. */
export const PDF_FEATURES = ['inspect', 'preview', 'export-html', 'create', 'edit-content', 'organize', 'split', 'ocr', 'export-docx', 'export-xlsx', 'export-pptx', 'redact', 'encrypt', 'validate', 'repair-metadata', 'sign', 'verify-signatures', 'review', 'summarize', 'cloud'] as const;
export type PdfFeature = typeof PDF_FEATURES[number];
export const PDF_ENGINE_OPERATIONS = ['inspect', 'preview', 'create', 'edit-content', 'organize', 'split', 'ocr', 'export-docx', 'export-xlsx', 'export-pptx', 'export-html', 'redact', 'encrypt', 'validate', 'repair-metadata', 'prepare-signature', 'sign', 'verify-signatures', 'text'] as const;
export type PdfOperation = typeof PDF_ENGINE_OPERATIONS[number];
export type PdfOutputFormat = 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'html' | 'json';
export interface PdfOutput { filename: string; format: PdfOutputFormat; bytes: number; sha256: string }
export type PdfError = 'invalid-request' | 'invalid-source' | 'source-required' | 'source-changed' | 'encrypted' | 'permission-denied' | 'unsupported' | 'busy' | 'cancelled' | 'storage' | 'engine-missing' | 'engine-failed' | 'signed-document-locked' | 'text-does-not-fit' | 'owner-password-required' | 'no-tables' | 'no-redactions' | 'certificate-invalid' | 'invalid-output' | 'document-too-large';
export type PdfResult<T> = { ok: true; data: T } | { ok: false; error: PdfError };
export interface PdfCapability { feature: PdfFeature; available: boolean; reason?: 'engine-missing' | 'text-only' | 'credentials-required' }
export interface PdfSession { id: string; workId: string | null; sourceId: string | null; editionId: string | null; filename: string; sha256: string }
export interface PdfTextBlock { text: string; x: number; y: number; width: number; height: number; direction: 'rtl' | 'ltr'; rect?: number[]; fontSize?: number; font?: string; color?: string }
export interface PdfInspectedPage { page: number; width: number; height: number; rotation: number; text: string; blocks: PdfTextBlock[]; images?: { xref: number; rects: number[][] }[] }
export interface PdfInspection { pages: PdfInspectedPage[]; totalPages: number; signatureFields: number; signatureValidation: 'not-performed'; signedSource?: boolean; outline?: { level: number; title: string; page: number }[]; pendingFields?: { name: string; page: number; rect: number[] }[]; extraction: 'complete' | 'limited'; permissions: number[] | null }
export type PdfJobState = 'running' | 'completed' | 'cancelled' | 'failed';
export interface PdfJob {
  id: string; sessionId: string; operation: PdfOperation; state: PdfJobState;
  current: number; total: number; inspection?: PdfInspection; error?: PdfError;
  output?: PdfOutput; outputs?: PdfOutput[]; result?: PdfEngineResult;
}
export interface PdfJobRequest { sessionId: string; operation: PdfOperation; password?: string; language: 'ar' | 'en'; payload?: Record<string, unknown> }
export interface PdfEngineResult { inspection?: PdfInspection; outputs?: PdfOutput[]; page?: number; width?: number; height?: number; image?: string; [key: string]: unknown }
export interface PdfAsset { id: string; filename: string; kind: 'image' | 'certificate' | 'trust-root' }
export interface PdfSaveRequest { jobId: string; outputIndex?: number; mode: 'copy' | 'overwrite' | 'edition' | 'new-work'; title?: string } 
export interface PdfEditorAPI {
  capabilities(): Promise<PdfCapability[]>;
  open(input: { workId: string; sourceId?: string }): Promise<PdfResult<PdfSession>>;
  sources(workId: string): Promise<PdfResult<{ id: string; filename: string }[]>>;
  start(input: PdfJobRequest): Promise<PdfResult<PdfJob>>;
  status(jobId: string): Promise<PdfResult<PdfJob>>;
  cancel(jobId: string): Promise<PdfResult<null>>;
  chooseSource(): Promise<PdfResult<PdfSession | null>>;
  blankSession(): Promise<PdfResult<PdfSession>>;
  chooseAsset(kind: PdfAsset['kind']): Promise<PdfResult<PdfAsset | null>>;
  clipboard(): Promise<PdfResult<{ text?: string; asset?: PdfAsset }>>;
  save(input: PdfSaveRequest): Promise<PdfResult<{ saved: boolean; backup?: string; session?: PdfSession }>>;
  saveCopy(jobId: string): Promise<PdfResult<{ saved: boolean }>>;
  close(sessionId: string): Promise<PdfResult<null>>;
  audit(): Promise<PdfResult<{ valid: boolean; records: { id: string; at: string; operation: string; sourceHash: string; outputHash: string; certificateFingerprint?: string; signer?: string; status: string }[] }>>;
  onSourceChanged(callback: (source: { workId: string | null; sourceId: string | null }) => void): () => void;
}

export function pdfCapabilities(engines: string[] = []): PdfCapability[] {
  return PDF_FEATURES.map(feature => ({ feature, available: feature === 'inspect' || feature === 'export-html' || feature === 'cloud' || engines.includes(feature), ...(!engines.includes(feature) && feature !== 'cloud' && feature !== 'inspect' ? { reason: feature === 'export-html' ? 'text-only' as const : 'engine-missing' as const } : {}) }));
}

export function validatePdfJob(input: unknown): PdfJobRequest {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid-request');
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some(key => !['sessionId', 'operation', 'password', 'language', 'payload'].includes(key)) || typeof value.sessionId !== 'string' || !/^[\w-]{1,100}$/u.test(value.sessionId) || !PDF_ENGINE_OPERATIONS.includes(value.operation as PdfOperation) || !['ar', 'en'].includes(String(value.language)) || (value.password !== undefined && (typeof value.password !== 'string' || value.password.length > 1024))) throw new Error('invalid-request');
  let nodes = 0, characters = 0;
  const validate = (item: unknown, depth = 0) => {
    if (++nodes > 100000 || depth > 12) throw new Error('invalid-request');
    if (item === null || typeof item === 'boolean') return;
    if (typeof item === 'number') { if (!Number.isFinite(item) || Math.abs(item) > 10_000_000) throw new Error('invalid-request'); return; }
    if (typeof item === 'string') { characters += item.length; if (item.length > 100000 || characters > 2_000_000) throw new Error('invalid-request'); return; }
    if (Array.isArray(item)) { if (item.length > 10000) throw new Error('invalid-request'); for (const child of item) validate(child, depth + 1); return; }
    if (item && typeof item === 'object') {
      for (const [key, child] of Object.entries(item)) { if (['__proto__', 'prototype', 'constructor', 'filename', 'path', 'outputDirectory', 'sources', 'assets'].includes(key)) throw new Error('invalid-request'); validate(child, depth + 1); }
      return;
    }
    throw new Error('invalid-request');
  };
  if (value.payload !== undefined) { if (!value.payload || typeof value.payload !== 'object' || Array.isArray(value.payload)) throw new Error('invalid-request'); validate(value.payload); }
  return value as unknown as PdfJobRequest;
}
