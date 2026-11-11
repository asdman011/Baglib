'use client';
import { FeedbackSkeleton } from '../ui/FeedbackSkeleton';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowDown, ArrowUp, BookOpen, Calendar, Check, CheckCircle2, Edit3, ExternalLink, FileText, Layers, Link2, Network, Pin, PinOff, Play, Plus, Route, Sparkles, Trash2, X } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useStudyNotes } from '../../hooks/useStudyNotes';
import { StudyLinkPicker } from '../notes/StudyLinkPicker';
import { navigateStudyReference, openStudyNote } from '../../utils/study-navigation';
import { studyLinks } from '../../../shared/study-notes';
import { parseOutline, type Pathway, type PathwayDetail, type PathwayItem, type PathwayKind, type PathwayTemplate, type ReferenceFormat } from '../../../shared/pathways';
import { PATHWAY_TABS, copyTemplate, pathwayProgress, percentOf, placeItem, tabMatches, templateFromPathway, type PathwayTab } from '../../../shared/pathway-model';
import { Button, Card, EmptyState, TabPanel, Tabs } from '../ui';
import { useToast } from '../ui/Toast';
import { ContextMenu } from '../ui/ContextMenu';
import type { MenuItemProps } from '../ui';
import { OnlineCoursesPanel } from './OnlineCoursesPanel';
import { CurriculumExamModal } from './CurriculumExamModal';
import { TemplateGallery, type GalleryTemplate } from './PathwayTemplateGallery';
import type { CurriculumExamConfig } from '../../../shared/curriculum-exam';
import { parseCivilDate } from '../../../shared/study-planner';

const control = 'rounded-lg border border-border bg-surface px-2.5 py-2 text-sm text-text min-w-0';
const ico = 'size-4';
const TAB_LABEL = { all: 'pathwaysTabAll', research: 'pathwaysTabResearch', curriculum: 'pathwaysTabCurricula', templates: 'pathwaysTabTemplates' } as const;

type Draft = { name: string; kind: PathwayKind; outline: string };
type OpenItem = (item: PathwayItem) => void;

function ProgressBar({ done, total, label, className = '' }: { done: number; total: number; label: string; className?: string }) {
  return <div className={`h-2 overflow-hidden rounded-full bg-border/60 ${className}`} role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label={label}>
    <div className="h-full rounded-full bg-success transition-[width]" style={{ width: `${percentOf(done, total)}%` }} />
  </div>;
}

function Creator({ templates, setTemplates, draft, onCreated, onError }: { templates: PathwayTemplate[]; setTemplates: React.Dispatch<React.SetStateAction<PathwayTemplate[]>>; draft: Draft | null; onCreated: (pathway: Pathway) => void; onError: () => void }) {
  const { t, lang } = useWorkspace();
  const [kind, setKind] = useState<PathwayKind>(draft?.kind ?? 'research');
  const [name, setName] = useState(draft?.name ?? '');
  const [outline, setOutline] = useState(draft?.outline ?? '');
  const [subject, setSubject] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [drafted, setDrafted] = useState(false);
  const [draftFailed, setDraftFailed] = useState(false);
  const steps = useMemo(() => parseOutline(outline).length, [outline]);

  const aiDraft = async () => {
    setDrafting(true); setDraftFailed(false);
    try { setOutline(await window.electronAPI.pathways.draft(subject, lang)); setKind('curriculum'); setDrafted(true); if (!name.trim()) setName(subject); }
    catch { setDraftFailed(true); }
    finally { setDrafting(false); }
  };
  const create = async () => {
    try {
      onCreated(await window.electronAPI.pathways.save({ name, description: '', kind, outline }));
      setName(''); setOutline(''); setDrafted(false);
    } catch { onError(); }
  };
  const remember = async () => {
    try { const saved = await window.electronAPI.pathways.saveTemplate({ name, kind, outline }); setTemplates(current => [...current, saved]); }
    catch { onError(); }
  };

  return <Card className="space-y-3 p-4" data-pathway-creator-form>
    <h3 className="text-sm font-bold">{t('pathwayCustomizeTitle')}</h3>
    <input className={`${control} w-full`} value={name} onChange={event => setName(event.target.value)} maxLength={200} placeholder={t('pathwayName')} aria-label={t('pathwayName')} dir="auto" />
    <select className={`${control} w-full`} value={kind} onChange={event => setKind(event.target.value as PathwayKind)} aria-label={t('pathwayKind')}>
      <option value="research">{t('pathwayKindResearch')}</option><option value="curriculum">{t('pathwayKindCurriculum')}</option>
    </select>
    <div className="flex flex-wrap gap-2"><input className={`${control} min-w-[10rem] flex-1`} value={subject} onChange={event => setSubject(event.target.value)} maxLength={300} placeholder={t('pathwayAiSubject')} aria-label={t('pathwayAiSubject')} dir="auto" /><Button variant="secondary" size="sm" className="shrink-0 self-center" icon={<Sparkles className={ico} />} disabled={drafting || !subject.trim()} onClick={() => void aiDraft()}>{t(drafting ? 'pathwayAiDrafting' : 'pathwayAiDraft')}</Button></div>
    {draftFailed && <p role="alert" className="text-xs leading-relaxed">{t('pathwayAiError')}</p>}
    <textarea className={`${control} w-full`} rows={8} value={outline} onChange={event => setOutline(event.target.value)} maxLength={20000} placeholder={t('pathwayOutlineHint')} aria-label={t('pathwayOutline')} dir="auto" />
    {drafted && <p className="text-xs leading-relaxed text-text-muted">{t('pathwayAiNotice')}</p>}
    <div className="flex flex-wrap gap-2">
      <Button size="sm" icon={<Plus className={ico} />} disabled={!name.trim()} onClick={() => void create()}>{t('pathwayCreate')}</Button>
      <Button size="sm" variant="secondary" disabled={!name.trim() || !steps} onClick={() => void remember()}>{t('pathwaySaveTemplate')}</Button>
    </div>
    {templates.length > 0 && <p className="text-xs text-text-muted">{t('pathwayTemplatesMine')}: {templates.length}</p>}
  </Card>;
}

function ItemRow({ item, first, last, onMove, onChange, onOpen, onError }: { item: PathwayItem; first: boolean; last: boolean; onMove: (delta: number) => void; onChange: () => void; onOpen: OpenItem; onError: () => void }) {
  const { t } = useWorkspace();
  const api = window.electronAPI.pathways;
  const { showToast } = useToast();
  const act = (work: Promise<void>) => { void work.then(onChange).catch(onError); };
  const step = item.kind === 'step';
  const items: MenuItemProps[] = [
    ...(step
      ? [{ id: 'toggle', label: t(item.done ? 'pathwayMenuMarkOpen' : 'pathwayMenuMarkDone'), icon: <CheckCircle2 className={ico} />, onClick: () => act(api.setDone(item.id, !item.done)) }]
      : [{ id: 'open', label: t('pathwayMenuOpen'), icon: <ExternalLink className={`${ico} rtl:-scale-x-100`} />, onClick: () => onOpen(item) },
         { id: 'pin', label: t(item.pinned ? 'pathwayUnpin' : 'pathwayPin'), icon: item.pinned ? <PinOff className={ico} /> : <Pin className={ico} />, onClick: () => act(api.setPinned(item.id, !item.pinned)) }]),
    { id: 'up', label: t('pathwayMoveUp'), icon: <ArrowUp className={ico} />, disabled: first, onClick: () => onMove(-1) },
    { id: 'down', label: t('pathwayMoveDown'), icon: <ArrowDown className={ico} />, disabled: last, onClick: () => onMove(1) },
    { id: 'remove', label: t('pathwayRemoveItem'), icon: <Trash2 className={ico} />, danger: true, onClick: () => act(api.removeItem(item.id).then(() => { showToast({ message: t('feedbackRemoved') }); })) },
  ];
  const sourceIcon = item.reference?.startsWith('note:') ? <FileText className="size-4 shrink-0 text-text-muted" /> : item.reference ? <BookOpen className="size-4 shrink-0 text-text-muted" /> : <ExternalLink className="size-4 shrink-0 text-text-muted rtl:-scale-x-100" />;
  return <ContextMenu as="li" items={items} data-pathway-item={item.id} data-pathway-item-kind={item.kind} className="flex items-center gap-2.5 rounded-xl border border-border bg-surface px-3 py-2 outline-none focus-visible:outline-2 focus-visible:outline-focus">
    {step
      ? <input type="checkbox" checked={item.done} onChange={event => act(api.setDone(item.id, event.target.checked))} aria-label={item.title} className="size-4 shrink-0 accent-[var(--color-primary)]" />
      : sourceIcon}
    {step
      ? <span dir="auto" className={`min-w-0 flex-1 break-words text-sm leading-loose ${item.done ? 'text-text-muted line-through' : ''}`}>{item.title}</span>
      : <button type="button" dir="auto" className="min-w-0 flex-1 break-words text-start text-sm leading-loose underline-offset-2 hover:underline" onClick={() => onOpen(item)}>{item.title}</button>}
    {item.pinned && <Pin className="size-3.5 shrink-0 text-primary-text" aria-hidden="true" />}
  </ContextMenu>;
}

function Detail({ pathway, onChange, onRemoved, onError, onOpen, onSaveTemplate }: { pathway: PathwayDetail; onChange: () => void; onRemoved: () => void; onError: () => void; onOpen: OpenItem; onSaveTemplate: (pathway: PathwayDetail) => void }) {
  const { t, setViewMode, lang } = useWorkspace();
  const { showToast } = useToast();
  const [prereqMap, setPrereqMap] = useState<Record<string, string[]>>({});
  const [cycleError, setCycleError] = useState<string | null>(null);
  const [editingSectionPrereqs, setEditingSectionPrereqs] = useState<string | null>(null);
  const [renamingSection, setRenamingSection] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [examConfig, setExamConfig] = useState<CurriculumExamConfig | null>(null);
  const [isExamModalOpen, setIsExamModalOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    if (pathway.kind === 'curriculum') {
      window.electronAPI.pathwayExam?.getConfig?.(pathway.id).then(cfg => { if (alive && cfg) setExamConfig(cfg); }).catch(() => {});
      window.electronAPI.pathwayPrerequisites?.get?.(pathway.id)
        .then(res => { if (alive && res) setPrereqMap(res); })
        .catch(() => {});
    }
    return () => { alive = false; };
  }, [pathway.id, pathway.kind]);

  const handleTogglePrereq = async (secName: string, depName: string) => {
    const current = prereqMap[secName] || [];
    const updated = current.includes(depName) ? current.filter(d => d !== depName) : [...current, depName];
    const nextMap = { ...prereqMap, [secName]: updated };
    const res = await window.electronAPI.pathwayPrerequisites?.save?.(pathway.id, nextMap);
    if (res && !res.success && res.cycle) setCycleError(res.cycle.join(lang === 'ar' ? ' ← ' : ' → '));
    else { setCycleError(null); setPrereqMap(nextMap); }
  };
  const handleRenameSection = async (oldName: string) => {
    const trimmed = renameDraft.trim();
    if (!trimmed || trimmed === oldName) { setRenamingSection(null); return; }
    await window.electronAPI.pathwayPrerequisites?.renameSection?.(pathway.id, oldName, trimmed);
    setRenamingSection(null);
    onChange();
  };
  const handleDeleteSection = async (secName: string) => {
    if (window.confirm(`${t('pathwayDeleteSection')} "${secName}"?`)) {
      await window.electronAPI.pathwayPrerequisites?.deleteSection?.(pathway.id, secName);
      showToast({ message: t('feedbackRemoved') });
      onChange();
    }
  };
  const { notes } = useStudyNotes();
  const api = window.electronAPI.pathways;
  const [section, setSection] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [step, setStep] = useState('');
  const [exported, setExported] = useState(false);
  const progress = useMemo(() => pathwayProgress(pathway.items), [pathway.items]);
  const sections = useMemo(() => [...new Set(pathway.items.map(item => item.section))], [pathway.items]);
  const middle = pathway.items.filter(item => placeItem(item) === 'middle');
  const end = pathway.items.filter(item => placeItem(item) === 'end');
  const middleSections = sections.filter(name => middle.some(item => item.section === name));
  const pinned = pathway.items.filter(item => item.pinned && placeItem(item) === 'middle');

  const move = (item: PathwayItem, delta: number) => {
    const peers = pathway.items.filter(row => row.section === item.section);
    const swap = peers[peers.indexOf(item) + delta];
    if (!swap) return;
    const ids = pathway.items.map(row => row.id === item.id ? swap.id : row.id === swap.id ? item.id : row.id);
    void api.reorder(pathway.id, ids).then(onChange).catch(onError);
  };
  const addResource = (text: string) => {
    const link = studyLinks(text)[0];
    if (link) void api.addItem({ pathwayId: pathway.id, section, kind: 'resource', reference: link.target, title: link.label }).then(onChange).catch(onError);
  };
  const addLink = () => { void api.addItem({ pathwayId: pathway.id, section, kind: 'link', title: linkTitle, url: linkUrl }).then(() => { setLinkTitle(''); setLinkUrl(''); onChange(); }).catch(onError); };
  const addStep = () => { void api.addStep(pathway.id, section, step).then(() => { setStep(''); onChange(); }).catch(onError); };
  const exportAs = (format: ReferenceFormat) => { void api.exportReferences(pathway.id, format).then(setExported).catch(onError); };
  const remove = () => { if (window.confirm(t('pathwayDeleteConfirm'))) void api.remove(pathway.id).then(() => { showToast({ message: t('feedbackRemoved') }); onRemoved(); }).catch(onError); };
  const headerMenu: MenuItemProps[] = [
    { id: 'save-template', label: t('pathwaySaveAsMine'), icon: <Layers className={ico} />, disabled: progress.total === 0, onClick: () => onSaveTemplate(pathway) },
    { id: 'planner', label: t('pathwayOpenPlanner'), icon: <Calendar className={ico} />, onClick: () => setViewMode('planner') },
    { id: 'export-bib', label: t('pathwayExportBib'), icon: <FileText className={ico} />, onClick: () => exportAs('bibtex') },
    { id: 'export-md', label: t('pathwayExportMd'), icon: <FileText className={ico} />, onClick: () => exportAs('markdown') },
    { id: 'delete', label: t('pathwayDelete'), icon: <Trash2 className={ico} />, danger: true, onClick: remove },
  ];
  const kindLabel = t(pathway.kind === 'research' ? 'pathwayKindResearch' : 'pathwayKindCurriculum');

  const sectionHeader = (name: string) => <ContextMenu as="div" className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-1.5 pt-2" items={[
    { id: 'rename', label: t('pathwayRenameSection'), icon: <Edit3 className={ico} />, onClick: () => { setRenameDraft(name); setRenamingSection(name); } },
    { id: 'delete-section', label: t('pathwayDeleteSection'), icon: <Trash2 className={ico} />, danger: true, onClick: () => void handleDeleteSection(name) },
  ]}>
    {renamingSection === name ? (
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <input className={`${control} flex-1 py-1 text-xs`} value={renameDraft} onChange={e => setRenameDraft(e.target.value)} placeholder={t('pathwaySectionNewName')} aria-label={t('pathwaySectionNewName')} dir="auto" />
        <Button size="sm" variant="secondary" aria-label={t('pathwayRenameSection')} onClick={() => void handleRenameSection(name)}><Check className="size-3.5" /></Button>
        <Button size="sm" variant="ghost" aria-label={t('pathwayRenameSection')} onClick={() => setRenamingSection(null)}><X className="size-3.5" /></Button>
      </div>
    ) : (
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <h4 dir="auto" className="text-sm font-bold">{name}</h4>
        {pathway.kind === 'curriculum' && (
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-[11px] text-text-muted">{prereqMap[name]?.length ? t('pathwayPrereqsDependsOn', { deps: prereqMap[name].join('، ') }) : t('pathwayPrereqsNone')}</span>
            <button type="button" className="flex cursor-pointer items-center gap-1 text-xs text-primary-text hover:underline" title={t('pathwayPrereqsLabel')} aria-label={t('pathwayPrereqsLabel')} data-pathway-prereq-edit={name}
              onClick={() => { setCycleError(null); setEditingSectionPrereqs(editingSectionPrereqs === name ? null : name); }}>
              <Network className="size-3" /><span>{t('pathwayPrereqsEdit')}</span>
            </button>
          </div>
        )}
      </div>
    )}
    {(() => { const stat = progress.sections.find(row => row.section === name); return stat ? <span className="text-xs text-text-muted">{t('pathwayProgress', { done: stat.done, total: stat.total })}</span> : null; })()}
  </ContextMenu>;

  return <>
    <main className="min-w-0 space-y-4" data-pathway-steps>
      <Card className="space-y-3 p-4" data-pathway-header>
        <ContextMenu as="div" items={headerMenu} className="space-y-3 outline-none">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 space-y-1">
              <h2 dir="auto" className="font-display text-lg font-bold break-words" data-pathway-title>{pathway.name}</h2>
              <p className="text-xs text-text-muted">{kindLabel}</p>
              {examConfig?.examDate && (
                <div data-pathway-exam-badge className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning/15 px-2.5 py-0.5 text-xs font-semibold text-warning">
                  <Calendar className="size-3" />
                  <span>{t('pathwayExamBadge', { date: examConfig.examDate, days: Math.max(0, Math.ceil((parseCivilDate(examConfig.examDate).getTime() - new Date().setHours(0, 0, 0, 0)) / (1000 * 60 * 60 * 24))) })}</span>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {pathway.kind === 'curriculum' && <Button size="sm" variant="secondary" data-pathway-exam-btn icon={<Calendar className={ico} />} onClick={() => setIsExamModalOpen(true)}>{t('pathwayExamReplanButton')}</Button>}
              <Button size="sm" variant="secondary" data-pathway-save-template disabled={progress.total === 0} icon={<Layers className={ico} />} onClick={() => onSaveTemplate(pathway)}>{t('pathwaySaveAsMine')}</Button>
            </div>
          </div>
          {progress.total > 0
            ? <div className="space-y-1.5" data-pathway-progress>
                <ProgressBar done={progress.done} total={progress.total} label={t('pathwayProgress', { done: progress.done, total: progress.total })} />
                <p className="text-xs text-text-muted">{t('pathwayProgress', { done: progress.done, total: progress.total })} · {progress.percent}%</p>
              </div>
            : <p className="text-xs text-text-muted">{t('pathwayNoSteps')}</p>}
          {progress.total > 0 && <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-canvas p-3" data-pathway-next>
            {progress.complete
              ? <p className="flex items-center gap-2 text-sm font-semibold"><CheckCircle2 className="size-4 text-success" />{t('pathwayAllDone')}</p>
              : <>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p dir="auto" className="break-words text-sm font-semibold">{t('pathwayNextStep', { title: progress.next!.title })}</p>
                    {!progress.target && <p className="text-xs text-text-muted">{t('pathwayNextNoSource')}</p>}
                  </div>
                  {progress.target && <Button size="sm" data-pathway-continue-main icon={<Play className={`${ico} rtl:-scale-x-100`} />} onClick={() => onOpen(progress.target!)}>{t('pathwayContinue')}</Button>}
                </>}
          </div>}
          {exported && <p role="status" className="text-xs text-text-muted">{t('pathwayExported')}</p>}
        </ContextMenu>
      </Card>

      {pinned.length > 0 && <section className="space-y-2" aria-label={t('pathwayPinned')}><h3 className="text-xs font-bold text-text-muted">{t('pathwayPinned')}</h3><div className="flex flex-wrap gap-2">{pinned.map(item => <Button key={item.id} size="sm" variant="secondary" dir="auto" icon={<Pin className="size-3" />} onClick={() => onOpen(item)}>{item.title}</Button>)}</div></section>}

      <section className="space-y-3" aria-label={t('pathwayStepsHeading')}>
        <h3 className="text-sm font-bold">{t('pathwayStepsHeading')}</h3>
        {middle.length === 0 && <EmptyState className="rounded-2xl border border-dashed border-border p-6 sm:p-8" icon={<Route className="size-5" />} title={t('pathwayStepsEmptyDesc')} action={<Button size="sm" onClick={() => document.querySelector<HTMLInputElement>('[data-pathway-step-input]')?.focus()}>{t('pathwayAddStep')}</Button>} />}
        {middleSections.map(name => {
          const rows = middle.filter(item => item.section === name);
          return <section key={name} className="space-y-2">
            {name && sectionHeader(name)}
            {editingSectionPrereqs === name && (
              <div data-pathway-prereq-selector={name} className="space-y-2 rounded-lg border border-border bg-surface p-2.5 text-xs">
                <div className="flex items-center gap-1 font-semibold text-text-muted"><Network className="size-3.5 text-primary-text" /><span>{t('pathwayPrereqsSelect')}</span></div>
                {cycleError && <div role="alert" data-pathway-cycle-error className="flex items-center gap-1.5 rounded-md border border-danger/30 bg-danger/10 p-2 font-semibold text-danger"><AlertCircle className="size-4 shrink-0" /><span>{t('pathwayPrereqsCycleError', { cycle: cycleError })}</span></div>}
                <div className="flex flex-wrap gap-2 pt-1">
                  {sections.filter(s => s && s !== name).map(candidate => {
                    const isDep = prereqMap[name]?.includes(candidate);
                    return <label key={candidate} className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 transition-colors ${isDep ? 'border-primary bg-primary/15 font-semibold text-primary-text' : 'border-border bg-surface text-text-muted'}`}>
                      <input type="checkbox" checked={isDep} data-pathway-dep-toggle={candidate} onChange={() => void handleTogglePrereq(name, candidate)} className="size-3.5 rounded" />
                      <span dir="auto">{candidate}</span>
                    </label>;
                  })}
                  {sections.filter(s => s && s !== name).length === 0 && <span className="italic text-text-muted">{t('pathwayPrereqsNone')}</span>}
                </div>
              </div>
            )}
            <ul className="space-y-1.5">{rows.map((item, index) => <ItemRow key={item.id} item={item} first={index === 0} last={index === rows.length - 1} onMove={delta => move(item, delta)} onChange={onChange} onOpen={onOpen} onError={onError} />)}</ul>
          </section>;
        })}
        <div className="space-y-2 border-t border-border pt-3">
          <input className={`${control} w-full`} list="pathway-sections" value={section} onChange={event => setSection(event.target.value)} maxLength={200} placeholder={t('pathwaySection')} aria-label={t('pathwaySection')} dir="auto" />
          <datalist id="pathway-sections">{sections.filter(Boolean).map(name => <option key={name} value={name} />)}</datalist>
          <div className="flex flex-wrap gap-2"><input className={`${control} flex-1`} data-pathway-step-input value={step} onChange={event => setStep(event.target.value)} maxLength={300} placeholder={t('pathwayStepTitle')} aria-label={t('pathwayStepTitle')} dir="auto" /><Button size="sm" variant="secondary" className="self-center" disabled={!step.trim()} icon={<Check className={ico} />} onClick={addStep}>{t('pathwayAddStep')}</Button></div>
          <details><summary className="cursor-pointer text-sm">{t('pathwayAddResource')}</summary><div className="pt-2"><StudyLinkPicker notes={notes} onInsert={addResource} /></div></details>
        </div>
      </section>
    </main>

    <aside className="min-w-0 space-y-3 @min-[44rem]:col-start-2 @min-[60rem]:col-start-3 @min-[60rem]:row-start-1" data-pathway-end aria-label={t('pathwayNotesLinksHeading')}>
      <Card className="space-y-3 p-4">
        <h3 className="text-sm font-bold">{t('pathwayNotesLinksHeading')}</h3>
        {end.length === 0
          ? <EmptyState className="rounded-xl border border-dashed border-border p-5" icon={<Link2 className="size-5" />} title={t('pathwayNotesLinksEmptyDesc')} action={<Button size="sm" onClick={() => document.querySelector<HTMLInputElement>('[data-pathway-link-input]')?.focus()}>{t('pathwayLinkTitle')}</Button>} />
          : <ul className="space-y-1.5">{end.map((item, index) => <ItemRow key={item.id} item={item} first={index === 0} last={index === end.length - 1} onMove={delta => move(item, delta)} onChange={onChange} onOpen={onOpen} onError={onError} />)}</ul>}
        <div className="space-y-2 border-t border-border pt-3">
          <input className={`${control} w-full`} data-pathway-link-input value={linkTitle} onChange={event => setLinkTitle(event.target.value)} maxLength={500} placeholder={t('pathwayLinkTitle')} aria-label={t('pathwayLinkTitle')} dir="auto" />
          <input className={`${control} w-full`} value={linkUrl} onChange={event => setLinkUrl(event.target.value)} maxLength={2000} placeholder="https://" aria-label={t('pathwayLinkUrl')} dir="ltr" />
          <Button size="sm" variant="secondary" disabled={!linkTitle.trim() || !linkUrl.trim()} icon={<Plus className={ico} />} onClick={addLink}>{t('pathwayAddLink')}</Button>
        </div>
      </Card>
    </aside>

    <CurriculumExamModal
      pathwayId={pathway.id}
      pathwayName={pathway.name}
      isOpen={isExamModalOpen}
      onClose={() => setIsExamModalOpen(false)}
      onPlanApplied={() => {
        onChange();
        window.electronAPI.pathwayExam?.getConfig?.(pathway.id).then(cfg => setExamConfig(cfg)).catch(() => {});
      }}
    />
  </>;
}

type Snapshot = { list: Pathway[]; full: PathwayDetail[] };
async function fetchSnapshot(): Promise<Snapshot> {
  const api = window.electronAPI.pathways;
  const list: Pathway[] = await api.list();
  const full: PathwayDetail[] = await Promise.all(list.map(row => api.get(row.id)));
  return { list, full };
}

/** Research workspaces, roadmaps and curricula share one space and one three-part layout. See ADR-009 and KEY-306. */
export function PathwaysView() {
  const { t, dir, books, openBookForReading } = useWorkspace();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<PathwayTab>('all');
  const [pathways, setPathways] = useState<Pathway[]>([]);
  const [details, setDetails] = useState<Record<string, PathwayDetail>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<PathwayTemplate[]>([]);
  const [draft, setDraft] = useState<(Draft & { nonce: number }) | null>(null);
  const setNotice = (message: string | null) => { if (message) showToast({ message }); };
  const [failed, setFailed] = useState(false);
  const fail = useCallback(() => setFailed(true), []);

  const apply = useCallback(({ list, full }: Snapshot) => { setPathways(list); setDetails(Object.fromEntries(full.map(row => [row.id, row]))); }, []);
  const load = useCallback(async (select?: string | null) => {
    setLoading(true);
    const snapshot = await fetchSnapshot().finally(() => setLoading(false));
    setFailed(false);
    apply(snapshot);
    if (select !== undefined) setSelectedId(select && snapshot.list.some(row => row.id === select) ? select : null);
  }, [apply]);
  useEffect(() => { void fetchSnapshot().then(apply).catch(fail).finally(() => setLoading(false)); void window.electronAPI.pathways.templates().then(setTemplates).catch(fail); }, [apply, fail]);
  useEffect(() => {
    const handleNewPathway = () => {
      setSelectedId(null); setTab('templates');
      window.setTimeout(() => document.querySelector('[data-pathway-creator]')?.scrollIntoView({ behavior: 'smooth' }), 50);
    };
    window.addEventListener('baglib:new-pathway', handleNewPathway);
    return () => window.removeEventListener('baglib:new-pathway', handleNewPathway);
  }, []);

  const openItem = useCallback<OpenItem>(item => {
    if (item.url) { void window.electronAPI.openExternal(item.url); return; }
    void navigateStudyReference(item.reference!, books, openBookForReading, (id, anchor) => openStudyNote({ id, anchor })).catch(fail);
  }, [books, openBookForReading, fail]);

  const select = (id: string) => { setFailed(false); setNotice(null); setSelectedId(id); if (tab === 'templates') setTab('all'); };
  const selected = selectedId ? details[selectedId] ?? null : null;
  const visible = pathways.filter(row => tabMatches(tab, row.kind));

  const createFromTemplate = async (template: GalleryTemplate) => {
    try {
      const created = await window.electronAPI.pathways.save(copyTemplate(template));
      setFailed(false); setTab('all');
      await load(created.id);
      setNotice(t('pathwayCreatedFromTemplate', { name: created.name }));
    } catch { fail(); }
  };
  const customize = (template: GalleryTemplate) => { setDraft({ name: template.name, kind: template.kind, outline: template.outline, nonce: Date.now() }); window.setTimeout(() => document.querySelector('[data-pathway-creator]')?.scrollIntoView({ behavior: 'smooth' }), 50); };
  const removeTemplate = (template: GalleryTemplate) => { void window.electronAPI.pathways.removeTemplate(template.id).then(() => { setTemplates(current => current.filter((row: PathwayTemplate) => row.id !== template.id)); showToast({ message: t('feedbackRemoved') }); }).catch(fail); };
  const saveAsTemplate = async (pathway: PathwayDetail) => {
    try {
      const input = templateFromPathway(pathway);
      if (!templates.some((row: PathwayTemplate) => row.name === input.name && row.outline === input.outline)) {
        const saved = await window.electronAPI.pathways.saveTemplate(input);
        setTemplates(current => [...current, saved]);
      }
      setNotice(t('pathwaySavedAsMine'));
    } catch { fail(); }
  };
  const removePathway = (row: Pathway) => { if (window.confirm(t('pathwayDeleteConfirm'))) void window.electronAPI.pathways.remove(row.id).then(() => { showToast({ message: t('feedbackRemoved') }); return load(selectedId === row.id ? null : undefined); }).catch(fail); };

  const listItem = (row: Pathway) => {
    const detail = details[row.id];
    const progress = detail ? pathwayProgress(detail.items) : null;
    const active = selectedId === row.id;
    return <ContextMenu as="li" key={row.id} data-pathway-row={row.id} className="list-none outline-none" items={[
      { id: 'open', label: t('pathwayMenuOpen'), icon: <ExternalLink className={`${ico} rtl:-scale-x-100`} />, onClick: () => select(row.id) },
      ...(progress?.target ? [{ id: 'continue', label: t('pathwayContinue'), icon: <Play className={`${ico} rtl:-scale-x-100`} />, onClick: () => openItem(progress.target!) }] : []),
      ...(detail ? [{ id: 'save-template', label: t('pathwaySaveAsMine'), icon: <Layers className={ico} />, disabled: !progress?.total, onClick: () => void saveAsTemplate(detail) }] : []),
      { id: 'delete', label: t('pathwayDelete'), icon: <Trash2 className={ico} />, danger: true, onClick: () => removePathway(row) },
    ]}>
      <div className={`space-y-2 rounded-xl border p-3 transition-colors ${active ? 'border-primary bg-surface shadow-xs' : 'border-border bg-surface/60 hover:bg-surface'}`}>
        <button type="button" aria-current={active} onClick={() => select(row.id)} className="block w-full min-w-0 text-start">
          <span dir="auto" className="block break-words text-sm font-bold">{row.name}</span>
          <span className="block text-xs text-text-muted">{t(row.kind === 'research' ? 'pathwayKindResearch' : 'pathwayKindCurriculum')}{row.steps > 0 && <> · {t('pathwayProgress', { done: row.done, total: row.steps })}</>}</span>
        </button>
        {row.steps > 0 && <ProgressBar done={row.done} total={row.steps} label={t('pathwayProgress', { done: row.done, total: row.steps })} className="h-1.5" />}
        {progress?.next && <div className="flex items-center gap-2">
          <p dir="auto" className="min-w-0 flex-1 truncate text-xs text-text-muted">{t('pathwayNextStep', { title: progress.next.title })}</p>
          {progress.target && <Button size="sm" variant="ghost" data-pathway-continue={row.id} icon={<Play className={`size-3.5 rtl:-scale-x-100`} />} onClick={() => openItem(progress.target!)}>{t('pathwayContinue')}</Button>}
        </div>}
      </div>
    </ContextMenu>;
  };

  const startColumn = <aside className="min-w-0 space-y-3 @min-[44rem]:row-span-2 @min-[60rem]:row-span-1" data-pathway-list aria-label={t('pathwaysListLabel')}>
    <OnlineCoursesPanel />
    {loading ? <FeedbackSkeleton /> : visible.length === 0 && !failed
      ? <EmptyState className="rounded-2xl border border-dashed border-border p-6" icon={<Route className="size-5" />}
          title={t(pathways.length === 0 ? 'pathwaysListEmptyDesc' : 'pathwaysTabEmptyDesc')}
          action={tab !== 'templates' ? <Button size="sm" variant="secondary" icon={<Layers className={ico} />} onClick={() => setTab('templates')}>{t('pathwaysListEmptyAction')}</Button> : undefined} />
      : <ul className="space-y-2">{visible.map(listItem)}</ul>}
  </aside>;

  return <div dir={dir} className="flex-1 min-h-0 overflow-auto bg-canvas p-4 sm:p-6" data-pathways-space>
    <div className="@container mx-auto max-w-6xl space-y-4">
      <header className="flex items-start gap-3"><Route className="mt-1 size-6 shrink-0 text-primary-text" /><div><h1 className="font-display text-xl font-bold leading-relaxed">{t('pathwaysTitle')}</h1><p className="text-xs leading-relaxed text-text-muted">{t('pathwaysIntro')}</p></div></header>
      <Tabs tabs={PATHWAY_TABS.map(id => ({ id, label: t(TAB_LABEL[id]) }))} activeTab={tab} onChange={id => { setTab(id as PathwayTab); setNotice(null); }} ariaLabel={t('pathwaysTabsLabel')} className="max-w-full flex-wrap" />
      {failed && <p role="alert" className="text-sm">{t('pathwayError')} <button type="button" className="underline" onClick={() => void load().catch(fail)}>{t('lookupRetry')}</button></p>}
      <p className="text-xs text-text-muted">{t('pathwayContextHint')}</p>
      <TabPanel tabId={tab} activeTab={tab} className="grid gap-4 @min-[44rem]:grid-cols-[16rem_minmax(0,1fr)] @min-[60rem]:grid-cols-[16rem_minmax(0,1fr)_17rem]">
        {startColumn}
        {tab === 'templates'
          ? <>
              <main className="min-w-0" data-pathway-steps><Card className="p-4"><h3 className="mb-3 font-display text-base font-bold">{t('pathwayTemplatesTitle')}</h3><TemplateGallery templates={templates} onUse={template => void createFromTemplate(template)} onCustomize={customize} onRemove={removeTemplate} /></Card></main>
              <aside className="min-w-0 @min-[44rem]:col-start-2 @min-[60rem]:col-start-3 @min-[60rem]:row-start-1" data-pathway-end data-pathway-creator>
                <Creator key={draft?.nonce ?? 'blank'} templates={templates} setTemplates={setTemplates} draft={draft} onError={fail} onCreated={pathway => { setFailed(false); setTab('all'); void load(pathway.id).catch(fail); }} />
              </aside>
            </>
          : selected
            ? <Detail key={selected.id} pathway={selected} onChange={() => void load(selected.id).catch(fail)} onRemoved={() => void load(null).catch(fail)} onError={fail} onOpen={openItem} onSaveTemplate={pathway => void saveAsTemplate(pathway)} />
            : <>
                <main className="min-w-0" data-pathway-steps><Card><EmptyState icon={<Route className="size-5" />} title={t('pathwayPick')} action={<Button size="sm" variant="secondary" icon={<Layers className={ico} />} onClick={() => setTab('templates')}>{t('pathwaysListEmptyAction')}</Button>} /></Card></main>
                <aside className="min-w-0 @min-[44rem]:col-start-2 @min-[60rem]:col-start-3 @min-[60rem]:row-start-1" data-pathway-end><Card><EmptyState icon={<Link2 className="size-5" />} title={t('pathwayNotesLinksEmptyDesc')} /></Card></aside>
              </>}
      </TabPanel>
    </div>
  </div>;
}
