/**
 * Baglib — Tag Domain Types
 */

export interface Tag {
  id: string;
  name: string;
  origin?: 'manual' | 'calibre' | 'import' | 'ai';
  category?: string | null;
}

export interface TagWithCount extends Tag {
  workCount: number;
}

export interface TagCreateInput {
  name: string;
  origin?: 'manual' | 'calibre' | 'import' | 'ai';
  category?: string | null;
}

export interface TagUpdateInput {
  id: string;
  name: string;
}

export interface TagMergeInput {
  sourceTagId: string;
  targetTagId: string;
}
