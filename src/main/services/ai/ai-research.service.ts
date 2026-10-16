/**
 * Baglib — AI Research Assistant Coordinator & Anti-Spoiler RAG Service (KEY-143)
 *
 * Enforces Readest's anti-spoiler context ceiling (`<BOOK_PASSAGES page_limit="${currentPage}">`),
 * coordinates local/remote BYOK LLMs, executes academic tools (Lexicon, Summaries, Tarajim, Translation),
 * and links structured notes into the reader annotations system.
 */

import type Database from 'better-sqlite3';
import { getDatabase } from '../../database/connection';
import { SqliteSettingsRepository } from '../../database/repositories/settings.repository';
import { SqliteAnnotationRepository } from '../../database/repositories/annotation.repository';
import type {
  AISettings,
  AIResearchQueryPayload,
  AIResearchResult,
  BookPassage,
} from '../../../shared/types/ai';
import {
  buildAntiSpoilerSystemPrompt,
  buildContextualDictionaryPrompt,
  buildStructuredSummaryPrompt,
  buildBiographicalTarajimPrompt,
} from '../../../shared/utils/ai-prompts';
import { AIProviderService, HealthCheckResult } from './ai-provider.service';
import { TranslationService } from './translation.service';

export const DEFAULT_AI_SETTINGS: AISettings = {
  enabled: true,
  provider: 'ollama',
  model: 'llama3.2',
  temperature: 0.7,
  antiSpoilerCeiling: true,
  ollamaEndpoint: 'http://127.0.0.1:11434',
  ollamaModel: 'llama3.2',
  geminiModel: 'gemini-1.5-flash',
  claudeModel: 'claude-3-5-sonnet-20241022',
  translationProvider: 'llm',
  targetLanguage: 'ar',
};

const SETTINGS_KEY = 'ai_settings';

export class AIResearchService {
  private static instance: AIResearchService | null = null;
  private db: Database.Database;
  private settingsRepo: SqliteSettingsRepository;
  private aiProvider: AIProviderService;
  private translationService: TranslationService;

  constructor(db?: Database.Database) {
    this.db = db ?? getDatabase();
    this.settingsRepo = new SqliteSettingsRepository(this.db);
    this.aiProvider = AIProviderService.getInstance();
    this.translationService = TranslationService.getInstance();
  }

  public static getInstance(db?: Database.Database): AIResearchService {
    if (!AIResearchService.instance) {
      AIResearchService.instance = new AIResearchService(db);
    }
    return AIResearchService.instance;
  }

  /**
   * Retrieves active AI and BYOK settings, merging with defaults.
   */
  public getSettings(): AISettings {
    try {
      const stored = this.settingsRepo.get<Partial<AISettings>>(SETTINGS_KEY);
      return {
        ...DEFAULT_AI_SETTINGS,
        ...(stored || {}),
      };
    } catch (err) {
      console.warn('[baglib:ai] Could not load AI settings from database:', err);
      return { ...DEFAULT_AI_SETTINGS };
    }
  }

  /**
   * Persists updated AI settings into app_settings.
   */
  public saveSettings(newSettings: Partial<AISettings>): AISettings {
    const current = this.getSettings();
    const merged: AISettings = {
      ...current,
      ...newSettings,
    };
    this.settingsRepo.set(SETTINGS_KEY, merged);
    return merged;
  }

  /**
   * Tests connection to the configured or provided AI endpoint.
   */
  public async testConnection(customSettings?: AISettings): Promise<HealthCheckResult> {
    const settings = customSettings || this.getSettings();
    return await this.aiProvider.healthCheck(settings);
  }

  /**
   * Executes an academic reading tool or chat query under the Anti-Spoiler RAG ceiling.
   */
  public async executeTool(payload: AIResearchQueryPayload): Promise<AIResearchResult> {
    const startTime = Date.now();
    const settings = this.getSettings();

    // 1. Handle Inline Translation Tool directly
    if (payload.tool === 'inline_translation') {
      const transResult = await this.translationService.translate(
        {
          text: payload.selectedText || payload.surroundingContext || '',
          targetLang: payload.targetLang || settings.targetLanguage || 'ar',
          bookTitle: payload.bookTitle,
        },
        settings
      );

      return {
        content: transResult.translatedText,
        tool: 'inline_translation',
        spoilerPrevented: false,
        providerUsed: transResult.providerUsed,
        durationMs: Date.now() - startTime,
      };
    }

    // 2. Anti-Spoiler Passage Extraction from FTS5
    const passages = this.extractBookPassagesUpToPage(
      payload.bookId,
      payload.currentPage,
      payload.surroundingContext
    );

    // 3. Build Tool-Specific Prompts
    const systemPrompt = buildAntiSpoilerSystemPrompt({
      bookTitle: payload.bookTitle,
      authorName: payload.authorName,
      currentPage: payload.currentPage,
      passages,
      antiSpoilerCeiling: settings.antiSpoilerCeiling !== false,
    });

    let userPrompt = '';
    switch (payload.tool) {
      case 'contextual_dictionary':
        userPrompt = buildContextualDictionaryPrompt(
          payload.selectedText || payload.userQuery || '',
          payload.surroundingContext,
          payload.bookTitle
        );
        break;

      case 'structured_summary':
        userPrompt = buildStructuredSummaryPrompt(
          payload.surroundingContext || payload.selectedText || '',
          payload.bookTitle,
          payload.currentPage
        );
        break;

      case 'biographical_tarajim':
        userPrompt = buildBiographicalTarajimPrompt(
          payload.selectedText || payload.userQuery || '',
          payload.surroundingContext
        );
        break;

      case 'chat':
      default:
        userPrompt =
          payload.userQuery ||
          (payload.selectedText
            ? `Regarding this passage on page ${payload.currentPage}: "${payload.selectedText}"\nWhat are the scholarly reflections on it?`
            : `Please summarize the key scholarly discourse on page ${payload.currentPage}.`);
        break;
    }

    // 4. Generate Completion via BYOK Provider
    const generatedContent = await this.aiProvider.generateChatCompletion(
      {
        systemPrompt,
        userPrompt,
        temperature: settings.temperature ?? 0.7,
      },
      settings
    );

    // 5. Optionally save result as a research note in annotations
    let savedNoteId: string | undefined = undefined;
    if (payload.saveAsNote && payload.bookId && generatedContent.trim()) {
      try {
        const annotRepo = new SqliteAnnotationRepository(this.db);
        const savedNote = annotRepo.save({
          bookId: payload.bookId,
          type: 'note',
          locationCfiOrPage: String(payload.currentPage),
          selectedText: payload.selectedText || null,
          noteContent: generatedContent.trim(),
          color: '#4f46e5',
          tags: ['AI-Research', payload.tool],
        });
        savedNoteId = savedNote.id;
      } catch (err) {
        console.warn('[baglib:ai] Could not save AI summary as annotation note:', err);
      }
    }

    return {
      content: generatedContent.trim(),
      tool: payload.tool,
      spoilerPrevented: settings.antiSpoilerCeiling !== false,
      providerUsed: settings.provider || 'ollama',
      durationMs: Date.now() - startTime,
      savedNoteId,
    };
  }

  /**
   * Retrieves passages from the SQLite FTS5 index for this book, strictly up to `currentPage`.
   */
  private extractBookPassagesUpToPage(
    bookId?: string,
    currentPage: number = 1,
    fallbackText?: string
  ): BookPassage[] {
    const results: BookPassage[] = [];

    if (bookId) {
      try {
        const rows = this.db
          .prepare(
            `
            SELECT page_number, chapter_title, content
            FROM book_content_fts
            WHERE book_id = ? AND page_number <= ?
            ORDER BY page_number ASC
            LIMIT 30
          `
          )
          .all(bookId, currentPage) as Array<{
          page_number: number;
          chapter_title: string;
          content: string;
        }>;

        for (const row of rows) {
          if (row.content && row.content.trim()) {
            results.push({
              pageNumber: Number(row.page_number) || 1,
              chapterTitle: row.chapter_title || undefined,
              text: row.content.trim(),
            });
          }
        }
      } catch {
        // Book may not be indexed in FTS table yet
      }
    }

    // If no indexed passages were found, use the active surrounding context as page passage
    if (results.length === 0 && fallbackText && fallbackText.trim()) {
      results.push({
        pageNumber: currentPage,
        text: fallbackText.trim(),
      });
    }

    return results;
  }
}
