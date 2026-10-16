/**
 * Baglib — Annotation & Notes Multi-Format Exporter Engine (KEY-138)
 *
 * Implements Koodo Reader's multi-book packaging pattern & Readest PKM adapters:
 * - Academic Markdown with YAML frontmatter
 * - Obsidian Vault format with [[wikilinks]] & [!quote] callouts
 * - RFC 4180 CSV
 * - Responsive Printable HTML (with PDF print support)
 * - Plain Text
 * - Anki flashcard deck (TSV + AnkiConnect payloads)
 * - Multi-book ZIP compression via fflate
 */

import * as fflate from 'fflate';
import type { AnnotationDTO } from '../../../shared/types/annotation';
import type {
  BookBibliographicInfo,
  BookWithAnnotations,
  ExportFormat,
  ExportOptions,
  ExportResult,
  AnkiCardData,
} from '../../../shared/types/export';

/**
 * Sanitizes book titles into safe filenames across Windows, macOS, and Linux
 */
export function sanitizeFilename(title: string, maxLength = 80): string {
  const clean = title
    .replace(/[\\/*?:"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.slice(0, maxLength) || 'book_annotations';
}

/**
 * Generates bibliographic YAML frontmatter
 */
export function generateYamlFrontmatter(book: BookBibliographicInfo, annotationsCount: number): string {
  const title = (book.title || 'Untitled').replace(/"/g, '\\"');
  const author = (book.author || 'Unknown').replace(/"/g, '\\"');
  const now = new Date().toISOString();

  let yaml = `---\n`;
  yaml += `title: "${title}"\n`;
  yaml += `author: "${author}"\n`;
  if (book.isbn) yaml += `isbn: "${book.isbn}"\n`;
  if (book.publishedYear) yaml += `published_year: ${book.publishedYear}\n`;
  if (book.format) yaml += `format: "${book.format}"\n`;
  yaml += `exported_at: "${now}"\n`;
  yaml += `system: "Baglib Library"\n`;
  yaml += `total_annotations: ${annotationsCount}\n`;
  yaml += `tags:\n  - baglib\n  - reading-notes\n`;
  yaml += `---\n\n`;
  return yaml;
}

/**
 * Exports annotations to Academic Markdown
 */
export function formatAsMarkdown(
  book: BookBibliographicInfo,
  annotations: AnnotationDTO[],
  options?: ExportOptions
): string {
  const includeFrontmatter = options?.includeFrontmatter !== false;
  const includeBookmarks = options?.includeBookmarks !== false;

  let md = '';
  if (includeFrontmatter) {
    md += generateYamlFrontmatter(book, annotations.length);
  }

  md += `# ${book.title}\n`;
  if (book.author) md += `**Author:** ${book.author}  \n`;
  if (book.isbn) md += `**ISBN:** \`${book.isbn}\`  \n`;
  md += `*Exported on ${new Date().toLocaleDateString()} via Baglib*\n\n---\n\n`;

  const sorted = [...annotations].sort((a, b) => {
    const pA = parseInt(a.locationCfiOrPage, 10) || 0;
    const pB = parseInt(b.locationCfiOrPage, 10) || 0;
    return pA - pB;
  });

  for (const a of sorted) {
    if (a.type === 'bookmark' && !includeBookmarks) continue;

    const page = a.locationCfiOrPage || '1';
    const typeLabel = a.type.toUpperCase();

    md += `### [Page ${page}] ${typeLabel}\n`;
    if (a.color && a.type !== 'bookmark') {
      md += `*Color: ${a.color}*\n\n`;
    }

    if (a.selectedText) {
      md += `> ${a.selectedText}\n\n`;
    }

    if (a.noteContent) {
      md += `${a.noteContent}\n\n`;
    }

    if (a.type === 'ink' && a.strokeData) {
      md += `*✍️ Freehand Ink Drawing (${a.strokeData.length} stroke points)*\n\n`;
    }

    if (options?.includeTags && a.tags && a.tags.length > 0) {
      md += `**Tags:** ${a.tags.map((t) => `#${t}`).join(' ')}\n\n`;
    }

    md += `---\n\n`;
  }

  return md;
}

/**
 * Exports annotations to Obsidian Vault Markdown (with callouts and wikilinks)
 */
export function formatAsObsidian(
  book: BookBibliographicInfo,
  annotations: AnnotationDTO[],
  options?: ExportOptions
): string {
  const includeBookmarks = options?.includeBookmarks !== false;

  let md = `---\n`;
  md += `title: "${(book.title || 'Untitled').replace(/"/g, '\\"')}"\n`;
  md += `author: "[[${(book.author || 'Unknown').replace(/"/g, '\\"')}]]"\n`;
  if (book.isbn) md += `isbn: "${book.isbn}"\n`;
  md += `type: book-notes\n`;
  md += `tags:\n  - baglib/notes\n  - literature\n`;
  md += `---\n\n`;

  md += `# [[${book.title}]]\n\n`;
  if (book.author) md += `Author: [[${book.author}]]\n\n`;

  const sorted = [...annotations].sort((a, b) => {
    const pA = parseInt(a.locationCfiOrPage, 10) || 0;
    const pB = parseInt(b.locationCfiOrPage, 10) || 0;
    return pA - pB;
  });

  for (const a of sorted) {
    if (a.type === 'bookmark' && !includeBookmarks) continue;

    const page = a.locationCfiOrPage || '1';

    if (a.type === 'highlight' || a.type === 'underline') {
      md += `> [!quote] Page ${page}${a.color ? ` (${a.color})` : ''}\n`;
      md += `> ${a.selectedText || ''}\n\n`;
      if (a.noteContent) {
        md += `**Commentary:** ${a.noteContent}\n\n`;
      }
    } else if (a.type === 'note') {
      md += `> [!note] Page ${page} Note\n`;
      if (a.selectedText) md += `> Quote: *"${a.selectedText}"*\n>\n`;
      md += `> ${a.noteContent || ''}\n\n`;
    } else if (a.type === 'bookmark') {
      md += `> [!bookmark] Page ${page}\n`;
      if (a.noteContent) md += `> ${a.noteContent}\n\n`;
    } else if (a.type === 'ink' && a.strokeData) {
      md += `> [!pencil] Page ${page} Ink Drawing\n`;
      md += `> *${a.strokeData.length} vector ink strokes recorded in Baglib*\n\n`;
    }

    if (options?.includeTags && a.tags && a.tags.length > 0) {
      md += `${a.tags.map((t) => `#${t}`).join(' ')}\n\n`;
    }
  }

  return md;
}

/**
 * Helper to escape CSV values according to RFC 4180
 */
function escapeCsv(val: any): string {
  if (val == null) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Exports annotations to RFC 4180 CSV
 */
export function formatAsCSV(
  book: BookBibliographicInfo,
  annotations: AnnotationDTO[],
  options?: ExportOptions
): string {
  const includeBookmarks = options?.includeBookmarks !== false;
  const headers = [
    'ID',
    'Book Title',
    'Author',
    'ISBN',
    'Page',
    'Type',
    'Color',
    'Selected Text',
    'Note Content',
    'Tags',
    'Created At',
  ];

  let csv = '\uFEFF'; // Add UTF-8 BOM for Excel compatibility with Arabic & special characters
  csv += headers.map(escapeCsv).join(',') + '\r\n';

  for (const a of annotations) {
    if (a.type === 'bookmark' && !includeBookmarks) continue;
    const row = [
      a.id,
      book.title,
      book.author || '',
      book.isbn || '',
      a.locationCfiOrPage,
      a.type,
      a.color || '',
      a.selectedText || '',
      a.noteContent || '',
      (a.tags || []).join('; '),
      a.createdAt,
    ];
    csv += row.map(escapeCsv).join(',') + '\r\n';
  }

  return csv;
}

/**
 * Exports annotations to clean, printable HTML document
 */
export function formatAsHTML(
  book: BookBibliographicInfo,
  annotations: AnnotationDTO[],
  options?: { direction?: 'rtl' | 'ltr' }
): string {
  const dir = options?.direction || (/[\u0600-\u06FF]/.test(book.title) ? 'rtl' : 'ltr');

  let html = `<!DOCTYPE html>
<html lang="${dir === 'rtl' ? 'ar' : 'en'}" dir="${dir}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(book.title)} - Annotations</title>
  <style>
    :root {
      --bg: #ffffff;
      --card-bg: #f8fafc;
      --text: #0f172a;
      --muted: #64748b;
      --border: #e2e8f0;
      --accent: #0284c7;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #090d16;
        --card-bg: #131c2e;
        --text: #f1f5f9;
        --muted: #94a3b8;
        --border: #1e293b;
        --accent: #38bdf8;
      }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Amiri", serif;
      background: var(--bg);
      color: var(--text);
      max-width: 800px;
      margin: 0 auto;
      padding: 32px 20px;
      line-height: 1.6;
    }
    header {
      border-bottom: 2px solid var(--border);
      padding-bottom: 20px;
      margin-bottom: 32px;
    }
    h1 { margin: 0 0 8px 0; font-size: 26px; }
    .meta { color: var(--muted); font-size: 14px; }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px 20px;
      margin-bottom: 20px;
      page-break-inside: avoid;
    }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: bold;
      text-transform: uppercase;
      background: var(--border);
    }
    blockquote {
      margin: 12px 0;
      padding: 8px 16px;
      border-inline-start: 4px solid var(--accent);
      background: rgba(2, 132, 199, 0.05);
      border-radius: 4px;
      font-style: italic;
    }
    .tags {
      margin-top: 10px;
      display: flex;
      gap: 6px;
    }
    .tag {
      font-size: 11px;
      color: var(--muted);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 1px 6px;
    }
    @media print {
      @page { margin: 20mm; }
      body { max-width: 100%; padding: 0; background: white; color: black; }
      .card { border-color: #ccc; background: white; break-inside: avoid; page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(book.title)}</h1>
    <div class="meta">
      ${book.author ? `<span><strong>Author:</strong> ${escapeHtml(book.author)}</span> | ` : ''}
      ${book.isbn ? `<span><strong>ISBN:</strong> ${escapeHtml(book.isbn)}</span> | ` : ''}
      <span><strong>Exported:</strong> ${new Date().toLocaleDateString()}</span>
    </div>
  </header>
  <main>
`;

  for (const a of annotations) {
    html += `    <div class="card">\n`;
    html += `      <div style="display:flex; justify-content:space-between; align-items:center;">\n`;
    html += `        <span class="badge">Page ${escapeHtml(a.locationCfiOrPage)} - ${escapeHtml(a.type)}</span>\n`;
    if (a.color) {
      html += `        <span style="font-size:12px; color:var(--muted);">${escapeHtml(a.color)}</span>\n`;
    }
    html += `      </div>\n`;

    if (a.selectedText) {
      html += `      <blockquote>"${escapeHtml(a.selectedText)}"</blockquote>\n`;
    }

    if (a.noteContent) {
      html += `      <p style="margin: 8px 0;">${escapeHtml(a.noteContent)}</p>\n`;
    }

    if (a.type === 'ink' && a.strokeData) {
      html += `      <p style="font-size: 12px; color: var(--muted);">✍️ Freehand Ink Drawing (${a.strokeData.length} strokes)</p>\n`;
    }

    if (a.tags && a.tags.length > 0) {
      html += `      <div class="tags">\n`;
      for (const t of a.tags) {
        html += `        <span class="tag">#${escapeHtml(t)}</span>\n`;
      }
      html += `      </div>\n`;
    }

    html += `    </div>\n`;
  }

  html += `  </main>
</body>
</html>`;
  return html;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Exports annotations to Plain Text
 */
export function formatAsPlainText(
  book: BookBibliographicInfo,
  annotations: AnnotationDTO[],
  options?: ExportOptions
): string {
  const includeBookmarks = options?.includeBookmarks !== false;
  let txt = `======================================================================\n`;
  txt += `${book.title}\n`;
  if (book.author) txt += `Author: ${book.author}\n`;
  if (book.isbn) txt += `ISBN: ${book.isbn}\n`;
  txt += `Exported: ${new Date().toLocaleDateString()} via Baglib\n`;
  txt += `Total Annotations: ${annotations.length}\n`;
  txt += `======================================================================\n\n`;

  for (const a of annotations) {
    if (a.type === 'bookmark' && !includeBookmarks) continue;
    txt += `[Page ${a.locationCfiOrPage}] [${a.type.toUpperCase()}]\n`;
    if (a.selectedText) {
      txt += `Quote: "${a.selectedText}"\n`;
    }
    if (a.noteContent) {
      txt += `Note: ${a.noteContent}\n`;
    }
    if (a.type === 'ink' && a.strokeData) {
      txt += `Ink Drawing: ${a.strokeData.length} vector strokes\n`;
    }
    if (a.tags && a.tags.length > 0) {
      txt += `Tags: ${a.tags.join(', ')}\n`;
    }
    txt += `----------------------------------------------------------------------\n`;
  }

  return txt;
}

/**
 * Generates Anki Flashcard Deck in TSV (Tab-Separated Values) format
 * Format: Front \t Back \t Tags
 */
export function formatAsAnkiTSV(
  book: BookBibliographicInfo,
  annotations: AnnotationDTO[],
  options?: ExportOptions
): string {
  let tsv = `#separator:tab\n#html:true\n#tags column:3\n`;

  for (const a of annotations) {
    if (!a.selectedText && !a.noteContent) continue;

    const termOrQuote = a.selectedText || 'Note';
    const commentaryOrDef = a.noteContent || '';
    const citation = `<i>${book.title} (Page ${a.locationCfiOrPage})</i>`;

    const front = `<b>${escapeHtml(termOrQuote)}</b>`;
    const back = `${escapeHtml(commentaryOrDef)}<br><br><small style="color:gray;">${citation}</small>`;
    const tags = ['baglib', 'reading', ...(a.tags || [])].join(' ');

    tsv += `${front.replace(/\t/g, ' ')}\t${back.replace(/\t/g, ' ')}\t${tags}\n`;
  }

  return tsv;
}

/**
 * Builds AnkiConnect API request payload (HTTP port 8765)
 */
export function buildAnkiConnectNotes(
  book: BookBibliographicInfo,
  annotations: AnnotationDTO[],
  deckName = 'Baglib Notes'
): AnkiCardData[] {
  const cards: AnkiCardData[] = [];

  for (const a of annotations) {
    if (!a.selectedText && !a.noteContent) continue;

    const termOrQuote = a.selectedText || 'Note';
    const commentary = a.noteContent || '';
    const citation = `${book.title}${book.author ? ` - ${book.author}` : ''} (p. ${a.locationCfiOrPage})`;

    cards.push({
      deckName,
      modelName: 'Basic',
      front: termOrQuote,
      back: `${commentary}\n\n[Source: ${citation}]`.trim(),
      tags: ['baglib', ...(a.tags || [])],
    });
  }

  return cards;
}

/**
 * Unified Exporter function handling single book export
 */
export function exportSingleBook(
  book: BookBibliographicInfo,
  annotations: AnnotationDTO[],
  options: ExportOptions
): ExportResult {
  const baseName = sanitizeFilename(book.title);

  switch (options.format) {
    case 'markdown':
      return {
        format: 'markdown',
        fileName: `${baseName}_annotations.md`,
        mimeType: 'text/markdown;charset=utf-8',
        content: formatAsMarkdown(book, annotations, options),
        isBinary: false,
        itemCount: annotations.length,
      };

    case 'obsidian':
      return {
        format: 'obsidian',
        fileName: `${baseName}.md`,
        mimeType: 'text/markdown;charset=utf-8',
        content: formatAsObsidian(book, annotations, options),
        isBinary: false,
        itemCount: annotations.length,
      };

    case 'csv':
      return {
        format: 'csv',
        fileName: `${baseName}_annotations.csv`,
        mimeType: 'text/csv;charset=utf-8',
        content: formatAsCSV(book, annotations),
        isBinary: false,
        itemCount: annotations.length,
      };

    case 'html':
    case 'pdf':
      return {
        format: options.format,
        fileName: `${baseName}_annotations.html`,
        mimeType: 'text/html;charset=utf-8',
        content: formatAsHTML(book, annotations, { direction: options.direction }),
        isBinary: false,
        itemCount: annotations.length,
      };

    case 'txt':
      return {
        format: 'txt',
        fileName: `${baseName}_annotations.txt`,
        mimeType: 'text/plain;charset=utf-8',
        content: formatAsPlainText(book, annotations),
        isBinary: false,
        itemCount: annotations.length,
      };

    case 'anki':
      return {
        format: 'anki',
        fileName: `${baseName}_anki_deck.txt`,
        mimeType: 'text/tab-separated-values;charset=utf-8',
        content: formatAsAnkiTSV(book, annotations),
        isBinary: false,
        itemCount: annotations.length,
      };

    case 'json':
      return {
        format: 'json',
        fileName: `${baseName}_annotations.json`,
        mimeType: 'application/json;charset=utf-8',
        content: JSON.stringify({ book, annotations }, null, 2),
        isBinary: false,
        itemCount: annotations.length,
      };

    default:
      return {
        format: 'markdown',
        fileName: `${baseName}_annotations.md`,
        mimeType: 'text/markdown;charset=utf-8',
        content: formatAsMarkdown(book, annotations, options),
        isBinary: false,
        itemCount: annotations.length,
      };
  }
}

/**
 * Packages multiple books into a compressed .ZIP archive (Koodo Reader Multi-Book Pattern)
 * Contains individual per-book files + aggregated "all" file
 */
export function packageMultiBookZip(
  booksWithAnnotations: BookWithAnnotations[],
  format: ExportFormat,
  options?: ExportOptions
): Uint8Array {
  const zipEntries: Record<string, Uint8Array> = {};

  const effectiveOptions: ExportOptions = options || { format };
  const ext =
    format === 'csv'
      ? 'csv'
      : format === 'html' || format === 'pdf'
      ? 'html'
      : format === 'txt' || format === 'anki'
      ? 'txt'
      : format === 'json'
      ? 'json'
      : 'md';

  let aggregatedText = '';
  let totalAnnotations = 0;

  for (const item of booksWithAnnotations) {
    if (!item.annotations || item.annotations.length === 0) continue;
    totalAnnotations += item.annotations.length;

    const exported = exportSingleBook(item.book, item.annotations, {
      ...effectiveOptions,
      format,
    });

    const fileContent = typeof exported.content === 'string' ? exported.content : '';
    const safeName = `${sanitizeFilename(item.book.title)}.${ext}`;
    zipEntries[safeName] = fflate.strToU8(fileContent);

    // Build aggregated content
    aggregatedText += fileContent + '\n\n' + '='.repeat(60) + '\n\n';
  }

  // Add aggregated combined file
  if (aggregatedText) {
    zipEntries[`all.${ext}`] = fflate.strToU8(aggregatedText);
  }

  // Add manifest
  const manifest = `Baglib — Exported Notes & Annotations Archive
Exported on: ${new Date().toISOString()}
Total Books: ${booksWithAnnotations.length}
Total Annotations: ${totalAnnotations}
Format: ${format}
`;
  zipEntries['README.txt'] = fflate.strToU8(manifest);

  return fflate.zipSync(zipEntries);
}
