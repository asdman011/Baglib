import { normalizeArabicText } from '../../../shared/utils/text-normalizer';
import type { PdfFeature } from '../../../shared/types/pdf-editor';
import type { TranslationKey } from '../../translations';
import type { StirlingWorkstationMode } from './PdfWorkstationTools';

export type PdfToolSectionId =
  | 'annotate'
  | 'organize'
  | 'convert'
  | 'optimize'
  | 'ocr'
  | 'security'
  | 'saved-actions';

export type PdfToolResultHint =
  | 'save'
  | 'new-file'
  | 'new-files'
  | 'inspect'
  | 'ocr'
  | 'workflow';

export interface PdfSectionDefinition {
  id: PdfToolSectionId;
  nameKey: TranslationKey;
  descriptionKey: TranslationKey;
  iconName: string;
}

export interface PdfToolDefinition {
  id: PdfFeature | 'saved-actions';
  section: PdfToolSectionId;
  nameKey: TranslationKey;
  descriptionKey: TranslationKey;
  resultHint: PdfToolResultHint;
  iconName: string;
  mode: StirlingWorkstationMode;
}

export const PDF_TOOL_SECTIONS: PdfSectionDefinition[] = [
  {
    id: 'annotate',
    nameKey: 'pdfSectionAnnotate',
    descriptionKey: 'pdfSectionAnnotateDesc',
    iconName: 'PenTool',
  },
  {
    id: 'organize',
    nameKey: 'pdfSectionOrganize',
    descriptionKey: 'pdfSectionOrganizeDesc',
    iconName: 'Layers',
  },
  {
    id: 'convert',
    nameKey: 'pdfSectionConvert',
    descriptionKey: 'pdfSectionConvertDesc',
    iconName: 'FileOutput',
  },
  {
    id: 'optimize',
    nameKey: 'pdfSectionOptimize',
    descriptionKey: 'pdfSectionOptimizeDesc',
    iconName: 'Zap',
  },
  {
    id: 'ocr',
    nameKey: 'pdfSectionOcr',
    descriptionKey: 'pdfSectionOcrDesc',
    iconName: 'ScanText',
  },
  {
    id: 'security',
    nameKey: 'pdfSectionSecurity',
    descriptionKey: 'pdfSectionSecurityDesc',
    iconName: 'ShieldCheck',
  },
  {
    id: 'saved-actions',
    nameKey: 'pdfSectionSavedActions',
    descriptionKey: 'pdfSectionSavedActionsDesc',
    iconName: 'PlayCircle',
  },
];

export const PDF_TOOL_CATALOGUE: PdfToolDefinition[] = [
  // 1. Annotate
  {
    id: 'edit-content',
    section: 'annotate',
    nameKey: 'pdfToolEditContent',
    descriptionKey: 'pdfToolEditContentDesc',
    resultHint: 'save',
    iconName: 'Type',
    mode: 'edit',
  },
  {
    id: 'add-image',
    section: 'annotate',
    nameKey: 'pdfToolAddImage',
    descriptionKey: 'pdfToolAddImageDesc',
    resultHint: 'save',
    iconName: 'Image',
    mode: 'edit',
  },
  {
    id: 'watermark',
    section: 'annotate',
    nameKey: 'pdfToolWatermark',
    descriptionKey: 'pdfToolWatermarkDesc',
    resultHint: 'save',
    iconName: 'Stamp',
    mode: 'security',
  },
  {
    id: 'page-numbers',
    section: 'annotate',
    nameKey: 'pdfToolPageNumbers',
    descriptionKey: 'pdfToolPageNumbersDesc',
    resultHint: 'save',
    iconName: 'Hash',
    mode: 'edit',
  },
  {
    id: 'edit-toc',
    section: 'annotate',
    nameKey: 'pdfToolEditToc',
    descriptionKey: 'pdfToolEditTocDesc',
    resultHint: 'save',
    iconName: 'ListTree',
    mode: 'view',
  },

  { id: 'review', section: 'annotate', nameKey: 'pdfSuiteReview', descriptionKey: 'pdfToolReviewDesc', resultHint: 'inspect', iconName: 'FileSearch', mode: 'view' },

  // 2. Organize pages
  {
    id: 'organize',
    section: 'organize',
    nameKey: 'pdfToolOrganize',
    descriptionKey: 'pdfToolOrganizeDesc',
    resultHint: 'save',
    iconName: 'Layers',
    mode: 'organize',
  },
  {
    id: 'split',
    section: 'organize',
    nameKey: 'pdfToolSplit',
    descriptionKey: 'pdfToolSplitDesc',
    resultHint: 'new-files',
    iconName: 'Split',
    mode: 'organize',
  },
  {
    id: 'crop',
    section: 'organize',
    nameKey: 'pdfToolCrop',
    descriptionKey: 'pdfToolCropDesc',
    resultHint: 'save',
    iconName: 'Crop',
    mode: 'organize',
  },
  {
    id: 'scale-pages',
    section: 'organize',
    nameKey: 'pdfToolScalePages',
    descriptionKey: 'pdfToolScalePagesDesc',
    resultHint: 'save',
    iconName: 'Scaling',
    mode: 'organize',
  },
  {
    id: 'multi-page-layout',
    section: 'organize',
    nameKey: 'pdfToolMultiPageLayout',
    descriptionKey: 'pdfToolMultiPageLayoutDesc',
    resultHint: 'new-file',
    iconName: 'Grid2X2',
    mode: 'organize',
  },
  {
    id: 'pdf-to-single-page',
    section: 'organize',
    nameKey: 'pdfToolSinglePage',
    descriptionKey: 'pdfToolSinglePageDesc',
    resultHint: 'new-file',
    iconName: 'Maximize',
    mode: 'organize',
  },

  // 3. Convert & export
  {
    id: 'export-docx',
    section: 'convert',
    nameKey: 'pdfToolExportDocx',
    descriptionKey: 'pdfToolExportDocxDesc',
    resultHint: 'new-file',
    iconName: 'FileText',
    mode: 'convert',
  },
  {
    id: 'export-xlsx',
    section: 'convert',
    nameKey: 'pdfToolExportXlsx',
    descriptionKey: 'pdfToolExportXlsxDesc',
    resultHint: 'new-file',
    iconName: 'FileSpreadsheet',
    mode: 'convert',
  },
  {
    id: 'export-pptx',
    section: 'convert',
    nameKey: 'pdfToolExportPptx',
    descriptionKey: 'pdfToolExportPptxDesc',
    resultHint: 'new-file',
    iconName: 'Presentation',
    mode: 'convert',
  },
  {
    id: 'export-html',
    section: 'convert',
    nameKey: 'pdfToolExportHtml',
    descriptionKey: 'pdfToolExportHtmlDesc',
    resultHint: 'new-file',
    iconName: 'Globe',
    mode: 'convert',
  },
  {
    id: 'export-markdown',
    section: 'convert',
    nameKey: 'pdfToolExportMarkdown',
    descriptionKey: 'pdfToolExportMarkdownDesc',
    resultHint: 'new-file',
    iconName: 'FileCode',
    mode: 'convert',
  },
  {
    id: 'export-text',
    section: 'convert',
    nameKey: 'pdfToolExportText',
    descriptionKey: 'pdfToolExportTextDesc',
    resultHint: 'new-file',
    iconName: 'File',
    mode: 'convert',
  },
  {
    id: 'export-csv',
    section: 'convert',
    nameKey: 'pdfToolExportCsv',
    descriptionKey: 'pdfToolExportCsvDesc',
    resultHint: 'new-file',
    iconName: 'Table',
    mode: 'convert',
  },
  {
    id: 'extract-images',
    section: 'convert',
    nameKey: 'pdfToolExtractImages',
    descriptionKey: 'pdfToolExtractImagesDesc',
    resultHint: 'new-files',
    iconName: 'Images',
    mode: 'convert',
  },
  {
    id: 'convert-file-pdf',
    section: 'convert',
    nameKey: 'pdfToolConvertFilePdf',
    descriptionKey: 'pdfToolConvertFilePdfDesc',
    resultHint: 'new-file',
    iconName: 'FilePlus',
    mode: 'convert',
  },

  // 4. Optimize
  {
    id: 'compress',
    section: 'optimize',
    nameKey: 'pdfToolCompress',
    descriptionKey: 'pdfToolCompressDesc',
    resultHint: 'save',
    iconName: 'Minimize2',
    mode: 'convert',
  },
  {
    id: 'sanitize',
    section: 'optimize',
    nameKey: 'pdfToolSanitize',
    descriptionKey: 'pdfToolSanitizeDesc',
    resultHint: 'save',
    iconName: 'Sparkles',
    mode: 'security',
  },
  {
    id: 'repair-metadata',
    section: 'optimize',
    nameKey: 'pdfToolRepairMetadata',
    descriptionKey: 'pdfToolRepairMetadataDesc',
    resultHint: 'save',
    iconName: 'Wrench',
    mode: 'view',
  },

  // 5. OCR & text
  {
    id: 'ocr',
    section: 'ocr',
    nameKey: 'pdfToolOcr',
    descriptionKey: 'pdfToolOcrDesc',
    resultHint: 'ocr',
    iconName: 'ScanText',
    mode: 'convert',
  },
  {
    id: 'accessibility',
    section: 'ocr',
    nameKey: 'pdfToolAccessibility',
    descriptionKey: 'pdfToolAccessibilityDesc',
    resultHint: 'inspect',
    iconName: 'Accessibility',
    mode: 'view',
  },
  {
    id: 'inspect',
    section: 'ocr',
    nameKey: 'pdfToolInspect',
    descriptionKey: 'pdfToolInspectDesc',
    resultHint: 'inspect',
    iconName: 'FileSearch',
    mode: 'view',
  },

  // 6. Security
  {
    id: 'encrypt',
    section: 'security',
    nameKey: 'pdfToolEncrypt',
    descriptionKey: 'pdfToolEncryptDesc',
    resultHint: 'save',
    iconName: 'Lock',
    mode: 'security',
  },
  {
    id: 'redact',
    section: 'security',
    nameKey: 'pdfToolRedact',
    descriptionKey: 'pdfToolRedactDesc',
    resultHint: 'save',
    iconName: 'ShieldAlert',
    mode: 'security',
  },
  {
    id: 'sign',
    section: 'security',
    nameKey: 'pdfToolSign',
    descriptionKey: 'pdfToolSignDesc',
    resultHint: 'save',
    iconName: 'Pen',
    mode: 'security',
  },
  {
    id: 'verify-signatures',
    section: 'security',
    nameKey: 'pdfToolVerifySignatures',
    descriptionKey: 'pdfToolVerifySignaturesDesc',
    resultHint: 'inspect',
    iconName: 'ShieldCheck',
    mode: 'security',
  },
  {
    id: 'unlock-forms',
    section: 'security',
    nameKey: 'pdfToolUnlockForms',
    descriptionKey: 'pdfToolUnlockFormsDesc',
    resultHint: 'save',
    iconName: 'FileCheck',
    mode: 'edit',
  },
  {
    id: 'validate',
    section: 'security',
    nameKey: 'pdfToolValidate',
    descriptionKey: 'pdfToolValidateDesc',
    resultHint: 'inspect',
    iconName: 'CheckCircle',
    mode: 'security',
  },

  // 7. Saved actions
  {
    id: 'saved-actions',
    section: 'saved-actions',
    nameKey: 'pdfToolSavedActions',
    descriptionKey: 'pdfToolSavedActionsDesc',
    resultHint: 'workflow',
    iconName: 'PlayCircle',
    mode: 'view',
  },
];

export function getPdfToolCatalogue(): PdfToolDefinition[] {
  return PDF_TOOL_CATALOGUE;
}

export function getPdfToolSections(): PdfSectionDefinition[] {
  return PDF_TOOL_SECTIONS;
}

export function getToolsBySection(sectionId: PdfToolSectionId): PdfToolDefinition[] {
  return PDF_TOOL_CATALOGUE.filter((tool) => tool.section === sectionId);
}

export function searchPdfTools(
  query: string,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
): PdfToolDefinition[] {
  const normalize = (value: string) => normalizeArabicText(value, { normalizeTaaMarbuta: false });
  const needle = normalize(query.trim());
  if (!needle) return PDF_TOOL_CATALOGUE;

  return PDF_TOOL_CATALOGUE.filter((tool) => {
    const name = normalize(t(tool.nameKey));
    const desc = normalize(t(tool.descriptionKey));
    const sectionDef = PDF_TOOL_SECTIONS.find((s) => s.id === tool.section);
    const sectionName = sectionDef ? normalize(t(sectionDef.nameKey)) : '';
    const id = String(tool.id).toLocaleLowerCase();

    return (
      name.includes(needle) ||
      desc.includes(needle) ||
      sectionName.includes(needle) ||
      id.includes(needle)
    );
  });
}

export type OcrStatusState = 'checking' | 'no-text-layer' | 'text-layer' | 'running' | 'done';

export interface OcrStatusChipInfo {
  state: OcrStatusState;
  label: string;
  tooltip: string;
  confidence?: number;
  wordCount?: number;
}

export function getOcrStatusChipInfo(
  state: OcrStatusState,
  data: { confidence?: number; wordCount?: number; current?: number; total?: number } | null | undefined,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
): OcrStatusChipInfo {
  switch (state) {
    case 'checking':
      return { state, label: t('ocrChipChecking'), tooltip: t('ocrChipChecking') };
    case 'no-text-layer':
      return {
        state,
        label: t('ocrChipNoTextLayer'),
        tooltip: t('ocrChipNoTextLayerTooltip'),
      };
    case 'running':
      return {
        state,
        label: data?.total ? t('ocrChipProgress', { current: data.current ?? 0, total: data.total }) : t('ocrChipRunning'),
        tooltip: t('ocrChipRunningTooltip'),
      };
    case 'done': {
      const conf = data?.confidence === undefined ? undefined : Math.round(Math.max(0, Math.min(100, data.confidence)));
      const count = data?.wordCount ?? 0;
      return {
        state,
        label: conf === undefined ? t('ocrChipDoneUnknown') : t('ocrChipDone', { percent: conf }),
        tooltip: conf === undefined ? t('ocrChipDoneUnknown') : t('ocrChipDoneTooltip', { count, percent: conf }),
        confidence: conf,
        wordCount: count,
      };
    }
    case 'text-layer':
    default:
      return {
        state: 'text-layer',
        label: t('ocrChipTextLayer'),
        tooltip: t('ocrChipTextLayerTooltip'),
      };
  }
}
