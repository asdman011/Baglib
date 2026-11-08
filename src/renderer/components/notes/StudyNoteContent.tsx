'use client';
import { relationLabel } from '../../utils/relation-labels';
import React, { useEffect, useId, useRef, useState } from 'react';
import { studyLinks, type StudyNote } from '../../../shared/study-notes';
import type { TranslationKey } from '../../translations';
import { localAssetUrl } from '../../utils/file-path-helper';
import { useWorkspace } from '../context/WorkspaceContext';
import { previewStudyTarget, type StudyPreview } from '../../utils/corpus-lookup';
import { collectionKeys } from '../../utils/sunnah-collections';
import { PARAGRAPH_ANCHOR, findParagraph, noteParagraphs, parseNoteTarget, stripParagraphAnchors } from '../../../shared/note-paragraphs';

// Corpus text does not change while the app runs; notes do, so they are never cached.
const previewCache = new Map<string, StudyPreview | null>();

/** A study link with a hover and focus card showing the linked text, so the reader need not leave the note. */
function StudyLinkButton({ target, label, notes, onOpen }: { target: string; label: string; notes: StudyNote[]; onOpen: (target: string) => void }) {
  const { books, t } = useWorkspace();
  const [preview, setPreview] = useState<StudyPreview | null | 'loading' | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = useId();
  const show = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const cached = previewCache.get(target);
      if (cached !== undefined && !target.startsWith('note:')) { setPreview(cached); return; }
      setPreview('loading');
      void previewStudyTarget(target, notes, books, collection => t(collectionKeys[collection])).then(result => {
        if (!target.startsWith('note:')) previewCache.set(target, result);
        setPreview(current => current === undefined ? current : result);
      }, () => setPreview(current => current === undefined ? current : null));
    }, 350);
  };
  const hide = () => { if (timer.current) clearTimeout(timer.current); setPreview(undefined); };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return <span className="relative" onMouseEnter={show} onMouseLeave={hide}>
    <button type="button" dir="auto" data-study-link={target} aria-describedby={preview !== undefined ? id : undefined} onFocus={show} onBlur={hide} onKeyDown={event => { if (event.key === 'Escape') hide(); }} className="text-emerald-700 dark:text-emerald-300 underline underline-offset-2 text-start break-words" onClick={() => { hide(); onOpen(target); }}>{label}</button>
    {preview !== undefined && <span role="tooltip" id={id} data-study-link-preview className="absolute z-50 top-full mt-1 start-0 block w-72 max-w-[80vw] rounded-xl border border-subtle bg-surface p-3 text-main shadow-2xl whitespace-normal">
      {preview === 'loading' ? <span className="text-xs text-muted">{t('studyPreviewLoading')}</span>
        : preview === null ? <span className="text-xs text-muted">{t('studyPreviewUnavailable')}</span>
        : <>
          <span dir="auto" className="block text-xs font-bold leading-relaxed">{preview.title}{preview.meta ? <span className="ms-2 font-normal text-muted">· {preview.meta}</span> : null}</span>
          {preview.body && <span dir="auto" className="mt-1 block max-h-48 overflow-auto whitespace-pre-wrap text-sm leading-loose">{preview.body}</span>}
        </>}
    </span>}
  </span>;
}

const calloutKeys: Record<string, TranslationKey> = {
  ayah: 'calloutAyah', hadith: 'calloutHadith', poem: 'calloutPoem', question: 'calloutQuestion',
  note: 'calloutNote', warning: 'calloutWarning', summary: 'calloutSummary', tip: 'calloutTip',
};

function formatted(text: string, t: (key: TranslationKey) => string): React.ReactNode {
  return text.split('\n').map((line, index) => {
    // Obsidian-style callout header `> [!ayah] Title`, and footnote definitions `[^1]: text`.
    const callout = /^>\s*\[!([A-Za-z]+)\]\s*(.*)$/u.exec(line);
    if (callout) {
      const type = callout[1].toLowerCase();
      return <React.Fragment key={index}>{index > 0 && '\n'}<span data-callout={type} className="inline-block border-s-2 border-amber-500 ps-2"><span className="rounded bg-amber-500/15 px-2 text-xs font-bold not-italic">{calloutKeys[type] ? t(calloutKeys[type]) : type}</span>{callout[2] && <span className="ms-2 font-bold">{callout[2]}</span>}</span></React.Fragment>;
    }
    const footnote = /^\[\^([\w-]{1,20})\]:\s*(.*)$/u.exec(line);
    if (footnote) return <React.Fragment key={index}>{index > 0 && '\n'}<span data-footnote={footnote[1]} className="text-xs text-muted"><sup className="me-1">{footnote[1]}</sup>{footnote[2]}</span></React.Fragment>;
    // Paragraph anchors are for links only; readers never see them.
    line = line.replace(PARAGRAPH_ANCHOR, '');
    const heading = /^#{1,3}\s/u.test(line);
    const quote = /^>\s/u.test(line);
    const list = /^[-*]\s/u.test(line);
    line = line.replace(/^#{1,3}\s|^>\s|^[-*]\s/u, '');
    const tokens: React.ReactNode[] = [];
    let cursor = 0;
    for (const match of line.matchAll(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[\^([\w-]{1,20})\]/gu)) {
      tokens.push(line.slice(cursor, match.index));
      tokens.push(match[6] ? <sup key={match.index} data-footnote-ref={match[6]} className="text-emerald-700 dark:text-emerald-300">{match[6]}</sup> : match[2] ? <button type="button" key={match.index} className="underline text-emerald-700 dark:text-emerald-300" onClick={() => { void window.electronAPI?.openExternal(match[2]); }}>{match[1]}</button> : match[3] ? <strong key={match.index}>{match[3]}</strong> : match[4] ? <em key={match.index}>{match[4]}</em> : <code key={match.index} className="rounded bg-canvas px-1">{match[5]}</code>);
      cursor = match.index! + match[0].length;
    }
    tokens.push(line.slice(cursor));
    return <React.Fragment key={index}>{index > 0 && '\n'}<span className={heading ? 'font-bold text-base' : quote ? 'border-s-2 border-amber-500 ps-2 italic text-muted' : undefined}>{list && '• '}{tokens}</span></React.Fragment>;
  });
}

let shots: Promise<string> | null = null;
/** A lecture screenshot embed: media:<lecture>:<seconds>:<shot>. */
function LectureShot({ shot }: { shot: string }) {
  const [directory, setDirectory] = useState<string | null>(null);
  useEffect(() => { void (shots ??= window.electronAPI.lectures.shotsDirectory()).then(setDirectory).catch(() => {}); }, []);
  if (!directory) return null;
  return <img src={localAssetUrl(`${directory}/${shot}.png`)} alt="" data-lecture-shot={shot} className="block my-2 max-h-72 max-w-full rounded-lg border border-subtle" />;
}

/** Text of an embedded note, or only the linked paragraph of it; a missing anchor shows the whole note. */
function embeddedText(target: string, notes: StudyNote[]): string | null {
  const parsed = parseNoteTarget(target);
  const note = parsed && notes.find(item => item.id === parsed.id);
  if (!note) return null;
  const paragraph = parsed.anchor ? findParagraph(note.content, parsed.anchor) : undefined;
  return stripParagraphAnchors(paragraph ? paragraph.text : note.content).slice(0, 1200);
}

function renderSegment(content: string, notes: StudyNote[], onOpen: (target: string) => void, t: (key: TranslationKey) => string, key: string): React.ReactNode[] {
  const pieces: React.ReactNode[] = [];
  let end = 0;
  for (const link of studyLinks(content)) {
    pieces.push(<React.Fragment key={`${key}-before-${link.start}`}>{formatted(content.slice(end, link.start), t)}</React.Fragment>);
    const embedded = link.embed && link.target.startsWith('note:') ? embeddedText(link.target, notes) : null;
    pieces.push(<span key={`${key}-${link.start}`} className={link.embed ? 'block my-2 border-s-2 border-amber-500 ps-3' : ''}>
      {link.relation && <span data-link-relation={link.relation} dir="auto" className="me-1 rounded bg-emerald-500/15 px-1.5 text-[0.75em] font-semibold text-emerald-700 dark:text-emerald-300">{relationLabel(t, link.relation)}</span>}
      <StudyLinkButton target={link.target} label={link.label} notes={notes} onOpen={onOpen} />
      {link.embed && link.target.startsWith('media:') && link.target.split(':').length === 4 ? <LectureShot shot={link.target.split(':')[3]} />
        : link.embed && <span dir="auto" data-embedded-note={link.target} className="block text-sm text-muted whitespace-pre-wrap leading-loose">{embedded ?? t('studyEmbedUnavailable')}</span>}
    </span>);
    end = link.end;
  }
  pieces.push(<React.Fragment key={`${key}-tail`}>{formatted(content.slice(end), t)}</React.Fragment>);
  return pieces;
}

export function StudyNoteContent({ content, notes, onOpen, t }: { content: string; notes: StudyNote[]; onOpen: (target: string) => void; t: (key: TranslationKey) => string }) {
  // Each anchored paragraph is wrapped so a paragraph link can scroll to it and highlight it.
  const pieces: React.ReactNode[] = [];
  let end = 0;
  for (const paragraph of noteParagraphs(content)) {
    if (!paragraph.anchor) continue;
    pieces.push(...renderSegment(content.slice(end, paragraph.start), notes, onOpen, t, `gap-${end}`));
    pieces.push(<span key={`p-${paragraph.start}`} data-paragraph={paragraph.anchor} className="rounded transition-colors duration-700">{renderSegment(content.slice(paragraph.start, paragraph.end), notes, onOpen, t, `p-${paragraph.start}`)}</span>);
    end = paragraph.end;
  }
  pieces.push(...renderSegment(content.slice(end), notes, onOpen, t, `rest-${end}`));
  return <div dir="auto" className="whitespace-pre-wrap break-words text-sm leading-loose select-text">{pieces}</div>;
}
