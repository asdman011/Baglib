export interface Work {
  id: string;
  workTypeId: string;
  title: string;
  originalLanguage?: string;
  description?: string;
  externalRef?: string;
  createdAt: string;
  primaryCategoryId: string | null;
}

export interface WorkDTO extends Work {
  primaryCategory?: {
    id: string;
    nameAr: string;
    nameEn: string;
  } | null;
}
