/**
 * Baglib — Hierarchical Category Domain Types
 */

export interface Category {
  id: string;
  parentId: string | null;
  nameAr: string;
  nameEn: string;
  displayOrder: number;
  createdAt: string;
}

export interface CategoryNode extends Category {
  children: CategoryNode[];
  directWorkCount?: number;
  totalWorkCount?: number;
}

export interface CategoryBreadcrumb {
  id: string;
  nameAr: string;
  nameEn: string;
  depth: number;
}

export interface CategoryCreateInput {
  nameAr: string;
  nameEn?: string;
  parentId?: string | null;
  displayOrder?: number;
}


export interface CategoryUpdateInput {
  nameAr?: string;
  nameEn?: string;
  parentId?: string | null;
  displayOrder?: number;
}

export type CategoryDeleteStrategy = 'orphan' | 'reassign' | 'cascade';

export interface CategoryDeleteInput {
  categoryId: string;
  strategy: CategoryDeleteStrategy;
  reassignToCategoryId?: string;
}

export interface CategoryReorderInput {
  categoryIds: string[];
}
