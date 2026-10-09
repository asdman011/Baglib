/**
 * Baglib — Knowledge Domain Types
 */

export interface PageNotePayload {
  id: string;
  bookId: string;
  pageNumber: number;
  content: string;
  createdAt?: string;
}

export interface PageNoteDTO {
  id: string;
  bookId: string;
  pageNumber: number;
  content: string;
  createdAt: string;
}
