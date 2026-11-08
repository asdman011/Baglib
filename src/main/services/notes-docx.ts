import { AlignmentType, Bookmark, Document, Footer, HeadingLevel, InternalHyperlink, Packer, PageNumber, Paragraph, TextRun, type ParagraphChild } from 'docx';
import { DEFAULT_WORD_LAYOUT, WORD_MARGINS, WORD_PAGE_SIZES, type WordLayout } from '../../shared/word-export';
import { parseNoteTarget, studyLinks, type StudyLink } from '../../shared/study-notes';
import type { ExportNote } from '../../shared/markdown-export';

/**
 * Word export of study notes (decision S8, `docx` library). One document; each note starts with its title as a
 * heading and a bookmark, so links between exported notes are real internal links. Arabic paragraphs are
 * right-to-left and Arabic runs use a complex-script font; English stays left-to-right in the same document.
 */
export interface DocxLabels {
  title: string;
  exported: string;
  book: string;
  tags: string;
  aliases: string;
  updated: string;
  /** Heading of the table of contents. */
  contents: string;
  /** Names of typed relationships (decision S4); a coined one is shown as written. */
  relations: Record<string, string>;
}

const LATIN_FONT = 'Calibri';
const ARABIC_FONT = 'Traditional Arabic';
const font = { ascii: LATIN_FONT, hAnsi: LATIN_FONT, cs: ARABIC_FONT };
const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/u;
// An Arabic stretch, with the spaces, digits and punctuation between its words, is one right-to-left run.
const ARABIC_RUN = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿](?:[\s\d٠-٩.,:;!?()«»"'\-–—]*[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿])*/gu;

// In a right-to-left paragraph only Latin and Western-digit stretches run left to right, so spaces next to Arabic
// words stay on the side they were typed and 2:153 prints as typed (Word shows digits inside an RTL run as ٢:١٥٣).
const LATIN_RUN = /[A-Za-z0-9\u00C0-\u024F](?:[\s.,:;!?()'"\-]*[A-Za-z0-9\u00C0-\u024F])*/gu;

/** `rtl` is the paragraph's direction. */
interface Style { bold?: boolean; italics?: boolean; code?: boolean; color?: string; size?: number; underline?: boolean; rtl?: boolean }

/** Text split into Latin and Arabic runs, each with the right direction and font. */
export function scriptRuns(text: string, style: Style = {}): TextRun[] {
  const runs: TextRun[] = [];
  const add = (value: string, rtl: boolean) => {
    if (!value) return;
    runs.push(new TextRun({
      text: value, rightToLeft: rtl, bold: style.bold, boldComplexScript: style.bold, italics: style.italics, italicsComplexScript: style.italics,
      color: style.color, underline: style.underline ? {} : undefined,
      font: style.code ? { ascii: 'Consolas', hAnsi: 'Consolas', cs: ARABIC_FONT } : font,
      size: style.size ?? 24, sizeComplexScript: (style.size ?? 24) + 6,
    }));
  };
  const rtl = Boolean(style.rtl);
  let last = 0;
  for (const match of text.matchAll(rtl ? LATIN_RUN : ARABIC_RUN)) {
    add(text.slice(last, match.index), rtl);
    add(match[0], !rtl);
    last = match.index! + match[0].length;
  }
  add(text.slice(last), rtl);
  return runs;
}

/** `**bold**`, `*italic*` and `` `code` `` inside plain text. */
function inlineRuns(text: string, base: Style = {}): TextRun[] {
  const runs: TextRun[] = [];
  let last = 0;
  for (const match of text.matchAll(/\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|`([^`\n]+)`/gu)) {
    runs.push(...scriptRuns(text.slice(last, match.index), base));
    if (match[1] !== undefined) runs.push(...scriptRuns(match[1], { ...base, bold: true }));
    else if (match[2] !== undefined) runs.push(...scriptRuns(match[2], { ...base, italics: true }));
    else runs.push(...scriptRuns(match[3], { ...base, code: true }));
    last = match.index! + match[0].length;
  }
  runs.push(...scriptRuns(text.slice(last), base));
  return runs;
}

/** A line's runs with links: a link to an exported note jumps to it; other links keep their label. */
function lineChildren(line: string, bookmarks: Map<string, string>, labels: DocxLabels, base: Style = {}): ParagraphChild[] {
  const children: ParagraphChild[] = [];
  let last = 0;
  for (const link of studyLinks(line)) {
    children.push(...inlineRuns(line.slice(last, link.start), base));
    children.push(...linkChildren(link, bookmarks, labels, base));
    last = link.end;
  }
  children.push(...inlineRuns(line.slice(last), base));
  return children;
}

function linkChildren(link: StudyLink, bookmarks: Map<string, string>, labels: DocxLabels, base: Style): ParagraphChild[] {
  const children: ParagraphChild[] = [];
  if (link.relation) children.push(...scriptRuns(`[${labels.relations[link.relation] ?? link.relation}] `, { ...base, bold: true, color: '047857', size: 20 }));
  const note = parseNoteTarget(link.target);
  const anchor = note ? bookmarks.get(note.id) : undefined;
  const runs = scriptRuns(link.label, { ...base, color: '047857', underline: Boolean(anchor) });
  children.push(...(anchor ? [new InternalHyperlink({ anchor, children: runs })] : runs));
  return children;
}

/** Whether a line reads right to left: its first letter, ignoring link targets, is Arabic. */
function rightToLeft(line: string, fallback: boolean): boolean {
  let shown = line;
  for (const link of studyLinks(line).reverse()) shown = shown.slice(0, link.start) + link.label + shown.slice(link.end);
  const letter = /\p{L}/u.exec(shown)?.[0];
  return letter ? ARABIC.test(letter) : fallback;
}

const paragraphAnchor = /[ \t]\^[A-Za-z0-9-]{1,64}[ \t]*$/u;

/** A note's Markdown body as Word paragraphs: headings, lists, quotes, code blocks and text. */
function bodyParagraphs(content: string, bookmarks: Map<string, string>, labels: DocxLabels, rtl: boolean): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  let code = false;
  for (const raw of content.split('\n')) {
    if (/^\s*(```|~~~)/u.test(raw)) { code = !code; continue; }
    if (code) { paragraphs.push(new Paragraph({ children: scriptRuns(raw, { code: true, size: 20 }), bidirectional: false })); continue; }
    const line = raw.replace(paragraphAnchor, '');
    if (!line.trim()) continue;
    const bidirectional = rightToLeft(line, rtl);
    const heading = /^(#{1,6})\s+(.*)$/u.exec(line);
    if (heading) {
      const level = [HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4][Math.min(heading[1].length, 3) - 1];
      paragraphs.push(new Paragraph({ heading: level, bidirectional, children: lineChildren(heading[2], bookmarks, labels, { bold: true, size: 26, rtl: bidirectional }) }));
      continue;
    }
    const bullet = /^\s*[-*]\s+(.*)$/u.exec(line);
    if (bullet) { paragraphs.push(new Paragraph({ bullet: { level: 0 }, bidirectional, children: lineChildren(bullet[1], bookmarks, labels, { rtl: bidirectional }) })); continue; }
    const quote = /^\s*>\s?(.*)$/u.exec(line);
    if (quote) { paragraphs.push(new Paragraph({ indent: { start: 567 }, bidirectional, children: lineChildren(quote[1], bookmarks, labels, { italics: true, color: '92400E', rtl: bidirectional }) })); continue; }
    paragraphs.push(new Paragraph({ bidirectional, spacing: { after: 120 }, children: lineChildren(line, bookmarks, labels, { rtl: bidirectional }) }));
  }
  return paragraphs;
}

/** Builds the document for the notes, in their order. `rtl` is the interface direction, used for lines without letters. */
export function notesDocument(notes: ExportNote[], books: Map<string, string>, labels: DocxLabels, rtl: boolean, now = new Date(), layout: WordLayout = DEFAULT_WORD_LAYOUT): Document {
  // Bookmark names must be short and plain in Word: note_1, note_2 …
  const bookmarks = new Map(notes.map((note, index) => [note.id, `note_${index + 1}`]));
  const children: Paragraph[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, bidirectional: rtl, children: scriptRuns(labels.title, { bold: true, size: 40, rtl }) }),
    new Paragraph({ bidirectional: rtl, spacing: { after: 360 }, children: scriptRuns(`${labels.exported} ${now.toISOString().slice(0, 10)}`, { color: '6B7280', size: 20, rtl }) }),
  ];
  const titleOf = (note: ExportNote) => note.title || note.content.split('\n').find(line => line.trim())?.replace(/^#+\s*/u, '').slice(0, 80) || note.id;
  // Table of contents: each note's title links to its heading. Built from the notes themselves rather than as a Word
  // field, so it is complete as soon as the file opens, in Word, LibreOffice or Google Docs, with no "update fields".
  if (layout.contents && notes.length > 1) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, bidirectional: rtl, children: scriptRuns(labels.contents, { bold: true, size: 28, rtl }) }));
    notes.forEach((note, index) => {
      const title = titleOf(note);
      const entryRtl = rightToLeft(title, rtl);
      children.push(new Paragraph({ bidirectional: entryRtl, spacing: { after: 60 }, children: [
        ...scriptRuns(`${index + 1}. `, { rtl: entryRtl, color: '6B7280' }),
        new InternalHyperlink({ anchor: bookmarks.get(note.id)!, children: scriptRuns(title, { rtl: entryRtl, color: '1D4ED8', underline: true }) }),
      ] }));
    });
  }
  for (const note of notes) {
    const title = titleOf(note);
    const titleRtl = rightToLeft(title, rtl);
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_1, bidirectional: titleRtl, spacing: { before: 360 },
      children: [new Bookmark({ id: bookmarks.get(note.id)!, children: scriptRuns(title, { bold: true, size: 32, rtl: titleRtl }) })],
    }));
    const meta = [
      note.workId && books.get(note.workId) ? `${labels.book}: ${books.get(note.workId)}` : '',
      note.tags.length ? `${labels.tags}: ${note.tags.map(tag => `#${tag}`).join(' ')}` : '',
      note.aliases.length ? `${labels.aliases}: ${note.aliases.join('، ')}` : '',
      `${labels.updated}: ${note.updatedAt.slice(0, 10)}`,
    ].filter(Boolean).join(' · ');
    children.push(new Paragraph({ bidirectional: rtl, spacing: { after: 160 }, children: scriptRuns(meta, { color: '6B7280', size: 18, rtl }) }));
    children.push(...bodyParagraphs(note.content, bookmarks, labels, rtl));
  }
  const size = WORD_PAGE_SIZES[layout.pageSize], margin = WORD_MARGINS[layout.margins];
  // Page numbers in the footer (a PAGE field, which Word fills in when it lays the pages out).
  const footer = new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: '6B7280' })] })] });
  return new Document({
    creator: 'BagLib', title: labels.title, styles: { default: { document: { run: { font, size: 24 } } } },
    sections: [{
      properties: { page: { size: { width: size.width, height: size.height }, margin: { top: margin.top, bottom: margin.bottom, left: margin.side, right: margin.side } } },
      footers: { default: footer },
      children,
    }],
  });
}

export async function notesToDocx(notes: ExportNote[], books: Map<string, string>, labels: DocxLabels, rtl: boolean, now = new Date(), layout: WordLayout = DEFAULT_WORD_LAYOUT): Promise<Buffer> {
  return Packer.toBuffer(notesDocument(notes, books, labels, rtl, now, layout));
}
