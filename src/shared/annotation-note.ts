import { annotationPage } from './annotation-location';
import { bookStudyTarget, studyLinkText } from './study-notes';

export interface AnnotationNoteSource { id: string; bookId: string; type: string; locationCfiOrPage: string; selectedText?: string | null; noteContent?: string | null; createdAt: string }

// Text the reader stores on its own when a highlight or quote is saved; it adds nothing to a study note.
const generated = [/^Highlight on Page \d+$/u, /^(?:Selected Quote|الاقتباس المحدد): "/u];

/**
 * A Markdown study note from a book's annotations, in page order (Zotero's "Add Note from Annotations").
 * Each quote is followed by a link back to its page, so the note opens the PDF where it was taken.
 */
export function annotationsToNote(annotations: AnnotationNoteSource[], book: { id: string; title: string; sourceId?: string }): string {
  const usable = annotations.filter(item => item.type !== 'ink' && (item.selectedText?.trim() || item.noteContent?.trim() || item.type === 'bookmark'));
  const sorted = [...usable].sort((a, b) => (annotationPage(a.locationCfiOrPage) ?? Number.MAX_SAFE_INTEGER) - (annotationPage(b.locationCfiOrPage) ?? Number.MAX_SAFE_INTEGER) || a.createdAt.localeCompare(b.createdAt));
  const blocks = sorted.map(item => {
    const page = annotationPage(item.locationCfiOrPage);
    const link = studyLinkText(bookStudyTarget(book, page ?? undefined), page ? `${book.title} (${page})` : book.title);
    const parts: string[] = [];
    const quote = item.selectedText?.trim();
    // The page link ends the quote's last line; a line right after `>` would join the quote in Markdown.
    parts.push(quote ? `${quote.split(/\r?\n/u).map(line => `> ${line}`).join('\n')} ${link}` : link);
    const note = item.noteContent?.trim();
    if (note && !generated.some(pattern => pattern.test(note))) parts.push(note);
    return parts.join('\n\n');
  });
  return [`## ${book.title}`, ...blocks].join('\n\n');
}
