/**
 * Baglib — Dictionary and Encyclopedia Domain Types (KEY-142)
 */

export type DictionaryFormat = 'mdict' | 'stardict' | 'bgl' | 'slob' | 'dictzip';

export interface DictionaryItem {
  id: string;
  title: string;
  format: DictionaryFormat;
  sourcePath: string;
  sourceLang?: string;
  targetLang?: string;
  entryCount: number;
  isEnabled: boolean;
  createdAt: string;
  /** A category id, or BIOGRAPHY_SCIENCE. Empty for a general dictionary. */
  science?: string;
}

/** A dictionary of people, consulted alongside any science. */
export const BIOGRAPHY_SCIENCE = 'biography';

export interface HeadwordRecord {
  id?: number;
  dictId: string;
  headword: string;
  normalizedHeadword: string;
  offset?: number;
  size?: number;
  snippet?: string;
}

export interface DictionaryLookupCandidate {
  token: string;
  type: 'exact' | 'normalized' | 'stripped_diacritics' | 'stem' | 'arabic_root' | 'lemma';
  weight: number;
}

export interface DictionaryEntryMatch {
  dictId: string;
  dictTitle: string;
  dictFormat: DictionaryFormat;
  headword: string;
  matchedCandidate: string;
  definitionHtml: string;
  definitionText: string;
  audioUrl?: string;
  alternates?: string[];
}

export interface WikipediaSummaryCard {
  title: string;
  displayTitle: string;
  extract: string;
  extractHtml?: string;
  description?: string;
  thumbnailUrl?: string;
  articleUrl: string;
  lang: string;
  dir: 'rtl' | 'ltr';
}

export interface AggregateDictionaryLookupResult {
  query: string;
  candidates: DictionaryLookupCandidate[];
  entries: DictionaryEntryMatch[];
  wikipedia?: WikipediaSummaryCard | null;
  durationMs: number;
}

export interface ImportDictionaryOptions {
  sourcePath: string;
  title?: string;
  sourceLang?: string;
  targetLang?: string;
  companionFiles?: string[];
}
