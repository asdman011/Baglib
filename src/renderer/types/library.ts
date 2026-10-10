export * from '../../shared/types/work';

export interface RssFeedItem {
  id: string;
  title: string;
  source: string; // e.g. "Inoreader - مجلة الدراسات الإسلامية"
  snippet: string;
  date: string;
  url: string;
  category: string;
}

