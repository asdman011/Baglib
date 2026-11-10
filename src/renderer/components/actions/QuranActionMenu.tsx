'use client';
import React from 'react';
import { Menu, type MenuProps } from '../ui/Menu';
import { quranActions } from './quran-actions';
export function QuranActionMenu({ input, tools, onTool, toolsLabel, ...props }: Omit<MenuProps, 'items'> & {
    input: Parameters<typeof quranActions>[0];
    tools: {
        id: string;
        label: string;
    }[];
    toolsLabel: string;
    onTool: (id: string) => void;
}) {
    return <Menu {...props} items={[...quranActions(input), {
                id: 'study-tools', label: toolsLabel,
                children: tools.map(tool => ({ ...tool, onClick: () => onTool(tool.id) })),
            }]}/>;
}
