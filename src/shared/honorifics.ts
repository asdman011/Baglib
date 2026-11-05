/**
 * Honorifics typed as short triggers and expanded in place (decision S1, on by default).
 * Bracketed Arabic triggers expand as soon as the closing bracket is typed; Latin abbreviations expand when
 * followed by a space or punctuation, and only as whole upper-case words, so "SWTICH" or "pbuhx" stay as typed.
 */
export const HONORIFICS: readonly { trigger: string; text: string; word?: boolean }[] = [
  { trigger: '(ص)', text: 'ﷺ' },
  { trigger: '(ج)', text: 'ﷻ' },
  { trigger: '(رض)', text: 'رضي الله عنه' },
  { trigger: '(رضها)', text: 'رضي الله عنها' },
  { trigger: '(رضهم)', text: 'رضي الله عنهم' },
  { trigger: '(رح)', text: 'رحمه الله' },
  { trigger: 'PBUH', text: 'ﷺ', word: true },
  { trigger: 'SAW', text: 'ﷺ', word: true },
  { trigger: 'SWT', text: 'سبحانه وتعالى', word: true },
];

const DELIMITER = /[\s.,;:!?،؛؟)\]]/u;

/**
 * The expansion due when `before` (the line up to and including the character just typed) ends a trigger:
 * the range to replace in `before` and its replacement. Null when nothing should change.
 */
export function honorificExpansion(before: string): { from: number; to: number; text: string } | null {
  for (const item of HONORIFICS) {
    if (!item.word) {
      if (before.endsWith(item.trigger)) return { from: before.length - item.trigger.length, to: before.length, text: item.text };
      continue;
    }
    const last = before.slice(-1);
    if (!DELIMITER.test(last)) continue;
    const body = before.slice(0, -1);
    if (!body.endsWith(item.trigger)) continue;
    const start = body.length - item.trigger.length;
    if (start > 0 && /[\p{L}\p{N}_]/u.test(body[start - 1])) continue;
    return { from: start, to: body.length, text: item.text };
  }
  return null;
}

export const HONORIFICS_SETTING = 'notes.honorifics.autoExpand.v1';
