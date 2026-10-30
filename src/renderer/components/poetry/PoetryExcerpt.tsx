'use client';
import React from 'react';
import { poetryHighlightedParts } from '../../../shared/poetry';

export function PoetryExcerpt({ lines, query, onOpen }: { lines: string[]; query: string; onOpen: () => void }) {
  return <button type="button" onClick={onOpen} className={`mt-3 grid w-full gap-4 rounded-lg border border-subtle bg-canvas p-3 text-start leading-loose ${lines.length === 2 ? 'sm:grid-cols-2' : ''}`}>
    {lines.map((line, index) => <span key={index} className="min-w-0 whitespace-pre-wrap break-words">{poetryHighlightedParts(line, query).map((part, partIndex) => part.matched ? <mark key={partIndex} className="rounded bg-amber-200 px-0.5 text-amber-950">{part.text}</mark> : <React.Fragment key={partIndex}>{part.text}</React.Fragment>)}</span>)}
  </button>;
}
