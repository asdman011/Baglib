import { AnnotationMode, type PDFDocumentProxy, type PDFPageProxy } from 'pdfjs-dist';

/**
 * ADR-012: BagLib writes its marks into the PDF as annotations authored "BagLib". BagLib's own reader already draws
 * those marks from its database (where they are editable), so its renderers skip them; other viewers show them.
 * Annotations from anywhere else are drawn as before.
 */
export const BAGLIB_AUTHOR = 'BagLib';
const OWNED_SUBTYPES = new Set(['Highlight', 'Underline', 'StrikeOut', 'Square', 'Circle', 'Line', 'FreeText', 'Text']);

export async function renderWithoutOwned(document: PDFDocumentProxy, page: PDFPageProxy): Promise<{ annotationMode: number }> {
  try {
    const annotations = await page.getAnnotations({ intent: 'display' }) as { id: string; subtype: string; titleObj?: { str?: string } }[];
    let hidden = 0;
    for (const annotation of annotations) {
      if (annotation.titleObj?.str !== BAGLIB_AUTHOR || !OWNED_SUBTYPES.has(annotation.subtype)) continue;
      document.annotationStorage.setValue(annotation.id, { noView: true });
      hidden++;
    }
    return { annotationMode: hidden ? AnnotationMode.ENABLE_STORAGE : AnnotationMode.ENABLE };
  } catch { return { annotationMode: AnnotationMode.ENABLE }; }
}
