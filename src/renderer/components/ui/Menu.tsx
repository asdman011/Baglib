'use client';
import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { menuPosition } from '../actions/context-actions';
export interface MenuItemProps {
    id?: string;
    label: React.ReactNode;
    icon?: React.ReactNode;
    shortcut?: string;
    disabledReason?: string;
    children?: MenuItemProps[];
    onClick?: () => unknown;
    disabled?: boolean;
    danger?: boolean;
}
export interface MenuProps {
    trigger?: (props: {
        'aria-haspopup': 'menu';
        'aria-expanded': boolean;
        onClick: () => void;
        ref: React.RefObject<HTMLButtonElement | null>;
    }) => React.ReactNode;
    items: MenuItemProps[];
    onOpenMenu?: () => MenuItemProps[];
    align?: 'start' | 'end';
    className?: string;
    portal?: boolean;
    anchor?: {
        x: number;
        y: number;
    } | null;
    onClose?: () => void;
    returnFocus?: HTMLElement | null;
}
export const Menu: React.FC<MenuProps> = ({ trigger, items: suppliedItems, onOpenMenu, align = 'start', className = '', portal = false, anchor, onClose, returnFocus }) => {
    const { dir, t } = useWorkspace();
    const [openedItems, setOpenedItems] = useState<MenuItemProps[] | null>(null);
    const items = openedItems ?? suppliedItems;
    const [localOpen, setLocalOpen] = useState(false);
    const open = anchor !== undefined ? !!anchor : localOpen;
    const [active, setActive] = useState(0);
    const [submenu, setSubmenu] = useState<{
        items: MenuItemProps[];
        anchor: {
            x: number;
            y: number;
        };
        parent: HTMLElement;
    } | null>(null);
    const [position, setPosition] = useState({ left: 8, top: 8 });
    const [error, setError] = useState(false);
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const id = useId();
    const close = (focus = true) => {
        setLocalOpen(false);
        setSubmenu(null);
        onClose?.();
        if (focus)
            (returnFocus ?? triggerRef.current)?.focus({ preventScroll: true });
    };
    useLayoutEffect(() => {
        if (!open)
            return;
        const node = menuRef.current;
        const origin = anchor ?? (() => {
            const r = triggerRef.current?.getBoundingClientRect?.();
            return { x: r ? (align === 'end') === (dir === 'ltr') ? r.right : r.left : 8, y: r?.bottom ?? 8 };
        })();
        const rect = node?.getBoundingClientRect?.();
        const size = { width: rect?.width || 260, height: rect?.height || 300 };
        const direction = !anchor && align === 'end' ? (dir === 'rtl' ? 'ltr' : 'rtl') : dir;
        setPosition(menuPosition(origin, size, { width: window.innerWidth || 1024, height: window.innerHeight || 768 }, direction));
        node?.querySelector<HTMLElement>(`[data-menu-item-index="${active}"]`)?.focus();
    }, [open, anchor, dir, align, active]);
    const run = (item: MenuItemProps, button: HTMLElement) => {
        if (item.disabled)
            return;
        if (item.children?.length) {
            const r = button.getBoundingClientRect();
            setSubmenu({ items: item.children, anchor: { x: dir === 'rtl' ? r.left - 4 : r.right + 4, y: r.top }, parent: button });
            return;
        }
        try {
            const result = item.onClick?.();
            if (result instanceof Promise)
                void result.catch(() => window.dispatchEvent(new CustomEvent('baglib:action-failed')));
            close();
        }
        catch {
            setError(true);
        }
    };
    useEffect(() => {
        if (!open)
            return;
        const key = (event: KeyboardEvent) => {
            const closest = (event.target as HTMLElement)?.closest?.('[role="menu"]');
            if (closest && closest !== menuRef.current || submenu)
                return;
            if (event.key === 'Tab') {
                close(false);
                return;
            }
            if (event.key === 'Escape' || event.key === (dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft')) {
                event.preventDefault();
                event.stopImmediatePropagation();
                close();
                return;
            }
            const enabled = items.map((item, i) => item.disabled && !item.disabledReason ? -1 : i).filter(i => i >= 0);
            if (!enabled.length)
                return;
            const index = enabled.indexOf(active);
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                event.stopImmediatePropagation();
                const delta = event.key === 'ArrowDown' ? 1 : -1;
                setActive(enabled[(index + delta + enabled.length) % enabled.length]);
            }
            else if (event.key === 'Home' || event.key === 'End') {
                event.preventDefault();
                setActive(event.key === 'Home' ? enabled[0] : enabled[enabled.length - 1]);
            }
            else if (event.key === 'Enter' || event.key === ' ' || event.key === (dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight')) {
                event.preventDefault();
                event.stopImmediatePropagation();
                const button = menuRef.current?.querySelector<HTMLElement>(`[data-menu-item-index="${active}"]`);
                if (button && items[active])
                    run(items[active], button);
            }
        };
        const outside = (event: PointerEvent) => { if (!(event.target as HTMLElement)?.closest?.('[data-baglib-menu]') && !triggerRef.current?.contains(event.target as Node))
            close(false); };
        const layout = () => close(false);
        window.addEventListener('keydown', key);
        window.addEventListener('pointerdown', outside);
        window.addEventListener('resize', layout);
        window.addEventListener('blur', layout);
        return () => { window.removeEventListener('keydown', key); window.removeEventListener('pointerdown', outside); window.removeEventListener('resize', layout); window.removeEventListener('blur', layout); };
    });
    const panel = open && <div ref={menuRef} id={id} dir={dir} role="menu" data-baglib-menu aria-label={t('ctxActions')} aria-orientation="vertical" tabIndex={-1} style={portal ? { left: position.left, top: position.top, maxHeight: 'calc(100dvh - 16px)' } : undefined} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); }} onClick={event => event.stopPropagation()} className={`${portal ? 'fixed z-[200]' : `absolute top-full z-50 mt-1.5 ${align === 'end' ? 'end-0' : 'start-0'}`} w-64 max-w-[calc(100vw-16px)] overflow-y-auto rounded-xl border border-border bg-surface py-1 text-xs leading-relaxed text-text shadow-2xl font-sans ${className}`}>
    {items.map((item, index) => <button key={item.id ?? index} type="button" role="menuitem" data-menu-action={item.id} data-menu-item-index={index} aria-disabled={item.disabled || undefined} aria-haspopup={item.children?.length ? 'menu' : undefined} aria-expanded={item.children?.length ? submenu?.parent?.dataset.menuItemIndex === String(index) : undefined} title={item.disabledReason} tabIndex={index === active ? 0 : -1} disabled={item.disabled && !item.disabledReason} onMouseEnter={() => { if (submenu && submenu.parent.dataset.menuItemIndex !== String(index)) setSubmenu(null); setActive(index); }} onClick={event => run(item, event.currentTarget)} className={`flex w-full items-center gap-2 px-3 py-2 text-start outline-none ${item.disabled ? 'opacity-50 cursor-not-allowed' : item.danger ? 'text-danger hover:bg-danger/10 focus:bg-danger/10' : 'hover:bg-primary/10 focus:bg-primary/15 focus:text-primary-text'}`}>
      {item.icon && <span aria-hidden="true" className="shrink-0">{item.icon}</span>}
      <span className="min-w-0 flex-1 whitespace-normal break-words">{item.label}{item.disabledReason && <small className="block mt-0.5 leading-relaxed text-text-muted">{item.disabledReason}</small>}</span>
      {item.shortcut && <kbd dir="ltr" className="shrink-0 text-[10px] text-text-muted">{item.shortcut}</kbd>}
      {!!item.children?.length && <ChevronRight size={13} aria-hidden="true" className="shrink-0 rtl:rotate-180"/>}
    </button>)}
    {error && <p role="alert" className="px-3 py-2 text-danger">{t('studyActionFailed')}</p>}
  </div>;
    return <>
    {trigger && <span className="relative inline-flex" dir={dir}>{trigger({ 'aria-haspopup': 'menu', 'aria-expanded': open, onClick: () => { setOpenedItems(onOpenMenu?.() ?? null); setActive(0); setLocalOpen(value => !value); }, ref: triggerRef })}{!portal && panel}</span>}
    {portal && panel && createPortal(panel, document.fullscreenElement ?? document.body)}
    {!trigger && !portal && panel}
    {submenu && <Menu portal anchor={submenu.anchor} items={submenu.items.map(item => ({ ...item, onClick: item.onClick ? () => { const result = item.onClick?.(); close(); return result; } : undefined }))} onClose={() => setSubmenu(null)} returnFocus={submenu.parent}/>}
  </>;
};
