import type { CardSourceKind } from '../../shared/types/knowledge-cards';

export const KNOWLEDGE_CARD_OPEN = 'baglib:knowledge-card-open';
export const KNOWLEDGE_CARD_SAVED = 'baglib:knowledge-card-saved';
export const CARD_HOVER_SETTING = 'baglib-knowledge-card-hover';
const MAX_SELECTION = 300;

export interface CardContext {
  kind: CardSourceKind;
  ref?: string;
  label?: string;
  workId?: string;
  script?: string;
  tafsir?: string;
  surah?: number;
  ayah?: number;
  wordIndex?: number;
  researchId?: number;
}

export interface CardRequest {
  text: string;
  context: CardContext;
  x: number;
  y: number;
}

export function openKnowledgeCard(request: CardRequest): void {
  window.dispatchEvent(new CustomEvent<CardRequest>(KNOWLEDGE_CARD_OPEN, { detail: request }));
}

export function cardHoverEnabled(): boolean {
  try { return localStorage.getItem(CARD_HOVER_SETTING) !== 'off'; } catch { return true; }
}

/** Finds what the pointer or selection is on. Plain interface text returns null, so it gets no card. */
export function cardContextFrom(element: Element | null): CardContext | null {
  const word = element?.closest('[data-surah][data-aya]');
  if (word) {
    const surah = Number(word.getAttribute('data-surah'));
    const ayah = Number(word.getAttribute('data-aya'));
    if (!Number.isInteger(surah) || !Number.isInteger(ayah)) return null;
    const source = word.closest<HTMLElement>('[data-card-script]');
    const wordIndex = Number(word.getAttribute('data-word-index-in-ayah'));
    return {
      kind: 'quran', ref: `quran:${surah}:${ayah}`, label: `${surah}:${ayah}`, surah, ayah,
      script: source?.dataset.cardScript, tafsir: source?.dataset.cardTafsir,
      wordIndex: Number.isInteger(wordIndex) && wordIndex > 0 ? wordIndex : undefined,
    };
  }
  const owner = element?.closest<HTMLElement>('[data-card-kind]');
  if (!owner) return null;
  const research = Number(owner.dataset.cardResearch);
  return {
    kind: owner.dataset.cardKind as CardSourceKind,
    ref: owner.dataset.cardRef,
    label: owner.dataset.cardLabel,
    researchId: Number.isInteger(research) && research > 0 ? research : undefined,
  };
}

export function hoverCardText(element: Element): string {
  return (element.getAttribute('data-canonical') || element.getAttribute('data-hafs') || element.textContent || '').trim();
}

export function selectionCardText(text: string): string | null {
  const trimmed = text.trim();
  return trimmed.length >= 2 && trimmed.length <= MAX_SELECTION ? trimmed : null;
}

/** Keeps a popup inside the window at any width, with the 16px gutter the app uses. */
export function cardPosition(x: number, y: number, width: number, height: number, viewportWidth: number, viewportHeight: number): { left: number; top: number } {
  const gutter = 16;
  const left = Math.max(gutter, Math.min(x - width / 2, viewportWidth - width - gutter));
  const below = y + 12;
  const top = below + height + gutter <= viewportHeight ? below : Math.max(gutter, y - height - 12);
  return { left, top };
}
