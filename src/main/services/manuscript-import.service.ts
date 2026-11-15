import { randomUUID } from 'node:crypto';
import type { Database } from 'better-sqlite3';
import { ManuscriptRepository } from '../database/repositories/manuscript.repository';
import type { ManuscriptDocument } from '../../shared/manuscripts';
import type { ManuscriptImportMarkdownInput, ManuscriptImportQuickNoteInput, QuickNoteItem } from '../../shared/manuscript-export';
import type { ResearchFootnote } from '../../shared/research-editor-apparatus';

interface InlineDelta {
  insert: string;
  attributes?: {
    bold?: boolean;
    italic?: boolean;
    code?: boolean;
    link?: string;
    footnote?: ResearchFootnote;
    [key: string]: unknown;
  };
}

interface BlockNode {
  type: 'block';
  id: string;
  flavour: string;
  version: number;
  props: Record<string, unknown>;
  children: BlockNode[];
}

/** Parses inline markdown syntax: **bold**, *italic*, `code`, [label](url), and [^n] footnotes. */
export function parseInlineMarkdown(text: string, footnoteDefs = new Map<string, { title: string; url: string }>()): InlineDelta[] {
  const deltas: InlineDelta[] = [];
  if (!text) return [{ insert: '' }];

  const regex = /(\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|`([^`\n]+)`|\[\^([A-Za-z0-9_-]+)\]|\[([^\]]+)\]\(([^)]+)\))/gu;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      deltas.push({ insert: text.slice(lastIndex, match.index) });
    }

    if (match[2] !== undefined) {
      // **bold**
      deltas.push({ insert: match[2], attributes: { bold: true } });
    } else if (match[3] !== undefined) {
      // *italic*
      deltas.push({ insert: match[3], attributes: { italic: true } });
    } else if (match[4] !== undefined) {
      // `code`
      deltas.push({ insert: match[4], attributes: { code: true } });
    } else if (match[5] !== undefined) {
      // [^footnote]
      const label = match[5];
      const def = footnoteDefs.get(label);
      const url = def?.url || `note:fn-${label}`;
      const title = def?.title || label;
      deltas.push({
        insert: ' ',
        attributes: {
          footnote: {
            label,
            reference: { type: 'url', url, title }
          }
        }
      });
    } else if (match[6] !== undefined && match[7] !== undefined) {
      // [text](url)
      const label = match[6];
      const url = match[7];
      if (/^(quran|sunnah|poetry|book|note):/.test(url)) {
        deltas.push({
          insert: label,
          attributes: {
            footnote: {
              label,
              reference: { type: 'url', url, title: label }
            }
          }
        });
      } else {
        deltas.push({ insert: label, attributes: { link: url } });
      }
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    deltas.push({ insert: text.slice(lastIndex) });
  }

  return deltas.length ? deltas : [{ insert: '' }];
}

/** Parses raw markdown document text into BlockSuite snapshot JSON. */
export function markdownToManuscriptSnapshot(docId: string, title: string, markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const footnoteDefs = new Map<string, { title: string; url: string }>();

  // First pass: extract footnote definitions like [^1]: Title — url
  for (const line of lines) {
    const fnMatch = /^\s*\[\^([A-Za-z0-9_-]+)\]:\s*(.+)$/u.exec(line);
    if (fnMatch) {
      const label = fnMatch[1];
      const rest = fnMatch[2].trim();
      const parts = rest.split(/\s*—\s*|\s*---\s*/);
      let footnoteTitle = parts[0]?.trim() || label;
      let footnoteUrl = parts[1]?.trim() || '';
      if (!footnoteUrl && /^(quran|sunnah|poetry|book|note|https?):/.test(footnoteTitle)) {
        footnoteUrl = footnoteTitle;
        footnoteTitle = label;
      }
      footnoteDefs.set(label, { title: footnoteTitle, url: footnoteUrl || `note:${label}` });
    }
  }

  const children: BlockNode[] = [];
  let inCode = false;
  let codeBuffer: string[] = [];

  for (const raw of lines) {
    // Check for code fence
    if (/^\s*(```|~~~)/u.test(raw)) {
      if (inCode) {
        children.push({
          type: 'block',
          id: randomUUID(),
          flavour: 'affine:code',
          version: 1,
          props: { text: { '$blocksuite:internal:text$': true, delta: [{ insert: codeBuffer.join('\n') }] } },
          children: []
        });
        codeBuffer = [];
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      codeBuffer.push(raw);
      continue;
    }

    // Skip footnote definition lines in body text
    if (/^\s*\[\^([A-Za-z0-9_-]+)\]:\s*/u.test(raw)) {
      continue;
    }

    const trimmed = raw.trim();
    if (!trimmed) continue;

    // Headings #, ##, ###
    const headingMatch = /^(#{1,6})\s+(.*)$/u.exec(trimmed);
    if (headingMatch) {
      const level = Math.min(headingMatch[1].length, 3);
      const headingType = `h${level}`;
      children.push({
        type: 'block',
        id: randomUUID(),
        flavour: 'affine:paragraph',
        version: 1,
        props: {
          type: headingType,
          text: { '$blocksuite:internal:text$': true, delta: parseInlineMarkdown(headingMatch[2], footnoteDefs) }
        },
        children: []
      });
      continue;
    }

    // Poetry lines with *** separator (not standalone horizontal rules)
    if (trimmed.includes('***') && !/^\s*\*{3,}\s*$/.test(trimmed)) {
      const parts = trimmed.split(/\s*\*{3}\s*/);
      if (parts.length >= 2 && parts[0].trim() && parts[1].trim()) {
        children.push({
          type: 'block',
          id: randomUUID(),
          flavour: 'baglib:verse',
          version: 1,
          props: {
            kind: 'verse',
            verses: [{ sadr: parts[0].trim(), ajuz: parts[1].trim() }],
            label: parts[0].trim(),
            url: `poetry:bayt-${randomUUID().slice(0, 8)}`
          },
          children: []
        });
        continue;
      }
    }

    // Blockquote
    const quoteMatch = /^\s*>\s?(.*)$/u.exec(trimmed);
    if (quoteMatch) {
      const content = quoteMatch[1];
      // Check if Quran ayah quote ﴿ ... ﴾
      const ayahMatch = /^[«"']?﴿([^﴾]+)﴾[»"']?/u.exec(content);
      if (ayahMatch) {
        children.push({
          type: 'block',
          id: randomUUID(),
          flavour: 'baglib:ayah',
          version: 1,
          props: {
            kind: 'ayah',
            text: ayahMatch[1].trim(),
            label: 'القرآن الكريم',
            url: 'quran:custom'
          },
          children: []
        });
      } else {
        children.push({
          type: 'block',
          id: randomUUID(),
          flavour: 'affine:paragraph',
          version: 1,
          props: {
            type: 'quote',
            text: { '$blocksuite:internal:text$': true, delta: parseInlineMarkdown(content, footnoteDefs) }
          },
          children: []
        });
      }
      continue;
    }

    // Bullet list
    const bulletMatch = /^\s*[-*]\s+(.*)$/u.exec(trimmed);
    if (bulletMatch) {
      children.push({
        type: 'block',
        id: randomUUID(),
        flavour: 'affine:list',
        version: 1,
        props: {
          type: 'bulleted',
          text: { '$blocksuite:internal:text$': true, delta: parseInlineMarkdown(bulletMatch[1], footnoteDefs) }
        },
        children: []
      });
      continue;
    }

    // Numbered list
    const numberedMatch = /^\s*\d+[.)]\s+(.*)$/u.exec(trimmed);
    if (numberedMatch) {
      children.push({
        type: 'block',
        id: randomUUID(),
        flavour: 'affine:list',
        version: 1,
        props: {
          type: 'numbered',
          text: { '$blocksuite:internal:text$': true, delta: parseInlineMarkdown(numberedMatch[1], footnoteDefs) }
        },
        children: []
      });
      continue;
    }

    // Standard paragraph
    children.push({
      type: 'block',
      id: randomUUID(),
      flavour: 'affine:paragraph',
      version: 1,
      props: {
        type: 'text',
        text: { '$blocksuite:internal:text$': true, delta: parseInlineMarkdown(trimmed, footnoteDefs) }
      },
      children: []
    });
  }

  // Ensure at least one paragraph exists
  if (!children.length) {
    children.push({
      type: 'block',
      id: randomUUID(),
      flavour: 'affine:paragraph',
      version: 1,
      props: { type: 'text', text: { '$blocksuite:internal:text$': true, delta: [] } },
      children: []
    });
  }

  const snapshot = {
    type: 'page',
    meta: { id: docId, title, createDate: Date.now(), tags: [] },
    blocks: {
      type: 'block',
      id: `${docId}-page`,
      flavour: 'affine:page',
      version: 2,
      props: { title: { '$blocksuite:internal:text$': true, delta: [{ insert: title }] } },
      children: [
        {
          type: 'block',
          id: `${docId}-surface`,
          flavour: 'affine:surface',
          version: 5,
          props: { elements: {} },
          children: []
        },
        {
          type: 'block',
          id: `${docId}-note`,
          flavour: 'affine:note',
          version: 1,
          props: {},
          children
        }
      ]
    }
  };

  return JSON.stringify(snapshot);
}

export class ManuscriptImportService {
  constructor(private db: Database) {}

  /** List available quick notes for the import modal picker. */
  listQuickNotes(): QuickNoteItem[] {
    try {
      const rows = this.db.prepare(`
        SELECT k.id, s.title, s.content, k.updated_at AS updatedAt
        FROM knowledge k
        JOIN study_note_detail s ON s.knowledge_id = k.id
        WHERE k.deleted_at IS NULL
        ORDER BY k.updated_at DESC
        LIMIT 100
      `).all() as { id: string; title: string; content: string; updatedAt: string }[];

      return rows.map(r => ({
        id: r.id,
        title: r.title?.trim() || r.content?.split('\n').find(l => l.trim())?.replace(/^#+\s*/, '').slice(0, 60) || 'ملاحظة',
        snippet: (r.content || '').slice(0, 160).replace(/\s+/g, ' '),
        tags: (this.db.prepare('SELECT t.name FROM tag t JOIN knowledge_tag j ON j.tag_id=t.id WHERE j.knowledge_id=? ORDER BY t.name').all(r.id) as { name: string }[]).map(t => t.name),
        updatedAt: r.updatedAt
      }));
    } catch {
      return [];
    }
  }

  /** Import a quick note from the study notes repository into a manuscript as a new chapter. */
  importQuickNote(input: ManuscriptImportQuickNoteInput): ManuscriptDocument {
    const row = this.db.prepare(`
      SELECT s.title, s.content
      FROM knowledge k
      JOIN study_note_detail s ON s.knowledge_id = k.id
      WHERE k.id = ? AND k.deleted_at IS NULL
    `).get(input.noteId) as { title: string; content: string } | undefined;

    if (!row) throw new Error('note-not-found');

    const title = input.title?.trim() || row.title?.trim() || row.content.split('\n').find(l => l.trim())?.replace(/^#+\s*/, '').slice(0, 80) || 'ملاحظة مستوردة';
    return this.importMarkdown({
      manuscriptId: input.manuscriptId,
      markdown: row.content,
      title,
      parentId: input.parentId
    });
  }

  /** Import a markdown document into a manuscript as a new chapter. */
  importMarkdown(input: ManuscriptImportMarkdownInput): ManuscriptDocument {
    const repo = new ManuscriptRepository(this.db);
    const content = input.markdown || '';

    // Extract title if not provided
    let title = input.title?.trim();
    if (!title) {
      const firstHeading = content.split('\n').find(l => /^\s*#+\s+/.test(l));
      if (firstHeading) {
        title = firstHeading.replace(/^\s*#+\s+/, '').trim().slice(0, 80);
      } else {
        const firstLine = content.split('\n').find(l => l.trim());
        title = firstLine?.trim().slice(0, 60) || 'مستند مستورد';
      }
    }

    // Create the document entry
    const doc = repo.createDocument(input.manuscriptId, title, input.parentId);

    // Generate snapshot and save
    const snapshot = markdownToManuscriptSnapshot(doc.id, title, content);
    const updated = repo.save({ id: doc.id, snapshot });
    repo.checkpoint(doc.id, 'import-markdown');

    return updated;
  }
}
