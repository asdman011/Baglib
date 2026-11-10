'use client';
/* eslint-disable @next/next/no-img-element -- Bounded local data-URI thumbnails run offline in Electron; no image optimization server is available. */
import { Button } from '../ui/Button';
import { Tabs } from '../ui/Tabs';
import React, { useEffect, useState } from 'react';
import type { PdfAsset, PdfEditorAPI, PdfFeature, PdfInspection, PdfOperation, PdfSession, PdfJob } from '../../../shared/types/pdf-editor';
import { useWorkspace } from '../context/WorkspaceContext';
import type { TranslationKey } from '../../translations';
import { AlertTriangle, Plus, Trash2, Eye, ShieldAlert, Sparkles, Check, Layers, Image as ImageIcon } from 'lucide-react';
import { PdfInkPad } from './PdfInkPad';
import { PdfCloudPanel } from './PdfCloudPanel';
import { PdfReviewPanel } from './PdfReviewPanel';
import { PdfAuditViewer } from './PdfAuditViewer';
import { PdfTocEditor } from './PdfTocEditor';
import { PdfColorSwatches } from './PdfColorSwatches';
import type { PagePlanItem } from './PdfPageEditor';

export const REDACTION_PRESETS = [
  { id: 'email', nameKey: 'pdfRedactionEmail' as const, pattern: '[\\w.-]+@[\\w.-]+\\.\\w+', desc: '[\\w.-]+@[\\w.-]+\\.\\w+' },
  { id: 'credit-card', nameKey: 'stirlingPresetCreditCard' as const, pattern: '\\d{4}[ -]?\\d{4}[ -]?\\d{4}[ -]?\\d{4}', desc: '\\d{4}[ -]?\\d{4}[ -]?\\d{4}[ -]?\\d{4}' },
  { id: 'iban', nameKey: 'stirlingPresetIban' as const, pattern: '[A-Z]{2}\\d{2}[A-Z0-9]{1,30}', desc: '[A-Z]{2}\\d{2}[A-Z0-9]{1,30}' },
  { id: 'phone', nameKey: 'pdfRedactionPhone' as const, pattern: '\\(\\d{3}\\)\\s*\\d{3}-\\d{4}', desc: '\\(\\d{3}\\)\\s*\\d{3}-\\d{4}' },
  { id: 'ssn', nameKey: 'stirlingPresetSsn' as const, pattern: '\\d{3}-\\d{2}-\\d{4}', desc: '\\d{3}-\\d{2}-\\d{4}' },
  { id: 'account', nameKey: 'stirlingPresetAccount' as const, pattern: '[Aa]ccount\\s*#?\\s*\\d{6,}', desc: '[Aa]ccount\\s*#?\\s*\\d{6,}' },
  { id: 'date', nameKey: 'stirlingPresetDate' as const, pattern: '\\d{4}-\\d{2}-\\d{2}', desc: 'YYYY-MM-DD (\\d{4}-\\d{2}-\\d{2})' },
];

export type StirlingWorkstationMode = 'view' | 'organize' | 'edit' | 'security' | 'convert';
/** How a tool uses the page: drawing a box on it, picking its text, or not at all. */
export type PdfCanvasUse = 'none' | 'box' | 'text';

export interface PdfToolProps {
  tool: PdfFeature;
  session: PdfSession;
  busy: boolean;
  page: number;
  rect: number[];
  inspection: PdfInspection | null;
  output: PdfJob | null;
  thumbnails: Record<string, string>;
  boxDrawn: boolean;
  onCanvasUse: (value: PdfCanvasUse) => void;
  text: string;
  setText: (value: string) => void;
  run: (operation: PdfOperation, payload?: Record<string, unknown>) => void;
  onPage: (value: number) => void;
  onSource: (value: PdfSession) => void;
  mode?: StirlingWorkstationMode;
  onAppendPages?: (pages: Omit<PagePlanItem, 'id'>[]) => void;
  getOrganizerPages?: () => PagePlanItem[];
}

export function PdfWorkstationTools({
  tool,
  session,
  busy,
  page,
  rect,
  inspection,
  output,
  thumbnails,
  boxDrawn,
  onCanvasUse,
  text,
  setText,
  run,
  onPage,
  onSource,
  mode,
  onAppendPages,
  getOrganizerPages,
}: PdfToolProps) {
  const { t, lang } = useWorkspace();
  const [asset, setAsset] = useState<PdfAsset | null>(null);
  const [images, setImages] = useState<PdfAsset[]>([]);
  const [certificate, setCertificate] = useState<PdfAsset | null>(null);
  const [trustRoot, setTrustRoot] = useState<PdfAsset | null>(null);
  const [kind, setKind] = useState('text');
  const [size, setSize] = useState(12);
  const [color, setColor] = useState('#111111');
  const [direction, setDirection] = useState('auto');
  const [layer, setLayer] = useState('over');
  const [alignment, setAlignment] = useState('start');
  const [fontFamily, setFontFamily] = useState('sans-serif');
  const [crop, setCrop] = useState('');
  const [plan, setPlan] = useState<{ page?: number; sessionId?: string; blank?: boolean; rotation?: number }[] | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [split, setSplit] = useState(1);
  const [external, setExternal] = useState(false);
  const [organizerStart, setOrganizerStart] = useState(0);
  const [replacements, setReplacements] = useState([{ find: '', replace: '' }]);
  const [wholeWordSearch, setWholeWordSearch] = useState(false);
  const [pattern, setPattern] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [profile, setProfile] = useState('2b');
  const [user, setUser] = useState('');
  const [owner, setOwner] = useState('');
  const [certificatePassword, setCertificatePassword] = useState('');
  const [bits, setBits] = useState(256);
  const [permissions, setPermissions] = useState({ copy: true, print: true, modify: true, annotate: true, forms: true });
  const [fieldName, setFieldName] = useState('BaglibSignature');
  const [existingField, setExistingField] = useState('');
  const [sign, setSign] = useState('certificate');
  const [strokes, setStrokes] = useState<number[][][]>([]);
  const [inkColor, setInkColor] = useState('#000000');
  const [failure, setFailure] = useState(false);

  // New Stirling-PDF capability states
  const [watermarkText, setWatermarkText] = useState(() => t('pdfWatermarkDefault'));
  const [watermarkFontSize, setWatermarkFontSize] = useState(36);
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.25);
  const [watermarkRotation, setWatermarkRotation] = useState(45);
  const [optimizeLevel, setOptimizeLevel] = useState(2);
  const [scaleFactor, setScaleFactor] = useState(1.0);
  const [pagesPerSheet, setPagesPerSheet] = useState(2);
  const [pageNumberStyle, setPageNumberStyle] = useState('PAGE_NUMBER_ONLY');
  const [pageNumberPosition, setPageNumberPosition] = useState('BOTTOM_CENTER');
  const [pageNumberStart, setPageNumberStart] = useState(1);
  const [activeEditSubtool, setActiveEditSubtool] = useState<'find-replace' | 'text' | 'ink' | 'image' | 'numbers' | 'forms'>(tool === 'add-image' ? 'image' : tool === 'unlock-forms' ? 'forms' : tool === 'page-numbers' ? 'numbers' : 'find-replace');
  const [activeSecuritySubtool, setActiveSecuritySubtool] = useState<'redact' | 'sanitize' | 'watermark' | 'encrypt' | 'sign' | 'validate'>(tool === 'sanitize' || tool === 'watermark' || tool === 'encrypt' || tool === 'sign' ? tool : tool === 'verify-signatures' ? 'sign' : tool === 'validate' ? 'validate' : 'redact');
  const [redactMode, setRedactMode] = useState<'manual' | 'auto'>('manual');
  const [pendingRedactionMarks, setPendingRedactionMarks] = useState<{ id: string; page: number; rect: number[] }[]>([]);
  const [convertPdfToImage, setConvertPdfToImage] = useState(true);
  const [selectedRegexPreset, setSelectedRegexPreset] = useState('');
  const [useRegex, setUseRegex] = useState(true);
  const [wholeWordSearchAuto, setWholeWordSearchAuto] = useState(true);
  const [boxColor, setBoxColor] = useState('#000000');
  const [customPadding, setCustomPadding] = useState(2);
  const [wordsToRedact, setWordsToRedact] = useState('');

  const editing = mode === 'edit' || tool === 'edit-content' || tool === 'add-image';
  const securing = mode === 'security' || tool === 'redact';
  const canvasUse: PdfCanvasUse = securing && activeSecuritySubtool === 'redact' && redactMode === 'manual' || editing && (activeEditSubtool === 'image' || activeEditSubtool === 'ink') ? 'box'
    : editing && (activeEditSubtool === 'find-replace' || activeEditSubtool === 'text') ? 'text' : 'none';
  useEffect(() => {
    onCanvasUse(canvasUse);
    return () => onCanvasUse('none');
  }, [canvasUse, onCanvasUse]);

  const api = (): PdfEditorAPI => window.electronAPI.pdfEditor;
  const field = 'block w-full min-w-0 rounded-lg border border-border bg-canvas p-2 text-start text-sm leading-relaxed text-text focus-visible:outline-2 focus-visible:outline-focus';
  const button = (label: TranslationKey, action: () => void, disabled = false, primary = false) => (
    <Button size="sm" variant={primary ? 'primary' : 'secondary'} disabled={busy || external || disabled} onClick={action} className="h-auto min-h-8 text-start whitespace-normal leading-relaxed">
      {t(label)}
    </Button>
  );

  const input = (label: TranslationKey, value: string, update: (value: string) => void, type = 'text') => (
    <label className="block text-xs font-medium space-y-1">
      <span>{t(label)}</span>
      <input
        type={type}
        autoComplete="off"
        dir={type === 'password' ? undefined : 'auto'}
        value={value}
        onChange={event => update(event.target.value)}
        className={field}
      />
    </label>
  );

  const select = (label: TranslationKey, value: string, update: (value: string) => void, values: [string, TranslationKey][]) => (
    <label className="block text-xs font-medium space-y-1">
      <span>{t(label)}</span>
      <select value={value} onChange={event => update(event.target.value)} className={field}>
        {values.map(([val, lbl]) => (
          <option key={val} value={val}>
            {t(lbl)}
          </option>
        ))}
      </select>
    </label>
  );

  const choose = async (kind: PdfAsset['kind'], update: (value: PdfAsset) => void) => {
    try {
      const response = await api().chooseAsset(kind);
      if (response.ok === false) throw new Error();
      if (response.data) update(response.data);
    } catch {
      setFailure(true);
    }
  };

  const apply = (operation: PdfOperation, payload?: Record<string, unknown>) => {
    setFailure(false);
    run(operation, payload);
    setCertificatePassword('');
    setUser('');
    setOwner('');
  };

  const currentPlan: { page?: number; sessionId?: string; blank?: boolean; rotation?: number }[] =
    plan ?? Array.from({ length: inspection?.totalPages || 0 }, (_, index) => ({ page: index + 1, sessionId: 'current', rotation: 0 }));
  const firstVisible = Math.min(organizerStart, Math.max(0, Math.floor((currentPlan.length - 1) / 36) * 36));

  const reorder = (from: number, to: number) => {
    const next = [...currentPlan];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setPlan(next);
    setSelected([]);
  };

  const edit = () => {
    const values = crop.trim() ? crop.split(',').map(Number) : undefined;
    if (values && (values.length !== 4 || values.some(value => !Number.isFinite(value)))) {
      setFailure(true);
      return;
    }
    apply('edit-content', {
      edits: [
        {
          kind,
          text,
          page,
          rect,
          fontSize: size,
          color,
          direction,
          layer,
          align: alignment,
          fontFamily,
          ...(asset ? { asset: asset.id } : {}),
          ...(values ? { crop: values } : {}),
        },
      ],
    });
  };

  if (tool === 'cloud') return <PdfCloudPanel session={session} output={output} />;
  if (tool === 'edit-toc') return <PdfTocEditor busy={busy} totalPages={inspection?.totalPages} initialOutline={inspection?.outline} onApply={payload => apply('edit-toc', payload)} />;
  if (tool === 'review' || tool === 'summarize') return <PdfReviewPanel session={session} page={page} rect={rect} ai={tool === 'summarize'} onPage={onPage} run={run} />;

  // Determine active effective mode
  const effectiveMode: StirlingWorkstationMode =
    mode ??
    (tool === 'organize' || tool === 'split'
      ? 'organize'
      : tool === 'edit-content' || tool === 'create'
      ? 'edit'
      : tool === 'redact' || tool === 'encrypt' || tool === 'sign' || tool === 'verify-signatures' || tool === 'validate'
      ? 'security'
      : tool.startsWith('export-') || tool === 'ocr'
      ? 'convert'
      : 'view');

  return (
    <section className="space-y-4">
      {/* MODE 1: VIEW & READ */}
      {effectiveMode === 'view' && (
        <div className="space-y-4">

          {inspection && (
            <div className="rounded-xl border border-border p-3 space-y-2 text-xs">
              <div className="flex justify-between text-text-muted">
                <span>{t('pdfSuitePageCount', { count: inspection.totalPages })}</span>
                <span>{inspection.signedSource ? t('pdfSignatureSigned') : t('pdfSignatureDraft')}</span>
              </div>
              {inspection.outline && inspection.outline.length > 0 && (
                <details className="mt-2">
                  <summary className="font-semibold cursor-pointer py-1">{t('stirlingEditToc')}</summary>
                  <div className="max-h-48 overflow-y-auto space-y-1 mt-1 pe-1">
                    {inspection.outline.map((item, idx) => (
                      <Button variant="secondary" size="sm"
                        key={idx}
                        type="button"
                        onClick={() => onPage(item.page)}
                        className="block w-full text-start truncate py-0.5 text-text-muted hover:text-text"
                        style={{ paddingInlineStart: `${item.level * 0.75}rem` }}
                      >
                        {item.title} ({item.page})
                      </Button>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>
      )}

      {/* MODE 2: ORGANIZE */}
      {effectiveMode === 'organize' && (
        <div className="space-y-4">
          <p className="text-xs text-text-muted">{t('pdfPagePlanHint')}</p>
          {!onAppendPages && <>
          <div className="flex flex-wrap gap-1.5">
            {button('pdfSelectAll', () => setSelected(currentPlan.map((_, index) => index)))}
            {button('stirlingSelectEven', () => setSelected(currentPlan.map((_, index) => index).filter(i => (i + 1) % 2 === 0)))}
            {button('stirlingSelectOdd', () => setSelected(currentPlan.map((_, index) => index).filter(i => (i + 1) % 2 !== 0)))}
            {button('pdfClearSelection', () => setSelected([]))}
          </div>

          <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border">
            {button('stirlingRotateLeft', () =>
              setPlan(currentPlan.map((item, index) => (selected.includes(index) || !selected.length ? { ...item, rotation: ((item.rotation || 0) + 270) % 360 } : item))),
            )}
            {button('stirlingRotateRight', () =>
              setPlan(currentPlan.map((item, index) => (selected.includes(index) || !selected.length ? { ...item, rotation: ((item.rotation || 0) + 90) % 360 } : item))),
            )}
            {button('stirlingInsertBlank', () => setPlan([...currentPlan, { blank: true }]))}
            {button('stirlingDeleteSelected', () => {
              setPlan(currentPlan.filter((_, index) => !selected.includes(index)));
              setSelected([]);
            }, !selected.length)}
            {button('stirlingExtractSelected', () => {
              apply('organize', { pages: currentPlan.filter((_, index) => selected.includes(index)) });
              setPlan(null);
              setSelected([]);
            }, !selected.length)}
          </div>

          {/* Page Plan Grid */}
          <div className="grid grid-cols-3 gap-2 max-h-72 overflow-y-auto p-1 border border-border rounded-xl bg-canvas">
            {currentPlan.slice(firstVisible, firstVisible + 36).map((item, offset) => {
              const index = firstVisible + offset;
              const isSel = selected.includes(index);
              return (
                <div
                  key={`${index}-${item.sessionId}-${item.page}`}
                  draggable
                  onDragStart={event => event.dataTransfer.setData('text/plain', String(index))}
                  onDragOver={event => event.preventDefault()}
                  onDrop={event => {
                    event.preventDefault();
                    const from = Number(event.dataTransfer.getData('text/plain'));
                    if (Number.isInteger(from) && from >= 0 && from < currentPlan.length) reorder(from, index);
                  }}
                  className={`rounded-lg border p-1.5 transition-all text-xs ${isSel ? 'border-border bg-primary/10' : 'border-border bg-surface'}`}
                >
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={event => setSelected(prev => (event.target.checked ? [...prev, index] : prev.filter(v => v !== index)))}
                      className="rounded"
                    />
                    <span className="font-bold">{index + 1}</span>
                  </label>
                  {item.page && (thumbnails[`${item.sessionId || 'current'}:${item.page}`] || thumbnails[item.page]) && (
                    <img
                      src={thumbnails[`${item.sessionId || 'current'}:${item.page}`] || thumbnails[item.page]}
                      alt={t('pdfPagePreview', { page: item.page })}
                      className="w-full h-20 object-contain my-1 bg-white rounded shadow-sm"
                      style={{ transform: `rotate(${item.rotation || 0}deg)` }}
                    />
                  )}
                  <div className="flex items-center justify-between text-[10px] text-text-muted">
                    <span>{item.blank ? t('pdfBlankPage') : `${item.page}`}</span>
                    <span className="font-mono bg-subtle/20 px-1 rounded">{item.rotation || 0}°</span>
                  </div>
                </div>
              );
            })}
          </div>

          </>}
          <div className="flex flex-wrap gap-2">
            {!onAppendPages && button('pdfApplyPagePlan', () => {
              apply('organize', { pages: currentPlan });
              setPlan(null);
              setSelected([]);
            }, !currentPlan.length, true)}
            {button('stirlingMergePdfs', () => {
              setExternal(true);
              void (async () => {
                try {
                  const response = await api().chooseSource();
                  if (response.ok === false || !response.data) return;
                  const source = response.data;
                  onSource(source);
                  const started = await api().start({ sessionId: source.id, operation: 'inspect', language: lang });
                  if (started.ok === false) throw new Error();
                  let val = started.data;
                  while (val.state === 'running') {
                    await new Promise(r => setTimeout(r, 200));
                    const res = await api().status(val.id);
                    if (res.ok === false) throw new Error();
                    val = res.data;
                  }
                  if (val.state !== 'completed' || !val.inspection) throw new Error(val.error || 'Source inspection failed');
                  if (val.inspection) {
                    if (onAppendPages) {
                      onAppendPages(Array.from({ length: val.inspection.totalPages }, (_, i) => ({ page: i + 1, sessionId: source.id, rotation: 0, filename: source.filename })));
                    } else {
                    setPlan(prev => [
                      ...(prev?.length ? prev : currentPlan),
                      ...Array.from({ length: val.inspection!.totalPages }, (_, i) => ({ page: i + 1, sessionId: source.id, rotation: 0 })),
                    ]);
                    }
                  }
                } catch (error) {
                  console.warn('[PdfWorkstationTools] Merge source failed:', error);
                  setFailure(true);
                } finally {
                  setExternal(false);
                }
              })();
            })}
          </div>

          {/* Advanced Transformations */}
          <details className="border border-border rounded-xl p-3 space-y-3 text-xs">
            <summary className="font-semibold cursor-pointer">{t('stirlingMultiPageLayout')} & {t('stirlingScalePages')}</summary>
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2">
                <label className="flex-1">{t('stirlingScalePages')}: {scaleFactor}x
                  <input type="range" min="0.5" max="2.0" step="0.1" value={scaleFactor} onChange={e => setScaleFactor(Number(e.target.value))} className="w-full" />
                </label>
                {button('stirlingScalePages', () => apply('scale-pages', { scaleFactor }))}
              </div>
              <div className="flex items-center gap-2">
                <label className="flex-1">{t('stirlingMultiPageLayout')}
                  <select value={pagesPerSheet} onChange={e => setPagesPerSheet(Number(e.target.value))} className={field}>
                    {[2, 4, 6, 8, 9, 16].map(n => <option key={n} value={n}>{n} {t('page')}</option>)}
                  </select>
                </label>
                {button('stirlingMultiPageLayout', () => apply('multi-page-layout', { pagesPerSheet }))}
              </div>
              {button('stirlingSingleLongPage', () => apply('pdf-to-single-page'))}
              <div className="flex items-center gap-2">
                <label className="flex-1">{t('stirlingSplitPages')}
                  <input type="number" min={1} max={1000} value={split} onChange={e => setSplit(Number(e.target.value))} className={field} />
                </label>
                {button('stirlingSplitPages', () => apply('split', { pages: getOrganizerPages?.() ?? currentPlan, pagesPerFile: split }))}
              </div>
            </div>
          </details>
        </div>
      )}

      {/* MODE 3: EDIT & ANNOTATE */}
      {effectiveMode === 'edit' && (
        <div className="space-y-4">
          <Tabs className="max-w-full flex-wrap" activeTab={activeEditSubtool} onChange={id => setActiveEditSubtool(id as typeof activeEditSubtool)} ariaLabel={t('pdfDirectoryTitle')} tabs={([
                ['find-replace', 'stirlingInplaceText'],
                ['text', 'pdfAddText'],
                ['ink', 'stirlingFreehandInk'],
                ['image', 'stirlingInsertImage'],
                ['numbers', 'stirlingPageNumbering'],
                ['forms', 'stirlingUnlockForms'],
              ] as const).map(([id, label]) => ({ id, label: t(label) }))} />

          {activeEditSubtool === 'find-replace' && (
            <fieldset data-pdf-find-replace disabled={busy || external} className="min-w-0 space-y-3 rounded-lg border border-border p-3 text-start disabled:opacity-60">
              <div className="p-2 rounded-lg border border-warning/30 bg-warning/10 text-warning dark:text-warning text-xs flex items-start gap-2">
                <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <span className="font-bold block">{t('stirlingTextEditorAlphaTitle')}</span>
                  <p className="text-[11px] leading-relaxed opacity-90">{t('stirlingTextEditorAlphaWarning')}</p>
                </div>
              </div>
              <legend className="px-1 font-semibold leading-relaxed">{t('pdfFindReplace')}</legend>
              <p className="text-xs text-text-muted leading-relaxed">{t('pdfFindReplaceHint')}</p>
              {replacements.map((replacement, index) => (
                <div key={index} className="min-w-0 space-y-2 border-b border-border pb-3">
                  <label className="block leading-relaxed">
                    {t('pdfFindText')}
                    <input
                      data-pdf-find
                      type="text"
                      dir="auto"
                      autoComplete="off"
                      maxLength={4096}
                      value={replacement.find}
                      onChange={event => setReplacements(prev => prev.map((item, cur) => (cur === index ? { ...item, find: event.target.value } : item)))}
                      className={field + ' min-w-0 text-start leading-loose'}
                    />
                  </label>
                  <label className="block leading-relaxed">
                    {t('pdfReplaceText')}
                    <input
                      data-pdf-replacement
                      type="text"
                      dir="auto"
                      autoComplete="off"
                      maxLength={4096}
                      value={replacement.replace}
                      onChange={event => setReplacements(prev => prev.map((item, cur) => (cur === index ? { ...item, replace: event.target.value } : item)))}
                      className={field + ' min-w-0 text-start leading-loose'}
                    />
                  </label>
                  {replacements.length > 1 && (
                    <Button variant="secondary" size="sm" type="button" onClick={() => setReplacements(prev => prev.filter((_, cur) => cur !== index))} className="py-1 text-start text-xs underline leading-relaxed">
                      {t('pdfRemoveReplacement')}
                    </Button>
                  )}
                </div>
              ))}
              <label className="flex items-start gap-2 leading-relaxed text-xs">
                <input type="checkbox" checked={wholeWordSearch} onChange={event => setWholeWordSearch(event.target.checked)} className="mt-0.5 shrink-0" />
                {t('pdfWholeWord')}
              </label>
              <div className="flex flex-wrap gap-2">
                {button('pdfAddReplacement', () => setReplacements(prev => [...prev, { find: '', replace: '' }]), replacements.length >= 100)}
                {button('pdfApplyReplacements', () => apply('edit-content', { textReplacements: replacements, wholeWordSearch }), replacements.some(item => !item.find.length), true)}
              </div>
            </fieldset>
          )}

          {activeEditSubtool === 'text' && (
            <div className="space-y-3">
              <div className="p-2 rounded-lg border border-warning/30 bg-warning/10 text-warning dark:text-warning text-xs flex items-start gap-2">
                <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <span className="font-bold block">{t('stirlingTextEditorAlphaTitle')}</span>
                  <p className="text-[11px] leading-relaxed opacity-90">{t('stirlingTextEditorAlphaWarning')}</p>
                </div>
              </div>
              <label className="block text-xs font-medium space-y-1">
                <span>{t('pdfText')}</span>
                <textarea dir="auto" maxLength={100000} value={text} onChange={event => setText(event.target.value)} className={field + ' min-h-24'} />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs">
                  {t('pdfFontSize')}
                  <input type="number" min={5} max={144} value={size} onChange={e => setSize(Number(e.target.value))} className={field} />
                </label>
                <div className="text-xs">
                  {t('pdfTextColor')}
                  <PdfColorSwatches value={color} onChange={setColor} label={t('pdfTextColor')} />
                </div>
              </div>
              {select('pdfTextDirection', direction, setDirection, [['auto', 'pdfAutoDirection'], ['rtl', 'pdfRtl'], ['ltr', 'pdfLtr']])}
              {select('pdfTextAlignment', alignment, setAlignment, [['start', 'pdfAlignStart'], ['center', 'pdfAlignCenter'], ['end', 'pdfAlignEnd'], ['justify', 'pdfAlignJustify']])}
              {select('pdfFontFamily', fontFamily, setFontFamily, [['sans-serif', 'pdfFontSans'], ['serif', 'pdfFontSerif'], ['monospace', 'pdfFontMono'], ['cursive', 'pdfFontCursive']])}
              {button('pdfApplyStaged', edit, false, true)}
            </div>
          )}

          {activeEditSubtool === 'ink' && (
            <div className="space-y-3">
              <p className="text-xs text-text-muted">{t('stirlingFreehandInk')}</p>
              <PdfColorSwatches value={inkColor} onChange={setInkColor} label={t('pdfTextColor')} />
              <PdfInkPad strokes={strokes} onChange={setStrokes} color={inkColor} />
              {button('pdfApplySignature', () => apply('edit-content', { edits: [{ kind: 'ink-signature', page, rect, strokes: strokes.filter(stroke => stroke.length >= 2), color: inkColor }] }), !strokes.some(stroke => stroke.length >= 2) || strokes.length > 100, true)}
            </div>
          )}

          {activeEditSubtool === 'image' && (
            <div className="space-y-3">
              {button('pdfChooseImage', () => { void choose('image', setAsset); })}
              {asset && <p dir="auto" className="text-xs font-mono">{asset.filename}</p>}
              {button('stirlingInsertImage', () => apply('add-image', { image: asset?.id, page, x: rect[0], y: rect[1] }), !asset, true)}
            </div>
          )}

          {activeEditSubtool === 'numbers' && (
            <div className="space-y-3">
              {select('stirlingPageNumbering', pageNumberStyle, setPageNumberStyle, [
                ['PAGE_NUMBER_ONLY', 'stirlingPageNumbering'],
                ['PAGE_NUMBER_WITH_TOTAL', 'pdfSuitePageCount'],
              ])}
              <label className="text-xs">
                {t('stirlingPageNumbering')} (Start)
                <input type="number" min={1} value={pageNumberStart} onChange={e => setPageNumberStart(Number(e.target.value))} className={field} />
              </label>
              {button('stirlingPageNumbering', () => apply('page-numbers', { style: pageNumberStyle, position: pageNumberPosition, startNumber: pageNumberStart }), false, true)}
            </div>
          )}

          {activeEditSubtool === 'forms' && (
            <div className="space-y-3">
              <p className="text-xs text-text-muted">{t('stirlingUnlockForms')}</p>
              {button('stirlingUnlockForms', () => apply('unlock-forms'), false, true)}
            </div>
          )}
        </div>
      )}

      {/* MODE 4: SECURITY & REDACT */}
      {effectiveMode === 'security' && (
        <div className="space-y-4">
          <Tabs className="max-w-full flex-wrap" activeTab={activeSecuritySubtool} onChange={id => setActiveSecuritySubtool(id as typeof activeSecuritySubtool)} ariaLabel={t('pdfDirectoryTitle')} tabs={([
                ['redact', 'pdfSuiteRedact'],
                ['sanitize', 'stirlingSanitize'],
                ['watermark', 'stirlingWatermark'],
                ['encrypt', 'stirlingPasswordEncrypt'],
                ['sign', 'stirlingCertSign'],
                ['validate', 'pdfSuiteValidate'],
              ] as const).map(([id, label]) => ({ id, label: t(label) }))} />

          {activeSecuritySubtool === 'redact' && (
            <div className="space-y-3.5">
              {/* Segmented Mode Selector: Manual vs Auto */}
              <div className="flex rounded-lg border border-border bg-surface p-0.5 text-xs font-semibold">
                <Button variant="secondary" size="sm"
                  type="button"
                  onClick={() => setRedactMode('manual')}
                  className={`flex-1 py-1.5 rounded-md transition-all cursor-pointer ${
                    redactMode === 'manual'
                      ? 'bg-primary text-white shadow-xs'
                      : 'text-text-muted hover:text-text'
                  }`}
                >
                  {t('stirlingManualRedactMode')}
                </Button>
                <Button variant="secondary" size="sm"
                  type="button"
                  onClick={() => setRedactMode('auto')}
                  className={`flex-1 py-1.5 rounded-md transition-all cursor-pointer ${
                    redactMode === 'auto'
                      ? 'bg-primary text-white shadow-xs'
                      : 'text-text-muted hover:text-text'
                  }`}
                >
                  {t('stirlingAutoRedactMode')}
                </Button>
              </div>

              {/* MANUAL REDACTION MODE */}
              {redactMode === 'manual' && (
                <div className="space-y-3">
                  <p className="text-xs text-text-muted leading-relaxed">
                    {t('pdfRedactManualHint')}
                  </p>

                  {/* Add Current Box Button */}
                  <Button variant="secondary" size="sm"
                    type="button"
                    disabled={busy || !boxDrawn}
                    onClick={() => {
                      const newMark = {
                        id: `mark-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                        page,
                        rect: [...rect],
                      };
                      setPendingRedactionMarks(prev => [...prev, newMark]);
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-border hover:bg-surface text-xs font-semibold cursor-pointer"
                  >
                    <Plus size={13} />
                    <span>{t('stirlingAddCurrentBox')} ({t('page')} {page})</span>
                  </Button>

                  {/* Pending Marks List */}
                  {pendingRedactionMarks.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-[11px] uppercase tracking-wider text-text-muted">
                          {t('stirlingPendingMarks')} ({pendingRedactionMarks.length})
                        </span>
                        <Button variant="secondary" size="sm"
                          type="button"
                          onClick={() => setPendingRedactionMarks([])}
                          className="text-[10px] text-danger hover:underline cursor-pointer"
                        >
                          {t('stirlingClearAllMarks')}
                        </Button>
                      </div>

                      <div className="space-y-1 max-h-36 overflow-y-auto pe-1">
                        {pendingRedactionMarks.map((mark, idx) => (
                          <div
                            key={mark.id}
                            className="flex items-center justify-between p-1.5 rounded-lg border border-border bg-canvas text-xs"
                          >
                            <span className="font-mono text-[11px]">
                              #{idx + 1} {t('page')} {mark.page} · [{Math.round(mark.rect[0])}, {Math.round(mark.rect[1])}, {Math.round(mark.rect[2])}, {Math.round(mark.rect[3])}]
                            </span>
                            <Button variant="secondary" size="sm"
                              type="button"
                              onClick={() => setPendingRedactionMarks(prev => prev.filter(m => m.id !== mark.id))}
                              className="text-danger hover:bg-danger/10 p-1 rounded cursor-pointer"
                            >
                              <Trash2 size={12} />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Rasterize PDF to PDF-Image Toggle */}
                  <div className="rounded-xl border border-border bg-surface/50 p-2.5 space-y-1">
                    <label className="flex items-start gap-2 text-xs font-semibold cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={convertPdfToImage}
                        onChange={e => setConvertPdfToImage(e.target.checked)}
                        className="mt-0.5 rounded accent-primary cursor-pointer"
                      />
                      <span>{t('stirlingRasterizeRedact')}</span>
                    </label>
                    <p className="text-[10px] text-text-muted leading-relaxed ps-5">
                      {t('stirlingRasterizeRedactDesc')}
                    </p>
                  </div>

                  <label className="flex gap-2 text-xs cursor-pointer select-none">
                    <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
                    {t('pdfRedactionConfirm')}
                  </label>

                  {button(
                    'stirlingApplyAllRedactions',
                    () =>
                      apply('redact', {
                        regions:
                          pendingRedactionMarks.length > 0
                            ? pendingRedactionMarks.map(m => ({ page: m.page, rect: m.rect }))
                            : [{ page, rect }],
                        convertPdfToImage,
                      }),
                    !confirmed || (pendingRedactionMarks.length === 0 && !boxDrawn),
                    true
                  )}
                </div>
              )}

              {/* AUTOMATIC REDACTION MODE */}
              {redactMode === 'auto' && (
                <div className="space-y-3">
                  <p className="text-xs text-text-muted leading-relaxed">{t('pdfRedactionWarning')}</p>

                  {/* 1-Click Regex Presets */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted block">
                      {t('pdfRedactRegexPresets')}
                    </span>
                    <div className="grid grid-cols-2 gap-1.5">
                      {REDACTION_PRESETS.map(preset => {
                        const isSelected = pattern === preset.pattern;
                        return (
                          <Button variant="secondary" size="sm"
                            key={preset.id}
                            type="button"
                            onClick={() => {
                              setPattern(preset.pattern);
                              setSelectedRegexPreset(preset.id);
                            }}
                            className={`p-2 rounded-lg border text-start transition-all cursor-pointer ${
                              isSelected
                                ? 'border-border bg-primary/15 text-primary-text dark:text-primary-text font-bold'
                                : 'border-border hover:bg-surface text-xs'
                            }`}
                          >
                            <span className="block text-xs font-semibold leading-tight">{t(preset.nameKey)}</span>
                            <span className="block text-[10px] text-text-muted font-mono truncate">{preset.desc}</span>
                          </Button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Words to Redact (Multiple Words / Phrases) */}
                  <label className="block text-xs font-medium space-y-1">
                    <span>{t('pdfRedactWordsLabel')}</span>
                    <textarea
                      rows={2}
                      value={wordsToRedact}
                      onChange={e => setWordsToRedact(e.target.value)}
                      placeholder={t('pdfRedactWordsPlaceholder')}
                      className={field + ' font-mono text-xs'}
                    />
                  </label>

                  {/* Custom Regex Pattern Input */}
                  {input('pdfRedactionPattern', pattern, setPattern)}

                  {/* Advanced Toggles Grid */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={useRegex}
                        onChange={e => setUseRegex(e.target.checked)}
                        className="rounded accent-primary cursor-pointer"
                      />
                      <span>{t('pdfRedactUseRegex')}</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={wholeWordSearchAuto}
                        onChange={e => setWholeWordSearchAuto(e.target.checked)}
                        className="rounded accent-primary cursor-pointer"
                      />
                      <span>{t('pdfWholeWord')}</span>
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="text-xs font-medium space-y-1">
                      <span>{t('pdfRedactionColor')}</span>
                      <PdfColorSwatches value={boxColor} onChange={setBoxColor} label={t('pdfRedactionColor')} />
                    </div>
                    <label className="text-xs font-medium space-y-1">
                      <span>{t('pdfRedactExtraPadding')}</span>
                      <input
                        type="number"
                        min={0}
                        max={30}
                        value={customPadding}
                        onChange={e => setCustomPadding(Number(e.target.value) || 0)}
                        className={field + ' py-1'}
                      />
                    </label>
                  </div>

                  {/* Rasterize PDF to PDF-Image Toggle */}
                  <div className="rounded-xl border border-border bg-surface/50 p-2.5 space-y-1">
                    <label className="flex items-start gap-2 text-xs font-semibold cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={convertPdfToImage}
                        onChange={e => setConvertPdfToImage(e.target.checked)}
                        className="mt-0.5 rounded accent-primary cursor-pointer"
                      />
                      <span>{t('stirlingRasterizeRedact')}</span>
                    </label>
                    <p className="text-[10px] text-text-muted leading-relaxed ps-5">
                      {t('stirlingRasterizeRedactDesc')}
                    </p>
                  </div>

                  <label className="flex gap-2 text-xs cursor-pointer select-none">
                    <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
                    {t('pdfRedactionConfirm')}
                  </label>

                  {button(
                    'pdfSuiteRedact',
                    () => {
                      const wordsList = wordsToRedact
                        ? wordsToRedact.split(/[\r\n]+/).map(w => w.trim()).filter(Boolean)
                        : [];
                      apply('redact', {
                        pattern: pattern.trim() || undefined,
                        words: wordsList.length > 0 ? wordsList : (pattern.trim() ? [pattern.trim()] : undefined),
                        useRegex,
                        wholeWordSearch: wholeWordSearchAuto,
                        boxColor,
                        customPadding,
                        convertPdfToImage,
                      });
                    },
                    !confirmed || (!pattern.trim() && !wordsToRedact.trim()),
                    true
                  )}
                </div>
              )}
            </div>
          )}

          {activeSecuritySubtool === 'sanitize' && (
            <div className="space-y-3">
              <p className="text-xs text-text-muted">{t('stirlingSanitize')}</p>
              {button('stirlingSanitize', () => apply('sanitize'), false, true)}
            </div>
          )}

          {activeSecuritySubtool === 'watermark' && (
            <div className="space-y-3">
              {input('stirlingWatermarkText', watermarkText, setWatermarkText)}
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <span className="text-[10px] text-text-muted">{t('pdfDynamicVariablesLabel')}</span>
                {[
                  { label: '{date}', val: '{date}' },
                  { label: '{filename}', val: '{filename}' },
                  { label: '{page}', val: '{page}' },
                ].map(item => (
                  <Button variant="secondary" size="sm"
                    key={item.label}
                    type="button"
                    onClick={() => setWatermarkText(prev => `${prev} ${item.val}`.trim())}
                    className="px-1.5 py-0.5 rounded bg-subtle/30 hover:bg-subtle/60 text-[10px] font-mono transition-colors"
                  >
                    + {item.label}
                  </Button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs">
                  {t('pdfFontSize')}
                  <input type="number" min={10} max={120} value={watermarkFontSize} onChange={e => setWatermarkFontSize(Number(e.target.value))} className={field} />
                </label>
                <label className="text-xs">
                  {t('pdfToolRotation')}
                  <input type="number" min={0} max={360} value={watermarkRotation} onChange={e => setWatermarkRotation(Number(e.target.value))} className={field} />
                </label>
              </div>
              <label className="text-xs">
                {t('pdfToolOpacity')} · {watermarkOpacity}
                <input type="range" min="0.05" max="1.0" step="0.05" value={watermarkOpacity} onChange={e => setWatermarkOpacity(Number(e.target.value))} className="w-full" />
              </label>
              {button('stirlingWatermark', () => {
                const resolvedText = watermarkText
                  .replace(/\{date\}/gi, new Date().toISOString().slice(0, 10))
                  .replace(/\{filename\}/gi, session.filename || 'document.pdf')
                  .replace(/\{page\}/gi, String(page));
                apply('watermark', { watermarkText: resolvedText, fontSize: watermarkFontSize, rotation: watermarkRotation, opacity: watermarkOpacity });
              }, false, true)}
            </div>
          )}

          {activeSecuritySubtool === 'encrypt' && (
            <div className="space-y-3">
              <p className="text-xs text-text-muted">{t('pdfPermissionsWarning')}</p>
              {input('pdfUserPassword', user, setUser, 'password')}
              {input('pdfOwnerPassword', owner, setOwner, 'password')}
              <label className="text-xs block">
                {t('pdfEncryptionStrength')}
                <select value={bits} onChange={e => setBits(Number(e.target.value))} className={field}>
                  <option value={256}>{t('pdfEncryptionAes256')}</option>
                  <option value={128}>{t('pdfEncryptionAes128')}</option>
                </select>
              </label>
              {(Object.keys(permissions) as (keyof typeof permissions)[]).map(key => (
                <label key={key} className="flex gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={permissions[key]}
                    onChange={event => setPermissions(prev => ({ ...prev, [key]: event.target.checked }))}
                  />
                  {t(({ copy: 'pdfPermissionCopy', print: 'pdfPermissionPrint', modify: 'pdfPermissionModify', annotate: 'pdfPermissionAnnotate', forms: 'pdfPermissionForms' } as const)[key])}
                </label>
              ))}
              <div className="flex gap-2">
                {button('pdfSuiteEncrypt', () => apply('encrypt', { bits, ownerPassword: owner, userPassword: user, permissions }), owner.length < 8 || !user || owner === user, true)}
                {button('pdfDecrypt', () => apply('encrypt', { mode: 'decrypt' }))}
              </div>
            </div>
          )}

          {activeSecuritySubtool === 'sign' && (
            <div className="space-y-3">
              <p className="text-xs text-text-muted">{t('pdfSignatureWarning')}</p>
              {input('pdfFieldName', fieldName, setFieldName)}
              {button('pdfChooseCertificate', () => { void choose('certificate', setCertificate); })}
              {certificate && <p dir="auto" className="text-xs font-mono">{certificate.filename}</p>}
              {input('pdfCertificatePassword', certificatePassword, setCertificatePassword, 'password')}
              {button('stirlingCertSign', () => apply('sign', { certificate: certificate!.id, certificatePassword, page, rect, fieldName }), !certificate, true)}
              <div className="pt-2 border-t border-border">
                {button('pdfChooseTrustRoot', () => { void choose('trust-root', setTrustRoot); })}
                {trustRoot && <p dir="auto" className="text-xs font-mono">{trustRoot.filename}</p>}
                {button('pdfSuiteVerifySignatures', () => apply('verify-signatures', trustRoot ? { trustRoot: trustRoot.id } : {}))}
              </div>
              <PdfAuditViewer />
            </div>
          )}

          {activeSecuritySubtool === 'validate' && (
            <div className="space-y-3">
              <p className="text-xs text-text-muted">{t('pdfComplianceLimit')}</p>
              <label className="text-xs block">
                {t('pdfProfile')}
                <select value={profile} onChange={e => setProfile(e.target.value)} className={field}>
                  <option value="1b">{t('pdfFormatA1b')}</option>
                  <option value="2b">{t('pdfFormatA2b')}</option>
                  <option value="ua1">{t('pdfFormatUa1')}</option>
                </select>
              </label>
              {button('pdfSuiteValidate', () => apply('validate', { profile }), false, true)}
            </div>
          )}
        </div>
      )}

      {/* MODE 5: CONVERT & EXPORT */}
      {effectiveMode === 'convert' && (
        <div className="space-y-4">
          <p className="text-xs text-text-muted">{t('pdfConversionLimit')}</p>
          <div className="grid grid-cols-2 gap-2">
            {button('pdfSuiteXlsx', () => apply('export-xlsx'), false, tool === 'export-xlsx')}
            {button('stirlingExportDocx', () => apply('export-docx'), false, tool === 'export-docx')}
            {button('stirlingExportPptx', () => apply('export-pptx'), false, tool === 'export-pptx')}
            {button('stirlingExportCsv', () => apply('export-csv'), false, tool === 'export-csv')}
            {button('stirlingExportHtml', () => apply('export-html'), false, tool === 'export-html')}
            {button('stirlingExportMarkdown', () => apply('export-markdown'), false, tool === 'export-markdown')}
            {button('stirlingExportTxt', () => apply('export-text'), false, tool === 'export-text')}
            {button('stirlingCompress', () => apply('compress', { optimizeLevel }), false, tool === 'compress')}
            {button('stirlingExtractImages', () => apply('extract-images'), false, tool === 'extract-images')}
          </div>

          <div className="p-3 rounded-xl border border-border bg-surface space-y-2">
            <span className="text-xs font-semibold block">{t('stirlingCompress')}</span>
            <div className="flex gap-2">
              {[1, 2, 3].map(lvl => (
                <Button variant="secondary" size="sm"
                  key={lvl}
                  type="button"
                  onClick={() => setOptimizeLevel(lvl)}
                  className={`flex-1 py-1 text-xs rounded border ${optimizeLevel === lvl ? 'border-border bg-primary/10 text-primary-text' : 'border-border'}`}
                >
                  {t('pdfToolLevel', { level: lvl })}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-3 pt-2 border-t border-border">
            {tool === 'ocr' && button('pdfRunOcr', () => apply('ocr', { languages: 'ara+eng' }), false, true)}
          </div>
        </div>
      )}

      {failure && <p role="alert" className="text-xs text-danger">{t('pdfSuiteFailure')}</p>}
    </section>
  );
}
