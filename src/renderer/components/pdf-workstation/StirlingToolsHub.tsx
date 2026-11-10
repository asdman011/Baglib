'use client';
import { Button } from '../ui/Button';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  Star,
  SlidersHorizontal,
  LayoutGrid,
  Columns3,
  Cpu,
  Layers,
  FileText,
  FileCheck2,
  FileSpreadsheet,
  FileArchive,
  ArrowRightLeft,
  Shield,
  ShieldCheck,
  Lock,
  Unlock,
  Key,
  Eraser,
  PenTool,
  RotateCw,
  Scissors,
  Split,
  Combine,
  Maximize2,
  Minimize2,
  Image as ImageIcon,
  Stamp,
  Heading,
  BookmarkCheck,
  Palette,
  FileCode,
  Globe,
  BookOpen,
  FolderInput,
  FolderOutput,
  Eye,
  Settings,
  Play,
  Plus,
  Trash2,
  Upload,
  CheckCircle2,
  AlertTriangle,
  X,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Download,
  BookCheck,
  Sun,
  Moon,
  FolderPlus,
  Pencil,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { StirlingToolOptionsForm } from './StirlingToolOptionsForm';
import { ADDITIONAL_FILES, TOOLS_WITHOUT_INPUT_FILE, TOOL_INPUT_TYPES, defaultToolValues, invalidToolOption, missingToolOption, toolParameters, type ToolOptionValues } from './stirling-tool-options';
import { useWorkspace } from '../context/WorkspaceContext';
import { translations, type TranslationKey } from '../../translations';
import { resolveDroppedFilePath } from '../../utils/file-path-helper';
import { STIRLING_INTERACTIVE_ENDPOINTS } from '../../../shared/stirling-contract';
import type {
  StirlingEngineInfo,
  StirlingPipeline,
  StirlingPipelineStep,
  WatchedFolderSource,
  StirlingProcessorTelemetry,
  StirlingGovernancePolicies,
} from '../../../shared/types/pdf-editor';

export type StirlingCategory =
  | 'organize'
  | 'convert-to-pdf'
  | 'convert-from-pdf'
  | 'sign-security'
  | 'view-edit'
  | 'advanced-processor';

export interface StirlingToolDef {
  id: string;
  category: StirlingCategory;
  nameKey: TranslationKey;
  descKey: TranslationKey;
  /** User pipelines carry their own text instead of catalog keys. */
  custom?: { name: string; desc: string };
  endpoint: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  isNew?: boolean;
  isPopular?: boolean;
  colorScheme: 'blue' | 'emerald' | 'cyan' | 'rose' | 'lime' | 'orange';
}

export const STIRLING_TOOLS: StirlingToolDef[] = [
  // =========================================================================
  // 1. Organize (Blue/Indigo Icons) - 11 tools
  // =========================================================================
  {
    id: 'scale-pages',
    category: 'organize',
    nameKey: 'hubToolScalePages',
    descKey: 'hubToolScalePagesDesc',
    endpoint: '/api/v1/general/scale-pages',
    icon: Maximize2,
    colorScheme: 'blue',
  },
  {
    id: 'crop',
    category: 'organize',
    nameKey: 'hubToolCrop',
    descKey: 'hubToolCropDesc',
    endpoint: '/api/v1/general/crop',
    icon: Scissors,
    colorScheme: 'blue',
  },
  {
    id: 'extract-pages',
    category: 'organize',
    nameKey: 'hubToolExtractPages',
    descKey: 'hubToolExtractPagesDesc',
    endpoint: '/api/v1/general/extract-pages',
    icon: FileText,
    colorScheme: 'blue',
  },
  {
    id: 'merge',
    category: 'organize',
    nameKey: 'hubToolMerge',
    descKey: 'hubToolMergeDesc',
    endpoint: '/api/v1/general/merge-pdfs',
    icon: Combine,
    isPopular: true,
    colorScheme: 'blue',
  },
  {
    id: 'multi-page-layout',
    category: 'organize',
    nameKey: 'hubToolMultiPageLayout',
    descKey: 'hubToolMultiPageLayoutDesc',
    endpoint: '/api/v1/general/multi-page-layout',
    icon: LayoutGrid,
    colorScheme: 'blue',
  },
  {
    id: 'reorder',
    category: 'organize',
    nameKey: 'hubToolReorder',
    descKey: 'hubToolReorderDesc',
    endpoint: '/api/v1/general/rearrange-pages',
    icon: ArrowRightLeft,
    colorScheme: 'blue',
  },
  {
    id: 'multi-tool',
    category: 'organize',
    nameKey: 'hubToolMultiTool',
    descKey: 'hubToolMultiToolDesc',
    endpoint: '/api/v1/general/multi-tool',
    icon: Layers,
    isPopular: true,
    colorScheme: 'blue',
  },
  {
    id: 'pdf-to-single-page',
    category: 'organize',
    nameKey: 'hubToolPdfToSinglePage',
    descKey: 'hubToolPdfToSinglePageDesc',
    endpoint: '/api/v1/general/pdf-to-single-page',
    icon: FileText,
    colorScheme: 'blue',
  },
  {
    id: 'remove-pages',
    category: 'organize',
    nameKey: 'hubToolRemovePages',
    descKey: 'hubToolRemovePagesDesc',
    endpoint: '/api/v1/general/remove-pages',
    icon: Trash2,
    colorScheme: 'blue',
  },
  {
    id: 'rotate',
    category: 'organize',
    nameKey: 'hubToolRotate',
    descKey: 'hubToolRotateDesc',
    endpoint: '/api/v1/general/rotate-pdf',
    icon: RotateCw,
    colorScheme: 'blue',
  },
  {
    id: 'split',
    category: 'organize',
    nameKey: 'hubToolSplit',
    descKey: 'hubToolSplitDesc',
    endpoint: '/api/v1/general/split-pages',
    icon: Split,
    isPopular: true,
    colorScheme: 'blue',
  },

  // =========================================================================
  // 2. Convert to PDF (Emerald Green Icons) - 5 tools
  // =========================================================================
  {
    id: 'convert-file-to-pdf',
    category: 'convert-to-pdf',
    nameKey: 'hubToolConvertFileToPdf',
    descKey: 'hubToolConvertFileToPdfDesc',
    endpoint: '/api/v1/convert/file/pdf',
    icon: FileSpreadsheet,
    isPopular: true,
    colorScheme: 'emerald',
  },
  {
    id: 'html-to-pdf',
    category: 'convert-to-pdf',
    nameKey: 'hubToolHtmlToPdf',
    descKey: 'hubToolHtmlToPdfDesc',
    endpoint: '/api/v1/convert/html/pdf',
    icon: FileCode,
    colorScheme: 'emerald',
  },
  {
    id: 'eml-to-pdf',
    category: 'convert-to-pdf',
    nameKey: 'hubToolEmlToPdf',
    descKey: 'hubToolEmlToPdfDesc',
    endpoint: '/api/v1/convert/eml/pdf',
    icon: FileText,
    colorScheme: 'emerald',
  },
  {
    id: 'img-to-pdf',
    category: 'convert-to-pdf',
    nameKey: 'hubToolImgToPdf',
    descKey: 'hubToolImgToPdfDesc',
    endpoint: '/api/v1/convert/img/pdf',
    icon: ImageIcon,
    isPopular: true,
    colorScheme: 'emerald',
  },
  {
    id: 'markdown-to-pdf',
    category: 'convert-to-pdf',
    nameKey: 'hubToolMarkdownToPdf',
    descKey: 'hubToolMarkdownToPdfDesc',
    endpoint: '/api/v1/convert/markdown/pdf',
    icon: FileText,
    colorScheme: 'emerald',
  },
  {
    id: 'url-to-pdf',
    category: 'convert-to-pdf',
    nameKey: 'hubToolUrlToPdf',
    descKey: 'hubToolUrlToPdfDesc',
    endpoint: '/api/v1/convert/url/pdf',
    icon: Globe,
    colorScheme: 'emerald',
  },

  // =========================================================================
  // 3. Convert from PDF (Cyan/Teal Icons) - 7 tools
  // =========================================================================
  {
    id: 'pdf-to-csv',
    category: 'convert-from-pdf',
    nameKey: 'hubToolPdfToCsv',
    descKey: 'hubToolPdfToCsvDesc',
    endpoint: '/api/v1/convert/pdf/csv',
    icon: FileSpreadsheet,
    colorScheme: 'cyan',
  },
  {
    id: 'pdf-to-html',
    category: 'convert-from-pdf',
    nameKey: 'hubToolPdfToHtml',
    descKey: 'hubToolPdfToHtmlDesc',
    endpoint: '/api/v1/convert/pdf/html',
    icon: FileCode,
    colorScheme: 'cyan',
  },
  {
    id: 'pdf-to-img',
    category: 'convert-from-pdf',
    nameKey: 'hubToolPdfToImg',
    descKey: 'hubToolPdfToImgDesc',
    endpoint: '/api/v1/convert/pdf/img',
    icon: ImageIcon,
    isPopular: true,
    colorScheme: 'cyan',
  },
  {
    id: 'pdf-to-markdown',
    category: 'convert-from-pdf',
    nameKey: 'hubToolPdfToMarkdown',
    descKey: 'hubToolPdfToMarkdownDesc',
    endpoint: '/api/v1/convert/pdf/markdown',
    icon: FileText,
    colorScheme: 'cyan',
  },
  {
    id: 'pdf-to-presentation',
    category: 'convert-from-pdf',
    nameKey: 'hubToolPdfToPresentation',
    descKey: 'hubToolPdfToPresentationDesc',
    endpoint: '/api/v1/convert/pdf/presentation',
    icon: FileText,
    colorScheme: 'cyan',
  },
  {
    id: 'pdf-to-rtf',
    category: 'convert-from-pdf',
    nameKey: 'hubToolPdfToRtf',
    descKey: 'hubToolPdfToRtfDesc',
    endpoint: '/api/v1/convert/pdf/rtf',
    icon: FileText,
    colorScheme: 'cyan',
  },
  {
    id: 'pdf-to-word',
    category: 'convert-from-pdf',
    nameKey: 'hubToolPdfToWord',
    descKey: 'hubToolPdfToWordDesc',
    endpoint: '/api/v1/convert/pdf/word',
    icon: FileText,
    isPopular: true,
    colorScheme: 'cyan',
  },

  // =========================================================================
  // 4. Sign & Security (Rose/Pink Icons) - 12 tools
  // =========================================================================
  {
    id: 'add-password',
    category: 'sign-security',
    nameKey: 'hubToolAddPassword',
    descKey: 'hubToolAddPasswordDesc',
    endpoint: '/api/v1/security/add-password',
    icon: Lock,
    colorScheme: 'rose',
  },
  {
    id: 'add-stamp',
    category: 'sign-security',
    nameKey: 'hubToolAddStamp',
    descKey: 'hubToolAddStampDesc',
    endpoint: '/api/v1/misc/add-stamp',
    icon: Stamp,
    colorScheme: 'rose',
  },
  {
    id: 'watermark',
    category: 'sign-security',
    nameKey: 'hubToolWatermark',
    descKey: 'hubToolWatermarkDesc',
    endpoint: '/api/v1/misc/watermark',
    icon: Stamp,
    colorScheme: 'rose',
  },
  {
    id: 'auto-redact',
    category: 'sign-security',
    nameKey: 'hubToolAutoRedact',
    descKey: 'hubToolAutoRedactDesc',
    endpoint: '/api/v1/security/auto-redact',
    icon: Eraser,
    colorScheme: 'rose',
  },
  {
    id: 'change-permissions',
    category: 'sign-security',
    nameKey: 'hubToolChangePermissions',
    descKey: 'hubToolChangePermissionsDesc',
    endpoint: '/api/v1/security/change-permissions',
    icon: Key,
    colorScheme: 'rose',
  },
  {
    id: 'manual-redact',
    category: 'sign-security',
    nameKey: 'hubToolManualRedact',
    descKey: 'hubToolManualRedactDesc',
    endpoint: '/api/v1/security/manual-redaction',
    icon: Eraser,
    isNew: true,
    isPopular: true,
    colorScheme: 'rose',
  },
  {
    id: 'remove-cert-sign',
    category: 'sign-security',
    nameKey: 'hubToolRemoveCertSign',
    descKey: 'hubToolRemoveCertSignDesc',
    endpoint: '/api/v1/security/remove-cert-sign',
    icon: Shield,
    colorScheme: 'rose',
  },
  {
    id: 'remove-password',
    category: 'sign-security',
    nameKey: 'hubToolRemovePassword',
    descKey: 'hubToolRemovePasswordDesc',
    endpoint: '/api/v1/security/remove-password',
    icon: Unlock,
    colorScheme: 'rose',
  },
  {
    id: 'sanitize-pdf',
    category: 'sign-security',
    nameKey: 'hubToolSanitizePdf',
    descKey: 'hubToolSanitizePdfDesc',
    endpoint: '/api/v1/security/sanitize-pdf',
    icon: ShieldCheck,
    colorScheme: 'rose',
  },
  {
    id: 'sign',
    category: 'sign-security',
    nameKey: 'hubToolSign',
    descKey: 'hubToolSignDesc',
    endpoint: '/api/v1/security/sign',
    icon: PenTool,
    colorScheme: 'rose',
  },
  {
    id: 'cert-sign',
    category: 'sign-security',
    nameKey: 'hubToolCertSign',
    descKey: 'hubToolCertSignDesc',
    endpoint: '/api/v1/security/cert-sign',
    icon: ShieldCheck,
    isPopular: true,
    colorScheme: 'rose',
  },
  {
    id: 'validate-signature',
    category: 'sign-security',
    nameKey: 'hubToolValidateSignature',
    descKey: 'hubToolValidateSignatureDesc',
    endpoint: '/api/v1/security/validate-signature',
    icon: ShieldCheck,
    isPopular: true,
    colorScheme: 'rose',
  },

  // =========================================================================
  // 5. View & Edit (Lime/Green Icons) - 12 tools
  // =========================================================================
  {
    id: 'add-image',
    category: 'view-edit',
    nameKey: 'hubToolAddImage',
    descKey: 'hubToolAddImageDesc',
    endpoint: '/api/v1/misc/add-image',
    icon: ImageIcon,
    colorScheme: 'lime',
  },
  {
    id: 'add-page-numbers',
    category: 'view-edit',
    nameKey: 'hubToolAddPageNumbers',
    descKey: 'hubToolAddPageNumbersDesc',
    endpoint: '/api/v1/misc/add-page-numbers',
    icon: Heading,
    colorScheme: 'lime',
  },
  {
    id: 'adjust-colors',
    category: 'view-edit',
    nameKey: 'hubToolAdjustColors',
    descKey: 'hubToolAdjustColorsDesc',
    endpoint: '/api/v1/misc/adjust-colors',
    icon: Palette,
    colorScheme: 'lime',
  },
  {
    id: 'edit-metadata',
    category: 'view-edit',
    nameKey: 'hubToolEditMetadata',
    descKey: 'hubToolEditMetadataDesc',
    endpoint: '/api/v1/misc/metadata',
    icon: FileText,
    colorScheme: 'lime',
  },
  {
    id: 'compare-pdfs',
    category: 'view-edit',
    nameKey: 'hubToolComparePdfs',
    descKey: 'hubToolComparePdfsDesc',
    endpoint: '/api/v1/misc/compare',
    icon: ArrowRightLeft,
    colorScheme: 'lime',
  },
  {
    id: 'extract-images',
    category: 'view-edit',
    nameKey: 'hubToolExtractImages',
    descKey: 'hubToolExtractImagesDesc',
    endpoint: '/api/v1/misc/extract-images',
    icon: ImageIcon,
    colorScheme: 'lime',
  },
  {
    id: 'flatten-forms',
    category: 'view-edit',
    nameKey: 'hubToolFlattenForms',
    descKey: 'hubToolFlattenFormsDesc',
    endpoint: '/api/v1/misc/flatten',
    icon: FileCheck2,
    colorScheme: 'lime',
  },
  {
    id: 'doc-properties',
    category: 'view-edit',
    nameKey: 'hubToolDocProperties',
    descKey: 'hubToolDocPropertiesDesc',
    endpoint: '/api/v1/misc/document-properties',
    icon: Eye,
    colorScheme: 'lime',
  },
  {
    id: 'ocr-pdf',
    category: 'view-edit',
    nameKey: 'hubToolOcrPdf',
    descKey: 'hubToolOcrPdfDesc',
    endpoint: '/api/v1/misc/ocr-pdf',
    icon: FileText,
    isPopular: true,
    colorScheme: 'lime',
  },
  {
    id: 'remove-annotations',
    category: 'view-edit',
    nameKey: 'hubToolRemoveAnnotations',
    descKey: 'hubToolRemoveAnnotationsDesc',
    endpoint: '/api/v1/misc/remove-annotations',
    icon: Eraser,
    colorScheme: 'lime',
  },
  {
    id: 'remove-blanks',
    category: 'view-edit',
    nameKey: 'hubToolRemoveBlanks',
    descKey: 'hubToolRemoveBlanksDesc',
    endpoint: '/api/v1/misc/remove-blanks',
    icon: Trash2,
    colorScheme: 'lime',
  },
  {
    id: 'remove-images',
    category: 'view-edit',
    nameKey: 'hubToolRemoveImages',
    descKey: 'hubToolRemoveImagesDesc',
    endpoint: '/api/v1/misc/remove-images',
    icon: ImageIcon,
    colorScheme: 'lime',
  },

  // =========================================================================
  // 6. Advanced & Processor (Orange/Coral Icons) - 10 tools
  // =========================================================================
  {
    id: 'adjust-contrast',
    category: 'advanced-processor',
    nameKey: 'hubToolAdjustContrast',
    descKey: 'hubToolAdjustContrastDesc',
    endpoint: '/api/v1/misc/adjust-colors',
    icon: Palette,
    colorScheme: 'orange',
  },
  {
    id: 'auto-rename',
    category: 'advanced-processor',
    nameKey: 'hubToolAutoRename',
    descKey: 'hubToolAutoRenameDesc',
    endpoint: '/api/v1/misc/auto-rename',
    icon: Heading,
    isNew: true,
    colorScheme: 'orange',
  },
  {
    id: 'split-by-size',
    category: 'advanced-processor',
    nameKey: 'hubToolSplitBySize',
    descKey: 'hubToolSplitBySizeDesc',
    endpoint: '/api/v1/general/split-by-size-or-count',
    icon: Scissors,
    colorScheme: 'orange',
  },
  {
    id: 'auto-split',
    category: 'advanced-processor',
    nameKey: 'hubToolAutoSplit',
    descKey: 'hubToolAutoSplitDesc',
    endpoint: '/api/v1/general/auto-split-pdf',
    icon: Split,
    colorScheme: 'orange',
  },
  {
    id: 'compress-pdf',
    category: 'advanced-processor',
    nameKey: 'hubToolCompressPdf',
    descKey: 'hubToolCompressPdfDesc',
    endpoint: '/api/v1/misc/compress-pdf',
    icon: Minimize2,
    isPopular: true,
    colorScheme: 'orange',
  },
  {
    id: 'overlay-pdfs',
    category: 'advanced-processor',
    nameKey: 'hubToolOverlayPdfs',
    descKey: 'hubToolOverlayPdfsDesc',
    endpoint: '/api/v1/general/overlay-pdf',
    icon: Layers,
    colorScheme: 'orange',
  },
  {
    id: 'pipeline-processor',
    category: 'advanced-processor',
    nameKey: 'hubToolPipelineProcessor',
    descKey: 'hubToolPipelineProcessorDesc',
    endpoint: '/api/v1/pipeline/handleData',
    icon: Cpu,
    isPopular: true,
    colorScheme: 'orange',
  },
  {
    id: 'repair-pdf',
    category: 'advanced-processor',
    nameKey: 'hubToolRepairPdf',
    descKey: 'hubToolRepairPdfDesc',
    endpoint: '/api/v1/misc/repair',
    icon: AlertTriangle,
    colorScheme: 'orange',
  },
  {
    id: 'show-javascript',
    category: 'advanced-processor',
    nameKey: 'hubToolShowJavascript',
    descKey: 'hubToolShowJavascriptDesc',
    endpoint: '/api/v1/misc/show-javascript',
    icon: FileCode,
    colorScheme: 'orange',
  },
  {
    id: 'split-by-chapters',
    category: 'advanced-processor',
    nameKey: 'hubToolSplitByChapters',
    descKey: 'hubToolSplitByChaptersDesc',
    endpoint: '/api/v1/general/split-pdf-by-chapters',
    icon: BookmarkCheck,
    colorScheme: 'orange',
  },
  {
    id: 'filter-contains-text',
    category: 'advanced-processor',
    nameKey: 'hubToolFilterContainsText',
    descKey: 'hubToolFilterContainsTextDesc',
    endpoint: '/api/v1/filter/filter-contains-text',
    icon: FileText,
    colorScheme: 'orange',
  },
  {
    id: 'filter-contains-image',
    category: 'advanced-processor',
    nameKey: 'hubToolFilterContainsImage',
    descKey: 'hubToolFilterContainsImageDesc',
    endpoint: '/api/v1/filter/filter-contains-image',
    icon: ImageIcon,
    colorScheme: 'orange',
  },
  {
    id: 'filter-page-count',
    category: 'advanced-processor',
    nameKey: 'hubToolFilterPageCount',
    descKey: 'hubToolFilterPageCountDesc',
    endpoint: '/api/v1/filter/filter-page-count',
    icon: Layers,
    colorScheme: 'orange',
  },
  {
    id: 'filter-page-size',
    category: 'advanced-processor',
    nameKey: 'hubToolFilterPageSize',
    descKey: 'hubToolFilterPageSizeDesc',
    endpoint: '/api/v1/filter/filter-page-size',
    icon: Maximize2,
    colorScheme: 'orange',
  },
  {
    id: 'filter-file-size',
    category: 'advanced-processor',
    nameKey: 'hubToolFilterFileSize',
    descKey: 'hubToolFilterFileSizeDesc',
    endpoint: '/api/v1/filter/filter-file-size',
    icon: SlidersHorizontal,
    colorScheme: 'orange',
  },
  {
    id: 'filter-page-rotation',
    category: 'advanced-processor',
    nameKey: 'hubToolFilterPageRotation',
    descKey: 'hubToolFilterPageRotationDesc',
    endpoint: '/api/v1/filter/filter-page-rotation',
    icon: RotateCw,
    colorScheme: 'orange',
  },
];

const toolName = (tool: StirlingToolDef, locale: 'ar' | 'en') => tool.custom?.name ?? translations[locale][tool.nameKey];
const toolDesc = (tool: StirlingToolDef, locale: 'ar' | 'en') => tool.custom?.desc ?? translations[locale][tool.descKey];

const newPipelineId = () => `pipe-${Date.now()}`;

const QUICK_LAUNCH_TOOLS = ['manual-redact', 'multi-tool', 'compress-pdf', 'pipeline-processor', 'validate-signature'];

const AVAILABLE_PIPELINE_STEPS: {
  operation: string;
  labelKey: TranslationKey;
  defaultParams: Record<string, unknown>;
  category: 'filter' | 'tool';
}[] = [
  // 6 Conditional Filter Gates
  { operation: '/api/v1/filter/filter-contains-text', labelKey: 'hubStepFilterContainsText', defaultParams: { inverted: false }, category: 'filter' },
  { operation: '/api/v1/filter/filter-contains-image', labelKey: 'hubStepFilterContainsImage', defaultParams: { inverted: false, pageNumbers: 'all' }, category: 'filter' },
  { operation: '/api/v1/filter/filter-page-count', labelKey: 'hubStepFilterPageCount', defaultParams: { comparator: 'greater-than', count: 5 }, category: 'filter' },
  { operation: '/api/v1/filter/filter-page-size', labelKey: 'hubStepFilterPageSize', defaultParams: { pageSize: 'A4', comparator: 'equals' }, category: 'filter' },
  { operation: '/api/v1/filter/filter-file-size', labelKey: 'hubStepFilterFileSize', defaultParams: { comparator: 'less-than', sizeMb: 20 }, category: 'filter' },
  { operation: '/api/v1/filter/filter-page-rotation', labelKey: 'hubStepFilterPageRotation', defaultParams: { rotation: 0, comparator: 'equals' }, category: 'filter' },
  // Core Processing Tools
  { operation: '/api/v1/misc/ocr-pdf', labelKey: 'hubStepOcrPdf', defaultParams: { languages: ['ara', 'eng'], ocrType: 'skip-text' }, category: 'tool' },
  { operation: '/api/v1/misc/compress-pdf', labelKey: 'hubStepCompressPdf', defaultParams: { optimizeLevel: 2 }, category: 'tool' },
  { operation: '/api/v1/security/sanitize-pdf', labelKey: 'hubStepSanitizePdf', defaultParams: {}, category: 'tool' },
  { operation: '/api/v1/security/auto-redact', labelKey: 'hubStepAutoRedact', defaultParams: { words: ['[\\w.-]+@[\\w.-]+\\.\\w+'], useRegex: true, wholeWordSearch: true }, category: 'tool' },
  { operation: '/api/v1/security/add-watermark', labelKey: 'hubStepAddWatermark', defaultParams: { watermarkText: 'CONFIDENTIAL', fontSize: 36, opacity: 0.25, rotation: 45 }, category: 'tool' },
  { operation: '/api/v1/misc/flatten', labelKey: 'hubStepFlatten', defaultParams: {}, category: 'tool' },
  { operation: '/api/v1/misc/remove-annotations', labelKey: 'hubStepRemoveAnnotations', defaultParams: {}, category: 'tool' },
  { operation: '/api/v1/general/rotate-pdf', labelKey: 'hubStepRotatePdf', defaultParams: { angle: 90 }, category: 'tool' },
  { operation: '/api/v1/misc/repair', labelKey: 'hubStepRepair', defaultParams: {}, category: 'tool' },
  { operation: '/api/v1/misc/linearize', labelKey: 'hubStepLinearize', defaultParams: {}, category: 'tool' },
];

export function StirlingToolsHub({
  onClose,
  onOpenInWorkstation,
  initialView = 'columns',
  actionsPanel,
  initialToolId,
}: {
  onClose: () => void;
  onOpenInWorkstation?: (fileUrlOrWorkId: string) => void;
  initialView?: 'columns' | 'pipelines';
  actionsPanel?: React.ReactNode;
  initialToolId?: string;
}) {
  const { t, lang, dir, books, theme, toggleTheme } = useWorkspace();
  const [searchQuery, setSearchQuery] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [sortMode, setSortMode] = useState<'category' | 'alpha'>('category');
  const [viewMode, setViewMode] = useState<'columns' | 'grid' | 'pipelines'>(initialView);
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('baglib_stirling_favorites');
      return stored ? JSON.parse(stored) : ['multi-tool', 'compress-pdf', 'ocr-pdf', 'pipeline-processor'];
    } catch {
      return ['multi-tool', 'compress-pdf', 'ocr-pdf', 'pipeline-processor'];
    }
  });

  const [engineStatus, setEngineStatus] = useState<StirlingEngineInfo>({ status: 'ready', version: '3.2.2' });
  const [telemetry, setTelemetry] = useState<StirlingProcessorTelemetry>({
    activePipelines: 3,
    totalPipelines: 3,
    processedToday: 235,
    watchedFolders: 1,
  });

  const [pipelines, setPipelines] = useState<StirlingPipeline[]>([]);
  const [watchedFolders, setWatchedFolders] = useState<WatchedFolderSource[]>([]);
  const [policies, setPolicies] = useState<StirlingGovernancePolicies | null>(null);

  // Watched Folder Form State
  const [isConnectingFolder, setIsConnectingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderInbox, setNewFolderInbox] = useState('');
  const [newFolderOutput, setNewFolderOutput] = useState('');
  const [newFolderPipelineId, setNewFolderPipelineId] = useState('');
  const [newFolderRule, setNewFolderRule] = useState<'keep' | 'archive'>('keep');

  // Selected tool execution drawer / modal state
  const [selectedTool, setSelectedTool] = useState<StirlingToolDef | null>(() => STIRLING_TOOLS.find(tool => tool.id === initialToolId) ?? null);
  const [selectedBookId, setSelectedBookId] = useState<string>('');
  const [localFilePath, setLocalFilePath] = useState<string>('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<{
    success: boolean;
    outputPath?: string;
    bytes?: number;
    sha256?: string;
    error?: string;
  } | null>(null);

  // Standalone Tool Parameters
  const [toolValues, setToolValues] = useState<ToolOptionValues>(() => initialToolId ? defaultToolValues(initialToolId) : {});

  // Pipeline Builder State
  const [isCreatingPipeline, setIsCreatingPipeline] = useState(false);
  const [editingPipeline, setEditingPipeline] = useState<StirlingPipeline | null>(null);
  const [pipelineName, setPipelineName] = useState('');
  const [pipelineDesc, setPipelineDesc] = useState('');
  const [pipelineTrigger, setPipelineTrigger] = useState<'editor' | 'folder' | 'manual'>('editor');
  const [pipelineSteps, setPipelineSteps] = useState<StirlingPipelineStep[]>([]);
  const [stepToAdd, setStepToAdd] = useState(AVAILABLE_PIPELINE_STEPS[0].operation);
  const [activePoliciesAccordion, setActivePoliciesAccordion] = useState<string | null>('ingestion');

  const handleApplySuggestedAutomation = (type: 'scholarly' | 'prepublish' | 'confidential') => {
    if (type === 'scholarly') {
      setPipelineName(t('hubAutomationScholarly'));
      setPipelineDesc(t('hubAutomationScholarlyDesc'));
      setPipelineTrigger('folder');
      setPipelineSteps([
        { id: `s-${Date.now()}-1`, operation: '/api/v1/filter/filter-contains-image', name: t('hubPresetContainsImage'), parameters: { pageNumbers: 'all' } },
        { id: `s-${Date.now()}-2`, operation: '/api/v1/misc/ocr-pdf', name: t('hubPresetOcr'), parameters: { languages: ['ara', 'eng'], ocrType: 'skip-text' } },
        { id: `s-${Date.now()}-3`, operation: '/api/v1/misc/compress-pdf', name: t('hubPresetCompress'), parameters: { optimizeLevel: 3 } },
      ]);
    } else if (type === 'prepublish') {
      setPipelineName(t('hubAutomationPrepublish'));
      setPipelineDesc(t('hubAutomationPrepublishDesc'));
      setPipelineTrigger('manual');
      setPipelineSteps([
        { id: `s-${Date.now()}-1`, operation: '/api/v1/security/sanitize-pdf', name: t('hubPresetSanitize'), parameters: {} },
        { id: `s-${Date.now()}-2`, operation: '/api/v1/misc/remove-annotations', name: t('hubPresetRemoveAnnotations'), parameters: {} },
        { id: `s-${Date.now()}-3`, operation: '/api/v1/misc/flatten', name: t('hubPresetFlatten'), parameters: {} },
      ]);
    } else if (type === 'confidential') {
      setPipelineName(t('hubAutomationConfidential'));
      setPipelineDesc(t('hubAutomationConfidentialDesc'));
      setPipelineTrigger('folder');
      setPipelineSteps([
        {
          id: `s-${Date.now()}-1`,
          operation: '/api/v1/security/auto-redact',
          name: t('hubPresetAutoRedact'),
          parameters: {
            words: [
              '[\\w.-]+@[\\w.-]+\\.\\w+',
              '\\d{3}-\\d{2}-\\d{4}',
              '\\d{4}[ -]?\\d{4}[ -]?\\d{4}[ -]?\\d{4}',
              '\\(\\d{3}\\)\\s*\\d{3}-\\d{4}',
            ],
            useRegex: true,
            wholeWordSearch: true,
          },
        },
        { id: `s-${Date.now()}-2`, operation: '/api/v1/security/sanitize-pdf', name: t('hubPresetSanitize'), parameters: {} },
        { id: `s-${Date.now()}-3`, operation: '/api/v1/security/add-watermark', name: t('hubPresetWatermark'), parameters: { watermarkText: 'CONFIDENTIAL', fontSize: 36, opacity: 0.25, rotation: 45 } },
      ]);
    }
  };

  const handleAddStep = () => {
    const found = AVAILABLE_PIPELINE_STEPS.find(s => s.operation === stepToAdd);
    if (!found) return;
    setPipelineSteps(prev => [
      ...prev,
      {
        id: `s-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        operation: found.operation,
        name: t(found.labelKey),
        parameters: { ...found.defaultParams },
      },
    ]);
  };

  const handleMoveStep = (index: number, direction: 'up' | 'down') => {
    setPipelineSteps(prev => {
      const target = direction === 'up' ? index - 1 : index + 1;
      if (target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[target];
      copy[target] = temp;
      return copy;
    });
  };

  const handleRemoveStep = (index: number) => {
    setPipelineSteps(prev => prev.filter((_, i) => i !== index));
  };

  const handleSavePipeline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pipelineName.trim() || pipelineSteps.length === 0) return;
    const newPipeline: StirlingPipeline = {
      id: editingPipeline?.id || newPipelineId(),
      name: pipelineName.trim(),
      description: pipelineDesc.trim(),
      trigger: pipelineTrigger,
      active: editingPipeline ? editingPipeline.active : true,
      steps: pipelineSteps,
      createdAt: editingPipeline?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    try {
      await window.electronAPI?.pdfEditor?.savePipeline?.(newPipeline);
      await refreshData();
      setIsCreatingPipeline(false);
      setEditingPipeline(null);
      setPipelineName('');
      setPipelineDesc('');
      setPipelineSteps([]);
    } catch (err) {
      console.error('Failed to save pipeline:', err);
    }
  };

  const handleDeletePipeline = async (id: string) => {
    try {
      await window.electronAPI?.pdfEditor?.deletePipeline?.(id);
      await refreshData();
    } catch (err) {
      console.error('Failed to delete pipeline:', err);
    }
  };

  // Refresh Telemetry & Pipelines
  const refreshData = async () => {
    try {
      const editor = window.electronAPI?.pdfEditor;
      if (!editor) return;
      const [tRes, pRes, fRes, polRes, eRes] = await Promise.all([
        editor.getProcessorTelemetry?.().catch(() => null),
        editor.listPipelines?.().catch(() => null),
        editor.getWatchedFolders?.().catch(() => null),
        editor.getPolicies?.().catch(() => null),
        editor.engineStatus?.().catch(() => null),
      ]);
      if (tRes?.ok === true) setTelemetry(tRes.data);
      if (pRes?.ok === true) setPipelines(pRes.data);
      if (fRes?.ok === true) setWatchedFolders(fRes.data);
      if (polRes?.ok === true) setPolicies(polRes.data);
      if (eRes?.ok === true) setEngineStatus(eRes.data);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    void refreshData();
  }, []);

  const toggleFavorite = (toolId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites(prev => {
      const updated = prev.includes(toolId) ? prev.filter(id => id !== toolId) : [...prev, toolId];
      try {
        localStorage.setItem('baglib_stirling_favorites', JSON.stringify(updated));
      } catch {
        /* ignore */
      }
      return updated;
    });
  };

  const filteredTools = useMemo(() => {
    let list = STIRLING_TOOLS;
    if (favoritesOnly) {
      list = list.filter(t => favorites.includes(t.id));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        t =>
          (['ar', 'en'] as const).some(locale => toolName(t, locale).toLowerCase().includes(q) || toolDesc(t, locale).toLowerCase().includes(q)) ||
          t.id.toLowerCase().includes(q)
      );
    }
    if (sortMode === 'alpha') {
      list = [...list].sort((a, b) => {
        const nameA = toolName(a, lang);
        const nameB = toolName(b, lang);
        return nameA.localeCompare(nameB);
      });
    }
    return list;
  }, [searchQuery, favoritesOnly, sortMode, favorites, lang]);

  const categorized = useMemo(() => {
    const categories: Record<StirlingCategory, StirlingToolDef[]> = {
      'organize': [],
      'convert-to-pdf': [],
      'convert-from-pdf': [],
      'sign-security': [],
      'view-edit': [],
      'advanced-processor': [],
    };
    for (const tool of filteredTools) {
      categories[tool.category].push(tool);
    }
    return categories;
  }, [filteredTools]);

  const handleToolClick = (tool: StirlingToolDef) => {
    if (tool.id === 'pipeline-processor') {
      setViewMode('pipelines');
      return;
    }
    setSelectedTool(tool);
    setToolValues(defaultToolValues(tool.id));
    setExecutionResult(null);
  };

  const missingOption = selectedTool ? missingToolOption(selectedTool.id, toolValues) : undefined;
  const invalidOption = selectedTool ? invalidToolOption(selectedTool.id, toolValues) : undefined;

  const handleExecuteTool = async () => {
    if (!selectedTool) return;
    setIsExecuting(true);
    setExecutionResult(null);

    try {
      if (STIRLING_INTERACTIVE_ENDPOINTS.has(selectedTool.endpoint)) throw new Error(t('pdfInteractiveToolHint'));
      let targetPath = localFilePath;
      if (!targetPath && selectedBookId) {
        const book = books.find(b => b.id === selectedBookId);
        if (book?.filePath) targetPath = book.filePath;
      }

      const needsNoFile = TOOLS_WITHOUT_INPUT_FILE.has(selectedTool.id);
      if (!targetPath && !needsNoFile) {
        throw new Error(t('pdfSelectFileToProcess'));
      }

      const params = toolParameters(selectedTool.id, toolValues);

      const editor = window.electronAPI?.pdfEditor;
      if (!editor?.executePipeline) {
        throw new Error(t('pdfSuiteOperationFailed'));
      }

      const res = await editor.executePipeline({
        filePaths: needsNoFile ? [] : [targetPath, ...((toolValues[ADDITIONAL_FILES] as string[] | undefined) ?? [])],
        pipelineConfig: {
          name: `Standalone: ${toolName(selectedTool, 'en')}`,
          singleTool: true,
          pipeline: [{ operation: selectedTool.endpoint, parameters: params }],
        },
      });

      if (res?.ok === true && res.data.outputPath) {
        setExecutionResult({
          success: true,
          outputPath: res.data.outputPath,
          bytes: res.data.bytes,
          sha256: res.data.sha256,
        });
        void refreshData();
      } else {
        const reason = res?.ok === false ? res.error : undefined;
        throw new Error(t(reason === 'no-output' ? 'pdfPipelineNoOutput' : reason === 'engine-missing' ? 'pdfEngineComponentMissing' : reason === 'no-tables' ? 'pdfNoTablesFound' : reason === 'no-bookmarks' ? 'pdfNoBookmarksFound' : reason === 'redaction-unverified' ? 'pdfAutoRedactUnverified' : reason === 'certificate-invalid' ? 'pdfPrivateKeyFormat' : reason === 'owner-password-required' ? 'pdfPermissionsPasswordRequired' : reason === 'encrypted' ? 'pdfWrongPassword' : reason === 'invalid-request' ? 'pdfToolNeedsInput' : 'pdfSuiteOperationFailed'));
      }
    } catch (err: unknown) {
      setExecutionResult({
        success: false,
        error: err instanceof Error && err.message ? err.message : t('pdfSuiteOperationFailed'),
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const handleConnectFolderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim() || !newFolderInbox.trim() || !newFolderOutput.trim()) return;
    const newEntry: WatchedFolderSource = {
      id: `wf-${Date.now()}`,
      name: newFolderName.trim(),
      inputPath: newFolderInbox.trim(),
      outputPath: newFolderOutput.trim(),
      pipelineId: newFolderPipelineId || (pipelines[0]?.id ?? 'pipe-ocr-archive'),
      status: 'watching',
      processedCount: 0,
    };
    const updated = [...watchedFolders, newEntry];
    setWatchedFolders(updated);
    setIsConnectingFolder(false);
    setNewFolderName('');
    setNewFolderInbox('');
    setNewFolderOutput('');
    try {
      await window.electronAPI?.pdfEditor?.saveWatchedFolders?.(updated);
      void refreshData();
    } catch {
      /* ignore */
    }
  };

  const handleDeleteWatchedFolder = async (id: string) => {
    const updated = watchedFolders.filter(f => f.id !== id);
    setWatchedFolders(updated);
    try {
      await window.electronAPI?.pdfEditor?.saveWatchedFolders?.(updated);
      void refreshData();
    } catch {
      /* ignore */
    }
  };

  const isDark = theme === 'dark';

  return (
    <div
      dir={dir}
      data-pdf-tools-hub
      className={`fixed inset-0 z-50 ${
        isDark ? 'bg-canvas text-text' : 'bg-canvas text-text'
      } flex flex-col overflow-hidden font-sans select-none`}
    >
      {/* 1. TOP HEADER & NAVIGATION BAR */}
      <header className={`flex flex-wrap items-center justify-between gap-3 px-3 sm:px-6 py-3 border-b ${
        isDark ? 'border-border bg-canvas' : 'border-border bg-white'
      } shrink-0`}>
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-xl bg-gradient-to-br from-primary to-primary flex items-center justify-center text-white shadow-lg shadow-primary/10">
            <Cpu size={20} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className={`font-bold text-base tracking-tight ${isDark ? 'text-white' : 'text-text'}`}>
                {t('pdfToolsHubTitle')}
              </h1>
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-border/30 bg-primary/10 text-primary-text dark:text-primary-text text-[10px] font-bold">
                <span className="inline-block size-1.5 rounded-full bg-primary animate-pulse" />
                Ready v3.2.2
              </span>
              {/* External Tool Capability Badges */}
              <div className="hidden sm:flex items-center gap-1 font-mono text-[9px]">
                <span
                  title={engineStatus.externalTools?.libreoffice ? t('stirlingToolAvailable') : t('stirlingToolMissing')}
                  className={`flex items-center gap-1 px-1.5 py-0.2 rounded-full border ${
                    engineStatus.externalTools?.libreoffice
                      ? 'border-border/30 bg-primary/10 text-primary-text font-bold'
                      : 'border-border/20 bg-surface/10 text-text-muted opacity-60'
                  }`}
                >
                  <span className={`size-1 rounded-full ${engineStatus.externalTools?.libreoffice ? 'bg-primary' : 'bg-surface'}`} />
                  LibreOffice
                </span>
                <span
                  title={engineStatus.externalTools?.tesseract ? t('stirlingToolAvailable') : t('stirlingToolMissing')}
                  className={`flex items-center gap-1 px-1.5 py-0.2 rounded-full border ${
                    engineStatus.externalTools?.tesseract
                      ? 'border-border/30 bg-primary/10 text-primary-text font-bold'
                      : 'border-border/20 bg-surface/10 text-text-muted opacity-60'
                  }`}
                >
                  <span className={`size-1 rounded-full ${engineStatus.externalTools?.tesseract ? 'bg-primary' : 'bg-surface'}`} />
                  Tesseract
                </span>
                <span
                  title={engineStatus.externalTools?.qpdf ? t('stirlingToolAvailable') : t('stirlingToolMissing')}
                  className={`flex items-center gap-1 px-1.5 py-0.2 rounded-full border ${
                    engineStatus.externalTools?.qpdf
                      ? 'border-border/30 bg-primary/10 text-primary-text font-bold'
                      : 'border-border/20 bg-surface/10 text-text-muted opacity-60'
                  }`}
                >
                  <span className={`size-1 rounded-full ${engineStatus.externalTools?.qpdf ? 'bg-primary' : 'bg-surface'}`} />
                  QPDF
                </span>
                <span
                  title={engineStatus.externalTools?.ghostscript ? t('stirlingToolAvailable') : t('stirlingToolMissing')}
                  className={`flex items-center gap-1 px-1.5 py-0.2 rounded-full border ${
                    engineStatus.externalTools?.ghostscript
                      ? 'border-border/30 bg-primary/10 text-primary-text font-bold'
                      : 'border-border/20 bg-surface/10 text-text-muted opacity-60'
                  }`}
                >
                  <span className={`size-1 rounded-full ${engineStatus.externalTools?.ghostscript ? 'bg-primary' : 'bg-surface'}`} />
                  Ghostscript
                </span>
                <span
                  title={engineStatus.externalTools?.weasyprint ? t('stirlingToolAvailable') : t('stirlingToolMissing')}
                  className={`flex items-center gap-1 px-1.5 py-0.2 rounded-full border ${
                    engineStatus.externalTools?.weasyprint
                      ? 'border-border/30 bg-primary/10 text-primary-text font-bold'
                      : 'border-border/20 bg-surface/10 text-text-muted opacity-60'
                  }`}
                >
                  <span className={`size-1 rounded-full ${engineStatus.externalTools?.weasyprint ? 'bg-primary' : 'bg-surface'}`} />
                  WeasyPrint
                </span>
              </div>
            </div>
            <p className={`text-[11px] ${isDark ? 'text-text' : 'text-text'}`}>{t('pdfToolsHubSubtitle')}</p>
          </div>
        </div>

        {/* Quick Nav Pills */}
        <div className={`hidden lg:flex items-center gap-1.5 ${
          isDark ? 'bg-canvas border-border' : 'bg-canvas border-border'
        } p-1 rounded-xl border`}>
          {[
            { id: 'multi-tool', labelKey: 'hubToolMultiTool' as const },
            { id: 'pipelines', labelKey: 'hubToolPipelineProcessor' as const },
            { id: 'compress-pdf', labelKey: 'hubToolCompressPdf' as const },
            { id: 'split', labelKey: 'hubToolSplit' as const },
            { id: 'merge', labelKey: 'hubToolMerge' as const },
          ].map(pill => (
            <Button variant="secondary" size="sm"
              key={pill.id}
              type="button"
              onClick={() => {
                if (pill.id === 'pipelines') setViewMode('pipelines');
                else {
                  setViewMode('columns');
                  const target = STIRLING_TOOLS.find(t => t.id === pill.id);
                  if (target) handleToolClick(target);
                }
              }}
              className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                isDark ? 'text-text hover:text-white hover:bg-canvas' : 'text-text hover:text-text hover:bg-white'
              } transition-all cursor-pointer`}
            >
              {t(pill.labelKey)}
            </Button>
          ))}
        </div>

        {/* Actions & Search */}
        <div className="flex max-w-full flex-wrap items-center gap-2.5 [&>button]:shrink-0">
          {/* Centered Search */}
          <div className="relative w-full min-w-0 sm:w-64 md:w-80">
            <Search className={`absolute inset-y-0 start-3 my-auto size-4 ${isDark ? 'text-text' : 'text-text'}`} />
            <input
              type="search"
              aria-label={t('pdfToolsSearchPlaceholder')}
              placeholder={t('pdfToolsSearchPlaceholder')}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className={`w-full ${
                isDark ? 'bg-canvas border-border text-white placeholder-[#686e80]' : 'bg-canvas border-border text-text placeholder-[#94a3b8]'
              } border rounded-xl ps-9 pe-3 py-1.5 text-xs focus:border-border outline-none transition-all`}
            />
          </div>

          {/* Star Filter */}
          <Button variant="secondary" size="sm"
            type="button"
            title={t('pdfToolsFavorites')}
            aria-pressed={favoritesOnly}
            onClick={() => setFavoritesOnly(!favoritesOnly)}
            className={`p-2 rounded-xl border transition-all cursor-pointer ${
              favoritesOnly
                ? 'bg-warning/20 border-warning/40 text-warning dark:text-warning'
                : isDark
                ? 'bg-canvas border-border text-text hover:text-white'
                : 'bg-canvas border-border text-text hover:text-text'
            }`}
          >
            <Star size={16} fill={favoritesOnly ? 'currentColor' : 'none'} />
          </Button>

          {/* Sort Selector */}
          <div className={`flex items-center rounded-xl ${isDark ? 'bg-canvas border-border' : 'bg-canvas border-border'} border p-0.5`}>
            <Button variant="secondary" size="sm"
              type="button"
              onClick={() => setSortMode('category')}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-all cursor-pointer ${
                sortMode === 'category'
                  ? isDark ? 'bg-canvas text-white shadow-sm' : 'bg-white text-text shadow-xs'
                  : isDark ? 'text-text hover:text-white' : 'text-text hover:text-text'
              }`}
            >
              {t('pdfToolsSortCategory')}
            </Button>
            <Button variant="secondary" size="sm"
              type="button"
              onClick={() => setSortMode('alpha')}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-all cursor-pointer ${
                sortMode === 'alpha'
                  ? isDark ? 'bg-canvas text-white shadow-sm' : 'bg-white text-text shadow-xs'
                  : isDark ? 'text-text hover:text-white' : 'text-text hover:text-text'
              }`}
            >
              {t('pdfToolsSortAlpha')}
            </Button>
          </div>

          {/* View Mode Switcher */}
          <div className={`flex items-center rounded-xl ${isDark ? 'bg-canvas border-border' : 'bg-canvas border-border'} border p-0.5`}>
            <Button variant="secondary" size="sm"
              type="button"
              title={t('pdfToolsViewColumns')}
              onClick={() => setViewMode('columns')}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === 'columns'
                  ? isDark ? 'bg-canvas text-white' : 'bg-white text-text shadow-xs'
                  : isDark ? 'text-text hover:text-white' : 'text-text hover:text-text'
              }`}
            >
              <Columns3 size={15} />
            </Button>
            <Button variant="secondary" size="sm"
              type="button"
              title={t('pdfToolsViewGrid')}
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === 'grid'
                  ? isDark ? 'bg-canvas text-white' : 'bg-white text-text shadow-xs'
                  : isDark ? 'text-text hover:text-white' : 'text-text hover:text-text'
              }`}
            >
              <LayoutGrid size={15} />
            </Button>
            <Button variant="secondary" size="sm"
              type="button"
              title={t('pdfToolsViewPipelines')}
              onClick={() => setViewMode('pipelines')}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === 'pipelines'
                  ? 'bg-primary text-white'
                  : isDark ? 'text-text hover:text-white' : 'text-text hover:text-text'
              }`}
            >
              <Cpu size={15} />
            </Button>
          </div>

          {/* Theme Toggle */}
          <Button variant="secondary" size="sm"
            type="button"
            title={isDark ? t('pdfThemeLight') : t('pdfThemeDark')}
            onClick={toggleTheme}
            className={`p-2 rounded-xl border transition-all cursor-pointer ${
              isDark
                ? 'bg-canvas border-border text-text hover:text-white'
                : 'bg-canvas border-border text-text hover:text-text'
            }`}
          >
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
          </Button>

          {/* Close Hub */}
          <Button variant="secondary" size="sm"
            type="button"
            title={t('close')}
            data-stirling-hub-close
            aria-label={t('close')}
            onClick={onClose}
            className={`p-2 rounded-xl border ${
              isDark ? 'border-border hover:bg-canvas text-text hover:text-white' : 'border-border hover:bg-canvas text-text hover:text-text'
            } transition-all cursor-pointer`}
          >
            <X size={16} />
          </Button>
        </div>
      </header>

      {/* 2. MAIN SCROLLABLE CONTENT AREA */}
      <main className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 sm:px-6 py-3 sm:py-5">
        {actionsPanel && <div className="mb-4 max-w-2xl">{actionsPanel}</div>}
        {viewMode === 'pipelines' ? (
          /* ============================================================ */
          /* PIPELINES & AUTOMATED WORKFLOWS VIEW                         */
          /* ============================================================ */
          <div className="max-w-6xl mx-auto space-y-6">
            {/* Live Telemetry Banner */}
            <div className={`p-4 rounded-2xl bg-gradient-to-r ${
              isDark ? 'from-[#141820] to-[#121c17] border-border' : 'from-[#f1f5f9] to-[#ecfdf5] border-border'
            } border shadow-lg flex flex-wrap items-center justify-between gap-4`}>
              <div className="flex items-center gap-3">
                <div className="size-11 rounded-xl bg-primary/20 text-primary-text dark:text-primary-text flex items-center justify-center">
                  <Cpu size={24} />
                </div>
                <div>
                  <h2 className={`font-bold text-sm ${isDark ? 'text-white' : 'text-text'}`}>{t('pdfProcessorLiveTitle')}</h2>
                  <p className={`text-xs ${isDark ? 'text-text' : 'text-text'}`}>
                    {t('pdfProcessorTelemetry', {
                      pipelines: telemetry.activePipelines,
                      today: telemetry.processedToday,
                      folders: telemetry.watchedFolders,
                    })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm"
                  type="button"
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = '.json';
                    input.onchange = async e => {
                      const file = (e.target as HTMLInputElement).files?.[0];
                      if (file) {
                        const text = await file.text();
                        const res = await window.electronAPI?.pdfEditor?.importPipeline?.(text);
                        if (res?.ok === true) {
                          await refreshData();
                        }
                      }
                    };
                    input.click();
                  }}
                  className={`px-3 py-2 rounded-xl border ${
                    isDark ? 'border-border bg-canvas text-text hover:text-white' : 'border-border bg-white text-text hover:text-text'
                  } text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer`}
                >
                  <Upload size={14} />
                  <span>{t('stirlingImportPipelineJson')}</span>
                </Button>
                <Button variant="secondary" size="sm"
                  type="button"
                  onClick={() => setIsConnectingFolder(true)}
                  className="px-3.5 py-2 rounded-xl bg-primary hover:bg-primary text-white text-xs font-bold shadow-md shadow-primary/20 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <FolderPlus size={14} />
                  <span>{t('pdfWatchedFolderConnect')}</span>
                </Button>
                <Button variant="secondary" size="sm"
                  type="button"
                  onClick={() => setIsCreatingPipeline(true)}
                  className="px-3.5 py-2 rounded-xl bg-primary hover:bg-primary text-white text-xs font-bold shadow-md shadow-primary/20 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus size={14} />
                  <span>{t('pdfPipelineNew')}</span>
                </Button>
              </div>
            </div>

            {/* Watched Folder Sources Section */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className={`font-bold text-sm ${isDark ? 'text-white' : 'text-text'}`}>{t('pdfWatchedFoldersTitle')}</h3>
                  <p className={`text-xs ${isDark ? 'text-text' : 'text-text'}`}>{t('pdfWatchedFoldersDesc')}</p>
                </div>
                <Button variant="secondary" size="sm"
                  type="button"
                  onClick={() => setIsConnectingFolder(true)}
                  className="text-xs text-primary-text hover:underline flex items-center gap-1 cursor-pointer font-semibold"
                >
                  <Plus size={12} />
                  <span>{t('pdfWatchedFolderAdd')}</span>
                </Button>
              </div>

              {watchedFolders.length === 0 ? (
                <div className={`p-6 rounded-2xl border text-center ${
                  isDark ? 'border-border bg-canvas text-text' : 'border-border bg-white text-text'
                }`}>
                  <FolderInput className="size-8 mx-auto mb-2 opacity-40 text-primary-text" />
                  <p className="text-xs font-semibold">{t('pdfWatchedFoldersEmpty')}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {watchedFolders.map(folder => (
                    <div
                      key={folder.id}
                      className={`p-4 rounded-xl border ${
                        isDark ? 'bg-canvas border-border' : 'bg-white border-border shadow-xs'
                      } space-y-2.5`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <FolderInput size={16} className="text-primary-text" />
                          <span className={`font-bold text-xs ${isDark ? 'text-white' : 'text-text'}`}>{folder.name}</span>
                        </div>
                        <span className="flex items-center gap-1 text-[10px] text-primary-text font-bold px-2 py-0.5 rounded-full bg-primary/10">
                          <span className="size-1.5 rounded-full bg-primary animate-pulse" />
                          {t('pdfWatchedFolderStatusWatching')}
                        </span>
                      </div>
                      <div className="text-[11px] space-y-1 font-mono">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="text-text">{t('pdfWatchedFolderInput')}:</span>
                          <span className="truncate">{folder.inputPath}</span>
                        </div>
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="text-text">{t('pdfWatchedFolderOutput')}:</span>
                          <span className="truncate">{folder.outputPath}</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between border-t border-border pt-2 text-[10px] text-text">
                        <span>{t('pdfWatchedFolderProcessed', { count: folder.processedCount })}</span>
                        <div className="flex items-center gap-1">
                          <Button variant="secondary" size="sm"
                            type="button"
                            title={t('stirlingExportFolderScanJson')}
                            onClick={async () => {
                              const pipe = pipelines.find(p => p.id === folder.pipelineId) || pipelines[0];
                              const res = await window.electronAPI?.pdfEditor?.exportPipelineFolderScan?.(folder, pipe);
                              if (res?.ok === true) {
                                const blob = new Blob([res.data], { type: 'application/json' });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `${folder.name.toLowerCase().replace(/\s+/g, '-')}.folder-scan.json`;
                                a.click();
                                URL.revokeObjectURL(url);
                              }
                            }}
                            className="p-1 rounded text-primary-text hover:text-primary-text hover:bg-primary/10 cursor-pointer"
                          >
                            <Download size={13} />
                          </Button>
                          <Button variant="secondary" size="sm"
                            type="button"
                            onClick={() => void handleDeleteWatchedFolder(folder.id)}
                            className="text-danger hover:text-danger p-1 cursor-pointer"
                            title={t('delete')}
                          >
                            <Trash2 size={13} />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Connect Folder Inbox Modal */}
            {isConnectingFolder && (
              <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
                <form
                  onSubmit={handleConnectFolderSubmit}
                  className={`w-full max-w-md p-5 rounded-2xl border shadow-2xl ${
                    isDark ? 'bg-canvas border-border text-text' : 'bg-white border-border text-text'
                  } space-y-4`}
                >
                  <div className="flex items-center justify-between border-b pb-3 border-border">
                    <h3 className="font-bold text-sm flex items-center gap-2">
                      <FolderPlus size={16} className="text-primary-text" />
                      {t('pdfWatchedFolderConnect')}
                    </h3>
                    <Button variant="secondary" size="sm" type="button" onClick={() => setIsConnectingFolder(false)} className="cursor-pointer text-text">
                      <X size={16} />
                    </Button>
                  </div>
                  <div className="space-y-3 text-xs">
                    <div>
                      <label className="font-bold block mb-1">{t('pdfWatchedFolderName')}</label>
                      <input
                        type="text"
                        required
                        value={newFolderName}
                        onChange={e => setNewFolderName(e.target.value)}
                        placeholder={t('hubFolderNamePlaceholder')}
                        className={`w-full p-2 rounded-lg border outline-none ${
                          isDark ? 'bg-canvas border-border text-white' : 'bg-canvas border-border text-text'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="font-bold block mb-1">{t('pdfWatchedFolderInput')}</label>
                      <input
                        type="text"
                        required
                        value={newFolderInbox}
                        onChange={e => setNewFolderInbox(e.target.value)}
                        placeholder={t('pdfWatchedFolderInboxPlaceholder')}
                        className={`w-full p-2 rounded-lg border outline-none ${
                          isDark ? 'bg-canvas border-border text-white' : 'bg-canvas border-border text-text'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="font-bold block mb-1">{t('pdfWatchedFolderOutput')}</label>
                      <input
                        type="text"
                        required
                        value={newFolderOutput}
                        onChange={e => setNewFolderOutput(e.target.value)}
                        placeholder={t('pdfWatchedFolderOutputPlaceholder')}
                        className={`w-full p-2 rounded-lg border outline-none ${
                          isDark ? 'bg-canvas border-border text-white' : 'bg-canvas border-border text-text'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="font-bold block mb-1">{t('pdfWatchedFolderAfter')}</label>
                      <select
                        value={newFolderRule}
                        onChange={e => setNewFolderRule(e.target.value as typeof newFolderRule)}
                        className={`w-full p-2 rounded-lg border outline-none ${
                          isDark ? 'bg-canvas border-border text-white' : 'bg-canvas border-border text-text'
                        }`}
                      >
                        <option value="keep">{t('pdfWatchedFolderKeep')}</option>
                        <option value="archive">{t('pdfWatchedFolderArchive')}</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2 border-t border-border">
                    <Button variant="secondary" size="sm"
                      type="button"
                      onClick={() => setIsConnectingFolder(false)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-text cursor-pointer"
                    >
                      {t('cancel')}
                    </Button>
                    <Button variant="secondary" size="sm"
                      type="submit"
                      className="px-4 py-1.5 rounded-lg bg-primary hover:bg-primary text-white text-xs font-bold cursor-pointer"
                    >
                      {t('save')}
                    </Button>
                  </div>
                </form>
              </div>
            )}

            {/* Custom & Presets Pipelines Section */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className={`font-bold text-sm ${isDark ? 'text-white' : 'text-text'}`}>{t('pdfPipelineSteps')}</h3>
                  <p className={`text-xs ${isDark ? 'text-text' : 'text-text'}`}>
                    {t('hubPipelinesSubtitle')}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {pipelines.map(pipe => (
                  <div
                    key={pipe.id}
                    className={`p-4 rounded-2xl border ${
                      isDark ? 'bg-canvas border-border' : 'bg-white border-border shadow-sm'
                    } flex flex-col justify-between space-y-4 transition-all`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h4 className={`font-bold text-sm ${isDark ? 'text-white' : 'text-text'}`}>{pipe.name}</h4>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                            pipe.trigger === 'editor'
                              ? 'bg-primary/10 text-primary-text border border-border/20'
                              : pipe.trigger === 'folder'
                              ? 'bg-warning/10 text-warning border border-warning/20'
                              : 'bg-surface text-text-muted'
                          }`}
                        >
                          {pipe.trigger === 'editor'
                            ? t('pdfPipelineTriggerEditor')
                            : pipe.trigger === 'folder'
                            ? t('pdfPipelineTriggerFolder')
                            : t('pdfPipelineTriggerManual')}
                        </span>
                      </div>
                      <p className={`text-xs ${isDark ? 'text-text' : 'text-text'} mt-1 line-clamp-2`}>{pipe.description || '—'}</p>

                      {/* Steps sequence */}
                      <div className="mt-3 space-y-1.5">
                        <span className="text-[10px] font-semibold text-text block">
                          {pipe.steps.length} {t('pdfPipelineStepsCount')}:
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {pipe.steps.map((st, i) => (
                            <span
                              key={st.id || i}
                              className={`px-2 py-0.5 rounded-md ${
                                isDark ? 'bg-canvas border-border text-text' : 'bg-canvas border-border text-text'
                              } border text-[10px] flex items-center gap-1`}
                            >
                              <span className="text-primary-text font-bold">{i + 1}.</span>
                              {st.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-border pt-3">
                      <span className="text-[10px] text-text">
                        {pipe.active ? `● ${t('pdfPipelineActive')}` : `○ ${t('pdfPipelinePaused')}`}
                      </span>
                      <div className="flex items-center gap-1">
                        <Button variant="secondary" size="sm"
                          type="button"
                          title={t('stirlingExportAutomateJson')}
                          onClick={async () => {
                            const res = await window.electronAPI?.pdfEditor?.exportPipelineAutomate?.(pipe);
                            if (res?.ok === true) {
                              const blob = new Blob([res.data], { type: 'application/json' });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `${pipe.name.toLowerCase().replace(/\s+/g, '-')}.automate.json`;
                              a.click();
                              URL.revokeObjectURL(url);
                            }
                          }}
                          className={`p-1.5 rounded-lg border ${
                            isDark ? 'border-border hover:bg-canvas text-text' : 'border-border hover:bg-canvas text-text'
                          } text-xs transition-all cursor-pointer`}
                        >
                          <Download size={12} />
                        </Button>
                        <Button variant="secondary" size="sm"
                          type="button"
                          title={t('hubPipelineEdit')}
                          onClick={() => {
                            setEditingPipeline(pipe);
                            setPipelineName(pipe.name);
                            setPipelineDesc(pipe.description || '');
                            setPipelineTrigger(pipe.trigger);
                            setPipelineSteps(pipe.steps || []);
                            setIsCreatingPipeline(true);
                          }}
                          className={`p-1.5 rounded-lg border ${
                            isDark ? 'border-border hover:bg-canvas text-text' : 'border-border hover:bg-canvas text-text'
                          } text-xs transition-all cursor-pointer`}
                        >
                          <Pencil size={12} />
                        </Button>
                        <Button variant="secondary" size="sm"
                          type="button"
                          title={t('delete')}
                          onClick={() => void handleDeletePipeline(pipe.id)}
                          className="p-1.5 rounded-lg border border-danger/30 hover:bg-danger/10 text-danger text-xs transition-all cursor-pointer"
                        >
                          <Trash2 size={12} />
                        </Button>
                        <Button variant="secondary" size="sm"
                          type="button"
                          onClick={() => {
                            setSelectedTool({
                              id: `pipe-${pipe.id}`,
                              category: 'advanced-processor',
                              nameKey: 'hubToolPipelineProcessor',
                              descKey: 'hubToolPipelineProcessorDesc',
                              custom: { name: pipe.name, desc: pipe.description || '' },
                              endpoint: '/api/v1/pipeline/handleData',
                              icon: Cpu,
                              colorScheme: 'orange',
                            });
                          }}
                          className="px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary-text dark:text-primary-text text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer"
                        >
                          <Play size={12} />
                          <span>{t('pdfPipelineRun')}</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Collapsible POLICIES Accordion */}
            <section className={`p-5 rounded-2xl border ${
              isDark ? 'bg-canvas border-border' : 'bg-white border-border shadow-sm'
            } space-y-4`}>
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="size-5 text-primary-text dark:text-primary-text" />
                  <h3 className={`font-bold text-sm ${isDark ? 'text-white' : 'text-text'}`}>{t('pdfPoliciesTitle')}</h3>
                </div>
                <span className="text-[11px] text-text">
                  {t('pdfPoliciesEnforced')}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* 1. Ingestion */}
                <div className={`p-3.5 rounded-xl border ${
                  isDark ? 'bg-canvas border-border' : 'bg-canvas border-border'
                } space-y-2`}>
                  <h4 className={`font-bold text-xs ${isDark ? 'text-white' : 'text-text'} flex items-center gap-1.5`}>
                    <FolderInput size={14} className="text-primary-text" />
                    {t('pdfPolicyIngestion')}
                  </h4>
                  <ul className={`text-[11px] ${isDark ? 'text-text' : 'text-text'} space-y-1`}>
                    <li>✓ {t('pdfPolicyIngestionRule1')}</li>
                    <li>✓ {t('pdfPolicyIngestionRule2')}</li>
                    <li>✓ {t('pdfPolicyIngestionRule3')}</li>
                  </ul>
                </div>

                {/* 2. Security */}
                <div className={`p-3.5 rounded-xl border ${
                  isDark ? 'bg-canvas border-border' : 'bg-canvas border-border'
                } space-y-2`}>
                  <h4 className={`font-bold text-xs ${isDark ? 'text-white' : 'text-text'} flex items-center gap-1.5`}>
                    <Shield size={14} className="text-danger" />
                    {t('pdfPolicySecurity')}
                  </h4>
                  <ul className={`text-[11px] ${isDark ? 'text-text' : 'text-text'} space-y-1`}>
                    <li>✓ {t('pdfPolicySecurityRule1')}</li>
                    <li>✓ {t('pdfPolicySecurityRule2')}</li>
                    <li>✓ {t('pdfPolicySecurityRule3')}</li>
                  </ul>
                </div>

                {/* 3. Compliance */}
                <div className={`p-3.5 rounded-xl border ${
                  isDark ? 'bg-canvas border-border' : 'bg-canvas border-border'
                } space-y-2`}>
                  <h4 className={`font-bold text-xs ${isDark ? 'text-white' : 'text-text'} flex items-center gap-1.5`}>
                    <FileArchive size={14} className="text-primary-text" />
                    {t('pdfPolicyCompliance')}
                  </h4>
                  <ul className={`text-[11px] ${isDark ? 'text-text' : 'text-text'} space-y-1`}>
                    <li>✓ {t('pdfPolicyComplianceRule2')}</li>
                    <li>✓ {t('pdfPolicyComplianceRule3')}</li>
                  </ul>
                </div>

                {/* 4. Routing */}
                <div className={`p-3.5 rounded-xl border ${
                  isDark ? 'bg-canvas border-border' : 'bg-canvas border-border'
                } space-y-2`}>
                  <h4 className={`font-bold text-xs ${isDark ? 'text-white' : 'text-text'} flex items-center gap-1.5`}>
                    <FolderOutput size={14} className="text-warning" />
                    {t('pdfPolicyRouting')}
                  </h4>
                  <ul className={`text-[11px] ${isDark ? 'text-text' : 'text-text'} space-y-1`}>
                    <li>✓ {t('pdfPolicyRoutingRule1')}</li>
                    <li>✓ {t('pdfPolicyRoutingRule2')}</li>
                    <li>✓ {t('pdfPolicyRoutingRule3')}</li>
                  </ul>
                </div>

                {/* 5. Retention */}
                <div className={`p-3.5 rounded-xl border ${
                  isDark ? 'bg-canvas border-border' : 'bg-canvas border-border'
                } space-y-2`}>
                  <h4 className={`font-bold text-xs ${isDark ? 'text-white' : 'text-text'} flex items-center gap-1.5`}>
                    <BookmarkCheck size={14} className="text-primary-text" />
                    {t('pdfPolicyRetention')}
                  </h4>
                  <ul className={`text-[11px] ${isDark ? 'text-text' : 'text-text'} space-y-1`}>
                    <li>✓ {t('pdfPolicyRetentionRule1')}</li>
                    <li>✓ {t('pdfPolicyRetentionRule2')}</li>
                    <li>✓ {t('pdfPolicyRetentionRule3')}</li>
                  </ul>
                </div>
              </div>
            </section>
          </div>
        ) : (
          /* ============================================================ */
          /* 6-COLUMN DIRECTORY & CARD GRID VIEW                         */
          /* ============================================================ */
          <div className="space-y-6">
            {/* Quick Launch Row: New & Recently Updated */}
            {!searchQuery && !favoritesOnly && (
              <section className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-text' : 'text-text'}`}>
                    {t('pdfToolsRecentTitle')}
                  </h3>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                  {QUICK_LAUNCH_TOOLS.map(id => {
                    const tool = STIRLING_TOOLS.find(t => t.id === id);
                    if (!tool) return null;
                    const Icon = tool.icon;
                    return (
                      <div
                        key={tool.id}
                        role="button"
                        tabIndex={0}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleToolClick(tool);
                          }
                        }}
                        onClick={() => handleToolClick(tool)}
                        className={`group relative p-3.5 rounded-2xl border ${
                          isDark
                            ? 'bg-canvas border-border hover:border-border/50 hover:bg-canvas'
                            : 'bg-white border-border hover:border-border hover:bg-primary/20 shadow-xs'
                        } text-start transition-all shadow-sm flex flex-col justify-between min-h-[110px] cursor-pointer`}
                      >
                        <div className="flex items-start justify-between w-full">
                          <div
                            className={`size-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 ${
                              tool.colorScheme === 'rose'
                                ? 'bg-danger/10 text-danger'
                                : tool.colorScheme === 'blue'
                                ? 'bg-primary/10 text-primary-text'
                                : tool.colorScheme === 'orange'
                                ? 'bg-warning/10 text-warning'
                                : 'bg-primary/10 text-primary-text'
                            }`}
                          >
                            <Icon size={20} />
                          </div>
                          {tool.isNew && (
                            <span className="px-1.5 py-0.5 rounded-full bg-primary/20 text-primary-text dark:text-primary-text text-[9px] font-black uppercase tracking-wider">
                              NEW
                            </span>
                          )}
                        </div>
                        <div className="mt-2">
                          <h4 className={`font-bold text-xs ${isDark ? 'text-white' : 'text-text'} group-hover:text-primary-text transition-colors line-clamp-1`}>
                            {toolName(tool, lang)}
                          </h4>
                          <p className={`text-[10px] ${isDark ? 'text-text' : 'text-text'} mt-0.5 line-clamp-1`}>
                            {toolDesc(tool, lang)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* View Mode: 6-Column Directory vs Flat Grid */}
            {viewMode === 'columns' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 items-start">
                {/* COLUMN 1: Organize */}
                <div className={`p-3 rounded-2xl border ${isDark ? 'bg-canvas border-border' : 'bg-canvas/70 border-border'} space-y-3`}>
                  <div className="flex items-center gap-2 pb-2 border-b-2 border-border/30">
                    <span className="size-2 rounded-full bg-primary" />
                    <h3 className="font-bold text-xs uppercase tracking-wider text-primary-text dark:text-primary-text">
                      {t('pdfToolsColOrganize')} ({categorized['organize'].length})
                    </h3>
                  </div>
                  <div className="space-y-2">
                    {categorized['organize'].map(tool => (
                      <ToolCard
                        key={tool.id}
                        tool={tool}
                        isDark={isDark}
                        isFavorite={favorites.includes(tool.id)}
                        onFavorite={e => toggleFavorite(tool.id, e)}
                        onClick={() => handleToolClick(tool)}
                        lang={lang}
                      />
                    ))}
                  </div>
                </div>

                {/* COLUMN 2: Convert to PDF */}
                <div className={`p-3 rounded-2xl border ${isDark ? 'bg-canvas border-border' : 'bg-canvas/70 border-border'} space-y-3`}>
                  <div className="flex items-center gap-2 pb-2 border-b-2 border-border/30">
                    <span className="size-2 rounded-full bg-primary" />
                    <h3 className="font-bold text-xs uppercase tracking-wider text-primary-text dark:text-primary-text">
                      {t('pdfToolsColConvertToPdf')} ({categorized['convert-to-pdf'].length})
                    </h3>
                  </div>
                  <div className="space-y-2">
                    {categorized['convert-to-pdf'].map(tool => (
                      <ToolCard
                        key={tool.id}
                        tool={tool}
                        isDark={isDark}
                        isFavorite={favorites.includes(tool.id)}
                        onFavorite={e => toggleFavorite(tool.id, e)}
                        onClick={() => handleToolClick(tool)}
                        lang={lang}
                      />
                    ))}
                  </div>
                </div>

                {/* COLUMN 3: Convert from PDF */}
                <div className={`p-3 rounded-2xl border ${isDark ? 'bg-canvas border-border' : 'bg-canvas/70 border-border'} space-y-3`}>
                  <div className="flex items-center gap-2 pb-2 border-b-2 border-border/30">
                    <span className="size-2 rounded-full bg-primary" />
                    <h3 className="font-bold text-xs uppercase tracking-wider text-primary-text dark:text-primary-text">
                      {t('pdfToolsColConvertFromPdf')} ({categorized['convert-from-pdf'].length})
                    </h3>
                  </div>
                  <div className="space-y-2">
                    {categorized['convert-from-pdf'].map(tool => (
                      <ToolCard
                        key={tool.id}
                        tool={tool}
                        isDark={isDark}
                        isFavorite={favorites.includes(tool.id)}
                        onFavorite={e => toggleFavorite(tool.id, e)}
                        onClick={() => handleToolClick(tool)}
                        lang={lang}
                      />
                    ))}
                  </div>
                </div>

                {/* COLUMN 4: Sign & Security */}
                <div className={`p-3 rounded-2xl border ${isDark ? 'bg-canvas border-border' : 'bg-canvas/70 border-border'} space-y-3`}>
                  <div className="flex items-center gap-2 pb-2 border-b-2 border-danger/30">
                    <span className="size-2 rounded-full bg-danger" />
                    <h3 className="font-bold text-xs uppercase tracking-wider text-danger dark:text-danger">
                      {t('pdfToolsColSignSecurity')} ({categorized['sign-security'].length})
                    </h3>
                  </div>
                  <div className="space-y-2">
                    {categorized['sign-security'].map(tool => (
                      <ToolCard
                        key={tool.id}
                        tool={tool}
                        isDark={isDark}
                        isFavorite={favorites.includes(tool.id)}
                        onFavorite={e => toggleFavorite(tool.id, e)}
                        onClick={() => handleToolClick(tool)}
                        lang={lang}
                      />
                    ))}
                  </div>
                </div>

                {/* COLUMN 5: View & Edit */}
                <div className={`p-3 rounded-2xl border ${isDark ? 'bg-canvas border-border' : 'bg-canvas/70 border-border'} space-y-3`}>
                  <div className="flex items-center gap-2 pb-2 border-b-2 border-border/30">
                    <span className="size-2 rounded-full bg-primary" />
                    <h3 className="font-bold text-xs uppercase tracking-wider text-primary-text dark:text-primary-text">
                      {t('pdfToolsColViewEdit')} ({categorized['view-edit'].length})
                    </h3>
                  </div>
                  <div className="space-y-2">
                    {categorized['view-edit'].map(tool => (
                      <ToolCard
                        key={tool.id}
                        tool={tool}
                        isDark={isDark}
                        isFavorite={favorites.includes(tool.id)}
                        onFavorite={e => toggleFavorite(tool.id, e)}
                        onClick={() => handleToolClick(tool)}
                        lang={lang}
                      />
                    ))}
                  </div>
                </div>

                {/* COLUMN 6: Advanced & Processor */}
                <div className={`p-3 rounded-2xl border ${isDark ? 'bg-canvas border-border' : 'bg-canvas/70 border-border'} space-y-3`}>
                  <div className="flex items-center gap-2 pb-2 border-b-2 border-warning/30">
                    <span className="size-2 rounded-full bg-warning" />
                    <h3 className="font-bold text-xs uppercase tracking-wider text-warning dark:text-warning">
                      {t('pdfToolsColAdvancedProcessor')} ({categorized['advanced-processor'].length})
                    </h3>
                  </div>
                  <div className="space-y-2">
                    {categorized['advanced-processor'].map(tool => (
                      <ToolCard
                        key={tool.id}
                        tool={tool}
                        isDark={isDark}
                        isFavorite={favorites.includes(tool.id)}
                        onFavorite={e => toggleFavorite(tool.id, e)}
                        onClick={() => handleToolClick(tool)}
                        lang={lang}
                      />
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              /* Flat Grid View */
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5">
                {filteredTools.map(tool => {
                  const Icon = tool.icon;
                  return (
                    <div
                      key={tool.id}
                      role="button"
                      tabIndex={0}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleToolClick(tool);
                        }
                      }}
                      onClick={() => handleToolClick(tool)}
                      className={`group relative p-3.5 rounded-2xl border ${
                        isDark
                          ? 'bg-canvas border-border text-white hover:border-border/50 hover:bg-canvas'
                          : 'bg-white border-border text-text hover:border-border hover:bg-primary/20 shadow-xs'
                      } text-start transition-all shadow-sm flex flex-col justify-between min-h-[125px] cursor-pointer`}
                    >
                      <div className="flex items-start justify-between w-full">
                        <div
                          className={`size-9 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 ${
                            tool.colorScheme === 'rose'
                              ? 'bg-danger/10 text-danger'
                              : tool.colorScheme === 'blue'
                              ? 'bg-primary/10 text-primary-text'
                              : tool.colorScheme === 'orange'
                              ? 'bg-warning/10 text-warning'
                              : tool.colorScheme === 'cyan'
                              ? 'bg-primary/10 text-primary-text'
                              : tool.colorScheme === 'lime'
                              ? 'bg-primary/10 text-primary-text dark:text-primary-text'
                              : 'bg-primary/10 text-primary-text'
                          }`}
                        >
                          <Icon size={18} />
                        </div>
                        <Button variant="secondary" size="sm"
                          type="button"
                          onClick={e => toggleFavorite(tool.id, e)}
                          className={`p-1 text-text hover:text-warning transition-colors ${
                            favorites.includes(tool.id) ? 'text-warning' : ''
                          }`}
                        >
                          <Star size={13} fill={favorites.includes(tool.id) ? 'currentColor' : 'none'} />
                        </Button>
                      </div>
                      <div className="mt-2.5">
                        <h4 className={`font-bold text-xs ${isDark ? 'text-white' : 'text-text'} group-hover:text-primary-text transition-colors line-clamp-1`}>
                          {toolName(tool, lang)}
                        </h4>
                        <p className={`text-[10px] ${isDark ? 'text-text' : 'text-text'} mt-0.5 line-clamp-2`}>
                          {toolDesc(tool, lang)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* 3. STANDALONE TOOL EXECUTION DRAWER / MODAL */}
      {selectedTool && (
        <div data-stirling-tool-modal className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div
            dir={dir}
            className={`w-full max-w-xl max-h-[90vh] rounded-2xl border ${
              isDark ? 'bg-canvas border-border text-text' : 'bg-white border-border text-text shadow-2xl'
            } shadow-2xl flex flex-col overflow-hidden`}
          >
            {/* Modal Header */}
            <div className={`p-4 border-b ${isDark ? 'border-border bg-canvas' : 'border-border bg-canvas'} flex items-center justify-between`}>
              <div className="flex items-center gap-2.5">
                <div
                  className={`size-8 rounded-lg flex items-center justify-center ${
                    selectedTool.colorScheme === 'rose'
                      ? 'bg-danger/10 text-danger'
                      : selectedTool.colorScheme === 'blue'
                      ? 'bg-primary/10 text-primary-text'
                      : selectedTool.colorScheme === 'orange'
                      ? 'bg-warning/10 text-warning'
                      : selectedTool.colorScheme === 'cyan'
                      ? 'bg-primary/10 text-primary-text'
                      : selectedTool.colorScheme === 'lime'
                      ? 'bg-primary/10 text-primary-text dark:text-primary-text'
                      : 'bg-primary/10 text-primary-text'
                  }`}
                >
                  {React.createElement(selectedTool.icon, { size: 16 })}
                </div>
                <div>
                  <h3 className={`font-bold text-sm ${isDark ? 'text-white' : 'text-text'}`}>
                    {toolName(selectedTool, lang)}
                  </h3>
                  <p className={`text-[11px] ${isDark ? 'text-text' : 'text-text'}`}>
                    {toolDesc(selectedTool, lang)}
                  </p>
                </div>
              </div>
              <Button variant="secondary" size="sm"
                type="button"
                aria-label={t('close')}
                onClick={() => setSelectedTool(null)}
                className={`p-1.5 rounded-lg text-text ${isDark ? 'hover:bg-canvas hover:text-white' : 'hover:bg-canvas hover:text-text'} cursor-pointer`}
              >
                <X size={16} />
              </Button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {/* File Selection Dropzone */}
              <div className="space-y-3">
                <label className={`block text-xs font-bold ${isDark ? 'text-white' : 'text-text'}`}>
                  {t('hubSelectTarget')}
                </label>

                {/* Option A: Select from Library */}
                <div className="space-y-1.5">
                  <span className="text-[11px] text-text block">{t('pdfSelectFromLibrary')}</span>
                  <select
                    value={selectedBookId}
                    onChange={e => {
                      setSelectedBookId(e.target.value);
                      setLocalFilePath('');
                    }}
                    className={`w-full p-2 rounded-xl border outline-none text-xs ${
                      isDark ? 'bg-canvas border-border text-white' : 'bg-canvas border-border text-text'
                    }`}
                  >
                    <option value="">{t('hubSelectBook')}</option>
                    {books.filter(b => b.filePath).map(book => (
                      <option key={book.id} value={book.id}>
                        {book.title} ({book.author || '—'})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Option B: Local File Dropzone */}
                <div className="space-y-1.5">
                  <span className="text-[11px] text-text block">{t('hubChooseLocalFile')}</span>
                  <div
                    onDragOver={e => e.preventDefault()}
                    onDrop={async e => {
                      e.preventDefault();
                      // The Hub renders inside the library, whose own drop handler would import this file.
                      e.stopPropagation();
                      const file = e.dataTransfer.files[0];
                      if (file) {
                        setLocalFilePath(await resolveDroppedFilePath(file));
                        setSelectedBookId('');
                      }
                    }}
                    onClick={async () => {
                      try {
                        const chosen = await window.electronAPI?.pdfEditor?.chooseToolFiles?.(TOOL_INPUT_TYPES[selectedTool.id] ?? ['pdf'], false);
                        if (chosen?.ok === true && chosen.data[0]) {
                          setLocalFilePath(chosen.data[0]);
                          setSelectedBookId('');
                        }
                      } catch {
                        /* ignore */
                      }
                    }}
                    className={`border-2 border-dashed ${
                      isDark ? 'border-border bg-canvas/50 hover:border-border/50' : 'border-border bg-canvas hover:border-border'
                    } rounded-2xl p-4 text-center cursor-pointer transition-all`}
                  >
                    <Upload className="size-6 text-text mx-auto mb-2" />
                    <p className={`text-xs font-semibold ${isDark ? 'text-white' : 'text-text'}`}>
                      {localFilePath ? localFilePath.split(/[/\\]/).pop() : t('pdfDropFilesPrompt')}
                    </p>
                    {localFilePath && (
                      <p className="text-[10px] text-primary-text font-mono mt-1 break-all">{localFilePath}</p>
                    )}
                  </div>
                </div>
              </div>

              <StirlingToolOptionsForm toolId={selectedTool.id} values={toolValues} onChange={setToolValues} isDark={isDark} />

              {/* Execution Feedback */}
              {isExecuting && (
                <div className="p-4 rounded-xl bg-primary/10 border border-border/20 text-center space-y-2">
                  <RefreshCw className="size-6 text-primary-text animate-spin mx-auto" />
                  <p className="text-xs font-bold text-primary-text dark:text-primary-text">{t('pdfExecutingTool')}</p>
                </div>
              )}

              {executionResult && (
                <div
                  className={`p-4 rounded-xl border text-xs space-y-2.5 ${
                    executionResult.success
                      ? 'bg-primary/10 border-border/30 text-primary-text dark:text-primary-text'
                      : 'bg-danger/10 border-danger/30 text-danger dark:text-danger'
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold">
                    {executionResult.success ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                    <span>
                      {executionResult.success ? t('pdfExecutionSuccess') : executionResult.error}
                    </span>
                  </div>

                  {executionResult.success && executionResult.outputPath && (
                    <div className="space-y-2 pt-2 border-t border-border/20">
                      <p className={`text-[11px] font-mono break-all ${isDark ? 'text-white/90' : 'text-text'}`}>
                        {executionResult.outputPath}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {onOpenInWorkstation && (
                          <Button variant="secondary" size="sm"
                            type="button"
                            onClick={() => {
                              onOpenInWorkstation(executionResult.outputPath!);
                              setSelectedTool(null);
                              onClose();
                            }}
                            className="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary text-white font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                          >
                            <ExternalLink size={13} />
                            <span>{t('pdfOpenInWorkstation')}</span>
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className={`p-4 border-t ${isDark ? 'border-border bg-canvas' : 'border-border bg-canvas'} flex items-center justify-end gap-2`}>
              {(missingOption || invalidOption) && <span role="status" className="me-auto text-[11px] text-warning dark:text-warning">{missingOption ? t('stirlingOptRequired', { name: t(missingOption.label) }) : t(invalidOption!)}</span>}
              <Button variant="secondary" size="sm"
                type="button"
                onClick={() => setSelectedTool(null)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold ${isDark ? 'text-text hover:text-white' : 'text-text hover:text-text'} cursor-pointer`}
              >
                {t('cancel')}
              </Button>
              <Button variant="primary" size="sm"
                type="button"
                disabled={isExecuting || Boolean(missingOption) || Boolean(invalidOption) || (!selectedBookId && !localFilePath && !TOOLS_WITHOUT_INPUT_FILE.has(selectedTool.id))}
                onClick={() => void handleExecuteTool()}
                className="px-5 py-2 rounded-xl bg-primary hover:bg-primary disabled:opacity-40 text-white text-xs font-bold shadow-lg shadow-primary/20 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Play size={14} />
                <span>{t('pdfExecuteTool')}</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Pipeline Builder Modal */}
      {isCreatingPipeline && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSavePipeline}
            dir={dir}
            className={`w-full max-w-2xl max-h-[calc(100dvh-2rem)] rounded-2xl border ${
              isDark ? 'bg-canvas border-border text-text' : 'bg-white border-border text-text shadow-2xl'
            } shadow-2xl flex flex-col overflow-hidden`}
          >
            {/* Modal Header */}
            <div className={`p-4 border-b ${isDark ? 'border-border bg-canvas' : 'border-border bg-canvas'} flex items-center justify-between`}>
              <div className="flex items-center gap-2.5">
                <div className="size-9 rounded-xl bg-primary/10 text-primary-text flex items-center justify-center">
                  <Cpu size={18} />
                </div>
                <div>
                  <h3 className={`font-bold text-sm ${isDark ? 'text-white' : 'text-text'}`}>
                    {editingPipeline ? t('hubPipelineEditShort') : t('pdfPipelineNew')}
                  </h3>
                  <p className={`text-[11px] ${isDark ? 'text-text' : 'text-text'}`}>
                    {t('hubPipelineBuilderHint')}
                  </p>
                </div>
              </div>
              <Button variant="secondary" size="sm"
                type="button"
                onClick={() => {
                  setIsCreatingPipeline(false);
                  setEditingPipeline(null);
                }}
                className={`p-1.5 rounded-lg ${isDark ? 'text-text hover:text-white hover:bg-canvas' : 'text-text hover:text-text hover:bg-canvas'} cursor-pointer`}
              >
                <X size={16} />
              </Button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="min-h-0 p-3 sm:p-5 overflow-y-auto overscroll-contain space-y-4 text-xs">
              {/* 1-Click Suggested Presets */}
              <div className="space-y-1.5">
                <span className={`font-bold text-[11px] uppercase tracking-wider ${isDark ? 'text-text' : 'text-text'}`}>
                  {t('hubAutomationsTitle')}:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <Button variant="secondary" size="sm"
                    type="button"
                    onClick={() => handleApplySuggestedAutomation('scholarly')}
                    className={`p-2 rounded-xl border text-start transition-all cursor-pointer ${
                      isDark
                        ? 'border-border bg-canvas hover:border-border/50 hover:bg-canvas'
                        : 'border-border bg-canvas hover:border-border hover:bg-primary/20'
                    }`}
                  >
                    <span className="font-bold block text-primary-text text-[11px]">
                      {t('hubAutomationScholarlyShort')}
                    </span>
                    <span className={`text-[10px] ${isDark ? 'text-text' : 'text-text'} line-clamp-1`}>
                      {t('hubAutomationScholarlyFlow')}
                    </span>
                  </Button>
                  <Button variant="secondary" size="sm"
                    type="button"
                    onClick={() => handleApplySuggestedAutomation('prepublish')}
                    className={`p-2 rounded-xl border text-start transition-all cursor-pointer ${
                      isDark
                        ? 'border-border bg-canvas hover:border-border/50 hover:bg-canvas'
                        : 'border-border bg-canvas hover:border-border hover:bg-primary/20'
                    }`}
                  >
                    <span className="font-bold block text-primary-text text-[11px]">
                      {t('hubAutomationPrepublishShort')}
                    </span>
                    <span className={`text-[10px] ${isDark ? 'text-text' : 'text-text'} line-clamp-1`}>
                      {t('hubAutomationPrepublishFlow')}
                    </span>
                  </Button>
                  <Button variant="secondary" size="sm"
                    type="button"
                    onClick={() => handleApplySuggestedAutomation('confidential')}
                    className={`p-2 rounded-xl border text-start transition-all cursor-pointer ${
                      isDark
                        ? 'border-border bg-canvas hover:border-border/50 hover:bg-canvas'
                        : 'border-border bg-canvas hover:border-border hover:bg-primary/20'
                    }`}
                  >
                    <span className="font-bold block text-danger text-[11px]">
                      {t('hubAutomationConfidentialShort')}
                    </span>
                    <span className={`text-[10px] ${isDark ? 'text-text' : 'text-text'} line-clamp-1`}>
                      {t('hubAutomationConfidentialFlow')}
                    </span>
                  </Button>
                </div>
              </div>

              {/* Basic Settings */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold block mb-1">{t('pdfPipelineName')} *</label>
                  <input
                    type="text"
                    required
                    value={pipelineName}
                    onChange={e => setPipelineName(e.target.value)}
                    placeholder={t('hubPipelineNamePlaceholder')}
                    className={`w-full p-2 rounded-lg border outline-none ${
                      isDark ? 'bg-canvas border-border text-white' : 'bg-canvas border-border text-text'
                    }`}
                  />
                </div>
                <div>
                  <label className="font-bold block mb-1">{t('pdfPipelineTrigger')}</label>
                  <select
                    value={pipelineTrigger}
                    onChange={e => setPipelineTrigger(e.target.value as typeof pipelineTrigger)}
                    className={`w-full p-2 rounded-lg border outline-none ${
                      isDark ? 'bg-canvas border-border text-white' : 'bg-canvas border-border text-text'
                    }`}
                  >
                    <option value="editor">{t('pdfPipelineTriggerEditor')}</option>
                    <option value="folder">{t('pdfPipelineTriggerFolder')}</option>
                    <option value="manual">{t('pdfPipelineTriggerManual')}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold block mb-1">{t('pdfPipelineDesc')}</label>
                <input
                  type="text"
                  value={pipelineDesc}
                  onChange={e => setPipelineDesc(e.target.value)}
                  placeholder={t('hubPipelineDescPlaceholder')}
                  className={`w-full p-2 rounded-lg border outline-none ${
                    isDark ? 'bg-canvas border-border text-white' : 'bg-canvas border-border text-text'
                  }`}
                />
              </div>

              {/* Steps Sequence Section */}
              <div className="space-y-2 pt-2 border-t border-border">
                <div className="flex items-center justify-between">
                  <span className={`font-bold text-xs uppercase tracking-wider ${isDark ? 'text-white' : 'text-text'}`}>
                    {t('pdfPipelineSteps')} ({pipelineSteps.length})
                  </span>
                </div>

                {pipelineSteps.length === 0 ? (
                  <div className={`p-4 rounded-xl border border-dashed text-center ${
                    isDark ? 'border-border text-text' : 'border-border text-text'
                  }`}>
                    <p className="text-xs font-semibold">{t('hubPipelineNoSteps')}</p>
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-[180px] overflow-y-auto">
                    {pipelineSteps.map((step, idx) => (
                      <div
                        key={step.id || idx}
                        className={`flex items-center justify-between p-2 rounded-xl border ${
                          isDark ? 'bg-canvas border-border' : 'bg-canvas border-border'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="size-5 rounded-full bg-primary/10 text-primary-text font-bold text-[10px] flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <div className="min-w-0">
                            <span className={`font-bold text-xs block truncate ${isDark ? 'text-white' : 'text-text'}`}>
                              {step.name}
                            </span>
                            <span className="text-[10px] font-mono text-text block truncate">
                              {step.operation}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <Button variant="secondary" size="sm"
                            type="button"
                            disabled={idx === 0}
                            onClick={() => handleMoveStep(idx, 'up')}
                            className="p-1 text-text hover:text-white disabled:opacity-20 cursor-pointer"
                            title={t('hubStepMoveUp')}
                          >
                            <ArrowUp size={12} />
                          </Button>
                          <Button variant="secondary" size="sm"
                            type="button"
                            disabled={idx === pipelineSteps.length - 1}
                            onClick={() => handleMoveStep(idx, 'down')}
                            className="p-1 text-text hover:text-white disabled:opacity-20 cursor-pointer"
                            title={t('hubStepMoveDown')}
                          >
                            <ArrowDown size={12} />
                          </Button>
                          <Button variant="secondary" size="sm"
                            type="button"
                            onClick={() => handleRemoveStep(idx)}
                            className="p-1 text-danger hover:text-danger cursor-pointer"
                            title={t('delete')}
                          >
                            <Trash2 size={12} />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add Step Selector & Button */}
                <div className="flex items-center gap-2 pt-2">
                  <select
                    value={stepToAdd}
                    onChange={e => setStepToAdd(e.target.value)}
                    className={`flex-1 p-2 rounded-lg border outline-none text-xs ${
                      isDark ? 'bg-canvas border-border text-white' : 'bg-canvas border-border text-text'
                    }`}
                  >
                    <optgroup label={t('hubFilterGatesGroup')}>
                      {AVAILABLE_PIPELINE_STEPS.filter(s => s.category === 'filter').map(s => (
                        <option key={s.operation} value={s.operation}>
                          {t(s.labelKey)}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label={t('hubProcessingToolsGroup')}>
                      {AVAILABLE_PIPELINE_STEPS.filter(s => s.category === 'tool').map(s => (
                        <option key={s.operation} value={s.operation}>
                          {t(s.labelKey)}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                  <Button variant="secondary" size="sm"
                    type="button"
                    onClick={handleAddStep}
                    className="px-3.5 py-2 rounded-lg bg-primary hover:bg-primary text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <Plus size={13} />
                    <span>{t('pdfPipelineAddStep')}</span>
                  </Button>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className={`p-4 border-t ${isDark ? 'border-border bg-canvas' : 'border-border bg-canvas'} flex items-center justify-end gap-2`}>
              <Button variant="secondary" size="sm"
                type="button"
                onClick={() => {
                  setIsCreatingPipeline(false);
                  setEditingPipeline(null);
                }}
                className={`px-4 py-2 rounded-xl text-xs font-semibold ${isDark ? 'text-text hover:text-white' : 'text-text hover:text-text'} cursor-pointer`}
              >
                {t('cancel')}
              </Button>
              <Button variant="secondary" size="sm"
                type="submit"
                disabled={!pipelineName.trim() || pipelineSteps.length === 0}
                className="px-5 py-2 rounded-xl bg-primary hover:bg-primary disabled:opacity-40 text-white text-xs font-bold shadow-lg shadow-primary/20 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 size={14} />
                <span>{t('pdfPipelineSave')}</span>
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function ToolCard({
  tool,
  isFavorite,
  onFavorite,
  onClick,
  lang,
  isDark,
}: {
  tool: StirlingToolDef;
  isFavorite: boolean;
  onFavorite: (e: React.MouseEvent) => void;
  onClick: () => void;
  lang: 'ar' | 'en';
  isDark: boolean;
}) {
  const Icon = tool.icon;
  return (
    <div
      onClick={onClick}
      className={`group relative p-2.5 rounded-xl border ${
        isDark
          ? 'bg-canvas hover:bg-canvas border-border text-text'
          : 'bg-white hover:bg-primary/40 border-border text-text shadow-xs'
      } cursor-pointer transition-all shadow-sm flex items-start gap-2.5`}
    >
      <div
        className={`size-8 rounded-lg shrink-0 flex items-center justify-center transition-transform group-hover:scale-105 ${
          tool.colorScheme === 'blue'
            ? 'bg-primary/10 text-primary-text'
            : tool.colorScheme === 'emerald'
            ? 'bg-primary/10 text-primary-text'
            : tool.colorScheme === 'cyan'
            ? 'bg-primary/10 text-primary-text'
            : tool.colorScheme === 'rose'
            ? 'bg-danger/10 text-danger'
            : tool.colorScheme === 'lime'
            ? 'bg-primary/10 text-primary-text dark:text-primary-text'
            : 'bg-warning/10 text-warning'
        }`}
      >
        <Icon size={16} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <h4 className={`font-bold text-xs ${isDark ? 'text-white' : 'text-text'} group-hover:text-primary-text transition-colors truncate`}>
            {toolName(tool, lang)}
          </h4>
          <Button variant="secondary" size="sm"
            type="button"
            onClick={onFavorite}
            className={`p-0.5 text-text hover:text-warning transition-colors ${
              isFavorite ? 'text-warning' : ''
            }`}
          >
            <Star size={12} fill={isFavorite ? 'currentColor' : 'none'} />
          </Button>
        </div>
        <p className={`text-[10px] ${isDark ? 'text-text' : 'text-text'} line-clamp-1 mt-0.5`}>
          {toolDesc(tool, lang)}
        </p>
      </div>
    </div>
  );
}
