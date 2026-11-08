import { matchesStudyQuery, parseNoteTarget, studyLinkText, studyLinks, type StudyNote } from './study-notes';

export { parseNoteTarget };

/** A paragraph anchor at the end of a paragraph's last line: ` ^a1b2c3` (Obsidian block-id syntax). */
export const PARAGRAPH_ANCHOR = /[ \t]\^([A-Za-z0-9-]{1,64})[ \t]*$/u;
const ANCHOR_ID = /^[A-Za-z0-9-]{1,64}$/u;

export interface NoteParagraph { start: number; end: number; text: string; anchor?: string }

/**
 * Paragraphs of a note: runs of non-blank lines separated by blank lines; fenced code blocks stay whole.
 * `start`/`end` are offsets in the note; `text` excludes the anchor; `end` is the end of the paragraph's last line.
 */
export function noteParagraphs(content: string): NoteParagraph[] {
  const paragraphs: NoteParagraph[] = [];
  let start = -1, end = 0, fence = false, offset = 0;
  const close = () => {
    if (start < 0) return;
    const raw = content.slice(start, end);
    const lines = raw.split('\n');
    const anchor = PARAGRAPH_ANCHOR.exec(lines[lines.length - 1])?.[1];
    if (anchor) lines[lines.length - 1] = lines[lines.length - 1].replace(PARAGRAPH_ANCHOR, '');
    paragraphs.push({ start, end, text: lines.join('\n').trim(), ...(anchor ? { anchor } : {}) });
    start = -1;
  };
  for (const line of content.split('\n')) {
    const lineEnd = offset + line.length;
    if (/^\s*(```|~~~)/u.test(line)) fence = !fence;
    if (!line.trim() && !fence) close();
    else { if (start < 0) start = offset; end = lineEnd; }
    offset = lineEnd + 1;
  }
  close();
  return paragraphs.filter(paragraph => paragraph.text);
}

export function findParagraph(content: string, anchor: string): NoteParagraph | undefined {
  return noteParagraphs(content).find(paragraph => paragraph.anchor === anchor);
}

/** Removes paragraph anchors from text meant for reading. */
export function stripParagraphAnchors(text: string): string {
  return text.split('\n').map(line => line.replace(PARAGRAPH_ANCHOR, '')).join('\n');
}

/** A new anchor id not used in the note, e.g. `a1b2c3`. */
export function newParagraphAnchor(content: string, random: () => string = () => Math.random().toString(36).slice(2, 8)): string {
  const used = new Set(noteParagraphs(content).flatMap(paragraph => paragraph.anchor ? [paragraph.anchor] : []));
  for (let attempt = 0; attempt < 50; attempt++) {
    const id = random().replace(/[^A-Za-z0-9]/gu, '').slice(0, 6).padEnd(6, '0');
    if (!used.has(id)) return id;
  }
  throw new Error('anchor-space-exhausted');
}

/**
 * The note with an anchor appended to the paragraph that starts at `start`, unless it already has one.
 * Only ` ^id` is added at the end of the paragraph's last line; its text never changes.
 */
export function anchorParagraph(content: string, start: number, anchor: string): { content: string; anchor: string } {
  if (!ANCHOR_ID.test(anchor)) throw new Error('invalid-anchor');
  const paragraph = noteParagraphs(content).find(item => item.start === start);
  if (!paragraph) throw new Error('missing-paragraph');
  if (paragraph.anchor) return { content, anchor: paragraph.anchor };
  return { content: `${content.slice(0, paragraph.end)} ^${anchor}${content.slice(paragraph.end)}`, anchor };
}

export interface ParagraphOption { noteId: string; noteTitle: string; start: number; anchor?: string; label: string; text: string }

function shownText(text: string): string {
  let plain = text;
  for (const link of studyLinks(plain).reverse()) plain = plain.slice(0, link.start) + link.label + plain.slice(link.end);
  return plain;
}

/** The first words of a paragraph, as a link label: links, Markdown markers and anchors removed. */
export function paragraphLabel(text: string, words = 8): string {
  let plain = shownText(text);
  plain = plain.replace(/^\s*(?:#{1,6}|>|[-*])\s+/gmu, '').replace(/[*_`]/gu, '').replace(/\s+/gu, ' ').trim();
  const parts = plain.split(' ');
  return parts.length > words ? `${parts.slice(0, words).join(' ')}…` : plain;
}

/** Paragraphs of saved notes matching the query (Arabic normalised, diacritics ignored), skipping the note being edited. */
export function paragraphOptions(query: string, notes: Pick<StudyNote, 'id' | 'title' | 'content'>[], exclude?: string, limit = 8): ParagraphOption[] {
  const text = query.trim();
  if (text.length < 2) return [];
  const options: ParagraphOption[] = [];
  for (const note of notes) {
    if (note.id === exclude) continue;
    for (const paragraph of noteParagraphs(note.content)) {
      // Match what the reader sees: link labels, not targets or relationship names hidden in the link text.
      if (!matchesStudyQuery(shownText(paragraph.text), text)) continue;
      options.push({ noteId: note.id, noteTitle: note.title, start: paragraph.start, anchor: paragraph.anchor, label: paragraphLabel(paragraph.text), text: paragraph.text });
      if (options.length >= limit) return options;
    }
  }
  return options;
}

export function paragraphLink(noteId: string, anchor: string, label: string): string {
  return studyLinkText(`note:${noteId}#^${anchor}`, label);
}
