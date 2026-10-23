export interface TTSReadableSentence {
  text: string;
  startIndex: number;
  endIndex: number;
}

const NAVIGATION_LABELS = /^(back|next|previous|close|menu|settings|contents|table of contents|search)$/i;

export function cleanReadableText(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<button[\s\S]*?<\/button>/gi, ' ')
    .replace(/<input\b[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line && !NAVIGATION_LABELS.test(line))
    .join('\n')
    .trim();
}

export function segmentTextIntoSentences(input: string): TTSReadableSentence[] {
  const text = cleanReadableText(input);
  if (!text) return [];

  const result: TTSReadableSentence[] = [];
  const boundary = /[.!?؟؛。！？]+(?:["'”’»)]*)?(?=\s|$)|\n+/g;
  let start = 0;
  let match: RegExpExecArray | null;

  while ((match = boundary.exec(text)) !== null) {
    const end = match.index + match[0].length;
    const sentence = text.slice(start, end).trim();
    if (sentence) {
      const sentenceStart = text.indexOf(sentence, start);
      result.push({ text: sentence, startIndex: sentenceStart, endIndex: sentenceStart + sentence.length });
    }
    start = end;
  }

  const remainder = text.slice(start).trim();
  if (remainder) {
    const sentenceStart = text.indexOf(remainder, start);
    result.push({ text: remainder, startIndex: sentenceStart, endIndex: sentenceStart + remainder.length });
  }

  return result.length > 0 ? result : [{ text, startIndex: 0, endIndex: text.length }];
}
