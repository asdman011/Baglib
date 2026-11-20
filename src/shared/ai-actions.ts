/**
 * KEY-439 (AI Task 5, Phase 1): AI Actions — fixed tool schemas, strict argument
 * validation, preview plans, execution results, and undo contracts.
 *
 * Security & KEY-434 principles:
 * - Fixed set of 5 Phase 1 tools (no shell, no free file access).
 * - Every action previews what will change and runs only after explicit user confirmation.
 * - Every executed action can be undone.
 * - AI-written content is marked as generated; cards stay in review state (not memorizing).
 */
import { CARD_SOURCE_KINDS, type CardSourceKind } from './types/knowledge-cards';
import { PERSONAL_LIST_KINDS, canonicalItemRef, isListItemKind, type PersonalListItemKind } from './personal-lists';
import { validStudyTarget } from './study-notes';

export const AI_ACTION_TOOL_NAMES = [
  'create_note',
  'append_to_note',
  'create_cards_from_selection',
  'add_to_personal_list',
  'open_source',
] as const;

export type AiActionToolName = (typeof AI_ACTION_TOOL_NAMES)[number];

export interface OpenAiToolDefinition {
  type: 'function';
  function: {
    name: AiActionToolName;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export const AI_ACTION_TOOLS: readonly OpenAiToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'create_note',
      description: 'Create a new BagLib study note. Content will be marked as AI-generated.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'content'],
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 300 },
          content: { type: 'string', minLength: 1, maxLength: 50000 },
          workId: { type: 'string', maxLength: 180 },
          tags: { type: 'array', maxItems: 20, items: { type: 'string', maxLength: 100 } },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'append_to_note',
      description: 'Append AI-generated text to an existing BagLib study note without overwriting existing content.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['noteId', 'text'],
        properties: {
          noteId: { type: 'string', minLength: 1, maxLength: 180 },
          text: { type: 'string', minLength: 1, maxLength: 50000 },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_cards_from_selection',
      description: 'Create memorization flashcards from a passage or selection. Cards are marked AI-generated and placed in review state.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['cards'],
        properties: {
          cards: {
            type: 'array',
            minItems: 1,
            maxItems: 10,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['front', 'back'],
              properties: {
                front: { type: 'string', minLength: 1, maxLength: 2000 },
                back: { type: 'string', minLength: 1, maxLength: 5000 },
              },
            },
          },
          sourceKind: { type: 'string', enum: [...CARD_SOURCE_KINDS] },
          sourceRef: { type: 'string', maxLength: 500 },
          sourceLabel: { type: 'string', maxLength: 500 },
          workId: { type: 'string', maxLength: 180 },
          language: { type: 'string', enum: ['ar', 'en'] },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_to_personal_list',
      description: 'Add a book, ayah, hadith, poem, lecture, note, or page to a BagLib personal list.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['itemKind', 'itemRef'],
        properties: {
          listId: { type: 'string', maxLength: 64 },
          itemKind: { type: 'string', enum: [...PERSONAL_LIST_KINDS] },
          itemRef: { type: 'string', minLength: 1, maxLength: 600 },
          label: { type: 'string', maxLength: 300 },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'open_source',
      description: 'Open a BagLib source (book page, Quran ayah, hadith, or study note).',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['target'],
        properties: {
          target: { type: 'string', minLength: 1, maxLength: 600 },
          label: { type: 'string', maxLength: 300 },
        },
      },
    },
  },
];

export interface CreateNoteArgs {
  title: string;
  content: string;
  workId?: string;
  tags?: string[];
}

export interface AppendToNoteArgs {
  noteId: string;
  text: string;
}

export interface CreateCardsArgs {
  cards: Array<{ front: string; back: string }>;
  sourceKind: CardSourceKind;
  sourceRef?: string;
  sourceLabel?: string;
  workId?: string;
  language?: 'ar' | 'en';
}

export interface AddToPersonalListArgs {
  listId: string;
  itemKind: PersonalListItemKind;
  itemRef: string;
  label: string;
}

export interface OpenSourceArgs {
  target: string;
  label?: string;
}

export type ValidatedAiActionCall =
  | { tool: 'create_note'; args: CreateNoteArgs }
  | { tool: 'append_to_note'; args: AppendToNoteArgs }
  | { tool: 'create_cards_from_selection'; args: CreateCardsArgs }
  | { tool: 'add_to_personal_list'; args: AddToPersonalListArgs }
  | { tool: 'open_source'; args: OpenSourceArgs };

export type AiActionErrorCode =
  | 'ai-disabled'
  | 'learning-mode-off'
  | 'not-configured'
  | 'consent-required'
  | 'tools-unsupported'
  | 'invalid-arguments'
  | 'not-found'
  | 'plan-not-found'
  | 'undo-not-found'
  | 'already-undone'
  | 'provider-error'
  | 'execution-failed';

export interface AiActionPreviewStep {
  stepId: string;
  tool: AiActionToolName;
  summary: string;
  details: {
    title?: string;
    content?: string;
    noteId?: string;
    noteTitle?: string;
    appendText?: string;
    cards?: Array<{ front: string; back: string }>;
    listId?: string;
    listName?: string;
    itemKind?: PersonalListItemKind;
    itemRef?: string;
    itemLabel?: string;
    target?: string;
    sourceLabel?: string;
    tags?: string[];
  };
}

export interface AiActionPlan {
  planId: string;
  steps: AiActionPreviewStep[];
}

export interface AiActionExecutedStep {
  stepId: string;
  tool: AiActionToolName;
  createdNoteId?: string;
  updatedNoteId?: string;
  createdCardIds?: string[];
  listId?: string;
  itemKind?: PersonalListItemKind;
  itemRef?: string;
  openTarget?: string;
}

export interface AiActionPlanRequest {
  instruction: string;
  language: 'ar' | 'en';
  allowRemote?: boolean;
  context?: {
    selectedText?: string;
    activeTarget?: string;
    activeLabel?: string;
  };
}

export type AiActionPlanResponse =
  | { ok: true; kind: 'plan'; plan: AiActionPlan }
  | { ok: true; kind: 'message'; text: string }
  | { ok: true; kind: 'unsupported'; reason: string }
  | { ok: false; error: AiActionErrorCode; detail?: string };

export interface AiActionConfirmRequest {
  planId: string;
  language: 'ar' | 'en';
}

export type AiActionConfirmResponse =
  | {
      ok: true;
      executionId: string;
      executed: AiActionExecutedStep[];
      openTargets: string[];
      canUndo: boolean;
    }
  | { ok: false; error: AiActionErrorCode; detail?: string };

export interface AiActionUndoRequest {
  executionId: string;
}

export type AiActionUndoResponse =
  | {
      ok: true;
      executionId: string;
      undoneSteps: AiActionExecutedStep[];
      revertOpenSource: boolean;
    }
  | { ok: false; error: AiActionErrorCode; detail?: string };

export interface AiActionsAPI {
  plan(request: AiActionPlanRequest): Promise<AiActionPlanResponse>;
  confirm(request: AiActionConfirmRequest): Promise<AiActionConfirmResponse>;
  undo(request: AiActionUndoRequest): Promise<AiActionUndoResponse>;
}

const SAFE_ID = /^[\w-]{1,180}$/u;
const OPEN_SOURCE_PREFIXES = ['book:', 'quran:', 'sunnah:', 'note:'] as const;

export function isAiActionToolName(name: unknown): name is AiActionToolName {
  return typeof name === 'string' && (AI_ACTION_TOOL_NAMES as readonly string[]).includes(name);
}

export function validateToolCallArguments(
  name: unknown,
  rawArgs: unknown
): { ok: true; call: ValidatedAiActionCall } | { ok: false; reason: string } {
  if (!isAiActionToolName(name)) {
    return { ok: false, reason: `unknown-tool:${String(name)}` };
  }
  const args = (rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs) ? rawArgs : null) as Record<string, unknown> | null;
  if (!args) {
    return { ok: false, reason: 'arguments-must-be-object' };
  }

  switch (name) {
    case 'create_note': {
      const title = typeof args.title === 'string' ? args.title.trim() : '';
      const content = typeof args.content === 'string' ? args.content.trim() : '';
      if (!title || title.length > 300) return { ok: false, reason: 'invalid-note-title' };
      if (!content || content.length > 50_000) return { ok: false, reason: 'invalid-note-content' };
      const workId = args.workId === undefined || args.workId === null || args.workId === ''
        ? undefined
        : (typeof args.workId === 'string' && SAFE_ID.test(args.workId) ? args.workId : null);
      if (workId === null) return { ok: false, reason: 'invalid-work-id' };
      let tags: string[] | undefined;
      if (args.tags !== undefined) {
        if (!Array.isArray(args.tags) || args.tags.length > 20 || args.tags.some(t => typeof t !== 'string' || !t.trim() || t.length > 100)) {
          return { ok: false, reason: 'invalid-tags' };
        }
        tags = [...new Set(args.tags.map(t => t.trim()))];
      }
      return { ok: true, call: { tool: 'create_note', args: { title, content, ...(workId ? { workId } : {}), ...(tags ? { tags } : {}) } } };
    }

    case 'append_to_note': {
      const noteId = typeof args.noteId === 'string' ? args.noteId.trim() : '';
      const text = typeof args.text === 'string' ? args.text.trim() : '';
      if (!SAFE_ID.test(noteId)) return { ok: false, reason: 'invalid-note-id' };
      if (!text || text.length > 50_000) return { ok: false, reason: 'invalid-append-text' };
      return { ok: true, call: { tool: 'append_to_note', args: { noteId, text } } };
    }

    case 'create_cards_from_selection': {
      if (!Array.isArray(args.cards) || args.cards.length < 1 || args.cards.length > 10) {
        return { ok: false, reason: 'invalid-cards-array' };
      }
      const cards: Array<{ front: string; back: string }> = [];
      for (const item of args.cards) {
        if (!item || typeof item !== 'object') return { ok: false, reason: 'invalid-card-item' };
        const front = typeof (item as Record<string, unknown>).front === 'string' ? ((item as Record<string, unknown>).front as string).trim() : '';
        const back = typeof (item as Record<string, unknown>).back === 'string' ? ((item as Record<string, unknown>).back as string).trim() : '';
        if (!front || front.length > 2000 || !back || back.length > 5000) {
          return { ok: false, reason: 'invalid-card-fields' };
        }
        cards.push({ front, back });
      }
      const sourceKindRaw = args.sourceKind ?? 'note';
      if (typeof sourceKindRaw !== 'string' || !(CARD_SOURCE_KINDS as readonly string[]).includes(sourceKindRaw)) {
        return { ok: false, reason: 'invalid-source-kind' };
      }
      const sourceRef = typeof args.sourceRef === 'string' && args.sourceRef.trim() ? args.sourceRef.trim().slice(0, 500) : undefined;
      const sourceLabel = typeof args.sourceLabel === 'string' && args.sourceLabel.trim() ? args.sourceLabel.trim().slice(0, 500) : undefined;
      const workId = args.workId === undefined || args.workId === null || args.workId === ''
        ? undefined
        : (typeof args.workId === 'string' && SAFE_ID.test(args.workId) ? args.workId : null);
      if (workId === null) return { ok: false, reason: 'invalid-work-id' };
      const language = args.language === 'ar' || args.language === 'en' ? args.language : undefined;
      return {
        ok: true,
        call: {
          tool: 'create_cards_from_selection',
          args: {
            cards,
            sourceKind: sourceKindRaw as CardSourceKind,
            ...(sourceRef ? { sourceRef } : {}),
            ...(sourceLabel ? { sourceLabel } : {}),
            ...(workId ? { workId } : {}),
            ...(language ? { language } : {}),
          },
        },
      };
    }

    case 'add_to_personal_list': {
      const listId = typeof args.listId === 'string' && args.listId.trim() ? args.listId.trim() : 'starred';
      if (!/^[A-Za-z0-9_-]{1,64}$/u.test(listId)) return { ok: false, reason: 'invalid-list-id' };
      if (!isListItemKind(args.itemKind)) return { ok: false, reason: 'invalid-item-kind' };
      const canonical = canonicalItemRef(args.itemKind, args.itemRef);
      if (!canonical) return { ok: false, reason: 'invalid-item-ref' };
      const label = typeof args.label === 'string' ? args.label.trim().slice(0, 300) : '';
      return {
        ok: true,
        call: {
          tool: 'add_to_personal_list',
          args: { listId, itemKind: args.itemKind, itemRef: canonical, label: label || canonical },
        },
      };
    }

    case 'open_source': {
      const target = typeof args.target === 'string' ? args.target.trim() : '';
      if (!target || target.length > 600 || !validStudyTarget(target)) {
        return { ok: false, reason: 'invalid-source-target' };
      }
      if (!OPEN_SOURCE_PREFIXES.some(prefix => target.startsWith(prefix))) {
        return { ok: false, reason: 'unsupported-source-target' };
      }
      const label = typeof args.label === 'string' && args.label.trim() ? args.label.trim().slice(0, 300) : undefined;
      return { ok: true, call: { tool: 'open_source', args: { target, ...(label ? { label } : {}) } } };
    }
  }
}
