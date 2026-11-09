import type { Database } from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { StudyPlannerRepository } from '../database/repositories/study-planner.repository';
import { SqliteSettingsRepository } from '../database/repositories/settings.repository';
import { parseOutline, type Pathway, type PathwayDetail, type PathwayInput, type PathwayItem, type PathwayItemInput, type PathwayTemplate, type ReferenceFormat } from '../../shared/pathways';

const TEMPLATES_KEY = 'pathways.templates.v1';
const KINDS = `c.collection_type IN ('research','curriculum')`;
const LIST = `SELECT c.id, c.name, COALESCE(c.description,'') AS description, c.collection_type AS kind,
    COUNT(CASE WHEN i.kind='step' AND COALESCE(t.status,'open')<>'cancelled' THEN 1 END) AS steps,
    COUNT(CASE WHEN t.status='completed' THEN 1 END) AS done,
    COUNT(CASE WHEN i.kind<>'step' THEN 1 END) AS resources
  FROM collection c LEFT JOIN pathway_item i ON i.collection_id=c.id
  LEFT JOIN study_task t ON i.kind='step' AND i.reference='task:'||t.id
  WHERE ${KINDS}`;

interface ItemRow { id: string; collection_id: string; section: string; kind: PathwayItem['kind']; reference: string | null; title: string; url: string | null; pinned: number; sort_order: number; created_at: string; status: string | null }
const decode = (row: ItemRow): PathwayItem => ({ id: row.id, pathwayId: row.collection_id, section: row.section, kind: row.kind, reference: row.reference, title: row.title, url: row.url, pinned: row.pinned === 1, sortOrder: row.sort_order, createdAt: row.created_at, done: row.status === 'completed' });

interface Citation { key: string; title: string; author?: string; publisher?: string; year?: number; url?: string; note?: string }
const braces = (value: string) => value.replace(/[\\{}]/gu, ' ').replace(/\s+/gu, ' ').trim();
const bibtex = (items: Citation[]) => items.map(item => {
  const fields = [['title', item.title], ['author', item.author], ['publisher', item.publisher], ['year', item.year?.toString()], ['url', item.url], ['note', item.note]]
    .filter(([, value]) => value).map(([name, value]) => `  ${name} = {${braces(value!)}}`);
  return `@${item.url ? 'online' : item.author || item.publisher ? 'book' : 'misc'}{${item.key},\n${fields.join(',\n')}\n}`;
}).join('\n\n');
const markdown = (name: string, items: Citation[]) => [`# ${name}`, '', ...items.map(item => `- ${[item.author, item.title, item.publisher, item.year, item.note].filter(Boolean).join('. ')}${item.url ? ` <${item.url}>` : ''}`)].join('\n');

/** Bibliography text. Citation fields are copied as stored, so titles keep their spelling. */
export function referenceText(name: string, items: Citation[], format: ReferenceFormat): string {
  return `${format === 'bibtex' ? bibtex(items) : markdown(name, items)}\n`;
}

/** A pathway is a typed `collection`; its steps are planner tasks, so status has one owner. See ADR-009. */
export class PathwayService {
  private planner: StudyPlannerRepository;
  private settings: SqliteSettingsRepository;
  constructor(private db: Database) { this.planner = new StudyPlannerRepository(db); this.settings = new SqliteSettingsRepository(db); }

  list(): Pathway[] { return this.db.prepare(`${LIST} GROUP BY c.id ORDER BY c.name`).all() as Pathway[]; }

  get(id: string): PathwayDetail {
    const pathway = this.db.prepare(`${LIST} AND c.id=? GROUP BY c.id`).get(id) as Pathway | undefined;
    if (!pathway) throw new Error('invalid-request');
    const rows = this.db.prepare(`SELECT i.*, t.status FROM pathway_item i LEFT JOIN study_task t ON i.kind='step' AND i.reference='task:'||t.id
      WHERE i.collection_id=? ORDER BY i.sort_order, i.created_at, i.id`).all(id) as ItemRow[];
    return { ...pathway, items: rows.map(decode) };
  }

  private nextOrder(id: string): number {
    return (this.db.prepare('SELECT COALESCE(MAX(sort_order),-1)+1 AS next FROM pathway_item WHERE collection_id=?').get(id) as { next: number }).next;
  }
  private insert(id: string, kind: PathwayItem['kind'], section: string, title: string, reference: string | null, url: string | null): PathwayItem {
    const item = randomUUID();
    this.db.prepare('INSERT INTO pathway_item (id,collection_id,section,kind,reference,title,url,sort_order,created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(item, id, section, kind, reference, title, url, this.nextOrder(id), new Date().toISOString());
    return decode({ ...(this.db.prepare('SELECT * FROM pathway_item WHERE id=?').get(item) as Omit<ItemRow, 'status'>), status: null });
  }
  private task(title: string) {
    return this.planner.save({ title, description: '', status: 'open', startDate: null, dueDate: null, priority: 0, sortOrder: 0, references: [] });
  }
  private assertPathway(id: string): void {
    if (!this.db.prepare(`SELECT 1 FROM collection c WHERE c.id=? AND ${KINDS}`).get(id)) throw new Error('invalid-request');
  }

  save(input: PathwayInput): Pathway {
    return this.db.transaction(() => {
      const id = input.id ?? randomUUID();
      if (input.id) {
        this.assertPathway(id);
        this.db.prepare('UPDATE collection SET name=?, description=? WHERE id=?').run(input.name, input.description, id);
      } else {
        this.db.prepare('INSERT INTO collection (id,name,description,collection_type) VALUES (?,?,?,?)').run(id, input.name, input.description, input.kind);
        for (const step of parseOutline(input.outline ?? '')) this.addStep(id, step.section, step.title);
      }
      return this.db.prepare(`${LIST} AND c.id=? GROUP BY c.id`).get(id) as Pathway;
    })();
  }

  /** Planner tasks stay, since they may already carry dates and links. */
  remove(id: string): void {
    this.assertPathway(id);
    this.db.prepare('DELETE FROM collection WHERE id=?').run(id);
    this.settings.delete(`pathways.prerequisites.v1:${id}`);
    this.settings.delete(`pathways.prerequisites.dismissed.v1:${id}`);
    this.settings.delete(`pathways.exam.v1:${id}`);
  }

  addItem(input: PathwayItemInput): PathwayItem {
    this.assertPathway(input.pathwayId);
    return this.insert(input.pathwayId, input.kind, input.section, input.title, input.reference ?? null, input.url ?? null);
  }
  addStep(id: string, section: string, title: string): PathwayItem {
    this.assertPathway(id);
    return this.db.transaction(() => this.insert(id, 'step', section, title, `task:${this.task(title).id}`, null))();
  }
  removeItem(id: string): void { this.db.prepare('DELETE FROM pathway_item WHERE id=?').run(id); }
  setPinned(id: string, pinned: boolean): void { this.db.prepare('UPDATE pathway_item SET pinned=? WHERE id=?').run(pinned ? 1 : 0, id); }

  /** The planner row is the status. A task removed in the planner is made again for this step. */
  setDone(id: string, done: boolean): void {
    this.db.transaction(() => {
      const item = this.db.prepare(`SELECT * FROM pathway_item WHERE id=? AND kind='step'`).get(id) as ItemRow | undefined;
      if (!item) throw new Error('invalid-request');
      let task = this.planner.list().find(row => `task:${row.id}` === item.reference);
      if (!task) {
        task = this.task(item.title);
        this.db.prepare('UPDATE pathway_item SET reference=? WHERE id=?').run(`task:${task.id}`, id);
      }
      this.planner.save({ id: task.id, expectedUpdatedAt: task.updatedAt, title: task.title, description: task.description, status: done ? 'completed' : 'open', startDate: task.startDate, dueDate: task.dueDate, priority: task.priority, sortOrder: task.sortOrder, references: task.references });
    })();
  }

  reorder(id: string, ids: string[]): void {
    this.db.transaction(() => {
      const current = (this.db.prepare('SELECT id FROM pathway_item WHERE collection_id=?').all(id) as { id: string }[]).map(row => row.id);
      if (current.length !== ids.length || new Set(ids).size !== ids.length || ids.some(item => !current.includes(item))) throw new Error('invalid-request');
      const update = this.db.prepare('UPDATE pathway_item SET sort_order=? WHERE id=?');
      ids.forEach((item, order) => update.run(order, item));
    })();
  }

  private citations(id: string): Citation[] {
    const book = this.db.prepare(`SELECT w.title, (SELECT GROUP_CONCAT(a.name, ' and ') FROM work_author j JOIN author a ON a.id=j.author_id WHERE j.work_id=w.id) AS author,
      e.publisher, e.publication_year AS year FROM work w LEFT JOIN edition e ON e.work_id=w.id WHERE w.id=? LIMIT 1`);
    return this.get(id).items.filter(item => item.kind !== 'step' && !item.reference?.startsWith('note:')).map((item, index) => {
      const key = `baglib${index + 1}`;
      if (item.kind === 'link') return { key, title: item.title, url: item.url! };
      if (!item.reference!.startsWith('book:')) return { key, title: item.title, note: item.reference! };
      const row = book.get(item.reference!.slice(5)) as { title: string; author: string | null; publisher: string | null; year: number | null } | undefined;
      return { key, title: row?.title ?? item.title, author: row?.author ?? undefined, publisher: row?.publisher ?? undefined, year: row?.year ?? undefined };
    });
  }
  exportText(id: string, format: ReferenceFormat): { name: string; text: string } {
    const { name } = this.get(id);
    return { name, text: referenceText(name, this.citations(id), format) };
  }

  templates(): PathwayTemplate[] { return this.settings.get<PathwayTemplate[]>(TEMPLATES_KEY) ?? []; }
  saveTemplate(input: Omit<PathwayTemplate, 'id'>): PathwayTemplate {
    const template = { ...input, id: randomUUID() };
    this.settings.set(TEMPLATES_KEY, [...this.templates(), template]);
    return template;
  }
  removeTemplate(id: string): void { this.settings.set(TEMPLATES_KEY, this.templates().filter(template => template.id !== id)); }
}
