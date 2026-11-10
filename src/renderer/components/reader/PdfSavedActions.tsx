'use client';
import React, { useEffect, useState } from 'react';
import { ACTION_TOOLS, PDF_ACTIONS_KEY, validatePdfAction, type ActionTool, type PdfAction } from '../../../shared/pdf-actions';
import type { PdfFeature } from '../../../shared/types/pdf-editor';
import type { TranslationKey } from '../../translations';
import { useWorkspace } from '../context/WorkspaceContext';

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
  const field = 'min-w-0 w-full rounded border border-subtle bg-canvas p-1.5 text-xs leading-relaxed';
  return <section data-pdf-saved-actions className="space-y-2 border-t border-subtle pt-3">
    <h3 className="text-sm font-semibold">{t('pdfActions')}</h3>
    {actions.map(action => <div key={action.id} className="flex min-w-0 flex-wrap items-center gap-2 rounded border border-subtle p-2">
      <span dir="auto" className="min-w-0 flex-1 break-words text-xs leading-relaxed">{action.name}</span>
      <button type="button" data-action-run={action.id} disabled={disabled || saving || action.steps.some(step => !available.includes(step.tool))} onClick={() => onRun(action)} className="rounded bg-emerald-600 px-2 py-1 text-xs text-white disabled:opacity-40">{t('pdfActionRun')}</button>
      <button type="button" disabled={disabled || saving} onClick={() => void persist(actions.filter(item => item.id !== action.id))} className="rounded border border-subtle px-2 py-1 text-xs disabled:opacity-40">{t('pdfActionRemove')}</button>
    </div>)}
    <details>
      <summary className="cursor-pointer text-xs leading-relaxed">{t('pdfActionSave')}</summary>
      <fieldset disabled={disabled || saving || !loaded} className="mt-2 min-w-0 space-y-2 disabled:opacity-50">
        <input data-action-name aria-label={t('pdfActionName')} placeholder={t('pdfActionName')} dir="auto" maxLength={120} value={name} onChange={event => setName(event.target.value)} className={field} />
        {steps.map((step, index) => <div key={index} className="space-y-1 rounded border border-subtle p-2">
          <label className="block text-xs">{t('pdfActionStep', { step: index + 1, total: steps.length })}
            <select data-action-tool={index} value={step.tool} onChange={event => {
              const tool = event.target.value as ActionTool;
              setSteps(current => current.map((item, i) => i === index ? { tool, options: JSON.stringify(defaults[tool]) } : item));
            }} className={field}>{ACTION_TOOLS.map(tool => <option key={tool} value={tool}>{t(labels[tool])}</option>)}</select>
          </label>
          <textarea data-action-options={index} aria-label={t('pdfActionOptions')} dir="ltr" maxLength={4000} value={step.options} onChange={event => setSteps(current => current.map((item, i) => i === index ? { ...item, options: event.target.value } : item))} className={`${field} font-mono`} />
          <button type="button" disabled={steps.length <= 2} onClick={() => setSteps(current => current.filter((_, i) => i !== index))} className="text-xs disabled:opacity-40">{t('pdfActionRemove')}</button>
        </div>)}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={steps.length >= 12} onClick={() => setSteps(current => [...current, { tool: 'compress', options: JSON.stringify(defaults.compress) }])} className="rounded border border-subtle p-2 text-xs">{t('pdfActionAddStep')}</button>
          <button type="button" data-action-save onClick={() => void save()} className="rounded bg-emerald-600 p-2 text-xs text-white">{t('pdfActionSave')}</button>
        </div>
      </fieldset>
    </details>
    {message && <p role="status" className="text-xs leading-relaxed">{t(message)}</p>}
  </section>;
}
