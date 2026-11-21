/**
 * KEY-439 / KEY-448: Tool-calling adapter for AI Actions across OpenAI-compatible,
 * Ollama, Google Gemini (`generateContent` + `functionDeclarations`), and Anthropic
 * Claude (Messages API + `tools`) providers.
 * Calls the configured provider's tool-calling endpoint without executing any actions.
 * If the provider or model does not support tool calling, returns `unsupported` cleanly.
 */
import { AI_SCHOLARLY_POLICY } from '../../../../shared/ai-principles';
import { customProviderSettings, normaliseBaseUrl } from '../../../../shared/ai-providers';
import { errorMessage } from '../../../../shared/errors';
import { AI_ACTION_TOOLS, type AiActionPlanRequest } from '../../../../shared/ai-actions';
import type { AISettings } from '../../../../shared/types/ai';
import { geminiModelName } from '../ai-provider.service';

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

const UNSUPPORTED_TOOL_RE = /(does not support tools|tool[_\s-]?call(ing)?.*not (support|enabled|available)|function[_\s-]?call(ing)?.*not (support|enabled|available)|not support.*tools|tools.*not.*(support|enabled)|tools.*unsupported|unknown field.*tools|invalid parameter.*tools)/iu;

export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ClaudeToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/**
 * Reduce a JSON Schema object from `AI_ACTION_TOOLS` to Gemini's supported
 * OpenAPI 3.0 subset (`type`, `description`, string-only `enum`, `properties`,
 * `required`, `items`), stripping `additionalProperties` and numeric/length bounds.
 */
export function toGeminiSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (typeof schema.type === 'string') out.type = schema.type;
  let description = typeof schema.description === 'string' ? schema.description : undefined;

  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    if (schema.type === 'string') {
      out.enum = schema.enum.filter((v): v is string => typeof v === 'string');
    } else {
      const allowed = `Allowed values: ${schema.enum.join(', ')}.`;
      description = description ? `${description} ${allowed}` : allowed;
    }
  }
  if (description) out.description = description;

  if (schema.properties && typeof schema.properties === 'object' && !Array.isArray(schema.properties)) {
    const props: Record<string, Record<string, unknown>> = {};
    for (const [key, val] of Object.entries(schema.properties as Record<string, unknown>)) {
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        props[key] = toGeminiSchema(val as Record<string, unknown>);
      }
    }
    out.properties = props;
  }

  if (Array.isArray(schema.required) && schema.required.length > 0) {
    out.required = schema.required.filter((k): k is string => typeof k === 'string');
  }

  if (schema.items && typeof schema.items === 'object' && !Array.isArray(schema.items)) {
    out.items = toGeminiSchema(schema.items as Record<string, unknown>);
  }

  return out;
}

export function toGeminiFunctionDeclarations(): GeminiFunctionDeclaration[] {
  return AI_ACTION_TOOLS.map(tool => ({
    name: tool.function.name,
    description: tool.function.description,
    parameters: toGeminiSchema(tool.function.parameters),
  }));
}

export function toClaudeTools(): ClaudeToolDefinition[] {
  return AI_ACTION_TOOLS.map(tool => ({
    name: tool.function.name,
    description: tool.function.description,
    input_schema: tool.function.parameters,
  }));
}

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
    'Never invent shell commands, file paths, or IDs (never invent workId, sourceId, noteId, or "work:..." slugs). Only use an ID if it was explicitly given in the context.',
    'When the user names a book or PDF, pass the book title (or author) as the user said it in bookTitle (and optionally author) instead of workId.',
    'For open_source, pass the user\'s natural reference in target (e.g. "ayah 2:11", "البقرة 11", "Bukhari 1", "البخاري ١", "page 40 of <book title>") or pass bookTitle and page.',
    'For ocr_pdf_page, only OCR the single page the user names, and never set force=true unless the user explicitly asks to re-OCR a page that already has text.',
    'If the request cannot be mapped to the available tools, reply briefly explaining what is missing without calling tools.',
    AI_SCHOLARLY_POLICY,
  ].join('\n');

  const ctx = request.context;
  const contextParts: string[] = [];
  if (ctx?.activeTarget) contextParts.push(`Active target: ${ctx.activeTarget}${ctx.activeLabel ? ` (${ctx.activeLabel})` : ''}`);
  if (ctx?.sources?.length) {
    contextParts.push(
      `Attached sources:\n${ctx.sources.map(source => `- ${source.target} (${source.label})`).join('\n')}`
    );
  }
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

function extractGeminiResult(data: {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        thought?: boolean;
        functionCall?: { id?: unknown; name?: unknown; args?: unknown };
      }>;
    };
  }>;
  promptFeedback?: { blockReason?: string };
}): ToolCallingResult {
  if (data.promptFeedback?.blockReason) {
    return { ok: false, error: 'provider-error', detail: `Gemini blocked: ${data.promptFeedback.blockReason}`.slice(0, 300) };
  }
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const calls: RawToolCall[] = [];
  const textParts: string[] = [];
  for (const part of parts) {
    if (!part || typeof part !== 'object' || part.thought) continue;
    if (typeof part.text === 'string' && part.text) {
      textParts.push(part.text);
    }
    if (part.functionCall && typeof part.functionCall === 'object') {
      calls.push({
        id: typeof part.functionCall.id === 'string' ? part.functionCall.id : undefined,
        name: part.functionCall.name,
        arguments: parseArguments(part.functionCall.args ?? {}),
      });
    }
  }
  const text = textParts.join('').trim();
  if (calls.length > 0) {
    return { ok: true, kind: 'tool_calls', calls, assistantText: text || undefined };
  }
  return { ok: true, kind: 'message', text };
}

function extractClaudeResult(data: {
  content?: Array<{ type?: unknown; id?: unknown; name?: unknown; input?: unknown; text?: unknown }>;
}): ToolCallingResult {
  const blocks = Array.isArray(data.content) ? data.content : [];
  const calls: RawToolCall[] = [];
  const textParts: string[] = [];
  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue;
    if (block.type === 'text' && typeof block.text === 'string' && block.text) {
      textParts.push(block.text);
    } else if (block.type === 'tool_use') {
      calls.push({
        id: typeof block.id === 'string' ? block.id : undefined,
        name: block.name,
        arguments: parseArguments(block.input ?? {}),
      });
    }
  }
  const text = textParts.join('\n').trim();
  if (calls.length > 0) {
    return { ok: true, kind: 'tool_calls', calls, assistantText: text || undefined };
  }
  return { ok: true, kind: 'message', text };
}

export async function callModelWithTools(
  request: AiActionPlanRequest,
  settings: AISettings,
  fetchFn: FetchLike = fetch
): Promise<ToolCallingResult> {
  const provider = settings.provider || 'ollama';
  const { systemPrompt, userPrompt } = buildActionPrompts(request);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), provider === 'ollama' ? 90_000 : 60_000);

  try {
    if (provider === 'gemini') {
      const apiKey = settings.geminiApiKey || settings.apiKey || '';
      if (!apiKey) {
        return { ok: false, error: 'provider-error', detail: 'Google Gemini API key is missing.' };
      }
      const model = geminiModelName(settings.geminiModel);
      const res = await fetchFn(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: 'POST',
          redirect: 'error',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          signal: controller.signal,
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
            tools: [{ functionDeclarations: toGeminiFunctionDeclarations() }],
            toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
            generationConfig: { temperature: settings.temperature ?? 0.3 },
          }),
        }
      );
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        if ([400, 404, 422, 501].includes(res.status) && UNSUPPORTED_TOOL_RE.test(text)) {
          return { ok: true, kind: 'unsupported', reason: text.slice(0, 200) };
        }
        return { ok: false, error: 'provider-error', detail: `Gemini HTTP ${res.status}: ${text || res.statusText}`.slice(0, 300) };
      }
      const data = (await res.json()) as Parameters<typeof extractGeminiResult>[0];
      return extractGeminiResult(data);
    }

    if (provider === 'claude') {
      const apiKey = settings.claudeApiKey || settings.apiKey || '';
      if (!apiKey) {
        return { ok: false, error: 'provider-error', detail: 'Anthropic Claude API key is missing.' };
      }
      const model = settings.claudeModel || 'claude-3-5-sonnet-20241022';
      const res = await fetchFn('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        redirect: 'error',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
          temperature: settings.temperature ?? 0.3,
          tools: toClaudeTools(),
          tool_choice: { type: 'auto' },
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        if ([400, 404, 422, 501].includes(res.status) && UNSUPPORTED_TOOL_RE.test(text)) {
          return { ok: true, kind: 'unsupported', reason: text.slice(0, 200) };
        }
        return { ok: false, error: 'provider-error', detail: `Claude HTTP ${res.status}: ${text || res.statusText}`.slice(0, 300) };
      }
      const data = (await res.json()) as Parameters<typeof extractClaudeResult>[0];
      return extractClaudeResult(data);
    }

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
