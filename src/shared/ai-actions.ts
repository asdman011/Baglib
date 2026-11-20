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
  'split_pdf',
  'merge_pdfs',
  'extract_pdf_pages',
  'rotate_pdf_pages',
  'ocr_pdf_page',
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
  {
    type: 'function',
    function: {
      name: 'split_pdf',
      description: 'Split a library PDF into new PDF files next to the source. Never overwrites the original.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['workId'],
        properties: {
          workId: { type: 'string', minLength: 1, maxLength: 180 },
          sourceId: { type: 'string', maxLength: 180 },
          ranges: { type: 'string', minLength: 1, maxLength: 500 },
          pagesPerFile: { type: 'integer', minimum: 1, maximum: 5000 },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'merge_pdfs',
      description: 'Merge two or more library PDFs into a new PDF file next to the first source.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['sources'],
        properties: {
          sources: {
            type: 'array',
            minItems: 2,
            maxItems: 10,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['workId'],
              properties: {
                workId: { type: 'string', minLength: 1, maxLength: 180 },
                sourceId: { type: 'string', maxLength: 180 },
              },
            },
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'extract_pdf_pages',
      description: 'Extract specific pages (e.g. "1,3-5") from a library PDF into a new PDF file next to the source.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['workId', 'pages'],
        properties: {
          workId: { type: 'string', minLength: 1, maxLength: 180 },
          sourceId: { type: 'string', maxLength: 180 },
          pages: { type: 'string', minLength: 1, maxLength: 500 },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'rotate_pdf_pages',
      description: 'Rotate pages of a library PDF by 90, 180, or 270 degrees into a new PDF file next to the source.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['workId', 'angle'],
        properties: {
          workId: { type: 'string', minLength: 1, maxLength: 180 },
          sourceId: { type: 'string', maxLength: 180 },
          angle: { type: 'integer', enum: [90, 180, 270] },
          pages: { type: 'string', minLength: 1, maxLength: 500 },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ocr_pdf_page',
      description: 'Run OCR on one named page of a library PDF and write a new text file next to the source. Do not force OCR on pages that already have a text layer unless explicitly asked.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['workId', 'page'],
        properties: {
          workId: { type: 'string', minLength: 1, maxLength: 180 },
          sourceId: { type: 'string', maxLength: 180 },
          page: { type: 'integer', minimum: 1, maximum: 10000 },
          language: { type: 'string', enum: ['ara', 'eng', 'ara+eng', 'auto'] },
          force: { type: 'boolean' },
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

export interface SplitPdfArgs {
  workId: string;
  sourceId?: string;
  ranges?: string;
  pagesPerFile?: number;
}

export interface MergePdfsArgs {
  sources: Array<{ workId: string; sourceId?: string }>;
}

export interface ExtractPdfPagesArgs {
  workId: string;
  sourceId?: string;
  pages: string;
}

export interface RotatePdfPagesArgs {
  workId: string;
  sourceId?: string;
  angle: 90 | 180 | 270;
  pages?: string;
}

export interface OcrPdfPageArgs {
  workId: string;
  sourceId?: string;
  page: number;
  language?: 'ara' | 'eng' | 'ara+eng' | 'auto';
  force?: boolean;
}

export type ValidatedAiActionCall =
  | { tool: 'create_note'; args: CreateNoteArgs }
  | { tool: 'append_to_note'; args: AppendToNoteArgs }
  | { tool: 'create_cards_from_selection'; args: CreateCardsArgs }
  | { tool: 'add_to_personal_list'; args: AddToPersonalListArgs }
  | { tool: 'open_source'; args: OpenSourceArgs }
  | { tool: 'split_pdf'; args: SplitPdfArgs }
  | { tool: 'merge_pdfs'; args: MergePdfsArgs }
  | { tool: 'extract_pdf_pages'; args: ExtractPdfPagesArgs }
  | { tool: 'rotate_pdf_pages'; args: RotatePdfPagesArgs }
  | { tool: 'ocr_pdf_page'; args: OcrPdfPageArgs };

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
    outputPaths?: string[];
    pageRange?: string;
    angle?: number;
    page?: number;
    ocrLanguage?: string;
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
  outputPaths?: string[];
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
const PAGE_RANGE_SYNTAX = /^\s*\d+(?:\s*-\s*\d+)?(?:\s*,\s*\d+(?:\s*-\s*\d+)?)*\s*$/u;
const OCR_LANGUAGES = ['ara', 'eng', 'ara+eng', 'auto'] as const;

export function parsePageRanges(
  spec: string,
  totalPages: number
): { ok: true; pages: number[]; groups: number[][] } | { ok: false; reason: string } {
  if (typeof spec !== 'string' || !PAGE_RANGE_SYNTAX.test(spec)) {
    return { ok: false, reason: 'invalid-page-range-syntax' };
  }
  if (!Number.isInteger(totalPages) || totalPages < 1) {
    return { ok: false, reason: 'invalid-total-pages' };
  }
  const tokens = spec.split(',').map(part => part.trim()).filter(Boolean);
  if (tokens.length === 0 || tokens.length > 500) {
    return { ok: false, reason: 'invalid-page-range-syntax' };
  }
  const pages: number[] = [];
  const groups: number[][] = [];
  for (const token of tokens) {
    const match = /^(\d+)(?:\s*-\s*(\d+))?$/u.exec(token);
    if (!match) return { ok: false, reason: 'invalid-page-range-syntax' };
    const start = Number.parseInt(match[1], 10);
    const end = match[2] !== undefined ? Number.parseInt(match[2], 10) : start;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start || end > totalPages) {
      return { ok: false, reason: 'page-out-of-range' };
    }
    const group: number[] = [];
    for (let p = start; p <= end; p++) {
      pages.push(p);
      group.push(p);
      if (pages.length > 10_000) return { ok: false, reason: 'page-range-too-large' };
    }
    groups.push(group);
  }
  return { ok: true, pages, groups };
}

function parseOptionalId(raw: unknown): string | undefined | null {
  if (raw === undefined || raw === null || raw === '') return undefined;
  return typeof raw === 'string' && SAFE_ID.test(raw.trim()) ? raw.trim() : null;
}

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

    case 'split_pdf': {
      const workId = typeof args.workId === 'string' ? args.workId.trim() : '';
      if (!SAFE_ID.test(workId)) return { ok: false, reason: 'invalid-work-id' };
      const sourceId = parseOptionalId(args.sourceId);
      if (sourceId === null) return { ok: false, reason: 'invalid-source-id' };
      const ranges = typeof args.ranges === 'string' && args.ranges.trim() ? args.ranges.trim() : undefined;
      if (ranges !== undefined && (ranges.length > 500 || !PAGE_RANGE_SYNTAX.test(ranges))) {
        return { ok: false, reason: 'invalid-page-range-syntax' };
      }
      let pagesPerFile: number | undefined;
      if (args.pagesPerFile !== undefined) {
        if (typeof args.pagesPerFile !== 'number' || !Number.isInteger(args.pagesPerFile) || args.pagesPerFile < 1 || args.pagesPerFile > 5000) {
          return { ok: false, reason: 'invalid-pages-per-file' };
        }
        pagesPerFile = args.pagesPerFile;
      }
      return {
        ok: true,
        call: {
          tool: 'split_pdf',
          args: {
            workId,
            ...(sourceId ? { sourceId } : {}),
            ...(ranges ? { ranges } : {}),
            ...(pagesPerFile !== undefined ? { pagesPerFile } : {}),
          },
        },
      };
    }

    case 'merge_pdfs': {
      if (!Array.isArray(args.sources) || args.sources.length < 2 || args.sources.length > 10) {
        return { ok: false, reason: 'invalid-merge-sources' };
      }
      const sources: Array<{ workId: string; sourceId?: string }> = [];
      for (const item of args.sources) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return { ok: false, reason: 'invalid-merge-sources' };
        const rec = item as Record<string, unknown>;
        const workId = typeof rec.workId === 'string' ? rec.workId.trim() : '';
        if (!SAFE_ID.test(workId)) return { ok: false, reason: 'invalid-work-id' };
        const sourceId = parseOptionalId(rec.sourceId);
        if (sourceId === null) return { ok: false, reason: 'invalid-source-id' };
        sources.push({ workId, ...(sourceId ? { sourceId } : {}) });
      }
      return { ok: true, call: { tool: 'merge_pdfs', args: { sources } } };
    }

    case 'extract_pdf_pages': {
      const workId = typeof args.workId === 'string' ? args.workId.trim() : '';
      if (!SAFE_ID.test(workId)) return { ok: false, reason: 'invalid-work-id' };
      const sourceId = parseOptionalId(args.sourceId);
      if (sourceId === null) return { ok: false, reason: 'invalid-source-id' };
      const pages = typeof args.pages === 'string' ? args.pages.trim() : '';
      if (!pages || pages.length > 500 || !PAGE_RANGE_SYNTAX.test(pages)) {
        return { ok: false, reason: 'invalid-page-range-syntax' };
      }
      return {
        ok: true,
        call: {
          tool: 'extract_pdf_pages',
          args: { workId, ...(sourceId ? { sourceId } : {}), pages },
        },
      };
    }

    case 'rotate_pdf_pages': {
      const workId = typeof args.workId === 'string' ? args.workId.trim() : '';
      if (!SAFE_ID.test(workId)) return { ok: false, reason: 'invalid-work-id' };
      const sourceId = parseOptionalId(args.sourceId);
      if (sourceId === null) return { ok: false, reason: 'invalid-source-id' };
      if (args.angle !== 90 && args.angle !== 180 && args.angle !== 270) {
        return { ok: false, reason: 'invalid-rotation-angle' };
      }
      const pages = typeof args.pages === 'string' && args.pages.trim() ? args.pages.trim() : undefined;
      if (pages !== undefined && (pages.length > 500 || !PAGE_RANGE_SYNTAX.test(pages))) {
        return { ok: false, reason: 'invalid-page-range-syntax' };
      }
      return {
        ok: true,
        call: {
          tool: 'rotate_pdf_pages',
          args: { workId, ...(sourceId ? { sourceId } : {}), angle: args.angle, ...(pages ? { pages } : {}) },
        },
      };
    }

    case 'ocr_pdf_page': {
      const workId = typeof args.workId === 'string' ? args.workId.trim() : '';
      if (!SAFE_ID.test(workId)) return { ok: false, reason: 'invalid-work-id' };
      const sourceId = parseOptionalId(args.sourceId);
      if (sourceId === null) return { ok: false, reason: 'invalid-source-id' };
      if (typeof args.page !== 'number' || !Number.isInteger(args.page) || args.page < 1 || args.page > 10_000) {
        return { ok: false, reason: 'invalid-page-number' };
      }
      let language: OcrPdfPageArgs['language'];
      if (args.language !== undefined) {
        if (typeof args.language !== 'string' || !(OCR_LANGUAGES as readonly string[]).includes(args.language)) {
          return { ok: false, reason: 'invalid-ocr-language' };
        }
        language = args.language as OcrPdfPageArgs['language'];
      }
      const force = args.force === true ? true : undefined;
      return {
        ok: true,
        call: {
          tool: 'ocr_pdf_page',
          args: {
            workId,
            ...(sourceId ? { sourceId } : {}),
            page: args.page,
            ...(language ? { language } : {}),
            ...(force ? { force } : {}),
          },
        },
      };
    }
  }
}
