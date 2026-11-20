/**
 * Baglib — Anki-compatible Template Engine & Card Generation (ADR-017 / KEY-390)
 *
 * Implements:
 * - {{Field}}, {{FrontSide}}
 * - {{#Field}}...{{/Field}}, {{^Field}}...{{/Field}}
 * - {{text:Field}}, {{hint:Field}}
 * - {{cloze:Field}} with hints, multi-card c1,2 and nesting
 * - {{type:Field}}, {{type:nc:Field}}
 * - {{tts lang:Field}}, {{tts lang:cloze-only:Field}}
 * - Character diff algorithm (with type:nc combining mark normalization)
 * - Card generation following Anki's non-empty front rule
 */

import { poetryBayts } from '../poetry';
import { IMAGE_OCCLUSION_PREFIX, renderImageOcclusion } from './image-occlusion';
import type { CardNoteType, GeneratedCard } from '../types/card-notes';

export interface RenderContext {
  fields: Record<string, string>;
  cardOrd?: number; // 0-based template or cloze index
  clozeNum?: number; // 1-based cloze number (e.g. 1 for c1)
  frontRendered?: string; // For {{FrontSide}}
  typedAnswer?: string; // For {{type:Field}} back diff
}

/** Strips all HTML tags from a string. */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/gu, '').replace(/&(?:nbsp|#160|#x0*a0);/giu, ' ');
}

/** Removes unicode combining marks (e.g., Arabic tashkeel / harakat, accents). */
export function removeCombiningMarks(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');
}

/** Check if field content is non-empty (ignoring whitespace and empty HTML tags). */
export function isFieldTruthy(val: string | undefined | null): boolean {
  if (!val) return false;
  const stripped = stripHtml(val).trim();
  if (stripped.length > 0) return true;
  return /<(img|svg|audio|video|iframe)\b/iu.test(val);
}

/** Find all cloze numbers present in the field values (e.g. [1, 2]). */
export function extractClozeNumbers(text: string): number[] {
  const clozeRegex = /\{\{c(\d+(?:,\d+)*)::/gu;
  const numbers = new Set<number>();
  let match: RegExpExecArray | null;
  while ((match = clozeRegex.exec(text)) !== null) {
    const parts = match[1].split(',');
    for (const p of parts) {
      const n = parseInt(p.trim(), 10);
      if (Number.isSafeInteger(n) && n > 0) {
        numbers.add(n);
      }
    }
  }
  return [...numbers].sort((a, b) => a - b);
}

interface ClozeSpan {
  start: number;
  end: number;
  clozeNums: number[];
  body: string;
  hint: string | null;
}

function findTopLevelClozes(text: string): ClozeSpan[] {
  const spans: ClozeSpan[] = [];
  const startRegex = /\{\{c(\d+(?:,\d+)*)::/gu;
  let match: RegExpExecArray | null;

  while ((match = startRegex.exec(text)) !== null) {
    const startIndex = match.index;
    const prefixLen = match[0].length;
    // Ordinal 0 is kept: image occlusion uses it for always-shown text labels (KEY-391).
    const clozeNums = match[1].split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isSafeInteger(n) && n >= 0);

    let depth = 1;
    let curr = startIndex + prefixLen;
    let hintSepIndex = -1;
    // Anki never reads a hint inside an image-occlusion cloze; its text may contain an escaped `::`.
    const noHint = text.startsWith(IMAGE_OCCLUSION_PREFIX, curr);

    while (curr < text.length && depth > 0) {
      if (text.startsWith('{{', curr)) {
        depth++;
        curr += 2;
      } else if (text.startsWith('}}', curr)) {
        depth--;
        if (depth === 0) {
          break;
        }
        curr += 2;
      } else if (!noHint && depth === 1 && text.startsWith('::', curr) && hintSepIndex === -1) {
        hintSepIndex = curr;
        curr += 2;
      } else {
        curr++;
      }
    }

    if (depth === 0) {
      const endIndex = curr + 2;
      let body: string;
      let hint: string | null = null;
      if (hintSepIndex !== -1) {
        body = text.slice(startIndex + prefixLen, hintSepIndex);
        hint = text.slice(hintSepIndex + 2, curr);
      } else {
        body = text.slice(startIndex + prefixLen, curr);
      }

      spans.push({
        start: startIndex,
        end: endIndex,
        clozeNums,
        body,
        hint,
      });

      startRegex.lastIndex = endIndex;
    }
  }

  return spans;
}

/**
 * Process clozes in text for a specific cloze number.
 * Supports nesting and multi-card c1,2.
 */
export function processClozes(
  text: string,
  targetClozeNum: number,
  side: 'front' | 'back'
): { rendered: string; clozeTexts: string[] } {
  const matchedTexts: string[] = [];

  function transform(input: string): string {
    const clozes = findTopLevelClozes(input);
    if (clozes.length === 0) return input;

    let result = '';
    let lastPos = 0;

    for (const c of clozes) {
      result += input.slice(lastPos, c.start);
      const isMatch = c.clozeNums.includes(targetClozeNum);

      // Image occlusion: Anki renders a hidden shape <div> that the review script draws (KEY-391).
      if (c.body.startsWith(IMAGE_OCCLUSION_PREFIX)) {
        result += renderImageOcclusion(c.body.slice(IMAGE_OCCLUSION_PREFIX.length), side === 'front', isMatch, c.clozeNums);
        lastPos = c.end;
        continue;
      }

      if (isMatch) {
        // Collect text without inner cloze markers
        const plainBody = c.body.replace(/\{\{c\d+(?:,\d+)*::([\s\S]*?)(?:::[\s\S]*?)?\}\}/gu, '$1');
        matchedTexts.push(plainBody);

        if (side === 'front') {
          const display = c.hint ? `[${c.hint}]` : '[...]';
          result += `<span class="cloze">${display}</span>`;
        } else {
          // On back: render cloze text
          const innerRendered = transform(c.body);
          result += `<span class="cloze">${innerRendered}</span>`;
        }
      } else {
        // Non-matching cloze: unwrap and process inner clozes
        result += transform(c.body);
      }

      lastPos = c.end;
    }

    result += input.slice(lastPos);
    return result;
  }

  const rendered = transform(text);
  return { rendered, clozeTexts: matchedTexts };
}

/**
 * Character-level diff comparison between typed answer and expected answer.
 * If ignoreCombining (type:nc) is true, combines marks are stripped for comparison.
 */
export function computeTypeDiff(
  typed: string,
  expected: string,
  ignoreCombining = false
): {
  html: string;
  isCorrect: boolean;
} {
  const normTyped = ignoreCombining ? removeCombiningMarks(typed) : typed;
  const normExpected = ignoreCombining ? removeCombiningMarks(expected) : expected;

  const isCorrect = normTyped.trim() === normExpected.trim();

  // Simple longest common subsequence / character diff
  const tChars = [...typed];
  const eChars = [...expected];
  const ntChars = [...normTyped];
  const neChars = [...normExpected];

  // LCS table on normalized chars
  const m = ntChars.length;
  const n = neChars.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (ntChars[i] === neChars[j]) {
        dp[i + 1][j + 1] = dp[i][j] + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  // Backtrack to build diff
  let i = m;
  let j = n;
  interface DiffItem {
    type: 'good' | 'bad' | 'missing';
    char: string;
  }
  const diffItems: DiffItem[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && ntChars[i - 1] === neChars[j - 1]) {
      diffItems.push({ type: 'good', char: eChars[j - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      diffItems.push({ type: 'missing', char: eChars[j - 1] });
      j--;
    } else if (i > 0) {
      diffItems.push({ type: 'bad', char: tChars[i - 1] });
      i--;
    }
  }

  diffItems.reverse();

  let html = '<div class="type-diff">';
  for (const item of diffItems) {
    const escaped = item.char === ' ' ? '&nbsp;' : item.char.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;');
    if (item.type === 'good') {
      html += `<span class="type-good">${escaped}</span>`;
    } else if (item.type === 'bad') {
      html += `<span class="type-bad">${escaped}</span>`;
    } else {
      html += `<span class="type-missed">${escaped}</span>`;
    }
  }
  html += '</div>';

  return { html, isCorrect };
}

/**
 * Render a single template string with fields and context.
 */
export function renderTemplate(
  template: string,
  context: RenderContext,
  side: 'front' | 'back'
): string {
  let result = template;

  // 1. FrontSide replacement on back
  if (side === 'back') {
    let frontSide = context.frontRendered ?? '';
    // Strip {{type:...}} or type input controls from FrontSide
    frontSide = frontSide.replace(/<span class="type-input-marker"[^>]*>.*?<\/span>/giu, '');
    frontSide = frontSide.replace(/<input class="type-answer-input"[^>]*>/giu, '');
    result = result.replace(/\{\{FrontSide\}\}/gu, frontSide);
  }

  // 2. Conditionals: {{#Field}}...{{/Field}} and {{^Field}}...{{/Field}}
  const condRegex = /\{\{([#^])([^}]+)\}\}([\s\S]*?)\{\{\/\2\}\}/u;
  let condMatch: RegExpExecArray | null;
  while ((condMatch = condRegex.exec(result)) !== null) {
    const type = condMatch[1]; // '#' or '^'
    const fieldName = condMatch[2].trim();
    const innerContent = condMatch[3];
    const isTruthy = isFieldTruthy(context.fields[fieldName]);

    let replacement = '';
    if (type === '#') {
      replacement = isTruthy ? innerContent : '';
    } else {
      // '^' inverted
      replacement = !isTruthy ? innerContent : '';
    }
    result = result.slice(0, condMatch.index) + replacement + result.slice(condMatch.index + condMatch[0].length);
  }

  // 3. Modifiers and tags: {{modifier:Field}} or {{Field}}
  const tagRegex = /\{\{([^#^/}][^}]*)\}\}/gu;
  result = result.replace(tagRegex, (_full, tagContent: string) => {
    const trimmed = tagContent.trim();

    // cloze:Field
    if (trimmed.startsWith('cloze:')) {
      const fieldName = trimmed.slice(6).trim();
      const rawText = context.fields[fieldName] ?? '';
      const clozeNum = context.clozeNum ?? 1;
      const { rendered } = processClozes(rawText, clozeNum, side);
      return rendered;
    }

    // text:Field
    if (trimmed.startsWith('text:')) {
      const fieldName = trimmed.slice(5).trim();
      const raw = context.fields[fieldName] ?? '';
      return stripHtml(raw);
    }

    // hint:Field
    if (trimmed.startsWith('hint:')) {
      const fieldName = trimmed.slice(5).trim();
      const raw = context.fields[fieldName] ?? '';
      if (!isFieldTruthy(raw)) return '';
      return `<details class="hint"><summary>Show Hint</summary><div class="hint-body">${raw}</div></details>`;
    }

    // type:nc:Field or type:Field
    if (trimmed.startsWith('type:')) {
      const isNc = trimmed.startsWith('type:nc:');
      const fieldName = isNc ? trimmed.slice(8).trim() : trimmed.slice(5).trim();
      const expected = context.fields[fieldName] ?? '';

      if (side === 'front') {
        return `<span class="type-input-marker" data-field="${fieldName}" data-nc="${isNc ? '1' : '0'}"><input type="text" class="type-answer-input" autocomplete="off" spellcheck="false" /></span>`;
      } else {
        // On back: show diff
        const typed = context.typedAnswer ?? '';
        const diff = computeTypeDiff(typed, expected, isNc);
        return `<div class="type-answer-comparison" data-field="${fieldName}" data-expected="${encodeURIComponent(expected)}" data-typed="${encodeURIComponent(typed)}"><div class="type-expected-label">${expected}</div>${diff.html}</div>`;
      }
    }

    // tts lang:cloze-only:Field or tts lang:Field
    if (trimmed.startsWith('tts ')) {
      const rest = trimmed.slice(4).trim();
      const parts = rest.split(':');
      let lang = 'en_US';
      let isClozeOnly = false;
      let fieldName = '';

      if (parts.length === 2) {
        lang = parts[0].trim();
        fieldName = parts[1].trim();
      } else if (parts.length >= 3) {
        lang = parts[0].trim();
        isClozeOnly = parts[1].trim() === 'cloze-only';
        fieldName = parts[2].trim();
      }

      const raw = context.fields[fieldName] ?? '';
      let spoken = stripHtml(raw);
      if (isClozeOnly) {
        const clozeNum = context.clozeNum ?? 1;
        const { clozeTexts } = processClozes(raw, clozeNum, 'back');
        spoken = clozeTexts.join(' ');
      }

      return `<span class="tts-marker" data-lang="${lang}" data-cloze-only="${isClozeOnly ? '1' : '0'}" data-text="${encodeURIComponent(spoken)}"><button type="button" class="tts-play-btn" data-lang="${lang}" data-text="${encodeURIComponent(spoken)}">🔊</button></span>`;
    }

    // Default: {{Field}}
    return context.fields[trimmed] ?? '';
  });

  return result;
}

/**
 * A short plain-text search term for a card's front, for "compare similar items" on a leech
 * (KEY-397): the prompted verse of a context-cloze card (not its anchor), otherwise the front's
 * text, without markup or the "[...]" cloze placeholder.
 */
export function cardSearchTerm(front: string, max = 40): string {
  const target = /<div class="cloze-target">([\s\S]*?)<\/div>/u.exec(front)?.[1] ?? front;
  const text = target
    .replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/giu, ' ')
    .replace(/<[^>]*>/gu, ' ')
    .replace(/\[\.\.\.\]|\[…\]/gu, ' ')
    .replace(/&nbsp;/gu, ' ')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&amp;/gu, '&')
    .replace(/\s+/gu, ' ')
    .trim();
  return text.slice(0, max).trim();
}

/** The built-in context-cloze template, used when a context-cloze type has none. */
export const DEFAULT_CONTEXT_CLOZE_TEMPLATE = {
  ord: 0,
  name: 'Context Card',
  front: '<div class="context-before">{{Context Before}}</div>\n<div class="cloze-target">{{cloze:Target}}</div>\n<div class="context-after context-blurred">{{Context After}}</div>',
  back: '<div class="context-before">{{Context Before}}</div>\n<div class="cloze-target">{{cloze:Target}}</div>\n<div class="context-after">{{Context After}}</div>\n\n<hr id=answer>\n\n<div class="notes">{{Notes}}</div>',
};

function contextClozeBayts(fields: Record<string, string>) {
  const textToSplit = fields['Target'] || fields['Poem'] || fields['Text'] || Object.values(fields)[0] || '';
  return poetryBayts(textToSplit.split(/\r?\n/u).map(s => s.trim()).filter(Boolean));
}

/**
 * The fields one progressive-context-cloze card renders with (card `ord` = bayt index), or null
 * when the note has no such bayt. Card generation and the review screens share this, so a card
 * looks the same wherever it is shown.
 *
 * KEY-397: the two hemistichs are laid out side by side (.bayt in the note type's CSS). "Whole
 * verse" hides the whole bayt instead of only the ajuz; "Chunk" (the daily quota) makes the
 * blurred lookahead show the rest of that day's chunk, not just the next bayt.
 */
export function contextClozeCardFields(fields: Record<string, string>, ord: number): Record<string, string> | null {
  const bayts = contextClozeBayts(fields);
  if (ord < 0 || ord >= bayts.length) return null;
  const showBayt = (b: { sadr: string; ajuz: string | null }) =>
    b.ajuz ? `<span class="bayt" dir="auto"><span class="sadr">${b.sadr}</span> <span class="ajuz">${b.ajuz}</span></span>` : `<span class="bayt" dir="auto"><span class="sadr">${b.sadr}</span></span>`;
  const wholeVerse = isFieldTruthy(fields['Whole verse'] ?? '');
  const chunk = Math.max(0, Math.min(100, Number.parseInt((fields['Chunk'] ?? '').trim(), 10) || 0));
  const i = ord;
  const current = bayts[i];
  const target = wholeVerse
    ? `{{c1::${showBayt(current)}}}`
    : current.ajuz
      ? `<span class="bayt" dir="auto"><span class="sadr">${current.sadr}</span> <span class="ajuz">{{c1::${current.ajuz}}}</span></span>`
      : `<span class="bayt" dir="auto"><span class="sadr">{{c1::${current.sadr}}}</span></span>`;
  const lookaheadEnd = chunk > 0 ? Math.max(i + 1, (Math.floor(i / chunk) + 1) * chunk - 1) : i + 1;
  return {
    ...fields,
    'Context Before': i > 0 ? showBayt(bayts[i - 1]) : '',
    Target: target,
    'Context After': bayts.slice(i + 1, Math.min(bayts.length, lookaheadEnd + 1)).map(showBayt).join(''),
  };
}

/**
 * Generate cards for a note according to its note type and fields.
 * Follows Anki rules:
 * - A card is generated only when its front renders non-empty.
 * - Cloze note types generate one card per cloze number.
 * - Context cloze note types generate progressive cards for poetry/isnad.
 */
export function generateCards(
  noteType: CardNoteType,
  fields: Record<string, string>,
  existingCards: Array<{ ord: number }> = []
): GeneratedCard[] {
  const cards: GeneratedCard[] = [];

  if (noteType.kind === 'cloze' || noteType.kind === 'image_occlusion') {
    let allText = '';
    for (const val of Object.values(fields)) {
      allText += val + ' ';
    }
    const clozeNumbers = extractClozeNumbers(allText);
    const template = noteType.templates[0] || {
      ord: 0,
      name: 'Cloze',
      front: '{{cloze:Text}}',
      back: '{{cloze:Text}}\n\n<hr id=answer>\n\n{{Back Extra}}',
    };

    for (let i = 0; i < clozeNumbers.length; i++) {
      const clozeNum = clozeNumbers[i];
      const ord = clozeNum - 1; // 0-based ord matching Anki cloze ordinal
      const front = renderTemplate(template.front, { fields, clozeNum, cardOrd: ord }, 'front');
      if (isFieldTruthy(front)) {
        const back = renderTemplate(template.back, { fields, clozeNum, cardOrd: ord, frontRendered: front }, 'back');
        cards.push({ ord, front, back });
      }
    }
  } else if (noteType.kind === 'context_cloze') {
    const bayts = contextClozeBayts(fields);
    const template = noteType.templates[0] || DEFAULT_CONTEXT_CLOZE_TEMPLATE;

    if (bayts.length > 0) {
      for (let i = 0; i < bayts.length; i++) {
        const ord = i;
        const itemFields = contextClozeCardFields(fields, ord)!;
        const front = renderTemplate(template.front, { fields: itemFields, clozeNum: 1, cardOrd: ord }, 'front');
        if (isFieldTruthy(front)) {
          const back = renderTemplate(template.back, { fields: itemFields, clozeNum: 1, cardOrd: ord, frontRendered: front }, 'back');
          cards.push({ ord, front, back });
        }
      }
    } else {
      const front = renderTemplate(template.front, { fields, clozeNum: 1, cardOrd: 0 }, 'front');
      if (isFieldTruthy(front)) {
        const back = renderTemplate(template.back, { fields, clozeNum: 1, cardOrd: 0, frontRendered: front }, 'back');
        cards.push({ ord: 0, front, back });
      }
    }
  } else {
    for (const t of noteType.templates) {
      const ord = t.ord;
      const front = renderTemplate(t.front, { fields, cardOrd: ord }, 'front');
      if (isFieldTruthy(front)) {
        const back = renderTemplate(t.back, { fields, cardOrd: ord, frontRendered: front }, 'back');
        cards.push({ ord, front, back });
      }
    }
  }

  const generatedOrds = new Set(cards.map(c => c.ord));
  for (const existing of existingCards) {
    if (!generatedOrds.has(existing.ord)) {
      cards.push({
        ord: existing.ord,
        front: '',
        back: '',
        empty: true,
      });
    }
  }

  return cards;
}
