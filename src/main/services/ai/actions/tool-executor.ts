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
import type { SunnahCollectionId } from '../../../../shared/types/sunnah';
import { matchesSearchQuery, normalizeSearchString } from '../../../../shared/utils/text-normalizer';
import {
  normalizeNaturalQuranTarget,
  parseBookPageRef,
  parseNaturalHadithRef,
  parsePageRanges,
  validateToolCallArguments,
  type AiActionBookCandidate,
  type AiActionConfirmResponse,
  type AiActionExecutedStep,
  type AiActionPlan,
  type AiActionPlanRequest,
  type AiActionPlanResponse,
  type AiActionPreviewStep,
  type AiActionUndoResponse,
  type BookLookupRef,
  type ExtractPdfPagesArgs,
  type OcrPdfPageArgs,
  type RotatePdfPagesArgs,
  type SplitPdfArgs,
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

type PdfCandidateEntry = AiActionBookCandidate & { source: PdfSource };

type PendingPdfCall =
  | { tool: 'split_pdf'; args: SplitPdfArgs }
  | { tool: 'extract_pdf_pages'; args: ExtractPdfPagesArgs }
  | { tool: 'rotate_pdf_pages'; args: RotatePdfPagesArgs }
  | { tool: 'ocr_pdf_page'; args: OcrPdfPageArgs };

type MergeSlotPlan =
  | { kind: 'resolved'; source: PdfSource; totalPages: number }
  | { kind: 'pending'; candidates: PdfCandidateEntry[] };

type PlannedCall =
  | { kind: 'phase1'; call: ValidatedAiActionCall }
  | { kind: 'pdf'; resolved: ResolvedPdfPlan }
  | { kind: 'pdf-pending'; call: PendingPdfCall; candidates: PdfCandidateEntry[] }
  | { kind: 'merge-pending'; slots: MergeSlotPlan[] }
  | { kind: 'open-pending'; page?: number; label?: string; candidates: AiActionBookCandidate[] };

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
  resolveSunnahHadith?: (collection: SunnahCollectionId, hadithNumber: string) => Promise<{ target: string; label: string } | null>;
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

  private searchLibraryWorks(query: string, author?: string): Array<{ id: string; title: string; authors?: string }> {
    const rows = this.deps.db
      .prepare(
        `SELECT w.id, w.title,
          (SELECT GROUP_CONCAT(a.name, '، ') FROM work_author wa JOIN author a ON a.id = wa.author_id WHERE wa.work_id = w.id) AS authors
         FROM work w
         WHERE w.deleted_at IS NULL`
      )
      .all() as Array<{ id: string; title: string; authors: string | null }>;

    const matched = rows.filter(row => {
      if (author && !matchesSearchQuery(row.authors ?? '', author)) return false;
      if (query && !matchesSearchQuery(`${row.title} ${row.authors ?? ''}`, query)) return false;
      return true;
    });

    if (query && matched.length > 1) {
      const normQuery = normalizeSearchString(query);
      const exactTitleMatches = matched.filter(row => normalizeSearchString(row.title) === normQuery);
      if (exactTitleMatches.length === 1) {
        return exactTitleMatches.map(r => ({ id: r.id, title: r.title, ...(r.authors ? { authors: r.authors } : {}) }));
      }
    }

    return matched.map(r => ({ id: r.id, title: r.title, ...(r.authors ? { authors: r.authors } : {}) }));
  }

  private resolveWorkCandidate(
    ref: Pick<BookLookupRef, 'workId' | 'bookTitle' | 'author'>
  ):
    | { kind: 'one'; work: { id: string; title: string; authors?: string } }
    | { kind: 'multiple'; candidates: AiActionBookCandidate[] }
    | { kind: 'not-found'; detail: string } {
    if (ref.workId) {
      const row = this.deps.db
        .prepare(
          `SELECT w.id, w.title,
            (SELECT GROUP_CONCAT(a.name, '، ') FROM work_author wa JOIN author a ON a.id = wa.author_id WHERE wa.work_id = w.id) AS authors
           FROM work w WHERE w.id = ? AND w.deleted_at IS NULL`
        )
        .get(ref.workId) as { id: string; title: string; authors: string | null } | undefined;
      if (!row) {
        return { kind: 'not-found', detail: `book:${ref.workId}` };
      }
      return { kind: 'one', work: { id: row.id, title: row.title, ...(row.authors ? { authors: row.authors } : {}) } };
    }

    const query = ref.bookTitle ?? '';
    const matches = this.searchLibraryWorks(query, ref.author);
    if (matches.length === 0) {
      return { kind: 'not-found', detail: `book:${query || ref.author || ''}` };
    }
    if (matches.length === 1) {
      return { kind: 'one', work: matches[0] };
    }
    return {
      kind: 'multiple',
      candidates: matches.slice(0, 20).map(m => ({
        workId: m.id,
        title: m.title,
        ...(m.authors ? { author: m.authors } : {}),
      })),
    };
  }

  private async resolvePdfCandidates(
    ref: BookLookupRef
  ): Promise<
    | { kind: 'one'; source: PdfSource; title: string }
    | { kind: 'multiple'; candidates: PdfCandidateEntry[] }
    | { kind: 'not-found'; detail: string }
  > {
    let works: Array<{ id: string; title: string; authors?: string }>;
    const labelForError = ref.bookTitle || ref.author || ref.workId || '';

    if (ref.workId) {
      const row = this.deps.db
        .prepare(
          `SELECT w.id, w.title,
            (SELECT GROUP_CONCAT(a.name, '، ') FROM work_author wa JOIN author a ON a.id = wa.author_id WHERE wa.work_id = w.id) AS authors
           FROM work w WHERE w.id = ? AND w.deleted_at IS NULL`
        )
        .get(ref.workId) as { id: string; title: string; authors: string | null } | undefined;
      if (!row) {
        return { kind: 'not-found', detail: `book:${ref.workId}` };
      }
      works = [{ id: row.id, title: row.title, ...(row.authors ? { authors: row.authors } : {}) }];
    } else {
      works = this.searchLibraryWorks(ref.bookTitle ?? '', ref.author);
      if (works.length === 0) {
        return { kind: 'not-found', detail: `book:${labelForError}` };
      }
    }

    const candidates: PdfCandidateEntry[] = [];
    for (const work of works.slice(0, 20)) {
      const rows = this.deps.db
        .prepare(
          `SELECT s.id AS sourceId
           FROM edition e
           JOIN source s ON s.edition_id = e.id
           JOIN file_source_detail f ON f.source_id = s.id
           WHERE e.work_id = ? AND upper(f.file_format) = 'PDF' ${ref.sourceId ? 'AND s.id = ?' : ''}`
        )
        .all(...(ref.sourceId ? [work.id, ref.sourceId] : [work.id])) as Array<{ sourceId: string }>;

      for (const row of rows) {
        const source = await this.resolveLibraryPdf(work.id, row.sourceId);
        if (!source) continue;
        candidates.push({
          workId: work.id,
          sourceId: source.sourceId ?? row.sourceId,
          title: work.title,
          ...(work.authors ? { author: work.authors } : {}),
          subtitle: path.basename(source.path),
          source,
        });
      }
    }

    if (candidates.length === 0) {
      return { kind: 'not-found', detail: `pdf:${works.length === 1 ? works[0].title : labelForError}` };
    }
    if (candidates.length === 1) {
      return { kind: 'one', source: candidates[0].source, title: candidates[0].title };
    }
    return { kind: 'multiple', candidates };
  }

  private async resolveSinglePdfPlan(
    call: PendingPdfCall,
    source: PdfSource,
    inspectPdf: (pdfPath: string, checkTextPage?: number) => Promise<PdfInspectionSummary>,
    reservedOutputPaths: Set<string>
  ): Promise<{ ok: true; resolved: ResolvedPdfPlan } | { ok: false; error: 'invalid-arguments'; detail: string }> {
    switch (call.tool) {
      case 'split_pdf': {
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
        return {
          ok: true,
          resolved: {
            tool: 'split_pdf',
            source,
            totalPages: info.totalPages,
            groups,
            pagesPerFile: call.args.pagesPerFile,
            outputPaths,
          },
        };
      }
      case 'extract_pdf_pages': {
        const info = await inspectPdf(source.path);
        const parsed = parsePageRanges(call.args.pages, info.totalPages);
        if (!parsed.ok) return { ok: false, error: 'invalid-arguments', detail: parsed.reason };
        const outputPaths = uniqueOutputPaths(source.path, 1, 'extracted', '.pdf', reservedOutputPaths);
        return {
          ok: true,
          resolved: {
            tool: 'extract_pdf_pages',
            source,
            pages: parsed.pages,
            outputPaths,
          },
        };
      }
      case 'rotate_pdf_pages': {
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
        return {
          ok: true,
          resolved: {
            tool: 'rotate_pdf_pages',
            source,
            totalPages: info.totalPages,
            pages,
            angle: call.args.angle,
            outputPaths,
          },
        };
      }
      case 'ocr_pdf_page': {
        const info = await inspectPdf(source.path, call.args.page);
        if (call.args.page < 1 || call.args.page > info.totalPages) {
          return { ok: false, error: 'invalid-arguments', detail: 'page-out-of-range' };
        }
        if (info.pageHasText && !call.args.force) {
          return { ok: false, error: 'invalid-arguments', detail: 'page-already-has-text-layer' };
        }
        const ocrLanguage = call.args.language ?? 'auto';
        const outputPaths = uniqueOutputPaths(source.path, 1, `page-${call.args.page}-ocr`, '.txt', reservedOutputPaths);
        return {
          ok: true,
          resolved: {
            tool: 'ocr_pdf_page',
            source,
            page: call.args.page,
            ocrLanguage,
            outputPaths,
          },
        };
      }
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
          let resolvedWorkId = call.args.workId;
          if (resolvedWorkId || call.args.bookTitle) {
            const res = this.resolveWorkCandidate({ workId: resolvedWorkId, bookTitle: call.args.bookTitle });
            if (res.kind === 'not-found') return { ok: false, error: 'not-found', detail: res.detail };
            if (res.kind === 'one') resolvedWorkId = res.work.id;
            // If multiple books match for an optional note workId, leave workId unset rather than guessing
            else resolvedWorkId = undefined;
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
          plannedCalls.push({
            kind: 'phase1',
            call: { tool: 'create_note', args: { ...call.args, ...(resolvedWorkId ? { workId: resolvedWorkId } : { workId: undefined }) } },
          });
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
          let resolvedWorkId = call.args.workId;
          if (resolvedWorkId || call.args.bookTitle) {
            const res = this.resolveWorkCandidate({ workId: resolvedWorkId, bookTitle: call.args.bookTitle });
            if (res.kind === 'not-found') return { ok: false, error: 'not-found', detail: res.detail };
            if (res.kind === 'one') resolvedWorkId = res.work.id;
            else resolvedWorkId = undefined;
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
          plannedCalls.push({
            kind: 'phase1',
            call: { tool: 'create_cards_from_selection', args: { ...call.args, ...(resolvedWorkId ? { workId: resolvedWorkId } : { workId: undefined }) } },
          });
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
          const rawTarget = call.args.target;
          let target = rawTarget;
          let resolvedLabel = call.args.label || rawTarget || call.args.bookTitle || '';

          if (target.startsWith('book:')) {
            const parsed = parseBookTarget(target);
            const work = parsed
              ? (this.deps.db.prepare('SELECT id, title FROM work WHERE id = ? AND deleted_at IS NULL').get(parsed.id) as { id: string; title: string } | undefined)
              : undefined;
            if (!work) return { ok: false, error: 'not-found', detail: `book:${parsed?.id || target}` };
            if (!call.args.label) {
              resolvedLabel = parsed?.page ? `${work.title} (${parsed.page})` : work.title;
            }
          } else if (target.startsWith('note:')) {
            const parsed = parseNoteTarget(target);
            const note = parsed ? notesService.list(parsed.id)[0] : undefined;
            if (!note) return { ok: false, error: 'not-found', detail: `note:${parsed?.id || target}` };
            if (!call.args.label) resolvedLabel = note.title || target;
          } else if (target.startsWith('quran:') || target.startsWith('sunnah:')) {
            // Canonical Quran / Sunnah target already validated
          } else if (call.args.bookTitle) {
            const res = this.resolveWorkCandidate({ bookTitle: call.args.bookTitle });
            if (res.kind === 'not-found') return { ok: false, error: 'not-found', detail: res.detail };
            if (res.kind === 'multiple') {
              const titleLabel = call.args.page ? `${call.args.bookTitle} (${call.args.page})` : call.args.bookTitle;
              steps.push({
                stepId,
                tool: 'open_source',
                summary: t.aiActionStepOpenSource.replace('{label}', titleLabel),
                details: {
                  sourceLabel: titleLabel,
                  ...(call.args.page ? { page: call.args.page } : {}),
                  candidates: res.candidates,
                },
              });
              plannedCalls.push({ kind: 'open-pending', page: call.args.page, label: call.args.label, candidates: res.candidates });
              break;
            }
            target = call.args.page ? `book:${res.work.id}#p=${call.args.page}` : `book:${res.work.id}`;
            if (!call.args.label) {
              resolvedLabel = call.args.page ? `${res.work.title} (${call.args.page})` : res.work.title;
            }
          } else {
            const normalizedQuran = normalizeNaturalQuranTarget(rawTarget);
            if (normalizedQuran) {
              target = normalizedQuran;
              if (!call.args.label) resolvedLabel = rawTarget;
            } else {
              const hadithRef = parseNaturalHadithRef(rawTarget);
              if (hadithRef) {
                const resolvedHadith = this.deps.resolveSunnahHadith
                  ? await this.deps.resolveSunnahHadith(hadithRef.collection, hadithRef.hadithNumber)
                  : null;
                if (!resolvedHadith) {
                  return { ok: false, error: 'not-found', detail: `hadith:${rawTarget}` };
                }
                target = resolvedHadith.target;
                if (!call.args.label) resolvedLabel = resolvedHadith.label;
              } else {
                const bookPage = parseBookPageRef(rawTarget);
                const bookQuery = bookPage ? bookPage.query : rawTarget;
                const page = call.args.page ?? bookPage?.page;
                const res = this.resolveWorkCandidate({ bookTitle: bookQuery });
                if (res.kind === 'multiple') {
                  const titleLabel = page ? `${bookQuery} (${page})` : bookQuery;
                  steps.push({
                    stepId,
                    tool: 'open_source',
                    summary: t.aiActionStepOpenSource.replace('{label}', titleLabel),
                    details: {
                      sourceLabel: titleLabel,
                      ...(page ? { page } : {}),
                      candidates: res.candidates,
                    },
                  });
                  plannedCalls.push({ kind: 'open-pending', page, label: call.args.label, candidates: res.candidates });
                  break;
                }
                if (res.kind === 'one') {
                  target = page ? `book:${res.work.id}#p=${page}` : `book:${res.work.id}`;
                  if (!call.args.label) {
                    resolvedLabel = page ? `${res.work.title} (${page})` : res.work.title;
                  }
                } else {
                  const noteMatches = !page
                    ? notesService.list().filter(n => normalizeSearchString(n.title) === normalizeSearchString(rawTarget))
                    : [];
                  if (noteMatches.length === 1) {
                    target = `note:${noteMatches[0].id}`;
                    if (!call.args.label) resolvedLabel = noteMatches[0].title || rawTarget;
                  } else {
                    return { ok: false, error: 'not-found', detail: `book:${bookQuery}` };
                  }
                }
              }
            }
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
          plannedCalls.push({ kind: 'phase1', call: { tool: 'open_source', args: { target, ...(call.args.label ? { label: call.args.label } : {}) } } });
          break;
        }

        case 'split_pdf':
        case 'extract_pdf_pages':
        case 'rotate_pdf_pages':
        case 'ocr_pdf_page': {
          const pdfLookup = await this.resolvePdfCandidates(call.args);
          if (pdfLookup.kind === 'not-found') {
            return { ok: false, error: 'not-found', detail: pdfLookup.detail };
          }
          const queryLabel = call.args.bookTitle || call.args.author || call.args.workId || '';
          const stepSummary = (label: string, outputCount = 1) => {
            switch (call.tool) {
              case 'split_pdf':
                return t.aiActionStepSplitPdf.replace('{label}', label).replace('{count}', String(outputCount));
              case 'extract_pdf_pages':
                return t.aiActionStepExtractPdf.replace('{pages}', call.args.pages).replace('{label}', label);
              case 'rotate_pdf_pages':
                return t.aiActionStepRotatePdf.replace('{angle}', String(call.args.angle)).replace('{label}', label);
              case 'ocr_pdf_page':
                return t.aiActionStepOcrPdfPage.replace('{page}', String(call.args.page)).replace('{label}', label);
            }
          };

          if (pdfLookup.kind === 'multiple') {
            const publicCandidates: AiActionBookCandidate[] = pdfLookup.candidates.map(({ workId, sourceId, title, author, subtitle }) => ({
              workId,
              ...(sourceId ? { sourceId } : {}),
              title,
              ...(author ? { author } : {}),
              ...(subtitle ? { subtitle } : {}),
            }));
            steps.push({
              stepId,
              tool: call.tool,
              summary: stepSummary(queryLabel),
              details: {
                sourceLabel: queryLabel,
                ...(call.tool === 'extract_pdf_pages' ? { pageRange: call.args.pages } : {}),
                ...(call.tool === 'rotate_pdf_pages' ? { angle: call.args.angle, ...(call.args.pages ? { pageRange: call.args.pages } : {}) } : {}),
                ...(call.tool === 'split_pdf' && call.args.ranges ? { pageRange: call.args.ranges } : {}),
                ...(call.tool === 'ocr_pdf_page' ? { page: call.args.page, ocrLanguage: call.args.language ?? 'auto' } : {}),
                candidates: publicCandidates,
              },
            });
            plannedCalls.push({ kind: 'pdf-pending', call: call as PendingPdfCall, candidates: pdfLookup.candidates });
            break;
          }

          const resolvedRes = await this.resolveSinglePdfPlan(call as PendingPdfCall, pdfLookup.source, inspectPdf, reservedOutputPaths);
          if (!resolvedRes.ok) return resolvedRes;
          const resolved = resolvedRes.resolved;
          const label = this.workTitle(pdfLookup.source.workId, pdfLookup.source.path);
          steps.push({
            stepId,
            tool: call.tool,
            summary: stepSummary(label, resolved.outputPaths.length),
            details: {
              sourceLabel: label,
              ...(call.tool === 'extract_pdf_pages' ? { pageRange: call.args.pages } : {}),
              ...(call.tool === 'rotate_pdf_pages' ? { angle: call.args.angle, ...(call.args.pages ? { pageRange: call.args.pages } : {}) } : {}),
              ...(call.tool === 'split_pdf' && call.args.ranges ? { pageRange: call.args.ranges } : {}),
              ...(call.tool === 'ocr_pdf_page' ? { page: call.args.page, ocrLanguage: call.args.language ?? 'auto' } : {}),
              outputPaths: resolved.outputPaths,
            },
          });
          plannedCalls.push({ kind: 'pdf', resolved });
          break;
        }

        case 'merge_pdfs': {
          const slots: MergeSlotPlan[] = [];
          const labels: string[] = [];
          const mergeCandidateGroups: Array<{ index: number; query: string; candidates: AiActionBookCandidate[] }> = [];
          for (let idx = 0; idx < call.args.sources.length; idx++) {
            const item = call.args.sources[idx];
            const pdfLookup = await this.resolvePdfCandidates(item);
            if (pdfLookup.kind === 'not-found') {
              return { ok: false, error: 'not-found', detail: pdfLookup.detail };
            }
            if (pdfLookup.kind === 'multiple') {
              const queryLabel = item.bookTitle || item.author || item.workId || '';
              labels.push(queryLabel);
              slots.push({ kind: 'pending', candidates: pdfLookup.candidates });
              mergeCandidateGroups.push({
                index: idx,
                query: queryLabel,
                candidates: pdfLookup.candidates.map(({ workId, sourceId, title, author, subtitle }) => ({
                  workId,
                  ...(sourceId ? { sourceId } : {}),
                  title,
                  ...(author ? { author } : {}),
                  ...(subtitle ? { subtitle } : {}),
                })),
              });
            } else {
              const info = await inspectPdf(pdfLookup.source.path);
              slots.push({ kind: 'resolved', source: pdfLookup.source, totalPages: info.totalPages });
              labels.push(this.workTitle(pdfLookup.source.workId, pdfLookup.source.path));
            }
          }

          if (mergeCandidateGroups.length > 0) {
            steps.push({
              stepId,
              tool: 'merge_pdfs',
              summary: t.aiActionStepMergePdfs.replace('{count}', String(slots.length)),
              details: {
                sourceLabel: labels.join(' + '),
                mergeCandidateGroups,
              },
            });
            plannedCalls.push({ kind: 'merge-pending', slots });
          } else {
            const resolvedSources = slots.map(s => {
              if (s.kind !== 'resolved') throw new Error('unexpected-pending-slot');
              return { source: s.source, totalPages: s.totalPages };
            });
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
          }
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

  public async confirmPlan(
    planId: string,
    language: 'ar' | 'en',
    selections?: Record<string, { workId: string; sourceId?: string }>
  ): Promise<AiActionConfirmResponse> {
    const stored = this.plans.get(planId);
    if (!stored) return { ok: false, error: 'plan-not-found' };

    const inspectPdf = this.deps.inspectPdf ?? inspectPdfFile;
    const reservedOutputPaths = new Set<string>();
    for (const c of stored.calls) {
      if (c.kind === 'pdf') {
        for (const p of c.resolved.outputPaths) reservedOutputPaths.add(p);
      }
    }

    const finalizedCalls: Array<{ kind: 'phase1'; call: ValidatedAiActionCall } | { kind: 'pdf'; resolved: ResolvedPdfPlan }> = [];
    for (let i = 0; i < stored.calls.length; i++) {
      const planned = stored.calls[i];
      const stepId = stored.stepIds[i];

      if (planned.kind === 'open-pending') {
        const pick = selections?.[stepId];
        const chosen = pick
          ? planned.candidates.find(c => c.workId === pick.workId && (!c.sourceId || c.sourceId === pick.sourceId))
          : undefined;
        if (!chosen) {
          return { ok: false, error: 'invalid-arguments', detail: 'candidate-selection-required' };
        }
        const target = planned.page ? `book:${chosen.workId}#p=${planned.page}` : `book:${chosen.workId}`;
        finalizedCalls.push({
          kind: 'phase1',
          call: { tool: 'open_source', args: { target, ...(planned.label ? { label: planned.label } : {}) } },
        });
        continue;
      }

      if (planned.kind === 'pdf-pending') {
        const pick = selections?.[stepId];
        const chosen = pick
          ? planned.candidates.find(c => c.workId === pick.workId && (!c.sourceId || c.sourceId === pick.sourceId))
          : undefined;
        if (!chosen) {
          return { ok: false, error: 'invalid-arguments', detail: 'candidate-selection-required' };
        }
        const resolvedRes = await this.resolveSinglePdfPlan(planned.call, chosen.source, inspectPdf, reservedOutputPaths);
        if (!resolvedRes.ok) return resolvedRes;
        finalizedCalls.push({ kind: 'pdf', resolved: resolvedRes.resolved });
        continue;
      }

      if (planned.kind === 'merge-pending') {
        const resolvedSources: Array<{ source: PdfSource; totalPages: number }> = [];
        for (let idx = 0; idx < planned.slots.length; idx++) {
          const slot = planned.slots[idx];
          if (slot.kind === 'resolved') {
            resolvedSources.push({ source: slot.source, totalPages: slot.totalPages });
          } else {
            const pick = selections?.[`${stepId}:${idx}`] ?? selections?.[stepId];
            const chosen = pick
              ? slot.candidates.find(c => c.workId === pick.workId && (!c.sourceId || c.sourceId === pick.sourceId))
              : undefined;
            if (!chosen) {
              return { ok: false, error: 'invalid-arguments', detail: 'candidate-selection-required' };
            }
            const info = await inspectPdf(chosen.source.path);
            resolvedSources.push({ source: chosen.source, totalPages: info.totalPages });
          }
        }
        const outputPaths = uniqueOutputPaths(resolvedSources[0].source.path, 1, 'merged', '.pdf', reservedOutputPaths);
        finalizedCalls.push({
          kind: 'pdf',
          resolved: {
            tool: 'merge_pdfs',
            sources: resolvedSources,
            outputPaths,
          },
        });
        continue;
      }

      finalizedCalls.push(planned);
    }

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
      for (let i = 0; i < finalizedCalls.length; i++) {
        const planned = finalizedCalls[i];
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
