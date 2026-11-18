/**
 * BagLib — Buckwalter AraMorph Morphological Analyzer (KEY-413)
 *
 * Clean, from-scratch TypeScript implementation of Tim Buckwalter's published
 * Arabic Morphological Analyzer algorithm (AraMorph 1.2.1):
 *   1. Transliterate Arabic input into Buckwalter ASCII notation (stripping tatweel & short vowels).
 *   2. Segment the consonantal skeleton into all (prefix, stem, suffix) triples where:
 *      - 0 <= prefix.length <= 4
 *      - stem.length >= 1
 *      - 0 <= suffix.length <= 6
 *   3. Match each segment against the unvocalized keys of dictprefixes, dictstems, dictsuffixes.
 *   4. Filter triples whose morphological categories (catA, catB, catC) satisfy all three
 *      compatibility tables: (catA, catB) in tableAB, (catA, catC) in tableAC, (catB, catC) in tableBC.
 *   5. Reconstruct the vocalized Arabic form, lemma, part of speech, and combined English gloss.
 */

import fs from 'node:fs';
import path from 'node:path';

export const ARAMORPH_REQUIRED_FILES = [
  'dictprefixes',
  'dictstems',
  'dictsuffixes',
  'tableab',
  'tableac',
  'tablebc',
] as const;

/** Standard Buckwalter Arabic-to-ASCII mapping table. */
const ARABIC_TO_BUCKWALTER: Record<string, string> = {
  '\u0621': "'", // hamza
  '\u0622': '|', // alif madda
  '\u0623': '>', // alif hamza above
  '\u0624': '&', // waw hamza
  '\u0625': '<', // alif hamza below
  '\u0626': '}', // ya hamza
  '\u0627': 'A', // bare alif
  '\u0628': 'b', // ba
  '\u0629': 'p', // ta marbuta
  '\u062A': 't', // ta
  '\u062B': 'v', // tha
  '\u062C': 'j', // jim
  '\u062D': 'H', // ha
  '\u062E': 'x', // kha
  '\u062F': 'd', // dal
  '\u0630': '*', // dhal
  '\u0631': 'r', // ra
  '\u0632': 'z', // zay
  '\u0633': 's', // sin
  '\u0634': '$', // shin
  '\u0635': 'S', // sad
  '\u0636': 'D', // dad
  '\u0637': 'T', // ta
  '\u0638': 'Z', // za
  '\u0639': 'E', // ayn
  '\u063A': 'g', // ghayn
  '\u0641': 'f', // fa
  '\u0642': 'q', // qaf
  '\u0643': 'k', // kaf
  '\u0644': 'l', // lam
  '\u0645': 'm', // mim
  '\u0646': 'n', // nun
  '\u0647': 'h', // ha
  '\u0648': 'w', // waw
  '\u0649': 'Y', // alif maqsura
  '\u064A': 'y', // ya
  '\u064B': 'F', // fathatan
  '\u064C': 'N', // dammatan
  '\u064D': 'K', // kasratan
  '\u064E': 'a', // fatha
  '\u064F': 'u', // damma
  '\u0650': 'i', // kasra
  '\u0651': '~', // shadda
  '\u0652': 'o', // sukun
  '\u0670': '`', // dagger alif
  '\u0671': '{', // alif wasla
};

const BUCKWALTER_TO_ARABIC: Record<string, string> = Object.fromEntries(
  Object.entries(ARABIC_TO_BUCKWALTER).map(([ar, bw]) => [bw, ar])
);

const STRIP_FOR_SKELETON_RE = /[\u0640\u064B-\u065F\u0670\u06D6-\u06ED]/gu;

/**
 * Transliterates an Arabic word to its unvocalized Buckwalter skeleton for table lookup.
 * Note: alif wasla (ٱ) is normalized to bare alif (A) for unvocalized stem lookup.
 */
export function arabicToBuckwalterSkeleton(arabic: string): string {
  const cleaned = arabic.trim().replace(STRIP_FOR_SKELETON_RE, '').replace(/\u0671/gu, '\u0627');
  let out = '';
  for (const ch of cleaned) {
    out += ARABIC_TO_BUCKWALTER[ch] ?? ch;
  }
  return out;
}

/**
 * Converts a vocalized Buckwalter string back to vocalized Arabic script.
 * Strips trailing homograph numbers (e.g. `_1`, `-u_1`) used in lemma headers.
 */
export function buckwalterToArabic(bw: string): string {
  const base = bw.replace(/-[a-zA-Z~]+_\d+$/u, '').replace(/_\d+$/u, '');
  let out = '';
  for (const ch of base) {
    out += BUCKWALTER_TO_ARABIC[ch] ?? ch;
  }
  return out;
}

export interface MorphemeEntry {
  unvocalized: string;
  vocalized: string;
  category: string;
  gloss: string;
  pos: string;
  lemma?: string;
  root?: string;
}

export interface AraMorphSolution {
  vocalizedArabic: string;
  vocalizedBuckwalter: string;
  lemmaArabic: string;
  lemmaBuckwalter: string;
  rootArabic: string;
  pos: string;
  gloss: string;
  prefixGloss: string;
  stemGloss: string;
  suffixGloss: string;
  prefixBuckwalter: string;
  stemBuckwalter: string;
  suffixBuckwalter: string;
}

const POS_TAG_RE = /<pos>([\s\S]*?)<\/pos>/iu;

function parseGlossAndPos(rawGloss: string, fallbackVocalized: string, fallbackCategory: string): { gloss: string; pos: string } {
  const match = POS_TAG_RE.exec(rawGloss);
  if (match) {
    const pos = match[1]!.trim();
    const gloss = rawGloss.replace(POS_TAG_RE, '').replace(/\s+/gu, ' ').trim();
    return { gloss, pos };
  }
  const gloss = rawGloss.replace(/\s+/gu, ' ').trim();
  const cat = fallbackCategory;
  let posTag = 'STEM';
  if (cat.startsWith('Nprop')) posTag = 'NOUN_PROP';
  else if (cat.startsWith('N')) posTag = 'NOUN';
  else if (cat.startsWith('PV_Pass')) posTag = 'VERB_PERFECT_PASSIVE';
  else if (cat.startsWith('PV')) posTag = 'VERB_PERFECT';
  else if (cat.startsWith('IV_Pass')) posTag = 'VERB_IMPERFECT_PASSIVE';
  else if (cat.startsWith('IV')) posTag = 'VERB_IMPERFECT';
  else if (cat.startsWith('CV')) posTag = 'VERB_COMMAND';
  else if (cat.startsWith('FW')) posTag = 'FUNC_WORD';
  const pos = fallbackVocalized ? `${fallbackVocalized}/${posTag}` : posTag;
  return { gloss, pos };
}

/**
 * Decodes a lexicon buffer. The LDC/Buckwalter lexicon files are ASCII with occasional
 * Latin-1 / Windows-1256 bytes in proper-noun glosses (e.g. Abbé, Español).
 * If valid UTF-8, reads as UTF-8; otherwise decodes as Windows-1256 / Latin-1.
 */
function decodeLexiconFile(filePath: string): string {
  const bytes = fs.readFileSync(filePath);
  const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
  try {
    return utf8Decoder.decode(bytes);
  } catch {
    try {
      return new TextDecoder('windows-1256').decode(bytes);
    } catch {
      return bytes.toString('latin1');
    }
  }
}

export class AraMorphAnalyzer {
  private prefixes = new Map<string, MorphemeEntry[]>();
  private stems = new Map<string, MorphemeEntry[]>();
  private suffixes = new Map<string, MorphemeEntry[]>();
  private tableAB = new Set<string>();
  private tableAC = new Set<string>();
  private tableBC = new Set<string>();
  private loaded = false;
  private stemEntryCount = 0;

  constructor(private readonly dataDir: string) {}

  get isAvailable(): boolean {
    return ARAMORPH_REQUIRED_FILES.every((f) => fs.existsSync(path.join(this.dataDir, f)));
  }

  get entryCount(): number {
    this.ensureLoaded();
    return this.stemEntryCount;
  }

  /** Lazily parses and caches the 6 Buckwalter files once. */
  ensureLoaded(): void {
    if (this.loaded) return;
    if (!this.isAvailable) {
      throw new Error(`AraMorph data files missing in ${this.dataDir}`);
    }

    this.parseMorphemeFile(path.join(this.dataDir, 'dictprefixes'), this.prefixes, false);
    this.parseMorphemeFile(path.join(this.dataDir, 'dictstems'), this.stems, true);
    this.parseMorphemeFile(path.join(this.dataDir, 'dictsuffixes'), this.suffixes, false);
    this.parseCompatibilityTable(path.join(this.dataDir, 'tableab'), this.tableAB);
    this.parseCompatibilityTable(path.join(this.dataDir, 'tableac'), this.tableAC);
    this.parseCompatibilityTable(path.join(this.dataDir, 'tablebc'), this.tableBC);
    this.loaded = true;
  }

  private parseMorphemeFile(
    filePath: string,
    target: Map<string, MorphemeEntry[]>,
    trackLemmas: boolean
  ): void {
    const content = decodeLexiconFile(filePath);
    let currentRoot = '';
    let currentLemma = '';
    let count = 0;

    for (const rawLine of content.split(/\r?\n/u)) {
      if (!rawLine) continue;
      if (trackLemmas) {
        if (rawLine.startsWith(';--- ')) {
          currentRoot = rawLine.slice(5).replace(/\(.*$/u, '').trim();
          continue;
        }
        if (rawLine.startsWith(';; ')) {
          currentLemma = rawLine.slice(3).trim();
          continue;
        }
      }
      if (rawLine.startsWith(';')) continue;

      const parts = rawLine.split('\t');
      if (parts.length < 3) continue;
      const unvocalized = parts[0]!;
      const vocalized = parts[1]!;
      const category = parts[2]!.trim();
      if (!category) continue;
      const rawGloss = parts.slice(3).join(' ');
      const { gloss, pos } = parseGlossAndPos(rawGloss, vocalized, category);

      const entry: MorphemeEntry = {
        unvocalized,
        vocalized,
        category,
        gloss,
        pos,
        ...(trackLemmas ? { lemma: currentLemma, root: currentRoot } : {}),
      };

      let list = target.get(unvocalized);
      if (!list) {
        list = [];
        target.set(unvocalized, list);
      }
      list.push(entry);
      count++;
    }

    if (trackLemmas) {
      this.stemEntryCount = count;
    }
  }

  private parseCompatibilityTable(filePath: string, target: Set<string>): void {
    const content = decodeLexiconFile(filePath);
    for (const rawLine of content.split(/\r?\n/u)) {
      const trimmed = rawLine.trim();
      if (!trimmed || trimmed.startsWith(';')) continue;
      const tokens = trimmed.split(/\s+/u);
      if (tokens.length >= 2) {
        target.add(`${tokens[0]} ${tokens[1]}`);
      }
    }
  }

  /**
   * Analyzes an Arabic word (or Buckwalter token) into all valid morphological solutions.
   */
  analyze(word: string): AraMorphSolution[] {
    this.ensureLoaded();
    const cleaned = word.trim();
    if (!cleaned) return [];

    const bwSkeleton = arabicToBuckwalterSkeleton(cleaned);
    if (!bwSkeleton) return [];

    // Try both the exact skeleton and basic orthographic variants (e.g. bare alif vs hamza on alif, final Y vs y)
    const skeletons = this.buildCandidateSkeletons(bwSkeleton);
    const solutions: AraMorphSolution[] = [];
    const seen = new Set<string>();

    for (const skel of skeletons) {
      const maxPrefix = Math.min(4, skel.length - 1);
      for (let pLen = 0; pLen <= maxPrefix; pLen++) {
        const prefKey = skel.slice(0, pLen);
        const prefEntries = this.prefixes.get(prefKey);
        if (!prefEntries) continue;

        const maxSuffix = Math.min(6, skel.length - pLen - 1);
        for (let sLen = 0; sLen <= maxSuffix; sLen++) {
          const stemKey = skel.slice(pLen, skel.length - sLen);
          if (stemKey.length < 1) continue;
          const suffKey = skel.slice(skel.length - sLen);

          const stemEntries = this.stems.get(stemKey);
          if (!stemEntries) continue;
          const suffEntries = this.suffixes.get(suffKey);
          if (!suffEntries) continue;

          for (const pref of prefEntries) {
            for (const stem of stemEntries) {
              if (!this.tableAB.has(`${pref.category} ${stem.category}`)) continue;
              for (const suff of suffEntries) {
                if (!this.tableAC.has(`${pref.category} ${suff.category}`)) continue;
                if (!this.tableBC.has(`${stem.category} ${suff.category}`)) continue;

                const vocalizedBw = `${pref.vocalized}${stem.vocalized}${suff.vocalized}`;
                const vocalizedArabic = buckwalterToArabic(vocalizedBw);
                const lemmaBw = stem.lemma || stem.vocalized;
                const lemmaArabic = buckwalterToArabic(lemmaBw);
                const rootArabic = stem.root ? buckwalterToArabic(stem.root) : '';
                const posParts = [pref.pos, stem.pos, suff.pos].filter(Boolean);
                const pos = posParts.join('');

                const glossParts = [pref.gloss, stem.gloss, suff.gloss].filter(Boolean);
                const gloss = glossParts.join(' + ');

                const dedupeKey = `${vocalizedBw}|${lemmaBw}|${stem.gloss}|${pref.gloss}|${suff.gloss}`;
                if (seen.has(dedupeKey)) continue;
                seen.add(dedupeKey);

                solutions.push({
                  vocalizedArabic,
                  vocalizedBuckwalter: vocalizedBw,
                  lemmaArabic,
                  lemmaBuckwalter: lemmaBw,
                  rootArabic,
                  pos,
                  gloss,
                  prefixGloss: pref.gloss,
                  stemGloss: stem.gloss,
                  suffixGloss: suff.gloss,
                  prefixBuckwalter: pref.vocalized,
                  stemBuckwalter: stem.vocalized,
                  suffixBuckwalter: suff.vocalized,
                });
              }
            }
          }
        }
      }
    }

    return solutions;
  }

  private buildCandidateSkeletons(bw: string): string[] {
    const out = [bw];
    const add = (candidate: string) => {
      if (candidate && !out.includes(candidate)) out.push(candidate);
    };
    // Final alif maqsura / ya alternation
    if (bw.endsWith('y')) add(`${bw.slice(0, -1)}Y`);
    if (bw.endsWith('Y')) add(`${bw.slice(0, -1)}y`);
    // Final ha / ta marbuta alternation
    if (bw.endsWith('h')) add(`${bw.slice(0, -1)}p`);
    return out;
  }

  /**
   * Returns a sample of distinct stem headwords in Arabic script for headword indexing.
   */
  getAllStemHeadwords(): Array<{ headword: string; lemma: string }> {
    this.ensureLoaded();
    const result: Array<{ headword: string; lemma: string }> = [];
    const seen = new Set<string>();
    for (const [unvoc, entries] of this.stems.entries()) {
      const ar = buckwalterToArabic(unvoc);
      if (!ar || seen.has(ar)) continue;
      seen.add(ar);
      result.push({
        headword: ar,
        lemma: entries[0]?.lemma ? buckwalterToArabic(entries[0].lemma) : ar,
      });
    }
    return result;
  }
}
