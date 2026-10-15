import type { Database } from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { getDatabase } from '../connection';
import type {
  Tag,
  TagWithCount,
  TagCreateInput,
  TagUpdateInput,
  TagMergeInput,
} from '../../../shared/types/tag';
import type { ITagRepository } from '../../../shared/types/repository';

export class SqliteTagRepository implements ITagRepository {
  constructor(private db?: Database) {}

  private getDb(): Database {
    return this.db ?? getDatabase();
  }

  /**
   * Creates a new tag or returns the existing tag if one with the same name already exists.
   */
  public createTag(name: string, category?: string): Tag {
    const trimmed = (name || '').trim();
    if (!trimmed) {
      throw new Error('Tag name cannot be empty');
    }

    const db = this.getDb();
    const existing = db.prepare('SELECT id, name, origin, category FROM tag WHERE LOWER(name) = LOWER(?)').get(trimmed) as any;
    if (existing) {
      return {
        id: existing.id,
        name: existing.name,
        origin: existing.origin || 'manual',
        category: existing.category || null,
      };
    }

    const id = randomUUID();
    const cat = category || 'subject';
    db.prepare('INSERT INTO tag (id, name, origin, category) VALUES (?, ?, ?, ?)').run(
      id,
      trimmed,
      'manual',
      cat
    );

    return {
      id,
      name: trimmed,
      origin: 'manual',
      category: cat,
    };
  }

  /**
   * Retrieves all tags with their associated work count.
   */
  public getAllTags(): TagWithCount[] {
    const db = this.getDb();
    const rows = db.prepare(`
      SELECT 
        t.id,
        t.name,
        t.origin,
        t.category,
        COUNT(DISTINCT wt.work_id) as workCount
      FROM tag t
      LEFT JOIN work_tag wt ON wt.tag_id = t.id
      GROUP BY t.id
      ORDER BY t.name COLLATE NOCASE ASC
    `).all() as any[];

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      origin: r.origin || 'manual',
      category: r.category || null,
      workCount: Number(r.workCount) || 0,
    }));
  }

  /**
   * Retrieves most popular tags sorted by work count descending.
   */
  public getPopularTags(limit: number = 20): TagWithCount[] {
    const db = this.getDb();
    const rows = db.prepare(`
      SELECT 
        t.id,
        t.name,
        t.origin,
        t.category,
        COUNT(DISTINCT wt.work_id) as workCount
      FROM tag t
      LEFT JOIN work_tag wt ON wt.tag_id = t.id
      GROUP BY t.id
      ORDER BY workCount DESC, t.name COLLATE NOCASE ASC
      LIMIT ?
    `).all(limit) as any[];

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      origin: r.origin || 'manual',
      category: r.category || null,
      workCount: Number(r.workCount) || 0,
    }));
  }

  /**
   * Renames a tag and synchronizes its occurrence in work metadata JSON.
   */
  public updateTag(id: string, name: string): Tag {
    const trimmed = (name || '').trim();
    if (!trimmed) {
      throw new Error('Tag name cannot be empty');
    }

    const db = this.getDb();
    const tag = db.prepare('SELECT id, name, origin, category FROM tag WHERE id = ?').get(id) as any;
    if (!tag) {
      throw new Error(`Tag with ID "${id}" not found`);
    }

    if (tag.name === trimmed) {
      return {
        id: tag.id,
        name: tag.name,
        origin: tag.origin || 'manual',
        category: tag.category || null,
      };
    }

    // Check if another tag already uses this name
    const collision = db.prepare('SELECT id FROM tag WHERE LOWER(name) = LOWER(?) AND id != ?').get(trimmed, id);
    if (collision) {
      throw new Error(`A tag with name "${trimmed}" already exists. Use merge instead.`);
    }

    const oldName = tag.name;

    const tx = db.transaction(() => {
      db.prepare('UPDATE tag SET name = ? WHERE id = ?').run(trimmed, id);

      // Fetch all works associated with this tag to update metadata_json
      const affectedWorks = db.prepare('SELECT work_id FROM work_tag WHERE tag_id = ?').all(id) as { work_id: string }[];
      if (affectedWorks.length > 0) {
        const selectMeta = db.prepare('SELECT metadata_json FROM work WHERE id = ?');
        const updateMeta = db.prepare('UPDATE work SET metadata_json = ? WHERE id = ?');

        for (const { work_id } of affectedWorks) {
          const row = selectMeta.get(work_id) as { metadata_json?: string } | undefined;
          if (row?.metadata_json) {
            try {
              const meta = JSON.parse(row.metadata_json);
              if (Array.isArray(meta.tags)) {
                meta.tags = meta.tags.map((t: string) => (t === oldName ? trimmed : t));
                // Remove duplicates if any
                meta.tags = Array.from(new Set(meta.tags));
                updateMeta.run(JSON.stringify(meta), work_id);
              }
            } catch {
              // Ignore corrupted metadata JSON
            }
          }
        }
      }
    });

    tx();

    return {
      id: tag.id,
      name: trimmed,
      origin: tag.origin || 'manual',
      category: tag.category || null,
    };
  }

  /**
   * Deletes a tag, removing work_tag associations and updating work metadata JSON.
   */
  public deleteTag(id: string): boolean {
    const db = this.getDb();
    const tag = db.prepare('SELECT id, name FROM tag WHERE id = ?').get(id) as { id: string; name: string } | undefined;
    if (!tag) {
      return false;
    }

    const tx = db.transaction(() => {
      const affectedWorks = db.prepare('SELECT work_id FROM work_tag WHERE tag_id = ?').all(id) as { work_id: string }[];

      // Delete relational associations
      db.prepare('DELETE FROM work_tag WHERE tag_id = ?').run(id);
      db.prepare('DELETE FROM knowledge_tag WHERE tag_id = ?').run(id);
      db.prepare('DELETE FROM tag WHERE id = ?').run(id);

      // Clean metadata_json on works
      if (affectedWorks.length > 0) {
        const selectMeta = db.prepare('SELECT metadata_json FROM work WHERE id = ?');
        const updateMeta = db.prepare('UPDATE work SET metadata_json = ? WHERE id = ?');

        for (const { work_id } of affectedWorks) {
          const row = selectMeta.get(work_id) as { metadata_json?: string } | undefined;
          if (row?.metadata_json) {
            try {
              const meta = JSON.parse(row.metadata_json);
              if (Array.isArray(meta.tags)) {
                meta.tags = meta.tags.filter((t: string) => t !== tag.name);
                updateMeta.run(JSON.stringify(meta), work_id);
              }
            } catch {
              // Ignore malformed JSON
            }
          }
        }
      }
    });

    tx();
    return true;
  }

  /**
   * Merges source tag into target tag. Re-points all work_tag links, cleans metadata, and removes source tag.
   */
  public mergeTags(sourceTagId: string, targetTagId: string): number {
    if (sourceTagId === targetTagId) {
      return 0;
    }

    const db = this.getDb();
    const sourceTag = db.prepare('SELECT id, name FROM tag WHERE id = ?').get(sourceTagId) as { id: string; name: string } | undefined;
    const targetTag = db.prepare('SELECT id, name FROM tag WHERE id = ?').get(targetTagId) as { id: string; name: string } | undefined;

    if (!sourceTag) {
      throw new Error(`Source tag with ID "${sourceTagId}" not found`);
    }
    if (!targetTag) {
      throw new Error(`Target tag with ID "${targetTagId}" not found`);
    }

    const tx = db.transaction(() => {
      // Find all works tagged with source tag
      const sourceWorks = db.prepare('SELECT work_id FROM work_tag WHERE tag_id = ?').all(sourceTagId) as { work_id: string }[];
      
      const insertWorkTag = db.prepare('INSERT OR IGNORE INTO work_tag (work_id, tag_id) VALUES (?, ?)');
      const deleteWorkTag = db.prepare('DELETE FROM work_tag WHERE tag_id = ?');
      const selectMeta = db.prepare('SELECT metadata_json FROM work WHERE id = ?');
      const updateMeta = db.prepare('UPDATE work SET metadata_json = ? WHERE id = ?');

      for (const { work_id } of sourceWorks) {
        // Link to target
        insertWorkTag.run(work_id, targetTagId);

        // Sync metadata JSON
        const row = selectMeta.get(work_id) as { metadata_json?: string } | undefined;
        if (row?.metadata_json) {
          try {
            const meta = JSON.parse(row.metadata_json);
            if (Array.isArray(meta.tags)) {
              // Replace sourceTag.name with targetTag.name
              meta.tags = meta.tags.map((t: string) => (t === sourceTag.name ? targetTag.name : t));
              meta.tags = Array.from(new Set(meta.tags));
              updateMeta.run(JSON.stringify(meta), work_id);
            }
          } catch {
            // ignore
          }
        }
      }

      // Delete all links to source tag
      deleteWorkTag.run(sourceTagId);
      db.prepare('DELETE FROM knowledge_tag WHERE tag_id = ?').run(sourceTagId);

      // Delete source tag itself
      db.prepare('DELETE FROM tag WHERE id = ?').run(sourceTagId);

      return sourceWorks.length;
    });

    return tx();
  }
}

export { SqliteTagRepository as TagRepository };
export const tagRepository = new SqliteTagRepository();

