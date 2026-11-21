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
import { parseQuranReference } from './quran-reference';
import { validStudyTarget } from './study-notes';
import type { SunnahCollectionId } from './types/sunnah';
import { normalizeArabicText } from './utils/text-normalizer';

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
          workId: { type: 'string', maxLength: 180, description: 'Optional existing BagLib workId from context. Never invent an ID.' },
          bookTitle: { type: 'string', maxLength: 300, description: 'Optional book title or author as stated by the user.' },
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
          workId: { type: 'string', maxLength: 180, description: 'Optional existing BagLib workId from context. Never invent an ID.' },
          bookTitle: { type: 'string', maxLength: 300, description: 'Optional book title or author as stated by the user.' },
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
      description: 'Open a BagLib source (book or book page, Quran ayah, hadith, or study note). Pass the user\'s natural reference or title — never invent an ID.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          target: {
            type: 'string',
            minLength: 1,
            maxLength: 600,
            description: 'Natural reference or canonical target, e.g. "2:11", "ayah 2:11", "البقرة 11", "Bukhari 1", "البخاري ١", "page 40 of The Master and His Emissary", or a book/note title.',
          },
          bookTitle: { type: 'string', minLength: 1, maxLength: 300, description: 'Optional book title or author as stated by the user.' },
          page: { type: 'integer', minimum: 1, maximum: 100000, description: 'Optional page number when opening a book.' },
          label: { type: 'string', maxLength: 300 },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'split_pdf',
      description: 'Split a library PDF into new PDF files next to the source. Never overwrites the original. Pass bookTitle as stated by the user rather than inventing a workId.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          bookTitle: { type: 'string', minLength: 1, maxLength: 300, description: 'Book title (Arabic or English) as stated by the user.' },
          author: { type: 'string', minLength: 1, maxLength: 200, description: 'Optional author name to narrow the book search.' },
          workId: { type: 'string', minLength: 1, maxLength: 180, description: 'Optional existing BagLib workId from context. Never invent an ID.' },
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
      description: 'Merge two or more library PDFs into a new PDF file next to the first source. Pass bookTitle as stated by the user rather than inventing a workId.',
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
              properties: {
                bookTitle: { type: 'string', minLength: 1, maxLength: 300, description: 'Book title as stated by the user.' },
                author: { type: 'string', minLength: 1, maxLength: 200 },
                workId: { type: 'string', minLength: 1, maxLength: 180, description: 'Optional existing BagLib workId from context. Never invent an ID.' },
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
      description: 'Extract specific pages (e.g. "1,3-5" or "8-12") from a library PDF into a new PDF file next to the source. Pass bookTitle as stated by the user rather than inventing a workId.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['pages'],
        properties: {
          bookTitle: { type: 'string', minLength: 1, maxLength: 300, description: 'Book title (Arabic or English) as stated by the user.' },
          author: { type: 'string', minLength: 1, maxLength: 200, description: 'Optional author name to narrow the book search.' },
          workId: { type: 'string', minLength: 1, maxLength: 180, description: 'Optional existing BagLib workId from context. Never invent an ID.' },
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
      description: 'Rotate pages of a library PDF by 90, 180, or 270 degrees into a new PDF file next to the source. Pass bookTitle as stated by the user rather than inventing a workId.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['angle'],
        properties: {
          bookTitle: { type: 'string', minLength: 1, maxLength: 300, description: 'Book title (Arabic or English) as stated by the user.' },
          author: { type: 'string', minLength: 1, maxLength: 200, description: 'Optional author name to narrow the book search.' },
          workId: { type: 'string', minLength: 1, maxLength: 180, description: 'Optional existing BagLib workId from context. Never invent an ID.' },
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
      description: 'Run OCR on one named page of a library PDF and write a new text file next to the source. Pass bookTitle as stated by the user rather than inventing a workId. Do not force OCR on pages that already have a text layer unless explicitly asked.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['page'],
        properties: {
          bookTitle: { type: 'string', minLength: 1, maxLength: 300, description: 'Book title (Arabic or English) as stated by the user.' },
          author: { type: 'string', minLength: 1, maxLength: 200, description: 'Optional author name to narrow the book search.' },
          workId: { type: 'string', minLength: 1, maxLength: 180, description: 'Optional existing BagLib workId from context. Never invent an ID.' },
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
  bookTitle?: string;
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
  bookTitle?: string;
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
  bookTitle?: string;
  page?: number;
  label?: string;
}

export interface BookLookupRef {
  workId?: string;
  bookTitle?: string;
  author?: string;
  sourceId?: string;
}

export interface SplitPdfArgs extends BookLookupRef {
  ranges?: string;
  pagesPerFile?: number;
}

export interface MergePdfsArgs {
  sources: BookLookupRef[];
}

export interface ExtractPdfPagesArgs extends BookLookupRef {
  pages: string;
}

export interface RotatePdfPagesArgs extends BookLookupRef {
  angle: 90 | 180 | 270;
  pages?: string;
}

export interface OcrPdfPageArgs extends BookLookupRef {
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

export interface AiActionBookCandidate {
  workId: string;
  sourceId?: string;
  title: string;
  author?: string;
  subtitle?: string;
}

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
    candidates?: AiActionBookCandidate[];
    mergeCandidateGroups?: Array<{
      index: number;
      query: string;
      candidates: AiActionBookCandidate[];
    }>;
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
  sourceWorkId?: string | null;
  sourceLabel?: string;
}

export interface AiActionHistoryStep {
  tool: AiActionToolName;
  summary: string;
  sourceLabel?: string;
  sourceWorkId?: string | null;
  outputPaths?: string[];
  openTarget?: string;
  importedWorkIds?: Record<string, string>;
}

export interface AiActionHistoryEntry {
  executionId: string;
  status: 'executed' | 'undone';
  steps: AiActionHistoryStep[];
}

export interface AiActionPlanRequest {
  instruction: string;
  language: 'ar' | 'en';
  allowRemote?: boolean;
  context?: {
    selectedText?: string;
    activeTarget?: string;
    activeLabel?: string;
    sources?: Array<{ target: string; label: string }>;
    actionHistory?: AiActionHistoryEntry[];
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
  selections?: Record<string, { workId: string; sourceId?: string }>;
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

export interface AiActionOutputRequest {
  executionId: string;
  outputPath: string;
}

export type AiActionOpenOutputResponse =
  | { ok: true; mode: 'reader'; openTarget: string }
  | { ok: true; mode: 'system' }
  | { ok: false; error: AiActionErrorCode; detail?: string };

export type AiActionShowOutputResponse =
  | { ok: true }
  | { ok: false; error: AiActionErrorCode; detail?: string };

export type AiActionAddOutputToLibraryResponse =
  | { ok: true; workId: string; openTarget: string }
  | { ok: false; error: AiActionErrorCode; detail?: string };

export interface AiActionsAPI {
  plan(request: AiActionPlanRequest): Promise<AiActionPlanResponse>;
  confirm(request: AiActionConfirmRequest): Promise<AiActionConfirmResponse>;
  undo(request: AiActionUndoRequest): Promise<AiActionUndoResponse>;
  openOutput(request: AiActionOutputRequest): Promise<AiActionOpenOutputResponse>;
  showOutputInFolder(request: AiActionOutputRequest): Promise<AiActionShowOutputResponse>;
  addOutputToLibrary(request: AiActionOutputRequest): Promise<AiActionAddOutputToLibraryResponse>;
  chooseOutputFolder(): Promise<{ canceled: boolean; folderPath?: string }>;
}

const SAFE_ID = /^[\w-]{1,180}$/u;
const OPEN_SOURCE_PREFIXES = ['book:', 'quran:', 'sunnah:', 'note:'] as const;
const BLOCKED_TARGET_RE = /^(?:https?:|file:|javascript:|data:|mailto:)/iu;
const PAGE_RANGE_SYNTAX = /^\s*\d+(?:\s*-\s*\d+)?(?:\s*,\s*\d+(?:\s*-\s*\d+)?)*\s*$/u;
const OCR_LANGUAGES = ['ara', 'eng', 'ara+eng', 'auto'] as const;

const ARABIC_INDIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

export function toAsciiDigits(value: string): string {
  let out = '';
  for (const ch of value) {
    const ar = ARABIC_INDIC_DIGITS.indexOf(ch);
    if (ar >= 0) {
      out += String(ar);
      continue;
    }
    const fa = PERSIAN_DIGITS.indexOf(ch);
    if (fa >= 0) {
      out += String(fa);
      continue;
    }
    out += ch;
  }
  return out;
}

export function normalizeNaturalQuranTarget(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('quran:') && validStudyTarget(trimmed)) return trimmed;

  let text = toAsciiDigits(trimmed).replace(/^quran:\s*/iu, '').trim();
  text = text.replace(/^(?:(?:the\s+)?quran|ayah|aya|verse|surah|sura)\s+/iu, '').trim();
  text = text.replace(/^(?:ayah|aya|verse)\s+/iu, '').trim();

  const reversedEn = /^(?:ayah|aya|verse)\s+(\d{1,3}(?:\s*[-–—]\s*\d{1,3})?)\s+(?:of|from|in)\s+(.+)$/iu.exec(text);
  if (reversedEn) {
    text = `${reversedEn[2].trim()} ${reversedEn[1].trim()}`;
  }
  const reversedAr = /^(?:آية|اية|الآية|الاية)\s+(\d{1,3}(?:\s*[-–—]\s*\d{1,3})?)\s+(?:من|في)\s+(.+)$/u.exec(text);
  if (reversedAr) {
    text = `${reversedAr[2].trim()} ${reversedAr[1].trim()}`;
  }

  text = text
    .replace(/\s+(?:آية|اية|الآية|الاية|رقم|ayah|aya|verse)\s+/giu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const ref = parseQuranReference(text, 'hafs');
  if (!ref) return null;
  return ref.from === ref.to
    ? `quran:hafs:${ref.surah}:${ref.from}`
    : `quran:hafs:${ref.surah}:${ref.from}-${ref.to}`;
}

const SUNNAH_COLLECTION_ALIASES: ReadonlyArray<readonly [string, SunnahCollectionId]> = [
  ['sahih al bukhari', 'Bukhari'],
  ['sahih bukhari', 'Bukhari'],
  ['al bukhari', 'Bukhari'],
  ['bukhari', 'Bukhari'],
  ['صحيح البخاري', 'Bukhari'],
  ['البخاري', 'Bukhari'],
  ['بخاري', 'Bukhari'],
  ['sahih muslim', 'Muslim'],
  ['muslim', 'Muslim'],
  ['صحيح مسلم', 'Muslim'],
  ['مسلم', 'Muslim'],
  ['sunan abi dawud', 'AbuDaud'],
  ['sunan abu dawud', 'AbuDaud'],
  ['abu dawud', 'AbuDaud'],
  ['abu daud', 'AbuDaud'],
  ['سنن ابي داود', 'AbuDaud'],
  ['ابي داود', 'AbuDaud'],
  ['ابو داود', 'AbuDaud'],
  ['jami at tirmidhi', 'Tirmizi'],
  ['sunan al tirmidhi', 'Tirmizi'],
  ['al tirmidhi', 'Tirmizi'],
  ['tirmidhi', 'Tirmizi'],
  ['tirmizi', 'Tirmizi'],
  ['جامع الترمذي', 'Tirmizi'],
  ['سنن الترمذي', 'Tirmizi'],
  ['الترمذي', 'Tirmizi'],
  ['ترمذي', 'Tirmizi'],
  ['sunan an nasai', 'Nesai'],
  ['an nasai', 'Nesai'],
  ['nasai', 'Nesai'],
  ['nesai', 'Nesai'],
  ['سنن النسائي', 'Nesai'],
  ['النسائي', 'Nesai'],
  ['نسائي', 'Nesai'],
  ['sunan ibn majah', 'IbnMaja'],
  ['ibn majah', 'IbnMaja'],
  ['ibn maja', 'IbnMaja'],
  ['سنن ابن ماجه', 'IbnMaja'],
  ['ابن ماجه', 'IbnMaja'],
  ['muwatta malik', 'MuwattaMalik'],
  ['muwatta', 'MuwattaMalik'],
  ['موطا مالك', 'MuwattaMalik'],
  ['الموطا', 'MuwattaMalik'],
  ['musnad ahmad', 'MusnadAhmad'],
  ['مسند احمد', 'MusnadAhmad'],
  ['sunan al darimi', 'SunanDarimi'],
  ['sunan darimi', 'SunanDarimi'],
  ['دارمي', 'SunanDarimi'],
  ['الدارمي', 'SunanDarimi'],
  ['سنن الدارمي', 'SunanDarimi'],
  ['nawawi 40', 'Nawawi40'],
  ['40 nawawi', 'Nawawi40'],
  ['الاربعون النوويه', 'Nawawi40'],
  ['الاربعين النوويه', 'Nawawi40'],
];

export function parseNaturalHadithRef(raw: string): { collection: SunnahCollectionId; hadithNumber: string } | null {
  if (typeof raw !== 'string') return null;
  const ascii = toAsciiDigits(raw.trim());
  if (!ascii) return null;
  const norm = normalizeArabicText(ascii, { normalizeTaaMarbuta: true, lowercase: true })
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\b(?:hadith|hadeeth|no|num|number)\b/gu, ' ')
    .replace(/(?:^|\s)(?:حديث|رقم)(?=\s|$)/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!norm) return null;

  for (const [alias, collection] of SUNNAH_COLLECTION_ALIASES) {
    const normAlias = normalizeArabicText(alias, { normalizeTaaMarbuta: true, lowercase: true });
    if (norm.startsWith(normAlias + ' ')) {
      const rest = norm.slice(normAlias.length).trim();
      if (/^\d{1,6}$/u.test(rest)) {
        return { collection, hadithNumber: rest };
      }
    }
    if (norm.endsWith(' ' + normAlias)) {
      const rest = norm.slice(0, norm.length - normAlias.length).trim();
      if (/^\d{1,6}$/u.test(rest)) {
        return { collection, hadithNumber: rest };
      }
    }
  }
  return null;
}

export function parseBookPageRef(raw: string): { query: string; page?: number } | null {
  if (typeof raw !== 'string') return null;
  const ascii = toAsciiDigits(raw.trim());
  if (!ascii) return null;

  const enPrefix = /^(?:pages?|p\.?)\s*(\d{1,6})\s+(?:of|in|from)\s+(.+)$/iu.exec(ascii);
  if (enPrefix) {
    const page = Number.parseInt(enPrefix[1], 10);
    const query = enPrefix[2].trim();
    if (page >= 1 && page <= 100_000 && query) return { query, page };
  }

  const arPrefix = /^(?:صفحة|صفحه|ص\.?)\s*(\d{1,6})\s+(?:من|في)\s+(.+)$/u.exec(ascii);
  if (arPrefix) {
    const page = Number.parseInt(arPrefix[1], 10);
    const query = arPrefix[2].trim();
    if (page >= 1 && page <= 100_000 && query) return { query, page };
  }

  const suffix = /^(.+?)[,\s]+(?:page|p\.?|صفحة|صفحه|ص\.?)\s*(\d{1,6})$/iu.exec(ascii);
  if (suffix) {
    const page = Number.parseInt(suffix[2], 10);
    const query = suffix[1].trim();
    if (page >= 1 && page <= 100_000 && query) return { query, page };
  }

  return null;
}

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

function parseOptionalText(raw: unknown, maxLen: number): string | undefined | null {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > maxLen) return null;
  return trimmed;
}

function parseBookLookupRef(rec: Record<string, unknown>): { ok: true; ref: BookLookupRef } | { ok: false; reason: string } {
  const workId = parseOptionalId(rec.workId);
  if (workId === null) return { ok: false, reason: 'invalid-work-id' };
  const sourceId = parseOptionalId(rec.sourceId);
  if (sourceId === null) return { ok: false, reason: 'invalid-source-id' };
  const bookTitle = parseOptionalText(rec.bookTitle, 300);
  if (bookTitle === null) return { ok: false, reason: 'invalid-book-title' };
  const author = parseOptionalText(rec.author, 200);
  if (author === null) return { ok: false, reason: 'invalid-author' };
  if (!workId && !bookTitle && !author) {
    return { ok: false, reason: 'missing-book-reference' };
  }
  return {
    ok: true,
    ref: {
      ...(workId ? { workId } : {}),
      ...(bookTitle ? { bookTitle } : {}),
      ...(author ? { author } : {}),
      ...(sourceId ? { sourceId } : {}),
    },
  };
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
      const workId = parseOptionalId(args.workId);
      if (workId === null) return { ok: false, reason: 'invalid-work-id' };
      const bookTitle = parseOptionalText(args.bookTitle, 300);
      if (bookTitle === null) return { ok: false, reason: 'invalid-book-title' };
      let tags: string[] | undefined;
      if (args.tags !== undefined) {
        if (!Array.isArray(args.tags) || args.tags.length > 20 || args.tags.some(t => typeof t !== 'string' || !t.trim() || t.length > 100)) {
          return { ok: false, reason: 'invalid-tags' };
        }
        tags = [...new Set(args.tags.map(t => t.trim()))];
      }
      return {
        ok: true,
        call: {
          tool: 'create_note',
          args: {
            title,
            content,
            ...(workId ? { workId } : {}),
            ...(bookTitle ? { bookTitle } : {}),
            ...(tags ? { tags } : {}),
          },
        },
      };
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
      const workId = parseOptionalId(args.workId);
      if (workId === null) return { ok: false, reason: 'invalid-work-id' };
      const bookTitle = parseOptionalText(args.bookTitle, 300);
      if (bookTitle === null) return { ok: false, reason: 'invalid-book-title' };
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
            ...(bookTitle ? { bookTitle } : {}),
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
      const rawTarget = typeof args.target === 'string' ? args.target.trim() : '';
      const bookTitle = parseOptionalText(args.bookTitle, 300);
      if (bookTitle === null) return { ok: false, reason: 'invalid-book-title' };
      let page: number | undefined;
      if (args.page !== undefined) {
        if (typeof args.page !== 'number' || !Number.isInteger(args.page) || args.page < 1 || args.page > 100_000) {
          return { ok: false, reason: 'invalid-page-number' };
        }
        page = args.page;
      }
      if (!rawTarget && !bookTitle) {
        return { ok: false, reason: 'invalid-source-target' };
      }
      if (rawTarget.length > 600) {
        return { ok: false, reason: 'invalid-source-target' };
      }
      if (rawTarget && (BLOCKED_TARGET_RE.test(rawTarget) || rawTarget.includes('..') || rawTarget.includes('\\'))) {
        return { ok: false, reason: 'unsupported-source-target' };
      }
      let target = rawTarget;
      if (target && validStudyTarget(target)) {
        if (!OPEN_SOURCE_PREFIXES.some(prefix => target.startsWith(prefix))) {
          return { ok: false, reason: 'unsupported-source-target' };
        }
      } else if (target) {
        const normalizedQuran = normalizeNaturalQuranTarget(target);
        if (normalizedQuran) target = normalizedQuran;
      }
      const label = typeof args.label === 'string' && args.label.trim() ? args.label.trim().slice(0, 300) : undefined;
      return {
        ok: true,
        call: {
          tool: 'open_source',
          args: {
            target,
            ...(bookTitle ? { bookTitle } : {}),
            ...(page !== undefined ? { page } : {}),
            ...(label ? { label } : {}),
          },
        },
      };
    }

    case 'split_pdf': {
      const lookup = parseBookLookupRef(args);
      if ('reason' in lookup) return { ok: false, reason: lookup.reason };
      const rawRanges = typeof args.ranges === 'string' && args.ranges.trim() ? toAsciiDigits(args.ranges.trim()) : undefined;
      if (rawRanges !== undefined && (rawRanges.length > 500 || !PAGE_RANGE_SYNTAX.test(rawRanges))) {
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
            ...lookup.ref,
            ...(rawRanges ? { ranges: rawRanges } : {}),
            ...(pagesPerFile !== undefined ? { pagesPerFile } : {}),
          },
        },
      };
    }

    case 'merge_pdfs': {
      if (!Array.isArray(args.sources) || args.sources.length < 2 || args.sources.length > 10) {
        return { ok: false, reason: 'invalid-merge-sources' };
      }
      const sources: BookLookupRef[] = [];
      for (const item of args.sources) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return { ok: false, reason: 'invalid-merge-sources' };
        const lookup = parseBookLookupRef(item as Record<string, unknown>);
        if ('reason' in lookup) return { ok: false, reason: lookup.reason };
        sources.push(lookup.ref);
      }
      return { ok: true, call: { tool: 'merge_pdfs', args: { sources } } };
    }

    case 'extract_pdf_pages': {
      const lookup = parseBookLookupRef(args);
      if ('reason' in lookup) return { ok: false, reason: lookup.reason };
      const pages = typeof args.pages === 'string' ? toAsciiDigits(args.pages.trim()) : '';
      if (!pages || pages.length > 500 || !PAGE_RANGE_SYNTAX.test(pages)) {
        return { ok: false, reason: 'invalid-page-range-syntax' };
      }
      return {
        ok: true,
        call: {
          tool: 'extract_pdf_pages',
          args: { ...lookup.ref, pages },
        },
      };
    }

    case 'rotate_pdf_pages': {
      const lookup = parseBookLookupRef(args);
      if ('reason' in lookup) return { ok: false, reason: lookup.reason };
      if (args.angle !== 90 && args.angle !== 180 && args.angle !== 270) {
        return { ok: false, reason: 'invalid-rotation-angle' };
      }
      const pages = typeof args.pages === 'string' && args.pages.trim() ? toAsciiDigits(args.pages.trim()) : undefined;
      if (pages !== undefined && (pages.length > 500 || !PAGE_RANGE_SYNTAX.test(pages))) {
        return { ok: false, reason: 'invalid-page-range-syntax' };
      }
      return {
        ok: true,
        call: {
          tool: 'rotate_pdf_pages',
          args: { ...lookup.ref, angle: args.angle, ...(pages ? { pages } : {}) },
        },
      };
    }

    case 'ocr_pdf_page': {
      const lookup = parseBookLookupRef(args);
      if ('reason' in lookup) return { ok: false, reason: lookup.reason };
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
            ...lookup.ref,
            page: args.page,
            ...(language ? { language } : {}),
            ...(force ? { force } : {}),
          },
        },
      };
    }
  }
}

const ACTION_INTENT_EN_RE =
  /(?:\b(?:extract|split|merge|rotate)\b.*\b(?:page|pages|pdf|book|file|document)\b|\b(?:page|pages|pdf)\b.*\b(?:extract|split|merge|rotate)\b|\bocr\b|\b(?:open|go to|jump to)\s+(?:book|pdf|page|ayah|surah|sura|hadith|note|poem|quran|bukhari|muslim|[\d٠-٩]+:[\d٠-٩]+)|\b(?:create|make|write|save|append|add)\s+(?:a\s+|to\s+(?:the\s+|a\s+)?)?(?:study\s+)?note\b|\b(?:create|make|generate)\s+(?:flash\s*)?cards?\b|\badd\s+.+\s+to\s+(?:my\s+|a\s+)?(?:(?:\w+)\s+)?list\b)/iu;

const ACTION_INTENT_AR_RE =
  /(?:(?:استخرج|استخراج|افصل|فصل|ادمج|دمج|دوّر|دور|تدوير)\s+(?:صفح|الصفح|ملف|كتاب|الكتاب|pdf)|(?:تعرف\s+ضوئي|استخراج\s+النص\s+من\s+(?:صفح|صورة))|(?:افتح|اذهب\s+إلى|انتقل\s+إلى)\s+(?:كتاب|الكتاب|صفحة|الصفحة|آية|الآية|سورة|السورة|حديث|الحديث|ملاحظة|الملاحظة|قصيدة|القصيدة|[\d٠-٩]+:[\d٠-٩]+)|(?:أنشئ|انشئ|اكتب|احفظ|أضف\s+إلى|اضف\s+الى)\s+ملاحظة|(?:أنشئ|انشئ|اصنع|ولّد|ولد)\s+بطاقات|(?:أضف|اضف)\s+.+\s+(?:إلى|الى|لـ?)\s*(?:قائمة|القائمة))/iu;

/**
 * KEY-446: Detect natural-language action requests in English or Arabic so they
 * reach `ai-actions:plan` even when the user has not toggled "Actions" mode.
 */
export function looksLikeActionRequest(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 4000) return false;
  return ACTION_INTENT_EN_RE.test(trimmed) || ACTION_INTENT_AR_RE.test(trimmed);
}

const UNABLE_TOOL_REPLY_RE =
  /(?:i\s+(?:cannot|can't|am unable to|do not have|don't have)\s+(?:extract|split|merge|rotate|ocr|open|create|access|modify|perform)|does not support tool|no tool|add source|لا أستطيع|لا يمكنني|لا أملك صلاحية|غير متاح لي)/iu;

/**
 * KEY-446: Detect when a model without tool-calling support ignores `tools` and
 * responds with plain text saying it cannot perform the action.
 */
export function isUnableToolReply(text: string): boolean {
  return UNABLE_TOOL_REPLY_RE.test(text.trim());
}

const FOLLOWUP_OPEN_RE = /^(?:open\s+(?:it|that|the\s+(?:file|output|pdf|result))|افتح(?:ه|ها|\s+(?:الملف|الناتج|النتيجة)))\s*[.!?؟]*$/iu;
const FOLLOWUP_UNDO_RE = /^(?:undo\s+(?:it|that|this|the\s+action)|تراجع(?:\s+عن\s+(?:ذلك|هذا|الإجراء))?)\s*[.!?؟]*$/iu;
const FOLLOWUP_ADD_LIBRARY_RE = /^(?:add\s+(?:it|that|the\s+(?:file|output|pdf|result))\s+to\s+(?:my\s+|the\s+)?library|import\s+(?:it|that)\s+(?:to|into)\s+(?:my\s+|the\s+)?library|أضف(?:ه|ها)\s+(?:إلى|الى|لـ?)\s*(?:مكتبتي|المكتبة)|اضف(?:ه|ها)\s+(?:إلى|الى|لـ?)\s*(?:مكتبتي|المكتبة))\s*[.!?؟]*$/iu;

/**
 * KEY-449: Match direct follow-up commands referencing the most recent executed AI action.
 */
export function matchActionFollowUp(text: string): 'open' | 'undo' | 'add-to-library' | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 200) return null;
  if (FOLLOWUP_UNDO_RE.test(trimmed)) return 'undo';
  if (FOLLOWUP_ADD_LIBRARY_RE.test(trimmed)) return 'add-to-library';
  if (FOLLOWUP_OPEN_RE.test(trimmed)) return 'open';
  return null;
}

/**
 * KEY-449: Format executed/undone AI actions into a compact context block for chat & action-planner prompts.
 */
export function formatExecutedActionsBlock(actionHistory?: AiActionHistoryEntry[]): string {
  if (!actionHistory || actionHistory.length === 0) return '';
  const lines: string[] = [];
  for (const entry of actionHistory.slice(-10)) {
    const state = entry.status === 'undone' ? 'undone' : 'executed';
    for (const step of entry.steps) {
      const parts = [`tool=${step.tool}`, `status=${state}`, `summary="${step.summary}"`];
      if (step.sourceLabel) parts.push(`source="${step.sourceLabel}"`);
      if (step.sourceWorkId) parts.push(`sourceWorkId=${step.sourceWorkId}`);
      if (step.openTarget) parts.push(`openTarget=${step.openTarget}`);
      if (step.outputPaths?.length) parts.push(`outputPaths=${step.outputPaths.join(', ')}`);
      if (step.importedWorkIds && Object.keys(step.importedWorkIds).length > 0) {
        parts.push(
          `importedWorkIds=${Object.entries(step.importedWorkIds)
            .map(([p, id]) => `${p} -> ${id}`)
            .join(', ')}`
        );
      }
      lines.push(`- [${entry.executionId}] ${parts.join(' | ')}`);
    }
  }
  return lines.length ? `<EXECUTED_ACTIONS>\n${lines.join('\n')}\n</EXECUTED_ACTIONS>` : '';
}
