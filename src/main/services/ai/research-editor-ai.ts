/**
 * KEY-373 (RE-12): grounded research AI for the manuscript editor. Reads the chapter and the sources it cites
 * (manuscript_link) locally, then calls only the provider the user chose in the BYOK settings.
 */
import type Database from 'better-sqlite3';
import { errorMessage } from '../../../shared/errors';
import { providerErrorCode, providerErrorDetail } from '../../../shared/ai-errors';
import { deriveManuscriptSnapshot } from '../../../shared/manuscript-snapshot';
import {
  buildResearchAiPrompt, collectChapterSources, parseAnswerCitations, providerReady, validateResearchAiRequest,
  type ChapterLink, type NoteText, type ResearchAiResponse,
} from '../../../shared/research-ai';
import type { AISettings } from '../../../shared/types/ai';

export interface ResearchEditorAiDeps {
  db: Database.Database;
  settings: AISettings;
  complete(request: { systemPrompt: string; userPrompt: string; temperature?: number }, settings: AISettings): Promise<string>;
}

/** The open chapter's text and the sources it cites (manuscript_link), or null when it is missing or trashed. */
export function loadChapterContext(db: Database.Database, documentId: string): { title: string; text: string; sources: ReturnType<typeof collectChapterSources> } | null {
  const doc = db.prepare(`SELECT d.id, d.title, d.snapshot FROM manuscript_document d JOIN manuscript m ON m.id=d.manuscript_id
    WHERE d.id=? AND d.deleted_at IS NULL AND m.deleted_at IS NULL`).get(documentId) as { id: string; title: string; snapshot: string } | undefined;
  if (!doc) return null;
  const links = db.prepare('SELECT block_id, target_scheme, target_id FROM manuscript_link WHERE document_id=?').all(doc.id) as ChapterLink[];
  const noteStatement = db.prepare(`SELECT s.title, s.content FROM knowledge k JOIN study_note_detail s ON s.knowledge_id=k.id
    WHERE k.id=? AND k.deleted_at IS NULL`);
  const note = (id: string) => noteStatement.get(id) as NoteText | undefined;
  try {
    const derived = deriveManuscriptSnapshot(doc.snapshot);
    return { title: derived.title || doc.title, text: derived.plainText, sources: collectChapterSources(doc.snapshot, links, note) };
  } catch {
    return null;
  }
}

export async function runResearchEditorAi(input: unknown, deps: ResearchEditorAiDeps): Promise<ResearchAiResponse> {
  const request = validateResearchAiRequest(input);
  if (typeof request === 'string') return { ok: false, error: request };
  if (!providerReady(deps.settings)) return { ok: false, error: 'not-configured' };
  const chapter = loadChapterContext(deps.db, request.documentId);
  if (!chapter) return { ok: false, error: 'invalid-request' };
  const { sources } = chapter;
  const prompt = buildResearchAiPrompt({ request, chapterTitle: chapter.title, chapterText: chapter.text, sources });
  const temperature = request.action === 'translate' || request.action === 'rewrite' ? 0.3 : deps.settings.temperature ?? 0.5;
  try {
    const answer = await deps.complete({ ...prompt, temperature }, deps.settings);
    const parsed = parseAnswerCitations(answer, sources);
    if (!parsed.text) return { ok: false, error: 'provider-error', message: 'empty-answer' };
    return { ok: true, text: parsed.text, citations: parsed.citations, sourceCount: sources.length, provider: deps.settings.provider || 'ollama' };
  } catch (error) {
    const message = errorMessage(error);
    return { ok: false, error: providerErrorCode(message), message: providerErrorDetail(message) };
  }
}
