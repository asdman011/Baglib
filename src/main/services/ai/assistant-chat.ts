/**
 * KEY-384: the app-wide assistant chat. Source text is read here from BagLib's own data (notes, installed Quran and
 * Sunnah, book pages, the open chapter), never taken from the page; only the provider the user chose is called.
 */
import type Database from 'better-sqlite3';
import { errorMessage } from '../../../shared/errors';
import { providerErrorCode, providerErrorDetail } from '../../../shared/ai-errors';
import { isLocalAi } from '../../../shared/ai-consent';
import { buildChatPrompt, validateChatRequest, type ChatResponse } from '../../../shared/assistant-chat';
import { parseAnswerCitations, providerReady, type ResearchAiSource } from '../../../shared/research-ai';
import type { AISettings } from '../../../shared/types/ai';
import { loadChapterContext } from './research-editor-ai';

export interface AssistantChatDeps {
  db: Database.Database;
  settings: AISettings;
  /** Reads a source's text from BagLib's data; returns nothing when it cannot be found. */
  resolve(target: string, label: string): Promise<{ label: string; text: string }[]>;
  complete(request: { systemPrompt: string; userPrompt: string; temperature?: number; preventRedirect?: boolean }, settings: AISettings): Promise<string>;
}

export async function runAssistantChat(input: unknown, deps: AssistantChatDeps): Promise<ChatResponse> {
  const request = validateChatRequest(input);
  if (typeof request === 'string') return { ok: false, error: request };
  if (deps.settings.enabled === false) return { ok: false, error: 'ai-disabled' };
  if (!providerReady(deps.settings)) return { ok: false, error: 'not-configured' };
  if (!isLocalAi(deps.settings) && !request.allowRemote) return { ok: false, error: 'permission-denied' };

  const chapter = request.chapterId ? loadChapterContext(deps.db, request.chapterId) : null;
  const sources: ResearchAiSource[] = [];
  const add = (ref: string, label: string, text: string) => {
    if (!text.trim() || sources.some(source => source.ref === ref && source.text === text)) return;
    sources.push({ n: sources.length + 1, ref, label, text });
  };
  for (const source of chapter?.sources ?? []) add(source.ref, source.label, source.text);
  for (const ref of request.sources) {
    try {
      for (const found of await deps.resolve(ref.target, ref.label)) add(ref.target, found.label, found.text);
    } catch { /* a source that cannot be read is skipped; the answer says what it used */ }
  }
  const prompt = buildChatPrompt({ request, sources, chapter: chapter ? { title: chapter.title, text: chapter.text } : undefined });
  const temperature = request.action === 'translate' || request.action === 'rewrite' ? 0.3 : 0.6;
  try {
    const answer = await deps.complete({ ...prompt, temperature, preventRedirect: !request.allowRemote }, deps.settings);
    const parsed = parseAnswerCitations(answer, sources);
    if (!parsed.text) return { ok: false, error: 'provider-busy', detail: 'empty answer' };
    return { ok: true, text: parsed.text, citations: parsed.citations, sourceCount: sources.length };
  } catch (error) {
    const message = errorMessage(error);
    return { ok: false, error: providerErrorCode(message), detail: providerErrorDetail(message) };
  }
}
