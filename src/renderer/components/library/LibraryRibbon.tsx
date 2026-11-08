'use client';
import React from 'react';
import { useWorkspace } from '../context/WorkspaceContext';

export function LibraryRibbon({ children }: { children: React.ReactNode }) {
  const { t } = useWorkspace();
  const items = React.Children.toArray(children);
  const groups = ['add', 'view', 'pdf', 'care', 'online'] as const;
  const labels = { add: 'libraryRibbonAdd', view: 'libraryRibbonView', pdf: 'libraryRibbonPdf', care: 'libraryRibbonCare', online: 'libraryRibbonOnline' } as const;
  return <div className="w-full flex flex-wrap items-stretch gap-2" data-library-ribbon>
    {groups.map(group => {
      const controls = items.filter(item => React.isValidElement<{ 'data-ribbon-group'?: string }>(item) && (item.props['data-ribbon-group'] || 'view') === group);
      if (!controls.length) return null;
      return <section key={group} aria-label={t(labels[group])} className="min-w-0 max-w-full rounded-xl border border-subtle bg-canvas/40 px-2 py-1.5">
        <h3 className="px-1 pb-1 text-[10px] leading-relaxed font-medium text-muted">{t(labels[group])}</h3>
        <div className="flex flex-wrap items-center gap-1.5">{controls}</div>
      </section>;
    })}
  </div>;
}
