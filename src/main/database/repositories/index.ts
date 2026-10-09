/**
 * Baglib — Repositories Entry Point
 */

export * from './work.repository';
export * from './category.repository';
export * from './knowledge.repository';

// Explicitly re-export repository contracts and types to avoid naming collisions
export type {
  IWorkRepository,
  ICategoryRepository,
  IKnowledgeRepository,
  BookItem,
  CategoryNode,
  CategoryBreadcrumb,
} from '../../../shared/types/repository';
