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
  /** KEY-385: any OpenAI-compatible service (Groq, OpenRouter, a local LM Studio…), kept apart from the OpenAI fields. */
  customPreset?: string;
  customBaseUrl?: string;
  customApiKey?: string;
  customModel?: string;
  temperature?: number;
  antiSpoilerCeiling: boolean;
  /** KEY-383: the provider the user allowed sending source text to, as remoteConsentKey() names it. */
  remoteConsent?: string;

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
  /** Consent for a dedicated translator identity + endpoint in the existing settings JSON. */
  translationConsent?: string;
  /** Public Google web translation is explicitly opt-in; never a fallback after an API error. */
  googlePublicTranslation?: boolean;
  targetLanguage: string;
  /** KEY-436: Per-module learning mode ('off' | 'hints' | 'full') stored in ai_settings JSON. */
  learningModes?: Partial<Record<import('../ai-learning-mode').AiLearningModule, import('../ai-learning-mode').AiLearningMode>>;
  /** KEY-449: Optional output folder mode for AI action file outputs ('next-to-source' default or 'custom'). */
  aiActionOutputMode?: 'next-to-source' | 'custom';
  aiActionOutputDir?: string;
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
  module?: import('../ai-learning-mode').AiLearningModule;
  inRevisionOrTest?: boolean;
  revealFullAnswer?: boolean;
  attempt?: string;
}

export interface AIResearchResult {
  content: string;
  tool: AIResearchToolType;
  spoilerPrevented: boolean;
  providerUsed: string;
  durationMs: number;
  savedNoteId?: string;
  citations?: import('../research-ai').ResearchAiCitation[];
  isTranslation?: boolean;
  error?: import('../translation-privacy').TranslationErrorCode;
}

export interface TranslationResult {
  error?: import('../translation-privacy').TranslationErrorCode;
  translatedText: string;
  sourceLang?: string;
  targetLang: string;
  providerUsed: string;
}
