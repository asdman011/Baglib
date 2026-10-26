'use client';

import React, { useState } from 'react';
import { BookOpen } from 'lucide-react';
import { formatCoverUrl } from '../../utils/file-path-helper';

export function BookCoverThumbnail({ url, title, className = '' }: { url?: string; title: string; className?: string }) {
  const [failedUrl, setFailedUrl] = useState<string>();
  const source = url ? formatCoverUrl(url) : undefined;
  return <div className={`relative overflow-hidden flex items-center justify-center bg-surface text-muted ${className}`} data-book-cover>
    <BookOpen aria-hidden="true" className="size-5 opacity-40" />
    {source && source !== failedUrl && <img src={source} alt={title} loading="lazy" decoding="async" referrerPolicy="strict-origin-when-cross-origin" className="absolute inset-0 size-full object-cover" onError={() => setFailedUrl(source)} />}
  </div>;
}
