/**
 * KEY-345: notes from other places — any Markdown file or an Obsidian vault, a Word document, BagLib's CSV — and
 * safe folder names for exporting notes as a folder tree that mirrors the Notes tab.
 */
export interface ImportedNote { id: string; title: string; content: string; tags: string[]; aliases: string[] }
export interface ImportFile { path: string; text: string }

const MAX_NOTES = 5000;
const MAX_CONTENT = 100_000;

function frontMatter(text: string): { fields: Record<string, string | string[]>; body: string } {
  const match = /^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?/u.exec(text);
  if (!match) return { fields: {}, body: text.replace(/^﻿/u, '') };
  const fields: Record<string, string | string[]> = {};
  let list: string | null = null;
  for (const line of match[1].split(/\r?\n/u)) {
    const item = /^\s*-\s+(.+)$/u.exec(line);
    if (item && list) { (fields[list] as string[]).push(item[1].trim().replace(/^["']|["']$/gu, '')); continue; }
    const pair = /^([\w-]+):\s*(.*)$/u.exec(line);
    if (!pair) continue;
    const [, key, raw] = pair;
    if (!raw) { fields[key] = []; list = key; continue; }
    list = null;
    const inline = /^\[(.*)\]$/u.exec(raw.trim());
    fields[key] = inline ? inline[1].split(',').map(value => value.trim().replace(/^["']|["']$/gu, '')).filter(Boolean) : raw.trim().replace(/^["']|["']$/gu, '');
  }
  return { fields, body: text.slice(match[0].length) };
}

const asList = (value: string | string[] | undefined): string[] => (Array.isArray(value) ? value : value ? value.split(/[,\s]+/u) : []).map(tag => tag.replace(/^#/u, '').trim()).filter(tag => tag && tag.length <= 200).slice(0, 50);

/**
 * Plain Markdown or an Obsidian vault: the title is the first heading or the file name, front-matter tags and
 * aliases are kept, inline #tags are added, and [[Wikilinks]] between the imported files become BagLib note links.
 */
export function importPlainMarkdown(files: ImportFile[], newId: () => string): ImportedNote[] {
  if (files.length > MAX_NOTES) throw new Error('invalid-request');
  const parsed = files.map(file => {
    const { fields, body } = frontMatter(file.text);
    const stem = (file.path.split(/[\\/]/u).pop() ?? file.path).replace(/\.md$/iu, '');
    const heading = /^\s*#\s+(.+)$/mu.exec(body)?.[1]?.trim();
    const title = (typeof fields.title === 'string' && fields.title) || heading || stem;
    const inlineTags = [...body.matchAll(/(?:^|\s)#([\p{L}\p{N}_/-]{2,60})/gu)].map(match => match[1]);
    return { id: newId(), stem, title: title.slice(0, 300), body, tags: [...new Set([...asList(fields.tags), ...inlineTags])].slice(0, 50), aliases: asList(fields.aliases) };
  });
  const byName = new Map<string, string>();
  for (const note of parsed) { byName.set(note.stem.toLocaleLowerCase(), note.id); byName.set(note.title.toLocaleLowerCase(), note.id); }
  return parsed.map(note => {
    const content = note.body.replace(/(!?)\[\[([^\]|#\n]+)(#[^\]|\n]*)?(?:\|([^\]\n]*))?\]\]/gu, (raw, embed: string, target: string, _anchor: string | undefined, label: string | undefined) => {
      const id = byName.get(target.trim().toLocaleLowerCase());
      return id ? `${embed}[[note:${id}|${(label ?? target).replace(/[[\]|]/gu, ' ').trim()}]]` : raw;
    }).trim();
    if (!content) return null;
    return { id: note.id, title: note.title, content: content.slice(0, MAX_CONTENT), tags: note.tags, aliases: note.aliases };
  }).filter((note): note is ImportedNote => !!note);
}

/** RFC 4180 CSV rows (quoted cells may hold commas, quotes and newlines). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  const source = text.replace(/^﻿/u, '');
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') { cell += '"'; index++; } else if (char === '"') quoted = false; else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(cell); cell = ''; }
    else if (char === '\n' || char === '\r') { if (char === '\r' && source[index + 1] === '\n') index++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(cells => cells.some(value => value.trim()));
}

/** BagLib's own CSV export (title, content, aliases, tags…) back into notes; each row becomes a new note. */
export function importNotesCsv(text: string, newId: () => string): ImportedNote[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  const column = (name: string) => header.findIndex(cell => cell.trim().toLowerCase() === name);
  const title = column('title'), content = column('content'), tags = column('tags'), aliases = column('aliases');
  if (content < 0) throw new Error('invalid-csv');
  if (rows.length > MAX_NOTES) throw new Error('invalid-request');
  const list = (value: string | undefined) => { try { const parsed = JSON.parse(value || '[]'); return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string').slice(0, 50) : []; } catch { return asList(value); } };
  return rows.map(cells => ({ id: newId(), title: (cells[title] ?? '').slice(0, 300), content: (cells[content] ?? '').trim().slice(0, MAX_CONTENT), tags: list(cells[tags]), aliases: list(cells[aliases]) }))
    .filter(note => note.content);
}

const decodeXml = (text: string) => text.replace(/&lt;/gu, '<').replace(/&gt;/gu, '>').replace(/&quot;/gu, '"').replace(/&apos;/gu, "'").replace(/&#(\d+);/gu, (_, code) => String.fromCodePoint(Number(code))).replace(/&#x([\da-f]+);/giu, (_, code) => String.fromCodePoint(parseInt(code, 16))).replace(/&amp;/gu, '&');

/** A Word document's body (word/document.xml) as notes: each Heading 1/2 starts a note; no headings, one note. */
export function importDocxXml(xml: string, fileTitle: string, newId: () => string): ImportedNote[] {
  const paragraphs = [...xml.matchAll(/<w:p[\s>][\s\S]*?<\/w:p>/gu)].map(([paragraph]) => ({
    heading: /<w:pStyle w:val="(?:Heading|heading|Title|عنوان)\s*([12])?"/u.test(paragraph) || /<w:outlineLvl w:val="[01]"/u.test(paragraph),
    text: decodeXml([...paragraph.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>/gu)].map(match => match[1] ?? (match[0] === '<w:tab/>' ? '\t' : '\n')).join('')).trim(),
  })).filter(paragraph => paragraph.text);
  const notes: { title: string; lines: string[] }[] = [];
  for (const paragraph of paragraphs) {
    if (paragraph.heading || !notes.length) notes.push({ title: paragraph.heading ? paragraph.text : fileTitle, lines: paragraph.heading ? [] : [paragraph.text] });
    else notes[notes.length - 1].lines.push(paragraph.text);
  }
  return notes.slice(0, MAX_NOTES).map(note => ({ id: newId(), title: note.title.slice(0, 300), content: (note.lines.join('\n\n') || note.title).slice(0, MAX_CONTENT), tags: [], aliases: [] }));
}

/** One safe folder name (no path separators, reserved names or control characters), Arabic kept. */
export function safeFolderName(name: string): string {
  const cleaned = name.replace(/[\u0000-\u001f\u007f\\/:*?"<>|]/gu, ' ').replace(/\s+/gu, ' ').trim().replace(/[. ]+$/u, '').slice(0, 80);
  return !cleaned || /^(con|prn|aux|nul|com\d|lpt\d)$/iu.test(cleaned) ? '_' : cleaned;
}
