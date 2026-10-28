'use client';
import React from 'react';
import { studyLinks, type StudyNote } from '../../../shared/study-notes';
import type { TranslationKey } from '../../translations';

function formatted(text: string): React.ReactNode {
  return text.split('\n').map((line, index) => {
    const heading = /^#{1,3}\s/u.test(line);
    const quote = /^>\s/u.test(line);
    const list = /^[-*]\s/u.test(line);
    line = line.replace(/^#{1,3}\s|^>\s|^[-*]\s/u, '');
    const tokens: React.ReactNode[] = [];
    let cursor = 0;
    for (const match of line.matchAll(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/gu)) {
      tokens.push(line.slice(cursor, match.index));
      tokens.push(match[2] ? <button type="button" key={match.index} className="underline text-emerald-700 dark:text-emerald-300" onClick={() => { void window.electronAPI?.openExternal(match[2]); }}>{match[1]}</button> : match[3] ? <strong key={match.index}>{match[3]}</strong> : match[4] ? <em key={match.index}>{match[4]}</em> : <code key={match.index} className="rounded bg-canvas px-1">{match[5]}</code>);
      cursor = match.index! + match[0].length;
    }
    tokens.push(line.slice(cursor));
    return <React.Fragment key={index}>{index > 0 && '\n'}<span className={heading ? 'font-bold text-base' : quote ? 'border-s-2 border-amber-500 ps-2 italic text-muted' : undefined}>{list && '• '}{tokens}</span></React.Fragment>;
  });
}

export function StudyNoteContent({ content, notes, onOpen, t }: { content: string; notes: StudyNote[]; onOpen: (target: string) => void; t: (key: TranslationKey) => string }) {
  const pieces: React.ReactNode[] = [];
  let end = 0;
  for (const link of studyLinks(content)) {
    pieces.push(<React.Fragment key={`before-${link.start}`}>{formatted(content.slice(end, link.start))}</React.Fragment>);
    const embedded = link.embed && link.target.startsWith('note:') ? notes.find(note => note.id === link.target.slice(5)) : undefined;
    pieces.push(<span key={link.start} className={link.embed ? 'block my-2 border-s-2 border-amber-500 ps-3' : ''}>
      <button type="button" dir="auto" className="text-emerald-700 dark:text-emerald-300 underline underline-offset-2 text-start break-words" onClick={() => onOpen(link.target)}>{link.label}</button>
      {link.embed && <span dir="auto" className="block text-sm text-muted whitespace-pre-wrap leading-loose">{embedded ? embedded.content.slice(0, 1200) : t('studyEmbedUnavailable')}</span>}
    </span>);
    end = link.end;
  }
  pieces.push(<React.Fragment key="tail">{formatted(content.slice(end))}</React.Fragment>);
  return <div dir="auto" className="whitespace-pre-wrap break-words text-sm leading-loose select-text">{pieces}</div>;
}
