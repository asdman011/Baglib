'use client';

import React from 'react';
import type { QuranRichNode } from '../../../shared/types/quran';

export function QuranRichText({ nodes }: { nodes: QuranRichNode[] }) {
  return <>{nodes.map((node, index) => node.tag === 'text' ? <React.Fragment key={index}>{node.text}</React.Fragment> : React.createElement(node.tag, { key: index, className: node.tag === 'h2' || node.tag === 'h3' ? 'font-semibold mt-3' : undefined }, node.tag === 'br' ? undefined : <QuranRichText nodes={node.children || []} />))}</>;
}

const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' };

/** Plain text of a dataset's HTML field, for places that show one short line. */
export function quranHtmlText(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_match, name: string) => entities[name]).replace(/\s+/g, ' ').trim();
}
