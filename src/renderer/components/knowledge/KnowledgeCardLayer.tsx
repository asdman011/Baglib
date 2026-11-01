'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { KnowledgeCardPopover } from './KnowledgeCardPopover';
import { cardContextFrom, cardHoverEnabled, hoverCardText, KNOWLEDGE_CARD_OPEN, selectionCardText, type CardRequest } from '../../libs/knowledge-card-context';

const HOVER_DELAY_MS = 800;
const HOVER_CLOSE_MS = 300;
const HOVER_TARGETS = '[data-surah][data-aya], [data-card-hover]';

/** Opens cards from a text selection, a resting pointer, or the book reader's selection menu. */
export function KnowledgeCardLayer() {
  const { t, dir } = useWorkspace();
  const [chip, setChip] = useState<CardRequest | null>(null);
  const [card, setCard] = useState<(CardRequest & { key: number; fromHover: boolean }) | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverTarget = useRef<Element | null>(null);
  const opened = useRef(0);

  const clearTimer = (timer: typeof hoverTimer) => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  const show = (request: CardRequest, fromHover: boolean) => { setChip(null); opened.current += 1; setCard({ ...request, key: opened.current, fromHover }); };

  useEffect(() => {
    const onOpen = (event: Event) => show((event as CustomEvent<CardRequest>).detail, false);
    const onMouseUp = (event: MouseEvent) => {
      if ((event.target as Element).closest?.('[data-knowledge-card], [data-knowledge-chip]')) return;
      const selection = window.getSelection();
      const text = selection && !selection.isCollapsed ? selectionCardText(selection.toString()) : null;
      const anchor = selection?.anchorNode;
      const context = text ? cardContextFrom(anchor instanceof Element ? anchor : anchor?.parentElement ?? null) : null;
      if (!text || !context || !selection) { setChip(null); return; }
      const bounds = selection.getRangeAt(0).getBoundingClientRect();
      setChip({ text, context, x: bounds.left + bounds.width / 2, y: bounds.bottom });
    };
    const onPointerOver = (event: PointerEvent) => {
      const target = (event.target as Element).closest?.(HOVER_TARGETS);
      if (target === hoverTarget.current) return;
      hoverTarget.current = target ?? null;
      clearTimer(hoverTimer);
      if (!target || !cardHoverEnabled() || event.pointerType === 'touch') return;
      hoverTimer.current = setTimeout(() => {
        const context = cardContextFrom(target);
        const text = hoverCardText(target);
        if (!context || !text || !window.getSelection()?.isCollapsed) return;
        const bounds = target.getBoundingClientRect();
        clearTimer(closeTimer);
        show({ text, context, x: bounds.left + bounds.width / 2, y: bounds.bottom }, true);
      }, HOVER_DELAY_MS);
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') { setCard(null); setChip(null); } };
    const onPointerDown = (event: PointerEvent) => { if (!(event.target as Element).closest?.('[data-knowledge-card]')) setCard(null); };
    window.addEventListener(KNOWLEDGE_CARD_OPEN, onOpen);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('pointerover', onPointerOver);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener(KNOWLEDGE_CARD_OPEN, onOpen);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('pointerover', onPointerOver);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      clearTimer(hoverTimer);
      clearTimer(closeTimer);
    };
  }, []);

  // A card opened by resting the pointer leaves with the pointer, so reading is not interrupted.
  useEffect(() => {
    if (!card?.fromHover) return;
    const onMove = (event: PointerEvent) => {
      if ((event.target as Element).closest?.(`[data-knowledge-card], ${HOVER_TARGETS}`)) { clearTimer(closeTimer); return; }
      if (!closeTimer.current) closeTimer.current = setTimeout(() => { closeTimer.current = null; setCard(null); }, HOVER_CLOSE_MS);
    };
    document.addEventListener('pointermove', onMove);
    return () => document.removeEventListener('pointermove', onMove);
  }, [card]);

  return <>
    {chip && <button type="button" data-knowledge-chip dir={dir} onClick={() => show(chip, false)} style={{ left: Math.max(16, Math.min(chip.x - 60, window.innerWidth - 160)), top: Math.min(chip.y + 8, window.innerHeight - 56) }}
      className="fixed z-[80] inline-flex items-center gap-1.5 rounded-xl border border-subtle bg-surface px-3 py-2 text-xs font-semibold text-main shadow-lg hover:bg-canvas">
      <Sparkles className="size-3.5 text-amber-500" />{t('knowledgeCardOpen')}
    </button>}
    {card && <KnowledgeCardPopover key={card.key} request={card} onClose={() => setCard(null)}
      onPointerEnter={() => clearTimer(closeTimer)} onPointerLeave={() => undefined} />}
  </>;
}
