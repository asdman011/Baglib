/**
 * KEY-243: Obsidian-style callouts (`> [!note]`, `> [!tip]`, `> [!warning]` and Arabic labels)
 * in study notes. Pure functions, no DOM.
 */

export type CalloutKind = 'note' | 'tip' | 'warning' | 'ayah' | 'hadith' | 'poem' | 'question' | 'summary';

export interface MarkdownCallout {
  kind: CalloutKind;
  rawType: string;
  title: string;
  /** Document offset of the start of the header line. */
  start: number;
  /** Document offset of the end of the last line in the callout block. */
  end: number;
  /** 1-based line number of the header line. */
  fromLine: number;
  /** 1-based line number of the last line in the callout block. */
  toLine: number;
  /** Document offset right after `> [!type]` (before any trailing space and title). */
  headerMarkerEnd: number;
}

const FENCE = /^[\t ]*(?:`{3,}|~{3,})/u;
const CALLOUT_HEADER = /^([ \t]*>[ \t]*\[!([^\]\n]+)\])(.*)$/u;
const QUOTE_LINE = /^[ \t]*>/u;

const fold = (value: string): string =>
  value
    .trim()
    .normalize('NFC')
    .replace(/[\u064b-\u0652\u0670\u06d6-\u06ed]/gu, '')
    .replace(/[أإآ]/gu, 'ا')
    .toLowerCase();

const CALLOUT_ALIASES: Record<string, CalloutKind> = {
  note: 'note',
  info: 'note',
  ملاحظة: 'note',
  ملاحظه: 'note',
  تنويه: 'note',
  tip: 'tip',
  benefit: 'tip',
  hint: 'tip',
  فائدة: 'tip',
  فائده: 'tip',
  نصيحة: 'tip',
  نصيحه: 'tip',
  warning: 'warning',
  caution: 'warning',
  alert: 'warning',
  تنبيه: 'warning',
  تحذير: 'warning',
  ayah: 'ayah',
  quran: 'ayah',
  اية: 'ayah',
  قران: 'ayah',
  hadith: 'hadith',
  حديث: 'hadith',
  poem: 'poem',
  poetry: 'poem',
  شعر: 'poem',
  question: 'question',
  سؤال: 'question',
  summary: 'summary',
  خلاصة: 'summary',
  خلاصه: 'summary',
};

/** Maps English or Arabic callout type labels to a canonical `CalloutKind`, or `null` if unknown. */
export function normalizeCalloutKind(raw: string): CalloutKind | null {
  return CALLOUT_ALIASES[fold(raw)] ?? null;
}

/**
 * Finds all callout blocks in `content`, skipping fenced code blocks.
 * A callout starts on `> [!type] optional title` and includes contiguous `>` blockquote lines.
 */
export function findMarkdownCallouts(content: string): MarkdownCallout[] {
  const lines = content.split('\n');
  const offsets: { start: number; end: number; text: string }[] = [];
  let pos = 0;
  for (const text of lines) {
    offsets.push({ start: pos, end: pos + text.length, text });
    pos += text.length + 1;
  }

  const callouts: MarkdownCallout[] = [];
  let fenced = false;

  for (let i = 0; i < offsets.length; i++) {
    const line = offsets[i];
    if (FENCE.test(line.text)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;

    const match = CALLOUT_HEADER.exec(line.text);
    if (!match) continue;

    const rawType = match[2].trim();
    const kind: CalloutKind = normalizeCalloutKind(rawType) ?? 'note';
    const title = match[3].trim();
    const headerMarkerEnd = line.start + match[1].length;

    let last = i;
    while (last + 1 < offsets.length) {
      const next = offsets[last + 1];
      if (FENCE.test(next.text) || !QUOTE_LINE.test(next.text) || CALLOUT_HEADER.test(next.text)) break;
      last++;
    }

    callouts.push({
      kind,
      rawType,
      title,
      start: line.start,
      end: offsets[last].end,
      fromLine: i + 1,
      toLine: last + 1,
      headerMarkerEnd,
    });
    i = last;
  }

  return callouts;
}
