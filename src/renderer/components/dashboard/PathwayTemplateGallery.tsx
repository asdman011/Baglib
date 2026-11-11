'use client';

import React from 'react';
import { Layers, Pencil, Sparkles, Trash2 } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { Button, Card, Chip, EmptyState } from '../ui';
import { ContextMenu } from '../ui/ContextMenu';
import { summarizeOutline } from '../../../shared/pathway-model';
import type { PathwayKind, PathwayTemplate } from '../../../shared/pathways';
import type { TranslationKey } from '../../translations';

/** Ready-made structures. Names and outlines are localized text; they name no books (ADR-009). */
export const BUILT_IN_TEMPLATES: { id: string; name: TranslationKey; outline: TranslationKey; kind: PathwayKind }[] = [
  { id: 'research', name: 'pathwayTemplateResearch', outline: 'pathwayOutlineResearch', kind: 'research' },
  { id: 'book', name: 'pathwayTemplateBook', outline: 'pathwayOutlineBook', kind: 'curriculum' },
  { id: 'staged', name: 'pathwayTemplateStaged', outline: 'pathwayOutlineStaged', kind: 'curriculum' },
];

export type GalleryTemplate = PathwayTemplate & { builtIn: boolean };

function TemplateCard({ template, onUse, onCustomize, onRemove }: { template: GalleryTemplate; onUse: () => void; onCustomize: () => void; onRemove?: () => void }) {
  const { t } = useWorkspace();
  const summary = summarizeOutline(template.outline);
  return <ContextMenu as="li" className="list-none" data-template-card={template.id} items={[
    { id: 'use', label: t('pathwayTemplateUse'), icon: <Layers className="size-4" />, onClick: onUse },
    { id: 'customize', label: t('pathwayMenuCustomize'), icon: <Pencil className="size-4" />, onClick: onCustomize },
    ...(onRemove ? [{ id: 'remove', label: t('pathwayRemoveTemplate'), icon: <Trash2 className="size-4" />, danger: true, onClick: onRemove }] : []),
  ]}>
    <Card className="flex h-full flex-col gap-3 p-4">
      <div className="min-w-0 space-y-1.5">
        <h4 dir="auto" className="font-display text-base font-bold leading-snug break-words">{template.name}</h4>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-text-muted">
          <Chip label={t(template.kind === 'research' ? 'pathwayKindResearch' : 'pathwayKindCurriculum')} />
          <span>{t('pathwayTemplateSteps', { steps: summary.steps })}</span>
        </div>
        {summary.sections.length > 0 && <p dir="auto" className="text-xs leading-relaxed text-text-muted">{summary.sections.join(' · ')}</p>}
      </div>
      <Button size="sm" className="mt-auto self-start" data-template-use={template.id} icon={<Layers className="size-4" />} onClick={onUse}>{t('pathwayTemplateUse')}</Button>
    </Card>
  </ContextMenu>;
}

/** Built-in and personal templates side by side. Personal ones live in the existing pathway template setting. */
export function TemplateGallery({ templates, onUse, onCustomize, onRemove }: {
  templates: PathwayTemplate[];
  onUse: (template: GalleryTemplate) => void;
  onCustomize: (template: GalleryTemplate) => void;
  onRemove: (template: GalleryTemplate) => void;
}) {
  const { t } = useWorkspace();
  const builtIn: GalleryTemplate[] = BUILT_IN_TEMPLATES.map(item => ({ id: item.id, name: t(item.name), kind: item.kind, outline: t(item.outline), builtIn: true }));
  const mine: GalleryTemplate[] = templates.map(item => ({ ...item, builtIn: false }));
  const grid = 'grid gap-3 @min-[34rem]:grid-cols-2';
  return <div data-template-gallery className="space-y-5">
    <section className="space-y-2.5" aria-label={t('pathwayTemplatesBuiltIn')}>
      <h3 className="flex items-center gap-1.5 text-sm font-bold"><Sparkles className="size-4 text-primary-text" />{t('pathwayTemplatesBuiltIn')}</h3>
      <ul className={grid}>{builtIn.map(template => <TemplateCard key={template.id} template={template} onUse={() => onUse(template)} onCustomize={() => onCustomize(template)} />)}</ul>
    </section>
    <section className="space-y-2.5" aria-label={t('pathwayTemplatesMine')} data-template-mine>
      <h3 className="text-sm font-bold">{t('pathwayTemplatesMine')}</h3>
      {mine.length === 0
        ? <EmptyState className="rounded-2xl border border-dashed border-border p-6 sm:p-8" icon={<Layers className="size-5" />} title={t('pathwayTemplatesMineEmptyDesc')} action={<Button size="sm" onClick={() => onCustomize(builtIn[0])}>{t('pathwayMenuCustomize')}</Button>} />
        : <ul className={grid}>{mine.map(template => <TemplateCard key={template.id} template={template} onUse={() => onUse(template)} onCustomize={() => onCustomize(template)} onRemove={() => onRemove(template)} />)}</ul>}
    </section>
  </div>;
}
