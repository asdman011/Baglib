/**
 * KEY-439 (AI Task 5, Phase 1): OpenAI-compatible tool-calling adapter for AI Actions.
 * Calls the configured provider's tool-calling endpoint without executing any actions.
 * If the provider or model does not support tool calling, returns `unsupported` cleanly.
 */
import { AI_SCHOLARLY_POLICY } from '../../../../shared/ai-principles';
import { customProviderSettings, normaliseBaseUrl } from '../../../../shared/ai-providers';
import { errorMessage } from '../../../../shared/errors';
import { AI_ACTION_TOOLS, type AiActionPlanRequest } from '../../../../shared/ai-actions';
import type { AISettings } from '../../../../shared/types/ai';

export interface RawToolCall {
  id?: string;
  name: unknown;
  arguments: unknown;
}

export type ToolCallingResult =
  | { ok: true; kind: 'tool_calls'; calls: RawToolCall[]; assistantText?: string }
  | { ok: true; kind: 'message'; text: string }
  | { ok: true; kind: 'unsupported'; reason: string }
  | { ok: false; error: 'provider-error'; detail: string };

type FetchLike = typeof fetch;

const UNSUPPORTED_TOOL_RE = /(does not support tools|tool[_\s-]?call(ing)?.*not support|function[_\s-]?call(ing)?.*not support|tools.*unsupported|unknown field.*tools|invalid parameter.*tools)/iu;

function parseArguments(raw: unknown): unknown {
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function buildActionPrompts(request: AiActionPlanRequest): { systemPrompt: string; userPrompt: string } {
  const langLabel = request.language === 'ar' ? 'Arabic' : 'English';
  const systemPrompt = [
    'You are the BagLib study assistant action planner.',
    `Respond in ${langLabel}.`,
    'You have a fixed set of BagLib app tools: create_note, append_to_note, create_cards_from_selection, add_to_personal_list, open_source, split_pdf, merge_pdfs, extract_pdf_pages, rotate_pdf_pages, ocr_pdf_page.',
    'When the user asks to perform one or more of these actions, call the appropriate tool(s) with accurate arguments.',
    'Never invent shell commands or file paths. Only use workId, sourceId, or target IDs provided in the instruction or context.',
    'For ocr_pdf_page, only OCR the single page the user names, and never set force=true unless the user explicitly asks to re-OCR a page that already has text.',
    'If the request cannot be mapped to the available tools, reply briefly explaining what is missing without calling tools.',
    AI_SCHOLARLY_POLICY,
  ].join('\n');

  const ctx = request.context;
  const contextParts: string[] = [];
  if (ctx?.activeTarget) contextParts.push(`Active target: ${ctx.activeTarget}${ctx.activeLabel ? ` (${ctx.activeLabel})` : ''}`);
  if (ctx?.selectedText) contextParts.push(`Selected passage:\n"""\n${ctx.selectedText.slice(0, 6000)}\n"""`);
  const userPrompt = contextParts.length
    ? `${contextParts.join('\n\n')}\n\nUser instruction:\n${request.instruction.trim()}`
    : request.instruction.trim();

  return { systemPrompt, userPrompt };
}

function extractToolCalls(rawCalls: unknown): RawToolCall[] {
  if (!Array.isArray(rawCalls)) return [];
  const out: RawToolCall[] = [];
  for (const item of rawCalls) {
    if (!item || typeof item !== 'object') continue;
    const record = item as { id?: unknown; function?: { name?: unknown; arguments?: unknown } };
    if (!record.function) continue;
    out.push({
      id: typeof record.id === 'string' ? record.id : undefined,
      name: record.function.name,
      arguments: parseArguments(record.function.arguments),
    });
  }
  return out;
}

export async function callModelWithTools(
  request: AiActionPlanRequest,
  settings: AISettings,
  fetchFn: FetchLike = fetch
): Promise<ToolCallingResult> {
  const provider = settings.provider || 'ollama';
  if (provider === 'gemini' || provider === 'claude') {
    return { ok: true, kind: 'unsupported', reason: 'provider-no-tool-support' };
  }

  const { systemPrompt, userPrompt } = buildActionPrompts(request);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), provider === 'ollama' ? 90_000 : 60_000);

  try {
    if (provider === 'ollama') {
      const endpoint = (settings.ollamaEndpoint || 'http://127.0.0.1:11434').replace(/\/+$/, '');
      const model = settings.ollamaModel || 'llama3.2';
      const res = await fetchFn(`${endpoint}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          tools: AI_ACTION_TOOLS,
          stream: false,
          options: { temperature: settings.temperature ?? 0.3 },
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        if ([400, 404, 422, 501].includes(res.status) && UNSUPPORTED_TOOL_RE.test(text)) {
          return { ok: true, kind: 'unsupported', reason: text.slice(0, 200) };
        }
        return { ok: false, error: 'provider-error', detail: `Ollama HTTP ${res.status}: ${text || res.statusText}`.slice(0, 300) };
      }
      const data = (await res.json()) as { message?: { content?: string; tool_calls?: unknown } };
      const calls = extractToolCalls(data.message?.tool_calls);
      if (calls.length > 0) {
        return { ok: true, kind: 'tool_calls', calls, assistantText: data.message?.content };
      }
      return { ok: true, kind: 'message', text: (data.message?.content || '').trim() };
    }

    // openai or custom (OpenAI-compatible)
    const effective = provider === 'custom' ? customProviderSettings(settings) : settings;
    const baseUrl = normaliseBaseUrl(effective.baseUrl || 'https://api.openai.com/v1');
    if (!baseUrl) {
      return { ok: false, error: 'provider-error', detail: 'Invalid OpenAI-compatible base URL' };
    }
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (effective.apiKey) headers.Authorization = `Bearer ${effective.apiKey}`;
    const res = await fetchFn(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: effective.model || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        tools: AI_ACTION_TOOLS,
        tool_choice: 'auto',
        temperature: settings.temperature ?? 0.3,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      if ([400, 404, 422, 501].includes(res.status) && UNSUPPORTED_TOOL_RE.test(text)) {
        return { ok: true, kind: 'unsupported', reason: text.slice(0, 200) };
      }
      return { ok: false, error: 'provider-error', detail: `HTTP ${res.status}: ${text || res.statusText}`.slice(0, 300) };
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string | null; tool_calls?: unknown } }>;
    };
    const msg = data.choices?.[0]?.message;
    const calls = extractToolCalls(msg?.tool_calls);
    if (calls.length > 0) {
      return { ok: true, kind: 'tool_calls', calls, assistantText: msg?.content || undefined };
    }
    return { ok: true, kind: 'message', text: (msg?.content || '').trim() };
  } catch (err: unknown) {
    return { ok: false, error: 'provider-error', detail: errorMessage(err).slice(0, 300) };
  } finally {
    clearTimeout(timeout);
  }
}
