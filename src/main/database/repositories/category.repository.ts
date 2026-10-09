import type { Database } from 'better-sqlite3';
import { getDatabase } from '../connection';
import type { Category, CategoryNode, CategoryBreadcrumb } from '../../../shared/types/category';
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
    return Promise.resolve(rows.map(r => r.id));
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

  public async getCategoryTree(): Promise<CategoryNode[]> {
    const db = this.getDb();
    const categories = db.prepare(`
      SELECT id, parent_id as parentId, name_ar as nameAr, name_en as nameEn, display_order as displayOrder, created_at as createdAt
      FROM category
      ORDER BY display_order ASC
    `).all() as Category[];

    const map = new Map<string, CategoryNode>();
    const roots: CategoryNode[] = [];

    for (const cat of categories) {
      map.set(cat.id, { ...cat, children: [] });
    }

    for (const node of map.values()) {
      if (node.parentId) {
        const parent = map.get(node.parentId);
        if (parent) {
          parent.children.push(node);
        }
      } else {
        roots.push(node);
      }
    }

    return Promise.resolve(roots);
  }
}

export { SqliteCategoryRepository as CategoryRepository };
export const categoryRepository = new SqliteCategoryRepository();
