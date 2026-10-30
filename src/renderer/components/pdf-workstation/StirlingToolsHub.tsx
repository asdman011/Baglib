'use client';
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
import { useWorkspace } from '../context/WorkspaceContext';
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
  nameKey: string;
  nameEn: string;
  nameAr: string;
  descEn: string;
  descAr: string;
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
    nameKey: 'toolScalePages',
    nameEn: 'Adjust page size/scale',
    nameAr: 'تعديل حجم وقياس الصفحة',
    descEn: 'Fit pages to A4, Letter, or apply custom scaling proportions',
    descAr: 'ملاءمة الصفحات لقياسات A4 أو Letter أو تطبيق نسبة تحجيم مخصصة',
    endpoint: '/api/v1/general/scale-pages',
    icon: Maximize2,
    colorScheme: 'blue',
  },
  {
    id: 'crop',
    category: 'organize',
    nameKey: 'toolCrop',
    nameEn: 'Crop PDF',
    nameAr: 'قص هوامش PDF',
    descEn: 'Trim document margins or select a custom bounding box area',
    descAr: 'قص هوامش المستند أو تحديد منطقة قص مخصصة بدقة',
    endpoint: '/api/v1/general/crop',
    icon: Scissors,
    colorScheme: 'blue',
  },
  {
    id: 'extract-pages',
    category: 'organize',
    nameKey: 'toolExtractPages',
    nameEn: 'Extract page(s)',
    nameAr: 'استخراج صفحات',
    descEn: 'Save specific selected pages as a brand new PDF document',
    descAr: 'استخراج وحفظ صفحات مختارة كمستند PDF جديد ومستقل',
    endpoint: '/api/v1/general/extract-pages',
    icon: FileText,
    colorScheme: 'blue',
  },
  {
    id: 'merge',
    category: 'organize',
    nameKey: 'toolMerge',
    nameEn: 'Merge',
    nameAr: 'دمج المستندات',
    descEn: 'Combine multiple PDF documents into a single sequential file',
    descAr: 'دمج عدة مستندات PDF في ملف متسلسل واحد',
    endpoint: '/api/v1/general/merge-pdfs',
    icon: Combine,
    isPopular: true,
    colorScheme: 'blue',
  },
  {
    id: 'multi-page-layout',
    category: 'organize',
    nameKey: 'toolMultiPageLayout',
    nameEn: 'Multi-Page Layout',
    nameAr: 'تخطيط صفحات متعددة (N-up)',
    descEn: 'Print 2, 4, or 8 pages onto a single sheet of paper',
    descAr: 'طباعة 2 أو 4 أو 8 صفحات على ورقة واحدة متقابلة',
    endpoint: '/api/v1/general/multi-page-layout',
    icon: LayoutGrid,
    colorScheme: 'blue',
  },
  {
    id: 'reorder',
    category: 'organize',
    nameKey: 'toolOrganise',
    nameEn: 'Organise',
    nameAr: 'تنظيم الصفحات',
    descEn: 'Reorganize page order visually or by custom sequence list',
    descAr: 'إعادة تنظيم تسلسل الصفحات بصرياً أو بنمط مخصص',
    endpoint: '/api/v1/general/rearrange-pages',
    icon: ArrowRightLeft,
    colorScheme: 'blue',
  },
  {
    id: 'multi-tool',
    category: 'organize',
    nameKey: 'toolMultiTool',
    nameEn: 'PDF Multi Tool',
    nameAr: 'أداة PDF المتعددة',
    descEn: 'Rotate, delete, reorder, and extract all in one visual workspace',
    descAr: 'تدوير، حذف، إعادة ترتيب، واستخراج الصفحات في واجهة بصرية واحدة',
    endpoint: '/api/v1/general/multi-tool',
    icon: Layers,
    isPopular: true,
    colorScheme: 'blue',
  },
  {
    id: 'pdf-to-single-page',
    category: 'organize',
    nameKey: 'toolSinglePage',
    nameEn: 'PDF to Single Large Page',
    nameAr: 'تحويل PDF إلى صفحة واحدة ممتدة',
    descEn: 'Merge all pages vertically into a continuous long single page',
    descAr: 'دمج جميع الصفحات رأسياً في صفحة واحدة ممتدة وطويلة للطباعة',
    endpoint: '/api/v1/general/pdf-to-single-page',
    icon: FileText,
    colorScheme: 'blue',
  },
  {
    id: 'remove-pages',
    category: 'organize',
    nameKey: 'toolRemove',
    nameEn: 'Remove',
    nameAr: 'حذف صفحات',
    descEn: 'Strip out unwanted or blank pages permanently',
    descAr: 'إزالة الصفحات غير المرغوبة نهائياً من المستند',
    endpoint: '/api/v1/general/remove-pages',
    icon: Trash2,
    colorScheme: 'blue',
  },
  {
    id: 'rotate',
    category: 'organize',
    nameKey: 'toolRotate',
    nameEn: 'Rotate',
    nameAr: 'تدوير الصفحات',
    descEn: 'Rotate selected pages or entire document by 90°, 180°, or 270°',
    descAr: 'تدوير صفحات محددة أو المستند بالكامل بزوايا 90° أو 180° أو 270°',
    endpoint: '/api/v1/general/rotate-pdf',
    icon: RotateCw,
    colorScheme: 'blue',
  },
  {
    id: 'split',
    category: 'organize',
    nameKey: 'toolSplit',
    nameEn: 'Split',
    nameAr: 'تقسيم الصفحات',
    descEn: 'Split document by page ranges, odd/even, or into single pages',
    descAr: 'تقسيم المستند حسب نطاق الصفحات، فردي/زوجي، أو صفحات مفردة',
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
    nameKey: 'toolConvertFileToPdf',
    nameEn: 'Convert file to PDF',
    nameAr: 'تحويل ملف إلى PDF',
    descEn: 'Convert Office docs (DOCX, XLSX, PPTX), TXT, and images into PDF',
    descAr: 'تحويل مستندات أوفيس (وورد، إكسل، باوربوينت) والنصوص والصور إلى PDF',
    endpoint: '/api/v1/convert/file/pdf',
    icon: FileSpreadsheet,
    isPopular: true,
    colorScheme: 'emerald',
  },
  {
    id: 'html-to-pdf',
    category: 'convert-to-pdf',
    nameKey: 'toolHtmlToPdf',
    nameEn: 'HTML to PDF',
    nameAr: 'تحويل HTML إلى PDF',
    descEn: 'Render styled HTML web pages or ZIP archives into print-ready PDF',
    descAr: 'تحويل صفحات HTML المنسقة أو أرشيفات ZIP إلى مستند PDF عالي الجودة',
    endpoint: '/api/v1/convert/html/pdf',
    icon: FileCode,
    colorScheme: 'emerald',
  },
  {
    id: 'img-to-pdf',
    category: 'convert-to-pdf',
    nameKey: 'toolImageToPdf',
    nameEn: 'Image to PDF',
    nameAr: 'تحويل الصور إلى PDF',
    descEn: 'Convert JPG, PNG, WebP, TIFF, and BMP images into PDF pages',
    descAr: 'تحويل صور JPG و PNG و WebP و TIFF و BMP إلى صفحات مستند PDF',
    endpoint: '/api/v1/convert/img/pdf',
    icon: ImageIcon,
    isPopular: true,
    colorScheme: 'emerald',
  },
  {
    id: 'markdown-to-pdf',
    category: 'convert-to-pdf',
    nameKey: 'toolMarkdownToPdf',
    nameEn: 'Markdown to PDF',
    nameAr: 'تحويل ماركداون إلى PDF',
    descEn: 'Convert formatted Markdown documents with GitHub-flavored styling',
    descAr: 'تحويل مستندات ماركداون المنسقة بنمط GitHub إلى ملفات PDF جاهزة',
    endpoint: '/api/v1/convert/markdown/pdf',
    icon: FileText,
    colorScheme: 'emerald',
  },
  {
    id: 'url-to-pdf',
    category: 'convert-to-pdf',
    nameKey: 'toolUrlToPdf',
    nameEn: 'URL/Website To PDF',
    nameAr: 'تحويل رابط موقع إلى PDF',
    descEn: 'Fetch any live webpage by URL and capture as complete PDF',
    descAr: 'جلب أي صفحة ويب مباشرة من خلال الرابط وتحويلها إلى مستند PDF كامل',
    endpoint: '/api/v1/convert/url/pdf',
    icon: Globe,
    colorScheme: 'emerald',
  },

  // =========================================================================
  // 3. Convert from PDF (Cyan/Teal Icons) - 9 tools
  // =========================================================================
  {
    id: 'pdf-to-csv',
    category: 'convert-from-pdf',
    nameKey: 'toolPdfToCsv',
    nameEn: 'PDF to CSV',
    nameAr: 'تحويل PDF إلى CSV / جداول',
    descEn: 'Extract structured tables from PDF into CSV or Excel spreadsheet',
    descAr: 'استخراج الجداول والبيانات المنظمة من مستندات PDF إلى ملفات CSV وإكسل',
    endpoint: '/api/v1/convert/pdf/csv',
    icon: FileSpreadsheet,
    colorScheme: 'cyan',
  },
  {
    id: 'pdf-to-html',
    category: 'convert-from-pdf',
    nameKey: 'toolPdfToHtml',
    nameEn: 'PDF to HTML',
    nameAr: 'تحويل PDF إلى HTML',
    descEn: 'Convert PDF document into responsive HTML with embedded images',
    descAr: 'تحويل مستندات PDF إلى صفحات ويب تفاعلية HTML مع كافة الأصول والصور',
    endpoint: '/api/v1/convert/pdf/html',
    icon: FileCode,
    colorScheme: 'cyan',
  },
  {
    id: 'pdf-to-img',
    category: 'convert-from-pdf',
    nameKey: 'toolPdfToImage',
    nameEn: 'PDF to Image',
    nameAr: 'تحويل PDF إلى صور',
    descEn: 'Export PDF pages as high-resolution PNG, JPG, or TIFF image files',
    descAr: 'تصدير صفحات PDF كصور منفصلة عالية الدقة بصيغ PNG أو JPG أو TIFF',
    endpoint: '/api/v1/convert/pdf/img',
    icon: ImageIcon,
    isPopular: true,
    colorScheme: 'cyan',
  },
  {
    id: 'pdf-to-markdown',
    category: 'convert-from-pdf',
    nameKey: 'toolPdfToMarkdown',
    nameEn: 'PDF to Markdown',
    nameAr: 'تحويل PDF إلى ماركداون',
    descEn: 'Convert headings, paragraphs, and lists into clean Markdown syntax',
    descAr: 'استخراج العناوين والفقرات والجداول من PDF إلى صيغة Markdown النظيفة',
    endpoint: '/api/v1/convert/pdf/markdown',
    icon: FileText,
    colorScheme: 'cyan',
  },
  {
    id: 'pdf-to-pdfa',
    category: 'convert-from-pdf',
    nameKey: 'toolPdfToPdfA',
    nameEn: 'PDF to PDF/A',
    nameAr: 'تحويل PDF إلى صيغة الأرشفة PDF/A',
    descEn: 'Convert standard PDF to ISO-compliant PDF/A-1b, 2b, or 3b archival',
    descAr: 'تحويل مستند PDF إلى المعيار الدولي للأرشفة طويلة الأجل ISO PDF/A',
    endpoint: '/api/v1/convert/pdf/pdfa',
    icon: FileArchive,
    colorScheme: 'cyan',
  },
  {
    id: 'pdf-to-presentation',
    category: 'convert-from-pdf',
    nameKey: 'toolPdfToPresentation',
    nameEn: 'PDF to Presentation',
    nameAr: 'تحويل PDF إلى عرض تقديمي (PPTX)',
    descEn: 'Convert PDF slides into editable Microsoft PowerPoint PPTX deck',
    descAr: 'تحويل شرائح وصفحات PDF إلى عرض بوربوينت PPTX قابل للتعديل بالكامل',
    endpoint: '/api/v1/convert/pdf/presentation',
    icon: FileText,
    colorScheme: 'cyan',
  },
  {
    id: 'pdf-to-rtf',
    category: 'convert-from-pdf',
    nameKey: 'toolPdfToRtf',
    nameEn: 'PDF to RTF (Text)',
    nameAr: 'تحويل PDF إلى RTF (نص منسق)',
    descEn: 'Export formatted text into Rich Text Format (RTF) or plain text',
    descAr: 'تصدير النصوص المنسقة إلى صيغة Rich Text Format (RTF) أو نصوص عادية',
    endpoint: '/api/v1/convert/pdf/rtf',
    icon: FileText,
    colorScheme: 'cyan',
  },
  {
    id: 'pdf-to-word',
    category: 'convert-from-pdf',
    nameKey: 'toolPdfToWord',
    nameEn: 'PDF to Word',
    nameAr: 'تحويل PDF إلى وورد (DOCX)',
    descEn: 'Convert PDF into fully editable Microsoft Word DOCX document',
    descAr: 'تحويل مستندات PDF إلى ملفات مايكروسوفت وورد DOCX قابلة للتحرير',
    endpoint: '/api/v1/convert/pdf/word',
    icon: FileText,
    isPopular: true,
    colorScheme: 'cyan',
  },
  {
    id: 'pdf-to-xml',
    category: 'convert-from-pdf',
    nameKey: 'toolPdfToXml',
    nameEn: 'PDF to XML',
    nameAr: 'تحويل PDF إلى XML',
    descEn: 'Extract vector elements, text layout, and structural tree into XML',
    descAr: 'استخراج الأشكال المتجهية وشجرة العناصر وهيكل المستند إلى ملف XML',
    endpoint: '/api/v1/convert/pdf/xml',
    icon: FileCode,
    colorScheme: 'cyan',
  },

  // =========================================================================
  // 4. Sign & Security (Rose/Pink Icons) - 12 tools
  // =========================================================================
  {
    id: 'add-password',
    category: 'sign-security',
    nameKey: 'toolAddPassword',
    nameEn: 'Add Password',
    nameAr: 'إضافة كلمة مرور وتشفير',
    descEn: 'Encrypt PDF with AES-256 and restrict unauthorized opening',
    descAr: 'تشفير مستندات PDF بمعيار التشفير المتقدم AES-256 وحمايتها بكلمة سر',
    endpoint: '/api/v1/security/add-password',
    icon: Lock,
    colorScheme: 'rose',
  },
  {
    id: 'add-stamp',
    category: 'sign-security',
    nameKey: 'toolAddStamp',
    nameEn: 'Add Stamp to PDF',
    nameAr: 'إضافة ختم إلى PDF',
    descEn: 'Overlay an official approved digital stamp, seal, or approval badge',
    descAr: 'إضافة أختام وشارات الاعتماد الرقمية الرسمية على صفحات المستند',
    endpoint: '/api/v1/misc/add-stamp',
    icon: Stamp,
    colorScheme: 'rose',
  },
  {
    id: 'watermark',
    category: 'sign-security',
    nameKey: 'toolAddWatermark',
    nameEn: 'Add Watermark',
    nameAr: 'إضافة علامة مائية',
    descEn: 'Stamp custom text or diagonal watermark across pages with opacity control',
    descAr: 'إضافة علامة مائية نصية مائلة عبر الصفحات مع التحكم الكامل بالشفافية',
    endpoint: '/api/v1/misc/watermark',
    icon: Stamp,
    colorScheme: 'rose',
  },
  {
    id: 'auto-redact',
    category: 'sign-security',
    nameKey: 'toolAutoRedact',
    nameEn: 'Auto Redact',
    nameAr: 'حجب آلي بالأنماط والبيانات الشخصية',
    descEn: 'Automatically black out names, emails, phone numbers, and regex patterns',
    descAr: 'حجب الأسماء، البريد الإلكتروني، الهواتف، والبيانات الحساسة آلياً',
    endpoint: '/api/v1/security/auto-redact',
    icon: Eraser,
    colorScheme: 'rose',
  },
  {
    id: 'change-permissions',
    category: 'sign-security',
    nameKey: 'toolChangePermissions',
    nameEn: 'Change Permissions',
    nameAr: 'تغيير صلاحيات المستند',
    descEn: 'Control printing, text copying, annotation, and form modification rights',
    descAr: 'التحكم بصلاحيات الطباعة، ونسخ النصوص، والتعليق، وتعديل النماذج',
    endpoint: '/api/v1/security/change-permissions',
    icon: Key,
    colorScheme: 'rose',
  },
  {
    id: 'manual-redact',
    category: 'sign-security',
    nameKey: 'toolManualRedaction',
    nameEn: 'Manual Redaction',
    nameAr: 'حجب بصري يدوي',
    descEn: 'Draw exact pixel redaction rectangles to sanitize sensitive information',
    descAr: 'رسم مستطيلات حجب بصرية دقيقة لإخفاء المعلومات الحساسة نهائياً',
    endpoint: '/api/v1/security/manual-redaction',
    icon: Eraser,
    isNew: true,
    isPopular: true,
    colorScheme: 'rose',
  },
  {
    id: 'remove-cert-sign',
    category: 'sign-security',
    nameKey: 'toolRemoveCertSign',
    nameEn: 'Remove Certificate Sign',
    nameAr: 'إزالة التوقيع الرقمي بالشهادة',
    descEn: 'Strip digital certificate signatures to unlock document editing',
    descAr: 'إزالة تواقيع الشهادات الرقمية لإعادة فتح المستند للتحرير والتعديل',
    endpoint: '/api/v1/security/remove-cert-sign',
    icon: Shield,
    colorScheme: 'rose',
  },
  {
    id: 'remove-password',
    category: 'sign-security',
    nameKey: 'toolRemovePassword',
    nameEn: 'Remove Password',
    nameAr: 'إزالة كلمة المرور وفك التشفير',
    descEn: 'Decrypt password-protected PDF files permanently',
    descAr: 'فك تشفير ملفات PDF المحمية بكلمة مرور نهائياً وإلغاء قيود الحماية',
    endpoint: '/api/v1/security/remove-password',
    icon: Unlock,
    colorScheme: 'rose',
  },
  {
    id: 'sanitize-pdf',
    category: 'sign-security',
    nameKey: 'toolSanitize',
    nameEn: 'Sanitize',
    nameAr: 'تعقيم وتطهير المستند',
    descEn: 'Remove JavaScript, embedded scripts, actions, and metadata vectors',
    descAr: 'إزالة رموز جافاسكريبت، والبرمجيات المضمنة، والإجراءات الخفية لضمان الأمان',
    endpoint: '/api/v1/security/sanitize-pdf',
    icon: ShieldCheck,
    colorScheme: 'rose',
  },
  {
    id: 'sign',
    category: 'sign-security',
    nameKey: 'toolSign',
    nameEn: 'Sign',
    nameAr: 'توقيع يدوي (رسم)',
    descEn: 'Draw handwritten signature or paste signature stamp onto pages',
    descAr: 'رسم توقيع يدوي بالقلم أو لصق توقيع ممسوح على صفحات المستند',
    endpoint: '/api/v1/security/sign',
    icon: PenTool,
    colorScheme: 'rose',
  },
  {
    id: 'cert-sign',
    category: 'sign-security',
    nameKey: 'toolSignWithCertificate',
    nameEn: 'Sign with Certificate',
    nameAr: 'توقيع رقمي بشهادة معتمدة',
    descEn: 'Sign with PKCS#12 (.p12/.pfx) cryptographic certificate and timestamp',
    descAr: 'توقيع المستند بشهادة تشفير رقمية PKCS#12 (.p12/.pfx) وختم زمني موثق',
    endpoint: '/api/v1/security/cert-sign',
    icon: ShieldCheck,
    isPopular: true,
    colorScheme: 'rose',
  },
  {
    id: 'validate-signature',
    category: 'sign-security',
    nameKey: 'toolValidateSignature',
    nameEn: 'Validate PDF Signature',
    nameAr: 'التحقق من صحة التواقيع الرقمية',
    descEn: 'Inspect certificate authenticity, signer identity, and document tampering',
    descAr: 'فحص موثوقية الشهادات وهوية الموقعين وعدم التلاعب بمحتوى المستند',
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
    nameKey: 'toolAddImage',
    nameEn: 'Add image',
    nameAr: 'إدراج صورة في الصفحة',
    descEn: 'Insert custom images, diagrams, or graphics into designated page coordinates',
    descAr: 'إدراج صور أو رسوم بيانية في إحداثيات محددة على صفحات المستند',
    endpoint: '/api/v1/misc/add-image',
    icon: ImageIcon,
    colorScheme: 'lime',
  },
  {
    id: 'add-page-numbers',
    category: 'view-edit',
    nameKey: 'toolAddPageNumbers',
    nameEn: 'Add Page Numbers',
    nameAr: 'ترقيم الصفحات',
    descEn: 'Insert custom page numbering at header, footer, margin, or center',
    descAr: 'إدراج ترقيم الصفحات في الترويسة أو التذييل أو الهامش مع تنسيقات متعددة',
    endpoint: '/api/v1/misc/add-page-numbers',
    icon: Heading,
    colorScheme: 'lime',
  },
  {
    id: 'adjust-colors',
    category: 'view-edit',
    nameKey: 'toolAdvancedColourOptions',
    nameEn: 'Advanced Colour options',
    nameAr: 'خيارات الألوان المتقدمة والتباين',
    descEn: 'Invert colors, convert to grayscale, adjust brightness and gamma curves',
    descAr: 'عكس الألوان، التحويل للرمادي، وضبط السطوع ومنحنيات التباين لتحسين القراءة',
    endpoint: '/api/v1/misc/adjust-colors',
    icon: Palette,
    colorScheme: 'lime',
  },
  {
    id: 'edit-metadata',
    category: 'view-edit',
    nameKey: 'toolChangeMetadata',
    nameEn: 'Change Metadata',
    nameAr: 'تعديل بيانات المستند (Metadata)',
    descEn: 'Edit title, author, subject, keywords, creator, and producer metadata',
    descAr: 'تعديل العنوان، المؤلف، الموضوع، الكلمات المفتاحية وبيانات النشر والإنشاء',
    endpoint: '/api/v1/misc/metadata',
    icon: FileText,
    colorScheme: 'lime',
  },
  {
    id: 'compare-pdfs',
    category: 'view-edit',
    nameKey: 'toolCompare',
    nameEn: 'Compare',
    nameAr: 'مقارنة مستندين',
    descEn: 'Visually compare two PDF versions and highlight page/text changes',
    descAr: 'مقارنة نسختين بصرياً وإبراز الفروقات والتغييرات في النصوص والصفحات',
    endpoint: '/api/v1/misc/compare',
    icon: ArrowRightLeft,
    colorScheme: 'lime',
  },
  {
    id: 'extract-images',
    category: 'view-edit',
    nameKey: 'toolExtractImages',
    nameEn: 'Extract Images',
    nameAr: 'استخراج الصور المضمنة',
    descEn: 'Extract all embedded photos and raster assets from the document',
    descAr: 'استخراج كافة الصور والرسومات النقطية المضمنة داخل المستند إلى مجلد مستقل',
    endpoint: '/api/v1/misc/extract-images',
    icon: ImageIcon,
    colorScheme: 'lime',
  },
  {
    id: 'flatten-forms',
    category: 'view-edit',
    nameKey: 'toolFlatten',
    nameEn: 'Flatten',
    nameAr: 'تسطيح النماذج والطبقات',
    descEn: 'Flatten interactive form fields and annotations into static document content',
    descAr: 'تسطيح حقول النماذج التفاعلية والملاحظات لتصبح جزءاً ثابتاً من محتوى الصفحة',
    endpoint: '/api/v1/misc/flatten',
    icon: FileCheck2,
    colorScheme: 'lime',
  },
  {
    id: 'doc-properties',
    category: 'view-edit',
    nameKey: 'toolGetAllInfoOnPdf',
    nameEn: 'Get ALL Info on PDF',
    nameAr: 'تشخيص وفحص كافة معلومات PDF',
    descEn: 'Inspect PDF specification, font embeddings, encryption, and conformance',
    descAr: 'فحص إصدار ومواصفات PDF، الخطوط المضمنة، التشفير وتفاصيل المطابقة',
    endpoint: '/api/v1/misc/document-properties',
    icon: Eye,
    colorScheme: 'lime',
  },
  {
    id: 'ocr-pdf',
    category: 'view-edit',
    nameKey: 'toolOcrCleanupScans',
    nameEn: 'OCR / Cleanup scans',
    nameAr: 'التعرف الضوئي ومعالجة المخطوطات والماسح',
    descEn: 'Run Arabic & English OCR and deskew/cleanup scanned pages into searchable text',
    descAr: 'تشغيل التعرف الضوئي على النصوص العربية والإنجليزية وتنظيف صفحات المخطوطات',
    endpoint: '/api/v1/misc/ocr-pdf',
    icon: FileText,
    isPopular: true,
    colorScheme: 'lime',
  },
  {
    id: 'remove-annotations',
    category: 'view-edit',
    nameKey: 'toolRemoveAnnotations',
    nameEn: 'Remove Annotations',
    nameAr: 'إزالة التعليقات والتحديدات',
    descEn: 'Clean all highlights, comments, and stamp annotations from document',
    descAr: 'إزالة جميع التحديدات والملاحظات والتعليقات والرسوم من المستند نهائياً',
    endpoint: '/api/v1/misc/remove-annotations',
    icon: Eraser,
    colorScheme: 'lime',
  },
  {
    id: 'remove-blanks',
    category: 'view-edit',
    nameKey: 'toolRemoveBlankPages',
    nameEn: 'Remove Blank pages',
    nameAr: 'إزالة الصفحات الفارغة',
    descEn: 'Automatically detect and purge blank scanned pages from the PDF',
    descAr: 'اكتشاف وحذف الصفحات البيضاء الفارغة الناتجة عن المسح الضوئي تلقائياً',
    endpoint: '/api/v1/misc/remove-blanks',
    icon: Trash2,
    colorScheme: 'lime',
  },
  {
    id: 'remove-images',
    category: 'view-edit',
    nameKey: 'toolRemoveImage',
    nameEn: 'Remove image',
    nameAr: 'إزالة الصور من الصفحات',
    descEn: 'Strip out photos and bitmap illustrations while preserving text layout',
    descAr: 'إزالة الصور والرسوم النقطية مع الحفاظ الكامل على تسلسل ونصوص المستند',
    endpoint: '/api/v1/misc/remove-images',
    icon: ImageIcon,
    colorScheme: 'lime',
  },

  // =========================================================================
  // 6. Advanced & Processor (Orange/Coral Icons) - 11 tools
  // =========================================================================
  {
    id: 'adjust-contrast',
    category: 'advanced-processor',
    nameKey: 'toolAdjustColoursContrast',
    nameEn: 'Adjust Colours/Contrast',
    nameAr: 'ضبط الألوان والتباين',
    descEn: 'Fine-tune contrast and sharpness for pale or aged manuscript scans',
    descAr: 'ضبط التباين والحدة لتحسين قراءة المخطوطات القديمة والوثائق الباهتة',
    endpoint: '/api/v1/misc/adjust-colors',
    icon: Palette,
    colorScheme: 'orange',
  },
  {
    id: 'auto-rename',
    category: 'advanced-processor',
    nameKey: 'toolAutoRenamePdfFile',
    nameEn: 'Auto Rename PDF File',
    nameAr: 'إعادة التسمية التلقائية بالذكاء',
    descEn: 'Extract document title, header, or first section text to rename file cleanly',
    descAr: 'استخراج عنوان المستند أو الترويسة الأولى لإعادة تسمية الملف بدقة',
    endpoint: '/api/v1/misc/auto-rename',
    icon: Heading,
    isNew: true,
    colorScheme: 'orange',
  },
  {
    id: 'split-by-size',
    category: 'advanced-processor',
    nameKey: 'toolAutoSplitBySizeCount',
    nameEn: 'Auto Split by Size/Count',
    nameAr: 'تقسيم تلقائي بالحجم أو العدد',
    descEn: 'Divide large PDF files into fixed megabyte sizes or page counts',
    descAr: 'تقسيم ملفات PDF الضخمة إلى أحجام محددة بالميجابايت أو عدد الصفحات',
    endpoint: '/api/v1/general/split-by-size-or-count',
    icon: Scissors,
    colorScheme: 'orange',
  },
  {
    id: 'auto-split',
    category: 'advanced-processor',
    nameKey: 'toolAutoSplitPages',
    nameEn: 'Auto Split Pages',
    nameAr: 'تقسيم الصفحات والمسح التلقائي',
    descEn: 'Detect two-page book spreads and split into single portrait pages',
    descAr: 'اكتشاف الصفحات المزدوجة وتقسيمها إلى صفحات طولية مفردة ومستقلة',
    endpoint: '/api/v1/general/auto-split-pdf',
    icon: Split,
    colorScheme: 'orange',
  },
  {
    id: 'compress-pdf',
    category: 'advanced-processor',
    nameKey: 'toolCompress',
    nameEn: 'Compress',
    nameAr: 'ضغط وتحسين الحجم',
    descEn: 'Reduce file size intelligently with JBIG2, Deflate, and resolution tuning',
    descAr: 'تقليل حجم الملف بذكاء باستخدام ضغط متقدم وضبط دقة الصور بدون فقد الجودة',
    endpoint: '/api/v1/misc/compress-pdf',
    icon: Minimize2,
    isPopular: true,
    colorScheme: 'orange',
  },
  {
    id: 'scanner-image-split',
    category: 'advanced-processor',
    nameKey: 'toolDetectSplitScannedPhotos',
    nameEn: 'Detect/Split Scanned photos',
    nameAr: 'اكتشاف وفصل الصور الممسوحة',
    descEn: 'Isolate individual photos from multi-photo flatbed scanner scans',
    descAr: 'فصل واقتصاص الصور الفردية من مسحة ضوئية مسطحة متعددة الصور تلقائياً',
    endpoint: '/api/v1/misc/extract-image-scans',
    icon: Scissors,
    colorScheme: 'orange',
  },
  {
    id: 'overlay-pdfs',
    category: 'advanced-processor',
    nameKey: 'toolOverlayPdfs',
    nameEn: 'Overlay PDFs',
    nameAr: 'تراكب ودمج الطبقات (Overlay)',
    descEn: 'Layer one PDF over another as transparent stationery, letterhead, or seal',
    descAr: 'تراكب مستند PDF فوق آخر كترويسة رسمية أو ورق خطابات أو خلفية شفافة',
    endpoint: '/api/v1/general/overlay-pdf',
    icon: Layers,
    colorScheme: 'orange',
  },
  {
    id: 'pipeline-processor',
    category: 'advanced-processor',
    nameKey: 'toolPipelineStirlingProcessor',
    nameEn: 'Pipeline (Stirling Processor)',
    nameAr: 'أنابيب المعالجة الآلية (Stirling Processor)',
    descEn: 'Chain multiple tools into automated pipelines with watched folders & policies',
    descAr: 'ربط أدوات متعددة في أنابيب معالجة متسلسلة مع مراقبة المجلدات والسياسات',
    endpoint: '/api/v1/pipeline/handleData',
    icon: Cpu,
    isPopular: true,
    colorScheme: 'orange',
  },
  {
    id: 'repair-pdf',
    category: 'advanced-processor',
    nameKey: 'toolRepair',
    nameEn: 'Repair',
    nameAr: 'إصلاح ملفات PDF المعطوبة',
    descEn: 'Recover corrupt xref tables, rebuild trailers, and rescue unreadable PDFs',
    descAr: 'إصلاح جداول xref التالفة وإعادة بناء الهيكل لإنقاذ الملفات غير القابلة للفتح',
    endpoint: '/api/v1/misc/repair',
    icon: AlertTriangle,
    colorScheme: 'orange',
  },
  {
    id: 'show-javascript',
    category: 'advanced-processor',
    nameKey: 'toolShowJavascript',
    nameEn: 'Show Javascript',
    nameAr: 'فحص واستعراض أكواد جافاسكريبت',
    descEn: 'Inspect, export, or audit all embedded scripts and form actions for security',
    descAr: 'استعراض وفحص وتصدير كافة أكواد جافاسكريبت والإجراءات المضمنة في المستند',
    endpoint: '/api/v1/misc/show-javascript',
    icon: FileCode,
    colorScheme: 'orange',
  },
  {
    id: 'split-by-chapters',
    category: 'advanced-processor',
    nameKey: 'toolSplitPdfByChapters',
    nameEn: 'Split PDF by Chapters',
    nameAr: 'تقسيم الكتاب حسب الفصول والفهرس',
    descEn: 'Automatically split book into separate chapter files using bookmarks/TOC',
    descAr: 'تقسيم الكتاب تلقائياً إلى ملفات فصول مستقلة بالاعتماد على الفهرس والمخطط',
    endpoint: '/api/v1/general/split-pdf-by-chapters',
    icon: BookmarkCheck,
    colorScheme: 'orange',
  },
  {
    id: 'filter-contains-text',
    category: 'advanced-processor',
    nameKey: 'stirlingFilterContainsText',
    nameEn: 'Filter: Contains Text',
    nameAr: 'فلترة: يحتوي على نص',
    descEn: 'Conditional gate: only proceed if document contains specified text',
    descAr: 'بوابة شرطية: تمرير الملف فقط إذا كان يحتوي على النص المطلوب',
    endpoint: '/api/v1/filter/filter-contains-text',
    icon: FileText,
    colorScheme: 'orange',
  },
  {
    id: 'filter-contains-image',
    category: 'advanced-processor',
    nameKey: 'stirlingFilterContainsImage',
    nameEn: 'Filter: Contains Image',
    nameAr: 'فلترة: يحتوي على صور',
    descEn: 'Conditional gate: detect scanned documents containing images for OCR routing',
    descAr: 'بوابة شرطية: كشف المستندات الممسوحة ضوئياً وتوجيهها لمعالجة OCR',
    endpoint: '/api/v1/filter/filter-contains-image',
    icon: ImageIcon,
    colorScheme: 'orange',
  },
  {
    id: 'filter-page-count',
    category: 'advanced-processor',
    nameKey: 'stirlingFilterPageCount',
    nameEn: 'Filter: Page Count',
    nameAr: 'فلترة: عدد الصفحات',
    descEn: 'Conditional gate: match documents within minimum and maximum page count bounds',
    descAr: 'بوابة شرطية: مطابقة المستندات بحسب نطاق عدد الصفحات المسموح به',
    endpoint: '/api/v1/filter/filter-page-count',
    icon: Layers,
    colorScheme: 'orange',
  },
  {
    id: 'filter-page-size',
    category: 'advanced-processor',
    nameKey: 'stirlingFilterPageSize',
    nameEn: 'Filter: Page Dimensions',
    nameAr: 'فلترة: أبعاد الصفحة',
    descEn: 'Conditional gate: verify standard sheet dimensions (A4, Letter, Custom)',
    descAr: 'بوابة شرطية: التحقق من قياسات الصفحات القياسية (A4، Letter، مخصص)',
    endpoint: '/api/v1/filter/filter-page-size',
    icon: Maximize2,
    colorScheme: 'orange',
  },
  {
    id: 'filter-file-size',
    category: 'advanced-processor',
    nameKey: 'stirlingFilterFileSize',
    nameEn: 'Filter: File Size',
    nameAr: 'فلترة: حجم الملف',
    descEn: 'Conditional gate: filter documents exceeding or below target file size threshold',
    descAr: 'بوابة شرطية: فرز المستندات بناءً على الحد الأقصى لحجم الملف بالميغابايت',
    endpoint: '/api/v1/filter/filter-file-size',
    icon: SlidersHorizontal,
    colorScheme: 'orange',
  },
  {
    id: 'filter-page-rotation',
    category: 'advanced-processor',
    nameKey: 'stirlingFilterPageRotation',
    nameEn: 'Filter: Page Rotation',
    nameAr: 'فلترة: اتجاه التدوير',
    descEn: 'Conditional gate: detect rotated or landscape pages requiring orientation fix',
    descAr: 'بوابة شرطية: كشف الصفحات الأفقية أو المقلوبة التي تتطلب تصحيح الاتجاه',
    endpoint: '/api/v1/filter/filter-page-rotation',
    icon: RotateCw,
    colorScheme: 'orange',
  },
];

const QUICK_LAUNCH_TOOLS = ['manual-redact', 'multi-tool', 'compress-pdf', 'pipeline-processor', 'validate-signature'];

const AVAILABLE_PIPELINE_STEPS: {
  operation: string;
  nameEn: string;
  nameAr: string;
  defaultParams: Record<string, unknown>;
  category: 'filter' | 'tool';
}[] = [
  // 6 Conditional Filter Gates
  { operation: '/api/v1/filter/filter-contains-text', nameEn: 'Filter: Contains Text', nameAr: 'تصفية: يحتوي على نصوص', defaultParams: { inverted: false }, category: 'filter' },
  { operation: '/api/v1/filter/filter-contains-image', nameEn: 'Filter: Contains Image', nameAr: 'تصفية: يحتوي على صور', defaultParams: { inverted: false, pageNumbers: 'all' }, category: 'filter' },
  { operation: '/api/v1/filter/filter-page-count', nameEn: 'Filter: Page Count', nameAr: 'تصفية: عدد الصفحات', defaultParams: { comparator: 'greater-than', count: 5 }, category: 'filter' },
  { operation: '/api/v1/filter/filter-page-size', nameEn: 'Filter: Page Size', nameAr: 'تصفية: أبعاد الصفحة', defaultParams: { pageSize: 'A4', comparator: 'equals' }, category: 'filter' },
  { operation: '/api/v1/filter/filter-file-size', nameEn: 'Filter: File Size', nameAr: 'تصفية: حجم الملف (MB)', defaultParams: { comparator: 'less-than', sizeMb: 20 }, category: 'filter' },
  { operation: '/api/v1/filter/filter-page-rotation', nameEn: 'Filter: Page Rotation', nameAr: 'تصفية: زاوية دوران الصفحة', defaultParams: { rotation: 0, comparator: 'equals' }, category: 'filter' },
  // Core Processing Tools
  { operation: '/api/v1/misc/ocr-pdf', nameEn: 'OCR / Scan Text Recognition', nameAr: 'التعرف الضوئي على النصوص (OCR)', defaultParams: { languages: ['ara', 'eng'], ocrType: 'skip-text' }, category: 'tool' },
  { operation: '/api/v1/misc/compress-pdf', nameEn: 'Compress & Optimize', nameAr: 'ضغط وتقليص حجم PDF', defaultParams: { optimizeLevel: 2 }, category: 'tool' },
  { operation: '/api/v1/security/sanitize-pdf', nameEn: 'Sanitize PDF', nameAr: 'تعقيم وتنظيف ملف PDF', defaultParams: {}, category: 'tool' },
  { operation: '/api/v1/security/auto-redact', nameEn: 'Auto-Redact Sensitive Data', nameAr: 'الحجب التلقائي للبيانات الحساسة', defaultParams: { words: ['[\\w.-]+@[\\w.-]+\\.\\w+'], useRegex: true, wholeWordSearch: true }, category: 'tool' },
  { operation: '/api/v1/security/add-watermark', nameEn: 'Add Watermark', nameAr: 'إضافة علامة مائية', defaultParams: { watermarkText: 'CONFIDENTIAL', fontSize: 36, opacity: 0.25, rotation: 45 }, category: 'tool' },
  { operation: '/api/v1/convert/pdf/pdfa', nameEn: 'Convert to PDF/A', nameAr: 'تحويل إلى أرشيف PDF/A', defaultParams: { conformance: '2b' }, category: 'tool' },
  { operation: '/api/v1/misc/flatten', nameEn: 'Flatten Forms & Layers', nameAr: 'تسطيح النماذج والطبقات', defaultParams: {}, category: 'tool' },
  { operation: '/api/v1/misc/remove-annotations', nameEn: 'Remove Annotations', nameAr: 'إزالة التعليقات والتحشيات', defaultParams: {}, category: 'tool' },
  { operation: '/api/v1/general/rotate-pdf', nameEn: 'Rotate PDF', nameAr: 'تدوير الصفحات', defaultParams: { angle: 90 }, category: 'tool' },
  { operation: '/api/v1/misc/repair', nameEn: 'Repair PDF', nameAr: 'إصلاح ملف PDF', defaultParams: {}, category: 'tool' },
  { operation: '/api/v1/misc/linearize', nameEn: 'Linearize (Fast Web View)', nameAr: 'تهيئة للعرض السريع عبر الويب', defaultParams: {}, category: 'tool' },
];

export function StirlingToolsHub({
  onClose,
  onOpenInWorkstation,
}: {
  onClose: () => void;
  onOpenInWorkstation?: (fileUrlOrWorkId: string) => void;
}) {
  const { t, lang, dir, books, theme, toggleTheme } = useWorkspace();
  const [searchQuery, setSearchQuery] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [sortMode, setSortMode] = useState<'category' | 'alpha'>('category');
  const [viewMode, setViewMode] = useState<'columns' | 'grid' | 'pipelines'>('columns');
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
  const [selectedTool, setSelectedTool] = useState<StirlingToolDef | null>(null);
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
  const [toolCompressLevel, setToolCompressLevel] = useState(2);
  const [toolWatermarkText, setToolWatermarkText] = useState('CONFIDENTIAL');
  const [toolPassword, setToolPassword] = useState('');
  const [toolRotateAngle, setToolRotateAngle] = useState(90);
  const [toolPagesRange, setToolPagesRange] = useState('1');
  const [toolOcrLang, setToolOcrLang] = useState<'ara' | 'eng' | 'ara,eng'>('ara,eng');
  const [toolPdfaConformance, setToolPdfaConformance] = useState<'2b' | '3b' | '1b'>('2b');

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
      setPipelineName(lang === 'ar' ? 'معالجة المخطوطات والمسوح الأكاديمية' : 'Scholarly Scan Ingestion');
      setPipelineDesc(lang === 'ar' ? 'تصفية المستندات المصورة، واستخراج النصوص باللغتين العربية والإنجليزية، ثم ضغط الحجم' : 'Filter PDFs with images, run Arabic/English OCR with text-skipping, and compress');
      setPipelineTrigger('folder');
      setPipelineSteps([
        { id: `s-${Date.now()}-1`, operation: '/api/v1/filter/filter-contains-image', name: lang === 'ar' ? 'تصفية: يحتوي على صور' : 'Contains Image Filter', parameters: { pageNumbers: 'all' } },
        { id: `s-${Date.now()}-2`, operation: '/api/v1/misc/ocr-pdf', name: lang === 'ar' ? 'التعرف الضوئي (OCR)' : 'OCR / Cleanup Scans', parameters: { languages: ['ara', 'eng'], ocrType: 'skip-text' } },
        { id: `s-${Date.now()}-3`, operation: '/api/v1/misc/compress-pdf', name: lang === 'ar' ? 'ضغط وتقليص الحجم' : 'Compress & Optimize', parameters: { optimizeLevel: 3 } },
      ]);
    } else if (type === 'prepublish') {
      setPipelineName(lang === 'ar' ? 'التعقيم والتجهيز قبل النشر' : 'Pre-Publish Sanitization');
      setPipelineDesc(lang === 'ar' ? 'تعقيم النصوص وحذف السكربتات والتحشيات وتسطيح النماذج والتحويل إلى PDF/A' : 'Sanitize JS/metadata, strip annotations, flatten form fields, and convert to PDF/A');
      setPipelineTrigger('manual');
      setPipelineSteps([
        { id: `s-${Date.now()}-1`, operation: '/api/v1/security/sanitize-pdf', name: lang === 'ar' ? 'تعقيم وتنظيف PDF' : 'Sanitize PDF', parameters: {} },
        { id: `s-${Date.now()}-2`, operation: '/api/v1/misc/remove-annotations', name: lang === 'ar' ? 'إزالة التحشيات' : 'Remove Annotations', parameters: {} },
        { id: `s-${Date.now()}-3`, operation: '/api/v1/misc/flatten', name: lang === 'ar' ? 'تسطيح النماذج' : 'Flatten Forms', parameters: {} },
        { id: `s-${Date.now()}-4`, operation: '/api/v1/convert/pdf/pdfa', name: lang === 'ar' ? 'تحويل إلى PDF/A' : 'Convert to PDF/A', parameters: { conformance: '2b' } },
      ]);
    } else if (type === 'confidential') {
      setPipelineName(lang === 'ar' ? 'إصدار الوثائق السرية والمحجوبة' : 'Confidential Document Release');
      setPipelineDesc(lang === 'ar' ? 'الحجب التلقائي للهويات والأرقام الحساسة والبريد الإلكتروني، والتعقيم وإضافة علامة مائية سرية' : 'Auto-redact emails, phone numbers, and IDs, sanitize scripts, and stamp with confidentiality watermark');
      setPipelineTrigger('folder');
      setPipelineSteps([
        {
          id: `s-${Date.now()}-1`,
          operation: '/api/v1/security/auto-redact',
          name: lang === 'ar' ? 'حجب البيانات الحساسة' : 'Auto-Redact Sensitive Data',
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
        { id: `s-${Date.now()}-2`, operation: '/api/v1/security/sanitize-pdf', name: lang === 'ar' ? 'تعقيم وتنظيف PDF' : 'Sanitize PDF', parameters: {} },
        { id: `s-${Date.now()}-3`, operation: '/api/v1/security/add-watermark', name: lang === 'ar' ? 'إضافة علامة مائية' : 'Add Watermark', parameters: { watermarkText: 'CONFIDENTIAL', fontSize: 36, opacity: 0.25, rotation: 45 } },
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
        name: lang === 'ar' ? found.nameAr : found.nameEn,
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
      id: editingPipeline?.id || `pipe-${Date.now()}`,
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
      if (eRes && (eRes as any).ok) setEngineStatus((eRes as any).data);
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
          t.nameEn.toLowerCase().includes(q) ||
          t.nameAr.toLowerCase().includes(q) ||
          t.descEn.toLowerCase().includes(q) ||
          t.descAr.toLowerCase().includes(q) ||
          t.id.toLowerCase().includes(q)
      );
    }
    if (sortMode === 'alpha') {
      list = [...list].sort((a, b) => {
        const nameA = lang === 'ar' ? a.nameAr : a.nameEn;
        const nameB = lang === 'ar' ? b.nameAr : b.nameEn;
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
    setExecutionResult(null);
  };

  const handleExecuteTool = async () => {
    if (!selectedTool) return;
    setIsExecuting(true);
    setExecutionResult(null);

    try {
      let targetPath = localFilePath;
      if (!targetPath && selectedBookId) {
        const book = books.find(b => b.id === selectedBookId);
        if (book?.filePath) targetPath = book.filePath;
      }

      if (!targetPath) {
        throw new Error(lang === 'ar' ? 'يرجى اختيار ملف PDF للتنفيذ عليه' : 'Please select a PDF file to process');
      }

      const params: Record<string, unknown> = {};
      if (selectedTool.id === 'compress-pdf') params.optimizeLevel = toolCompressLevel;
      if (selectedTool.id === 'watermark') {
        params.watermarkText = toolWatermarkText;
        params.fontSize = 36;
        params.opacity = 0.25;
        params.rotation = 45;
      }
      if (selectedTool.id === 'add-password') params.password = toolPassword;
      if (selectedTool.id === 'rotate') params.angle = toolRotateAngle;
      if (selectedTool.id === 'split') params.pages = toolPagesRange;
      if (selectedTool.id === 'ocr-pdf') {
        params.languages = toolOcrLang.split(',');
        params.ocrType = 'skip-text';
      }
      if (selectedTool.id === 'pdf-to-pdfa') params.conformance = toolPdfaConformance;

      const editor = window.electronAPI?.pdfEditor;
      if (!editor?.executePipeline) {
        throw new Error('PDF Engine is not accessible');
      }

      const res = await editor.executePipeline({
        filePaths: [targetPath],
        pipelineConfig: {
          name: `Standalone: ${selectedTool.nameEn}`,
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
        throw new Error(res?.ok === false ? res.error : t('pdfSuiteOperationFailed'));
      }
    } catch (err: any) {
      setExecutionResult({
        success: false,
        error: err?.message || t('pdfSuiteOperationFailed'),
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
        isDark ? 'bg-[#0c0d10] text-[#e1e4ea]' : 'bg-[#f8f9fa] text-[#111827]'
      } flex flex-col overflow-hidden font-sans select-none`}
    >
      {/* 1. TOP HEADER & NAVIGATION BAR */}
      <header className={`flex flex-wrap items-center justify-between gap-3 px-6 py-3.5 border-b ${
        isDark ? 'border-[#1f2229] bg-[#121418]' : 'border-[#e2e8f0] bg-white'
      } shrink-0`}>
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-xl bg-gradient-to-br from-indigo-500 to-emerald-600 flex items-center justify-center text-white shadow-lg shadow-emerald-500/10">
            <Cpu size={20} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className={`font-bold text-base tracking-tight ${isDark ? 'text-white' : 'text-[#0f172a]'}`}>
                {t('pdfToolsHubTitle')}
              </h1>
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 text-[10px] font-bold">
                <span className="inline-block size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Ready v3.2.2
              </span>
              {/* External Tool Capability Badges */}
              <div className="hidden sm:flex items-center gap-1 font-mono text-[9px]">
                <span
                  title={engineStatus.externalTools?.libreoffice ? t('stirlingToolAvailable') : t('stirlingToolMissing')}
                  className={`flex items-center gap-1 px-1.5 py-0.2 rounded-full border ${
                    engineStatus.externalTools?.libreoffice
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500 font-bold'
                      : 'border-neutral-500/20 bg-neutral-500/10 text-neutral-400 opacity-60'
                  }`}
                >
                  <span className={`size-1 rounded-full ${engineStatus.externalTools?.libreoffice ? 'bg-emerald-500' : 'bg-neutral-400'}`} />
                  LibreOffice
                </span>
                <span
                  title={engineStatus.externalTools?.tesseract ? t('stirlingToolAvailable') : t('stirlingToolMissing')}
                  className={`flex items-center gap-1 px-1.5 py-0.2 rounded-full border ${
                    engineStatus.externalTools?.tesseract
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500 font-bold'
                      : 'border-neutral-500/20 bg-neutral-500/10 text-neutral-400 opacity-60'
                  }`}
                >
                  <span className={`size-1 rounded-full ${engineStatus.externalTools?.tesseract ? 'bg-emerald-500' : 'bg-neutral-400'}`} />
                  Tesseract
                </span>
                <span
                  title={engineStatus.externalTools?.qpdf ? t('stirlingToolAvailable') : t('stirlingToolMissing')}
                  className={`flex items-center gap-1 px-1.5 py-0.2 rounded-full border ${
                    engineStatus.externalTools?.qpdf
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500 font-bold'
                      : 'border-neutral-500/20 bg-neutral-500/10 text-neutral-400 opacity-60'
                  }`}
                >
                  <span className={`size-1 rounded-full ${engineStatus.externalTools?.qpdf ? 'bg-emerald-500' : 'bg-neutral-400'}`} />
                  QPDF
                </span>
                <span
                  title={engineStatus.externalTools?.ghostscript ? t('stirlingToolAvailable') : t('stirlingToolMissing')}
                  className={`flex items-center gap-1 px-1.5 py-0.2 rounded-full border ${
                    engineStatus.externalTools?.ghostscript
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500 font-bold'
                      : 'border-neutral-500/20 bg-neutral-500/10 text-neutral-400 opacity-60'
                  }`}
                >
                  <span className={`size-1 rounded-full ${engineStatus.externalTools?.ghostscript ? 'bg-emerald-500' : 'bg-neutral-400'}`} />
                  Ghostscript
                </span>
              </div>
            </div>
            <p className={`text-[11px] ${isDark ? 'text-[#8b92a5]' : 'text-[#64748b]'}`}>{t('pdfToolsHubSubtitle')}</p>
          </div>
        </div>

        {/* Quick Nav Pills */}
        <div className={`hidden lg:flex items-center gap-1.5 ${
          isDark ? 'bg-[#181a20] border-[#262a34]' : 'bg-[#f1f5f9] border-[#cbd5e1]'
        } p-1 rounded-xl border`}>
          {[
            { id: 'multi-tool', label: 'Multi Tool' },
            { id: 'pipelines', label: 'Pipeline / Processor' },
            { id: 'compress-pdf', label: 'Compress' },
            { id: 'split', label: 'Split' },
            { id: 'merge', label: 'Merge' },
          ].map(pill => (
            <button
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
                isDark ? 'text-[#a0a6b7] hover:text-white hover:bg-[#222631]' : 'text-[#475569] hover:text-[#0f172a] hover:bg-white'
              } transition-all cursor-pointer`}
            >
              {pill.label}
            </button>
          ))}
        </div>

        {/* Actions & Search */}
        <div className="flex items-center gap-2.5">
          {/* Centered Search */}
          <div className="relative w-64 md:w-80">
            <Search className={`absolute inset-y-0 start-3 my-auto size-4 ${isDark ? 'text-[#8b92a5]' : 'text-[#64748b]'}`} />
            <input
              type="search"
              aria-label={t('pdfToolsSearchPlaceholder')}
              placeholder={t('pdfToolsSearchPlaceholder')}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className={`w-full ${
                isDark ? 'bg-[#181a20] border-[#262a34] text-white placeholder-[#686e80]' : 'bg-[#f1f5f9] border-[#cbd5e1] text-[#0f172a] placeholder-[#94a3b8]'
              } border rounded-xl ps-9 pe-3 py-1.5 text-xs focus:border-emerald-500 outline-none transition-all`}
            />
          </div>

          {/* Star Filter */}
          <button
            type="button"
            title={t('pdfToolsFavorites')}
            aria-pressed={favoritesOnly}
            onClick={() => setFavoritesOnly(!favoritesOnly)}
            className={`p-2 rounded-xl border transition-all cursor-pointer ${
              favoritesOnly
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-500 dark:text-amber-400'
                : isDark
                ? 'bg-[#181a20] border-[#262a34] text-[#8b92a5] hover:text-white'
                : 'bg-[#f1f5f9] border-[#cbd5e1] text-[#64748b] hover:text-[#0f172a]'
            }`}
          >
            <Star size={16} fill={favoritesOnly ? 'currentColor' : 'none'} />
          </button>

          {/* Sort Selector */}
          <div className={`flex items-center rounded-xl ${isDark ? 'bg-[#181a20] border-[#262a34]' : 'bg-[#f1f5f9] border-[#cbd5e1]'} border p-0.5`}>
            <button
              type="button"
              onClick={() => setSortMode('category')}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-all cursor-pointer ${
                sortMode === 'category'
                  ? isDark ? 'bg-[#262a34] text-white shadow-sm' : 'bg-white text-[#0f172a] shadow-xs'
                  : isDark ? 'text-[#8b92a5] hover:text-white' : 'text-[#64748b] hover:text-[#0f172a]'
              }`}
            >
              {t('pdfToolsSortCategory')}
            </button>
            <button
              type="button"
              onClick={() => setSortMode('alpha')}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-all cursor-pointer ${
                sortMode === 'alpha'
                  ? isDark ? 'bg-[#262a34] text-white shadow-sm' : 'bg-white text-[#0f172a] shadow-xs'
                  : isDark ? 'text-[#8b92a5] hover:text-white' : 'text-[#64748b] hover:text-[#0f172a]'
              }`}
            >
              {t('pdfToolsSortAlpha')}
            </button>
          </div>

          {/* View Mode Switcher */}
          <div className={`flex items-center rounded-xl ${isDark ? 'bg-[#181a20] border-[#262a34]' : 'bg-[#f1f5f9] border-[#cbd5e1]'} border p-0.5`}>
            <button
              type="button"
              title={t('pdfToolsViewColumns')}
              onClick={() => setViewMode('columns')}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === 'columns'
                  ? isDark ? 'bg-[#262a34] text-white' : 'bg-white text-[#0f172a] shadow-xs'
                  : isDark ? 'text-[#8b92a5] hover:text-white' : 'text-[#64748b] hover:text-[#0f172a]'
              }`}
            >
              <Columns3 size={15} />
            </button>
            <button
              type="button"
              title={t('pdfToolsViewGrid')}
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === 'grid'
                  ? isDark ? 'bg-[#262a34] text-white' : 'bg-white text-[#0f172a] shadow-xs'
                  : isDark ? 'text-[#8b92a5] hover:text-white' : 'text-[#64748b] hover:text-[#0f172a]'
              }`}
            >
              <LayoutGrid size={15} />
            </button>
            <button
              type="button"
              title={t('pdfToolsViewPipelines')}
              onClick={() => setViewMode('pipelines')}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === 'pipelines'
                  ? 'bg-emerald-600 text-white'
                  : isDark ? 'text-[#8b92a5] hover:text-white' : 'text-[#64748b] hover:text-[#0f172a]'
              }`}
            >
              <Cpu size={15} />
            </button>
          </div>

          {/* Theme Toggle */}
          <button
            type="button"
            title={isDark ? t('pdfThemeLight') : t('pdfThemeDark')}
            onClick={toggleTheme}
            className={`p-2 rounded-xl border transition-all cursor-pointer ${
              isDark
                ? 'bg-[#181a20] border-[#262a34] text-[#8b92a5] hover:text-white'
                : 'bg-[#f1f5f9] border-[#cbd5e1] text-[#64748b] hover:text-[#0f172a]'
            }`}
          >
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          {/* Close Hub */}
          <button
            type="button"
            title={t('close')}
            onClick={onClose}
            className={`p-2 rounded-xl border ${
              isDark ? 'border-[#262a34] hover:bg-[#222631] text-[#8b92a5] hover:text-white' : 'border-[#cbd5e1] hover:bg-[#f1f5f9] text-[#64748b] hover:text-[#0f172a]'
            } transition-all cursor-pointer`}
          >
            <X size={16} />
          </button>
        </div>
      </header>

      {/* 2. MAIN SCROLLABLE CONTENT AREA */}
      <main className="flex-1 overflow-y-auto px-6 py-5">
        {viewMode === 'pipelines' ? (
          /* ============================================================ */
          /* PIPELINES & AUTOMATED WORKFLOWS VIEW                         */
          /* ============================================================ */
          <div className="max-w-6xl mx-auto space-y-6">
            {/* Live Telemetry Banner */}
            <div className={`p-4 rounded-2xl bg-gradient-to-r ${
              isDark ? 'from-[#141820] to-[#121c17] border-[#222b3a]' : 'from-[#f1f5f9] to-[#ecfdf5] border-[#cbd5e1]'
            } border shadow-lg flex flex-wrap items-center justify-between gap-4`}>
              <div className="flex items-center gap-3">
                <div className="size-11 rounded-xl bg-emerald-500/20 text-emerald-500 dark:text-emerald-400 flex items-center justify-center">
                  <Cpu size={24} />
                </div>
                <div>
                  <h2 className={`font-bold text-sm ${isDark ? 'text-white' : 'text-[#0f172a]'}`}>{t('pdfProcessorLiveTitle')}</h2>
                  <p className={`text-xs ${isDark ? 'text-[#8b92a5]' : 'text-[#64748b]'}`}>
                    {t('pdfProcessorTelemetry', {
                      pipelines: telemetry.activePipelines,
                      today: telemetry.processedToday,
                      folders: telemetry.watchedFolders,
                    })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
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
                        if (res && (res as any).ok) {
                          await refreshData();
                        }
                      }
                    };
                    input.click();
                  }}
                  className={`px-3 py-2 rounded-xl border ${
                    isDark ? 'border-[#282d3b] bg-[#181a20] text-[#a0a6b7] hover:text-white' : 'border-[#cbd5e1] bg-white text-[#475569] hover:text-[#0f172a]'
                  } text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer`}
                >
                  <Upload size={14} />
                  <span>{t('stirlingImportPipelineJson')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsConnectingFolder(true)}
                  className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md shadow-blue-600/20 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <FolderPlus size={14} />
                  <span>{t('pdfWatchedFolderConnect')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreatingPipeline(true)}
                  className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus size={14} />
                  <span>{t('pdfPipelineNew')}</span>
                </button>
              </div>
            </div>

            {/* Watched Folder Sources Section */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className={`font-bold text-sm ${isDark ? 'text-white' : 'text-[#0f172a]'}`}>{t('pdfWatchedFoldersTitle')}</h3>
                  <p className={`text-xs ${isDark ? 'text-[#8b92a5]' : 'text-[#64748b]'}`}>{t('pdfWatchedFoldersDesc')}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsConnectingFolder(true)}
                  className="text-xs text-blue-500 hover:underline flex items-center gap-1 cursor-pointer font-semibold"
                >
                  <Plus size={12} />
                  <span>{t('pdfWatchedFolderAdd')}</span>
                </button>
              </div>

              {watchedFolders.length === 0 ? (
                <div className={`p-6 rounded-2xl border text-center ${
                  isDark ? 'border-[#222631] bg-[#14161c] text-[#8b92a5]' : 'border-[#e2e8f0] bg-white text-[#64748b]'
                }`}>
                  <FolderInput className="size-8 mx-auto mb-2 opacity-40 text-blue-400" />
                  <p className="text-xs font-semibold">{t('pdfWatchedFoldersEmpty')}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {watchedFolders.map(folder => (
                    <div
                      key={folder.id}
                      className={`p-4 rounded-xl border ${
                        isDark ? 'bg-[#14161c] border-[#222631]' : 'bg-white border-[#e2e8f0] shadow-xs'
                      } space-y-2.5`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <FolderInput size={16} className="text-blue-500" />
                          <span className={`font-bold text-xs ${isDark ? 'text-white' : 'text-[#0f172a]'}`}>{folder.name}</span>
                        </div>
                        <span className="flex items-center gap-1 text-[10px] text-emerald-500 font-bold px-2 py-0.5 rounded-full bg-emerald-500/10">
                          <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          {t('pdfWatchedFolderStatusWatching')}
                        </span>
                      </div>
                      <div className="text-[11px] space-y-1 font-mono">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="text-[#8b92a5]">{t('pdfWatchedFolderInput')}:</span>
                          <span className="truncate">{folder.inputPath}</span>
                        </div>
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="text-[#8b92a5]">{t('pdfWatchedFolderOutput')}:</span>
                          <span className="truncate">{folder.outputPath}</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between border-t border-[#1f2229] pt-2 text-[10px] text-[#8b92a5]">
                        <span>{t('pdfWatchedFolderProcessed', { count: folder.processedCount })}</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            title={t('stirlingExportFolderScanJson')}
                            onClick={async () => {
                              const pipe = pipelines.find(p => p.id === folder.pipelineId) || pipelines[0];
                              const res = await window.electronAPI?.pdfEditor?.exportPipelineFolderScan?.(folder, pipe);
                              if (res && (res as any).ok) {
                                const blob = new Blob([(res as any).data], { type: 'application/json' });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `${folder.name.toLowerCase().replace(/\s+/g, '-')}.folder-scan.json`;
                                a.click();
                                URL.revokeObjectURL(url);
                              }
                            }}
                            className="p-1 rounded text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10 cursor-pointer"
                          >
                            <Download size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteWatchedFolder(folder.id)}
                            className="text-rose-500 hover:text-rose-400 p-1 cursor-pointer"
                            title={t('delete')}
                          >
                            <Trash2 size={13} />
                          </button>
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
                    isDark ? 'bg-[#14161c] border-[#222631] text-[#e1e4ea]' : 'bg-white border-[#e2e8f0] text-[#111827]'
                  } space-y-4`}
                >
                  <div className="flex items-center justify-between border-b pb-3 border-[#222631]">
                    <h3 className="font-bold text-sm flex items-center gap-2">
                      <FolderPlus size={16} className="text-blue-500" />
                      {t('pdfWatchedFolderConnect')}
                    </h3>
                    <button type="button" onClick={() => setIsConnectingFolder(false)} className="cursor-pointer text-[#8b92a5]">
                      <X size={16} />
                    </button>
                  </div>
                  <div className="space-y-3 text-xs">
                    <div>
                      <label className="font-bold block mb-1">{t('pdfWatchedFolderName')}</label>
                      <input
                        type="text"
                        required
                        value={newFolderName}
                        onChange={e => setNewFolderName(e.target.value)}
                        placeholder="e.g. Scans Inbox"
                        className={`w-full p-2 rounded-lg border outline-none ${
                          isDark ? 'bg-[#181a20] border-[#262a34] text-white' : 'bg-[#f8fafc] border-[#cbd5e1] text-[#0f172a]'
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
                          isDark ? 'bg-[#181a20] border-[#262a34] text-white' : 'bg-[#f8fafc] border-[#cbd5e1] text-[#0f172a]'
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
                          isDark ? 'bg-[#181a20] border-[#262a34] text-white' : 'bg-[#f8fafc] border-[#cbd5e1] text-[#0f172a]'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="font-bold block mb-1">{t('pdfWatchedFolderAfter')}</label>
                      <select
                        value={newFolderRule}
                        onChange={e => setNewFolderRule(e.target.value as any)}
                        className={`w-full p-2 rounded-lg border outline-none ${
                          isDark ? 'bg-[#181a20] border-[#262a34] text-white' : 'bg-[#f8fafc] border-[#cbd5e1] text-[#0f172a]'
                        }`}
                      >
                        <option value="keep">{t('pdfWatchedFolderKeep')}</option>
                        <option value="archive">{t('pdfWatchedFolderArchive')}</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2 border-t border-[#222631]">
                    <button
                      type="button"
                      onClick={() => setIsConnectingFolder(false)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[#8b92a5] cursor-pointer"
                    >
                      {t('cancel')}
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold cursor-pointer"
                    >
                      {t('save')}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Custom & Presets Pipelines Section */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className={`font-bold text-sm ${isDark ? 'text-white' : 'text-[#0f172a]'}`}>{t('pdfPipelineSteps')}</h3>
                  <p className={`text-xs ${isDark ? 'text-[#8b92a5]' : 'text-[#64748b]'}`}>
                    {lang === 'ar' ? 'سلسلة عمليات Stirling-PDF التلقائية المحفوظة' : 'Configured multi-step automated sequences'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {pipelines.map(pipe => (
                  <div
                    key={pipe.id}
                    className={`p-4 rounded-2xl border ${
                      isDark ? 'bg-[#14161c] border-[#222631]' : 'bg-white border-[#e2e8f0] shadow-sm'
                    } flex flex-col justify-between space-y-4 transition-all`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h4 className={`font-bold text-sm ${isDark ? 'text-white' : 'text-[#0f172a]'}`}>{pipe.name}</h4>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                            pipe.trigger === 'editor'
                              ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20'
                              : pipe.trigger === 'folder'
                              ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                              : 'bg-neutral-800 text-neutral-300'
                          }`}
                        >
                          {pipe.trigger === 'editor'
                            ? t('pdfPipelineTriggerEditor')
                            : pipe.trigger === 'folder'
                            ? t('pdfPipelineTriggerFolder')
                            : t('pdfPipelineTriggerManual')}
                        </span>
                      </div>
                      <p className={`text-xs ${isDark ? 'text-[#8b92a5]' : 'text-[#64748b]'} mt-1 line-clamp-2`}>{pipe.description || '—'}</p>

                      {/* Steps sequence */}
                      <div className="mt-3 space-y-1.5">
                        <span className="text-[10px] font-semibold text-[#686e80] block">
                          {pipe.steps.length} {t('pdfPipelineStepsCount')}:
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {pipe.steps.map((st, i) => (
                            <span
                              key={st.id || i}
                              className={`px-2 py-0.5 rounded-md ${
                                isDark ? 'bg-[#1d212b] border-[#282d3b] text-[#a0a6b7]' : 'bg-[#f1f5f9] border-[#cbd5e1] text-[#475569]'
                              } border text-[10px] flex items-center gap-1`}
                            >
                              <span className="text-emerald-500 font-bold">{i + 1}.</span>
                              {st.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-[#1f2229] pt-3">
                      <span className="text-[10px] text-[#686e80]">
                        {pipe.active ? `● ${t('pdfPipelineActive')}` : `○ ${t('pdfPipelinePaused')}`}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          title={t('stirlingExportAutomateJson')}
                          onClick={async () => {
                            const res = await window.electronAPI?.pdfEditor?.exportPipelineAutomate?.(pipe);
                            if (res && (res as any).ok) {
                              const blob = new Blob([(res as any).data], { type: 'application/json' });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `${pipe.name.toLowerCase().replace(/\s+/g, '-')}.automate.json`;
                              a.click();
                              URL.revokeObjectURL(url);
                            }
                          }}
                          className={`p-1.5 rounded-lg border ${
                            isDark ? 'border-[#282d3b] hover:bg-[#222631] text-[#a0a6b7]' : 'border-[#cbd5e1] hover:bg-[#f1f5f9] text-[#475569]'
                          } text-xs transition-all cursor-pointer`}
                        >
                          <Download size={12} />
                        </button>
                        <button
                          type="button"
                          title={lang === 'ar' ? 'تعديل الأنبوب' : 'Edit Pipeline'}
                          onClick={() => {
                            setEditingPipeline(pipe);
                            setPipelineName(pipe.name);
                            setPipelineDesc(pipe.description || '');
                            setPipelineTrigger(pipe.trigger);
                            setPipelineSteps(pipe.steps || []);
                            setIsCreatingPipeline(true);
                          }}
                          className={`p-1.5 rounded-lg border ${
                            isDark ? 'border-[#282d3b] hover:bg-[#222631] text-[#a0a6b7]' : 'border-[#cbd5e1] hover:bg-[#f1f5f9] text-[#475569]'
                          } text-xs transition-all cursor-pointer`}
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          type="button"
                          title={t('delete')}
                          onClick={() => void handleDeletePipeline(pipe.id)}
                          className="p-1.5 rounded-lg border border-rose-500/30 hover:bg-rose-500/10 text-rose-500 text-xs transition-all cursor-pointer"
                        >
                          <Trash2 size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedTool({
                              id: `pipe-${pipe.id}`,
                              category: 'advanced-processor',
                              nameKey: 'toolPipelineStirlingProcessor',
                              nameEn: pipe.name,
                              nameAr: pipe.name,
                              descEn: pipe.description || '',
                              descAr: pipe.description || '',
                              endpoint: '/api/v1/pipeline/handleData',
                              icon: Cpu,
                              colorScheme: 'orange',
                            });
                          }}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-500 dark:text-emerald-400 text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer"
                        >
                          <Play size={12} />
                          <span>{t('pdfPipelineRun')}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Collapsible POLICIES Accordion */}
            <section className={`p-5 rounded-2xl border ${
              isDark ? 'bg-[#14161c] border-[#222631]' : 'bg-white border-[#e2e8f0] shadow-sm'
            } space-y-4`}>
              <div className="flex items-center justify-between border-b border-[#1f2229] pb-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="size-5 text-emerald-500 dark:text-emerald-400" />
                  <h3 className={`font-bold text-sm ${isDark ? 'text-white' : 'text-[#0f172a]'}`}>{t('pdfPoliciesTitle')}</h3>
                </div>
                <span className="text-[11px] text-[#8b92a5]">
                  {t('pdfPoliciesEnforced')}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* 1. Ingestion */}
                <div className={`p-3.5 rounded-xl border ${
                  isDark ? 'bg-[#191c24] border-[#262c3b]' : 'bg-[#f8fafc] border-[#e2e8f0]'
                } space-y-2`}>
                  <h4 className={`font-bold text-xs ${isDark ? 'text-white' : 'text-[#0f172a]'} flex items-center gap-1.5`}>
                    <FolderInput size={14} className="text-blue-500" />
                    {t('pdfPolicyIngestion')}
                  </h4>
                  <ul className={`text-[11px] ${isDark ? 'text-[#a0a6b7]' : 'text-[#475569]'} space-y-1`}>
                    <li>✓ {t('pdfPolicyIngestionRule1')}</li>
                    <li>✓ {t('pdfPolicyIngestionRule2')}</li>
                    <li>✓ {t('pdfPolicyIngestionRule3')}</li>
                  </ul>
                </div>

                {/* 2. Security */}
                <div className={`p-3.5 rounded-xl border ${
                  isDark ? 'bg-[#191c24] border-[#262c3b]' : 'bg-[#f8fafc] border-[#e2e8f0]'
                } space-y-2`}>
                  <h4 className={`font-bold text-xs ${isDark ? 'text-white' : 'text-[#0f172a]'} flex items-center gap-1.5`}>
                    <Shield size={14} className="text-rose-500" />
                    {t('pdfPolicySecurity')}
                  </h4>
                  <ul className={`text-[11px] ${isDark ? 'text-[#a0a6b7]' : 'text-[#475569]'} space-y-1`}>
                    <li>✓ {t('pdfPolicySecurityRule1')}</li>
                    <li>✓ {t('pdfPolicySecurityRule2')}</li>
                    <li>✓ {t('pdfPolicySecurityRule3')}</li>
                  </ul>
                </div>

                {/* 3. Compliance */}
                <div className={`p-3.5 rounded-xl border ${
                  isDark ? 'bg-[#191c24] border-[#262c3b]' : 'bg-[#f8fafc] border-[#e2e8f0]'
                } space-y-2`}>
                  <h4 className={`font-bold text-xs ${isDark ? 'text-white' : 'text-[#0f172a]'} flex items-center gap-1.5`}>
                    <FileArchive size={14} className="text-cyan-500" />
                    {t('pdfPolicyCompliance')}
                  </h4>
                  <ul className={`text-[11px] ${isDark ? 'text-[#a0a6b7]' : 'text-[#475569]'} space-y-1`}>
                    <li>✓ {t('pdfPolicyComplianceRule1')}</li>
                    <li>✓ {t('pdfPolicyComplianceRule2')}</li>
                    <li>✓ {t('pdfPolicyComplianceRule3')}</li>
                  </ul>
                </div>

                {/* 4. Routing */}
                <div className={`p-3.5 rounded-xl border ${
                  isDark ? 'bg-[#191c24] border-[#262c3b]' : 'bg-[#f8fafc] border-[#e2e8f0]'
                } space-y-2`}>
                  <h4 className={`font-bold text-xs ${isDark ? 'text-white' : 'text-[#0f172a]'} flex items-center gap-1.5`}>
                    <FolderOutput size={14} className="text-amber-500" />
                    {t('pdfPolicyRouting')}
                  </h4>
                  <ul className={`text-[11px] ${isDark ? 'text-[#a0a6b7]' : 'text-[#475569]'} space-y-1`}>
                    <li>✓ {t('pdfPolicyRoutingRule1')}</li>
                    <li>✓ {t('pdfPolicyRoutingRule2')}</li>
                    <li>✓ {t('pdfPolicyRoutingRule3')}</li>
                  </ul>
                </div>

                {/* 5. Retention */}
                <div className={`p-3.5 rounded-xl border ${
                  isDark ? 'bg-[#191c24] border-[#262c3b]' : 'bg-[#f8fafc] border-[#e2e8f0]'
                } space-y-2`}>
                  <h4 className={`font-bold text-xs ${isDark ? 'text-white' : 'text-[#0f172a]'} flex items-center gap-1.5`}>
                    <BookmarkCheck size={14} className="text-emerald-500" />
                    {t('pdfPolicyRetention')}
                  </h4>
                  <ul className={`text-[11px] ${isDark ? 'text-[#a0a6b7]' : 'text-[#475569]'} space-y-1`}>
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
                  <h3 className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-[#8b92a5]' : 'text-[#64748b]'}`}>
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
                            ? 'bg-[#14161c] border-[#222631] hover:border-emerald-500/50 hover:bg-[#181c24]'
                            : 'bg-white border-[#e2e8f0] hover:border-emerald-500 hover:bg-emerald-50/20 shadow-xs'
                        } text-start transition-all shadow-sm flex flex-col justify-between min-h-[110px] cursor-pointer`}
                      >
                        <div className="flex items-start justify-between w-full">
                          <div
                            className={`size-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 ${
                              tool.colorScheme === 'rose'
                                ? 'bg-rose-500/10 text-rose-500'
                                : tool.colorScheme === 'blue'
                                ? 'bg-blue-500/10 text-blue-500'
                                : tool.colorScheme === 'orange'
                                ? 'bg-orange-500/10 text-orange-500'
                                : 'bg-emerald-500/10 text-emerald-500'
                            }`}
                          >
                            <Icon size={20} />
                          </div>
                          {tool.isNew && (
                            <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 text-[9px] font-black uppercase tracking-wider">
                              NEW
                            </span>
                          )}
                        </div>
                        <div className="mt-2">
                          <h4 className={`font-bold text-xs ${isDark ? 'text-white' : 'text-[#0f172a]'} group-hover:text-emerald-500 transition-colors line-clamp-1`}>
                            {lang === 'ar' ? tool.nameAr : tool.nameEn}
                          </h4>
                          <p className={`text-[10px] ${isDark ? 'text-[#686e80]' : 'text-[#64748b]'} mt-0.5 line-clamp-1`}>
                            {lang === 'ar' ? tool.descAr : tool.descEn}
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
                <div className={`p-3 rounded-2xl border ${isDark ? 'bg-[#121419] border-[#1d212a]' : 'bg-[#f1f5f9]/70 border-[#e2e8f0]'} space-y-3`}>
                  <div className="flex items-center gap-2 pb-2 border-b-2 border-blue-500/30">
                    <span className="size-2 rounded-full bg-blue-500" />
                    <h3 className="font-bold text-xs uppercase tracking-wider text-blue-500 dark:text-blue-400">
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
                <div className={`p-3 rounded-2xl border ${isDark ? 'bg-[#121419] border-[#1d212a]' : 'bg-[#f1f5f9]/70 border-[#e2e8f0]'} space-y-3`}>
                  <div className="flex items-center gap-2 pb-2 border-b-2 border-emerald-500/30">
                    <span className="size-2 rounded-full bg-emerald-500" />
                    <h3 className="font-bold text-xs uppercase tracking-wider text-emerald-500 dark:text-emerald-400">
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
                <div className={`p-3 rounded-2xl border ${isDark ? 'bg-[#121419] border-[#1d212a]' : 'bg-[#f1f5f9]/70 border-[#e2e8f0]'} space-y-3`}>
                  <div className="flex items-center gap-2 pb-2 border-b-2 border-cyan-500/30">
                    <span className="size-2 rounded-full bg-cyan-500" />
                    <h3 className="font-bold text-xs uppercase tracking-wider text-cyan-500 dark:text-cyan-400">
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
                <div className={`p-3 rounded-2xl border ${isDark ? 'bg-[#121419] border-[#1d212a]' : 'bg-[#f1f5f9]/70 border-[#e2e8f0]'} space-y-3`}>
                  <div className="flex items-center gap-2 pb-2 border-b-2 border-rose-500/30">
                    <span className="size-2 rounded-full bg-rose-500" />
                    <h3 className="font-bold text-xs uppercase tracking-wider text-rose-500 dark:text-rose-400">
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
                <div className={`p-3 rounded-2xl border ${isDark ? 'bg-[#121419] border-[#1d212a]' : 'bg-[#f1f5f9]/70 border-[#e2e8f0]'} space-y-3`}>
                  <div className="flex items-center gap-2 pb-2 border-b-2 border-lime-500/30">
                    <span className="size-2 rounded-full bg-lime-500" />
                    <h3 className="font-bold text-xs uppercase tracking-wider text-lime-600 dark:text-lime-400">
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
                <div className={`p-3 rounded-2xl border ${isDark ? 'bg-[#121419] border-[#1d212a]' : 'bg-[#f1f5f9]/70 border-[#e2e8f0]'} space-y-3`}>
                  <div className="flex items-center gap-2 pb-2 border-b-2 border-orange-500/30">
                    <span className="size-2 rounded-full bg-orange-500" />
                    <h3 className="font-bold text-xs uppercase tracking-wider text-orange-500 dark:text-orange-400">
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
                          ? 'bg-[#14161c] border-[#222631] text-white hover:border-emerald-500/50 hover:bg-[#181c24]'
                          : 'bg-white border-[#e2e8f0] text-[#0f172a] hover:border-emerald-500 hover:bg-emerald-50/20 shadow-xs'
                      } text-start transition-all shadow-sm flex flex-col justify-between min-h-[125px] cursor-pointer`}
                    >
                      <div className="flex items-start justify-between w-full">
                        <div
                          className={`size-9 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 ${
                            tool.colorScheme === 'rose'
                              ? 'bg-rose-500/10 text-rose-500'
                              : tool.colorScheme === 'blue'
                              ? 'bg-blue-500/10 text-blue-500'
                              : tool.colorScheme === 'orange'
                              ? 'bg-orange-500/10 text-orange-500'
                              : tool.colorScheme === 'cyan'
                              ? 'bg-cyan-500/10 text-cyan-500'
                              : tool.colorScheme === 'lime'
                              ? 'bg-lime-500/10 text-lime-600 dark:text-lime-400'
                              : 'bg-emerald-500/10 text-emerald-500'
                          }`}
                        >
                          <Icon size={18} />
                        </div>
                        <button
                          type="button"
                          onClick={e => toggleFavorite(tool.id, e)}
                          className={`p-1 text-[#686e80] hover:text-amber-400 transition-colors ${
                            favorites.includes(tool.id) ? 'text-amber-400' : ''
                          }`}
                        >
                          <Star size={13} fill={favorites.includes(tool.id) ? 'currentColor' : 'none'} />
                        </button>
                      </div>
                      <div className="mt-2.5">
                        <h4 className={`font-bold text-xs ${isDark ? 'text-white' : 'text-[#0f172a]'} group-hover:text-emerald-500 transition-colors line-clamp-1`}>
                          {lang === 'ar' ? tool.nameAr : tool.nameEn}
                        </h4>
                        <p className={`text-[10px] ${isDark ? 'text-[#8b92a5]' : 'text-[#64748b]'} mt-0.5 line-clamp-2`}>
                          {lang === 'ar' ? tool.descAr : tool.descEn}
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
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div
            dir={dir}
            className={`w-full max-w-xl max-h-[90vh] rounded-2xl border ${
              isDark ? 'bg-[#121418] border-[#222631] text-[#e1e4ea]' : 'bg-white border-[#e2e8f0] text-[#111827] shadow-2xl'
            } shadow-2xl flex flex-col overflow-hidden`}
          >
            {/* Modal Header */}
            <div className={`p-4 border-b ${isDark ? 'border-[#1f2229] bg-[#14161c]' : 'border-[#e2e8f0] bg-[#f8fafc]'} flex items-center justify-between`}>
              <div className="flex items-center gap-2.5">
                <div
                  className={`size-8 rounded-lg flex items-center justify-center ${
                    selectedTool.colorScheme === 'rose'
                      ? 'bg-rose-500/10 text-rose-500'
                      : selectedTool.colorScheme === 'blue'
                      ? 'bg-blue-500/10 text-blue-500'
                      : selectedTool.colorScheme === 'orange'
                      ? 'bg-orange-500/10 text-orange-500'
                      : selectedTool.colorScheme === 'cyan'
                      ? 'bg-cyan-500/10 text-cyan-500'
                      : selectedTool.colorScheme === 'lime'
                      ? 'bg-lime-500/10 text-lime-600 dark:text-lime-400'
                      : 'bg-emerald-500/10 text-emerald-500'
                  }`}
                >
                  {React.createElement(selectedTool.icon, { size: 16 })}
                </div>
                <div>
                  <h3 className={`font-bold text-sm ${isDark ? 'text-white' : 'text-[#0f172a]'}`}>
                    {lang === 'ar' ? selectedTool.nameAr : selectedTool.nameEn}
                  </h3>
                  <p className={`text-[11px] ${isDark ? 'text-[#8b92a5]' : 'text-[#64748b]'}`}>
                    {lang === 'ar' ? selectedTool.descAr : selectedTool.descEn}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTool(null)}
                className={`p-1.5 rounded-lg text-[#8b92a5] ${isDark ? 'hover:bg-[#222631] hover:text-white' : 'hover:bg-[#f1f5f9] hover:text-[#0f172a]'} cursor-pointer`}
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {/* File Selection Dropzone */}
              <div className="space-y-3">
                <label className={`block text-xs font-bold ${isDark ? 'text-white' : 'text-[#0f172a]'}`}>
                  {lang === 'ar' ? 'اختر ملف PDF للمعالجة' : 'Select Target PDF'}
                </label>

                {/* Option A: Select from Library */}
                <div className="space-y-1.5">
                  <span className="text-[11px] text-[#8b92a5] block">{t('pdfSelectFromLibrary')}</span>
                  <select
                    value={selectedBookId}
                    onChange={e => {
                      setSelectedBookId(e.target.value);
                      setLocalFilePath('');
                    }}
                    className={`w-full p-2 rounded-xl border outline-none text-xs ${
                      isDark ? 'bg-[#181a20] border-[#262a34] text-white' : 'bg-[#f8fafc] border-[#cbd5e1] text-[#0f172a]'
                    }`}
                  >
                    <option value="">{lang === 'ar' ? '— اختر كتاباً من مكتبتك —' : '— Select a book from your library —'}</option>
                    {books.filter(b => b.filePath).map(book => (
                      <option key={book.id} value={book.id}>
                        {book.title} ({book.author || '—'})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Option B: Local File Dropzone */}
                <div className="space-y-1.5">
                  <span className="text-[11px] text-[#8b92a5] block">{lang === 'ar' ? 'أو اختر ملفاً من جهازك:' : 'Or choose file from computer:'}</span>
                  <div
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => {
                      e.preventDefault();
                      const file = e.dataTransfer.files[0];
                      if (file && (file as any).path) {
                        setLocalFilePath((file as any).path);
                        setSelectedBookId('');
                      }
                    }}
                    onClick={async () => {
                      try {
                        const filePath = await window.electronAPI?.openFileDialog?.();
                        if (filePath) {
                          setLocalFilePath(filePath);
                          setSelectedBookId('');
                        }
                      } catch {
                        /* ignore */
                      }
                    }}
                    className={`border-2 border-dashed ${
                      isDark ? 'border-[#282d3b] bg-[#121418]/50 hover:border-emerald-500/50' : 'border-[#cbd5e1] bg-[#f8fafc] hover:border-emerald-500'
                    } rounded-2xl p-4 text-center cursor-pointer transition-all`}
                  >
                    <Upload className="size-6 text-[#8b92a5] mx-auto mb-2" />
                    <p className={`text-xs font-semibold ${isDark ? 'text-white' : 'text-[#0f172a]'}`}>
                      {localFilePath ? localFilePath.split(/[/\\]/).pop() : t('pdfDropFilesPrompt')}
                    </p>
                    {localFilePath && (
                      <p className="text-[10px] text-emerald-500 font-mono mt-1 break-all">{localFilePath}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Dynamic Tool Parameters */}
              {selectedTool.id === 'compress-pdf' && (
                <div className={`p-4 rounded-xl border ${isDark ? 'bg-[#181a20] border-[#262a34]' : 'bg-[#f8fafc] border-[#e2e8f0]'} space-y-2`}>
                  <label className={`block text-xs font-bold ${isDark ? 'text-white' : 'text-[#0f172a]'}`}>
                    {t('pdfParamOptimizeLevel')}
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { level: 1, label: lang === 'ar' ? 'منخفض (أسرع)' : 'Low (Fast)' },
                      { level: 2, label: lang === 'ar' ? 'متوسط (موصى به)' : 'Medium (Balanced)' },
                      { level: 3, label: lang === 'ar' ? 'أقصى (أصغر حجم)' : 'High (Smallest)' },
                    ].map(item => (
                      <button
                        key={item.level}
                        type="button"
                        onClick={() => setToolCompressLevel(item.level)}
                        className={`p-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                          toolCompressLevel === item.level
                            ? 'bg-emerald-600 border-emerald-500 text-white'
                            : isDark ? 'bg-[#14161c] border-[#222631] text-[#8b92a5]' : 'bg-white border-[#cbd5e1] text-[#64748b]'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {selectedTool.id === 'watermark' && (
                <div className={`p-4 rounded-xl border ${isDark ? 'bg-[#181a20] border-[#262a34]' : 'bg-[#f8fafc] border-[#e2e8f0]'} space-y-2`}>
                  <label className={`block text-xs font-bold ${isDark ? 'text-white' : 'text-[#0f172a]'}`}>
                    {t('pdfParamWatermarkText')}
                  </label>
                  <input
                    type="text"
                    value={toolWatermarkText}
                    onChange={e => setToolWatermarkText(e.target.value)}
                    className={`w-full ${isDark ? 'bg-[#121418] border-[#282d3b] text-white' : 'bg-white border-[#cbd5e1] text-[#0f172a]'} border rounded-lg px-3 py-1.5 text-xs outline-none focus:border-emerald-500`}
                  />
                </div>
              )}

              {selectedTool.id === 'rotate' && (
                <div className={`p-4 rounded-xl border ${isDark ? 'bg-[#181a20] border-[#262a34]' : 'bg-[#f8fafc] border-[#e2e8f0]'} space-y-2`}>
                  <label className={`block text-xs font-bold ${isDark ? 'text-white' : 'text-[#0f172a]'}`}>
                    {t('pdfParamRotateAngle')}
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[90, 180, 270].map(angle => (
                      <button
                        key={angle}
                        type="button"
                        onClick={() => setToolRotateAngle(angle)}
                        className={`p-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                          toolRotateAngle === angle
                            ? 'bg-blue-600 border-blue-500 text-white'
                            : isDark ? 'bg-[#14161c] border-[#222631] text-[#8b92a5]' : 'bg-white border-[#cbd5e1] text-[#64748b]'
                        }`}
                      >
                        {angle}°
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {selectedTool.id === 'split' && (
                <div className={`p-4 rounded-xl border ${isDark ? 'bg-[#181a20] border-[#262a34]' : 'bg-[#f8fafc] border-[#e2e8f0]'} space-y-2`}>
                  <label className={`block text-xs font-bold ${isDark ? 'text-white' : 'text-[#0f172a]'}`}>
                    {t('pdfParamPagesRange')} (e.g. 1-3, 5, 8)
                  </label>
                  <input
                    type="text"
                    value={toolPagesRange}
                    onChange={e => setToolPagesRange(e.target.value)}
                    className={`w-full ${isDark ? 'bg-[#121418] border-[#282d3b] text-white' : 'bg-white border-[#cbd5e1] text-[#0f172a]'} border rounded-lg px-3 py-1.5 text-xs outline-none focus:border-blue-500`}
                  />
                </div>
              )}

              {/* Execution Feedback */}
              {isExecuting && (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center space-y-2">
                  <RefreshCw className="size-6 text-emerald-500 animate-spin mx-auto" />
                  <p className="text-xs font-bold text-emerald-600 dark:text-emerald-300">{t('pdfExecutingTool')}</p>
                </div>
              )}

              {executionResult && (
                <div
                  className={`p-4 rounded-xl border text-xs space-y-2.5 ${
                    executionResult.success
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-200'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300'
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold">
                    {executionResult.success ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                    <span>
                      {executionResult.success ? t('pdfExecutionSuccess') : executionResult.error}
                    </span>
                  </div>

                  {executionResult.success && executionResult.outputPath && (
                    <div className="space-y-2 pt-2 border-t border-emerald-500/20">
                      <p className={`text-[11px] font-mono break-all ${isDark ? 'text-white/90' : 'text-[#0f172a]'}`}>
                        {executionResult.outputPath}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {onOpenInWorkstation && (
                          <button
                            type="button"
                            onClick={() => {
                              onOpenInWorkstation(executionResult.outputPath!);
                              setSelectedTool(null);
                              onClose();
                            }}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                          >
                            <ExternalLink size={13} />
                            <span>{t('pdfOpenInWorkstation')}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className={`p-4 border-t ${isDark ? 'border-[#1f2229] bg-[#121418]' : 'border-[#e2e8f0] bg-[#f8fafc]'} flex items-center justify-end gap-2`}>
              <button
                type="button"
                onClick={() => setSelectedTool(null)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold ${isDark ? 'text-[#8b92a5] hover:text-white' : 'text-[#64748b] hover:text-[#0f172a]'} cursor-pointer`}
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                disabled={isExecuting || (!selectedBookId && !localFilePath)}
                onClick={() => void handleExecuteTool()}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-bold shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Play size={14} />
                <span>{t('pdfExecuteTool')}</span>
              </button>
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
            className={`w-full max-w-2xl max-h-[90vh] rounded-2xl border ${
              isDark ? 'bg-[#121418] border-[#222631] text-[#e1e4ea]' : 'bg-white border-[#e2e8f0] text-[#111827] shadow-2xl'
            } shadow-2xl flex flex-col overflow-hidden`}
          >
            {/* Modal Header */}
            <div className={`p-4 border-b ${isDark ? 'border-[#1f2229] bg-[#151820]' : 'border-[#e2e8f0] bg-[#f8fafc]'} flex items-center justify-between`}>
              <div className="flex items-center gap-2.5">
                <div className="size-9 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                  <Cpu size={18} />
                </div>
                <div>
                  <h3 className={`font-bold text-sm ${isDark ? 'text-white' : 'text-[#0f172a]'}`}>
                    {editingPipeline ? (lang === 'ar' ? 'تعديل أنبوب المعالجة' : 'Edit Pipeline') : t('pdfPipelineNew')}
                  </h3>
                  <p className={`text-[11px] ${isDark ? 'text-[#8b92a5]' : 'text-[#64748b]'}`}>
                    {lang === 'ar' ? 'تسلسل بوابات التصفية الشرطية وعمليات المعالجة التلقائية' : 'Sequence conditional filter gates and automated processing tools'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsCreatingPipeline(false);
                  setEditingPipeline(null);
                }}
                className={`p-1.5 rounded-lg ${isDark ? 'text-[#8b92a5] hover:text-white hover:bg-[#1f2229]' : 'text-[#64748b] hover:text-[#0f172a] hover:bg-[#f1f5f9]'} cursor-pointer`}
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              {/* 1-Click Suggested Presets */}
              <div className="space-y-1.5">
                <span className={`font-bold text-[11px] uppercase tracking-wider ${isDark ? 'text-[#8b92a5]' : 'text-[#64748b]'}`}>
                  {lang === 'ar' ? 'أنابيب مقترحة بضغطة زر' : 'Suggested Automations (1-Click)'}:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => handleApplySuggestedAutomation('scholarly')}
                    className={`p-2 rounded-xl border text-start transition-all cursor-pointer ${
                      isDark
                        ? 'border-[#262a34] bg-[#181a20] hover:border-emerald-500/50 hover:bg-[#1a1e27]'
                        : 'border-[#cbd5e1] bg-[#f8fafc] hover:border-emerald-500 hover:bg-emerald-50/20'
                    }`}
                  >
                    <span className="font-bold block text-emerald-500 text-[11px]">
                      {lang === 'ar' ? 'المخطوطات والمسوح الأكاديمية' : 'Scholarly Scan Ingestion'}
                    </span>
                    <span className={`text-[10px] ${isDark ? 'text-[#8b92a5]' : 'text-[#64748b]'} line-clamp-1`}>
                      {lang === 'ar' ? 'صور ← OCR عربى/إنجليزى ← ضغط' : 'Image Filter → OCR → Compress'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplySuggestedAutomation('prepublish')}
                    className={`p-2 rounded-xl border text-start transition-all cursor-pointer ${
                      isDark
                        ? 'border-[#262a34] bg-[#181a20] hover:border-emerald-500/50 hover:bg-[#1a1e27]'
                        : 'border-[#cbd5e1] bg-[#f8fafc] hover:border-emerald-500 hover:bg-emerald-50/20'
                    }`}
                  >
                    <span className="font-bold block text-blue-500 text-[11px]">
                      {lang === 'ar' ? 'التعقيم قبل النشر' : 'Pre-Publish Sanitization'}
                    </span>
                    <span className={`text-[10px] ${isDark ? 'text-[#8b92a5]' : 'text-[#64748b]'} line-clamp-1`}>
                      {lang === 'ar' ? 'تعقيم ← حذف التحشيات ← PDF/A' : 'Sanitize → Strip Annotations → PDF/A'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplySuggestedAutomation('confidential')}
                    className={`p-2 rounded-xl border text-start transition-all cursor-pointer ${
                      isDark
                        ? 'border-[#262a34] bg-[#181a20] hover:border-emerald-500/50 hover:bg-[#1a1e27]'
                        : 'border-[#cbd5e1] bg-[#f8fafc] hover:border-emerald-500 hover:bg-emerald-50/20'
                    }`}
                  >
                    <span className="font-bold block text-rose-500 text-[11px]">
                      {lang === 'ar' ? 'إصدار الوثائق السرية' : 'Confidential Release'}
                    </span>
                    <span className={`text-[10px] ${isDark ? 'text-[#8b92a5]' : 'text-[#64748b]'} line-clamp-1`}>
                      {lang === 'ar' ? 'حجب أرقام وإيميلات ← علامة مائية' : 'Auto-Redact → Sanitize → Watermark'}
                    </span>
                  </button>
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
                    placeholder="e.g. Ingestion Pipeline"
                    className={`w-full p-2 rounded-lg border outline-none ${
                      isDark ? 'bg-[#181a20] border-[#262a34] text-white' : 'bg-[#f8fafc] border-[#cbd5e1] text-[#0f172a]'
                    }`}
                  />
                </div>
                <div>
                  <label className="font-bold block mb-1">{t('pdfPipelineTrigger')}</label>
                  <select
                    value={pipelineTrigger}
                    onChange={e => setPipelineTrigger(e.target.value as any)}
                    className={`w-full p-2 rounded-lg border outline-none ${
                      isDark ? 'bg-[#181a20] border-[#262a34] text-white' : 'bg-[#f8fafc] border-[#cbd5e1] text-[#0f172a]'
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
                  placeholder="Optional brief description of what this pipeline accomplishes..."
                  className={`w-full p-2 rounded-lg border outline-none ${
                    isDark ? 'bg-[#181a20] border-[#262a34] text-white' : 'bg-[#f8fafc] border-[#cbd5e1] text-[#0f172a]'
                  }`}
                />
              </div>

              {/* Steps Sequence Section */}
              <div className="space-y-2 pt-2 border-t border-[#1f2229]">
                <div className="flex items-center justify-between">
                  <span className={`font-bold text-xs uppercase tracking-wider ${isDark ? 'text-white' : 'text-[#0f172a]'}`}>
                    {t('pdfPipelineSteps')} ({pipelineSteps.length})
                  </span>
                </div>

                {pipelineSteps.length === 0 ? (
                  <div className={`p-4 rounded-xl border border-dashed text-center ${
                    isDark ? 'border-[#262a34] text-[#8b92a5]' : 'border-[#cbd5e1] text-[#64748b]'
                  }`}>
                    <p className="text-xs font-semibold">{lang === 'ar' ? 'لم تتم إضافة أي خطوات بعد. اختر خطوة من القائمة أدناه واضغط إضافة.' : 'No steps added yet. Select a filter gate or processing tool below.'}</p>
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-[180px] overflow-y-auto">
                    {pipelineSteps.map((step, idx) => (
                      <div
                        key={step.id || idx}
                        className={`flex items-center justify-between p-2 rounded-xl border ${
                          isDark ? 'bg-[#181a20] border-[#262a34]' : 'bg-[#f8fafc] border-[#e2e8f0]'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="size-5 rounded-full bg-emerald-500/10 text-emerald-500 font-bold text-[10px] flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <div className="min-w-0">
                            <span className={`font-bold text-xs block truncate ${isDark ? 'text-white' : 'text-[#0f172a]'}`}>
                              {step.name}
                            </span>
                            <span className="text-[10px] font-mono text-[#8b92a5] block truncate">
                              {step.operation}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => handleMoveStep(idx, 'up')}
                            className="p-1 text-[#8b92a5] hover:text-white disabled:opacity-20 cursor-pointer"
                            title={lang === 'ar' ? 'تحريك للأعلى' : 'Move up'}
                          >
                            <ArrowUp size={12} />
                          </button>
                          <button
                            type="button"
                            disabled={idx === pipelineSteps.length - 1}
                            onClick={() => handleMoveStep(idx, 'down')}
                            className="p-1 text-[#8b92a5] hover:text-white disabled:opacity-20 cursor-pointer"
                            title={lang === 'ar' ? 'تحريك للأدنى' : 'Move down'}
                          >
                            <ArrowDown size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveStep(idx)}
                            className="p-1 text-rose-500 hover:text-rose-400 cursor-pointer"
                            title={t('delete')}
                          >
                            <Trash2 size={12} />
                          </button>
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
                      isDark ? 'bg-[#181a20] border-[#262a34] text-white' : 'bg-[#f8fafc] border-[#cbd5e1] text-[#0f172a]'
                    }`}
                  >
                    <optgroup label={lang === 'ar' ? 'بوابات التصفية الشرطية (Filter Gates)' : 'Conditional Filter Gates'}>
                      {AVAILABLE_PIPELINE_STEPS.filter(s => s.category === 'filter').map(s => (
                        <option key={s.operation} value={s.operation}>
                          {lang === 'ar' ? s.nameAr : s.nameEn}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label={lang === 'ar' ? 'عمليات المعالجة التلقائية (Processing Tools)' : 'Processing Tools'}>
                      {AVAILABLE_PIPELINE_STEPS.filter(s => s.category === 'tool').map(s => (
                        <option key={s.operation} value={s.operation}>
                          {lang === 'ar' ? s.nameAr : s.nameEn}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                  <button
                    type="button"
                    onClick={handleAddStep}
                    className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <Plus size={13} />
                    <span>{t('pdfPipelineAddStep')}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className={`p-4 border-t ${isDark ? 'border-[#1f2229] bg-[#121418]' : 'border-[#e2e8f0] bg-[#f8fafc]'} flex items-center justify-end gap-2`}>
              <button
                type="button"
                onClick={() => {
                  setIsCreatingPipeline(false);
                  setEditingPipeline(null);
                }}
                className={`px-4 py-2 rounded-xl text-xs font-semibold ${isDark ? 'text-[#8b92a5] hover:text-white' : 'text-[#64748b] hover:text-[#0f172a]'} cursor-pointer`}
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                disabled={!pipelineName.trim() || pipelineSteps.length === 0}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-bold shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 size={14} />
                <span>{t('pdfPipelineSave')}</span>
              </button>
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
  lang: string;
  isDark: boolean;
}) {
  const Icon = tool.icon;
  return (
    <div
      onClick={onClick}
      className={`group relative p-2.5 rounded-xl border ${
        isDark
          ? 'bg-[#151820] hover:bg-[#1a1f2c] border-[#202532] text-[#e1e4ea]'
          : 'bg-white hover:bg-emerald-50/40 border-[#e2e8f0] text-[#1e293b] shadow-xs'
      } cursor-pointer transition-all shadow-sm flex items-start gap-2.5`}
    >
      <div
        className={`size-8 rounded-lg shrink-0 flex items-center justify-center transition-transform group-hover:scale-105 ${
          tool.colorScheme === 'blue'
            ? 'bg-blue-500/10 text-blue-500'
            : tool.colorScheme === 'emerald'
            ? 'bg-emerald-500/10 text-emerald-500'
            : tool.colorScheme === 'cyan'
            ? 'bg-cyan-500/10 text-cyan-500'
            : tool.colorScheme === 'rose'
            ? 'bg-rose-500/10 text-rose-500'
            : tool.colorScheme === 'lime'
            ? 'bg-lime-500/10 text-lime-600 dark:text-lime-400'
            : 'bg-orange-500/10 text-orange-500'
        }`}
      >
        <Icon size={16} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <h4 className={`font-bold text-xs ${isDark ? 'text-white' : 'text-[#0f172a]'} group-hover:text-emerald-500 transition-colors truncate`}>
            {lang === 'ar' ? tool.nameAr : tool.nameEn}
          </h4>
          <button
            type="button"
            onClick={onFavorite}
            className={`p-0.5 text-[#686e80] hover:text-amber-400 transition-colors ${
              isFavorite ? 'text-amber-400' : ''
            }`}
          >
            <Star size={12} fill={isFavorite ? 'currentColor' : 'none'} />
          </button>
        </div>
        <p className={`text-[10px] ${isDark ? 'text-[#8b92a5]' : 'text-[#64748b]'} line-clamp-1 mt-0.5`}>
          {lang === 'ar' ? tool.descAr : tool.descEn}
        </p>
      </div>
    </div>
  );
}
