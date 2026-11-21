/**
 * KEY-384: the app-wide assistant. A natural multi-turn chat, available on every tab, grounded in whatever the user
 * attaches (notes, ayahs, hadith, book pages) and in the open chapter when the editor is the page. Sources are used
 * and cited when they are relevant; when they do not cover a question the assistant still answers from general
 * knowledge and says so, but never invents Quran or hadith wording or attributes a quote to a source.
 */
import type { ResearchAiCitation, ResearchAiSource } from './research-ai';
import type { ProviderErrorCode } from './ai-errors';
import { isAiLearningModule, type AiLearningModule } from './ai-learning-mode';
import { CITED_ANSWER_RULING_POLICY } from './cited-answer';
import {
  AI_ACTION_TOOL_NAMES,
  formatExecutedActionsBlock,
  type AiActionHistoryEntry,
  type AiActionHistoryStep,
  type AiActionToolName,
} from './ai-actions';

export type ChatAction = 'summarize' | 'explain' | 'guide' | 'questions' | 'terms' | 'outline' | 'rewrite' | 'translate' | 'review';
export const CHAT_ACTIONS: readonly ChatAction[] = ['summarize', 'explain', 'guide', 'questions', 'terms', 'outline', 'rewrite', 'translate', 'review'];
export interface ChatTurn { role: 'user' | 'assistant'; text: string }
export interface ChatSourceRef { target: string; label: string }
export interface ChatRequest {
  /** The conversation so far, oldest first, ending with the user's new message (empty for a quick action). */
  messages: ChatTurn[];
  sources: ChatSourceRef[];
  /** The manuscript chapter open in the editor, used as context with the sources it cites. */
  chapterId?: string;
  selection?: string;
  action?: ChatAction;
  lang: 'ar' | 'en';
  allowRemote: boolean;
  module?: AiLearningModule;
  inRevisionOrTest?: boolean;
  revealFullAnswer?: boolean;
  attempt?: string;
  actionHistory?: AiActionHistoryEntry[];
}
export type ChatError = 'invalid-request' | 'ai-disabled' | 'learning-mode-off' | 'permission-denied' | 'busy' | 'not-configured' | 'needs-selection' | 'missing-source' | ProviderErrorCode;
export type ChatResponse = { ok: true; text: string; citations: ResearchAiCitation[]; sourceCount: number; isTranslation?: boolean } | { ok: false; error: ChatError; detail?: string };

export const CHAT_LIMITS = { turns: 12, turn: 4000, sources: 20, selection: 8000, chapter: 20000, sourceText: 4000, total: 60000 };
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const clip = (value: string, max: number) => (value.length > max ? value.slice(0, max) + ' …' : value);
const TARGET = /^(note|quran|sunnah|book|poetry|media|manuscript):[^\s]{1,400}$/u;

export function validateChatRequest(input: unknown): ChatRequest | 'invalid-request' | 'needs-selection' {
  if (!object(input)) return 'invalid-request';
  const { messages, sources, chapterId, selection, action, lang, allowRemote } = input;
  if ((lang !== 'ar' && lang !== 'en') || typeof allowRemote !== 'boolean' || !Array.isArray(messages) || !Array.isArray(sources)) return 'invalid-request';
  if (action !== undefined && !CHAT_ACTIONS.includes(action as ChatAction)) return 'invalid-request';
  if (chapterId !== undefined && (typeof chapterId !== 'string' || !chapterId || chapterId.length > 200)) return 'invalid-request';
  if (selection !== undefined && typeof selection !== 'string') return 'invalid-request';
  if (sources.length > CHAT_LIMITS.sources) return 'invalid-request';
  const turns: ChatTurn[] = [];
  for (const raw of messages.slice(-CHAT_LIMITS.turns)) {
    if (!object(raw) || (raw.role !== 'user' && raw.role !== 'assistant') || typeof raw.text !== 'string') return 'invalid-request';
    if (raw.text.trim()) turns.push({ role: raw.role, text: clip(raw.text.trim(), CHAT_LIMITS.turn) });
  }
  const refs: ChatSourceRef[] = [];
  for (const raw of sources) {
    if (!object(raw) || typeof raw.target !== 'string' || !TARGET.test(raw.target) || typeof raw.label !== 'string') return 'invalid-request';
    if (!refs.some(ref => ref.target === raw.target)) refs.push({ target: raw.target, label: raw.label.replace(/[\r\n]+/gu, ' ').trim().slice(0, 200) || raw.target });
  }
  const actionHistory: AiActionHistoryEntry[] = [];
  if (Array.isArray(input.actionHistory)) {
    for (const rawEntry of input.actionHistory.slice(-10)) {
      if (!object(rawEntry) || typeof rawEntry.executionId !== 'string' || !rawEntry.executionId.trim()) continue;
      const status = rawEntry.status === 'undone' ? 'undone' : rawEntry.status === 'executed' ? 'executed' : null;
      if (!status || !Array.isArray(rawEntry.steps)) continue;
      const steps: AiActionHistoryStep[] = [];
      for (const rawStep of rawEntry.steps.slice(0, 10)) {
        if (!object(rawStep) || typeof rawStep.tool !== 'string' || !(AI_ACTION_TOOL_NAMES as readonly string[]).includes(rawStep.tool)) continue;
        const summary = typeof rawStep.summary === 'string' ? clip(rawStep.summary.trim(), 300) : rawStep.tool;
        const outputPaths = Array.isArray(rawStep.outputPaths)
          ? rawStep.outputPaths.filter((p): p is string => typeof p === 'string' && p.length > 0 && p.length <= 1000).slice(0, 50)
          : undefined;
        const importedWorkIds = object(rawStep.importedWorkIds)
          ? Object.fromEntries(
              Object.entries(rawStep.importedWorkIds).filter(
                (entry): entry is [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string'
              )
            )
          : undefined;
        steps.push({
          tool: rawStep.tool as AiActionToolName,
          summary,
          ...(typeof rawStep.sourceLabel === 'string' && rawStep.sourceLabel.trim() ? { sourceLabel: clip(rawStep.sourceLabel.trim(), 300) } : {}),
          ...(typeof rawStep.sourceWorkId === 'string' && rawStep.sourceWorkId.trim() ? { sourceWorkId: rawStep.sourceWorkId.trim().slice(0, 180) } : {}),
          ...(outputPaths?.length ? { outputPaths } : {}),
          ...(typeof rawStep.openTarget === 'string' && rawStep.openTarget.trim() ? { openTarget: rawStep.openTarget.trim().slice(0, 400) } : {}),
          ...(importedWorkIds && Object.keys(importedWorkIds).length > 0 ? { importedWorkIds } : {}),
        });
      }
      if (steps.length > 0) {
        actionHistory.push({ executionId: rawEntry.executionId.trim().slice(0, 180), status, steps });
      }
    }
  }
  const clean: ChatRequest = {
    messages: turns, sources: refs, lang, allowRemote,
    ...(typeof chapterId === 'string' && chapterId ? { chapterId } : {}),
    ...(typeof selection === 'string' && selection.trim() ? { selection: clip(selection.trim(), CHAT_LIMITS.selection) } : {}),
    ...(action ? { action: action as ChatAction } : {}),
    ...(isAiLearningModule(input.module) ? { module: input.module } : {}),
    ...(input.inRevisionOrTest === true ? { inRevisionOrTest: true } : {}),
    ...(input.revealFullAnswer === true ? { revealFullAnswer: true } : {}),
    ...(typeof input.attempt === 'string' && input.attempt.trim() ? { attempt: clip(input.attempt.trim(), CHAT_LIMITS.turn) } : {}),
    ...(actionHistory.length > 0 ? { actionHistory } : {}),
  };
  const last = clean.messages[clean.messages.length - 1];
  if (!clean.action && (!last || last.role !== 'user')) return 'invalid-request';
  if (clean.action === 'rewrite' && !clean.selection) return 'needs-selection';
  return clean;
}

const ACTIONS: Record<ChatAction, string> = {
  summarize: 'Summarise the key points of {target} in a short list.',
  explain: 'Explain {target} simply, as a teacher would to a student, with the main idea first.',
  guide: 'Write a study guide for {target}: the main ideas in order, each with its evidence.',
  questions: 'Write practice questions with short model answers about {target}.',
  terms: 'List the key terms in {target} with a one-line definition each.',
  outline: 'Suggest an outline for developing {target} further, and which sources support each part. Point out claims that still need a source.',
  rewrite: 'Rewrite {target} in clear academic language, keeping its meaning, quotations and citations. Return only the rewritten passage.',
  translate: 'Translate {target} into {other}. Keep Quranic verses and hadith in their original Arabic, with a translation in parentheses. Return only the translation.',
  review: 'Review {target} for language, clarity and consistency. Give concrete suggestions, quoting the words to change.',
};

export function buildChatPrompt(input: { request: ChatRequest; sources: ResearchAiSource[]; chapter?: { title: string; text: string }; page?: string }): { systemPrompt: string; userPrompt: string } {
  const { request, sources, chapter } = input;
  const language = request.lang === 'ar' ? 'Arabic' : 'English';
  let budget = CHAT_LIMITS.total;
  const take = (text: string, max: number) => { const piece = clip(text, Math.max(0, Math.min(max, budget))); budget -= piece.length; return piece; };
  const chapterBlock = chapter ? `<CHAPTER title="${chapter.title.replace(/"/g, "'")}">\n${take(chapter.text.trim(), CHAT_LIMITS.chapter) || '(empty chapter)'}\n</CHAPTER>` : '';
  const sourceBlock = sources.map(source => `[${source.n}] ${source.label} (${source.ref})\n${take(source.text, CHAT_LIMITS.sourceText)}`).join('\n\n');
  const actionsBlock = formatExecutedActionsBlock(request.actionHistory);
  const systemPrompt = [
    'You are the assistant in BagLib, an Islamic studies library. Talk with the user naturally, like a knowledgeable study partner: answer what they ask, follow up on earlier turns, and keep answers clear and concise. Do not greet, introduce yourself or name the app; go straight to the answer.',
    `Reply in ${language} unless the user writes in another language or asks for a translation.`,
    sources.length || chapter ? 'The user shared the material below. Use it first. When a statement relies on a numbered source, cite it right after the statement as [1] or [2][3]. Only cite numbers from the list.' : 'The user has not shared any material for this conversation.',
    ...(actionsBlock || sources.length
      ? ['Any books or sources in <SOURCES> or <EXECUTED_ACTIONS> are available in this session; never claim you lack access to a book that is attached or was just used in an action.']
      : []),
    ...(actionsBlock
      ? ['When asked about a recent action or where its output is (e.g. "where is the output?"), answer directly using the exact file paths, source, and undo status from <EXECUTED_ACTIONS>.']
      : []),
    'If the material does not cover the question, still help: answer from your general knowledge and say briefly that this part is not from their sources. Never claim a source says something it does not. Any statement without a source citation will be marked as unsourced.',
    'Strict rule for Quran and hadith: write their wording ONLY when it appears in the material given, copied exactly. Never write a verse or a hadith from memory, not even a well-known one, not even partly, and do not put remembered wording in quotation marks. Instead, describe its meaning in your own words and give the reference (for example: al-Baqarah 2:153, or Sahih Muslim 2999), then suggest adding it with "Add source" so its exact text can be quoted from BagLib.',
    CITED_ANSWER_RULING_POLICY,
    'Be careful with rulings: mention differences of opinion where they exist.',
    'Use plain text: short paragraphs or "- " lists, no Markdown headings.',
    ...(chapterBlock ? ['', chapterBlock] : []),
    ...(sourceBlock ? ['', '<SOURCES>', sourceBlock, '</SOURCES>'] : []),
    ...(actionsBlock ? ['', actionsBlock] : []),
  ].join('\n');
  const history = request.messages.slice(0, request.action ? undefined : -1);
  const transcript = history.length ? 'Conversation so far:\n' + history.map(turn => `${turn.role === 'user' ? 'User' : 'Assistant'}: ${turn.text}`).join('\n') + '\n\n' : '';
  let ask: string;
  if (request.action) {
    const target = request.selection ? `the selected passage:\n<PASSAGE>\n${request.selection}\n</PASSAGE>\n` : chapter ? 'the chapter' : sources.length ? 'the shared material' : 'the topic of our conversation';
    ask = ACTIONS[request.action].replace('{target}', target).replace('{other}', request.lang === 'ar' ? 'English' : 'Arabic');
    const note = request.messages[request.messages.length - 1];
    if (note?.role === 'user') ask += `\nFocus: ${note.text}`;
  } else {
    ask = request.messages[request.messages.length - 1].text;
    if (request.selection) ask += `\n\n(Selected text: "${request.selection}")`;
  }
  if (request.attempt) {
    ask += `\n\n(Learner's attempt: "${request.attempt}")`;
  }
  return { systemPrompt, userPrompt: `${transcript}User: ${ask}` };
}
