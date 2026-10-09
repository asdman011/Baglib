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
}

export interface CategoryBreadcrumb {
  id: string;
  nameAr: string;
  nameEn: string;
  depth: number;
}
