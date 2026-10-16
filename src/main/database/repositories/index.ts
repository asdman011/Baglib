/**
 * Baglib — Repositories Entry Point
 */

export * from './work.repository';
export * from './category.repository';
export * from './tag.repository';
export * from './knowledge.repository';
export * from './annotation.repository';
export * from './content-fts.repository';
export * from './audiobook.repository';
export * from './reading-statistics.repository';
export * from './settings.repository';

// Explicitly re-export repository contracts and types to avoid naming collisions
export type {
  IWorkRepository,
  ICategoryRepository,
  ITagRepository,
  IKnowledgeRepository,
  BookItem,
  CategoryNode,
  CategoryBreadcrumb,
} from '../../../shared/types/repository';

