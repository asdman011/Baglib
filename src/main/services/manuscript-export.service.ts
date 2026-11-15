import { BrowserWindow } from 'electron';
import type { Database } from 'better-sqlite3';
import {
  AlignmentType,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  Packer,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableBorders,
  TableRow,
  TextRun,
  WidthType,
  FootnoteReferenceRun,
  type ParagraphChild
} from 'docx';
import { ManuscriptRepository } from '../database/repositories/manuscript.repository';
import type { ResearchEditorAssets } from '../../shared/research-editor';
import {
  type ManuscriptExportFormat,
  type ManuscriptExportOptions,
  type ManuscriptExportResult,
  exportMimeType,
  manuscriptExportFilename
} from '../../shared/manuscript-export';
import type { Manuscript, ManuscriptDocument } from '../../shared/manuscripts';
import { parseManuscriptSnapshot } from '../../shared/manuscript-snapshot';
import {
  deriveApparatus,
  readableCitation,
  researchSettings,
  type ApparatusBlock,
  type CitationEntry
} from '../../shared/research-editor-apparatus';

const ARABIC_REGEX = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/u;
const LATIN_FONT = 'Calibri';
const ARABIC_FONT = 'Traditional Arabic';
const QURAN_FONT = 'Amiri';

interface ParsedSnapshotBlock {
  id: string;
  flavour: string;
  props: Record<string, unknown>;
  children: ParsedSnapshotBlock[];
}

interface DocFootnote {
  id: number;
  label: string;
  text: string;
  url: string;
}

function isArabicText(text: string): boolean {
  const match = /\p{L}/u.exec(text);
  return match ? ARABIC_REGEX.test(match[0]) : true;
}

/** Extract dimensions from PNG/JPEG buffer for docx ImageRun. */
function getImageDimensions(buf: Buffer): { width: number; height: number } {
  try {
    // PNG header check
    if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      const width = buf.readUInt32BE(16);
      const height = buf.readUInt32BE(20);
      const maxW = 500;
      if (width > 0 && height > 0) {
        const scaledW = Math.min(width, maxW);
        const scaledH = Math.round((height * scaledW) / width);
        return { width: scaledW, height: scaledH };
      }
    }
  } catch {}
  return { width: 450, height: 300 };
}

/** Extract blocks from note child of snapshot. */
function extractNoteBlocks(snapshotJson: string): { blocks: ParsedSnapshotBlock[]; title: string; apparatus: ReturnType<typeof deriveApparatus> } {
  const root = parseManuscriptSnapshot(snapshotJson) as unknown as { blocks: ParsedSnapshotBlock };
  let title = '';
  const noteChildren: ParsedSnapshotBlock[] = [];

  const visit = (block: ParsedSnapshotBlock) => {
    if (!block) return;
    if (block.flavour === 'affine:page' && block.props?.title) {
      const t = block.props.title as { delta?: { insert: string }[] } | string;
      title = typeof t === 'string' ? t : (t?.delta?.map(d => d.insert).join('') || '');
    }
    if (block.flavour === 'affine:note' && Array.isArray(block.children)) {
      noteChildren.push(...block.children);
    } else if (Array.isArray(block.children)) {
      block.children.forEach(visit);
    }
  };

  visit(root.blocks);
  const apparatus = deriveApparatus(root.blocks as unknown as ApparatusBlock, researchSettings({}));
  return { blocks: noteChildren, title, apparatus };
}

export class ManuscriptExportService {
  constructor(private db: Database, private assets: ResearchEditorAssets) {}

  async export(options: ManuscriptExportOptions): Promise<ManuscriptExportResult> {
    const repo = new ManuscriptRepository(this.db);
    const manuscript = repo.list().find(m => m.id === options.manuscriptId);
    if (!manuscript) throw new Error('manuscript-not-found');

    let docs: ManuscriptDocument[] = [];
    if (options.documentId) {
      docs = [repo.document(options.documentId)];
    } else {
      docs = repo.documents(options.manuscriptId, false);
      if (!docs.length) {
        throw new Error('no-documents-to-export');
      }
    }

    const title = options.documentId && docs[0] ? docs[0].title : manuscript.title;
    const filename = manuscriptExportFilename(title, options.format);
    const mimeType = exportMimeType(options.format);

    switch (options.format) {
      case 'markdown': {
        const content = this.generateMarkdown(manuscript, docs);
        return { format: 'markdown', filename, mimeType, content };
      }
      case 'html': {
        const content = await this.generateHtml(manuscript, docs);
        return { format: 'html', filename, mimeType, content };
      }
      case 'pdf': {
        const base64 = await this.generatePdf(manuscript, docs, options);
        return { format: 'pdf', filename, mimeType, base64 };
      }
      case 'docx': {
        const base64 = await this.generateDocx(manuscript, docs, options);
        return { format: 'docx', filename, mimeType, base64 };
      }
    }
  }

  // ---------------------------------------------------------------------------
  // MARKDOWN EXPORT
  // ---------------------------------------------------------------------------
  generateMarkdown(manuscript: Manuscript, docs: ManuscriptDocument[]): string {
    const out: string[] = [];

    docs.forEach((doc, docIndex) => {
      if (docIndex > 0) out.push('\n---\n');
      const { blocks, title, apparatus } = extractNoteBlocks(doc.snapshot);
      const docTitle = doc.title || title || `Chapter ${docIndex + 1}`;
      out.push(`# ${docTitle}\n`);

      const footnotes: string[] = [];
      const footnoteMap = new Map<string, number>();

      apparatus.citations.forEach(c => {
        if (c.number !== null) {
          footnoteMap.set(c.key, c.number);
          footnotes.push(`[^${c.number}]: ${readableCitation(c.note)}`);
        }
      });

      for (const block of blocks) {
        const md = this.blockToMarkdown(block, footnoteMap);
        if (md) out.push(md);
      }

      if (footnotes.length > 0) {
        out.push('\n### الهوامش والمراجع (Footnotes)\n');
        out.push(footnotes.join('\n\n'));
      }
    });

    return out.join('\n');
  }

  private blockToMarkdown(block: ParsedSnapshotBlock, footnoteMap: Map<string, number>): string {
    const flavour = block.flavour;
    const props = block.props || {};

    if (flavour === 'affine:paragraph') {
      const type = String(props.type || 'text');
      const deltas = (props.text as { delta?: { insert: string; attributes?: { footnote?: { label: string } } }[] })?.delta || [];
      let text = '';
      let offset = 0;

      for (const d of deltas) {
        let piece = d.insert || '';
        if (d.attributes?.footnote) {
          const key = block.id + ':' + offset;
          const num = footnoteMap.get(key);
          piece += `[^${num || d.attributes.footnote.label || 1}]`;
        }
        text += piece;
        offset += d.insert?.length || 0;
      }

      if (!text.trim()) return '';

      if (type === 'h1') return `## ${text}\n`;
      if (type === 'h2') return `### ${text}\n`;
      if (type === 'h3') return `#### ${text}\n`;
      if (type === 'quote') return `> ${text}\n`;
      return `${text}\n`;
    }

    if (flavour === 'affine:list') {
      const type = String(props.type || 'bulleted');
      const text = (props.text as { delta?: { insert: string }[] })?.delta?.map(d => d.insert).join('') || '';
      return type === 'numbered' ? `1. ${text}` : `- ${text}`;
    }

    if (flavour === 'baglib:ayah') {
      const text = String(props.text || '');
      const label = String(props.label || 'القرآن الكريم');
      const url = String(props.url || '');
      return `> ﴿ ${text} ﴾\n> [${label}](${url})\n`;
    }

    if (flavour === 'baglib:hadith') {
      const text = String(props.text || '');
      const label = String(props.label || 'الحديث الشريف');
      const url = String(props.url || '');
      const grade = props.grade ? ` · ${props.grade}` : '';
      return `> ${text}\n> [${label}](${url})${grade}\n`;
    }

    if (flavour === 'baglib:verse') {
      const verses = (props.verses as { sadr: string; ajuz: string }[]) || [];
      const label = String(props.label || '');
      const url = String(props.url || '');
      const lines = verses.map(v => `${v.sadr}  ***  ${v.ajuz}`);
      return `${lines.join('\n')}\n[${label}](${url})\n`;
    }

    if (flavour === 'baglib:book-quote') {
      const text = String(props.text || '');
      const label = String(props.label || '');
      const url = String(props.url || '');
      return `> ${text}\n> [${label}](${url})\n`;
    }

    if (flavour === 'affine:image') {
      const caption = props.caption ? String(props.caption) : 'Image';
      const sourceId = props.sourceId || props.blobId || 'image';
      return `![${caption}](app://-/research-blob/${sourceId})\n`;
    }

    return '';
  }

  // ---------------------------------------------------------------------------
  // HTML EXPORT
  // ---------------------------------------------------------------------------
  async generateHtml(manuscript: Manuscript, docs: ManuscriptDocument[]): Promise<string> {
    const isAr = docs.some(d => isArabicText(d.title || d.plain_text));
    const dir = isAr ? 'rtl' : 'ltr';
    const lang = isAr ? 'ar' : 'en';

    const sectionsHtml: string[] = [];

    for (let docIndex = 0; docIndex < docs.length; docIndex++) {
      const doc = docs[docIndex];
      const { blocks, title, apparatus } = extractNoteBlocks(doc.snapshot);
      const docTitle = doc.title || title || `Chapter ${docIndex + 1}`;

      const footnoteMap = new Map<string, number>();
      const footnotesList: { num: number; label: string; text: string; url: string }[] = [];

      apparatus.citations.forEach(c => {
        if (c.number !== null) {
          footnoteMap.set(c.key, c.number);
          footnotesList.push({
            num: c.number,
            label: c.note.label,
            text: readableCitation(c.note),
            url: c.note.reference.url || '#'
          });
        }
      });

      const bodyHtmlParts: string[] = [];

      for (const block of blocks) {
        const part = await this.blockToHtml(block, footnoteMap);
        if (part) bodyHtmlParts.push(part);
      }

      let footnotesHtml = '';
      if (footnotesList.length > 0) {
        const items = footnotesList
          .map(fn => `<li id="doc-${docIndex}-fn-${fn.num}"><a href="${fn.url}">${fn.text}</a> <a href="#doc-${docIndex}-fnref-${fn.num}" class="backref">↩</a></li>`)
          .join('\n');
        footnotesHtml = `
          <footer class="chapter-footnotes">
            <hr />
            <h3>${isAr ? 'الهوامش والمراجع' : 'Footnotes & References'}</h3>
            <ol>${items}</ol>
          </footer>
        `;
      }

      sectionsHtml.push(`
        <article class="manuscript-chapter" id="chapter-${docIndex + 1}">
          <header class="chapter-header">
            <h2>${docTitle}</h2>
          </header>
          <div class="chapter-body">
            ${bodyHtmlParts.join('\n')}
          </div>
          ${footnotesHtml}
        </article>
      `);
    }

    return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${manuscript.title}</title>
  <style>
    :root {
      --font-body: 'Traditional Arabic', 'Amiri', 'Noto Naskh Arabic', 'Calibri', system-ui, -apple-system, sans-serif;
      --font-quran: 'Amiri', 'Traditional Arabic', serif;
      --font-latin: 'Calibri', 'Segoe UI', system-ui, sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      font-family: var(--font-body);
      font-size: 18px;
      line-height: 1.85;
      color: #1f2937;
      background-color: #ffffff;
      margin: 0;
      padding: 2.5rem 3rem;
      text-rendering: optimizeLegibility;
      direction: ${dir};
    }
    .manuscript-title-page {
      text-align: center;
      padding-block: 2rem 3rem;
      border-bottom: 2px solid #e5e7eb;
      margin-bottom: 3rem;
    }
    .manuscript-title-page h1 {
      font-size: 2.5rem;
      margin-bottom: 0.5rem;
      color: #111827;
    }
    .manuscript-chapter {
      margin-bottom: 4rem;
      page-break-after: always;
    }
    .chapter-header h2 {
      font-size: 1.85rem;
      margin-top: 1rem;
      margin-bottom: 1.5rem;
      color: #1f2937;
      border-bottom: 1px solid #f3f4f6;
      padding-bottom: 0.5rem;
    }
    p { margin-block: 0.75rem; text-align: justify; }
    h3 { font-size: 1.4rem; margin-top: 1.5rem; margin-bottom: 0.5rem; }
    h4 { font-size: 1.15rem; margin-top: 1.25rem; margin-bottom: 0.5rem; }
    blockquote {
      margin: 1.25rem 0;
      padding-inline: 1.25rem;
      padding-block: 0.5rem;
      border-inline-start: 4px solid #d1d5db;
      background-color: #f9fafb;
      border-radius: 4px;
    }
    .baglib-ayah {
      font-family: var(--font-quran);
      font-size: 1.25rem;
      line-height: 2.2;
      border-inline-start-color: #10b981;
      background-color: #ecfdf5;
      color: #064e3b;
    }
    .baglib-ayah .source-link, .baglib-hadith .source-link, .baglib-verse .source-link {
      display: block;
      margin-top: 0.5rem;
      font-size: 0.9rem;
      color: #047857;
      text-decoration: none;
    }
    .baglib-hadith {
      border-inline-start-color: #3b82f6;
      background-color: #eff6ff;
      color: #1e3a8a;
    }
    .baglib-hadith .source-link { color: #1d4ed8; }
    .baglib-poetry-table {
      width: 100%;
      table-layout: fixed;
      border-collapse: collapse;
      margin-block: 1.5rem;
      background-color: #fafaf9;
      border-radius: 6px;
      padding: 0.5rem;
    }
    .baglib-poetry-table td {
      padding: 0.6rem 1rem;
      vertical-align: middle;
      border: none;
    }
    .baglib-poetry-table .sadr {
      text-align: right;
      width: 50%;
      font-weight: 500;
    }
    .baglib-poetry-table .ajuz {
      text-align: left;
      width: 50%;
      font-weight: 500;
    }
    .baglib-image {
      margin-block: 1.5rem;
      text-align: center;
    }
    .baglib-image img {
      max-width: 100%;
      height: auto;
      border-radius: 6px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .baglib-image figcaption {
      margin-top: 0.5rem;
      font-size: 0.85rem;
      color: #6b7280;
    }
    sup.footnote-ref a {
      color: #2563eb;
      text-decoration: none;
      font-weight: bold;
      padding-inline: 2px;
    }
    .chapter-footnotes {
      margin-top: 3rem;
      padding-top: 1rem;
      font-size: 0.9rem;
      color: #4b5563;
    }
    .chapter-footnotes hr {
      border: none;
      border-top: 1px solid #e5e7eb;
      margin-bottom: 1rem;
    }
    .chapter-footnotes h3 {
      font-size: 1rem;
      margin-bottom: 0.75rem;
      color: #374151;
    }
    .chapter-footnotes ol {
      padding-inline-start: 1.5rem;
      margin: 0;
    }
    .chapter-footnotes li {
      margin-bottom: 0.5rem;
      line-height: 1.6;
    }
    .chapter-footnotes a {
      color: #1d4ed8;
      text-decoration: none;
    }
    .chapter-footnotes .backref {
      font-size: 0.8rem;
      margin-inline-start: 0.5rem;
      color: #9ca3af;
    }
    @media print {
      @page {
        size: A4;
        margin: 20mm;
      }
      body {
        padding: 0;
        background: transparent;
        font-size: 15pt;
      }
      .manuscript-chapter {
        page-break-after: always;
      }
    }
  </style>
</head>
<body>
  <div class="manuscript-title-page">
    <h1>${manuscript.title}</h1>
  </div>
  ${sectionsHtml.join('\n')}
</body>
</html>`;
  }

  private async blockToHtml(block: ParsedSnapshotBlock, footnoteMap: Map<string, number>): Promise<string> {
    const flavour = block.flavour;
    const props = block.props || {};

    if (flavour === 'affine:paragraph') {
      const type = String(props.type || 'text');
      const deltas = (props.text as { delta?: { insert: string; attributes?: { bold?: boolean; italic?: boolean; footnote?: { label: string } } }[] })?.delta || [];
      let innerHtml = '';
      let offset = 0;

      for (const d of deltas) {
        let piece = d.insert || '';
        piece = piece.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        if (d.attributes?.bold) piece = `<strong>${piece}</strong>`;
        if (d.attributes?.italic) piece = `<em>${piece}</em>`;
        if (d.attributes?.footnote) {
          const key = block.id + ':' + offset;
          const num = footnoteMap.get(key) || 1;
          piece += `<sup class="footnote-ref"><a href="#doc-0-fn-${num}" id="doc-0-fnref-${num}">[${num}]</a></sup>`;
        }
        innerHtml += piece;
        offset += d.insert?.length || 0;
      }

      if (!innerHtml.trim()) return '';
      if (type === 'h1') return `<h3>${innerHtml}</h3>`;
      if (type === 'h2') return `<h4>${innerHtml}</h4>`;
      if (type === 'h3') return `<h5>${innerHtml}</h5>`;
      if (type === 'quote') return `<blockquote><p>${innerHtml}</p></blockquote>`;
      return `<p>${innerHtml}</p>`;
    }

    if (flavour === 'affine:list') {
      const type = String(props.type || 'bulleted');
      const text = (props.text as { delta?: { insert: string }[] })?.delta?.map(d => d.insert).join('') || '';
      return type === 'numbered' ? `<ol><li>${text}</li></ol>` : `<ul><li>${text}</li></ul>`;
    }

    if (flavour === 'baglib:ayah') {
      const text = String(props.text || '');
      const label = String(props.label || 'القرآن الكريم');
      const url = String(props.url || '');
      return `
        <blockquote class="baglib-ayah">
          <p>﴿ ${text} ﴾</p>
          <a class="source-link" href="${url}">${label}</a>
        </blockquote>
      `;
    }

    if (flavour === 'baglib:hadith') {
      const text = String(props.text || '');
      const label = String(props.label || 'الحديث الشريف');
      const url = String(props.url || '');
      const grade = props.grade ? ` · ${props.grade}` : '';
      return `
        <blockquote class="baglib-hadith">
          <p>${text}</p>
          <a class="source-link" href="${url}">${label}${grade}</a>
        </blockquote>
      `;
    }

    if (flavour === 'baglib:verse') {
      const verses = (props.verses as { sadr: string; ajuz: string }[]) || [];
      const label = String(props.label || '');
      const url = String(props.url || '');
      const rows = verses
        .map(v => `<tr><td class="sadr">${v.sadr}</td><td class="ajuz">${v.ajuz}</td></tr>`)
        .join('\n');
      return `
        <div class="baglib-verse">
          <table class="baglib-poetry-table" dir="rtl">
            <tbody>${rows}</tbody>
          </table>
          ${label ? `<a class="source-link" href="${url}">${label}</a>` : ''}
        </div>
      `;
    }

    if (flavour === 'baglib:book-quote') {
      const text = String(props.text || '');
      const label = String(props.label || '');
      const url = String(props.url || '');
      return `
        <blockquote class="baglib-book-quote">
          <p>${text}</p>
          ${label ? `<a class="source-link" href="${url}">${label}</a>` : ''}
        </blockquote>
      `;
    }

    if (flavour === 'affine:image') {
      const caption = props.caption ? String(props.caption) : '';
      const sourceId = String(props.sourceId || props.blobId || '');
      let src = `app://-/research-blob/${sourceId}`;
      if (sourceId) {
        try {
          const blob = await this.assets.get(sourceId);
          if (blob) {
            const b64 = Buffer.from(blob.bytes).toString('base64');
            src = `data:${blob.type || 'image/png'};base64,${b64}`;
          }
        } catch {}
      }
      return `
        <figure class="baglib-image">
          <img src="${src}" alt="${caption || 'Manuscript Asset'}" />
          ${caption ? `<figcaption>${caption}</figcaption>` : ''}
        </figure>
      `;
    }

    return '';
  }

  // ---------------------------------------------------------------------------
  // PDF EXPORT
  // ---------------------------------------------------------------------------
  async generatePdf(manuscript: Manuscript, docs: ManuscriptDocument[], options: ManuscriptExportOptions): Promise<string> {
    const html = await this.generateHtml(manuscript, docs);
    const win = new BrowserWindow({
      show: false,
      width: 1024,
      height: 768,
      webPreferences: {
        offscreen: true
      }
    });

    try {
      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

      // Allow DOM and fonts to settle
      await new Promise(resolve => setTimeout(resolve, 300));

      const pageSize = options.pageSize === 'Letter' ? 'Letter' : 'A4';
      const margins = options.margins === 'narrow' ? { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 }
        : options.margins === 'wide' ? { top: 1.2, bottom: 1.2, left: 1.2, right: 1.2 }
        : { top: 0.8, bottom: 0.8, left: 0.8, right: 0.8 };

      const pdfBuffer = await win.webContents.printToPDF({
        pageSize,
        margins: {
          marginType: 'custom',
          ...margins
        },
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: '<div style="font-size:9px;color:#9ca3af;width:100%;text-align:center;"><span class="title"></span></div>',
        footerTemplate: '<div style="font-size:9px;color:#9ca3af;width:100%;text-align:center;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>'
      });

      return Buffer.from(pdfBuffer).toString('base64');
    } finally {
      win.destroy();
    }
  }

  // ---------------------------------------------------------------------------
  // DOCX EXPORT
  // ---------------------------------------------------------------------------
  async generateDocx(manuscript: Manuscript, docs: ManuscriptDocument[], options: ManuscriptExportOptions): Promise<string> {
    const isAr = docs.some(d => isArabicText(d.title || d.plain_text));
    const font = { ascii: LATIN_FONT, hAnsi: LATIN_FONT, cs: ARABIC_FONT };

    let globalFootnoteIndex = 1;
    const footnotesRecord: Record<number, { children: Paragraph[] }> = {};
    const sectionsChildren: (Paragraph | Table)[] = [];

    // Title paragraph
    sectionsChildren.push(
      new Paragraph({
        heading: HeadingLevel.TITLE,
        bidirectional: isAr,
        alignment: AlignmentType.CENTER,
        spacing: { before: 240, after: 360 },
        children: [
          new TextRun({
            text: manuscript.title,
            bold: true,
            boldComplexScript: true,
            size: 40,
            sizeComplexScript: 44,
            font,
            rightToLeft: isAr
          })
        ]
      })
    );

    for (let docIdx = 0; docIdx < docs.length; docIdx++) {
      const doc = docs[docIdx];
      const { blocks, title, apparatus } = extractNoteBlocks(doc.snapshot);
      const docTitle = doc.title || title || `Chapter ${docIdx + 1}`;
      const docIsAr = isArabicText(docTitle || doc.plain_text);

      // Chapter Heading
      sectionsChildren.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          bidirectional: docIsAr,
          spacing: { before: 360, after: 200 },
          children: [
            new TextRun({
              text: docTitle,
              bold: true,
              boldComplexScript: true,
              size: 32,
              sizeComplexScript: 36,
              font,
              rightToLeft: docIsAr
            })
          ]
        })
      );

      // Map apparatus citations to local FootnoteReferenceRuns
      const footnoteMap = new Map<string, number>();
      apparatus.citations.forEach(c => {
        if (c.number !== null) {
          const fnId = globalFootnoteIndex++;
          footnoteMap.set(c.key, fnId);
          const fnText = readableCitation(c.note);
          footnotesRecord[fnId] = {
            children: [
              new Paragraph({
                bidirectional: isArabicText(fnText),
                children: [
                  new TextRun({
                    text: fnText,
                    size: 20,
                    sizeComplexScript: 22,
                    font,
                    rightToLeft: isArabicText(fnText)
                  })
                ]
              })
            ]
          };
        }
      });

      for (const block of blocks) {
        const item = await this.blockToDocx(block, footnoteMap, font);
        if (item) {
          if (Array.isArray(item)) sectionsChildren.push(...item);
          else sectionsChildren.push(item);
        }
      }
    }

    const footer = new Footer({
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: '6B7280' })]
        })
      ]
    });

    const header = new Header({
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: manuscript.title, size: 16, color: '9CA3AF' })]
        })
      ]
    });

    const pageMargins = options.margins === 'narrow' ? { top: 720, bottom: 720, left: 720, right: 720 }
      : options.margins === 'wide' ? { top: 2160, bottom: 2160, left: 2160, right: 2160 }
      : { top: 1440, bottom: 1440, left: 1440, right: 1440 };

    const docxDoc = new Document({
      creator: 'BagLib',
      title: manuscript.title,
      footnotes: footnotesRecord,
      styles: { default: { document: { run: { font, size: 24 } } } },
      sections: [
        {
          properties: {
            page: {
              margin: pageMargins
            }
          },
          headers: { default: header },
          footers: { default: footer },
          children: sectionsChildren
        }
      ]
    });

    const buffer = await Packer.toBuffer(docxDoc);
    return buffer.toString('base64');
  }

  private async blockToDocx(
    block: ParsedSnapshotBlock,
    footnoteMap: Map<string, number>,
    font: { ascii: string; hAnsi: string; cs: string }
  ): Promise<Paragraph | Table | (Paragraph | Table)[] | null> {
    const flavour = block.flavour;
    const props = block.props || {};

    if (flavour === 'affine:paragraph') {
      const type = String(props.type || 'text');
      const deltas = (props.text as { delta?: { insert: string; attributes?: { bold?: boolean; italic?: boolean; footnote?: { label: string } } }[] })?.delta || [];
      const children: ParagraphChild[] = [];
      let fullText = '';
      let offset = 0;

      for (const d of deltas) {
        const text = d.insert || '';
        fullText += text;
        const rtl = isArabicText(text);

        children.push(
          new TextRun({
            text,
            bold: Boolean(d.attributes?.bold),
            boldComplexScript: Boolean(d.attributes?.bold),
            italics: Boolean(d.attributes?.italic),
            italicsComplexScript: Boolean(d.attributes?.italic),
            rightToLeft: rtl,
            font,
            size: type.startsWith('h') ? 28 : 24,
            sizeComplexScript: type.startsWith('h') ? 32 : 28
          })
        );

        if (d.attributes?.footnote) {
          const key = block.id + ':' + offset;
          const fnId = footnoteMap.get(key);
          if (fnId !== undefined) {
            children.push(new FootnoteReferenceRun(fnId));
          }
        }
        offset += d.insert?.length || 0;
      }

      if (!fullText.trim()) return null;
      const pRtl = isArabicText(fullText);

      let headingLevel: (typeof HeadingLevel)[keyof typeof HeadingLevel] | undefined;
      if (type === 'h1') headingLevel = HeadingLevel.HEADING_2;
      else if (type === 'h2') headingLevel = HeadingLevel.HEADING_3;
      else if (type === 'h3') headingLevel = HeadingLevel.HEADING_4;

      return new Paragraph({
        heading: headingLevel,
        bidirectional: pRtl,
        spacing: { after: 120 },
        indent: type === 'quote' ? { start: 567 } : undefined,
        children
      });
    }

    if (flavour === 'affine:list') {
      const text = (props.text as { delta?: { insert: string }[] })?.delta?.map(d => d.insert).join('') || '';
      const rtl = isArabicText(text);
      return new Paragraph({
        bullet: { level: 0 },
        bidirectional: rtl,
        spacing: { after: 80 },
        children: [
          new TextRun({
            text,
            rightToLeft: rtl,
            font,
            size: 24,
            sizeComplexScript: 28
          })
        ]
      });
    }

    if (flavour === 'baglib:ayah') {
      const text = `﴿ ${String(props.text || '')} ﴾`;
      const label = String(props.label || 'القرآن الكريم');
      const quranFont = { ascii: LATIN_FONT, hAnsi: LATIN_FONT, cs: QURAN_FONT };
      return [
        new Paragraph({
          bidirectional: true,
          indent: { start: 567, end: 567 },
          spacing: { before: 160, after: 60 },
          children: [
            new TextRun({
              text,
              rightToLeft: true,
              font: quranFont,
              size: 28,
              sizeComplexScript: 32,
              bold: true,
              boldComplexScript: true,
              color: '064E3B'
            })
          ]
        }),
        new Paragraph({
          bidirectional: true,
          indent: { start: 567 },
          spacing: { after: 160 },
          children: [
            new TextRun({
              text: `[${label}]`,
              rightToLeft: true,
              font,
              size: 18,
              sizeComplexScript: 20,
              color: '047857'
            })
          ]
        })
      ];
    }

    if (flavour === 'baglib:hadith') {
      const text = String(props.text || '');
      const label = String(props.label || 'الحديث الشريف');
      const grade = props.grade ? ` · ${props.grade}` : '';
      return [
        new Paragraph({
          bidirectional: true,
          indent: { start: 567, end: 567 },
          spacing: { before: 140, after: 60 },
          children: [
            new TextRun({
              text,
              rightToLeft: true,
              font,
              size: 24,
              sizeComplexScript: 28,
              color: '1E3A8A'
            })
          ]
        }),
        new Paragraph({
          bidirectional: true,
          indent: { start: 567 },
          spacing: { after: 160 },
          children: [
            new TextRun({
              text: `[${label}${grade}]`,
              rightToLeft: true,
              font,
              size: 18,
              sizeComplexScript: 20,
              color: '1D4ED8'
            })
          ]
        })
      ];
    }

    // baglib:verse -> Borderless two-column table with right-to-left layout
    if (flavour === 'baglib:verse') {
      const verses = (props.verses as { sadr: string; ajuz: string }[]) || [];
      const label = String(props.label || '');

      const tableRows = verses.map(v =>
        new TableRow({
          children: [
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({
                  bidirectional: true,
                  alignment: AlignmentType.RIGHT,
                  children: [
                    new TextRun({
                      text: v.sadr,
                      rightToLeft: true,
                      font,
                      size: 24,
                      sizeComplexScript: 28,
                      bold: true,
                      boldComplexScript: true
                    })
                  ]
                })
              ]
            }),
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({
                  bidirectional: true,
                  alignment: AlignmentType.LEFT,
                  children: [
                    new TextRun({
                      text: v.ajuz,
                      rightToLeft: true,
                      font,
                      size: 24,
                      sizeComplexScript: 28,
                      bold: true,
                      boldComplexScript: true
                    })
                  ]
                })
              ]
            })
          ]
        })
      );

      const table = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: TableBorders.NONE,
        rows: tableRows
      });

      const items: (Paragraph | Table)[] = [table];
      if (label) {
        items.push(
          new Paragraph({
            bidirectional: true,
            alignment: AlignmentType.CENTER,
            spacing: { before: 80, after: 160 },
            children: [
              new TextRun({
                text: `[${label}]`,
                rightToLeft: true,
                font,
                size: 18,
                sizeComplexScript: 20,
                color: '6B7280'
              })
            ]
          })
        );
      }
      return items;
    }

    if (flavour === 'baglib:book-quote') {
      const text = String(props.text || '');
      const label = String(props.label || '');
      return [
        new Paragraph({
          bidirectional: isArabicText(text),
          indent: { start: 567 },
          spacing: { before: 120, after: 60 },
          children: [
            new TextRun({
              text,
              italics: true,
              italicsComplexScript: true,
              rightToLeft: isArabicText(text),
              font,
              size: 22,
              sizeComplexScript: 26
            })
          ]
        }),
        new Paragraph({
          bidirectional: isArabicText(label),
          indent: { start: 567 },
          spacing: { after: 140 },
          children: [
            new TextRun({
              text: `— ${label}`,
              rightToLeft: isArabicText(label),
              font,
              size: 18,
              sizeComplexScript: 20,
              color: '4B5563'
            })
          ]
        })
      ];
    }

    if (flavour === 'affine:image') {
      const sourceId = String(props.sourceId || props.blobId || '');
      const caption = props.caption ? String(props.caption) : '';
      if (!sourceId) return null;

      try {
        const blob = await this.assets.get(sourceId);
        if (blob && blob.bytes.length > 0) {
          const buf = Buffer.from(blob.bytes);
          const dim = getImageDimensions(buf);
          const imgType: 'png' | 'jpg' | 'gif' = blob.type?.includes('jpeg') || blob.type?.includes('jpg') ? 'jpg'
            : blob.type?.includes('gif') ? 'gif'
            : 'png';

          const paragraphs: Paragraph[] = [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 160, after: caption ? 60 : 160 },
              children: [
                new ImageRun({
                  data: buf,
                  transformation: { width: dim.width, height: dim.height },
                  type: imgType
                })
              ]
            })
          ];

          if (caption) {
            paragraphs.push(
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 160 },
                children: [
                  new TextRun({
                    text: caption,
                    italics: true,
                    size: 18,
                    color: '6B7280'
                  })
                ]
              })
            );
          }

          return paragraphs;
        }
      } catch {}
    }

    return null;
  }
}
