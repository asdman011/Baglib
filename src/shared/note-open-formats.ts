import type { ExportFile, ExportNote } from './markdown-export';

/** Quoted UTF-8 CSV cells retain commas, newlines, quotes and Arabic code points. */
export function exportNotesAsCsv(notes: ExportNote[]): string {
  const cell = (value: string) => `"${value.replace(/"/gu, '""')}"`;
  const rows = notes.map(note => [note.id, note.title, note.content, JSON.stringify(note.aliases), JSON.stringify(note.tags), note.workId ?? '', note.createdAt, note.updatedAt]);
  return '\uFEFF' + [['baglib_id', 'title', 'content', 'aliases', 'tags', 'work_id', 'created', 'updated'], ...rows].map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
}

const TEX_ESCAPES: Record<string, string> = {
  '\\': '\\textbackslash{}', '{': '\\{', '}': '\\}', '$': '\\$', '&': '\\&', '#': '\\#', '%': '\\%', '_': '\\_', '~': '\\textasciitilde{}', '^': '\\textasciicircum{}',
};
const escapeTex = (text: string) => text.replace(/[\\{}$&#%_~^]/gu, char => TEX_ESCAPES[char]);

/** Script runs include combining marks, Arabic punctuation and Arabic-Indic digits. */
export function latexText(text: string): string {
  return text.split(/(\p{Script_Extensions=Arabic}+(?:[ \t]+\p{Script_Extensions=Arabic}+)*)/gu)
    .map((part, index) => index % 2 ? `\\textarabic{${escapeTex(part)}}` : escapeTex(part)).join('');
}

/** Standalone XeLaTeX/LuaLaTeX source. Body Markdown stays literal, safely escaped. */
export function exportNotesAsLatex(notes: ExportNote[]): string {
  const body = notes.map(note => `\\section*{${latexText(note.title)}}\n${note.content.split(/\r?\n/u).map(line => line ? `\\noindent ${latexText(line)}\\par` : '\\medskip').join('\n')}`).join('\n\n');
  return `\\documentclass{article}\n\\usepackage{fontspec}\n\\usepackage{polyglossia}\n\\setdefaultlanguage{english}\n\\setotherlanguage{arabic}\n\\newfontfamily\\arabicfont[Script=Arabic]{Amiri}\n\\begin{document}\n${body}\n\\end{document}\n`;
}

interface ParsedNote {
  file: ExportFile;
  fields: Record<string, unknown>;
  body: string;
}

/** Parse only BagLib's emitted JSON-compatible YAML subset, without executing YAML tags. */
function parseFile(file: ExportFile): ParsedNote {
  if (file.text.length > 2_000_000 || !file.name.toLowerCase().endsWith('.md')) throw new Error('invalid-markdown');
  const match = /^\uFEFF?---\r?\n([^]*?)\r?\n---\r?\n/u.exec(file.text);
  if (!match) throw new Error('invalid-markdown');
  const fields: Record<string, unknown> = Object.create(null);
  let arrayKey = '';
  for (const line of match[1].split(/\r?\n/u)) {
    const item = /^  - (.*)$/u.exec(line);
    if (item && arrayKey) {
      (fields[arrayKey] as unknown[]).push(JSON.parse(item[1]));
      continue;
    }
    const field = /^(\w+):(?: (.*))?$/u.exec(line);
    if (!field) throw new Error('invalid-markdown');
    const [, key, value] = field;
    if (Object.hasOwn(fields, key)) throw new Error('invalid-markdown');
    fields[key] = value === undefined ? [] : JSON.parse(value);
    arrayKey = value === undefined ? key : '';
  }
  if (typeof fields.baglib_id !== 'string' || !/^[\w-]{1,180}$/u.test(fields.baglib_id)) throw new Error('invalid-markdown');
  return { file, fields, body: file.text.slice(match[0].length) };
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 50 || value.some(item => typeof item !== 'string' || item.length > 200)) throw new Error('invalid-markdown');
  return value as string[];
}

/** Import current and older BagLib exports, resolving folder wikilinks by baglib_id. */
export function importNotesFromMarkdown(files: ExportFile[]): ExportNote[] {
  const parsed = files.map(parseFile);
  const names = new Map(parsed.map(note => [note.file.name.replace(/\.md$/iu, ''), note.fields.baglib_id as string]));
  const notes = parsed.map(({ fields, body }) => {
    const roundtrip = fields.baglib_roundtrip as { content?: unknown; body?: unknown; tags?: unknown; workId?: unknown } | undefined;
    const unchangedBody = roundtrip && body === roundtrip.body;
    const candidate = unchangedBody ? roundtrip.content : body;
    if (typeof candidate !== 'string') throw new Error('invalid-markdown');
    let content: string = candidate;
    if (!unchangedBody) {
      content = content.replace(/(!?)\[\[([^\]|\n]+)(?:\|([^\]\n]*))?\]\]/gu, (raw, embed, target: string, label?: string) => {
        const [stem, anchor] = target.split('#^');
        const id = names.get(stem);
        return id ? `${embed}[[note:${id}${anchor ? `#^${anchor}` : ''}${label === undefined ? '' : `|${label}`}]]` : raw;
      }).replace(/\[([^\]\n]*)\]\(<baglib:([^>\n]+)>\)/gu, '[[$2|$1]]')
        .replace(/\[([\p{L}\p{M}\p{N}_-]{1,24}):: (!?\[\[)([^]*?)\]\]\]/gu, '$2$1::$3]]');
    }
    const title = fields.title ?? '';
    if (typeof title !== 'string' || title.length > 300 || !content.trim() || content.length > 100_000) throw new Error('invalid-markdown');
    const aliases = stringArray(fields.aliases ?? []);
    let tags = stringArray(fields.tags ?? []);
    if (roundtrip?.tags) {
      const original = stringArray(roundtrip.tags);
      if (JSON.stringify(tags) === JSON.stringify(original.map(tag => tag.replace(/\s+/gu, '_')))) tags = original;
    }
    const createdAt = fields.created, updatedAt = fields.updated;
    if (typeof createdAt !== 'string' || typeof updatedAt !== 'string' || !Number.isFinite(Date.parse(createdAt)) || !Number.isFinite(Date.parse(updatedAt))) throw new Error('invalid-markdown');
    const workId = roundtrip?.workId;
    if (workId != null && (typeof workId !== 'string' || !/^[\w-]{1,180}$/u.test(workId))) throw new Error('invalid-markdown');
    return { id: fields.baglib_id as string, title, content, aliases, tags, createdAt, updatedAt, ...(workId ? { workId } : {}) };
  });
  const unique = new Map<string, ExportNote>();
  for (const note of notes) {
    const previous = unique.get(note.id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(note)) throw new Error('duplicate-markdown-id');
    unique.set(note.id, note);
  }
  return [...unique.values()];
}
