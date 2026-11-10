import { parseOutline, type PathwayInput, type PathwayItem, type PathwayKind, type PathwayTemplate } from './pathways';

/**
 * Pure helpers for the Research space (KEY-306): copying a template into a pathway, turning a pathway back into a
 * personal template, and the progress model behind the list, the header and the "continue" action.
 * Nothing here touches storage; personal templates stay in the existing `pathways.templates.v1` setting (ADR-009).
 */

export type PathwayTab = 'all' | 'research' | 'curriculum' | 'templates';
export const PATHWAY_TABS: readonly PathwayTab[] = ['all', 'research', 'curriculum', 'templates'];

/** Which list a tab shows. The templates tab keeps the full list at the start of the layout. */
export function tabMatches(tab: PathwayTab, kind: PathwayKind): boolean {
  return tab === 'all' || tab === 'templates' || tab === kind;
}

export interface TemplateOutlineSummary { steps: number; sections: string[] }

/** What a template card shows: how many steps it has and which headings it opens. */
export function summarizeOutline(outline: string): TemplateOutlineSummary {
  const steps = parseOutline(outline);
  return { steps: steps.length, sections: [...new Set(steps.map(step => step.section).filter(Boolean))] };
}

/** "Create from template": the exact input the existing save call needs. The template itself is never changed. */
export function copyTemplate(template: Pick<PathwayTemplate, 'name' | 'kind' | 'outline'>, name?: string): PathwayInput {
  const cleaned = (name ?? '').trim() || template.name.trim();
  if (!cleaned || !parseOutline(template.outline).length) throw new Error('invalid-request');
  return { name: cleaned.slice(0, 200), description: '', kind: template.kind, outline: template.outline };
}

const oneLine = (value: string, max: number) => value.replace(/\s+/gu, ' ').replace(/^(?:#+|[-*•]|\d+[.)])\s*/u, '').trim().slice(0, max);

/** Steps only, grouped under their section heading in order of first appearance. The result parses back to the same steps. */
export function outlineFromItems(items: Pick<PathwayItem, 'section' | 'kind' | 'title'>[]): string {
  const groups = new Map<string, string[]>();
  for (const item of items) {
    if (item.kind !== 'step') continue;
    const title = oneLine(item.title, 300);
    if (!title) continue;
    const section = oneLine(item.section, 200);
    groups.set(section, [...(groups.get(section) ?? []), title]);
  }
  return [...groups].flatMap(([section, titles]) => [...(section ? [`# ${section}`] : []), ...titles]).join('\n');
}

/** "Save as my template": structure only. Resources, links, pins and progress are not part of a template. */
export function templateFromPathway(pathway: { name: string; kind: PathwayKind; items: Pick<PathwayItem, 'section' | 'kind' | 'title'>[] }): Omit<PathwayTemplate, 'id'> {
  const outline = outlineFromItems(pathway.items);
  const name = pathway.name.trim().slice(0, 200);
  if (!name || !parseOutline(outline).length) throw new Error('invalid-request');
  return { name, kind: pathway.kind, outline };
}

export interface SectionProgress { section: string; done: number; total: number }
export interface PathwayProgress {
  done: number;
  total: number;
  /** Whole percent, 0 when there are no steps. */
  percent: number;
  complete: boolean;
  sections: SectionProgress[];
  /** First step that is not done, in pathway order. */
  next: PathwayItem | null;
  /** The source the next step opens: a book, note, ayah or hadith, else an external link. */
  target: PathwayItem | null;
}

export const percentOf = (done: number, total: number): number => (total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0);

/** Notes and links go to the end column; steps and the other sources stay in the ordered middle. */
export function placeItem(item: Pick<PathwayItem, 'kind' | 'reference'>): 'middle' | 'end' {
  return item.kind === 'link' || item.reference?.startsWith('note:') ? 'end' : 'middle';
}

/** A source in the next step's own section wins, then any source in the pathway; links come last. */
export function nextTarget(items: PathwayItem[], next: PathwayItem | null): PathwayItem | null {
  if (!next) return null;
  const openable = items.filter(item => item.kind !== 'step' && (item.reference || item.url));
  const rank = (item: PathwayItem) => (item.reference ? 0 : 2) + (item.section === next.section ? 0 : 1);
  return [...openable].sort((a, b) => rank(a) - rank(b))[0] ?? null;
}

export function pathwayProgress(items: PathwayItem[]): PathwayProgress {
  const ordered = [...items].sort((a, b) => a.sortOrder - b.sortOrder);
  const steps = ordered.filter(item => item.kind === 'step');
  const done = steps.filter(item => item.done).length;
  const sections = new Map<string, SectionProgress>();
  for (const step of steps) {
    const entry = sections.get(step.section) ?? { section: step.section, done: 0, total: 0 };
    entry.total += 1;
    if (step.done) entry.done += 1;
    sections.set(step.section, entry);
  }
  const next = steps.find(step => !step.done) ?? null;
  return { done, total: steps.length, percent: percentOf(done, steps.length), complete: steps.length > 0 && done === steps.length, sections: [...sections.values()], next, target: nextTarget(ordered, next) };
}
