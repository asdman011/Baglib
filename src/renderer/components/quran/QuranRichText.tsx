'use client';

import React from 'react';
import type { QuranRichNode } from '../../../shared/types/quran';

export function QuranRichText({ nodes }: { nodes: QuranRichNode[] }) {
  return <>{nodes.map((node, index) => node.tag === 'text' ? <React.Fragment key={index}>{withEditorialNotes(node.text ?? '')}</React.Fragment> : React.createElement(node.tag, { key: index, className: node.tag === 'h2' || node.tag === 'h3' ? 'font-semibold mt-3' : undefined }, node.tag === 'br' ? undefined : <QuranRichText nodes={node.children || []} />))}</>;
}

/**
 * Tafsir sources mark editorial notes (manuscript variants, references) as [[...]]. Show them as small muted notes
 * instead of raw brackets; the stored text is unchanged.
 */
export function withEditorialNotes(text: string): React.ReactNode {
  if (!text.includes('[[')) return text;
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(/\[\[([^\]]+)\]\]/gu)) {
    if (match.index! > last) parts.push(text.slice(last, match.index));
    parts.push(<small key={match.index} data-tafsir-note className="mx-0.5 rounded bg-canvas px-1 align-baseline text-[0.6em] leading-normal text-muted">{match[1].trim()}</small>);
    last = match.index! + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' };

/** Plain text of a dataset's HTML field, for places that show one short line. */
export function quranHtmlText(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_match, name: string) => entities[name]).replace(/\s+/g, ' ').trim();
}
