export interface PdfAccessibilityReadingOrderItem {
  order: number;
  page: number;
  tag: string;
  text?: string;
  alt?: string;
  rect?: number[];
  estimated: boolean;
}

export interface PdfAccessibilityFigureDetail {
  page: number;
  name?: string;
  tag?: string;
  missingAlt: boolean;
}

export interface PdfAccessibilityBaseReport {
  engine: string;
  filename: string;
  fileSize: number;
  sha256: string;
  isTagged: boolean;
  hasMarked: boolean;
  hasStructTree: boolean;
  language: string | null;
  hasLanguage: boolean;
  title: string | null;
  hasTitle: boolean;
  displayDocTitle: boolean;
  figuresCount: number;
  figuresWithoutAlt: number;
  figuresWithoutAltDetails: PdfAccessibilityFigureDetail[];
  totalPages: number;
  pagesWithoutText: number[];
  fontsWithoutToUnicode: string[];
  allFontsCount: number;
  readingOrder: PdfAccessibilityReadingOrderItem[];
  pageTexts?: Record<string, string>;
  pageHasUnmapped?: Record<string, boolean>;
}

export interface VeraPdfRuleSummary {
  clause: string;
  description: string;
  failedChecks: number;
  errorMessage?: string;
}

export interface VeraPdfUaReport {
  compliant: boolean;
  passedRules: number;
  failedRules: number;
  passedChecks: number;
  failedChecks: number;
  ruleSummaries: VeraPdfRuleSummary[];
}

export interface PdfAccessibilityReport {
  base: PdfAccessibilityBaseReport;
  veraPdfAvailable: boolean;
  veraPdfReport?: VeraPdfUaReport | null;
}

export interface PdfAccessibilityFixRequest {
  path: string;
  language?: string;
  title?: string;
}

export interface PdfAccessibilityFixResult {
  output: string;
  stagedPath?: string;
  format: 'pdf';
  sha256: string;
  bytes: number;
}

export interface PdfPageTextExtractionResult {
  engine: string;
  filename: string;
  fileSize: number;
  sha256: string;
  totalPages: number;
  pageTexts: Record<string, string>;
  pageHasUnmapped: Record<string, boolean>;
  pagesWithoutText: number[];
  fontsWithoutToUnicode: string[];
  allFontsCount: number;
}
