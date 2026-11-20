'use client';
import React from 'react';
import { BookOpenText, Check, FileOutput, Layers, ListPlus, Merge, NotebookPen, RotateCcw, RotateCw, ScanText, Scissors, Sparkles, X } from 'lucide-react';
import type { AiActionPlan, AiActionPreviewStep } from '../../../shared/ai-actions';
import { PERSONAL_LISTS_CHANGED } from '../../../shared/personal-lists';
import type { TranslationKey } from '../../translations';

export type ActionPlanMessage = {
  id: number;
  role: 'action-plan';
  plan: AiActionPlan;
  status: 'pending' | 'running' | 'executed' | 'cancelled' | 'undone';
  executionId?: string;
  previousView?: string;
  error?: string;
};

export type ActionUndoneMessage = {
  id: number;
  role: 'action-undone';
  text: string;
};

interface AiActionsPreviewCardProps {
  message: ActionPlanMessage;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  onConfirm: (message: ActionPlanMessage) => void;
  onCancel: (message: ActionPlanMessage) => void;
  onUndo: (message: ActionPlanMessage) => void;
}

function StepIcon({ tool }: { tool: AiActionPreviewStep['tool'] }) {
  switch (tool) {
    case 'create_note':
    case 'append_to_note':
      return <NotebookPen className="mt-0.5 size-3.5 shrink-0 text-primary-text" />;
    case 'create_cards_from_selection':
      return <Layers className="mt-0.5 size-3.5 shrink-0 text-primary-text" />;
    case 'add_to_personal_list':
      return <ListPlus className="mt-0.5 size-3.5 shrink-0 text-primary-text" />;
    case 'open_source':
      return <BookOpenText className="mt-0.5 size-3.5 shrink-0 text-primary-text" />;
    case 'split_pdf':
      return <Scissors className="mt-0.5 size-3.5 shrink-0 text-primary-text" />;
    case 'merge_pdfs':
      return <Merge className="mt-0.5 size-3.5 shrink-0 text-primary-text" />;
    case 'extract_pdf_pages':
      return <FileOutput className="mt-0.5 size-3.5 shrink-0 text-primary-text" />;
    case 'rotate_pdf_pages':
      return <RotateCw className="mt-0.5 size-3.5 shrink-0 text-primary-text" />;
    case 'ocr_pdf_page':
      return <ScanText className="mt-0.5 size-3.5 shrink-0 text-primary-text" />;
  }
}

export function AiActionsPreviewCard({
  message,
  t,
  onConfirm,
  onCancel,
  onUndo,
}: AiActionsPreviewCardProps) {
  const { plan, status, error } = message;

  return (
    <div
      data-research-ai-message="action-plan"
      data-ai-action-plan={plan.planId}
      data-ai-action-status={status}
      className="me-4 space-y-2 rounded-xl border border-primary/30 bg-canvas p-3 text-xs"
    >
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-primary-text">
        <Sparkles className="size-3.5 shrink-0" />
        <span>{t('aiActionPlanTitle', { count: plan.steps.length })}</span>
      </div>

      <ol className="space-y-2">
        {plan.steps.map((step, index) => (
          <li
            key={step.stepId}
            data-ai-action-step={step.tool}
            className="rounded-lg border border-subtle bg-surface p-2"
          >
            <div className="flex items-start gap-1.5 font-medium">
              <StepIcon tool={step.tool} />
              <span dir="auto" className="min-w-0 flex-1">
                {plan.steps.length > 1 ? `${index + 1}. ` : ''}
                {step.summary}
              </span>
            </div>

            {step.details.content && (
              <p dir="auto" className="mt-1.5 max-h-28 overflow-y-auto whitespace-pre-wrap rounded border border-subtle/60 bg-canvas px-2 py-1 text-[11px] text-muted">
                {step.details.content}
              </p>
            )}

            {step.details.appendText && (
              <p dir="auto" className="mt-1.5 max-h-28 overflow-y-auto whitespace-pre-wrap rounded border border-subtle/60 bg-canvas px-2 py-1 text-[11px] text-muted">
                + {step.details.appendText}
              </p>
            )}

            {step.details.cards && step.details.cards.length > 0 && (
              <div className="mt-1.5 space-y-1">
                <span className="inline-block rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                  {t('aiActionReviewBadge')}
                </span>
                {step.details.cards.map((card, cardIdx) => (
                  <div key={cardIdx} className="rounded border border-subtle/60 bg-canvas px-2 py-1 text-[11px]">
                    <p dir="auto" className="font-semibold">{card.front}</p>
                    <p dir="auto" className="text-muted">{card.back}</p>
                  </div>
                ))}
              </div>
            )}

            {step.details.itemRef && (
              <p dir="auto" className="mt-1 text-[10px] text-muted">
                {step.details.itemRef}
              </p>
            )}

            {step.details.target && (
              <p dir="auto" className="mt-1 text-[10px] text-muted">
                {step.details.target}
              </p>
            )}

            {step.details.outputPaths && step.details.outputPaths.length > 0 && (
              <div className="mt-1.5 space-y-0.5 rounded border border-subtle/60 bg-canvas px-2 py-1 text-[10px] text-muted">
                <p className="font-medium text-ink">{t('aiActionOutputFiles')}</p>
                {step.details.outputPaths.map(outPath => {
                  const filename = outPath.split(/[\\/]/u).pop() || outPath;
                  return (
                    <p key={outPath} dir="ltr" className="truncate font-mono">
                      {filename}
                    </p>
                  );
                })}
              </div>
            )}
          </li>
        ))}
      </ol>

      {error && (
        <p dir="auto" className="text-[11px] text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {status === 'pending' && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          <button
            type="button"
            data-ai-action-confirm
            onClick={() => onConfirm(message)}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 font-semibold text-white hover:opacity-90"
          >
            <Check className="size-3" />
            {t('aiActionConfirm')}
          </button>
          <button
            type="button"
            data-ai-action-cancel
            onClick={() => onCancel(message)}
            className="inline-flex items-center gap-1 rounded-md border border-subtle px-2.5 py-1 hover:bg-surface"
          >
            <X className="size-3" />
            {t('aiActionCancel')}
          </button>
        </div>
      )}

      {status === 'running' && (
        <p className="text-[11px] text-muted">{t('researchAiThinking')}</p>
      )}

      {status === 'cancelled' && (
        <p data-ai-action-cancelled className="text-[11px] text-muted">
          {t('aiActionCancelled')}
        </p>
      )}

      {status === 'executed' && (
        <div data-ai-action-executed className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
            {t('aiActionExecuted', { count: plan.steps.length })}
          </span>
          {message.executionId && (
            <button
              type="button"
              data-ai-action-undo
              onClick={() => onUndo(message)}
              className="inline-flex items-center gap-1 rounded-md border border-subtle px-2 py-0.5 text-[11px] hover:border-primary/40 hover:bg-surface"
            >
              <RotateCcw className="size-3" />
              {t('aiActionUndo')}
            </button>
          )}
        </div>
      )}

      {status === 'undone' && (
        <p data-ai-action-undone className="text-[11px] text-muted">
          {t('aiActionUndoneEntry')}
        </p>
      )}
    </div>
  );
}

export function dispatchAiActionEvents(tools: AiActionPreviewStep['tool'][]): void {
  if (tools.includes('create_cards_from_selection')) {
    window.dispatchEvent(new CustomEvent('baglib:knowledge-card-saved'));
  }
  if (tools.includes('add_to_personal_list')) {
    window.dispatchEvent(new CustomEvent(PERSONAL_LISTS_CHANGED));
  }
  if (tools.includes('create_note') || tools.includes('append_to_note')) {
    window.dispatchEvent(new CustomEvent('baglib:study-note-saved'));
  }
}
