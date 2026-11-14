/**
 * Text direction per line of a note (KEY-243): the editor and the note view set `dir` on each block, so a note that
 * mixes Arabic and Latin reads correctly line by line. Pure functions, no DOM.
 */
export type TextDirection = 'rtl' | 'ltr';

function isStrongRtl(codePoint: number): boolean {
  // Hebrew.
  if (codePoint >= 0x0590 && codePoint <= 0x05ff) return true;
  if (codePoint >= 0x0600 && codePoint <= 0x06ff) {
    if (codePoint >= 0x0660 && codePoint <= 0x0669) return false; // Arabic-Indic digits
    if (codePoint >= 0x06f0 && codePoint <= 0x06f9) return false; // extended Arabic-Indic digits
    if (codePoint === 0x060c || codePoint === 0x061b || codePoint === 0x061f) return false; // Arabic punctuation
    if (codePoint >= 0x066a && codePoint <= 0x066d) return false; // Arabic percent, decimal separator, star, ring
    if (codePoint >= 0x064b && codePoint <= 0x065f) return false; // tashkeel
    if (codePoint === 0x0670) return false; // superscript alef
    if (codePoint >= 0x06d6 && codePoint <= 0x06ed) return false; // Quranic annotations and marks
    return true;
  }
  if (codePoint >= 0x0750 && codePoint <= 0x077f) return true; // Arabic Supplement
  if (codePoint >= 0x08a0 && codePoint <= 0x08ff) return true; // Arabic Extended-A
  if (codePoint >= 0xfb50 && codePoint <= 0xfdff) return true; // Arabic Presentation Forms-A
  if (codePoint >= 0xfe70 && codePoint <= 0xfeff) return true; // Arabic Presentation Forms-B
  return false;
}

function isStrongLtr(codePoint: number): boolean {
  if ((codePoint >= 0x41 && codePoint <= 0x5a) || (codePoint >= 0x61 && codePoint <= 0x7a)) return true;
  // Latin-1 Supplement and Latin Extended-A/B, without the multiplication and division signs.
  if (codePoint >= 0x00c0 && codePoint <= 0x024f) return codePoint !== 0x00d7 && codePoint !== 0x00f7;
  return false;
}

/** The direction of the first strong character: Arabic or Hebrew for `rtl`, a Latin letter for `ltr`; null when the text has none. */
export function firstStrongDirection(text: string): TextDirection | null {
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (isStrongRtl(codePoint)) return 'rtl';
    if (isStrongLtr(codePoint)) return 'ltr';
  }
  return null;
}

/** Markdown block markers that sit before the text of a line; they never decide its direction. */
const BLOCK_MARKERS: RegExp[] = [
  /^[\t ]+/u, // indentation
  /^(?:>[ \t]*)+\[![^\]\n]*\][ \t]*/u, // blockquote callout header: `> [!note]`
  /^>[ \t]*/u, // blockquote
  /^#{1,6}(?:[ \t]+|$)/u, // heading marks: `# Title`
  /^[-*+][ \t]+/u, // list bullet
  /^[0-9٠-٩۰-۹]{1,9}[.)][ \t]+/u, // ordered marker, also with Arabic-Indic digits
  /^\[[ xX]\](?:[ \t]+|$)/u, // task box: `[ ]`, `[x]`
  /^\|[ \t]*/u, // table row
];

function withoutBlockMarkers(line: string): string {
  let rest = line;
  for (;;) {
    let next = rest;
    for (const marker of BLOCK_MARKERS) next = next.replace(marker, '');
    if (next === rest) return rest;
    rest = next;
  }
}

/**
 * Removes inline Markdown constructs that must not decide a line's direction: URLs, inline code, link targets,
 * footnote markers. A Markdown link keeps its text and a wiki/study link keeps its label (or its target).
 */
function withoutIgnoredInline(text: string): string {
  return text
    .replace(/https?:\/\/\S+/gu, ' ')
    .replace(/`[^`]*`/gu, ' ')
    .replace(/\[\[([^[\]\n]*)\|([^[\]\n]*)\]\]/gu, (_match, _target: string, label: string) => label)
    .replace(/\[\[([^[\]\n]*)\]\]/gu, (_match, target: string) => target)
    .replace(/\[\^[^\]\n]*\]/gu, ' ')
    .replace(/\]\([^)\n]*\)/gu, ']');
}

function lineStrongDirection(line: string): TextDirection | null {
  return firstStrongDirection(withoutIgnoredInline(withoutBlockMarkers(line)));
}

/** The direction of a Markdown line, from its first strong character once Markdown syntax and link targets are ignored. */
export function markdownLineDirection(line: string, fallback: TextDirection): TextDirection {
  return lineStrongDirection(line) ?? fallback;
}

/** A fence line: ``` or ~~~, with optional indentation and an info string. */
const FENCE = /^[\t ]*(?:`{3,}|~{3,})/u;

/**
 * One direction per line of a Markdown note. A line with no strong character inherits the direction of the previous
 * line of its block; the first line of a block uses `fallback`. Fenced code, fence lines included, is always `ltr`.
 */
export function markdownBlockDirections(content: string, fallback: TextDirection): TextDirection[] {
  const directions: TextDirection[] = [];
  let blockDirection: TextDirection | null = null;
  let fence = false;
  for (const line of content.split('\n')) {
    if (FENCE.test(line)) {
      fence = !fence;
      blockDirection = null;
      directions.push('ltr');
      continue;
    }
    if (fence) {
      directions.push('ltr');
      continue;
    }
    if (!line.trim()) {
      directions.push(blockDirection ?? fallback);
      blockDirection = null;
      continue;
    }
    const direction: TextDirection = lineStrongDirection(line) ?? blockDirection ?? fallback;
    directions.push(direction);
    blockDirection = direction;
  }
  return directions;
}
