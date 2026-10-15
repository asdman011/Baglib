import type { Database } from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { getDatabase } from '../connection';
import type {
  Category,
  CategoryNode,
  CategoryBreadcrumb,
  CategoryCreateInput,
  CategoryUpdateInput,
  CategoryDeleteStrategy,
} from '../../../shared/types/category';
import type { ICategoryRepository } from '../../../shared/types/repository';

export class SqliteCategoryRepository implements ICategoryRepository {
  constructor(private db?: Database) {}

  private getDb(): Database {
    return this.db ?? getDatabase();
  }

  public async getSubtreeWorkIds(categoryId: string): Promise<string[]> {
    const db = this.getDb();
    const query = `
      WITH RECURSIVE subcategories AS (
        SELECT id FROM category WHERE id = ?
        UNION ALL
        SELECT c.id FROM category c
        JOIN subcategories sc ON c.parent_id = sc.id
      )
      SELECT w.id FROM work w
      WHERE w.primary_category_id IN (SELECT id FROM subcategories);
    `;
    const rows = db.prepare(query).all(categoryId) as { id: string }[];
    return Promise.resolve(rows.map((r) => r.id));
  }

  public async getBreadcrumbs(categoryId: string): Promise<CategoryBreadcrumb[]> {
    const db = this.getDb();
    const query = `
      WITH RECURSIVE breadcrumbs AS (
        SELECT id, parent_id, name_ar, name_en, 0 as depth
        FROM category WHERE id = ?
        UNION ALL
        SELECT c.id, c.parent_id, c.name_ar, c.name_en, b.depth + 1
        FROM category c
        JOIN breadcrumbs b ON c.id = b.parent_id
      )
      SELECT id, name_ar as nameAr, name_en as nameEn, depth
      FROM breadcrumbs
      ORDER BY depth DESC;
    `;
    return Promise.resolve(db.prepare(query).all(categoryId) as CategoryBreadcrumb[]);
  }

  public getCategoryById(id: string): Category | null {
    const db = this.getDb();
    const row = db.prepare(`
      SELECT 
        id, 
        parent_id as parentId, 
        name_ar as nameAr, 
        name_en as nameEn, 
        display_order as displayOrder, 
        created_at as createdAt
      FROM category
      WHERE id = ?
    `).get(id) as Category | undefined;

    return row || null;
  }

  public getAllCategories(): Category[] {
    const db = this.getDb();
    return db.prepare(`
      SELECT 
        id, 
        parent_id as parentId, 
        name_ar as nameAr, 
        name_en as nameEn, 
        display_order as displayOrder, 
        created_at as createdAt
      FROM category
      ORDER BY display_order ASC, name_ar ASC
    `).all() as Category[];
  }

  public async getCategoryTree(options?: { includeCounts?: boolean }): Promise<CategoryNode[]> {
    const db = this.getDb();
    const categories = db.prepare(`
      SELECT 
        id, 
        parent_id as parentId, 
        name_ar as nameAr, 
        name_en as nameEn, 
        display_order as displayOrder, 
        created_at as createdAt
      FROM category
      ORDER BY display_order ASC
    `).all() as Category[];

    // Fetch direct counts if requested
    const directCounts = new Map<string, number>();
    if (options?.includeCounts) {
      try {
        const countRows = db.prepare(`
          SELECT primary_category_id as catId, COUNT(*) as cnt
          FROM work
          WHERE primary_category_id IS NOT NULL
          GROUP BY primary_category_id
        `).all() as { catId: string; cnt: number }[];

        for (const row of countRows) {
          directCounts.set(row.catId, row.cnt);
        }
      } catch {
        // Fallback gracefully if work table is missing
      }
    }

    const map = new Map<string, CategoryNode>();
    const roots: CategoryNode[] = [];

    for (const cat of categories) {
      const direct = directCounts.get(cat.id) || 0;
      map.set(cat.id, {
        ...cat,
        children: [],
        directWorkCount: direct,
        totalWorkCount: direct,
      });
    }

    for (const node of map.values()) {
      if (node.parentId) {
        const parent = map.get(node.parentId);
        if (parent) {
          parent.children.push(node);
        } else {
          // Parent doesn't exist, treat as root
          roots.push(node);
        }
      } else {
        roots.push(node);
      }
    }

    // Recursively calculate totalWorkCount (direct + all descendants)
    const computeTotal = (node: CategoryNode): number => {
      let sum = node.directWorkCount || 0;
      for (const child of node.children) {
        sum += computeTotal(child);
      }
      node.totalWorkCount = sum;
      return sum;
    };

    for (const root of roots) {
      computeTotal(root);
    }

    return Promise.resolve(roots);
  }

  public createCategory(input: CategoryCreateInput): Category {
    const db = this.getDb();
    const id = randomUUID();
    const nameAr = (input.nameAr || '').trim();
    const nameEn = (input.nameEn || '').trim() || nameAr;
    const parentId = input.parentId || null;

    if (!nameAr && !nameEn) {
      throw new Error('Category name cannot be empty');
    }

    // Calculate display order if not specified
    let displayOrder = input.displayOrder;
    if (displayOrder === undefined || displayOrder === null) {
      const maxRow = db.prepare(`
        SELECT COALESCE(MAX(display_order), 0) as maxOrder 
        FROM category 
        WHERE ${parentId ? 'parent_id = ?' : 'parent_id IS NULL'}
      `).get(...(parentId ? [parentId] : [])) as { maxOrder: number };
      displayOrder = (maxRow?.maxOrder || 0) + 1;
    }

    db.prepare(`
      INSERT INTO category (id, parent_id, name_ar, name_en, display_order, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(id, parentId, nameAr, nameEn, displayOrder);

    return this.getCategoryById(id)!;
  }

  public updateCategory(id: string, input: CategoryUpdateInput): Category {
    const db = this.getDb();
    const existing = this.getCategoryById(id);
    if (!existing) {
      throw new Error(`Category with ID ${id} not found`);
    }

    // Circular parent check if changing parent
    if (input.parentId !== undefined && input.parentId !== null) {
      if (input.parentId === id) {
        throw new Error('Category cannot be its own parent');
      }

      // Check if candidate parent is a descendant of this category
      const descendantQuery = `
        WITH RECURSIVE descendants AS (
          SELECT id FROM category WHERE parent_id = ?
          UNION ALL
          SELECT c.id FROM category c
          JOIN descendants d ON c.parent_id = d.id
        )
        SELECT id FROM descendants WHERE id = ?;
      `;
      const isDescendant = db.prepare(descendantQuery).get(id, input.parentId);
      if (isDescendant) {
        throw new Error('Cannot set parent to a descendant category (circular reference)');
      }
    }

    const nameAr = input.nameAr !== undefined ? input.nameAr.trim() : existing.nameAr;
    const nameEn = input.nameEn !== undefined ? input.nameEn.trim() : existing.nameEn;
    const parentId = input.parentId !== undefined ? input.parentId : existing.parentId;
    const displayOrder = input.displayOrder !== undefined ? input.displayOrder : existing.displayOrder;

    db.prepare(`
      UPDATE category
      SET name_ar = ?, name_en = ?, parent_id = ?, display_order = ?
      WHERE id = ?
    `).run(nameAr, nameEn, parentId, displayOrder, id);

    return this.getCategoryById(id)!;
  }

  public deleteCategory(
    id: string,
    strategy: CategoryDeleteStrategy = 'orphan',
    reassignToId?: string
  ): boolean {
    const db = this.getDb();
    const category = this.getCategoryById(id);
    if (!category) return false;

    return db.transaction(() => {
      // 1. Handle associated works
      if (strategy === 'reassign' && reassignToId) {
        db.prepare(`
          UPDATE work 
          SET primary_category_id = ? 
          WHERE primary_category_id = ?
        `).run(reassignToId, id);
      } else {
        // orphan or cascade: nullify work category pointer
        db.prepare(`
          UPDATE work 
          SET primary_category_id = NULL 
          WHERE primary_category_id = ?
        `).run(id);
      }

      // 2. Handle child subcategories
      if (strategy === 'cascade') {
        // Recursive delete children
        const childIds = db.prepare(`SELECT id FROM category WHERE parent_id = ?`).all(id) as { id: string }[];
        for (const child of childIds) {
          this.deleteCategory(child.id, 'cascade');
        }
      } else if (strategy === 'reassign' && reassignToId) {
        // Re-parent children to reassign target
        db.prepare(`
          UPDATE category 
          SET parent_id = ? 
          WHERE parent_id = ?
        `).run(reassignToId, id);
      } else {
        // Orphan: Re-parent children to current category's parent (grandparent)
        db.prepare(`
          UPDATE category 
          SET parent_id = ? 
          WHERE parent_id = ?
        `).run(category.parentId, id);
      }

      // 3. Delete category itself
      const result = db.prepare(`DELETE FROM category WHERE id = ?`).run(id);
      return result.changes > 0;
    })();
  }

  public reorderCategories(orderedIds: string[]): boolean {
    const db = this.getDb();
    return db.transaction(() => {
      const stmt = db.prepare(`UPDATE category SET display_order = ? WHERE id = ?`);
      orderedIds.forEach((id, index) => {
        stmt.run(index + 1, id);
      });
      return true;
    })();
  }
}

export { SqliteCategoryRepository as CategoryRepository };
export const categoryRepository = new SqliteCategoryRepository();
