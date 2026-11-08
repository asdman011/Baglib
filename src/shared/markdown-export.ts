import { parseNoteTarget, studyLinks, type StudyLink, type StudyNote } from './study-notes';

/**
 * One-way Markdown export of study notes (decision S7). BagLib's database stays the source of truth; the files
 * are a copy the user can open in Obsidian or any editor. Links between exported notes become Obsidian wikilinks
 * (paragraph anchors keep the ` ^id` block syntax, so `[[file#^id]]` still lands on the paragraph). Links to
 * books, ayahs, hadith, poems and lectures keep their BagLib reference as a `baglib:` link with the same label.
 */
export type ExportNote = Pick<StudyNote, 'id' | 'title' | 'content' | 'aliases' | 'tags' | 'createdAt' | 'updatedAt' | 'workId'>;
export interface ExportFile { name: string; text: string }

const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/iu;
const UNSAFE = /[\u0000-\u001f\u007f\\/:*?"<>|#^[\]]/gu;

/** A file name safe on Windows, macOS and Linux and in Obsidian links, without the extension. */
export function safeFileStem(title: string, fallback: string): string {
  let stem = title.replace(UNSAFE, ' ').replace(/\s+/gu, ' ').trim();
  // Keep whole characters: slice by code points so an Arabic letter or emoji is never split.
  stem = [...stem].slice(0, 80).join('').replace(/[ .]+$/u, '').replace(/^[ .]+/u, '');
  if (!stem || RESERVED.test(stem)) stem = [...fallback.replace(UNSAFE, ' ').replace(/\s+/gu, ' ').trim()].slice(0, 80).join('').replace(/[ .]+$/u, '') || 'note';
  if (RESERVED.test(stem)) stem = `${stem} note`;
  return stem;
}

/** Unique file names for notes (case-insensitively, as on Windows and macOS): a repeated title gets " (2)", " (3)". */
export function exportFileNames(notes: Pick<StudyNote, 'id' | 'title' | 'content'>[]): Map<string, string> {
  const used = new Set<string>();
  const names = new Map<string, string>();
  for (const note of notes) {
    const firstLine = note.content.split('\n').map(line => line.replace(/^#+\s*/u, '').trim()).find(Boolean) ?? '';
    const stem = safeFileStem(note.title, firstLine || note.id);
    let name = stem;
    for (let index = 2; used.has(name.toLowerCase()); index++) name = `${stem} (${index})`;
    used.add(name.toLowerCase());
    names.set(note.id, name);
  }
  return names;
}

/** YAML double-quoted scalar (JSON strings are valid YAML). */
const yaml = (value: string) => JSON.stringify(value);

function frontMatter(note: ExportNote, bookTitle?: string): string {
  const lines = ['---', `baglib_id: ${yaml(note.id)}`];
  if (note.title) lines.push(`title: ${yaml(note.title)}`);
  if (note.aliases.length) lines.push('aliases:', ...note.aliases.map(alias => `  - ${yaml(alias)}`));
  // Obsidian tags cannot hold spaces; keep the words joined so the tag still matches across files.
  if (note.tags.length) lines.push('tags:', ...note.tags.map(tag => `  - ${yaml(tag.replace(/\s+/gu, '_'))}`));
  if (bookTitle) lines.push(`book: ${yaml(bookTitle)}`);
  lines.push(`created: ${yaml(note.createdAt)}`, `updated: ${yaml(note.updatedAt)}`, '---', '');
  return lines.join('\n');
}

const escapeLabel = (label: string) => label.replace(/[[\]]/gu, '\\$&');

/** The note body with BagLib links rewritten for a folder of Markdown files. */
export function exportNoteBody(content: string, names: Map<string, string>): string {
  let output = '';
  let last = 0;
  for (const link of studyLinks(content)) {
    output += content.slice(last, link.start);
    last = link.end;
    const text = exportOneLink(link, names);
    // A typed relationship becomes a Dataview inline field around the link: `[supports:: [[file|label]]]`.
    output += link.relation ? `[${link.relation}:: ${text}]` : text;
  }
  return output + content.slice(last);
}

function exportOneLink(link: StudyLink, names: Map<string, string>): string {
  const note = parseNoteTarget(link.target);
  if (!note) return `[${escapeLabel(link.label)}](<baglib:${link.target}>)`;
  const file = names.get(note.id);
  // A note left out of this export has no file to point at: keep its words.
  if (!file) return link.label;
  const label = link.label.replace(/[|\]]/gu, ' ');
  return `${link.embed ? '!' : ''}[[${file}${note.anchor ? `#^${note.anchor}` : ''}|${label}]]`;
}

/** Every note as a Markdown file with front matter. `books` maps a work id to its title. */
export function exportNotesAsMarkdown(notes: ExportNote[], books: Map<string, string> = new Map()): ExportFile[] {
  const names = exportFileNames(notes);
  return notes.map(note => ({
    name: `${names.get(note.id)}.md`,
    text: `${frontMatter(note, note.workId ? books.get(note.workId) : undefined)}${exportNoteBody(note.content, names).replace(/\s*$/u, '')}\n`,
  }));
}

/** A new folder name inside the folder the user picked, so nothing already there is overwritten. */
export function exportFolderName(date: Date, exists: (name: string) => boolean): string {
  // The user's own calendar day, not UTC.
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const base = `BagLib notes ${day}`;
  let name = base;
  for (let index = 2; exists(name); index++) name = `${base} (${index})`;
  return name;
}
