'use client';

import React from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { Badge } from '../ui/Badge';

export interface MetadataDiffRow {
  id: string;
  label: string;
  current: React.ReactNode;
  incoming: React.ReactNode;
  hasCurrent: boolean;
  hasIncoming: boolean;
  different: boolean;
  selected: boolean;
}

/** The same selectable, stacked-on-mobile comparison for both enrichment paths. */
export function MetadataDiffView({ rows, onToggle }: { rows: MetadataDiffRow[]; onToggle: (id: string) => void }) {
  const { t } = useWorkspace();
  return <div data-metadata-diff className="space-y-3">
    {rows.map(row => <section key={row.id} className="min-w-0 rounded-xl border border-subtle p-3 sm:p-4 space-y-3">
      <label className="flex flex-wrap items-center gap-2 text-sm leading-relaxed cursor-pointer">
        <input type="checkbox" checked={row.selected} disabled={!row.hasIncoming} onChange={() => onToggle(row.id)} className="size-4 accent-primary shrink-0" />
        <span className="font-semibold">{row.label}</span>
        <Badge variant={row.hasCurrent && row.different ? 'warning' : 'default'} className="leading-relaxed">
          {t(!row.hasCurrent && row.hasIncoming ? 'statusNew' : row.different ? 'statusOverwrite' : 'statusIdentical')}
        </Badge>
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm leading-loose">
        <div className="min-w-0 rounded-lg bg-canvas p-3 break-words [overflow-wrap:anywhere]"><p className="text-xs text-muted">{t('diffCurrent')}</p>{row.current || t('libraryEmpty')}</div>
        <div className="min-w-0 rounded-lg border border-primary/20 bg-primary/5 p-3 break-words [overflow-wrap:anywhere]"><p className="text-xs text-muted">{t('diffIncoming')}</p>{row.incoming || t('libraryEmpty')}</div>
      </div>
    </section>)}
  </div>;
}
