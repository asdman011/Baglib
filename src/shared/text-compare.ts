/**
 * Compare two editions (Wave 13.1): a word-level difference of two PDFs' text, keeping each word's page so every
 * difference can be shown on both editions' pages. Myers' O(ND) algorithm, capped so two unrelated books stop early
 * instead of using all memory.
 */
export interface PageText { page: number; text: string }
export interface CompareOptions { ignoreDiacritics?: boolean; maxDifferences?: number }
export interface CompareHunk { aPage: number | null; bPage: number | null; removed: string; added: string; before: string; after: string }
export interface CompareResult { hunks: CompareHunk[]; removedWords: number; addedWords: number; tooDifferent: boolean; aWords: number; bWords: number }

// Tashkeel, superscript alef and tatweel: differences in these alone are not counted when asked.
const DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/gu;

interface Words { words: string[]; keys: string[]; pages: number[] }
function words(pages: PageText[], options: CompareOptions): Words {
  const out: Words = { words: [], keys: [], pages: [] };
  for (const page of pages) for (const word of page.text.split(/\s+/u)) {
    if (!word) continue;
    // PDF text extraction sometimes leaves a lone mark (a damma, a shadda) as its own "word": it belongs to the word before.
    if (/^\p{M}+$/u.test(word) && out.words.length) {
      const last = out.words.length - 1;
      out.words[last] += word;
      out.keys[last] = options.ignoreDiacritics ? out.words[last].replace(DIACRITICS, '') : out.words[last];
      continue;
    }
    out.words.push(word);
    out.keys.push(options.ignoreDiacritics ? word.replace(DIACRITICS, '') : word);
    out.pages.push(page.page);
  }
  return out;
}

type Op = 0 | 1 | 2; // equal, remove (from a), add (from b)

/** Myers' shortest edit script; null when more than `maxD` edits are needed. */
function myers(a: string[], b: string[], maxD: number): Op[] | null {
  const n = a.length, m = b.length, offset = maxD + 1;
  const v = new Int32Array(2 * offset + 1);
  const trace: Int32Array[] = [];
  for (let d = 0; d <= maxD; d++) {
    trace.push(v.slice(offset - d, offset + d + 1));
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? v[offset + k + 1] : v[offset + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x++; y++; }
      v[offset + k] = x;
      if (x >= n && y >= m) return backtrack(trace, d, n, m);
    }
  }
  return null;
}

function backtrack(trace: Int32Array[], last: number, n: number, m: number): Op[] {
  const ops: Op[] = [];
  let x = n, y = m;
  for (let d = last; d > 0; d--) {
    const row = trace[d]; // v before step d, indexed k + d
    const at = (k: number) => row[k + d];
    const k = x - y;
    const down = k === -d || (k !== d && at(k - 1) < at(k + 1));
    const prevK = down ? k + 1 : k - 1;
    const prevX = at(prevK), prevY = prevX - prevK;
    while (x > prevX && y > prevY) { ops.push(0); x--; y--; }
    ops.push(down ? 2 : 1);
    if (down) y--; else x--;
  }
  while (x > 0 && y > 0) { ops.push(0); x--; y--; }
  return ops.reverse();
}

/** The differences between edition A and edition B, grouped into hunks with a few words of context. */
export function compareEditions(a: PageText[], b: PageText[], options: CompareOptions = {}): CompareResult {
  const left = words(a, options), right = words(b, options);
  // Common start and end are skipped first: editions are mostly the same, so the costly part stays small.
  let start = 0;
  while (start < left.keys.length && start < right.keys.length && left.keys[start] === right.keys[start]) start++;
  let endA = left.keys.length, endB = right.keys.length;
  while (endA > start && endB > start && left.keys[endA - 1] === right.keys[endB - 1]) { endA--; endB--; }
  const ops = myers(left.keys.slice(start, endA), right.keys.slice(start, endB), options.maxDifferences ?? 2500);
  const base = { aWords: left.words.length, bWords: right.words.length };
  if (!ops) return { hunks: [], removedWords: 0, addedWords: 0, tooDifferent: true, ...base };
  const hunks: CompareHunk[] = [];
  let i = start, j = start, removedWords = 0, addedWords = 0;
  for (let index = 0; index < ops.length;) {
    if (ops[index] === 0) { i++; j++; index++; continue; }
    const fromI = i, fromJ = j;
    while (index < ops.length && ops[index] !== 0) { if (ops[index] === 1) i++; else j++; index++; }
    removedWords += i - fromI; addedWords += j - fromJ;
    hunks.push({
      aPage: i > fromI ? left.pages[fromI] : left.pages[Math.min(fromI, left.pages.length - 1)] ?? null,
      bPage: j > fromJ ? right.pages[fromJ] : right.pages[Math.min(fromJ, right.pages.length - 1)] ?? null,
      removed: left.words.slice(fromI, i).join(' '),
      added: right.words.slice(fromJ, j).join(' '),
      before: left.words.slice(Math.max(0, fromI - 6), fromI).join(' '),
      after: left.words.slice(i, i + 6).join(' '),
    });
  }
  return { hunks, removedWords, addedWords, tooDifferent: false, ...base };
}
