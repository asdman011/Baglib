'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface OcrPageOverlayProps {
  pageNumber: number;
  children: React.ReactNode;
}

/**
 * Places OCR output inside the viewer's own page element, so it follows the page
 * through zoom and scrolling. The viewer mounts pages lazily, hence the observer.
 */
export const OcrPageOverlay: React.FC<OcrPageOverlayProps> = ({ pageNumber, children }) => {
  const [pageElement, setPageElement] = useState<Element | null>(null);

  useEffect(() => {
    const selector = `.pdf-page-container[data-page-number="${pageNumber}"]`;
    const findPage = () => setPageElement(document.querySelector(selector));
    findPage();

    const observer = new MutationObserver(findPage);
    observer.observe(document.querySelector('.pdf-viewer-workspace') ?? document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pageNumber]);

  return pageElement ? createPortal(children, pageElement) : null;
};
