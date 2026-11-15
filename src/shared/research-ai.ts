/**
 * KEY-373 (RE-12): research AI for the manuscript editor. Pure helpers only: which sources a chapter cites,
 * the grounded prompt, and the citation markers in an answer. The provider call lives in the main process.
 * Context is the current chapter plus the sources it cites (manuscript_link), nothing else.
 */
import { parseManuscriptSnapshot } from './manuscript-snapshot';

export type ResearchAiAction = 'ask' | 'summarize' | 'rewrite' | 'translate' | 'outline' | 'review';
export const RESEARCH_AI_ACTIONS: readonly ResearchAiAction[] = ['ask', 'summarize', 'rewrite', 'translate', 'outline', 'review'];
/** Actions that work on the selected passage when there is one, else on the whole chapter. */
export const SELECTION_ACTIONS: readonly ResearchAiAction[] = ['rewrite', 'translate', 'review', 'summarize'];

export interface ResearchAiRequest {
  documentId: string;
  action: ResearchAiAction;
  question?: string;
  selection?: string;
  lang: 'ar' | 'en';
  targetLang?: 'ar' | 'en';
}
export interface ResearchAiSource { n: number; ref: string; label: string; text: string }
export interface ResearchAiCitation { n: number; ref: string; label: string }
export type ResearchAiError = 'not-configured' | 'needs-selection' | 'needs-question' | 'provider-error' | 'invalid-request';
export type ResearchAiResponse =
  | { ok: true; text: string; citations: ResearchAiCitation[]; sourceCount: number; provider: string }
  | { ok: false; error: ResearchAiError; message?: string };

export interface ChapterLink { block_id: string; target_scheme: string; target_id: string }
export interface NoteText { title: string; content: string }

export const LIMITS = { chapter: 20000, source: 4000, sources: 20, selection: 8000, question: 2000 };
const clip = (value: string, max: number) => (value.length > max ? value.slice(0, max) + ' …' : value);
type Json = Record<string, unknown>;
const object = (value: unknown): value is Json => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const plain = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(item => (object(item) && typeof item.insert === 'string' ? item.insert : '')).join('');
  if (object(value)) return plain(value.delta);
  return '';
};

/** Validate a request coming over IPC. Returns a clean copy, or an error code. */
export function validateResearchAiRequest(input: unknown): ResearchAiRequest | ResearchAiError {
  if (!object(input)) return 'invalid-request';
  const { documentId, action, question, selection, lang, targetLang } = input;
  if (typeof documentId !== 'string' || !documentId || documentId.length > 200) return 'invalid-request';
  if (typeof action !== 'string' || !RESEARCH_AI_ACTIONS.includes(action as ResearchAiAction)) return 'invalid-request';
  if (lang !== 'ar' && lang !== 'en') return 'invalid-request';
  if (targetLang !== undefined && targetLang !== 'ar' && targetLang !== 'en') return 'invalid-request';
  if (question !== undefined && typeof question !== 'string') return 'invalid-request';
  if (selection !== undefined && typeof selection !== 'string') return 'invalid-request';
  const text = (value: unknown, max: number) => (typeof value === 'string' && value.trim() ? clip(value.trim(), max) : undefined);
  const clean: ResearchAiRequest = {
    documentId, action: action as ResearchAiAction, lang: lang as 'ar' | 'en',
    question: text(question, LIMITS.question),
    selection: text(selection, LIMITS.selection),
    targetLang: targetLang as 'ar' | 'en' | undefined,
  };
  if (clean.action === 'ask' && !clean.question) return 'needs-question';
  if (clean.action === 'rewrite' && !clean.selection) return 'needs-selection';
  return clean;
}

/**
 * The sources a chapter cites: BagLib blocks whose links are in manuscript_link for this chapter. Text comes
 * from the block itself (ayah, hadith, verse, book quote) or, for a note embed, from the note (never copied).
 */
export function collectChapterSources(snapshot: string, links: ChapterLink[], note: (id: string) => NoteText | undefined): ResearchAiSource[] {
  const byBlock = new Map<string, ChapterLink[]>();
  for (const link of links) byBlock.set(link.block_id, [...(byBlock.get(link.block_id) ?? []), link]);
  const sources = new Map<string, ResearchAiSource>();
  const visit = (block: unknown) => {
    if (!object(block)) return;
    const id = typeof block.id === 'string' ? block.id : '';
    const props = object(block.props) ? block.props : {};
    const flavour = typeof block.flavour === 'string' ? block.flavour : '';
    for (const link of flavour.startsWith('baglib:') ? byBlock.get(id) ?? [] : []) {
      const ref = `${link.target_scheme}:${link.target_id}`;
      if (sources.has(ref) || sources.size >= LIMITS.sources) continue;
      let label = plain(props.label) || plain(props.title);
      let text = plain(props.text);
      if (!text && Array.isArray(props.verses)) {
        text = props.verses.map(verse => (object(verse) ? [plain(verse.sadr), plain(verse.ajuz)].filter(Boolean).join(' … ') : '')).filter(Boolean).join('\n');
      }
      if (link.target_scheme === 'note') {
        const found = note(link.target_id.split('#')[0]);
        if (!found) continue;
        label = found.title || label;
        text = found.content;
      }
      if (!text.trim()) continue;
      sources.set(ref, { n: sources.size + 1, ref, label: label || ref, text: clip(text.trim(), LIMITS.source) });
    }
    if (Array.isArray(block.children)) block.children.forEach(visit);
  };
  visit(parseManuscriptSnapshot(snapshot).blocks);
  return [...sources.values()];
}

const languageName = (lang: 'ar' | 'en') => (lang === 'ar' ? 'Arabic' : 'English');

export function buildResearchAiPrompt(input: {
  request: ResearchAiRequest; chapterTitle: string; chapterText: string; sources: ResearchAiSource[];
}): { systemPrompt: string; userPrompt: string } {
  const { request, chapterTitle, chapterText, sources } = input;
  const answerLang = languageName(request.lang);
  const sourceBlock = sources.length
    ? sources.map(source => `[${source.n}] ${source.label} (${source.ref})\n${source.text}`).join('\n\n')
    : '(this chapter cites no sources)';
  const systemPrompt = [
    'You are the research assistant in BagLib, an Islamic studies library. You help a researcher write a manuscript.',
    'Use only the chapter text and the numbered sources below. Do not use outside knowledge for claims about the sources.',
    'When a statement relies on a source, cite it right after the statement with its number in square brackets, like [1] or [2][3].',
    'Only cite numbers that appear in the sources list. Never invent sources, numbers, verses or hadith.',
    'If the chapter and sources do not support an answer, say so plainly.',
    'Quote Quranic verses and hadith exactly as given; do not paraphrase them as quotations.',
    `Answer in ${answerLang} unless asked to translate. Use plain text with short paragraphs or "- " lists, no Markdown headings.`,
    '',
    `<CHAPTER title="${chapterTitle.replace(/"/g, "'")}">`,
    clip(chapterText.trim(), LIMITS.chapter) || '(empty chapter)',
    '</CHAPTER>',
    '',
    '<SOURCES>',
    sourceBlock,
    '</SOURCES>',
  ].join('\n');
  const passage = request.selection ? `the selected passage:\n<PASSAGE>\n${request.selection}\n</PASSAGE>` : 'the whole chapter';
  let userPrompt: string;
  switch (request.action) {
    case 'summarize': userPrompt = `Summarise the key points of ${passage}\nUse a short list and cite the sources each point relies on.`; break;
    case 'rewrite': userPrompt = `Rewrite ${passage}\nWrite clear academic ${answerLang}, keep the meaning and keep any quotations and citations. Return only the rewritten passage.`; break;
    case 'translate': {
      const target = languageName(request.targetLang ?? (request.lang === 'ar' ? 'en' : 'ar'));
      userPrompt = `Translate ${passage}\ninto ${target}. Keep Quranic verses and hadith in their original Arabic wording, followed by a translation in parentheses. Return only the translation.`;
      break;
    }
    case 'outline': userPrompt = 'Suggest an outline for developing this chapter further: the main sections, and which of the sources supports each one. Point out claims that still need a source.'; break;
    case 'review': userPrompt = `Review ${passage}\nfor academic language, clarity and consistency. List concrete suggestions, quoting the words to change. Mention any statement that cites no source but needs one.`; break;
    case 'ask':
    default: userPrompt = request.question ?? '';
  }
  return { systemPrompt, userPrompt };
}

const toAscii = (value: string) => value.replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06f0));

/**
 * Normalise citation markers ([١] → [1]), drop markers that point to no listed source, and return the
 * citations in order of first use.
 */
export function parseAnswerCitations(answer: string, sources: ResearchAiSource[]): { text: string; citations: ResearchAiCitation[] } {
  const byN = new Map(sources.map(source => [source.n, source]));
  const used = new Map<number, ResearchAiCitation>();
  const text = answer.replace(/\s?\[([0-9٠-٩۰-۹]{1,3})\]/g, (match, digits: string) => {
    const n = Number(toAscii(digits));
    const source = byN.get(n);
    if (!source) return '';
    if (!used.has(n)) used.set(n, { n, ref: source.ref, label: source.label });
    return match.startsWith(' ') ? ` [${n}]` : `[${n}]`;
  }).trim();
  return { text, citations: [...used.values()] };
}

/** Text to insert into the chapter: markers become the source label in parentheses. */
export function answerForInsert(text: string, citations: ResearchAiCitation[]): string {
  const byN = new Map(citations.map(citation => [citation.n, citation.label]));
  return text.replace(/\s?\[(\d{1,3})\]/g, (match, digits: string) => {
    const label = byN.get(Number(digits));
    return label ? ` (${label})` : '';
  });
}

/** Whether the saved settings can call a provider at all (Ollama needs no key). */
export function providerReady(settings: { enabled?: boolean; provider?: string; apiKey?: string; geminiApiKey?: string; claudeApiKey?: string; baseUrl?: string }): boolean {
  if (settings.enabled === false) return false;
  switch (settings.provider ?? 'ollama') {
    case 'ollama': return true;
    case 'gemini': return Boolean(settings.geminiApiKey || settings.apiKey);
    case 'claude': return Boolean(settings.claudeApiKey || settings.apiKey);
    case 'custom': return Boolean(settings.baseUrl || settings.apiKey);
    default: return Boolean(settings.apiKey);
  }
}
