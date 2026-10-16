export interface OPDSCatalog {
  id: string;
  title: string;
  url: string;
  isBuiltIn?: boolean;
  username?: string;
  password?: string;
  authType?: 'none' | 'basic' | 'digest';
}

export interface OPDSLink {
  rel: string;
  href: string;
  type?: string;
  title?: string;
}

export interface OPDSEntry {
  id: string;
  title: string;
  authors?: string[];
  summary?: string;
  content?: string;
  updated?: string;
  published?: string;
  language?: string;
  publisher?: string;
  categories?: string[];
  coverUrl?: string;
  thumbnailUrl?: string;
  downloadLinks: OPDSLink[];
  navigationLinks: OPDSLink[];
}

export interface OPDSFeed {
  id: string;
  title: string;
  updated?: string;
  author?: string;
  icon?: string;
  links: OPDSLink[];
  searchLink?: OPDSLink;
  entries: OPDSEntry[];
  totalResults?: number;
  itemsPerPage?: number;
  startIndex?: number;
  isNavigationFeed: boolean;
}

export interface OPDSServerConfig {
  enabled: boolean;
  port: number;
  title: string;
  requireAuth: boolean;
  username?: string;
  password?: string;
}

export interface OPDSServerStatus {
  running: boolean;
  port: number;
  localUrl: string;
  lanUrls: string[];
  requireAuth: boolean;
  bookCount: number;
  error?: string;
}

export interface OPDSDownloadResult {
  success: boolean;
  workId?: string;
  filePath?: string;
  fileName?: string;
  fileSizeBytes?: number;
  error?: string;
}
