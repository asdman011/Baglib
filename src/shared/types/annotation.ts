/**
 * Baglib — Annotation & Stylus Ink Domain Types (KEY-137)
 */

export type AnnotationType = 'highlight' | 'underline' | 'note' | 'bookmark' | 'ink';

export interface InkStrokePoint {
  x: number;
  y: number;
  pressure?: number;
  time?: number;
}

export interface InkStroke {
  id: string;
  points: InkStrokePoint[];
  color: string;
  width: number;
  tool?: 'pen' | 'highlighter';
}

export interface AnnotationDTO {
  id: string;
  bookId: string;
  type: AnnotationType;
  locationCfiOrPage: string;
  selectedText?: string | null;
  noteContent?: string | null;
  color?: string | null;
  strokeData?: InkStroke[] | null;
  tags?: string[] | null;
  createdAt: string;
  updatedAt: string;
}

export interface AnnotationPayload {
  id?: string;
  bookId: string;
  type: AnnotationType;
  locationCfiOrPage: string;
  selectedText?: string | null;
  noteContent?: string | null;
  color?: string | null;
  strokeData?: InkStroke[] | null;
  tags?: string[] | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface AnnotationFilter {
  bookId: string;
  type?: AnnotationType;
  color?: string;
  tag?: string;
  page?: string;
  searchQuery?: string;
}
