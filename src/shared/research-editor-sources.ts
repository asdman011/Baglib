export type ResearchSourceKind = 'ayah' | 'hadith' | 'verse' | 'book-quote' | 'dictionary' | 'people' | 'wikipedia';
export interface ResearchSourceProps {
  url: string; label: string; text: string; verses: { sadr: string; ajuz: string }[];
  collection: string; number: string; grade: string; poet: string; poem: string;
  workId: string; editionId: string; sourceId: string; page: number;
}
export interface ResearchSourceResult { kind: ResearchSourceKind; props: ResearchSourceProps }
export interface ResearchSourceSearch {
  search(kind: ResearchSourceKind, query: string, requestId: string, options?: { wikiLang?: 'ar' | 'en' }): Promise<ResearchSourceResult[]>;
  cancel(requestId: string): Promise<void>;
  open(url: string): Promise<void>;
}
export const RESEARCH_SOURCE_LIMIT = 8;
export const emptySourceProps = (): ResearchSourceProps => ({
  url: '', label: '', text: '', verses: [], collection: '', number: '', grade: '', poet: '', poem: '',
  workId: '', editionId: '', sourceId: '', page: 1,
});
