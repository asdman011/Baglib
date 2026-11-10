'use client';
import React, { useEffect, useState } from 'react';
import { Menu, type MenuItemProps } from '../ui/Menu';
import { useWorkspace } from '../context/WorkspaceContext';
import { NEW_OBJECT_ACTIONS } from '../layout/nav-model';
import { runNewObjectAction } from '../layout/NewObjectMenu';
import { isTextEntry } from './context-actions';
import { matchesShortcut, shortcutHint } from './shortcuts';
export function GlobalContextMenu() {
    const workspace = useWorkspace();
    const { t, viewMode } = workspace;
    const [menu, setMenu] = useState<{
        x: number;
        y: number;
        origin: HTMLElement;
        navigation: HTMLElement | null;
    } | null>(null);
    useEffect(() => {
        const open = (target: HTMLElement, x: number, y: number) => { setMenu({ x, y, origin: target, navigation: target.closest<HTMLElement>('[data-nav-item]') }); };
        const context = (event: MouseEvent) => { if (event.defaultPrevented || isTextEntry(event.target))
            return; event.preventDefault(); open(event.target as HTMLElement, event.clientX, event.clientY); };
        const key = (event: KeyboardEvent) => {
            if (!(matchesShortcut(event, 'context-menu') || matchesShortcut(event, 'context-menu-key')))
                return;
            const target = event.target as HTMLElement;
            if (target.closest?.('[data-context-surface],.mushaf-svg-surface'))
                return;
            event.preventDefault();
            const r = target.getBoundingClientRect?.();
            open(target, r?.x ?? 20, r?.bottom ?? 80);
        };
        let longPressTarget: HTMLElement | null = null;
        let press: {
            timer: ReturnType<typeof setTimeout>;
            x: number;
            y: number;
        } | null = null;
        const cancel = () => { if (press)
            clearTimeout(press.timer); press = null; };
        const down = (event: PointerEvent) => {
            longPressTarget = null;
            const target = event.target as HTMLElement;
            if (event.pointerType !== 'touch' || isTextEntry(target) || target.closest?.('[data-context-surface],.mushaf-svg-surface,[data-reader-content]') || (!target.closest?.('[data-nav-item]') && target.closest?.('button,a')))
                return;
            cancel();
            const x = event.clientX, y = event.clientY;
            press = { x, y, timer: setTimeout(() => { longPressTarget = target; open(target, x, y); }, 550) };
        };
        const move = (event: PointerEvent) => { if (event.pointerType === 'touch' && press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10)
            cancel(); };
        window.addEventListener('contextmenu', context);
        window.addEventListener('keydown', key);
        const click = (event: MouseEvent) => {
            const native = event as MouseEvent & { pointerType?: string; sourceCapabilities?: { firesTouchEvents?: boolean } };
            if (longPressTarget && (native.pointerType === 'touch' || native.sourceCapabilities?.firesTouchEvents)) {
                event.preventDefault(); event.stopImmediatePropagation();
            }
            longPressTarget = null;
        };
        window.addEventListener('click', click, true);
        document.addEventListener('pointerdown', down);
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', cancel);
        document.addEventListener('pointercancel', cancel);
        return () => {
            cancel();
            window.removeEventListener('contextmenu', context);
            window.removeEventListener('keydown', key);
            window.removeEventListener('click', click, true);
            document.removeEventListener('pointerdown', down);
            document.removeEventListener('pointermove', move);
            document.removeEventListener('pointerup', cancel);
            document.removeEventListener('pointercancel', cancel);
        };
    }, []);
    const contextView = menu?.navigation?.dataset.navItem ?? viewMode;
    const relevant = contextView === 'library' ? ['import-book', 'add-physical-book', 'new-note'] : contextView.startsWith('notes') ? ['new-note', 'new-card'] : contextView === 'planner' ? ['new-task'] : contextView === 'pathways' ? ['new-research', 'new-note'] : ['new-note', 'new-card'];
    const items: MenuItemProps[] = NEW_OBJECT_ACTIONS.filter(action => relevant.includes(action.id)).map(action => ({ id: action.id, label: t(action.labelKey), icon: React.createElement(action.icon, { size: 14 }), shortcut: action.id === 'new-note' ? shortcutHint('new-note') : undefined, onClick: () => runNewObjectAction(action.id, workspace) }));
    if (menu?.navigation)
        items.unshift({ id: 'navigate', label: t('ctxOpen'), onClick: () => menu.navigation?.click() });
    return menu && <Menu portal anchor={menu} items={items} returnFocus={menu.origin} onClose={() => setMenu(null)}/>;
}
