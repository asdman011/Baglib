'use client';

import React from 'react';

export interface LibraryRibbonProps {
  children?: React.ReactNode;
  className?: string;
}

export function LibraryRibbon({ children, className = '' }: LibraryRibbonProps) {
  return (
    <div
      className={`w-full flex items-center justify-between gap-3 flex-wrap py-1.5 px-3 rounded-2xl bg-surface/50 border border-border/70 ${className}`}
      data-library-ribbon
    >
      {children}
    </div>
  );
}
