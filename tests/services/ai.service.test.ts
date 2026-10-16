import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type Database from 'better-sqlite3';
import { createTestDatabase } from '../helpers/test-db';
import { AIProviderService } from '../../src/main/services/ai/ai-provider.service';
import { TranslationService } from '../../src/main/services/ai/translation.service';
import {
  AIResearchService,
  DEFAULT_AI_SETTINGS,
} from '../../src/main/services/ai/ai-research.service';
import { ContentFtsRepository } from '../../src/main/database/repositories/content-fts.repository';
import type { AISettings } from '../../src/shared/types/ai';

describe('KEY-143 BYOK AI Provider & Research Assistant Services', () => {
  let db: Database.Database;
  let aiResearchService: AIResearchService;
  let ftsRepo: ContentFtsRepository;

  beforeEach(() => {
    db = createTestDatabase();
    aiResearchService = new AIResearchService(db);
    ftsRepo = new ContentFtsRepository(db);

    // Seed dummy work
    db.exec(`
      INSERT OR IGNORE INTO work_type (id, name, icon) VALUES ('wt-book', 'كتاب', 'book');
      INSERT INTO work (id, work_type_id, title) VALUES ('work-1', 'wt-book', 'صيد الخاطر');
    `);
  });

  describe('AIProviderService (BYOK Multi-Model Client)', () => {
    const providerService = AIProviderService.getInstance();

    it('returns structured diagnostic failure for unreachable Ollama endpoint', async () => {
      const res = await providerService.healthCheck({
        ...DEFAULT_AI_SETTINGS,
        provider: 'ollama',
        ollamaEndpoint: 'http://127.0.0.1:59999', // Non-existent port
      });

      assert.equal(res.success, false);
      assert.ok(res.message?.includes('Could not reach Ollama'));
    });

    it('returns missing key warning for OpenAI provider when key is omitted', async () => {
      const res = await providerService.healthCheck({
        ...DEFAULT_AI_SETTINGS,
        provider: 'openai',
        apiKey: '',
      });

      assert.equal(res.success, false);
      assert.ok(res.message?.includes('API Key is missing'));
    });

    it('returns missing key warning for Gemini provider when key is omitted', async () => {
      const res = await providerService.healthCheck({
        ...DEFAULT_AI_SETTINGS,
        provider: 'gemini',
        geminiApiKey: '',
        apiKey: '',
      });

      assert.equal(res.success, false);
      assert.ok(res.message?.includes('Gemini API key is missing'));
    });

    it('returns missing key warning for Claude provider when key is omitted', async () => {
      const res = await providerService.healthCheck({
        ...DEFAULT_AI_SETTINGS,
        provider: 'claude',
        claudeApiKey: '',
        apiKey: '',
      });

      assert.equal(res.success, false);
      assert.ok(res.message?.includes('Anthropic Claude API key is missing'));
    });
  });

  describe('TranslationService', () => {
    const transService = TranslationService.getInstance();

    it('handles empty or whitespace text gracefully without making network requests', async () => {
      const res = await transService.translate(
        { text: '   ' },
        DEFAULT_AI_SETTINGS
      );

      assert.equal(res.translatedText, '');
      assert.equal(res.providerUsed, 'none');
    });

    it('defaults target language to configured settings targetLanguage', async () => {
      const res = await transService.translate(
        { text: '' },
        { ...DEFAULT_AI_SETTINGS, targetLanguage: 'fr' }
      );

      assert.equal(res.targetLang, 'fr');
    });
  });

  describe('AIResearchService (Anti-Spoiler RAG Coordinator)', () => {
    it('initializes with complete safe defaults', () => {
      const settings = aiResearchService.getSettings();
      assert.equal(settings.provider, 'ollama');
      assert.equal(settings.antiSpoilerCeiling, true);
      assert.equal(settings.targetLanguage, 'ar');
    });

    it('persists and retrieves updated settings in SQLite app_settings', () => {
      const updated: Partial<AISettings> = {
        provider: 'gemini',
        geminiModel: 'gemini-1.5-pro',
        targetLanguage: 'en',
      };

      aiResearchService.saveSettings(updated);
      const retrieved = aiResearchService.getSettings();

      assert.equal(retrieved.provider, 'gemini');
      assert.equal(retrieved.geminiModel, 'gemini-1.5-pro');
      assert.equal(retrieved.targetLanguage, 'en');
      assert.equal(retrieved.antiSpoilerCeiling, true); // Retains defaults
    });

    it('strictly limits FTS5 extracted passages up to currentPage under anti-spoiler ceiling', async () => {
      // Index pages: 2, 5, 10, 20
      ftsRepo.indexBook('work-1', [
        { pageNumber: 2, locationCfiOrPage: '2', content: 'مقدمة الكتاب وبيان فضيلته' },
        { pageNumber: 5, locationCfiOrPage: '5', content: 'فصل في إصلاح الباطن والتفكر' },
        { pageNumber: 10, locationCfiOrPage: '10', content: 'فصل في مواعظ النفس عند الخلوات' },
        { pageNumber: 20, locationCfiOrPage: '20', content: 'خاتمة المطاف وما آل إليه الأمر' },
      ]);

      // Mock generateChatCompletion on the provider instance
      const originalGenerate = AIProviderService.getInstance().generateChatCompletion;
      let capturedSystemPrompt = '';
      AIProviderService.getInstance().generateChatCompletion = async (req) => {
        capturedSystemPrompt = req.systemPrompt;
        return 'ملخص علمي منهجي عن إصلاح الباطن.';
      };

      try {
        const result = await aiResearchService.executeTool({
          bookId: 'work-1',
          bookTitle: 'صيد الخاطر',
          currentPage: 5,
          tool: 'structured_summary',
        });

        assert.equal(result.spoilerPrevented, true);
        assert.ok(capturedSystemPrompt.includes('<BOOK_PASSAGES page_limit="5">'));
        assert.ok(capturedSystemPrompt.includes('Page 2'));
        assert.ok(capturedSystemPrompt.includes('Page 5'));
        // Pages 10 and 20 MUST NOT be included
        assert.ok(!capturedSystemPrompt.includes('Page 10'));
        assert.ok(!capturedSystemPrompt.includes('Page 20'));
      } finally {
        AIProviderService.getInstance().generateChatCompletion = originalGenerate;
      }
    });

    it('persists structured summary directly as a research note when saveAsNote is true', async () => {
      const originalGenerate = AIProviderService.getInstance().generateChatCompletion;
      AIProviderService.getInstance().generateChatCompletion = async () => {
        return '📌 الأطروحة المركزية: إصلاح النية قبل العمل.';
      };

      try {
        const result = await aiResearchService.executeTool({
          bookId: 'work-1',
          bookTitle: 'صيد الخاطر',
          currentPage: 7,
          surroundingContext: 'إنما الأعمال بالنيات وإنما لكل امرئ ما نوى',
          tool: 'structured_summary',
          saveAsNote: true,
        });

        assert.ok(result.savedNoteId, 'Should return savedNoteId');

        // Verify note exists in database
        const row = db
          .prepare('SELECT * FROM annotations WHERE id = ?')
          .get(result.savedNoteId) as any;

        assert.ok(row, 'Note should be persisted in annotations table');
        assert.equal(row.book_id, 'work-1');
        assert.equal(row.type, 'note');
        assert.equal(row.location_cfi_or_page, '7');
        assert.ok(row.note_content.includes('الأطروحة المركزية'));

        const tags = JSON.parse(row.tags);
        assert.ok(tags.includes('AI-Research'));
        assert.ok(tags.includes('structured_summary'));
      } finally {
        AIProviderService.getInstance().generateChatCompletion = originalGenerate;
      }
    });
  });
});
