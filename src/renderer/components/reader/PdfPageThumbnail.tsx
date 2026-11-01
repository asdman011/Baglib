'use client';
import React, { useEffect, useRef, useState } from 'react';
import type { PdfViewDocument } from '../../libs/reader/pdf-view-document';
import { pdfThumbnail } from '../../libs/reader/pdf-thumbnails';

interface PdfPageThumbnailProps {
  document: PdfViewDocument | null;
  page: number;
  image?: string | null;
  alt: string;
  rotation?: number;
  fallback: React.ReactNode;
}

/** Draws a page once it scrolls near the view, keeping long documents cheap to list. */
export function PdfPageThumbnail({ document, page, image, alt, rotation = 0, fallback }: PdfPageThumbnailProps) {
  const anchor = useRef<HTMLDivElement>(null);
  const [drawn, setDrawn] = useState<{ document: PdfViewDocument; page: number; url: string } | null>(null);
  const url = image || (drawn?.document === document && drawn?.page === page ? drawn.url : null);
  useEffect(() => {
    if (!document || !anchor.current || image) return;
    let alive = true;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      void pdfThumbnail(document, page).then(result => { if (alive && result) setDrawn({ document, page, url: result }); }).catch(() => undefined);
    }, { rootMargin: '300px' });
    observer.observe(anchor.current);
    return () => { alive = false; observer.disconnect(); };
  }, [document, page, image]);
  return (
    <div ref={anchor} className="w-full h-full flex items-center justify-center">
      {url ? <img src={url} alt={alt} style={{ transform: `rotate(${rotation}deg)` }} className="w-full h-full object-contain transition-transform" /> : fallback}
    </div>
  );
}
