export const PDF_FEATURES = [
  'inspect',
  'preview',
  'export-html',
  'create',
  'edit-content',
  'organize',
  'split',
  'ocr',
  'export-docx',
  'export-xlsx',
  'export-pptx',
  'export-markdown',
  'export-text',
  'export-csv',
  'redact',
  'encrypt',
  'sanitize',
  'watermark',
  'compress',
  'page-numbers',
  'add-image',
  'unlock-forms',
  'extract-images',
  'scale-pages',
  'multi-page-layout',
  'pdf-to-single-page',
  'edit-toc',
  'validate',
  'repair-metadata',
  'sign',
  'verify-signatures',
  'review',
  'summarize',
  'cloud',
  'crop',
  'document-properties',
  'basic-info',
  'convert-file-pdf',
] as const;
export type PdfFeature = typeof PDF_FEATURES[number];

export const PDF_ENGINE_OPERATIONS = [
  'inspect',
  'preview',
  'create',
  'edit-content',
  'organize',
  'split',
  'ocr',
  'export-docx',
  'export-xlsx',
  'export-pptx',
  'export-html',
  'export-markdown',
  'export-text',
  'export-csv',
  'redact',
  'encrypt',
  'sanitize',
  'watermark',
  'compress',
  'page-numbers',
  'add-image',
  'unlock-forms',
  'extract-images',
  'scale-pages',
  'multi-page-layout',
  'pdf-to-single-page',
  'edit-toc',
  'validate',
  'repair-metadata',
  'prepare-signature',
  'sign',
  'verify-signatures',
  'text',
  'crop',
  'document-properties',
  'basic-info',
  'convert-file-pdf',
] as const;
export type PdfOperation = typeof PDF_ENGINE_OPERATIONS[number];
export type PdfOutputFormat = 'pdf' | 'docx' | 'odt' | 'xlsx' | 'pptx' | 'ppt' | 'odp' | 'html' | 'json' | 'txt' | 'md' | 'csv' | 'zip' | 'xml' | 'rtf' | 'png' | 'jpg';
export interface PdfOutput { filename: string; format: PdfOutputFormat; bytes: number; sha256: string }
export type PdfError = 'invalid-request' | 'invalid-source' | 'source-required' | 'source-changed' | 'encrypted' | 'permission-denied' | 'unsupported' | 'busy' | 'cancelled' | 'storage' | 'engine-missing' | 'engine-failed' | 'signed-document-locked' | 'text-does-not-fit' | 'owner-password-required' | 'no-tables' | 'no-text' | 'no-bookmarks' | 'redaction-unverified' | 'no-redactions' | 'certificate-invalid' | 'invalid-output' | 'document-too-large' | 'no-output';
export type PdfResult<T> = { ok: true; data: T } | { ok: false; error: PdfError };
export interface PdfCapability { feature: PdfFeature; available: boolean; reason?: 'engine-missing' | 'text-only' | 'credentials-required' }
export type StirlingEngineStatus = 'stopped' | 'starting' | 'ready' | 'processing' | 'error';
export interface StirlingEngineInfo {
  status: StirlingEngineStatus;
  port?: number;
  version?: string;
  externalTools?: {
    tesseract: boolean;
    ocrmypdf?: boolean;
    libreoffice: boolean;
    qpdf: boolean;
    ghostscript: boolean;
    weasyprint: boolean;
  };
}
export interface PdfSession { id: string; workId: string | null; sourceId: string | null; editionId: string | null; filename: string; sha256: string; previewUrl?: string }
export interface PdfTextBlock { text: string; x: number; y: number; width: number; height: number; direction: 'rtl' | 'ltr'; rect?: number[]; fontSize?: number; font?: string; color?: string }
export interface PdfInspectedPage { page: number; width: number; height: number; rotation: number; text: string; blocks: PdfTextBlock[]; images?: { xref: number; rects: number[][] }[] }
export interface PdfInspection { pages: PdfInspectedPage[]; totalPages: number; signatureFields: number; signatureValidation: 'not-performed'; signedSource?: boolean; outline?: { level: number; title: string; page: number }[]; pendingFields?: { name: string; page: number; rect: number[] }[]; extraction: 'complete' | 'limited'; permissions: number[] | null }
export type PdfJobState = 'running' | 'completed' | 'cancelled' | 'failed';
export interface PdfJob {
  id: string; sessionId: string; operation: PdfOperation; state: PdfJobState;
  current: number; total: number; inspection?: PdfInspection; error?: PdfError;
  output?: PdfOutput; outputs?: PdfOutput[]; result?: PdfEngineResult;
  previewUrl?: string;
}
export interface PdfJobRequest { sessionId: string; operation: PdfOperation; password?: string; language: 'ar' | 'en'; payload?: Record<string, unknown> }
export interface PdfEngineResult { inspection?: PdfInspection; outputs?: PdfOutput[]; page?: number; width?: number; height?: number; image?: string; [key: string]: unknown }
export interface PdfAsset { id: string; filename: string; kind: 'image' | 'certificate' | 'trust-root' }
export interface PdfSaveRequest { jobId: string; outputIndex?: number; mode: 'copy' | 'overwrite' | 'edition' | 'new-work'; title?: string } 
export interface PdfVersionItem {
  restorePoint?: boolean; filename: string; timestamp: number; dateStr: string; size: number; operation?: string }
export interface PdfViewPreview { image: string; width: number; height: number; pages: number }
export interface PdfViewSource { id: string; key: string; url: string; cached: boolean; pending: boolean; preview?: PdfViewPreview }
export interface PdfEditorAPI {
  viewSource(input: { path: string; id?: string; page?: number }): Promise<PdfResult<PdfViewSource>>;
  releaseViewSource(id: string): Promise<PdfResult<null>>;
  evictViewSource(id: string): Promise<PdfResult<null>>;
  saveViewPreview(id: string, page: number, preview: PdfViewPreview): Promise<PdfResult<null>>;
  onViewSourceChanged(callback: (id: string) => void): () => void;
  capabilities(): Promise<PdfCapability[]>;
  engineStatus(): Promise<PdfResult<StirlingEngineInfo>>;
  onEngineStatusChanged(callback: (info: StirlingEngineInfo) => void): () => void;
  open(input: { workId: string; sourceId?: string }): Promise<PdfResult<PdfSession>>;
  sources(workId: string): Promise<PdfResult<{ id: string; filename: string }[]>>;
  start(input: PdfJobRequest): Promise<PdfResult<PdfJob>>;
  status(jobId: string): Promise<PdfResult<PdfJob>>;
  cancel(jobId: string): Promise<PdfResult<null>>;
  chooseSource(): Promise<PdfResult<PdfSession | null>>;
  blankSession(): Promise<PdfResult<PdfSession>>;
  chooseAsset(kind: PdfAsset['kind']): Promise<PdfResult<PdfAsset | null>>;
  chooseToolFiles(extensions: string[], multiple: boolean): Promise<PdfResult<string[]>>;
  warmEngine(): Promise<PdfResult<null>>;
  clipboard(): Promise<PdfResult<{ text?: string; asset?: PdfAsset }>>;
  save(input: PdfSaveRequest): Promise<PdfResult<{ saved: boolean; backup?: string; session?: PdfSession }>>;
  saveCopy(jobId: string): Promise<PdfResult<{ saved: boolean }>>;
  close(sessionId: string): Promise<PdfResult<null>>;
  audit(): Promise<PdfResult<{ valid: boolean; records: { id: string; at: string; operation: string; sourceHash: string; outputHash: string; certificateFingerprint?: string; signer?: string; status: string }[] }>>;
  onSourceChanged(callback: (source: { workId: string | null; sourceId: string | null }) => void): () => void;
  listVersions?(sessionId: string): Promise<PdfResult<PdfVersionItem[]>>;
  restoreVersion?(sessionId: string, versionFilename: string): Promise<PdfResult<{ restored: boolean; session?: PdfSession }>>;
  undoVersion?(sessionId: string): Promise<PdfResult<{ restored: boolean; session?: PdfSession }>>;
  deleteVersion?(sessionId: string, versionFilename: string): Promise<PdfResult<boolean>>;
  listPipelines?(): Promise<PdfResult<StirlingPipeline[]>>;
  savePipeline?(pipeline: StirlingPipeline): Promise<PdfResult<StirlingPipeline>>;
  deletePipeline?(id: string): Promise<PdfResult<boolean>>;
  executePipeline?(input: { filePaths: string[]; pipelineConfig: { name: string; pipeline: { operation: string; parameters: Record<string, unknown> }[]; singleTool?: boolean } }): Promise<PdfResult<{ outputPath: string; format: string; bytes: number; sha256: string }>>;
  getProcessorTelemetry?(): Promise<PdfResult<StirlingProcessorTelemetry>>;
  getPolicies?(): Promise<PdfResult<StirlingGovernancePolicies>>;
  savePolicies?(policies: Partial<StirlingGovernancePolicies>): Promise<PdfResult<StirlingGovernancePolicies>>;
  getWatchedFolders?(): Promise<PdfResult<WatchedFolderSource[]>>;
  saveWatchedFolders?(folders: WatchedFolderSource[]): Promise<PdfResult<WatchedFolderSource[]>>;
  exportPipelineAutomate?(pipeline: StirlingPipeline): Promise<PdfResult<string>>;
  exportPipelineFolderScan?(folder: WatchedFolderSource, pipeline: StirlingPipeline): Promise<PdfResult<string>>;
  importPipeline?(jsonContent: string): Promise<PdfResult<StirlingPipeline>>;
  checkWatchedFolders?(): Promise<PdfResult<{ processed: number; errors: string[] }>>;
}

export interface StirlingPipelineStep {
  id: string;
  operation: string;
  name: string;
  parameters: Record<string, unknown>;
}

export interface StirlingPipeline {
  id: string;
  name: string;
  description?: string;
  trigger: 'editor' | 'folder' | 'manual';
  inputFolder?: string;
  outputFolder?: string;
  afterProcessing?: 'keep' | 'archive' | 'delete';
  steps: StirlingPipelineStep[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WatchedFolderSource {
  id: string;
  name: string;
  inputPath: string;
  outputPath: string;
  pipelineId: string;
  status: 'watching' | 'paused' | 'error';
  lastProcessedAt?: string;
  processedCount: number;
}

export interface StirlingProcessorTelemetry {
  activePipelines: number;
  totalPipelines: number;
  processedToday: number;
  watchedFolders: number;
}

export interface StirlingGovernancePolicies {
  ingestion: {
    folderWatchEnabled: boolean;
    autoOcrArabic: boolean;
    autoOcrEnglish: boolean;
    maxFileSizeMb: number;
  };
  security: {
    autoSanitize: boolean;
    removeMetadata: boolean;
    stripJavascript: boolean;
    defaultPasswordProtect: boolean;
  };
  compliance: {
    enforcePdfA: boolean;
    pdfAConformance: '2b' | '3b' | '1b';
    validateDigitalSignatures: boolean;
  };
  routing: {
    outputDirectory: string;
    namingPattern: string;
    separateOutputFolder: boolean;
  };
  retention: {
    backupOriginal: boolean;
    backupDir: string;
    retentionDays: number;
  };
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
