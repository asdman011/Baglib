'use client';

import React, { useRef, useState } from 'react';
import { Sparkles, X, BookOpen, Save } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { Button } from '../ui/Button';
import { QUESTION_KINDS, kindKey, validateQuestion, type QuestionKind } from '../../../shared/practice';
import type { KnowledgeCard, SaveCardInput } from '../../../shared/types/knowledge-cards';
import { KNOWLEDGE_CARD_SAVED } from '../../libs/knowledge-card-context';

export interface QuestionCardEditorProps {
  card?: KnowledgeCard;
  initial?: SaveCardInput;
  onSaved: () => void;
  onCancel?: () => void;
}

export function QuestionCardEditor({ card, initial, onSaved, onCancel }: QuestionCardEditorProps) {
  const { t, lang, dir } = useWorkspace();
  const saving = useRef(false);
  const seed = card ?? initial;

  const [front, setFront] = useState(seed?.front ?? '');
  const [back, setBack] = useState(seed?.back ?? '');
  const [kind, setKind] = useState<QuestionKind>(seed?.questionKind ?? 'recall');
  const p = seed?.payload;
  const [options, setOptions] = useState(p && 'options' in p ? p.options.join('\n') : '');
  const [index, setIndex] = useState(p && 'correctIndex' in p ? String(p.correctIndex + 1) : '1');
  const [answer, setAnswer] = useState(p && 'answer' in p ? String(p.answer) : '');
  const [tolerance, setTolerance] = useState(p && 'tolerance' in p ? String(p.tolerance) : '0');
  const [unit, setUnit] = useState(p && 'unit' in p ? p.unit : '');
  const [model, setModel] = useState(p && 'modelAnswer' in p ? p.modelAnswer : '');
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    try {
      const payload =
        kind === 'recall'
          ? null
          : kind === 'choice'
          ? { options: options.split('\n'), correctIndex: Number(index) - 1 }
          : kind === 'numeric'
          ? {
              answer: answer.trim() ? Number(answer) : NaN,
              tolerance: tolerance.trim() ? Number(tolerance) : NaN,
              unit,
            }
          : { modelAnswer: model };

      const question = validateQuestion(kind, payload);
      const input: SaveCardInput = {
        front,
        back,
        sourceKind: seed?.sourceKind ?? 'note',
        sourceRef: seed?.sourceRef ?? undefined,
        sourceLabel: seed?.sourceLabel ?? undefined,
        workId: seed?.workId ?? undefined,
        language: seed?.language ?? lang,
        ...question,
      };

      if (card) {
        await window.electronAPI.knowledgeCards.update(card.id, input, card.cardRevision ?? 0);
      } else {
        await window.electronAPI.knowledgeCards.save(input);
      }
      setFailed(false);
      onSaved();
      window.dispatchEvent(new CustomEvent(KNOWLEDGE_CARD_SAVED));
    } catch {
      setFailed(true);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };

  const field =
    'w-full min-w-0 rounded-xl border border-subtle bg-canvas p-3 text-sm leading-[2] text-main outline-none focus-visible:outline-2 focus-visible:outline-focus transition-colors';

  return (
    <form
      data-question-editor
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="space-y-4 rounded-2xl border border-subtle bg-surface p-4 sm:p-5 shadow-sm min-w-0"
      dir={dir}
    >
      {/* Editor Header */}
      <div className="flex items-center justify-between gap-3 border-b border-subtle/80 pb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-amber-500" />
          <h4 className="font-display font-bold text-sm text-main">
            {card ? t('practiceEdit') : t('practiceNewQuestion')}
          </h4>
        </div>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            aria-label={t('close')}
            className="rounded-lg p-1 text-muted hover:text-main hover:bg-canvas transition-colors"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {/* Metadata / Source Chips if attached */}
      {(seed?.sourceLabel || seed?.sourceKind) && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-canvas border border-subtle text-muted">
            <BookOpen className="size-3.5 text-primary-text" />
            <span className="truncate max-w-[200px]">
              {seed.sourceLabel || seed.sourceKind}
            </span>
          </span>
          <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary-text text-[11px] font-mono">
            {kind}
          </span>
        </div>
      )}

      {/* Front / Question */}
      <label className="block space-y-1.5 text-xs font-semibold text-main">
        <span>{t('practiceQuestion')}</span>
        <textarea
          required
          dir="auto"
          maxLength={20000}
          rows={3}
          value={front}
          onChange={(e) => setFront(e.target.value)}
          placeholder={t('practiceQuestion')}
          className={`${field} font-reading text-base leading-[2.2]`}
          style={{ fontFamily: "var(--font-amiri, 'Amiri', 'Traditional Arabic', serif)" }}
        />
      </label>

      {/* Back / Answer */}
      <label className="block space-y-1.5 text-xs font-semibold text-main">
        <span>{t('practiceBack')}</span>
        <textarea
          dir="auto"
          maxLength={20000}
          rows={3}
          value={back}
          onChange={(e) => setBack(e.target.value)}
          placeholder={t('practiceBack')}
          className={`${field} font-reading text-sm leading-[2.2]`}
          style={{ fontFamily: "var(--font-amiri, 'Amiri', 'Traditional Arabic', serif)" }}
        />
      </label>

      {/* Question Kind */}
      <label className="block space-y-1.5 text-xs font-semibold text-main">
        <span>{t('practiceKind')}</span>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as QuestionKind)}
          className={field}
        >
          {QUESTION_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(kindKey(k))}
            </option>
          ))}
        </select>
      </label>

      {/* Choice Kind fields */}
      {kind === 'choice' && (
        <div className="space-y-3 p-3 rounded-xl bg-canvas border border-subtle">
          <label className="block space-y-1.5 text-xs font-semibold text-main">
            <span>{t('practiceOptions')}</span>
            <textarea
              required
              dir="auto"
              rows={4}
              value={options}
              onChange={(e) => setOptions(e.target.value)}
              placeholder="الخيار الأول&#10;الخيار الثاني&#10;الخيار الثالث"
              className={field}
            />
          </label>
          <label className="block space-y-1.5 text-xs font-semibold text-main">
            <span>{t('practiceCorrectIndex')}</span>
            <input
              type="number"
              min={1}
              max={12}
              value={index}
              onChange={(e) => setIndex(e.target.value)}
              className={field}
            />
          </label>
        </div>
      )}

      {/* Numeric Kind fields */}
      {kind === 'numeric' && (
        <div className="space-y-3 p-3 rounded-xl bg-canvas border border-subtle">
          <label className="block space-y-1.5 text-xs font-semibold text-main">
            <span>{t('practiceNumericAnswer')}</span>
            <input
              required
              type="number"
              step="any"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              className={field}
            />
          </label>
          <label className="block space-y-1.5 text-xs font-semibold text-main">
            <span>{t('practiceTolerance')}</span>
            <input
              required
              type="number"
              min={0}
              step="any"
              value={tolerance}
              onChange={(e) => setTolerance(e.target.value)}
              className={field}
            />
          </label>
          <label className="block space-y-1.5 text-xs font-semibold text-main">
            <span>{t('practiceUnit')}</span>
            <input
              maxLength={100}
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className={field}
            />
          </label>
        </div>
      )}

      {/* Model Answer fields */}
      {['short', 'application', 'explain_back'].includes(kind) && (
        <label className="block space-y-1.5 text-xs font-semibold text-main">
          <span>{t('practiceModel')}</span>
          <textarea
            dir="auto"
            maxLength={20000}
            rows={3}
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className={field}
          />
        </label>
      )}

      {failed && (
        <p role="alert" className="text-xs text-danger font-medium">
          {t('srsFailed')}
        </p>
      )}

      {/* Footer Actions */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-subtle/80">
        {onCancel && (
          <Button variant="secondary" size="sm" onClick={onCancel}>
            {t('cancel')}
          </Button>
        )}
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={busy}
          loading={busy}
          icon={<Save className="size-3.5" />}
        >
          {t('practiceSaveQuestion')}
        </Button>
      </div>
    </form>
  );
}
