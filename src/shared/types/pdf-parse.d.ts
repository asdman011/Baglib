declare module 'pdf-parse' {
  export interface PdfTextItem { str: string; transform: number[]; width?: number; height?: number; hasEOL?: boolean; }
  export interface PdfTextContent { items: PdfTextItem[]; }
  export interface PdfParsePage {
    pageIndex: number; pageNumber?: number;
    getTextContent(options?: { normalizeWhitespace?: boolean; disableCombineTextItems?: boolean }): Promise<PdfTextContent>;
  }
  export interface PdfParseResult {
    numpages: number; numrender: number; text: string;
    info: { Title?: string; Author?: string; Publisher?: string; Edition?: string; Subject?: string; Keywords?: string; Creator?: string; Producer?: string; CreationDate?: string; ModDate?: string; [key: string]: unknown };
    metadata: { _metadata?: Record<string, string>; get(key: string): string | undefined; getAll(): Record<string, unknown> } | null;
    version: string;
  }
  export default function pdfParse(data: Buffer | Uint8Array, options?: { pagerender?: (page: PdfParsePage) => Promise<string>; max?: number; version?: string }): Promise<PdfParseResult>;
}
