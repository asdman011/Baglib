export * from '../../shared/types/work';
export * from '../../shared/types/digital-file';

export interface RssFeedItem {
  id: string;
  title: string;
  source: string; // e.g. "Inoreader - مجلة الدراسات الإسلامية"
  snippet: string;
  date: string;
  url: string;
  category: string;
}

