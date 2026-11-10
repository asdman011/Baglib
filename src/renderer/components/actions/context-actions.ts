import { createElement } from 'react';
import { Bookmark, BookOpen, Brain, Copy, Download, FilePenLine, Highlighter, History, Info, Languages, Layers, Lightbulb, MessageSquare, Play, Search, Share2, Trash2, Upload } from 'lucide-react';
import type { TranslationKey } from '../../translations';
import type { MenuItemProps } from '../ui/Menu';
export interface ContextActionDefinition {
    id: string;
    labelKey: TranslationKey;
    danger?: boolean;
}
export const CONTEXT_ACTIONS = {
    hadith: [
        { id: 'copy', labelKey: 'ctxCopyText' }, { id: 'copyFull', labelKey: 'ctxCopyIsnad' },
        { id: 'share', labelKey: 'sunnahShare' }, { id: 'comment', labelKey: 'markKindComments' },
        { id: 'srs', labelKey: 'ctxAddSrs' }, { id: 'commentary', labelKey: 'ctxSharh' }, { id: 'link', labelKey: 'ctxLinkExisting' },
    ],
    quran: [
        { id: 'copy', labelKey: 'quranCopyAyah' }, { id: 'copyPlain', labelKey: 'ctxCopyPlain' }, { id: 'copyReference', labelKey: 'ctxCopyReference' },
        { id: 'share', labelKey: 'sunnahShare' }, { id: 'tafsir', labelKey: 'quranCatTafsir' }, { id: 'translation', labelKey: 'quranCatTranslation' },
        { id: 'note', labelKey: 'studyNewNote' }, { id: 'comment', labelKey: 'markKindComments' }, { id: 'srs', labelKey: 'ctxAddSrs' },
        { id: 'bookmark', labelKey: 'ctxBookmark' }, { id: 'play', labelKey: 'quranAudioPlay' }, { id: 'link', labelKey: 'ctxLinkExisting' },
    ],
    selection: [
        { id: 'explain', labelKey: 'readerStudyExplain' }, { id: 'practice', labelKey: 'readerStudyPractice' }, { id: 'review', labelKey: 'readerStudyReviewLater' },
        { id: 'note', labelKey: 'markKindNote' }, { id: 'colors', labelKey: 'markColor' }, { id: 'copy', labelKey: 'ctxCopyReference' },
        { id: 'search', labelKey: 'ctxSearchLibrary' }, { id: 'dictionary', labelKey: 'ctxDictionary' },
    ],
    mark: [{ id: 'edit', labelKey: 'ctxEdit' }, { id: 'colors', labelKey: 'markColor' }, { id: 'comment', labelKey: 'markKindComments' }, { id: 'delete', labelKey: 'delete', danger: true }],
    note: [{ id: 'open', labelKey: 'ctxOpen' }, { id: 'copy', labelKey: 'sunnahCopy' }, { id: 'export', labelKey: 'ctxExport' }, { id: 'srs', labelKey: 'ctxAddSrs' }, { id: 'delete', labelKey: 'delete', danger: true }],
    card: [{ id: 'edit', labelKey: 'ctxEdit' }, { id: 'review', labelKey: 'readerStudyPractice' }, { id: 'srs', labelKey: 'ctxAddSrs' }, { id: 'copy', labelKey: 'sunnahCopy' }, { id: 'delete', labelKey: 'delete', danger: true }],
    board: [{ id: 'open', labelKey: 'ctxOpen' }, { id: 'copy', labelKey: 'sunnahCopy' }, { id: 'edit', labelKey: 'ctxEdit' }, { id: 'delete', labelKey: 'delete', danger: true }],
    empty: [{ id: 'note', labelKey: 'studyNewNote' }, { id: 'card', labelKey: 'newObjectNewCard' }, { id: 'import', labelKey: 'newObjectImportBook' }],
} as const satisfies Record<string, readonly ContextActionDefinition[]>;
const ACTION_ICONS = { copy: Copy, copyFull: Copy, copyPlain: Copy, copyReference: Copy, share: Share2, comment: MessageSquare, note: FilePenLine, srs: Bookmark, bookmark: Bookmark, link: FilePenLine, colors: Highlighter, search: Search, dictionary: Languages, tafsir: BookOpen, commentary: BookOpen, translation: Languages, delete: Trash2, open: BookOpen, edit: FilePenLine,
    // KEY-308: these fell back to the placeholder Info icon.
    explain: Lightbulb, practice: Brain, review: History, play: Play, export: Download, import: Upload, card: Layers };
export type ContextSurface = keyof typeof CONTEXT_ACTIONS;
export type ActionHandler = (() => void | Promise<unknown>) | {
    onClick?: () => void | Promise<unknown>;
    children?: MenuItemProps[];
    disabledReason?: string;
};
export function contextActions(surface: ContextSurface, handlers: Record<string, ActionHandler | undefined>, t: (key: TranslationKey) => string): MenuItemProps[] {
    return CONTEXT_ACTIONS[surface].map(definition => {
        const handler = handlers[definition.id];
        const bound = typeof handler === 'function' ? { onClick: handler } : handler;
        return { id: definition.id, icon: createElement(ACTION_ICONS[definition.id as keyof typeof ACTION_ICONS] ?? Info, { size: 14 }), label: t(definition.labelKey), danger: 'danger' in definition && definition.danger,
            ...bound, disabled: !bound || !!bound.disabledReason, disabledReason: bound?.disabledReason ?? (!bound ? t('ctxUnavailable') : undefined) };
    });
}
export function menuPosition(point: {
    x: number;
    y: number;
}, size: {
    width: number;
    height: number;
}, viewport: {
    width: number;
    height: number;
}, dir: 'rtl' | 'ltr') {
    return { left: Math.max(8, Math.min(dir === 'rtl' ? point.x - size.width : point.x, viewport.width - size.width - 8)), top: Math.max(8, Math.min(point.y, viewport.height - size.height - 8)) };
}
export function isTextEntry(target: unknown): boolean {
    const element = target as {
        tagName?: string;
        isContentEditable?: boolean;
        closest?: (selector: string) => unknown;
    } | null;
    return !!element && (!!element.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/i.test(element.tagName || '') || !!element.closest?.('[contenteditable="true"],.cm-editor,[role="textbox"]'));
}
