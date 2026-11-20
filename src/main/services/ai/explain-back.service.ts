/**
 * KEY-437 (AI Task 3, epic KEY-434): "Explain it back" service.
 * Compares the learner's own explanation against the source text and any library tafsir/sharh,
 * returning what was right, what was missing/wrong with quoted sources, and one follow-up question.
 */
import type Database from 'better-sqlite3';
import { errorMessage } from '../../../shared/errors';
import { providerErrorCode, providerErrorDetail } from '../../../shared/ai-errors';
import { isLocalAi } from '../../../shared/ai-consent';
import { providerReady } from '../../../shared/research-ai';
import { parseQuranTarget, studyLinks } from '../../../shared/study-notes';
import type { AISettings } from '../../../shared/types/ai';
import type { ISettingsRepository } from '../../database/repositories/settings.repository';
import { StudyNotesService } from '../study-notes';
import type { ChatCompletionRequest } from './ai-provider.service';
import {
  EXPLAIN_BACK_JSON_SCHEMA,
  buildExplainBackPrompt,
  formatExplainBackNote,
  parseExplainBackResponse,
  validateExplainBackRequest,
  type ExplainBackNoteLabels,
  type ExplainBackRequest,
  type ExplainBackResponse,
  type ExplainBackSaveNoteRequest,
  type ExplainBackSourceItem,
} from '../../../shared/ai-explain-back';

export interface ExplainBackServiceDeps {
  db: Database.Database;
  settingsRepo: ISettingsRepository;
  getAiSettings: () => AISettings;
  complete: (request: ChatCompletionRequest, settings: AISettings) => Promise<string>;
  readBookSources?: (target: string) => Promise<ExplainBackSourceItem[]>;
  readAyahWithTafsir?: (surah: number, ayah: number, profile: 'hafs' | 'warsh') => Promise<ExplainBackSourceItem[]>;
  readHadithWithSharh?: (collection: string, chapter: number, id: string) => Promise<ExplainBackSourceItem[]>;
}

const MAX_SOURCE_CHARS = 60_000;

export class ExplainBackCheckService {
  constructor(private deps: ExplainBackServiceDeps) {}

  private isLearningModeOff(aiSettings: AISettings): boolean {
    const inlineMode = (aiSettings as AISettings & { learningMode?: unknown }).learningMode;
    if (inlineMode === 'off') return true;
    try {
      const storedMode = this.deps.settingsRepo.get<unknown>('ai.learningMode');
      return storedMode === 'off';
    } catch {
      return false;
    }
  }

  private async resolveSources(request: ExplainBackRequest): Promise<ExplainBackSourceItem[]> {
    const sources: ExplainBackSourceItem[] = [];
    const add = (item: Omit<ExplainBackSourceItem, 'id'>) => {
      if (!item.text.trim()) return;
      if (sources.some(existing => existing.title === item.title && existing.text === item.text)) return;
      sources.push({ id: `S${sources.length + 1}`, ...item });
    };

    if (request.kind === 'passage') {
      if (request.sourceText?.trim()) {
        add({ kind: 'source', title: request.label, ref: request.target, text: request.sourceText.trim() });
      } else if (this.deps.readBookSources) {
        for (const item of await this.deps.readBookSources(request.target)) {
          add({ kind: item.kind, title: item.title, ref: item.ref, text: item.text });
        }
      }
      return sources;
    }

    if (request.kind === 'ayah') {
      const parsed = parseQuranTarget(request.target);
      if (parsed && this.deps.readAyahWithTafsir) {
        for (const item of await this.deps.readAyahWithTafsir(parsed.surah, parsed.from, parsed.profile)) {
          add({ kind: item.kind, title: item.title, ref: item.ref, text: item.text });
        }
      }
      if (!sources.length && request.sourceText?.trim()) {
        add({ kind: 'source', title: request.label, ref: request.target, text: request.sourceText.trim() });
      }
      return sources;
    }

    if (request.kind === 'hadith') {
      const match = /^sunnah:([^:]+):(\d+):(.+)$/u.exec(request.target);
      if (match && this.deps.readHadithWithSharh) {
        for (const item of await this.deps.readHadithWithSharh(match[1], Number(match[2]), match[3])) {
          add({ kind: item.kind, title: item.title, ref: item.ref, text: item.text });
        }
      }
      if (!sources.length && request.sourceText?.trim()) {
        add({ kind: 'source', title: request.label, ref: request.target, text: request.sourceText.trim() });
      }
      return sources;
    }

    // request.kind === 'note'
    const noteId = request.target.startsWith('note:') ? request.target.slice(5) : request.target;
    const note = new StudyNotesService(this.deps.settingsRepo, this.deps.db).list(noteId)[0];
    const noteText = note?.content?.trim() || request.sourceText?.trim() || '';
    if (noteText) {
      add({ kind: 'note', title: note?.title || request.label, ref: request.target, text: noteText });
      // If the note links to Quran or Sunnah targets, include those library sources & tafsir/sharh for richer comparison.
      for (const link of studyLinks(noteText).slice(0, 2)) {
        const quran = parseQuranTarget(link.target);
        if (quran && this.deps.readAyahWithTafsir) {
          for (const item of await this.deps.readAyahWithTafsir(quran.surah, quran.from, quran.profile).catch(() => [])) {
            add({ kind: item.kind, title: item.title, ref: item.ref, text: item.text });
          }
          continue;
        }
        const sunnah = /^sunnah:([^:]+):(\d+):(.+)$/u.exec(link.target);
        if (sunnah && this.deps.readHadithWithSharh) {
          for (const item of await this.deps.readHadithWithSharh(sunnah[1], Number(sunnah[2]), sunnah[3]).catch(() => [])) {
            add({ kind: item.kind, title: item.title, ref: item.ref, text: item.text });
          }
        }
      }
    }
    return sources;
  }

  async evaluate(input: unknown): Promise<ExplainBackResponse> {
    let request: ExplainBackRequest;
    try {
      request = validateExplainBackRequest(input);
    } catch {
      return { ok: false, error: 'invalid-request' };
    }

    const aiSettings = this.deps.getAiSettings();
    if (aiSettings.enabled === false) return { ok: false, error: 'ai-disabled' };
    if (this.isLearningModeOff(aiSettings)) return { ok: false, error: 'learning-mode-off' };
    if (!providerReady(aiSettings)) return { ok: false, error: 'not-configured' };
    if (!isLocalAi(aiSettings) && !request.allowRemote) return { ok: false, error: 'permission-denied' };

    let sources: ExplainBackSourceItem[];
    try {
      sources = await this.resolveSources(request);
    } catch {
      return { ok: false, error: 'missing-source' };
    }

    if (!sources.length) return { ok: false, error: 'missing-source' };
    const totalLength = sources.reduce((sum, item) => sum + item.text.length, 0);
    if (totalLength > MAX_SOURCE_CHARS) return { ok: false, error: 'passage-too-long' };

    const prompt = buildExplainBackPrompt({
      kind: request.kind,
      label: request.label,
      explanation: request.explanation,
      sources,
      language: request.language,
    });

    try {
      const raw = await this.deps.complete(
        {
          systemPrompt: prompt.systemPrompt,
          userPrompt: prompt.userPrompt,
          temperature: 0.2,
          json: true,
          schema: EXPLAIN_BACK_JSON_SCHEMA,
          preventRedirect: !request.allowRemote,
        },
        aiSettings,
      );
      const feedback = parseExplainBackResponse(raw, sources, aiSettings.provider || 'ollama');
      return { ok: true, data: feedback };
    } catch (error) {
      const message = errorMessage(error);
      if (message === 'invalid-output') {
        return { ok: false, error: 'invalid-output' };
      }
      return {
        ok: false,
        error: providerErrorCode(message),
        detail: providerErrorDetail(message),
      };
    }
  }

  saveNote(input: ExplainBackSaveNoteRequest, labels: ExplainBackNoteLabels) {
    if (
      !input ||
      typeof input.target !== 'string' ||
      !input.target.trim() ||
      typeof input.label !== 'string' ||
      typeof input.explanation !== 'string' ||
      !input.explanation.trim() ||
      !input.feedback
    ) {
      throw new Error('invalid-request');
    }
    const { title, content } = formatExplainBackNote({
      target: input.target.trim(),
      label: input.label.trim() || input.target.trim(),
      explanation: input.explanation,
      feedback: input.feedback,
      labels,
    });
    const bookMatch = /^book:([^@#]+)/u.exec(input.target);
    const workId = bookMatch ? bookMatch[1] : undefined;
    return new StudyNotesService(this.deps.settingsRepo, this.deps.db).save({
      title,
      content,
      aliases: [],
      tags: ['explain-back'],
      workId,
    });
  }
}
