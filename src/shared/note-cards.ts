/** A review card made from one line of a note: `question :: answer`, cloze `{{c1::answer}}`, or a question line followed by its answer. */
export interface NoteCard { front: string; back: string }

const CLOZE = /\{\{c(\d{1,2})::(.+?)(?:::(.+?))?\}\}/gu;

/** The line as a reader sees it: no list or quote marker and no `#card` tag. */
function clean(line: string): string {
  return line.replace(/[ \t]\^[A-Za-z0-9-]{1,64}[ \t]*$/u, '').replace(/^\s*(?:[-*]\s+|>\s*|#{1,6}\s+)/u, '').replace(/(^|\s)#card\b/giu, '$1').trim();
}

export function cardsFromLine(line: string, nextLine: string | null = null): NoteCard[] {
  const text = clean(line);
  if (!text) return [];
  const numbers = [...new Set([...text.matchAll(CLOZE)].map(match => match[1]))];
  if (numbers.length) {
    // One card per cloze number; the other clozes show their answers, as in Anki.
    return numbers.map(number => ({
      front: text.replace(CLOZE, (_all, n: string, answer: string, hint?: string) => n === number ? `[${hint || '…'}]` : answer),
      back: text.replace(CLOZE, (_all, n: string, answer: string) => n === number ? `**${answer}**` : answer),
    }));
  }
  const pair = /^(.+?)\s*::\s*(.+)$/u.exec(text);
  if (pair) return [{ front: pair[1].trim(), back: pair[2].trim() }];
  const answer = nextLine === null ? '' : clean(nextLine);
  if (/[?؟]$/u.test(text) && answer) return [{ front: text, back: answer }];
  return [];
}
