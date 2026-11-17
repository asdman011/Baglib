/**
 * Baglib — Card Note & Note Type Definitions (ADR-017 / KEY-390)
 */

export type NoteTypeKind = 'normal' | 'cloze' | 'image_occlusion' | 'context_cloze' | 'choice';

export type StockNoteTypeKind =
  | 'basic'
  | 'basic_reversed'
  | 'basic_optional_reversed'
  | 'basic_typing'
  | 'cloze'
  | 'image_occlusion'
  | 'progressive_context_cloze'
  | 'multiple_choice'
  | 'quran'
  | 'hadith'
  | 'poetry';

export interface CardNoteField {
  noteTypeId: string;
  ord: number;
  name: string;
  rtl: boolean;
  font: string | null;
  sizePx: number | null;
  sourceText: boolean;
  ankiId: number | null;
}

export interface CardNoteTemplate {
  noteTypeId: string;
  ord: number;
  name: string;
  front: string;
  back: string;
  ankiId: number | null;
}

export interface CardNoteType {
  id: string;
  name: string;
  kind: NoteTypeKind;
  stockKind: StockNoteTypeKind | string | null;
  css: string;
  sortFieldOrd: number;
  ankiId: number | null;
  ankiExtra: string | null;
  fields: CardNoteField[];
  templates: CardNoteTemplate[];
  createdAt: string;
  updatedAt: string;
}

export interface CardNote {
  id: string;
  noteTypeId: string;
  fields: Record<string, string>;
  guid: string;
  copiedFromNoteId: string | null;
  sourceRef: string | null;
  sourceSnapshot: Record<string, string> | null;
  sourceHash: string | null;
  sourceChangedAt: string | null;
  orphanedAt: string | null;
  ankiId: number | null;
  ankiExtra: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SaveNoteInput {
  id?: string;
  noteTypeId: string;
  fields: Record<string, string>;
  guid?: string;
  copiedFromNoteId?: string | null;
  sourceRef?: string | null;
  sourceSnapshot?: Record<string, string> | null;
  sourceHash?: string | null;
  tags?: string[];
  deckId?: string;
}

export interface GeneratedCard {
  ord: number;
  front: string;
  back: string;
  empty?: boolean;
}

export interface NoteTypeManagerInput {
  name: string;
  css?: string;
  fields: Array<{ name: string; rtl?: boolean; font?: string | null; sizePx?: number | null; sourceText?: boolean }>;
  templates: Array<{ name: string; front: string; back: string }>;
}

export const NOTE_TYPE_KINDS = ['normal', 'cloze', 'image_occlusion', 'context_cloze', 'choice'] as const;

export function validateSafeId(id: unknown, fieldName = 'id'): string {
  if (typeof id !== 'string' || !id.trim() || id.length > 128) {
    throw new Error(`invalid-request: invalid ${fieldName}`);
  }
  if (!/^[a-zA-Z0-9_\-:]+$/u.test(id)) {
    throw new Error(`invalid-request: invalid ${fieldName} format`);
  }
  return id.trim();
}

export function validateSaveNoteInput(input: unknown): SaveNoteInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('invalid-request: input must be an object');
  }
  const val = input as Record<string, unknown>;
  const allowedKeys = new Set([
    'id', 'noteTypeId', 'fields', 'guid', 'copiedFromNoteId',
    'sourceRef', 'sourceSnapshot', 'sourceHash', 'tags', 'deckId'
  ]);
  for (const k of Object.keys(val)) {
    if (!allowedKeys.has(k)) {
      throw new Error(`invalid-request: unknown key ${k}`);
    }
  }

  const noteTypeId = validateSafeId(val.noteTypeId, 'noteTypeId');
  const id = val.id !== undefined && val.id !== null ? validateSafeId(val.id, 'id') : undefined;
  const deckId = val.deckId !== undefined && val.deckId !== null ? validateSafeId(val.deckId, 'deckId') : undefined;
  const guid = val.guid !== undefined && val.guid !== null ? String(val.guid).slice(0, 128) : undefined;
  const copiedFromNoteId = val.copiedFromNoteId !== undefined && val.copiedFromNoteId !== null
    ? validateSafeId(val.copiedFromNoteId, 'copiedFromNoteId')
    : undefined;
  const sourceRef = val.sourceRef !== undefined && val.sourceRef !== null
    ? String(val.sourceRef).slice(0, 500)
    : undefined;
  const sourceHash = val.sourceHash !== undefined && val.sourceHash !== null
    ? String(val.sourceHash).slice(0, 128)
    : undefined;

  if (!val.fields || typeof val.fields !== 'object' || Array.isArray(val.fields)) {
    throw new Error('invalid-request: fields must be an object');
  }
  const rawFields = val.fields as Record<string, unknown>;
  const fieldKeys = Object.keys(rawFields);
  if (fieldKeys.length === 0 || fieldKeys.length > 64) {
    throw new Error('invalid-request: fields count must be between 1 and 64');
  }

  const fields: Record<string, string> = {};
  for (const k of fieldKeys) {
    if (typeof k !== 'string' || !k.trim() || k.length > 100) {
      throw new Error(`invalid-request: invalid field key ${k}`);
    }
    const fval = rawFields[k];
    if (typeof fval !== 'string') {
      throw new Error(`invalid-request: field ${k} value must be a string`);
    }
    if (fval.length > 20_000) {
      throw new Error(`invalid-request: field ${k} exceeds maximum length 20,000`);
    }
    fields[k] = fval;
  }

  let sourceSnapshot: Record<string, string> | null | undefined = undefined;
  if (val.sourceSnapshot !== undefined && val.sourceSnapshot !== null) {
    if (typeof val.sourceSnapshot !== 'object' || Array.isArray(val.sourceSnapshot)) {
      throw new Error('invalid-request: sourceSnapshot must be an object');
    }
    sourceSnapshot = {};
    for (const [sk, sv] of Object.entries(val.sourceSnapshot as Record<string, unknown>)) {
      if (typeof sv !== 'string' || sv.length > 20_000) {
        throw new Error(`invalid-request: invalid sourceSnapshot value for ${sk}`);
      }
      sourceSnapshot[sk] = sv;
    }
  }

  let tags: string[] | undefined = undefined;
  if (val.tags !== undefined && val.tags !== null) {
    if (!Array.isArray(val.tags)) {
      throw new Error('invalid-request: tags must be an array');
    }
    if (val.tags.length > 50) {
      throw new Error('invalid-request: tags count exceeds 50');
    }
    tags = val.tags.map(t => {
      if (typeof t !== 'string' || t.length > 100) throw new Error('invalid-request: invalid tag');
      return t;
    });
  }

  return {
    id,
    noteTypeId,
    fields,
    guid,
    copiedFromNoteId,
    sourceRef,
    sourceSnapshot,
    sourceHash,
    tags,
    deckId,
  };
}

export function validateSaveNoteTypeInput(input: unknown): {
  id?: string;
  name: string;
  kind?: NoteTypeKind;
  css?: string;
  sortFieldOrd?: number;
  fields: Array<{ ord?: number; name: string; rtl?: boolean; font?: string | null; sizePx?: number | null; sourceText?: boolean }>;
  templates: Array<{ ord?: number; name: string; front: string; back: string }>;
} {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('invalid-request: input must be an object');
  }
  const val = input as Record<string, unknown>;
  const allowedKeys = new Set(['id', 'name', 'kind', 'css', 'sortFieldOrd', 'fields', 'templates']);
  for (const k of Object.keys(val)) {
    if (!allowedKeys.has(k)) {
      throw new Error(`invalid-request: unknown key ${k}`);
    }
  }

  const id = val.id !== undefined && val.id !== null ? validateSafeId(val.id, 'id') : undefined;
  if (typeof val.name !== 'string' || !val.name.trim() || val.name.length > 200) {
    throw new Error('invalid-request: name must be 1 to 200 chars');
  }
  const name = val.name.trim();

  let kind: NoteTypeKind | undefined = undefined;
  if (val.kind !== undefined && val.kind !== null) {
    if (!NOTE_TYPE_KINDS.includes(val.kind as NoteTypeKind)) {
      throw new Error(`invalid-request: invalid kind ${String(val.kind)}`);
    }
    kind = val.kind as NoteTypeKind;
  }

  const css = typeof val.css === 'string' ? val.css.slice(0, 50_000) : undefined;
  const sortFieldOrd = typeof val.sortFieldOrd === 'number' && val.sortFieldOrd >= 0 ? val.sortFieldOrd : undefined;

  if (!Array.isArray(val.fields) || val.fields.length === 0 || val.fields.length > 64) {
    throw new Error('invalid-request: fields must be an array of 1 to 64 items');
  }

  const fields = val.fields.map((f, i) => {
    if (!f || typeof f !== 'object') throw new Error(`invalid-request: field at ${i} must be an object`);
    const fObj = f as Record<string, unknown>;
    if (typeof fObj.name !== 'string' || !fObj.name.trim() || fObj.name.length > 100) {
      throw new Error(`invalid-request: field at ${i} has invalid name`);
    }
    return {
      ord: typeof fObj.ord === 'number' ? fObj.ord : i,
      name: fObj.name.trim(),
      rtl: Boolean(fObj.rtl),
      font: typeof fObj.font === 'string' ? fObj.font.slice(0, 100) : null,
      sizePx: typeof fObj.sizePx === 'number' && fObj.sizePx > 0 && fObj.sizePx <= 200 ? fObj.sizePx : null,
      sourceText: Boolean(fObj.sourceText),
    };
  });

  if (!Array.isArray(val.templates) || val.templates.length === 0 || val.templates.length > 32) {
    throw new Error('invalid-request: templates must be an array of 1 to 32 items');
  }

  const templates = val.templates.map((t, i) => {
    if (!t || typeof t !== 'object') throw new Error(`invalid-request: template at ${i} must be an object`);
    const tObj = t as Record<string, unknown>;
    if (typeof tObj.name !== 'string' || !tObj.name.trim() || tObj.name.length > 100) {
      throw new Error(`invalid-request: template at ${i} has invalid name`);
    }
    if (typeof tObj.front !== 'string' || tObj.front.length > 50_000) {
      throw new Error(`invalid-request: template at ${i} has invalid front`);
    }
    if (typeof tObj.back !== 'string' || tObj.back.length > 50_000) {
      throw new Error(`invalid-request: template at ${i} has invalid back`);
    }
    return {
      ord: typeof tObj.ord === 'number' ? tObj.ord : i,
      name: tObj.name.trim(),
      front: tObj.front,
      back: tObj.back,
    };
  });

  return {
    id,
    name,
    kind,
    css,
    sortFieldOrd,
    fields,
    templates,
  };
}

export interface CardNotesAPI {
  listTypes: () => Promise<CardNoteType[]>;
  getType: (id: string) => Promise<CardNoteType | null>;
  saveType: (input: unknown) => Promise<CardNoteType>;
  deleteType: (id: string) => Promise<boolean>;
  listNotes: (query?: unknown) => Promise<CardNote[]>;
  getNote: (id: string) => Promise<CardNote | null>;
  saveNote: (input: unknown) => Promise<{ note: CardNote; cards: import('./knowledge-cards').KnowledgeCard[]; emptyCards: Array<{ id: string; ord: number }> }>;
  forkNote: (noteId: string, deckId: string) => Promise<{ newNote: CardNote; newCards: import('./knowledge-cards').KnowledgeCard[] }>;
  restoreSourceText: (noteId: string) => Promise<CardNote>;
  getCards: (noteId: string) => Promise<import('./knowledge-cards').KnowledgeCard[]>;
  getDecks: (noteId: string) => Promise<string[]>;
  linkDeck: (noteId: string, deckId: string) => Promise<void>;
}

