'use client';
import React, { useEffect, useState } from 'react';
import { ACTION_TOOLS, PDF_ACTIONS_KEY, validatePdfAction, type ActionTool, type PdfAction } from '../../../shared/pdf-actions';
import type { PdfFeature } from '../../../shared/types/pdf-editor';
import type { TranslationKey } from '../../translations';
import { useWorkspace } from '../context/WorkspaceContext';
import { Button } from '../ui/Button';

const defaults: Record<ActionTool, Record<string, unknown>> = {
  compress: { optimizeLevel: 2 }, 'page-numbers': { position: 8 }, watermark: { text: '', opacity: 0.25 }, ocr: { languages: 'ara,eng' }, 'repair-metadata': {},
};

export function PdfSavedActions({ disabled, labels, available, onRun }: {
  disabled: boolean;
  labels: Record<PdfFeature, TranslationKey>;
  available: PdfFeature[];
  onRun: (action: PdfAction) => void;
}) {
  const { t } = useWorkspace();
  const [actions, setActions] = useState<PdfAction[]>([]);
  const [name, setName] = useState('');
  const [steps, setSteps] = useState<{ tool: ActionTool; options: string }[]>([
    { tool: 'compress', options: JSON.stringify(defaults.compress) }, { tool: 'page-numbers', options: JSON.stringify(defaults['page-numbers']) },
  ]);
  const [message, setMessage] = useState<TranslationKey | null>(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    void window.electronAPI.settings.get(PDF_ACTIONS_KEY, []).then((value: unknown) => {
      const valid: PdfAction[] = [];
      if (Array.isArray(value)) for (const item of value.slice(0, 50)) {
        try { valid.push(validatePdfAction(item)); } catch { /* Ignore invalid older settings. */ }
      }
      if (alive) { setActions(valid); setLoaded(true); }
    }, () => { if (alive) setMessage('studyActionFailed'); });
    return () => { alive = false; };
  }, []);
  const persist = async (next: PdfAction[]) => {
    setSaving(true);
    try {
      await window.electronAPI.settings.set(PDF_ACTIONS_KEY, next);
      setActions(next);
      setMessage('pdfActionSaved');
    } catch { setMessage('studyActionFailed'); }
    finally { setSaving(false); }
  };
  const save = async () => {
    try {
      if (actions.length >= 50) throw new Error();
      const action = validatePdfAction({ id: crypto.randomUUID(), name, steps: steps.map(step => ({ tool: step.tool, options: JSON.parse(step.options) })) });
      await persist([...actions, action]);
    } catch { setMessage('pdfActionInvalid'); }
  };
  const field = 'min-w-0 w-full rounded-xl border border-border bg-canvas p-2 text-xs leading-relaxed text-text focus-visible:outline-focus';
  return <section data-pdf-saved-actions className="space-y-3 pt-2">
    <h3 className="text-xs font-bold uppercase tracking-wider text-text">{t('pdfActions')}</h3>
    {actions.map(action => <div key={action.id} className="flex min-w-0 flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-2.5 shadow-xs">
      <span dir="auto" className="min-w-0 flex-1 break-words text-xs font-medium text-text leading-relaxed">{action.name}</span>
      <Button size="sm" variant="primary" data-action-run={action.id} disabled={disabled || saving || action.steps.some(step => !available.includes(step.tool))} onClick={() => onRun(action)}>{t('pdfActionRun')}</Button>
      <Button size="sm" variant="secondary" disabled={disabled || saving} onClick={() => void persist(actions.filter(item => item.id !== action.id))}>{t('pdfActionRemove')}</Button>
    </div>)}
    <details className="rounded-xl border border-border bg-surface p-2.5">
      <summary className="cursor-pointer text-xs font-semibold text-primary-text leading-relaxed">{t('pdfActionSave')}</summary>
      <fieldset disabled={disabled || saving || !loaded} className="mt-2.5 min-w-0 space-y-2.5 disabled:opacity-50">
        <label className="block text-xs leading-relaxed">{t('pdfActionName')}<input data-action-name aria-label={t('pdfActionName')} placeholder={t('pdfActionName')} dir="auto" maxLength={120} value={name} onChange={event => setName(event.target.value)} className={field} /></label>
        {steps.map((step, index) => <div key={index} className="space-y-2 rounded-xl border border-border bg-canvas p-2.5">
          <label className="block text-xs font-medium text-text">{t('pdfActionStep', { step: index + 1, total: steps.length })}
            <select data-action-tool={index} value={step.tool} onChange={event => {
              const tool = event.target.value as ActionTool;
              setSteps(current => current.map((item, i) => i === index ? { tool, options: JSON.stringify(defaults[tool]) } : item));
            }} className={`${field} mt-1`}>{ACTION_TOOLS.map(tool => <option key={tool} value={tool}>{t(labels[tool])}</option>)}</select>
          </label>
          <label className="block text-xs leading-relaxed">{t('pdfActionOptions')}<textarea data-action-options={index} aria-label={t('pdfActionOptions')} dir="ltr" maxLength={4000} value={step.options} onChange={event => setSteps(current => current.map((item, i) => i === index ? { ...item, options: event.target.value } : item))} className={`${field} font-mono`} /></label>
          <Button size="sm" variant="secondary" disabled={steps.length <= 2} onClick={() => setSteps(current => current.filter((_, i) => i !== index))}>{t('pdfActionRemove')}</Button>
        </div>)}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" variant="secondary" disabled={steps.length >= 12} onClick={() => setSteps(current => [...current, { tool: 'compress', options: JSON.stringify(defaults.compress) }])}>{t('pdfActionAddStep')}</Button>
          <Button size="sm" variant="primary" data-action-save onClick={() => void save()}>{t('pdfActionSave')}</Button>
        </div>
      </fieldset>
    </details>
    {message && <p role="status" className="text-xs text-text-muted leading-relaxed">{t(message)}</p>}
  </section>;
}
