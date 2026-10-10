/**
 * Baglib — Client-Side PDF Page Rendering Engine
 *
 * Renders actual visual pages of a PDF document (fonts, typography, layouts,
 * vector graphics, backgrounds, and images) to crisp JPEG cover thumbnails.
 *
 * Replaces stream/embedded-image scanning with authentic full-page rasterization,
 * providing true 1-to-N page navigation (Page 1 = book cover, Page 2, Page 3...).
 */

export interface RenderPdfPageResult {
  success: boolean;
  coverUrl?: string;
  currentPage: number;
  totalPages: number;
  error?: string;
}

// Memory cache for rendered pages to provide instantaneous next/prev flipping
const renderedPageCache = new Map<string, { dataUrl: string; totalPages: number }>();

/**
 * Dynamically loads and initializes Mozilla PDF.js from the local application assets.
 */
async function ensurePdfJs(): Promise<any> {
  if (typeof window === 'undefined') return null;
  const win = window as any;

  // 1. Check if already present on window
  if (win.pdfjsDistBuildPdf?.PDFJS) return win.pdfjsDistBuildPdf.PDFJS;
  if (win.pdfjsDistBuildPdf?.getDocument) return win.pdfjsDistBuildPdf;
  if (win.PDFJS) return win.PDFJS;

  // 2. Inject static script tag pointing to /vendor/pdfjs/pdf.js if not already added
  const existingScript = document.getElementById('baglib-pdfjs-script') as HTMLScriptElement | null;
  if (!existingScript) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.id = 'baglib-pdfjs-script';
      script.src = '/vendor/pdfjs/pdf.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load /vendor/pdfjs/pdf.js'));
      document.head.appendChild(script);
    });
  }

  // 3. Poll briefly for global registration
  let attempts = 0;
  while (attempts < 30) {
    if (win.pdfjsDistBuildPdf?.PDFJS) return win.pdfjsDistBuildPdf.PDFJS;
    if (win.pdfjsDistBuildPdf?.getDocument) return win.pdfjsDistBuildPdf;
    if (win.PDFJS) return win.PDFJS;
    await new Promise((r) => setTimeout(r, 50));
    attempts++;
  }

  const resolved = win.pdfjsDistBuildPdf?.PDFJS || win.pdfjsDistBuildPdf || win.PDFJS;
  if (!resolved) {
    throw new Error('PDF.js engine could not be initialized.');
  }

  // Disable web worker to run directly and synchronously in main window thread
  if (resolved.PDFJS) {
    resolved.PDFJS.disableWorker = true;
  }
  resolved.disableWorker = true;
  return resolved;
}

/**
 * Renders an exact visual page of a local PDF file into a base64 JPEG data URL.
 *
 * @param filePath Local absolute path of the PDF file
 * @param pageNumber 1-based page index (e.g. 1 for first page/cover, 2, 3...)
 * @param customTargetWidth Optional custom render width (defaults to 750px for high-res book covers)
 */
export async function renderPdfPage(
  filePath: string,
  pageNumber: number = 1,
  customTargetWidth: number = 750
): Promise<RenderPdfPageResult> {
  if (!filePath) {
    return { success: false, currentPage: 1, totalPages: 0, error: 'NO_FILE_PATH' };
  }

  const cacheKey = `${filePath}::p${pageNumber}::w${customTargetWidth}`;
  const cached = renderedPageCache.get(cacheKey);
  if (cached) {
    return {
      success: true,
      coverUrl: cached.dataUrl,
      currentPage: pageNumber,
      totalPages: cached.totalPages,
    };
  }

  try {
    const windowAPI = (window as any).electronAPI;
    if (!windowAPI?.readPdfBase64) {
      return { success: false, currentPage: 1, totalPages: 0, error: 'IPC_NOT_AVAILABLE' };
    }

    // 1. Fetch raw PDF base64 stream from main process
    const base64Data: string | null = await windowAPI.readPdfBase64(filePath);
    if (!base64Data || base64Data.length < 50) {
      return { success: false, currentPage: 1, totalPages: 0, error: 'EMPTY_FILE_BUFFER' };
    }

    // 2. Convert base64 to Uint8Array
    const binary = atob(base64Data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    // 3. Initialize PDF.js
    const pdfjs = await ensurePdfJs();
    if (!pdfjs) {
      return { success: false, currentPage: 1, totalPages: 0, error: 'PDFJS_UNAVAILABLE' };
    }

    // 4. Load the PDF document
    const loadingTask = pdfjs.getDocument({ data: bytes });
    const pdfDoc = await (loadingTask.promise || loadingTask);
    const totalPages = pdfDoc.numPages || 1;

    // 5. Clamp target page within valid document range [1, totalPages]
    const targetPage = Math.max(1, Math.min(pageNumber, totalPages));

    // 6. Retrieve the specific page
    const page = await pdfDoc.getPage(targetPage);

    // 7. Calculate crisp rendering scale
    const baseViewport = page.getViewport(1.0);
    const scale = Math.max(0.8, Math.min(2.5, customTargetWidth / baseViewport.width));
    const viewport = page.getViewport(scale);

    // 8. Create offscreen canvas with white background
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D context creation failed.');
    }

    // White backdrop to ensure transparent pages render with clean paper color
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 9. Render page vector elements, typography, and imagery
    const renderContext = {
      canvasContext: ctx,
      viewport: viewport,
    };

    const renderTask = page.render(renderContext);
    await (renderTask.promise || renderTask);

    // 10. Generate high-quality JPEG cover image
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);

    // Memory cleanup
    canvas.width = 0;
    canvas.height = 0;
    if (page.cleanup) page.cleanup();
    if (pdfDoc.cleanup) pdfDoc.cleanup();

    // Cache the page render
    renderedPageCache.set(cacheKey, { dataUrl, totalPages });

    return {
      success: true,
      coverUrl: dataUrl,
      currentPage: targetPage,
      totalPages: totalPages,
    };
  } catch (err: any) {
    console.error('[pdf-page-renderer] Rendering failed:', err);
    return {
      success: false,
      currentPage: pageNumber,
      totalPages: 0,
      error: err?.message || 'RENDER_FAILED',
    };
  }
}

/**
 * Clears the memory cache of rendered PDF pages.
 */
export function clearPdfPageCache(): void {
  renderedPageCache.clear();
}

if (typeof window !== 'undefined') {
  (window as any).renderPdfPage = renderPdfPage;
}
