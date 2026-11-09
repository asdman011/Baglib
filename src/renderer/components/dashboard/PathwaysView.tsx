'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowDown, ArrowUp, Calendar, Check, Edit3, ExternalLink, Network, Pin, PinOff, Plus, Route, Sparkles, Trash2, X } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { useStudyNotes } from '../../hooks/useStudyNotes';
import { StudyLinkPicker } from '../notes/StudyLinkPicker';
import { navigateStudyReference, openStudyNote } from '../../utils/study-navigation';
import { studyLinks } from '../../../shared/study-notes';
import { parseOutline, type Pathway, type PathwayDetail, type PathwayItem, type PathwayKind, type PathwayTemplate, type ReferenceFormat } from '../../../shared/pathways';
import type { TranslationKey } from '../../translations';
import { OnlineCoursesPanel } from './OnlineCoursesPanel';
import { CurriculumExamModal } from './CurriculumExamModal';
import type { CurriculumExamConfig } from '../../../shared/curriculum-exam';
import { parseCivilDate } from '../../../shared/study-planner';

const control = 'rounded-lg border border-subtle bg-surface p-2 text-sm text-main min-w-0';
const button = 'inline-flex items-center gap-1.5 rounded-lg border border-subtle px-3 py-2 text-sm disabled:opacity-50';
const primary = 'inline-flex items-center gap-1.5 rounded-lg bg-pale-sky-600 text-white px-3 py-2 text-sm disabled:opacity-50';
const icon = 'p-1.5 rounded-lg border border-subtle disabled:opacity-40';
const builtIn: { id: string; name: TranslationKey; outline: TranslationKey; kind: PathwayKind }[] = [
  { id: 'research', name: 'pathwayTemplateResearch', outline: 'pathwayOutlineResearch', kind: 'research' },
  { id: 'book', name: 'pathwayTemplateBook', outline: 'pathwayOutlineBook', kind: 'curriculum' },
  { id: 'staged', name: 'pathwayTemplateStaged', outline: 'pathwayOutlineStaged', kind: 'curriculum' },
];

function Creator({ onCreated, onError }: { onCreated: (pathway: Pathway) => void; onError: () => void }) {
  const { t, lang } = useWorkspace();
  const [kind, setKind] = useState<PathwayKind>('research');
  const [name, setName] = useState('');
  const [outline, setOutline] = useState('');
  const [templates, setTemplates] = useState<PathwayTemplate[]>([]);
  const [subject, setSubject] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [drafted, setDrafted] = useState(false);
  const [draftFailed, setDraftFailed] = useState(false);
  useEffect(() => { void window.electronAPI.pathways.templates().then(setTemplates).catch(onError); }, [onError]);
  const steps = useMemo(() => parseOutline(outline).length, [outline]);

  const choose = (id: string) => {
    const preset = builtIn.find(item => item.id === id);
    const mine = templates.find(item => item.id === id);
    setDrafted(false);
    if (preset) { setKind(preset.kind); setOutline(t(preset.outline)); }
    else if (mine) { setKind(mine.kind); setOutline(mine.outline); }
    else setOutline('');
  };
  const draft = async () => {
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

  return <details className="rounded-xl border border-subtle p-3 space-y-3" open>
    <summary className="cursor-pointer text-sm font-bold">{t('pathwayNew')}</summary>
    <div className="space-y-2 pt-3">
      <input className={`${control} w-full`} value={name} onChange={event => setName(event.target.value)} maxLength={200} placeholder={t('pathwayName')} aria-label={t('pathwayName')} dir="auto" />
      <select className={`${control} w-full`} value={kind} onChange={event => setKind(event.target.value as PathwayKind)} aria-label={t('pathwayKind')}>
        <option value="research">{t('pathwayKindResearch')}</option><option value="curriculum">{t('pathwayKindCurriculum')}</option>
      </select>
      <select className={`${control} w-full`} defaultValue="" onChange={event => choose(event.target.value)} aria-label={t('pathwayTemplate')}>
        <option value="">{t('pathwayTemplateBlank')}</option>
        {builtIn.map(item => <option key={item.id} value={item.id}>{t(item.name)}</option>)}
        {templates.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <div className="flex gap-2"><input className={`${control} flex-1`} value={subject} onChange={event => setSubject(event.target.value)} maxLength={300} placeholder={t('pathwayAiSubject')} aria-label={t('pathwayAiSubject')} dir="auto" /><button type="button" className={button} disabled={drafting || !subject.trim()} onClick={() => void draft()}><Sparkles className="size-4" />{t(drafting ? 'pathwayAiDrafting' : 'pathwayAiDraft')}</button></div>
      {draftFailed && <p role="alert" className="text-xs leading-relaxed">{t('pathwayAiError')}</p>}
      <textarea className={`${control} w-full`} rows={8} value={outline} onChange={event => setOutline(event.target.value)} maxLength={20000} placeholder={t('pathwayOutlineHint')} aria-label={t('pathwayOutline')} dir="auto" />
      {drafted && <p className="text-xs leading-relaxed text-muted">{t('pathwayAiNotice')}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={primary} disabled={!name.trim()} onClick={() => void create()}><Plus className="size-4" />{t('pathwayCreate')}</button>
        <button type="button" className={button} disabled={!name.trim() || !steps} onClick={() => void remember()}>{t('pathwaySaveTemplate')}</button>
      </div>
      {templates.length > 0 && <ul className="space-y-1 text-xs">{templates.map(item => <li key={item.id} className="flex items-center justify-between gap-2"><span dir="auto" className="truncate">{item.name}</span><button type="button" className={icon} aria-label={t('pathwayRemoveTemplate')} title={t('pathwayRemoveTemplate')} onClick={() => void window.electronAPI.pathways.removeTemplate(item.id).then(() => setTemplates(current => current.filter(row => row.id !== item.id))).catch(onError)}><Trash2 className="size-3" /></button></li>)}</ul>}
    </div>
  </details>;
}

function ItemRow({ item, first, last, onMove, onChange, onOpen, onError }: { item: PathwayItem; first: boolean; last: boolean; onMove: (delta: number) => void; onChange: () => void; onOpen: (item: PathwayItem) => void; onError: () => void }) {
  const { t } = useWorkspace();
  const api = window.electronAPI.pathways;
  const act = (work: Promise<void>) => { void work.then(onChange).catch(onError); };
  return <li className="flex items-center gap-2 rounded-lg border border-subtle p-2">
    {item.kind === 'step'
      ? <input type="checkbox" checked={item.done} onChange={event => act(api.setDone(item.id, event.target.checked))} aria-label={item.title} className="size-4 shrink-0" />
      : <ExternalLink className="size-4 shrink-0 text-muted rtl:-scale-x-100" />}
    {item.kind === 'step'
      ? <span dir="auto" className={`flex-1 min-w-0 break-words text-sm leading-loose ${item.done ? 'line-through text-muted' : ''}`}>{item.title}</span>
      : <button type="button" dir="auto" className="flex-1 min-w-0 break-words text-start text-sm leading-loose underline-offset-2 hover:underline" onClick={() => onOpen(item)}>{item.title}</button>}
    {item.kind !== 'step' && <button type="button" className={icon} aria-pressed={item.pinned} aria-label={t(item.pinned ? 'pathwayUnpin' : 'pathwayPin')} title={t(item.pinned ? 'pathwayUnpin' : 'pathwayPin')} onClick={() => act(api.setPinned(item.id, !item.pinned))}>{item.pinned ? <PinOff className="size-3" /> : <Pin className="size-3" />}</button>}
    <button type="button" className={icon} disabled={first} aria-label={t('pathwayMoveUp')} title={t('pathwayMoveUp')} onClick={() => onMove(-1)}><ArrowUp className="size-3" /></button>
    <button type="button" className={icon} disabled={last} aria-label={t('pathwayMoveDown')} title={t('pathwayMoveDown')} onClick={() => onMove(1)}><ArrowDown className="size-3" /></button>
    <button type="button" className={icon} aria-label={t('pathwayRemoveItem')} title={t('pathwayRemoveItem')} onClick={() => act(api.removeItem(item.id))}><Trash2 className="size-3" /></button>
  </li>;
}

function Detail({ pathway, onChange, onRemoved, onError }: { pathway: PathwayDetail; onChange: () => void; onRemoved: () => void; onError: () => void }) {
  const { t, books, openBookForReading, setViewMode } = useWorkspace();
  const { lang } = useWorkspace();
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
        .then(res => {
          if (alive && res) setPrereqMap(res);
        })
        .catch(() => {});
    }
    return () => { alive = false; };
  }, [pathway.id, pathway.kind]);

  const handleTogglePrereq = async (secName: string, depName: string) => {
    const current = prereqMap[secName] || [];
    const updated = current.includes(depName)
      ? current.filter(d => d !== depName)
      : [...current, depName];
    const nextMap = { ...prereqMap, [secName]: updated };
    const res = await window.electronAPI.pathwayPrerequisites?.save?.(pathway.id, nextMap);
    if (res && !res.success && res.cycle) {
      setCycleError(res.cycle.join(lang === 'ar' ? ' ← ' : ' → '));
    } else {
      setCycleError(null);
      setPrereqMap(nextMap);
    }
  };

  const handleRenameSection = async (oldName: string) => {
    const trimmed = renameDraft.trim();
    if (!trimmed || trimmed === oldName) {
      setRenamingSection(null);
      return;
    }
    await window.electronAPI.pathwayPrerequisites?.renameSection?.(pathway.id, oldName, trimmed);
    setRenamingSection(null);
    onChange();
  };

  const handleDeleteSection = async (secName: string) => {
    if (window.confirm(`${t('pathwayDeleteSection')} "${secName}"?`)) {
      await window.electronAPI.pathwayPrerequisites?.deleteSection?.(pathway.id, secName);
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
  const sections = useMemo(() => [...new Set(pathway.items.map(item => item.section))], [pathway.items]);
  const pinned = pathway.items.filter(item => item.pinned);

  const move = (item: PathwayItem, delta: number) => {
    const peers = pathway.items.filter(row => row.section === item.section);
    const swap = peers[peers.indexOf(item) + delta];
    if (!swap) return;
    const ids = pathway.items.map(row => row.id === item.id ? swap.id : row.id === swap.id ? item.id : row.id);
    void api.reorder(pathway.id, ids).then(onChange).catch(onError);
  };
  const open = (item: PathwayItem) => {
    if (item.url) { void window.electronAPI.openExternal(item.url); return; }
    void navigateStudyReference(item.reference!, books, openBookForReading, (id, anchor) => openStudyNote({ id, anchor })).catch(onError);
  };
  const addResource = (text: string) => {
    const link = studyLinks(text)[0];
    if (link) void api.addItem({ pathwayId: pathway.id, section, kind: 'resource', reference: link.target, title: link.label }).then(onChange).catch(onError);
  };
  const addLink = () => { void api.addItem({ pathwayId: pathway.id, section, kind: 'link', title: linkTitle, url: linkUrl }).then(() => { setLinkTitle(''); setLinkUrl(''); onChange(); }).catch(onError); };
  const addStep = () => { void api.addStep(pathway.id, section, step).then(() => { setStep(''); onChange(); }).catch(onError); };
  const exportAs = (format: ReferenceFormat) => { void api.exportReferences(pathway.id, format).then(setExported).catch(onError); };
  const remove = () => { if (window.confirm(t('pathwayDeleteConfirm'))) void api.remove(pathway.id).then(onRemoved).catch(onError); };

  return <div className="space-y-5">
    <header className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0"><h2 dir="auto" className="font-display text-lg font-bold break-words">{pathway.name}</h2><p className="text-xs text-muted">{t(pathway.kind === 'research' ? 'pathwayKindResearch' : 'pathwayKindCurriculum')}</p>{examConfig?.examDate && (
            <div
              data-pathway-exam-badge
              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300 mt-1"
            >
              <Calendar className="size-3" />
              <span>
                {t('pathwayExamBadge', {
                  date: examConfig.examDate,
                  days: Math.max(
                    0,
                    Math.ceil(
                      (parseCivilDate(examConfig.examDate).getTime() - new Date().setHours(0, 0, 0, 0)) /
                        (1000 * 60 * 60 * 24)
                    )
                  ),
                })}
              </span>
            </div>
          )}</div>
        <div className="flex flex-wrap gap-2">
          {pathway.kind === 'curriculum' && (
            <button
              type="button"
              data-pathway-exam-btn
              className={button}
              onClick={() => setIsExamModalOpen(true)}
            >
              <Calendar className="size-4" />
              <span>{t('pathwayExamReplanButton')}</span>
            </button>
          )}
          <button type="button" className={button} onClick={() => exportAs('bibtex')}>{t('pathwayExportBib')}</button>
          <button type="button" className={button} onClick={() => exportAs('markdown')}>{t('pathwayExportMd')}</button>
          <button type="button" className={button} onClick={remove}><Trash2 className="size-4" />{t('pathwayDelete')}</button>
        </div>
      </div>
      {exported && <p role="status" className="text-xs text-muted">{t('pathwayExported')}</p>}
      {pathway.steps > 0 && <div className="space-y-1">
        <div className="h-2 rounded-full bg-subtle overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={pathway.steps} aria-valuenow={pathway.done} aria-label={t('pathwayProgress', { done: pathway.done, total: pathway.steps })}><div className="h-full bg-emerald-600" style={{ width: `${(pathway.done / pathway.steps) * 100}%` }} /></div>
        <p className="flex flex-wrap gap-2 text-xs text-muted"><span>{t('pathwayProgress', { done: pathway.done, total: pathway.steps })}</span><button type="button" className="underline" onClick={() => setViewMode('planner')}>{t('pathwayOpenPlanner')}</button></p>
      </div>}
    </header>
    {pinned.length > 0 && <section className="space-y-2"><h3 className="text-xs font-bold text-muted">{t('pathwayPinned')}</h3><div className="flex flex-wrap gap-2">{pinned.map(item => <button key={item.id} type="button" dir="auto" className={button} onClick={() => open(item)}><Pin className="size-3" />{item.title}</button>)}</div></section>}
    {pathway.items.length === 0 && <p className="text-sm text-muted">{t('pathwayEmpty')}</p>}
    {sections.map(name => {
      const rows = pathway.items.filter(item => item.section === name);
      return <section key={name} className="space-y-2">
        {name && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-b border-subtle/40 pb-1.5">
            {renamingSection === name ? (
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <input
                  className={`${control} flex-1 py-1 text-xs`}
                  value={renameDraft}
                  onChange={e => setRenameDraft(e.target.value)}
                  placeholder={t('pathwaySectionNewName')}
                  aria-label={t('pathwaySectionNewName')}
                  dir="auto"
                />
                <button
                  type="button"
                  className={button}
                  onClick={() => void handleRenameSection(name)}
                >
                  <Check className="size-3.5" />
                </button>
                <button
                  type="button"
                  className={button}
                  onClick={() => setRenamingSection(null)}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <h3 dir="auto" className="text-sm font-bold">{name}</h3>
                {pathway.kind === 'curriculum' && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-[11px] text-muted">
                      {prereqMap[name]?.length
                        ? t('pathwayPrereqsDependsOn', { deps: prereqMap[name].join('، ') })
                        : t('pathwayPrereqsNone')}
                    </span>
                    <button
                      type="button"
                      className="text-xs text-pale-sky-600 dark:text-pale-sky-400 hover:underline cursor-pointer flex items-center gap-1"
                      title={t('pathwayPrereqsLabel')} aria-label={t('pathwayPrereqsLabel')} data-pathway-prereq-edit={name}
                      onClick={() => {
                        setCycleError(null);
                        setEditingSectionPrereqs(editingSectionPrereqs === name ? null : name);
                      }}
                    >
                      <Network className="size-3" />
                      <span>{t('pathwayPrereqsEdit')}</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-1">
              {renamingSection !== name && (
                <button
                  type="button"
                  className={icon}
                  title={t('pathwayRenameSection')}
                  aria-label={t('pathwayRenameSection')}
                  onClick={() => {
                    setRenameDraft(name);
                    setRenamingSection(name);
                  }}
                >
                  <Edit3 className="size-3" />
                </button>
              )}
              <button
                type="button"
                className={icon}
                title={t('pathwayDeleteSection')}
                aria-label={t('pathwayDeleteSection')}
                onClick={() => void handleDeleteSection(name)}
              >
                <Trash2 className="size-3" />
              </button>
            </div>
          </div>
        )}

        {editingSectionPrereqs === name && (
          <div
            data-pathway-prereq-selector={name}
            className="p-2.5 rounded-lg border border-subtle bg-surface/80 space-y-2 text-xs"
          >
            <div className="font-semibold text-muted flex items-center gap-1">
              <Network className="size-3.5 text-pale-sky-500" />
              <span>{t('pathwayPrereqsSelect')}</span>
            </div>

            {cycleError && (
              <div
                role="alert"
                data-pathway-cycle-error
                className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 font-semibold p-2 rounded-md bg-rose-500/10 border border-rose-500/20"
              >
                <AlertCircle className="size-4 shrink-0" />
                <span>{t('pathwayPrereqsCycleError', { cycle: cycleError })}</span>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              {sections
                .filter(s => s && s !== name)
                .map(candidate => {
                  const isDep = prereqMap[name]?.includes(candidate);
                  return (
                    <label
                      key={candidate}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border cursor-pointer transition-colors ${
                        isDep
                          ? 'border-pale-sky-500 bg-pale-sky-500/15 text-pale-sky-700 dark:text-pale-sky-300 font-semibold'
                          : 'border-subtle bg-surface hover:border-subtle/80 text-muted'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isDep}
                        data-pathway-dep-toggle={candidate}
                        onChange={() => void handleTogglePrereq(name, candidate)}
                        className="size-3.5 rounded"
                      />
                      <span dir="auto">{candidate}</span>
                    </label>
                  );
                })}
              {sections.filter(s => s && s !== name).length === 0 && (
                <span className="text-muted italic">{t('pathwayPrereqsNone')}</span>
              )}
            </div>
          </div>
        )}

        <ul className="space-y-1">{rows.map((item, index) => <ItemRow key={item.id} item={item} first={index === 0} last={index === rows.length - 1} onMove={delta => move(item, delta)} onChange={onChange} onOpen={open} onError={onError} />)}</ul>
      </section>;
    })}
    <section className="space-y-3 border-t border-subtle pt-4">
      <input className={`${control} w-full`} list="pathway-sections" value={section} onChange={event => setSection(event.target.value)} maxLength={200} placeholder={t('pathwaySection')} aria-label={t('pathwaySection')} dir="auto" />
      <datalist id="pathway-sections">{sections.filter(Boolean).map(name => <option key={name} value={name} />)}</datalist>
      <div className="flex flex-wrap gap-2"><input className={`${control} flex-1`} value={step} onChange={event => setStep(event.target.value)} maxLength={300} placeholder={t('pathwayStepTitle')} aria-label={t('pathwayStepTitle')} dir="auto" /><button type="button" className={button} disabled={!step.trim()} onClick={addStep}><Check className="size-4" />{t('pathwayAddStep')}</button></div>
      <div className="flex flex-wrap gap-2"><input className={`${control} flex-1`} value={linkTitle} onChange={event => setLinkTitle(event.target.value)} maxLength={500} placeholder={t('pathwayLinkTitle')} aria-label={t('pathwayLinkTitle')} dir="auto" /><input className={`${control} flex-1`} value={linkUrl} onChange={event => setLinkUrl(event.target.value)} maxLength={2000} placeholder="https://" aria-label={t('pathwayLinkUrl')} dir="ltr" /><button type="button" className={button} disabled={!linkTitle.trim() || !linkUrl.trim()} onClick={addLink}><Plus className="size-4" />{t('pathwayAddLink')}</button></div>
      <details><summary className="cursor-pointer text-sm">{t('pathwayAddResource')}</summary><div className="pt-2"><StudyLinkPicker notes={notes} onInsert={addResource} /></div></details>

    </section>
    <CurriculumExamModal
      pathwayId={pathway.id}
      pathwayName={pathway.name}
      isOpen={isExamModalOpen}
      onClose={() => setIsExamModalOpen(false)}
      onPlanApplied={() => {
        onChange();
        window.electronAPI.pathwayExam?.getConfig?.(pathway.id)
          .then(cfg => setExamConfig(cfg))
          .catch(() => {});
      }}
    />


  </div>;
}

/** Research projects and curricula share one space. See ADR-009. */
export function PathwaysView() {
  const { t, dir } = useWorkspace();
  const [pathways, setPathways] = useState<Pathway[]>([]);
  const [selected, setSelected] = useState<PathwayDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const fail = useCallback(() => setFailed(true), []);
  const load = useCallback(async (id?: string) => {
    const api = window.electronAPI.pathways;
    setPathways(await api.list());
    setSelected(id ? await api.get(id) : null);
  }, []);
  useEffect(() => { void window.electronAPI.pathways.list().then(setPathways).catch(fail); }, [fail]);

  return <div dir={dir} className="flex-1 min-h-0 overflow-auto bg-canvas p-4 sm:p-6">
    <div className="mx-auto max-w-6xl space-y-4">
      <header className="flex items-start gap-3"><Route className="size-6 text-pale-sky-600 shrink-0 mt-1" /><div><h1 className="font-display text-xl font-bold leading-relaxed">{t('pathwaysTitle')}</h1><p className="text-xs text-muted leading-relaxed">{t('pathwaysIntro')}</p></div></header>
      {failed && <p role="alert" className="text-sm">{t('pathwayError')}</p>}
      <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <aside className="space-y-3 min-w-0">
          <OnlineCoursesPanel />
          <Creator onCreated={pathway => { setFailed(false); void load(pathway.id).catch(fail); }} onError={fail} />
          <ul className="space-y-1">{pathways.map(pathway => <li key={pathway.id}><button type="button" aria-current={selected?.id === pathway.id} onClick={() => { setFailed(false); void load(pathway.id).catch(fail); }} className={`w-full rounded-lg border px-3 py-2 text-start ${selected?.id === pathway.id ? 'border-pale-sky-500 bg-surface' : 'border-subtle'}`}>
            <span dir="auto" className="block text-sm font-bold break-words">{pathway.name}</span>
            <span className="block text-xs text-muted">{t(pathway.kind === 'research' ? 'pathwayKindResearch' : 'pathwayKindCurriculum')}{pathway.steps > 0 && <> · {t('pathwayProgress', { done: pathway.done, total: pathway.steps })}</>}</span>
          </button></li>)}</ul>
        </aside>
        <main className="min-w-0 rounded-xl border border-subtle bg-surface p-4">
          {selected ? <Detail pathway={selected} onChange={() => void load(selected.id).catch(fail)} onRemoved={() => void load().catch(fail)} onError={fail} /> : <p className="text-sm text-muted">{t('pathwayPick')}</p>}
        </main>
      </div>
    </div>

  </div>;
}
