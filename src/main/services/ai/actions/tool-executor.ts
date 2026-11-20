/**
 * KEY-439 (AI Task 5, Phase 1): Main-process validator, preview planner, executor,
 * and undo manager for AI Actions.
 *
 * All mutations go through existing BagLib services (`StudyNotesService`,
 * `KnowledgeCardRepository`, `PersonalListsService`) with zero new DB fields.
 */
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { markAiGenerated } from '../../../../shared/ai-principles';
import { isLocalAi } from '../../../../shared/ai-consent';
import { providerReady } from '../../../../shared/research-ai';
import { parseBookTarget, parseNoteTarget } from '../../../../shared/study-notes';
import type { AISettings } from '../../../../shared/types/ai';
import type { StudyNote } from '../../../../shared/study-notes';
import type { PersonalListItemKind } from '../../../../shared/personal-lists';
import {
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
import { StudyNotesService } from '../../study-notes';
import { callModelWithTools, type RawToolCall, type ToolCallingResult } from './tool-calling';

interface StoredPlan {
  planId: string;
  calls: ValidatedAiActionCall[];
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
  | { stepId: string; tool: 'open_source'; openTarget: string };

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

  private isLearningModeOff(aiSettings: AISettings): boolean {
    const inlineMode = (aiSettings as AISettings & { learningMode?: unknown }).learningMode;
    if (inlineMode === 'off') return true;
    try {
      return this.deps.settingsRepo.get<unknown>('ai.learningMode') === 'off';
    } catch {
      return false;
    }
  }

  public async planFromInstruction(request: AiActionPlanRequest): Promise<AiActionPlanResponse> {
    const instruction = typeof request.instruction === 'string' ? request.instruction.trim() : '';
    if (!instruction || instruction.length > 4000) {
      return { ok: false, error: 'invalid-arguments', detail: 'invalid-instruction' };
    }
    const language: 'ar' | 'en' = request.language === 'ar' ? 'ar' : 'en';
    const settings = this.deps.getAiSettings();
    if (settings.enabled === false) return { ok: false, error: 'ai-disabled' };
    if (this.isLearningModeOff(settings)) return { ok: false, error: 'learning-mode-off' };
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

  public buildPreviewPlan(rawCalls: RawToolCall[], language: 'ar' | 'en'): AiActionPlanResponse {
    if (!Array.isArray(rawCalls) || rawCalls.length === 0 || rawCalls.length > 10) {
      return { ok: false, error: 'invalid-arguments', detail: 'empty-or-too-many-tool-calls' };
    }

    const t = translations[language];
    const notesService = new StudyNotesService(this.deps.settingsRepo, this.deps.db);
    const listsService = new PersonalListsService(this.deps.db);
    const validatedCalls: ValidatedAiActionCall[] = [];
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
          break;
        }
      }

      validatedCalls.push(call);
      stepIds.push(stepId);
    }

    const planId = randomUUID();
    this.plans.set(planId, { planId, calls: validatedCalls, stepIds, createdAt: Date.now() });
    trimMap(this.plans, MAX_PLANS);

    const plan: AiActionPlan = { planId, steps };
    return { ok: true, kind: 'plan', plan };
  }

  public confirmPlan(planId: string, language: 'ar' | 'en'): AiActionConfirmResponse {
    const stored = this.plans.get(planId);
    if (!stored) return { ok: false, error: 'plan-not-found' };
    this.plans.delete(planId);

    const lang: 'ar' | 'en' = language === 'ar' ? 'ar' : 'en';
    const marker = translations[lang].aiGeneratedMarker;
    const notesService = new StudyNotesService(this.deps.settingsRepo, this.deps.db);
    const cardRepo = new KnowledgeCardRepository(this.deps.db);
    const listsService = new PersonalListsService(this.deps.db);

    const records: UndoRecord[] = [];
    const executed: AiActionExecutedStep[] = [];
    const openTargets: string[] = [];

    try {
      for (let i = 0; i < stored.calls.length; i++) {
        const call = stored.calls[i];
        const stepId = stored.stepIds[i];

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
      }
    } catch (err: unknown) {
      // Rollback any already-completed steps in reverse order
      this.revertRecords(records);
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

  public undoExecution(executionId: string): AiActionUndoResponse {
    const stored = this.executions.get(executionId);
    if (!stored) return { ok: false, error: 'undo-not-found' };
    if (stored.undone) return { ok: false, error: 'already-undone' };

    const undoneSteps = this.revertRecords(stored.records);
    stored.undone = true;
    const revertOpenSource = stored.records.some(record => record.tool === 'open_source');

    return {
      ok: true,
      executionId,
      undoneSteps,
      revertOpenSource,
    };
  }

  private revertRecords(records: UndoRecord[]): AiActionExecutedStep[] {
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
      }
    }

    return undoneSteps;
  }
}
