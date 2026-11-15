'use client';

import React, { useState, useRef, useEffect } from 'react';
import type { DocumentHeading } from '../../../shared/manuscript-headings';
import { translations } from '../../translations';
import { AlignLeft } from 'lucide-react';

interface Props {
  language: 'ar' | 'en';
  headings: DocumentHeading[];
  activeHeadingId?: string;
  onSelectHeading: (id: string) => void;
  isOpen?: boolean;
  onToggleOpen?: () => void;
}

export function ResearchOutlineRail({ language, headings, activeHeadingId, onSelectHeading, isOpen: externalIsOpen, onToggleOpen }: Props) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isPopOpen = externalIsOpen ?? internalIsOpen;
  const setPopOpen = (val: boolean) => {
    if (onToggleOpen && externalIsOpen !== undefined) {
      if (val !== externalIsOpen) onToggleOpen();
    } else {
      setInternalIsOpen(val);
    }
  };

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const t = translations[language];

  const handleMouseEnter = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setPopOpen(true);
  };

  const handleMouseLeave = () => {
    timerRef.current = setTimeout(() => {
      setPopOpen(false);
    }, 400);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (headings.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="research-outline-container"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Right-edge tick marks rail (AFFiNE outline viewer) */}
      <div
        className="research-outline-rail"
        onClick={() => setPopOpen(!isPopOpen)}
        title={t.researchViewToc}
        role="button"
        aria-label={t.researchViewToc}
        tabIndex={0}
      >
        <div className="research-outline-ticks">
          {headings.map(h => {
            const isActive = activeHeadingId === h.id;
            let tickWidthClass = 'w-4';
            if (h.level === 2) tickWidthClass = 'w-3';
            else if (h.level >= 3) tickWidthClass = 'w-2';

            return (
              <span
                key={h.id}
                className={`research-outline-tick ${tickWidthClass} ${isActive ? 'active' : ''}`}
                title={h.text}
              />
            );
          })}
        </div>
      </div>

      {/* Floating Outline / TOC Popover Card (Screenshot 5.png) */}
      {isPopOpen && (
        <div
          className="research-outline-popover animate-in fade-in zoom-in-95 duration-150"
          role="dialog"
          aria-label={t.researchTocTitle}
        >
          <div className="research-outline-header">
            <span className="research-outline-title">{t.researchTocTitle}</span>
            <AlignLeft className="w-4 h-4 text-text-muted" />
          </div>

          <div className="research-outline-list">
            {headings.length === 0 ? (
              <div className="text-xs text-text-muted p-3 text-center">
                {t.researchNoHeadings}
              </div>
            ) : (
              headings.map(h => {
                const isActive = activeHeadingId === h.id;
                const indent = Math.max(0, (h.level - 1) * 10);

                return (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => {
                      onSelectHeading(h.id);
                    }}
                    style={{ paddingInlineStart: `${indent + 8}px` }}
                    className={`research-outline-item ${isActive ? 'active' : ''}`}
                    title={h.text}
                  >
                    <span className="truncate">{h.text}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
