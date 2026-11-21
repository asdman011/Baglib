'use client';
import React from 'react';
import { BookOpenText, Check, FileOutput, Layers, ListPlus, Merge, NotebookPen, RotateCcw, RotateCw, ScanText, Scissors, Sparkles, X } from 'lucide-react';
import type { AiActionBookCandidate, AiActionErrorCode, AiActionPlan, AiActionPreviewStep } from '../../../shared/ai-actions';
import { PERSONAL_LISTS_CHANGED } from '../../../shared/personal-lists';
import type { TranslationKey } from '../../translations';

export type ActionSelections = Record<string, { workId: string; sourceId?: string }>;

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
  onConfirm: (message: ActionPlanMessage, selections?: ActionSelections) => void;
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

function CandidatePicker({
  selectionKey,
  candidates,
  selected,
  disabled,
  onSelect,
}: {
  selectionKey: string;
  candidates: AiActionBookCandidate[];
  selected?: { workId: string; sourceId?: string };
  disabled: boolean;
  onSelect: (key: string, pick: { workId: string; sourceId?: string }) => void;
}) {
  return (
    <div className="mt-1 space-y-1" role="radiogroup">
      {candidates.map(candidate => {
        const isSelected =
          selected?.workId === candidate.workId &&
          (!candidate.sourceId || selected?.sourceId === candidate.sourceId);
        return (
          <label
            key={`${candidate.workId}:${candidate.sourceId ?? ''}`}
            data-ai-action-candidate={candidate.workId}
            className={`flex cursor-pointer items-start gap-2 rounded border px-2 py-1 text-[11px] transition-colors ${
              isSelected
                ? 'border-primary bg-primary/10 text-ink'
                : 'border-subtle/70 bg-canvas hover:border-primary/40'
            }`}
          >
            <input
              type="radio"
              name={`ai-candidate-${selectionKey}`}
              checked={isSelected}
              disabled={disabled}
              onChange={() =>
                onSelect(selectionKey, {
                  workId: candidate.workId,
                  ...(candidate.sourceId ? { sourceId: candidate.sourceId } : {}),
                })
              }
              className="mt-0.5 shrink-0 accent-primary"
            />
            <span className="min-w-0 flex-1 text-start">
              <span dir="auto" className="block font-medium text-ink">
                {candidate.title}
              </span>
              {(candidate.author || candidate.subtitle) && (
                <span dir="auto" className="block text-[10px] text-muted">
                  {[candidate.author, candidate.subtitle].filter(Boolean).join(' · ')}
                </span>
              )}
            </span>
          </label>
        );
      })}
    </div>
  );
}

export function AiActionsPreviewCard({
  message,
  t,
  onConfirm,
  onCancel,
  onUndo,
}: AiActionsPreviewCardProps) {
  const { plan, status, error } = message;
  const [selections, setSelections] = React.useState<ActionSelections>({});

  const selectCandidate = (key: string, pick: { workId: string; sourceId?: string }) => {
    setSelections(current => ({ ...current, [key]: pick }));
  };

  const missingSelection = plan.steps.some(step => {
    if (step.details.candidates && step.details.candidates.length > 1 && !selections[step.stepId]) {
      return true;
    }
    if (
      step.details.mergeCandidateGroups?.some(
        group => group.candidates.length > 1 && !selections[`${step.stepId}:${group.index}`]
      )
    ) {
      return true;
    }
    return false;
  });

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

            {step.details.candidates && step.details.candidates.length > 1 && (
              <div className="mt-1.5 rounded border border-amber-500/30 bg-amber-500/5 p-1.5">
                <p className="text-[10px] font-medium text-amber-800 dark:text-amber-300">
                  {t('aiActionPickBook')}
                </p>
                <CandidatePicker
                  selectionKey={step.stepId}
                  candidates={step.details.candidates}
                  selected={selections[step.stepId]}
                  disabled={status !== 'pending'}
                  onSelect={selectCandidate}
                />
              </div>
            )}

            {step.details.mergeCandidateGroups && step.details.mergeCandidateGroups.length > 0 && (
              <div className="mt-1.5 space-y-1.5 rounded border border-amber-500/30 bg-amber-500/5 p-1.5">
                <p className="text-[10px] font-medium text-amber-800 dark:text-amber-300">
                  {t('aiActionPickBook')}
                </p>
                {step.details.mergeCandidateGroups.map(group => {
                  const key = `${step.stepId}:${group.index}`;
                  return (
                    <div key={key}>
                      <p dir="auto" className="text-[10px] text-muted">{group.query}</p>
                      <CandidatePicker
                        selectionKey={key}
                        candidates={group.candidates}
                        selected={selections[key]}
                        disabled={status !== 'pending'}
                        onSelect={selectCandidate}
                      />
                    </div>
                  );
                })}
              </div>
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
            disabled={missingSelection}
            onClick={() => onConfirm(message, Object.keys(selections).length ? selections : undefined)}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
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

export function aiActionErrorText(
  code: AiActionErrorCode,
  detail: string | undefined,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
): string {
  switch (code) {
    case 'ai-disabled':
      return t('assistantErrorDisabled');
    case 'learning-mode-off':
      return t('aiActionLearningModeOff');
    case 'not-configured':
      return t('researchAiNotConfigured');
    case 'consent-required':
      return t('aiPrivacyConsentRequired');
    case 'tools-unsupported':
      return t('aiActionUnsupported');
    case 'not-found': {
      const raw = detail || '';
      if (raw.startsWith('book:')) return t('aiActionErrorBookNotFound', { name: raw.slice(5) });
      if (raw.startsWith('pdf:')) return t('aiActionErrorPdfNotFound', { name: raw.slice(4) });
      if (raw.startsWith('note:')) return t('aiActionErrorNoteNotFound', { name: raw.slice(5) });
      if (raw.startsWith('hadith:')) return t('aiActionErrorHadithNotFound', { name: raw.slice(7) });
      return t('aiActionErrorNotFound', { detail: raw || code });
    }
    case 'invalid-arguments': {
      const reason = detail || '';
      if (reason === 'invalid-source-target' || reason === 'unsupported-source-target') {
        return t('aiActionErrorInvalidSourceTarget');
      }
      if (
        reason === 'invalid-page-range-syntax' ||
        reason === 'page-out-of-range' ||
        reason === 'page-range-too-large' ||
        reason === 'invalid-page-number'
      ) {
        return t('aiActionErrorInvalidPageRange');
      }
      if (reason === 'page-already-has-text-layer') {
        return t('aiActionErrorOcrTextLayer');
      }
      if (reason === 'candidate-selection-required') {
        return t('aiActionErrorPickRequired');
      }
      return t('aiActionErrorInvalidArgs', { detail: reason || code });
    }
    case 'provider-error':
      return t('researchAiProviderError').replace('{message}', detail || code);
    default:
      return t('aiActionError', { detail: detail || code });
  }
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
