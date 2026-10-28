/**
 * Baglib — Sandboxed Reader Plugin API Types (KEY-149)
 *
 * Extensibility hooks for custom dictionaries, TTS voice providers, themes, and reading enhancements.
 */

export type ReaderPluginType = 'dictionary' | 'tts_voice' | 'theme' | 'enhancement';

export interface PluginDictionaryEntry {
  headword: string;
  definition: string;
  pronunciation?: string;
  source: string;
  html?: string;
}

export interface PluginTtsVoice {
  id: string;
  name: string;
  lang: string;
  gender?: 'male' | 'female' | 'neutral';
  service: string;
}

export interface ReaderPluginContext {
  bookId: string;
  format: string;
  currentPage: number;
  totalPages: number;
  theme: string;
  direction: 'rtl' | 'ltr';
}

export interface BaglibReaderPlugin {
  id: string;
  name: string;
  version: string;
  author?: string;
  description?: string;
  type: ReaderPluginType;
  enabled: boolean;
  settings?: Record<string, unknown>;
  customCss?: string;
  supportedLanguages?: string[];

  // Optional plugin callbacks / hooks
  onReaderInit?(context: ReaderPluginContext): void | Promise<void>;
  onPageChange?(page: number, totalPages: number): void | Promise<void>;
  onLookupWord?(word: string, lang?: string): Promise<PluginDictionaryEntry | null>;
  onProvideTtsVoices?(): Promise<PluginTtsVoice[]>;
  onTextSelected?(selectedText: string): Promise<string | null | void>;
  cleanup?(): void;
}
