'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import type { KnowledgeItemDTO } from '../../../shared/types/knowledge';
import { parseNoteTarget, validStudyTarget } from '../../../shared/study-notes';
import { navigateStudyReference, openStudyNote } from '../../utils/study-navigation';

const DISMISS_TIMEOUT_MS = 8000;

/** Mounted for the full workspace lifetime, including before lazy views load. */
export function StudyDeepLinkBridge() {
  const { openBookForReading, t } = useWorkspace();
  const [missing, setMissing] = useState(false);
  const [sourceMissing, setSourceMissing] = useState(false);
  const [noticeNonce, setNoticeNonce] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const remainingRef = useRef(DISMISS_TIMEOUT_MS);
  const startRef = useRef<number | null>(null);

  const dismiss = useCallback(() => {
    remainingRef.current = 0;
    startRef.current = null;
    setIsHovered(false);
    setIsFocused(false);
    setMissing(false);
    setSourceMissing(false);
  }, []);

  useEffect(() => {
    const show = () => {
      remainingRef.current = DISMISS_TIMEOUT_MS;
      startRef.current = null;
      setIsHovered(false);
      setIsFocused(false);
      setSourceMissing(true);
      setNoticeNonce(n => n + 1);
    };
    window.addEventListener('baglib:study-source-missing', show);
    return () => window.removeEventListener('baglib:study-source-missing', show);
  }, []);

  const visible = missing || sourceMissing;
  const isPaused = isHovered || isFocused;

  useEffect(() => {
    if (!visible || isPaused) return;

    if (remainingRef.current <= 0) {
      dismiss();
      return;
    }

    startRef.current = Date.now();
    const timer = setTimeout(() => {
      dismiss();
    }, remainingRef.current);

    return () => {
      clearTimeout(timer);
      if (startRef.current !== null) {
        const elapsed = Date.now() - startRef.current;
        remainingRef.current = Math.max(0, remainingRef.current - elapsed);
        startRef.current = null;
      }
    };
  }, [visible, noticeNonce, isPaused, dismiss]);

  const navigation = useRef(Promise.resolve());
  useEffect(() => window.electronAPI?.onStudyNavigate?.(target => {
    navigation.current = navigation.current.then(async () => {
      dismiss();
      if (!validStudyTarget(target)) throw new Error('invalid-reference');
      const note = parseNoteTarget(target);
      if (note) {
        const [personal, knowledge] = await Promise.all([
          window.electronAPI.studyNotes.list(),
          window.electronAPI.knowledge.getAll(),
        ]);
        if (
          !personal.some(item => item.id === note.id) &&
          !knowledge.some(
            (item: KnowledgeItemDTO) =>
              item.id === note.id &&
              ['note', 'study_note', 'reading_reflection'].includes(item.knowledgeType)
          )
        ) {
          throw new Error('missing-note');
        }
      }
      // Read fresh data, so a cold-start link does not race WorkspaceContext's initial fetch.
      const books = target.startsWith('book:') ? await window.electronAPI.getAllBooks() : [];
      await navigateStudyReference(target, books, openBookForReading, (id, anchor) => openStudyNote({ id, anchor }));
    }).catch(() => {
      remainingRef.current = DISMISS_TIMEOUT_MS;
      startRef.current = null;
      setIsHovered(false);
      setIsFocused(false);
      setMissing(true);
      setNoticeNonce(n => n + 1);
    });
  }), [openBookForReading, dismiss]);

  if (!visible) return null;

  return (
    <div
      role="alert"
      data-study-link-missing
      className="absolute top-14 inset-x-3 z-[100] flex items-start justify-between gap-3 rounded-xl border border-amber-500/40 bg-surface p-3 text-sm leading-relaxed break-words shadow-lg max-w-2xl sm:mx-auto"
      onMouseEnter={() => { setIsHovered(true); }}
      onMouseLeave={() => { setIsHovered(false); }}
      onPointerEnter={() => { setIsHovered(true); }}
      onPointerLeave={() => { setIsHovered(false); }}
      onFocus={() => setIsFocused(true)}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsFocused(false);
        }
      }}
      onKeyDown={event => {
        if (event.key === 'Escape') dismiss();
      }}
    >
      <span className="flex-1 min-w-0">
        {t(sourceMissing ? 'studyLinkFileMissing' : 'studyLinkTargetMissing')}
      </span>
      <button
        type="button"
        tabIndex={0}
        data-study-link-dismiss
        onClick={dismiss}
        aria-label={t('studyLinkDismiss')}
        title={t('studyLinkDismiss')}
        className="shrink-0 rounded-lg p-1 text-muted hover:text-main hover:bg-canvas focus-visible:outline-2 focus-visible:outline-pale-sky-500 transition-colors"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
