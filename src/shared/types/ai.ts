/**
 * Baglib — AI Research Assistant & Translation Domain Types (KEY-143)
 */

export type AIProviderId = 'openai' | 'gemini' | 'claude' | 'ollama' | 'custom';
export type TranslationProviderId = 'deepl' | 'google' | 'yandex' | 'llm';

export interface AISettings {
  enabled: boolean;
  provider: AIProviderId;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  temperature?: number;
  antiSpoilerCeiling: boolean;

  // Ollama local setup
  ollamaEndpoint?: string;
  ollamaModel?: string;

  // Google Gemini setup
  geminiApiKey?: string;
  geminiModel?: string;

  // Anthropic Claude setup
  claudeApiKey?: string;
  claudeModel?: string;

  // Translation configuration
  translationProvider: TranslationProviderId;
  translationApiKey?: string;
  targetLanguage: string;
}

export interface BookPassage {
  pageNumber: number;
  chapterTitle?: string;
  text: string;
}

export type AIResearchToolType =
  | 'chat'
  | 'contextual_dictionary'
  | 'structured_summary'
  | 'biographical_tarajim'
  | 'inline_translation';

export interface AIResearchQueryPayload {
  bookId?: string;
  bookTitle: string;
  authorName?: string;
  currentPage: number;
  selectedText?: string;
  surroundingContext?: string;
  tool: AIResearchToolType;
  userQuery?: string;
  targetLang?: string;
  saveAsNote?: boolean;
}

export interface AIResearchResult {
  content: string;
  tool: AIResearchToolType;
  spoilerPrevented: boolean;
  providerUsed: string;
  durationMs: number;
  savedNoteId?: string;
}

export interface TranslationResult {
  translatedText: string;
  sourceLang?: string;
  targetLang: string;
  providerUsed: string;
}
