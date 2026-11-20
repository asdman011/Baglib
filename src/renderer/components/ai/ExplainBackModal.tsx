'use client';

/**
 * KEY-437 (AI Task 3, epic KEY-434): "Explain it back" modal & host.
 * Opened from book reader selection, Quran ayah, Sunnah hadith, or study note menus.
 */
import React, { useEffect, useRef, useState } from 'react';
import { BookOpen, CheckCircle2, HelpCircle, Mic, MicOff, Save, Sparkles } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { useWorkspace } from '../context/WorkspaceContext';
import { useRemoteConsent } from './useRemoteConsent';
import { useLearningMode } from './useLearningMode';
import { useAssistant } from './AssistantContext';
import { moduleFromStudyTarget } from '../../../shared/ai-learning-mode';
import type {
  ExplainBackErrorCode,
  ExplainBackFeedback,
  ExplainBackSourceKind,
} from '../../../shared/ai-explain-back';
import type { TranslationKey } from '../../translations';

export interface ExplainBackTrigger {
  kind: ExplainBackSourceKind;
  target: string;
  label: string;
  sourceText?: string;
}

const EXPLAIN_BACK_EVENT = 'baglib:explain-back';

export function openExplainBack(detail: ExplainBackTrigger): void {
  window.dispatchEvent(new CustomEvent<ExplainBackTrigger>(EXPLAIN_BACK_EVENT, { detail }));
}

const ERROR_KEYS: Partial<Record<ExplainBackErrorCode, TranslationKey>> = {
  'ai-disabled': 'assistantErrorDisabled',
  'not-configured': 'assistantErrorEngine',
  'permission-denied': 'assistantErrorRemote',
  'learning-mode-off': 'explainBackLearningModeOff',
  'missing-source': 'assistantMissingBookSource',
  'passage-too-short': 'explainBackShort',
  'passage-too-long': 'explainBackLong',
  'invalid-output': 'assistantErrorUnchecked',
  busy: 'assistantErrorBusy',
  'provider-quota': 'assistantErrorEngine',
  'provider-busy': 'assistantErrorBusy',
  'provider-auth': 'assistantErrorEngine',
  'provider-model': 'assistantErrorEngine',
  'provider-too-large': 'explainBackLong',
  'provider-error': 'assistantErrorEngine',
};

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export function ExplainBackHost() {
  const [trigger, setTrigger] = useState<ExplainBackTrigger | null>(null);

  useEffect(() => {
    const onTrigger = (event: Event) => {
      const detail = (event as CustomEvent<ExplainBackTrigger>).detail;
      if (detail?.target && detail?.kind) {
        setTrigger(detail);
      }
    };
    window.addEventListener(EXPLAIN_BACK_EVENT, onTrigger);
    return () => window.removeEventListener(EXPLAIN_BACK_EVENT, onTrigger);
  }, []);

  if (!trigger) return null;
  return <ExplainBackModal trigger={trigger} onClose={() => setTrigger(null)} />;
}

export function ExplainBackModal({
  trigger,
  onClose,
}: {
  trigger: ExplainBackTrigger;
  onClose: () => void;
}) {
  const { t, lang, dir } = useWorkspace();
  const consent = useRemoteConsent();
  const { modeFor } = useLearningMode();
  const { inRevisionOrTest } = useAssistant();
  const learningMode = modeFor(inRevisionOrTest ? 'revision' : (moduleFromStudyTarget(trigger.target) ?? 'notes'), inRevisionOrTest);
  const [explanation, setExplanation] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<ExplainBackFeedback | null>(null);
  const [consentPrompt, setConsentPrompt] = useState(false);
  const [dictating, setDictating] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const speechCtor =
    typeof window !== 'undefined'
      ? ((window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition ??
         (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition)
      : undefined;

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore cleanup errors
      }
    };
  }, []);

  const toggleDictation = () => {
    if (!speechCtor) return;
    if (dictating && recognitionRef.current) {
      recognitionRef.current.stop();
      setDictating(false);
      return;
    }
    try {
      const recognition = new speechCtor();
      recognition.lang = lang === 'ar' ? 'ar-SA' : 'en-US';
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.onresult = event => {
        const lastIdx = event.results.length - 1;
        const transcript = lastIdx >= 0 ? event.results[lastIdx]?.[0]?.transcript?.trim() : '';
        if (transcript) {
          setExplanation(prev => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript));
        }
      };
      recognition.onerror = () => setDictating(false);
      recognition.onend = () => setDictating(false);
      recognitionRef.current = recognition;
      recognition.start();
      setDictating(true);
    } catch {
      setDictating(false);
    }
  };

  const executeCheck = async (allowRemote: boolean) => {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const response = await window.electronAPI.explainBack.evaluate({
        kind: trigger.kind,
        target: trigger.target,
        label: trigger.label,
        sourceText: trigger.sourceText,
        explanation,
        language: lang === 'ar' ? 'ar' : 'en',
        allowRemote,
      });
      if (!response.ok) {
        const key = ERROR_KEYS[response.error];
        const base = key ? t(key) : t('assistantErrorEngine');
        setError(response.detail ? `${base}: ${response.detail}` : base);
        return;
      }
      setFeedback(response.data);
    } catch {
      setError(t('assistantErrorEngine'));
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async () => {
    if (!explanation.trim() || busy) return;
    setError(null);
    const status = await consent.check().catch(() => ({ local: false, allowed: false, ready: false }));
    if (status.ready && !status.local && !status.allowed) {
      setConsentPrompt(true);
      return;
    }
    await executeCheck(status.local || status.allowed);
  };

  const handleAllowRemote = async () => {
    setConsentPrompt(false);
    await consent.allow();
    await executeCheck(true);
  };

  const handleSaveNote = async () => {
    if (!feedback || saving || saved) return;
    setSaving(true);
    setError(null);
    try {
      const res = await window.electronAPI.explainBack.saveNote({
        kind: trigger.kind,
        target: trigger.target,
        label: trigger.label,
        explanation,
        feedback,
        language: lang === 'ar' ? 'ar' : 'en',
      });
      if (!res.ok) {
        setError(t('assistantErrorEngine'));
        return;
      }
      setSaved(true);
      window.dispatchEvent(new CustomEvent('baglib:notes-changed'));
    } catch {
      setError(t('assistantErrorEngine'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={true}
      onClose={() => { if (!busy && !saving) onClose(); }}
      title={t('explainBackAction')}
      description={trigger.label}
      size="xl"
    >
      <div
        data-explain-back-modal
        dir={dir}
        className="flex-1 space-y-4 overflow-y-auto p-4 text-sm"
      >
          <p className="text-xs leading-relaxed text-muted">{t('explainBackPromptIntro')}</p>

          {consentPrompt && (
            <div
              data-explain-back-consent
              role="alertdialog"
              className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 text-xs leading-relaxed"
            >
              <p dir="auto">
                {t('assistantConsentAsk', { provider: consent.customName ?? t(consent.providerLabel) })}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  data-explain-back-consent-allow
                  onClick={() => void handleAllowRemote()}
                  className="rounded-full bg-primary px-3 py-1 font-semibold text-white"
                >
                  {t('assistantConsentAllow')}
                </button>
                <button
                  type="button"
                  data-explain-back-consent-cancel
                  onClick={() => setConsentPrompt(false)}
                  className="rounded-full border border-subtle px-3 py-1"
                >
                  {t('assistantConsentCancel')}
                </button>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="explain-back-textarea" className="text-xs font-semibold text-main">
                {t('explainBackYourExplanation')}
              </label>
              {speechCtor && !feedback && (
                <button
                  type="button"
                  onClick={toggleDictation}
                  disabled={busy}
                  className="inline-flex items-center gap-1 rounded-lg border border-subtle px-2.5 py-1 text-xs hover:bg-canvas disabled:opacity-40"
                >
                  {dictating ? <MicOff className="size-3.5" /> : <Mic className="size-3.5" />}
                  {t(dictating ? 'explainBackDictateStop' : 'explainBackDictateStart')}
                </button>
              )}
            </div>
            <textarea
              id="explain-back-textarea"
              data-explain-back-input
              dir="auto"
              rows={4}
              maxLength={8000}
              disabled={busy || Boolean(feedback)}
              value={explanation}
              onChange={event => setExplanation(event.target.value)}
              placeholder={t('explainBackPlaceholder')}
              className="w-full rounded-xl border border-subtle bg-canvas p-3 text-sm leading-relaxed text-main focus:border-primary focus:outline-none disabled:opacity-75"
            />
          </div>

          {learningMode === 'off' && (
            <p data-explain-back-learning-mode-off className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs leading-relaxed">
              {t('aiLearningModeOffNotice')}
            </p>
          )}
          {!feedback && (
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                data-explain-back-submit
                disabled={busy || learningMode === 'off' || !explanation.trim()}
                onClick={() => void handleSubmit()}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
              >
                <Sparkles className="size-3.5" />
                {t(busy ? 'explainBackChecking' : 'explainBackSubmit')}
              </button>
            </div>
          )}

          {error && (
            <p role="alert" data-explain-back-error className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-700 dark:text-red-300">
              {error}
            </p>
          )}

          {feedback && (
            <section data-explain-back-feedback aria-live="polite" className="space-y-3 border-t border-subtle pt-3">
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                <span className="font-semibold">{t('explainBackSourcesUsed')}:</span>
                {feedback.sourcesUsed.map((source, idx) => (
                  <span
                    key={`${source.title}-${idx}`}
                    className="inline-flex items-center gap-1 rounded-full border border-subtle bg-canvas px-2 py-0.5"
                    dir="auto"
                  >
                    <BookOpen className="size-3 shrink-0" aria-hidden="true" />
                    {source.title}
                  </span>
                ))}
              </div>

              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-1.5">
                <h3 className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="size-3.5" aria-hidden="true" />
                  {t('explainBackRightHeading')}
                </h3>
                {feedback.right.length > 0 ? (
                  <ul className="list-disc ps-5 space-y-1 text-xs leading-relaxed" dir="auto">
                    {feedback.right.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted">{t('explainBackNoneRecorded')}</p>
                )}
              </div>

              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
                <h3 className="text-xs font-bold text-amber-700 dark:text-amber-300">
                  {t('explainBackMissingHeading')}
                </h3>
                {feedback.missingOrWrong.length > 0 ? (
                  <ul className="space-y-2 text-xs leading-relaxed">
                    {feedback.missingOrWrong.map((item, idx) => (
                      <li key={idx} className="space-y-1" dir="auto">
                        <p className="font-medium text-main">{item.point}</p>
                        {item.quote && (
                          <blockquote className="border-s-2 border-amber-500/60 ps-2.5 text-muted">
                            <span>«{item.quote}»</span>
                            <footer className="mt-0.5 text-[11px]">
                              — {item.sourceTitle}
                              {!item.quoteVerified && (
                                <span className="ms-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px]">
                                  {t('explainBackUnverifiedQuote')}
                                </span>
                              )}
                            </footer>
                          </blockquote>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted">{t('explainBackNoneRecorded')}</p>
                )}
              </div>

              <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-1">
                <h3 className="flex items-center gap-1.5 text-xs font-bold text-primary-text">
                  <HelpCircle className="size-3.5" aria-hidden="true" />
                  {t('explainBackFollowUpHeading')}
                </h3>
                <p className="text-xs leading-relaxed text-main" dir="auto" data-explain-back-followup>
                  {feedback.followUpQuestion}
                </p>
              </div>

              {feedback.uncertainty && (
                <p className="rounded-lg bg-canvas px-3 py-2 text-[11px] text-muted" dir="auto">
                  <strong className="me-1">{t('explainBackUncertaintyHeading')}:</strong>
                  {feedback.uncertainty}
                </p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setFeedback(null);
                    setSaved(false);
                  }}
                  disabled={saving}
                  className="rounded-xl border border-subtle px-3 py-1.5 text-xs hover:bg-canvas disabled:opacity-40"
                >
                  {t('explainBackTryAgain')}
                </button>
                <button
                  type="button"
                  data-explain-back-save
                  disabled={saving || saved}
                  onClick={() => void handleSaveNote()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
                >
                  <Save className="size-3.5" />
                  {t('explainBackSaveAsNote')}
                </button>
              </div>

              {saved && (
                <p role="status" data-explain-back-saved className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  {t('explainBackNoteSaved')}
                </p>
              )}
            </section>
          )}
        </div>
    </Modal>
  );
}
