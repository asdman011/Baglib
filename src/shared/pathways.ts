import { validStudyTarget } from './study-notes';

export const PATHWAY_KINDS = ['research', 'curriculum'] as const;
export type PathwayKind = typeof PATHWAY_KINDS[number];
export type PathwayItemKind = 'resource' | 'link' | 'step';
export type ReferenceFormat = 'bibtex' | 'markdown';

export interface PathwayItem {
  id: string;
  pathwayId: string;
  section: string;
  kind: PathwayItemKind;
  reference: string | null;
  title: string;
  url: string | null;
  pinned: boolean;
  sortOrder: number;
  createdAt: string;
  /** Steps only: the planner task is finished. */
  done: boolean;
}
export interface Pathway { id: string; name: string; description: string; kind: PathwayKind; steps: number; done: number; resources: number }
export interface PathwayDetail extends Pathway { items: PathwayItem[] }
export interface PathwayInput { id?: string; name: string; description: string; kind: PathwayKind; outline?: string }
export interface PathwayItemInput { pathwayId: string; section: string; kind: 'resource' | 'link'; reference?: string; title: string; url?: string }
export interface PathwayTemplate { id: string; name: string; kind: PathwayKind; outline: string }

export interface PathwaysAPI {
  list(): Promise<Pathway[]>;
  get(id: string): Promise<PathwayDetail>;
  save(input: PathwayInput): Promise<Pathway>;
  remove(id: string): Promise<void>;
  addItem(input: PathwayItemInput): Promise<PathwayItem>;
  addStep(pathwayId: string, section: string, title: string): Promise<PathwayItem>;
  removeItem(id: string): Promise<void>;
  setPinned(id: string, pinned: boolean): Promise<void>;
  setDone(id: string, done: boolean): Promise<void>;
  reorder(pathwayId: string, ids: string[]): Promise<void>;
  exportReferences(id: string, format: ReferenceFormat): Promise<boolean>;
  templates(): Promise<PathwayTemplate[]>;
  saveTemplate(input: Omit<PathwayTemplate, 'id'>): Promise<PathwayTemplate>;
  removeTemplate(id: string): Promise<void>;
  draft(subject: string, language: 'ar' | 'en'): Promise<string>;
}

const MAX_STEPS = 200;
const text = (value: unknown, max: number): string => {
  if (typeof value !== 'string' || value.length > max) throw new Error('invalid-request');
  return value.trim();
};
const required = (value: unknown, max: number): string => {
  const result = text(value, max);
  if (!result) throw new Error('invalid-request');
  return result;
};
export const pathwayId = (value: unknown): string => required(value, 100);

/** Lines starting with # open a section; every other line is a step. */
export function parseOutline(outline: string): { section: string; title: string }[] {
  let section = '';
  const steps: { section: string; title: string }[] = [];
  for (const raw of outline.split(/\r?\n/u)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#')) section = line.replace(/^#+\s*/u, '').slice(0, 200);
    else steps.push({ section, title: line.replace(/^(?:[-*•]|\d+[.)])\s+/u, '').slice(0, 300) });
  }
  return steps.slice(0, MAX_STEPS);
}

export function validatePathway(input: unknown): PathwayInput {
  const value = input as Record<string, unknown> | null;
  if (!value || typeof value !== 'object' || !PATHWAY_KINDS.includes(value.kind as PathwayKind)) throw new Error('invalid-request');
  return {
    ...(value.id === undefined ? {} : { id: pathwayId(value.id) }),
    name: required(value.name, 200),
    description: text(value.description ?? '', 2000),
    kind: value.kind as PathwayKind,
    ...(value.outline === undefined ? {} : { outline: text(value.outline, 20_000) }),
  };
}

export function validateItem(input: unknown): PathwayItemInput {
  const value = input as Record<string, unknown> | null;
  if (!value || typeof value !== 'object') throw new Error('invalid-request');
  const base = { pathwayId: pathwayId(value.pathwayId), section: text(value.section ?? '', 200), title: required(value.title, 500) };
  if (value.kind === 'resource') {
    if (typeof value.reference !== 'string' || !validStudyTarget(value.reference)) throw new Error('invalid-request');
    return { ...base, kind: 'resource', reference: value.reference };
  }
  if (value.kind !== 'link') throw new Error('invalid-request');
  let url: URL;
  try { url = new URL(required(value.url, 2000)); } catch { throw new Error('invalid-request'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('invalid-request');
  return { ...base, kind: 'link', url: url.href };
}

export function validateTemplate(input: unknown): Omit<PathwayTemplate, 'id'> {
  const value = input as Record<string, unknown> | null;
  if (!value || typeof value !== 'object' || !PATHWAY_KINDS.includes(value.kind as PathwayKind)) throw new Error('invalid-request');
  const outline = required(value.outline, 20_000);
  if (!parseOutline(outline).length) throw new Error('invalid-request');
  return { name: required(value.name, 200), kind: value.kind as PathwayKind, outline };
}
