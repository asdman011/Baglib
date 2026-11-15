export type ManuscriptKind = 'research' | 'book';
export type ManuscriptMode = 'page' | 'edgeless';
export type ManuscriptScheme = 'quran' | 'sunnah' | 'poetry' | 'book' | 'note';
export interface Manuscript {
  id: string; title: string; kind: ManuscriptKind; settings_json: string;
  created_at: string; updated_at: string; deleted_at: string | null;
}
export interface ManuscriptDocument {
  id: string; manuscript_id: string; parent_id: string | null; title: string; position: number;
  snapshot: string; plain_text: string; primary_mode: ManuscriptMode; updated_at: string; deleted_at: string | null;
}
export interface ManuscriptLink { block_id: string; target_scheme: ManuscriptScheme; target_id: string }
export interface ManuscriptSave { id: string; snapshot: string; primary_mode?: ManuscriptMode }
export interface ManuscriptVersion { revision: number; snapshot_hash: string; action: string; created_at: string; restored_from_revision: number | null }
export interface ManuscriptsAPI {
  updateSettings(id: string, settings: import('./research-editor-apparatus').ResearchSettings): Promise<void>;
  list(trashed?: boolean): Promise<Manuscript[]>;
  create(title: string, kind: ManuscriptKind): Promise<Manuscript>;
  rename(id: string, title: string): Promise<void>;
  trash(id: string): Promise<void>;
  restore(id: string): Promise<void>;
  documents(manuscriptId: string, trashed?: boolean): Promise<ManuscriptDocument[]>;
  document(id: string): Promise<ManuscriptDocument>;
  createDocument(manuscriptId: string, title: string, parentId?: string | null): Promise<ManuscriptDocument>;
  renameDocument(id: string, title: string): Promise<void>;
  moveDocument(id: string, parentId: string | null, position: number): Promise<void>;
  trashDocument(id: string): Promise<void>;
  restoreDocument(id: string): Promise<void>;
  save(input: ManuscriptSave): Promise<ManuscriptDocument>;
  checkpoint(id: string): Promise<boolean>;
  history(id: string): Promise<ManuscriptVersion[]>;
  restoreVersion(id: string, revision: number): Promise<ManuscriptDocument>;
  search(query: string, manuscriptId?: string): Promise<ManuscriptDocument[]>;
}
export function manuscriptText(value: unknown, max = 1000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || value.includes('\0')) throw new Error('invalid-request');
  return value;
}
