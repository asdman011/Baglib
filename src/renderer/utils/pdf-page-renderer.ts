export interface RenderPdfPageResult {
  success: boolean;
  coverUrl?: string;
  currentPage: number;
  totalPages: number;
  error?: string;
}

export async function renderPdfPage(filePath: string, pageNumber = 1): Promise<RenderPdfPageResult> {
  if (!filePath || typeof window === 'undefined' || !window.electronAPI?.extractPdfCover) return { success: false, currentPage: 1, totalPages: 0, error: 'PDF_RENDERER_UNAVAILABLE' };
  try {
    const result = await window.electronAPI.extractPdfCover(filePath, pageNumber);
    return { ...result, currentPage: result.currentPage || pageNumber, totalPages: result.totalPages || 0 };
  } catch {
    return { success: false, currentPage: pageNumber, totalPages: 0, error: 'PDF_RENDER_FAILED' };
  }
}

export async function renderPdfCoverChoices(filePath: string): Promise<RenderPdfPageResult[]> {
  if (!filePath || typeof window === 'undefined' || !window.electronAPI?.extractPdfCoverPages) return [];
  const result = await window.electronAPI.extractPdfCoverPages(filePath);
  if (!result.success) return [];
  return result.pages.map((page: Omit<RenderPdfPageResult, 'success'>) => ({ ...page, success: true }));
}
