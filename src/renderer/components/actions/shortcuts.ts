import type { TranslationKey } from '../../translations';
import { POETRY_LINE_ACTIONS } from '../poetry/poetry-line-actions';
import { isTextEntry } from './context-actions';
export interface ShortcutDefinition {
    id: string;
    key: string;
    code?: string;
    aliases?: string[];
    mod?: boolean;
    alt?: boolean;
    shift?: boolean;
    scopes: readonly string[];
    labelKey: TranslationKey;
}
export const SHORTCUTS: readonly ShortcutDefinition[] = [
    { id: 'palette', key: 'k', code: 'KeyK', mod: true, scopes: ['global'], labelKey: 'navSearch' },
    { id: 'new-note', key: 'n', code: 'KeyN', mod: true, shift: true, scopes: ['global'], labelKey: 'studyNewNote' },
    { id: 'navigation', key: 'b', code: 'KeyB', aliases: ['لا'], mod: true, scopes: ['global'], labelKey: 'navPinSidebar' },
    { id: 'help', key: '?', aliases: ['؟'], scopes: ['global'], labelKey: 'shortcutSheet' },
    { id: 'companion', key: 'm', code: 'KeyM', aliases: ['ة', '’'], mod: true, shift: true, scopes: ['reader', 'quran', 'sunnah', 'bayan'], labelKey: 'companionOpen' },
    { id: 'context-menu', key: 'F10', shift: true, scopes: ['global'], labelKey: 'ctxActions' },
    { id: 'context-menu-key', key: 'ContextMenu', scopes: ['global'], labelKey: 'ctxActions' },
    { id: 'reader-toolbar', key: 'm', code: 'KeyM', alt: true, scopes: ['reader'], labelKey: 'readerToolbarShow' },
    { id: 'reader-highlight', key: 'h', code: 'KeyH', scopes: ['reader'], labelKey: 'shortcutHighlighter' },
    { id: 'reader-underline', key: 'u', code: 'KeyU', scopes: ['reader'], labelKey: 'shortcutUnderline' },
    { id: 'reader-comment', key: 'c', code: 'KeyC', scopes: ['reader'], labelKey: 'shortcutComment' },
    ...['1', '2', '3', '4', '5'].map((key, i) => ({ id: `reader-color-${key}`, key, code: `Digit${key}`, aliases: ['١٢٣٤٥'[i]], scopes: ['reader'], labelKey: 'shortcutColors' as const })),
    { id: 'reader-find', key: 'f', code: 'KeyF', mod: true, scopes: ['reader'], labelKey: 'shortcutFind' },
    { id: 'reader-save', key: 's', code: 'KeyS', mod: true, scopes: ['reader'], labelKey: 'shortcutSave' },
    { id: 'reader-focus', key: 'F11', scopes: ['reader'], labelKey: 'shortcutPageOnly' },
    { id: 'reader-undo', key: 'z', code: 'KeyZ', mod: true, scopes: ['reader'], labelKey: 'undo' },
    { id: 'reader-redo', key: 'z', code: 'KeyZ', mod: true, shift: true, scopes: ['reader'], labelKey: 'pdfPageEditorRedo' },
    { id: 'reader-redo-alt', key: 'y', code: 'KeyY', mod: true, scopes: ['reader'], labelKey: 'pdfPageEditorRedo' },
    { id: 'reader-stop', key: 'Escape', scopes: ['reader'], labelKey: 'shortcutStop' },
    ...POETRY_LINE_ACTIONS.map(action => ({ id: 'poetry-' + action.id, key: action.key, code: action.key.length === 1 ? 'Key' + action.key.toUpperCase() : undefined, scopes: ['poetry-line'], labelKey: action.labelKey })),
    { id: 'review-reveal', key: ' ', scopes: ['review'], labelKey: 'ctxReveal' },
    ...['1', '2', '3', '4'].map(key => ({ id: `review-grade-${key}`, key, code: `Digit${key}`, scopes: ['review'], labelKey: 'ctxGrade' as const })),
    ...['reader', 'quran'].flatMap(scope => [
        { id: scope + '-page-next', key: 'PageDown', scopes: [scope], labelKey: 'ctxNavigate' as const },
        { id: scope + '-page-previous', key: 'PageUp', scopes: [scope], labelKey: 'ctxNavigate' as const },
        { id: scope + '-space-next', key: ' ', aliases: ['Spacebar'], scopes: [scope], labelKey: 'ctxNavigate' as const },
        { id: scope + '-space-previous', key: ' ', aliases: ['Spacebar'], shift: true, scopes: [scope], labelKey: 'ctxNavigate' as const },
        ...['ArrowLeft', 'ArrowRight'].map(key => ({ id: scope + '-' + key, key, scopes: [scope], labelKey: 'ctxNavigate' as const })),
    ]),
    ...['ArrowUp', 'ArrowDown', 'Home', 'End'].map(key => ({ id: 'reader-' + key, key, scopes: ['reader'], labelKey: 'ctxNavigate' as const })),
    ...['poetry-line', 'board'].flatMap(scope => ['ArrowUp', 'ArrowDown', ...(scope === 'board' ? ['ArrowLeft', 'ArrowRight'] : [])].flatMap(key => [false, ...(scope === 'board' ? [true] : [])].map(shift => ({ id: scope + '-' + key + (shift ? '-large' : ''), key, shift, scopes: [scope], labelKey: 'ctxNavigate' as const })))),
    { id: 'review-close', key: 'Escape', scopes: ['review'], labelKey: 'close' },
    { id: 'board-delete', key: 'Delete', scopes: ['board'], labelKey: 'delete' },
];
export interface ShortcutEvent {
    key: string;
    code?: string;
    ctrlKey?: boolean;
    metaKey?: boolean;
    altKey?: boolean;
    shiftKey?: boolean;
    repeat?: boolean;
    isComposing?: boolean;
    defaultPrevented?: boolean;
    typing?: boolean;
    target?: unknown;
}
export function shortcutForEvent(event: ShortcutEvent, scope: string): ShortcutDefinition | null {
    if (event.defaultPrevented || event.repeat || event.isComposing || event.typing || isTextEntry(event.target))
        return null;
    return SHORTCUTS.find(s => (s.scopes.includes(scope) || s.scopes.includes('global')) &&
        !!s.mod === !!(event.ctrlKey || event.metaKey) && !!s.alt === !!event.altKey &&
        (s.key === '?' || !!s.shift === !!event.shiftKey) &&
        (s.key.toLowerCase() === event.key.toLowerCase() || s.code && (s.code === event.code || s.code.startsWith('Digit') && event.code === 'Numpad' + s.code.slice(5)) || s.aliases?.includes(event.key))) ?? null;
}
export function matchesShortcut(event: ShortcutEvent, id: string, scope = 'global'): boolean { return shortcutForEvent(event, scope)?.id === id; }
export function shortcutHint(id: string): string {
    const s = SHORTCUTS.find(entry => entry.id === id);
    return s ? [s.mod && 'Ctrl/Cmd', s.alt && 'Alt', s.shift && 'Shift', s.key === ' ' ? 'Space' : s.key.toUpperCase()].filter(Boolean).join(' + ') : '';
}
export function shortcutCollisions(shortcuts: readonly ShortcutDefinition[]): string[] {
    const collisions: string[] = [];
    shortcuts.forEach((a, i) => shortcuts.slice(i + 1).forEach(b => {
        const overlapping = a.scopes.includes('global') || b.scopes.includes('global') || a.scopes.some(scope => b.scopes.includes(scope));
        if (overlapping && !!a.mod === !!b.mod && !!a.alt === !!b.alt && !!a.shift === !!b.shift && (a.key.toLowerCase() === b.key.toLowerCase() || !!a.code && a.code === b.code))
            collisions.push(`${a.id}/${b.id}`);
    }));
    return collisions;
}

export const SHORTCUT_SCOPES: Readonly<Record<string, TranslationKey>> = {
    global: 'shortcutGlobalScope', reader: 'navReader', quran: 'navQuran', sunnah: 'navSunnah',
    bayan: 'navBayan', 'poetry-line': 'bayanSelectVerse', review: 'srsStartReview', board: 'notesWorkspaceTitle',
};
