/**
 * KEY-439 (AI Task 5, Phase 1 + Phase 2): Main-process validator, preview planner,
 * executor, and undo manager for AI Actions.
 *
 * Phase 1 mutations go through existing BagLib services (`StudyNotesService`,
 * `KnowledgeCardRepository`, `PersonalListsService`) with zero new DB fields.
 * Phase 2 PDF operations resolve paths from library records (`resolvePdfSource`),
 * validate page ranges in main, write NEW files next to the source, and undo
 * by deleting only the newly created output files.
 */
import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { markAiGenerated } from '../../../../shared/ai-principles';
import { isLocalAi } from '../../../../shared/ai-consent';
import { resolveLearningMode } from '../../../../shared/ai-learning-mode';
import { providerReady } from '../../../../shared/research-ai';
import { parseBookTarget, parseNoteTarget } from '../../../../shared/study-notes';
import type { AISettings } from '../../../../shared/types/ai';
import type { StudyNote } from '../../../../shared/study-notes';
import type { PersonalListItemKind } from '../../../../shared/personal-lists';
import {
  parsePageRanges,
  validateToolCallArguments,
  type AiActionConfirmResponse,
  type AiActionExecutedStep,
  type AiActionPlan,
  type AiActionPlanRequest,
  type AiActionPlanResponse,
  type AiActionPreviewStep,
  type AiActionUndoResponse,
  type ValidatedAiActionCall,
} from '../../../../shared/ai-actions';
import { translations } from '../../../../renderer/translations';
import type { ISettingsRepository } from '../../../database/repositories/settings.repository';
import { KnowledgeCardRepository } from '../../../database/repositories/knowledge-card.repository';
import { PersonalListsService } from '../../personal-lists';
import { resolvePdfSource, type PdfSource } from '../../pdf-editor/source';
import { StudyNotesService } from '../../study-notes';
import {
  createDefaultPdfActionsRunner,
  inspectPdfFile,
  mapOcrLanguage,
  uniqueOutputPaths,
  type PdfActionsRunner,
  type PdfInspectionSummary,
} from './pdf-actions';
import { callModelWithTools, type RawToolCall, type ToolCallingResult } from './tool-calling';

type ResolvedPdfPlan =
  | {
      tool: 'split_pdf';
      source: PdfSource;
      totalPages: number;
      groups?: number[][];
      pagesPerFile?: number;
      outputPaths: string[];
    }
  | {
      tool: 'merge_pdfs';
      sources: Array<{ source: PdfSource; totalPages: number }>;
      outputPaths: string[];
    }
  | {
      tool: 'extract_pdf_pages';
      source: PdfSource;
      pages: number[];
      outputPaths: string[];
    }
  | {
      tool: 'rotate_pdf_pages';
      source: PdfSource;
      totalPages: number;
      pages: number[];
      angle: 90 | 180 | 270;
      outputPaths: string[];
    }
  | {
      tool: 'ocr_pdf_page';
      source: PdfSource;
      page: number;
      ocrLanguage: 'ara' | 'eng' | 'ara+eng' | 'auto';
      outputPaths: string[];
    };

type PlannedCall =
  | { kind: 'phase1'; call: ValidatedAiActionCall }
  | { kind: 'pdf'; resolved: ResolvedPdfPlan };

interface StoredPlan {
  planId: string;
  calls: PlannedCall[];
  stepIds: string[];
  createdAt: number;
}

type UndoRecord =
  | { stepId: string; tool: 'create_note'; noteId: string }
  | { stepId: string; tool: 'append_to_note'; previous: StudyNote }
  | { stepId: string; tool: 'create_cards_from_selection'; cardIds: string[] }
  | {
      stepId: string;
      tool: 'add_to_personal_list';
      listId: string;
      itemKind: PersonalListItemKind;
      itemRef: string;
      existedBefore: boolean;
      previousLabel?: string;
    }
  | { stepId: string; tool: 'open_source'; openTarget: string }
  | {
      stepId: string;
      tool: 'split_pdf' | 'merge_pdfs' | 'extract_pdf_pages' | 'rotate_pdf_pages' | 'ocr_pdf_page';
      outputPaths: string[];
    };

interface StoredExecution {
  executionId: string;
  records: UndoRecord[];
  undone: boolean;
}

export interface AiActionsServiceDeps {
  db: Database.Database;
  settingsRepo: ISettingsRepository;
  getAiSettings: () => AISettings;
  completeWithTools?: (request: AiActionPlanRequest, settings: AISettings) => Promise<ToolCallingResult>;
  pdfRunner?: PdfActionsRunner;
  inspectPdf?: (pdfPath: string, checkTextPage?: number) => Promise<PdfInspectionSummary>;
}

const MAX_PLANS = 50;
const MAX_EXECUTIONS = 50;

function trimMap<K, V>(map: Map<K, V>, max: number): void {
  while (map.size > max) {
    const first = map.keys().next().value;
    if (first === undefined) break;
    map.delete(first);
  }
}

function attachAiGeneratedTag(db: Database.Database, knowledgeId: string): void {
  const existingTag = db.prepare('SELECT id FROM tag WHERE name = ?').get('ai-generated') as { id: string } | undefined;
  const tagId = existingTag?.id ?? randomUUID();
  if (!existingTag) {
    db.prepare("INSERT INTO tag (id, name, origin) VALUES (?, 'ai-generated', 'manual')").run(tagId);
  }
  db.prepare('INSERT OR IGNORE INTO knowledge_tag (knowledge_id, tag_id) VALUES (?, ?)').run(knowledgeId, tagId);
}

export class AiActionsService {
  private plans = new Map<string, StoredPlan>();
  private executions = new Map<string, StoredExecution>();

  constructor(private deps: AiActionsServiceDeps) {}

  private isLearningModeOff(aiSettings: AISettings, target?: string): boolean {
    let legacyMode: unknown;
    try {
      legacyMode = this.deps.settingsRepo.get<unknown>('ai.learningMode');
    } catch {
      legacyMode = undefined;
    }
    const module = target?.startsWith('quran:') ? 'quran' : target?.startsWith('sunnah:') ? 'sunnah' : target?.startsWith('book:') ? 'reader' : 'notes';
    return resolveLearningMode(aiSettings as AISettings & { learningMode?: unknown }, module, { legacyMode }) === 'off';
  }

  public async planFromInstruction(request: AiActionPlanRequest): Promise<AiActionPlanResponse> {
    const instruction = typeof request.instruction === 'string' ? request.instruction.trim() : '';
    if (!instruction || instruction.length > 4000) {
      return { ok: false, error: 'invalid-arguments', detail: 'invalid-instruction' };
    }
    const language: 'ar' | 'en' = request.language === 'ar' ? 'ar' : 'en';
    const settings = this.deps.getAiSettings();
    if (settings.enabled === false) return { ok: false, error: 'ai-disabled' };
    if (this.isLearningModeOff(settings, request.context?.activeTarget)) return { ok: false, error: 'learning-mode-off' };
    if (!providerReady(settings)) return { ok: false, error: 'not-configured' };
    if (!isLocalAi(settings) && !request.allowRemote) return { ok: false, error: 'consent-required' };

    const caller = this.deps.completeWithTools ?? ((req, s) => callModelWithTools(req, s));
    const result = await caller({ ...request, instruction, language }, settings);
    if (!result.ok) {
      return { ok: false, error: 'provider-error', detail: result.detail };
    }
    if (result.kind === 'unsupported') {
      return { ok: true, kind: 'unsupported', reason: result.reason };
    }
    if (result.kind === 'message') {
      return { ok: true, kind: 'message', text: result.text };
    }

    return this.buildPreviewPlan(result.calls, language);
  }

  private workTitle(workId: string | null, fallbackPath: string): string {
    if (workId) {
      const row = this.deps.db.prepare('SELECT title FROM work WHERE id = ?').get(workId) as { title?: string } | undefined;
      if (row?.title) return row.title;
    }
    return path.basename(fallbackPath);
  }

  private async resolveLibraryPdf(workId: string, sourceId?: string): Promise<PdfSource | null> {
    try {
      return await resolvePdfSource(this.deps.db, workId, sourceId);
    } catch {
      return null;
    }
  }

  public async buildPreviewPlan(rawCalls: RawToolCall[], language: 'ar' | 'en'): Promise<AiActionPlanResponse> {
    if (!Array.isArray(rawCalls) || rawCalls.length === 0 || rawCalls.length > 10) {
      return { ok: false, error: 'invalid-arguments', detail: 'empty-or-too-many-tool-calls' };
    }

    const t = translations[language];
    const notesService = new StudyNotesService(this.deps.settingsRepo, this.deps.db);
    const listsService = new PersonalListsService(this.deps.db);
    const inspectPdf = this.deps.inspectPdf ?? inspectPdfFile;
    const reservedOutputPaths = new Set<string>();
    const plannedCalls: PlannedCall[] = [];
    const steps: AiActionPreviewStep[] = [];
    const stepIds: string[] = [];

    for (const raw of rawCalls) {
      const check = validateToolCallArguments(raw.name, raw.arguments);
      if (!check.ok) {
        return { ok: false, error: 'invalid-arguments', detail: check.reason };
      }
      const call = check.call;
      const stepId = randomUUID();

      switch (call.tool) {
        case 'create_note': {
          if (call.args.workId) {
            const work = this.deps.db.prepare('SELECT id FROM work WHERE id = ?').get(call.args.workId);
            if (!work) return { ok: false, error: 'not-found', detail: `work:${call.args.workId}` };
          }
          steps.push({
            stepId,
            tool: 'create_note',
            summary: t.aiActionStepCreateNote.replace('{title}', call.args.title),
            details: {
              title: call.args.title,
              content: call.args.content,
              tags: call.args.tags,
            },
          });
          plannedCalls.push({ kind: 'phase1', call });
          break;
        }

        case 'append_to_note': {
          const existing = notesService.list(call.args.noteId)[0];
          if (!existing) {
            return { ok: false, error: 'not-found', detail: `note:${call.args.noteId}` };
          }
          steps.push({
            stepId,
            tool: 'append_to_note',
            summary: t.aiActionStepAppendNote.replace('{title}', existing.title || call.args.noteId),
            details: {
              noteId: existing.id,
              noteTitle: existing.title || existing.id,
              appendText: call.args.text,
            },
          });
          plannedCalls.push({ kind: 'phase1', call });
          break;
        }

        case 'create_cards_from_selection': {
          if (call.args.workId) {
            const work = this.deps.db.prepare('SELECT id FROM work WHERE id = ?').get(call.args.workId);
            if (!work) return { ok: false, error: 'not-found', detail: `work:${call.args.workId}` };
          }
          steps.push({
            stepId,
            tool: 'create_cards_from_selection',
            summary: t.aiActionStepCreateCards.replace('{count}', String(call.args.cards.length)),
            details: {
              cards: call.args.cards,
              sourceLabel: call.args.sourceLabel,
            },
          });
          plannedCalls.push({ kind: 'phase1', call });
          break;
        }

        case 'add_to_personal_list': {
          const list = listsService.all().find(item => item.id === call.args.listId);
          if (!list) {
            return { ok: false, error: 'not-found', detail: `list:${call.args.listId}` };
          }
          steps.push({
            stepId,
            tool: 'add_to_personal_list',
            summary: t.aiActionStepAddList
              .replace('{label}', call.args.label)
              .replace('{list}', list.name),
            details: {
              listId: list.id,
              listName: list.name,
              itemKind: call.args.itemKind,
              itemRef: call.args.itemRef,
              itemLabel: call.args.label,
            },
          });
          plannedCalls.push({ kind: 'phase1', call });
          break;
        }

        case 'open_source': {
          const target = call.args.target;
          let resolvedLabel = call.args.label || target;
          if (target.startsWith('book:')) {
            const parsed = parseBookTarget(target);
            const work = parsed ? (this.deps.db.prepare('SELECT id, title FROM work WHERE id = ?').get(parsed.id) as { id: string; title: string } | undefined) : undefined;
            if (!work) return { ok: false, error: 'not-found', detail: target };
            if (!call.args.label) {
              resolvedLabel = parsed?.page ? `${work.title} (${parsed.page})` : work.title;
            }
          } else if (target.startsWith('note:')) {
            const parsed = parseNoteTarget(target);
            const note = parsed ? notesService.list(parsed.id)[0] : undefined;
            if (!note) return { ok: false, error: 'not-found', detail: target };
            if (!call.args.label) resolvedLabel = note.title || target;
          }
          steps.push({
            stepId,
            tool: 'open_source',
            summary: t.aiActionStepOpenSource.replace('{label}', resolvedLabel),
            details: {
              target,
              sourceLabel: resolvedLabel,
            },
          });
          plannedCalls.push({ kind: 'phase1', call });
          break;
        }

        case 'split_pdf': {
          const source = await this.resolveLibraryPdf(call.args.workId, call.args.sourceId);
          if (!source) return { ok: false, error: 'not-found', detail: `work:${call.args.workId}` };
          const info = await inspectPdf(source.path);
          let groups: number[][] | undefined;
          let expectedOutputs: number;
          if (call.args.ranges) {
            const parsed = parsePageRanges(call.args.ranges, info.totalPages);
            if (!parsed.ok) return { ok: false, error: 'invalid-arguments', detail: parsed.reason };
            groups = parsed.groups;
            expectedOutputs = groups.length;
          } else {
            const perFile = call.args.pagesPerFile ?? 1;
            expectedOutputs = Math.ceil(info.totalPages / perFile);
          }
          if (expectedOutputs > 200) {
            return { ok: false, error: 'invalid-arguments', detail: 'too-many-split-outputs' };
          }
          const outputPaths = uniqueOutputPaths(source.path, expectedOutputs, 'split', '.pdf', reservedOutputPaths);
          const label = this.workTitle(source.workId, source.path);
          steps.push({
            stepId,
            tool: 'split_pdf',
            summary: t.aiActionStepSplitPdf
              .replace('{label}', label)
              .replace('{count}', String(outputPaths.length)),
            details: {
              sourceLabel: label,
              ...(call.args.ranges ? { pageRange: call.args.ranges } : {}),
              outputPaths,
            },
          });
          plannedCalls.push({
            kind: 'pdf',
            resolved: {
              tool: 'split_pdf',
              source,
              totalPages: info.totalPages,
              groups,
              pagesPerFile: call.args.pagesPerFile,
              outputPaths,
            },
          });
          break;
        }

        case 'merge_pdfs': {
          const resolvedSources: Array<{ source: PdfSource; totalPages: number }> = [];
          const labels: string[] = [];
          for (const item of call.args.sources) {
            const source = await this.resolveLibraryPdf(item.workId, item.sourceId);
            if (!source) return { ok: false, error: 'not-found', detail: `work:${item.workId}` };
            const info = await inspectPdf(source.path);
            resolvedSources.push({ source, totalPages: info.totalPages });
            labels.push(this.workTitle(source.workId, source.path));
          }
          const outputPaths = uniqueOutputPaths(resolvedSources[0].source.path, 1, 'merged', '.pdf', reservedOutputPaths);
          steps.push({
            stepId,
            tool: 'merge_pdfs',
            summary: t.aiActionStepMergePdfs.replace('{count}', String(resolvedSources.length)),
            details: {
              sourceLabel: labels.join(' + '),
              outputPaths,
            },
          });
          plannedCalls.push({
            kind: 'pdf',
            resolved: {
              tool: 'merge_pdfs',
              sources: resolvedSources,
              outputPaths,
            },
          });
          break;
        }

        case 'extract_pdf_pages': {
          const source = await this.resolveLibraryPdf(call.args.workId, call.args.sourceId);
          if (!source) return { ok: false, error: 'not-found', detail: `work:${call.args.workId}` };
          const info = await inspectPdf(source.path);
          const parsed = parsePageRanges(call.args.pages, info.totalPages);
          if (!parsed.ok) return { ok: false, error: 'invalid-arguments', detail: parsed.reason };
          const outputPaths = uniqueOutputPaths(source.path, 1, 'extracted', '.pdf', reservedOutputPaths);
          const label = this.workTitle(source.workId, source.path);
          steps.push({
            stepId,
            tool: 'extract_pdf_pages',
            summary: t.aiActionStepExtractPdf
              .replace('{pages}', call.args.pages)
              .replace('{label}', label),
            details: {
              sourceLabel: label,
              pageRange: call.args.pages,
              outputPaths,
            },
          });
          plannedCalls.push({
            kind: 'pdf',
            resolved: {
              tool: 'extract_pdf_pages',
              source,
              pages: parsed.pages,
              outputPaths,
            },
          });
          break;
        }

        case 'rotate_pdf_pages': {
          const source = await this.resolveLibraryPdf(call.args.workId, call.args.sourceId);
          if (!source) return { ok: false, error: 'not-found', detail: `work:${call.args.workId}` };
          const info = await inspectPdf(source.path);
          let pages: number[];
          if (call.args.pages) {
            const parsed = parsePageRanges(call.args.pages, info.totalPages);
            if (!parsed.ok) return { ok: false, error: 'invalid-arguments', detail: parsed.reason };
            pages = parsed.pages;
          } else {
            pages = Array.from({ length: info.totalPages }, (_, idx) => idx + 1);
          }
          const outputPaths = uniqueOutputPaths(source.path, 1, `rotated-${call.args.angle}`, '.pdf', reservedOutputPaths);
          const label = this.workTitle(source.workId, source.path);
          steps.push({
            stepId,
            tool: 'rotate_pdf_pages',
            summary: t.aiActionStepRotatePdf
              .replace('{angle}', String(call.args.angle))
              .replace('{label}', label),
            details: {
              sourceLabel: label,
              angle: call.args.angle,
              ...(call.args.pages ? { pageRange: call.args.pages } : {}),
              outputPaths,
            },
          });
          plannedCalls.push({
            kind: 'pdf',
            resolved: {
              tool: 'rotate_pdf_pages',
              source,
              totalPages: info.totalPages,
              pages,
              angle: call.args.angle,
              outputPaths,
            },
          });
          break;
        }

        case 'ocr_pdf_page': {
          const source = await this.resolveLibraryPdf(call.args.workId, call.args.sourceId);
          if (!source) return { ok: false, error: 'not-found', detail: `work:${call.args.workId}` };
          const info = await inspectPdf(source.path, call.args.page);
          if (call.args.page < 1 || call.args.page > info.totalPages) {
            return { ok: false, error: 'invalid-arguments', detail: 'page-out-of-range' };
          }
          if (info.pageHasText && !call.args.force) {
            return { ok: false, error: 'invalid-arguments', detail: 'page-already-has-text-layer' };
          }
          const ocrLanguage = call.args.language ?? 'auto';
          const outputPaths = uniqueOutputPaths(source.path, 1, `page-${call.args.page}-ocr`, '.txt', reservedOutputPaths);
          const label = this.workTitle(source.workId, source.path);
          steps.push({
            stepId,
            tool: 'ocr_pdf_page',
            summary: t.aiActionStepOcrPdfPage
              .replace('{page}', String(call.args.page))
              .replace('{label}', label),
            details: {
              sourceLabel: label,
              page: call.args.page,
              ocrLanguage,
              outputPaths,
            },
          });
          plannedCalls.push({
            kind: 'pdf',
            resolved: {
              tool: 'ocr_pdf_page',
              source,
              page: call.args.page,
              ocrLanguage,
              outputPaths,
            },
          });
          break;
        }
      }

      stepIds.push(stepId);
    }

    const planId = randomUUID();
    this.plans.set(planId, { planId, calls: plannedCalls, stepIds, createdAt: Date.now() });
    trimMap(this.plans, MAX_PLANS);

    const plan: AiActionPlan = { planId, steps };
    return { ok: true, kind: 'plan', plan };
  }

  public async confirmPlan(planId: string, language: 'ar' | 'en'): Promise<AiActionConfirmResponse> {
    const stored = this.plans.get(planId);
    if (!stored) return { ok: false, error: 'plan-not-found' };
    this.plans.delete(planId);

    const lang: 'ar' | 'en' = language === 'ar' ? 'ar' : 'en';
    const marker = translations[lang].aiGeneratedMarker;
    const notesService = new StudyNotesService(this.deps.settingsRepo, this.deps.db);
    const cardRepo = new KnowledgeCardRepository(this.deps.db);
    const listsService = new PersonalListsService(this.deps.db);
    const pdfRunner = this.deps.pdfRunner ?? createDefaultPdfActionsRunner();

    const records: UndoRecord[] = [];
    const executed: AiActionExecutedStep[] = [];
    const openTargets: string[] = [];

    try {
      for (let i = 0; i < stored.calls.length; i++) {
        const planned = stored.calls[i];
        const stepId = stored.stepIds[i];

        if (planned.kind === 'phase1') {
          const call = planned.call;
          switch (call.tool) {
            case 'create_note': {
              const note = notesService.save({
                title: call.args.title,
                content: markAiGenerated(call.args.content, marker),
                aliases: [],
                tags: [...new Set([...(call.args.tags ?? []), 'ai-generated'])],
                workId: call.args.workId,
              });
              records.push({ stepId, tool: 'create_note', noteId: note.id });
              executed.push({ stepId, tool: 'create_note', createdNoteId: note.id });
              break;
            }

            case 'append_to_note': {
              const existing = notesService.list(call.args.noteId)[0];
              if (!existing) throw new Error(`note-not-found:${call.args.noteId}`);
              const updatedContent = `${existing.content.trimEnd()}\n\n${markAiGenerated(call.args.text, marker)}`;
              notesService.save({
                id: existing.id,
                title: existing.title,
                content: updatedContent,
                aliases: existing.aliases,
                tags: [...new Set([...existing.tags, 'ai-generated'])],
                workId: existing.workId,
                expectedRevision: existing.revision,
              });
              records.push({ stepId, tool: 'append_to_note', previous: existing });
              executed.push({ stepId, tool: 'append_to_note', updatedNoteId: existing.id });
              break;
            }

            case 'create_cards_from_selection': {
              const cardIds: string[] = [];
              for (const c of call.args.cards) {
                const saved = cardRepo.save({
                  front: c.front,
                  back: markAiGenerated(c.back, marker),
                  sourceKind: call.args.sourceKind,
                  sourceRef: call.args.sourceRef,
                  sourceLabel: call.args.sourceLabel,
                  workId: call.args.workId,
                  language: call.args.language ?? lang,
                });
                attachAiGeneratedTag(this.deps.db, saved.id);
                cardIds.push(saved.id);
              }
              records.push({ stepId, tool: 'create_cards_from_selection', cardIds });
              executed.push({ stepId, tool: 'create_cards_from_selection', createdCardIds: cardIds });
              break;
            }

            case 'add_to_personal_list': {
              const existingRow = this.deps.db
                .prepare('SELECT label FROM personal_list_item WHERE list_id = ? AND item_kind = ? AND item_ref = ?')
                .get(call.args.listId, call.args.itemKind, call.args.itemRef) as { label: string } | undefined;
              listsService.add(call.args.listId, {
                itemKind: call.args.itemKind,
                itemRef: call.args.itemRef,
                label: call.args.label,
              });
              records.push({
                stepId,
                tool: 'add_to_personal_list',
                listId: call.args.listId,
                itemKind: call.args.itemKind,
                itemRef: call.args.itemRef,
                existedBefore: Boolean(existingRow),
                previousLabel: existingRow?.label,
              });
              executed.push({
                stepId,
                tool: 'add_to_personal_list',
                listId: call.args.listId,
                itemKind: call.args.itemKind,
                itemRef: call.args.itemRef,
              });
              break;
            }

            case 'open_source': {
              records.push({ stepId, tool: 'open_source', openTarget: call.args.target });
              executed.push({ stepId, tool: 'open_source', openTarget: call.args.target });
              openTargets.push(call.args.target);
              break;
            }
          }
          continue;
        }

        const pdf = planned.resolved;
        let createdPaths: string[] = [];
        switch (pdf.tool) {
          case 'split_pdf':
            createdPaths = await pdfRunner.splitPdf({
              sourcePath: pdf.source.path,
              expectedHash: pdf.source.sha256,
              totalPages: pdf.totalPages,
              groups: pdf.groups,
              pagesPerFile: pdf.pagesPerFile,
              outputPaths: pdf.outputPaths,
              language: lang,
            });
            break;
          case 'merge_pdfs':
            createdPaths = await pdfRunner.mergePdfs({
              sources: pdf.sources.map(s => ({
                path: s.source.path,
                sha256: s.source.sha256,
                totalPages: s.totalPages,
              })),
              outputPath: pdf.outputPaths[0],
              language: lang,
            });
            break;
          case 'extract_pdf_pages':
            createdPaths = await pdfRunner.extractPdfPages({
              sourcePath: pdf.source.path,
              expectedHash: pdf.source.sha256,
              pages: pdf.pages,
              outputPath: pdf.outputPaths[0],
              language: lang,
            });
            break;
          case 'rotate_pdf_pages':
            createdPaths = await pdfRunner.rotatePdfPages({
              sourcePath: pdf.source.path,
              expectedHash: pdf.source.sha256,
              totalPages: pdf.totalPages,
              pages: pdf.pages,
              angle: pdf.angle,
              outputPath: pdf.outputPaths[0],
              language: lang,
            });
            break;
          case 'ocr_pdf_page':
            createdPaths = await pdfRunner.ocrPdfPage({
              sourcePath: pdf.source.path,
              page: pdf.page,
              ocrLanguage: mapOcrLanguage(pdf.ocrLanguage),
              outputPath: pdf.outputPaths[0],
            });
            break;
        }
        records.push({ stepId, tool: pdf.tool, outputPaths: createdPaths });
        executed.push({ stepId, tool: pdf.tool, outputPaths: createdPaths });
      }
    } catch (err: unknown) {
      // Rollback any already-completed steps in reverse order
      await this.revertRecords(records);
      return {
        ok: false,
        error: 'execution-failed',
        detail: err instanceof Error ? err.message : String(err),
      };
    }

    const executionId = randomUUID();
    this.executions.set(executionId, { executionId, records, undone: false });
    trimMap(this.executions, MAX_EXECUTIONS);

    return {
      ok: true,
      executionId,
      executed,
      openTargets,
      canUndo: records.length > 0,
    };
  }

  public async undoExecution(executionId: string): Promise<AiActionUndoResponse> {
    const stored = this.executions.get(executionId);
    if (!stored) return { ok: false, error: 'undo-not-found' };
    if (stored.undone) return { ok: false, error: 'already-undone' };

    const undoneSteps = await this.revertRecords(stored.records);
    stored.undone = true;
    const revertOpenSource = stored.records.some(record => record.tool === 'open_source');

    return {
      ok: true,
      executionId,
      undoneSteps,
      revertOpenSource,
    };
  }

  private async revertRecords(records: UndoRecord[]): Promise<AiActionExecutedStep[]> {
    const notesService = new StudyNotesService(this.deps.settingsRepo, this.deps.db);
    const cardRepo = new KnowledgeCardRepository(this.deps.db);
    const listsService = new PersonalListsService(this.deps.db);
    const undoneSteps: AiActionExecutedStep[] = [];

    for (const record of [...records].reverse()) {
      switch (record.tool) {
        case 'create_note':
          notesService.remove(record.noteId);
          undoneSteps.push({ stepId: record.stepId, tool: 'create_note', createdNoteId: record.noteId });
          break;
        case 'append_to_note':
          notesService.save({
            id: record.previous.id,
            title: record.previous.title,
            content: record.previous.content,
            aliases: record.previous.aliases,
            tags: record.previous.tags,
            workId: record.previous.workId,
          });
          undoneSteps.push({ stepId: record.stepId, tool: 'append_to_note', updatedNoteId: record.previous.id });
          break;
        case 'create_cards_from_selection':
          for (const cardId of record.cardIds) {
            cardRepo.remove(cardId);
          }
          undoneSteps.push({ stepId: record.stepId, tool: 'create_cards_from_selection', createdCardIds: record.cardIds });
          break;
        case 'add_to_personal_list':
          if (!record.existedBefore) {
            listsService.removeItem(record.listId, record.itemKind, record.itemRef);
          } else if (record.previousLabel !== undefined) {
            listsService.add(record.listId, {
              itemKind: record.itemKind,
              itemRef: record.itemRef,
              label: record.previousLabel,
            });
          }
          undoneSteps.push({
            stepId: record.stepId,
            tool: 'add_to_personal_list',
            listId: record.listId,
            itemKind: record.itemKind,
            itemRef: record.itemRef,
          });
          break;
        case 'open_source':
          undoneSteps.push({ stepId: record.stepId, tool: 'open_source', openTarget: record.openTarget });
          break;
        case 'split_pdf':
        case 'merge_pdfs':
        case 'extract_pdf_pages':
        case 'rotate_pdf_pages':
        case 'ocr_pdf_page':
          for (const outPath of record.outputPaths) {
            await unlink(outPath).catch(() => {});
          }
          undoneSteps.push({ stepId: record.stepId, tool: record.tool, outputPaths: record.outputPaths });
          break;
      }
    }

    return undoneSteps;
  }
}
