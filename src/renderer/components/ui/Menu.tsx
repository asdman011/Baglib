'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';

export interface MenuItemProps {
  label: React.ReactNode;
  icon?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
}

export interface MenuProps {
  trigger: (props: {
    'aria-haspopup': 'menu';
    'aria-expanded': boolean;
    onClick: () => void;
    ref: React.RefObject<HTMLButtonElement | null>;
  }) => React.ReactNode;
  items: MenuItemProps[];
  align?: 'start' | 'end';
  className?: string;
}

export const Menu: React.FC<MenuProps> = ({
  trigger,
  items,
  align = 'start',
  className = '',
}) => {
  const { dir } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const enabledIndices = items
    .map((item, idx) => (item.disabled ? -1 : idx))
    .filter((idx) => idx !== -1);

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      if (next && enabledIndices.length > 0) {
        setActiveIndex(enabledIndices[0]);
      } else {
        setActiveIndex(-1);
      }
      return next;
    });
  };

  const close = (returnFocus = true) => {
    setOpen(false);
    setActiveIndex(-1);
    if (returnFocus && triggerRef.current) {
      triggerRef.current.focus();
    }
  };

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close(true);
        return;
      }

      if (enabledIndices.length === 0) return;

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((curr) => {
          const currentPos = enabledIndices.indexOf(curr);
          const nextPos = (currentPos + 1) % enabledIndices.length;
          return enabledIndices[nextPos];
        });
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((curr) => {
          const currentPos = enabledIndices.indexOf(curr);
          const prevPos = (currentPos - 1 + enabledIndices.length) % enabledIndices.length;
          return enabledIndices[prevPos];
        });
      } else if (event.key === 'Home') {
        event.preventDefault();
        setActiveIndex(enabledIndices[0]);
      } else if (event.key === 'End') {
        event.preventDefault();
        setActiveIndex(enabledIndices[enabledIndices.length - 1]);
      } else if (event.key === 'Enter' || event.key === ' ') {
        if (activeIndex >= 0 && activeIndex < items.length) {
          const item = items[activeIndex];
          if (!item.disabled && item.onClick) {
            event.preventDefault();
            item.onClick();
            close(true);
          }
        }
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        close(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('pointerdown', handlePointerDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [open, activeIndex, items, enabledIndices]);

  // Focus the active menu item when index changes
  useEffect(() => {
    if (open && activeIndex >= 0 && menuRef.current) {
      const itemEl = menuRef.current.querySelector<HTMLElement>(
        `[data-menu-item-index="${activeIndex}"]`
      );
      itemEl?.focus();
    }
  }, [open, activeIndex]);

  return (
    <div className="relative inline-flex" dir={dir}>
      {trigger({
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        onClick: toggle,
        ref: triggerRef,
      })}

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-orientation="vertical"
          tabIndex={-1}
          className={`absolute top-full mt-1.5 z-50 min-w-44 py-1 bg-surface border border-border rounded-xl shadow-lg text-text text-xs font-sans overflow-hidden ${
            align === 'end' ? 'end-0' : 'start-0'
          } ${className}`}
        >
          {items.map((item, idx) => {
            const isFocused = activeIndex === idx;
            return (
              <button
                key={idx}
                type="button"
                role="menuitem"
                data-menu-item-index={idx}
                tabIndex={isFocused ? 0 : -1}
                disabled={item.disabled}
                onClick={() => {
                  if (item.disabled) return;
                  item.onClick?.();
                  close(true);
                }}
                onMouseEnter={() => {
                  if (!item.disabled) setActiveIndex(idx);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-start transition-colors select-none outline-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${
                  item.danger
                    ? isFocused
                      ? 'bg-danger/10 text-danger'
                      : 'text-danger hover:bg-danger/10'
                    : isFocused
                    ? 'bg-primary/10 text-primary'
                    : 'text-text hover:bg-canvas'
                }`}
              >
                {item.icon && (
                  <span className="shrink-0 inline-flex size-4 items-center justify-center" aria-hidden="true">
                    {item.icon}
                  </span>
                )}
                <span className="truncate flex-1">{item.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
