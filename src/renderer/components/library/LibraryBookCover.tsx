'use client';

import React, { useState } from 'react';
import { BookOpen } from 'lucide-react';
import { formatCoverUrl } from '../../utils/file-path-helper';
import { Skeleton } from '../ui/Skeleton';
import { useWorkspace } from '../context/WorkspaceContext';
import type { TranslationKey } from '../../translations';

export interface LibraryBookCoverProps {
  url?: string;
  title: string;
  className?: string;
  aspectRatio?: string;
  noCoverLabel?: string;
}

export const LibraryBookCover: React.FC<LibraryBookCoverProps> = ({
  url,
  title,
  className = '',
  aspectRatio = 'aspect-[2/3]',
  noCoverLabel,
}) => {
  let t: ((k: TranslationKey) => string) | undefined;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    t = useWorkspace().t;
  } catch {
    // Safe fallback when rendered outside WorkspaceProvider
  }

  const [hasFailed, setHasFailed] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  const formattedUrl = url && !hasFailed ? formatCoverUrl(url) : undefined;
  const resolvedNoCoverLabel = noCoverLabel || (t ? t('noCoverText') : 'بدون غلاف');

  return (
    <div
      className={`relative w-full ${aspectRatio} rounded-xl overflow-hidden bg-canvas border border-border/70 select-none ${className}`}
      data-book-cover
    >
      {/* Skeletons show while covers load with zero layout jump */}
      {formattedUrl && !isLoaded && (
        <Skeleton className="absolute inset-0 size-full z-10" rounded="lg" />
      )}

      {formattedUrl ? (
        <img
          src={formattedUrl}
          alt={title}
          loading="lazy"
          decoding="async"
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={() => setIsLoaded(true)}
          onError={() => setHasFailed(true)}
          className={`absolute inset-0 size-full object-cover transition-opacity duration-300 ${
            isLoaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
      ) : (
        /* Styled clean no-cover placeholder per Figma vision mockup */
        <div
          className="absolute inset-0 size-full p-3 flex items-center justify-center bg-canvas/80 text-text-muted"
          data-no-cover-placeholder
        >
          <div className="w-full h-full rounded-lg border border-border/60 bg-surface/40 flex flex-col items-center justify-center p-2 text-center shadow-xs">
            <BookOpen className="size-6 sm:size-7 opacity-40 mb-1.5 text-text-muted shrink-0" aria-hidden="true" />
            <span className="text-[11px] font-sans font-medium text-text-muted/90 select-none truncate max-w-full">
              {resolvedNoCoverLabel}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
