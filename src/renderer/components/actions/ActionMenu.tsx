'use client';
import React from 'react';
import { Menu, type MenuProps } from '../ui/Menu';
import { contextActions, type ActionHandler, type ContextSurface } from './context-actions';
import type { TranslationKey } from '../../translations';
export function ActionMenu({ surface, handlers, t, ...props }: Omit<MenuProps, 'items'> & {
    surface: ContextSurface;
    handlers: Record<string, ActionHandler | undefined>;
    t: (key: TranslationKey) => string;
}) {
    return <Menu {...props} items={contextActions(surface, handlers, t)}/>;
}
