export interface PoetryQuery {
  language?: 'ar' | 'en'; query?: string; poetId?: number;
  meter?: string; theme?: string; era?: string; variant?: string; location?: string; after?: number; limit?: number;
}
export interface PoetrySummary {
  id: number; title: string; language: 'ar' | 'en'; layoutType: 'bayt' | 'free_verse' | 'stanza';
  meter: string | null; theme: string | null; verseCount: number; poetId: number; poetName: string;
  match?: { from: number; lines: string[] } | null;
}
export type PoetryResult<Value> = { ok: true; data: Value } | { ok: false; error: string };
export interface PoetryAPI {
  saveKnowledge(input: PoetrySaveInput): Promise<PoetryResult<PoetrySavedItem>>;
  saved(offset?: number): Promise<PoetryResult<{ items: PoetrySavedItem[]; next: number | null }>>;
  provision(): Promise<PoetryResult<PoetryProvisionStatus>>;
  status(): Promise<PoetryResult<PoetryProvisionStatus>>;
  poets(query: PoetQuery): Promise<PoetryResult<{ items: PoetSummary[]; total: number; offset: number }>>;
  facets(): Promise<PoetryResult<PoetryFacets>>;
  variants(): Promise<PoetryResult<string[]>>;
  search(query: PoetryQuery): Promise<PoetryResult<{ items: PoetrySummary[]; next: number | null }>>;
  detail(id: number): Promise<PoetryResult<PoetryDetail | null>>;
  narrations(poemId: number): Promise<PoetryResult<PoetryNarration[]>>;
  importNarrationFile(input: { poemId: number; label?: string }): Promise<PoetryResult<PoetryNarration | null>>;
  saveNarrationRecording(input: { poemId: number; label?: string; mimeType: string; durationSeconds: number; data: ArrayBuffer }): Promise<PoetryResult<PoetryNarration>>;
  addNarrationLink(input: { poemId: number; label?: string; url: string }): Promise<PoetryResult<PoetryNarration>>;
  deleteNarration(id: string): Promise<PoetryResult<boolean>>;
}
/** Human narration sources only; computer-generated speech is never a stored narration. */
export type PoetryNarrationKind = 'recording' | 'file' | 'online';
export type PoetryNarrationProvider = 'local' | 'youtube' | 'soundcloud' | 'vimeo' | 'url';
export interface PoetryNarration {
  id: string; poemId: number; kind: PoetryNarrationKind; provider: PoetryNarrationProvider;
  label: string | null; url: string | null; mediaUrl: string | null; mimeType: string | null;
  durationSeconds: number | null; createdAt: string;
}
export interface PoetrySaveInput { poemId: number; from: number; to: number; type: 'note' | 'quote' | 'bookmark'; note?: string }
export interface PoetrySavedItem { id: string; type: 'note' | 'quote' | 'bookmark'; reference: string; label: string; text: string | null; note: string | null; createdAt: string }
export interface PoetryProvisionStatus { phase: 'idle' | 'downloading' | 'importing' | 'ready' | 'error'; downloaded: number; total: number | null; imported: number; error?: 'python' | 'integrity' | 'failed' }
export interface PoetQuery { language: 'ar' | 'en'; query?: string; era?: string; location?: string; offset?: number }
export interface PoetSummary { id: number; name: string; era: string | null; location: string | null; poemCount: number }
export interface PoetryFacets {
  languages: { language: 'ar' | 'en'; count: number }[];
  eras: string[]; meters: string[]; themes: string[]; locations: string[];
}
export interface PoetryDetail {
  id: number; title: string; language: 'ar' | 'en'; layout_type: 'bayt' | 'free_verse' | 'stanza';
  meter: string | null; verses_json: string; poet_name: string; poet_bio: string | null;
  poet_id: number; poet_era: string | null; poet_location: string | null;
  theme: string | null; language_variant: string | null; source_url: string | null;
  poet_url: string | null; description_json: string | null; verse_count: number;
}
