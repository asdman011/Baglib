/**
 * Baglib — personal lists service (KEY-386). Starred plus custom lists of books, ayahs, hadith and
 * poems; ordered lists and items; membership for list chips; any/all filters for every section.
 */

import type { Database } from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import {
  PERSONAL_LIST_KINDS,
  STARRED_LIST_ID,
  canonicalItemRef,
  cleanItemLabel,
  cleanListName,
  isListItemKind,
  type ListFilterMode,
  type PersonalList,
  type PersonalListItem,
  type PersonalListItemKind,
} from '../../shared/personal-lists';

interface ListRow { id: string; name: string; kind: 'starred' | 'custom'; position: number; created_at: string; updated_at: string }
interface ItemRow { id: string; list_id: string; item_kind: PersonalListItemKind; item_ref: string; label: string; position: number; added_at: string }

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/u;
const MAX_REFS = 5000;

const invalid = (): never => {
  throw new Error('invalid-request');
};

const toItem = (r: ItemRow): PersonalListItem => ({ id: r.id, listId: r.list_id, itemKind: r.item_kind, itemRef: r.item_ref, label: r.label, position: r.position, addedAt: r.added_at });

export class PersonalListsService {
  constructor(private readonly db: Database) {}

  private now(): string {
    return new Date().toISOString();
  }

  private list(id: unknown): ListRow {
    if (typeof id !== 'string' || !SAFE_ID.test(id)) invalid();
    const row = this.db.prepare('SELECT * FROM personal_list WHERE id = ?').get(id) as ListRow | undefined;
    if (!row) throw new Error('not-found');
    return row;
  }

  private item(kind: unknown, ref: unknown): { kind: PersonalListItemKind; ref: string } {
    if (!isListItemKind(kind)) return invalid();
    const canonical = canonicalItemRef(kind, ref);
    if (!canonical) return invalid();
    return { kind, ref: canonical };
  }

  /** Every list, Starred first, then in the user's order, with item counts by kind. */
  all(): PersonalList[] {
    const rows = this.db.prepare("SELECT * FROM personal_list ORDER BY kind = 'starred' DESC, position, created_at").all() as ListRow[];
    const counts = this.db.prepare('SELECT list_id, item_kind, COUNT(*) AS n FROM personal_list_item GROUP BY list_id, item_kind').all() as { list_id: string; item_kind: PersonalListItemKind; n: number }[];
    const byList = new Map<string, Record<PersonalListItemKind, number>>();
    for (const c of counts) {
      const entry = byList.get(c.list_id) ?? (Object.fromEntries(PERSONAL_LIST_KINDS.map(k => [k, 0])) as Record<PersonalListItemKind, number>);
      entry[c.item_kind] = c.n;
      byList.set(c.list_id, entry);
    }
    const empty = () => Object.fromEntries(PERSONAL_LIST_KINDS.map(k => [k, 0])) as Record<PersonalListItemKind, number>;
    return rows.map(r => ({ id: r.id, name: r.name, kind: r.kind, position: r.position, createdAt: r.created_at, updatedAt: r.updated_at, counts: byList.get(r.id) ?? empty() }));
  }

  create(name: unknown): PersonalList {
    const clean = cleanListName(name) ?? invalid();
    const id = randomUUID();
    const now = this.now();
    const next = (this.db.prepare("SELECT COALESCE(MAX(position), 0) + 1 AS p FROM personal_list WHERE kind = 'custom'").get() as { p: number }).p;
    this.db.prepare("INSERT INTO personal_list (id, name, kind, position, created_at, updated_at) VALUES (?, ?, 'custom', ?, ?, ?)").run(id, clean, next, now, now);
    return this.all().find(l => l.id === id)!;
  }

  rename(id: unknown, name: unknown): void {
    const row = this.list(id);
    if (row.kind === 'starred') invalid();
    const clean = cleanListName(name) ?? invalid();
    this.db.prepare('UPDATE personal_list SET name = ?, updated_at = ? WHERE id = ?').run(clean, this.now(), row.id);
  }

  remove(id: unknown): void {
    const row = this.list(id);
    if (row.kind === 'starred') invalid();
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM personal_list_item WHERE list_id = ?').run(row.id);
      this.db.prepare('DELETE FROM personal_list WHERE id = ?').run(row.id);
    })();
  }

  /** Reorders the custom lists; Starred always stays first. Unknown ids are refused. */
  reorder(ids: unknown): void {
    if (!Array.isArray(ids) || ids.length > 1000) invalid();
    const custom = (this.db.prepare("SELECT id FROM personal_list WHERE kind = 'custom'").all() as { id: string }[]).map(r => r.id);
    const known = new Set(custom);
    const order = (ids as unknown[]).filter((id): id is string => typeof id === 'string' && known.has(id));
    if (new Set(order).size !== order.length) invalid();
    const rest = custom.filter(id => !order.includes(id));
    const update = this.db.prepare('UPDATE personal_list SET position = ? WHERE id = ?');
    this.db.transaction(() => [...order, ...rest].forEach((id, i) => update.run(i + 1, id)))();
  }

  items(listId: unknown, kind?: unknown): PersonalListItem[] {
    const row = this.list(listId);
    if (kind !== undefined && kind !== null && !isListItemKind(kind)) invalid();
    const rows = (kind
      ? this.db.prepare('SELECT * FROM personal_list_item WHERE list_id = ? AND item_kind = ? ORDER BY position, added_at').all(row.id, kind)
      : this.db.prepare('SELECT * FROM personal_list_item WHERE list_id = ? ORDER BY position, added_at').all(row.id)) as ItemRow[];
    return rows.map(toItem);
  }

  /** Adds an item at the end of the list; adding it again keeps its place and refreshes its label. */
  add(listId: unknown, input: { itemKind?: unknown; itemRef?: unknown; label?: unknown } | null | undefined): PersonalListItem {
    const row = this.list(listId);
    const { kind, ref } = this.item(input?.itemKind, input?.itemRef);
    const label = cleanItemLabel(input?.label);
    const existing = this.db.prepare('SELECT * FROM personal_list_item WHERE list_id = ? AND item_kind = ? AND item_ref = ?').get(row.id, kind, ref) as ItemRow | undefined;
    if (existing) {
      if (label && label !== existing.label) this.db.prepare('UPDATE personal_list_item SET label = ? WHERE id = ?').run(label, existing.id);
      return toItem({ ...existing, label: label || existing.label });
    }
    const id = randomUUID();
    const now = this.now();
    const next = (this.db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM personal_list_item WHERE list_id = ?').get(row.id) as { p: number }).p;
    this.db.transaction(() => {
      this.db.prepare('INSERT INTO personal_list_item (id, list_id, item_kind, item_ref, label, position, added_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, row.id, kind, ref, label, next, now);
      this.db.prepare('UPDATE personal_list SET updated_at = ? WHERE id = ?').run(now, row.id);
    })();
    return { id, listId: row.id, itemKind: kind, itemRef: ref, label, position: next, addedAt: now };
  }

  removeItem(listId: unknown, itemKind: unknown, itemRef: unknown): void {
    const row = this.list(listId);
    const { kind, ref } = this.item(itemKind, itemRef);
    this.db.prepare('DELETE FROM personal_list_item WHERE list_id = ? AND item_kind = ? AND item_ref = ?').run(row.id, kind, ref);
  }

  reorderItems(listId: unknown, itemIds: unknown): void {
    const row = this.list(listId);
    if (!Array.isArray(itemIds) || itemIds.length > MAX_REFS) invalid();
    const current = (this.db.prepare('SELECT id FROM personal_list_item WHERE list_id = ? ORDER BY position, added_at').all(row.id) as { id: string }[]).map(r => r.id);
    const known = new Set(current);
    const order = (itemIds as unknown[]).filter((id): id is string => typeof id === 'string' && known.has(id));
    if (new Set(order).size !== order.length) invalid();
    const rest = current.filter(id => !order.includes(id));
    const update = this.db.prepare('UPDATE personal_list_item SET position = ? WHERE id = ?');
    this.db.transaction(() => [...order, ...rest].forEach((id, i) => update.run(i + 1, id)))();
  }

  /** Stars or unstars an item. Returns true when the item is now starred. */
  toggleStar(input: { itemKind?: unknown; itemRef?: unknown; label?: unknown } | null | undefined): boolean {
    const { kind, ref } = this.item(input?.itemKind, input?.itemRef);
    const held = this.db.prepare('SELECT 1 FROM personal_list_item WHERE list_id = ? AND item_kind = ? AND item_ref = ?').get(STARRED_LIST_ID, kind, ref);
    if (held) {
      this.removeItem(STARRED_LIST_ID, kind, ref);
      return false;
    }
    this.add(STARRED_LIST_ID, { itemKind: kind, itemRef: ref, label: input?.label });
    return true;
  }

  /** For each reference, the lists that hold it (chips). References that don't fit the kind are skipped. */
  membership(itemKind: unknown, itemRefs: unknown): Record<string, string[]> {
    if (!isListItemKind(itemKind) || !Array.isArray(itemRefs) || itemRefs.length > MAX_REFS) invalid();
    const kind = itemKind as PersonalListItemKind;
    const wanted = new Map<string, string>();
    for (const ref of itemRefs as unknown[]) {
      const canonical = canonicalItemRef(kind, ref);
      if (canonical) wanted.set(canonical, ref as string);
    }
    const out: Record<string, string[]> = {};
    if (wanted.size === 0) return out;
    const keys = [...wanted.keys()];
    for (let i = 0; i < keys.length; i += 500) {
      const chunk = keys.slice(i, i + 500);
      const rows = this.db.prepare(`
        SELECT i.item_ref, i.list_id FROM personal_list_item i JOIN personal_list l ON l.id = i.list_id
        WHERE i.item_kind = ? AND i.item_ref IN (${chunk.map(() => '?').join(',')})
        ORDER BY l.kind = 'starred' DESC, l.position, l.created_at
      `).all(kind, ...chunk) as { item_ref: string; list_id: string }[];
      for (const r of rows) (out[wanted.get(r.item_ref)!] ??= []).push(r.list_id);
    }
    return out;
  }

  /** References of this kind in any (or all) of the chosen lists, in the first chosen list's order. */
  filter(itemKind: unknown, listIds: unknown, mode: unknown): string[] {
    if (!isListItemKind(itemKind) || !Array.isArray(listIds) || listIds.length > 200) invalid();
    const ids = [...new Set((listIds as unknown[]).filter((id): id is string => typeof id === 'string' && SAFE_ID.test(id)))];
    if (ids.length === 0) return [];
    const need = (mode as ListFilterMode) === 'all' ? ids.length : 1;
    const rows = this.db.prepare(`
      SELECT item_ref, COUNT(DISTINCT list_id) AS n, MIN(CASE WHEN list_id = ? THEN position END) AS p, MIN(added_at) AS a
      FROM personal_list_item WHERE item_kind = ? AND list_id IN (${ids.map(() => '?').join(',')})
      GROUP BY item_ref HAVING n >= ? ORDER BY p IS NULL, p, a
    `).all(ids[0], itemKind, ...ids, need) as { item_ref: string }[];
    return rows.map(r => r.item_ref);
  }
}
