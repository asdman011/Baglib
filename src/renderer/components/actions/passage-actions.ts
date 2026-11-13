'use client';
import type { CardSourceKind } from '../../../shared/types/knowledge-cards';
export async function addPassageToSrs(input: {
    text: string;
    sourceKind: CardSourceKind;
    sourceRef: string;
    sourceLabel: string;
    language: string;
    workId?: string;
}) {
    const card = await window.electronAPI.knowledgeCards.save({ front: input.sourceLabel, back: input.text, sourceKind: input.sourceKind, sourceRef: input.sourceRef, sourceLabel: input.sourceLabel, language: input.language, workId: input.workId });
    // Save can return a previously existing card. Keep it intact if scheduling fails so retry is safe.
    await window.electronAPI.knowledgeCards.setMemorizing(card.id, true);
    window.dispatchEvent(new CustomEvent('baglib:knowledge-card-saved'));
    window.dispatchEvent(new CustomEvent('baglib:context-action-done'));
    return card;
}
/** KEY-337: a note on a passage opens beside the text (NoteSidePanel), never by switching to the Notes tab. */
export const NOTE_PANEL_EVENT = 'baglib:note-panel';
export interface NotePanelRequest { target: string; label: string; text?: string; embed?: boolean }
export function passageNote(target: string, label: string, text = '', embed = false) {
    window.dispatchEvent(new CustomEvent<NotePanelRequest>(NOTE_PANEL_EVENT, { detail: { target, label, text, embed } }));
}
export async function linkPassageToNote(target: string, label: string) {
    window.dispatchEvent(new CustomEvent('baglib:link-passage', { detail: { target, label } }));
}
export async function sharePassage(text: string) {
    const result = await window.electronAPI.sunnah.share(text);
    if (!result.ok)
        throw new Error(result.error);
}
export function openPassageComment(reference: string) {
    window.dispatchEvent(new CustomEvent('baglib:personal-commentary', { detail: reference }));
}
