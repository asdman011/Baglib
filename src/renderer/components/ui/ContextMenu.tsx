'use client';
import React, { useRef, useState } from 'react';
import { Menu, type MenuItemProps } from './Menu';
import { isTextEntry } from '../actions/context-actions';
import { matchesShortcut } from '../actions/shortcuts';
/** A surface keeps its markup and current callbacks while sharing mouse, keyboard and touch opening. */
export function ContextMenu({ children, items = [], onOpenMenu, as = 'div', ...props }: React.HTMLAttributes<HTMLElement> & {
    children?: React.ReactNode;
    items?: MenuItemProps[];
    onOpenMenu?: () => MenuItemProps[];
    as?: 'div' | 'article' | 'section' | 'tr' | 'li' | 'nav';
    ref?: React.Ref<HTMLElement>;
}) {
    const [anchor, setAnchor] = useState<{
        x: number;
        y: number;
        origin: HTMLElement;
        items: MenuItemProps[];
    } | null>(null);
    const touch = useRef<{
        timer: ReturnType<typeof setTimeout>;
        x: number;
        y: number;
    } | null>(null);
    const longPressed = useRef(false);
    const cancel = () => { if (touch.current)
        clearTimeout(touch.current.timer); touch.current = null; };
    React.useEffect(() => cancel, []);
    const open = (node: HTMLElement, x: number, y: number) => {
        const resolvedItems = onOpenMenu ? onOpenMenu() : items;
        if (resolvedItems.length)
            setAnchor({ x, y, origin: node, items: resolvedItems });
    };
    const content = React.createElement(as, {
        ...props,
        tabIndex: props.tabIndex ?? 0,
        'data-context-surface': true,
        onContextMenu: (event: React.MouseEvent<HTMLElement>) => {
            props.onContextMenu?.(event);
            if (event.defaultPrevented || isTextEntry(event.target))
                return;
            event.preventDefault();
            event.stopPropagation();
            open(event.currentTarget, event.clientX, event.clientY);
        },
        onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
            if (matchesShortcut(event, 'context-menu') || matchesShortcut(event, 'context-menu-key')) {
                event.preventDefault();
                event.stopPropagation();
                const r = event.currentTarget.getBoundingClientRect();
                open(event.currentTarget, r.x + r.width / 2, r.y + Math.min(r.height, 40));
                return;
            }
            props.onKeyDown?.(event);
        },
        onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
            props.onPointerDown?.(event);
            if (event.pointerType !== 'touch' || isTextEntry(event.target) || (event.target as HTMLElement).closest('[data-context-surface]') !== event.currentTarget)
                return;
            cancel();
            longPressed.current = false;
            const node = event.currentTarget, { clientX: x, clientY: y } = event;
            touch.current = { x, y, timer: setTimeout(() => { longPressed.current = true; open(node, x, y); }, 550) };
        },
        onPointerMove: (event: React.PointerEvent<HTMLElement>) => { props.onPointerMove?.(event); if (event.pointerType === 'touch' && touch.current && Math.hypot(event.clientX - touch.current.x, event.clientY - touch.current.y) > 10)
            cancel(); },
        onPointerUp: (event: React.PointerEvent<HTMLElement>) => { cancel(); props.onPointerUp?.(event); },
        onPointerCancel: (event: React.PointerEvent<HTMLElement>) => { cancel(); props.onPointerCancel?.(event); },
        onClickCapture: (event: React.MouseEvent<HTMLElement>) => {
            const native = event.nativeEvent as MouseEvent & { pointerType?: string; sourceCapabilities?: { firesTouchEvents?: boolean } };
            const fromTouch = native.pointerType === 'touch' || native.sourceCapabilities?.firesTouchEvents;
            if (longPressed.current && fromTouch) {
            event.preventDefault();
            event.stopPropagation();
            longPressed.current = false;
        }
        else {
            longPressed.current = false;
            props.onClickCapture?.(event);
        } },
    }, children);
    return <>{content}{anchor && <Menu portal anchor={anchor} items={anchor.items} onClose={() => setAnchor(null)} returnFocus={anchor.origin}/>}</>;
}
