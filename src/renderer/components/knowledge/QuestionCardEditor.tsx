'use client';
import { useState } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { QUESTION_KINDS, kindKey, validateQuestion, type QuestionKind } from '../../../shared/practice';
import type { KnowledgeCard, SaveCardInput } from '../../../shared/types/knowledge-cards';
import { KNOWLEDGE_CARD_SAVED } from '../../libs/knowledge-card-context';
export function QuestionCardEditor({ card, onSaved }: {
    card?: KnowledgeCard;
    onSaved: () => void;
}) {
    const { t, lang } = useWorkspace();
    const [front, setFront] = useState(card?.front ?? '');
    const [back, setBack] = useState(card?.back ?? '');
    const [kind, setKind] = useState<QuestionKind>(card?.questionKind ?? 'recall');
    const p = card?.payload;
    const [options, setOptions] = useState(p && 'options' in p ? p.options.join('\n') : '');
    const [index, setIndex] = useState(p && 'correctIndex' in p ? String(p.correctIndex + 1) : '1');
    const [answer, setAnswer] = useState(p && 'answer' in p ? String(p.answer) : '');
    const [tolerance, setTolerance] = useState(p && 'tolerance' in p ? String(p.tolerance) : '0');
    const [unit, setUnit] = useState(p && 'unit' in p ? p.unit : '');
    const [model, setModel] = useState(p && 'modelAnswer' in p ? p.modelAnswer : '');
    const [failed, setFailed] = useState(false);
    const [busy, setBusy] = useState(false);
    const save = async () => {
        setBusy(true);
        try {
            const payload = kind === 'recall' ? null : kind === 'choice' ? { options: options.split('\n'), correctIndex: Number(index) - 1 } : kind === 'numeric' ? { answer: answer.trim() ? Number(answer) : NaN, tolerance: tolerance.trim() ? Number(tolerance) : NaN, unit } : { modelAnswer: model };
            const question = validateQuestion(kind, payload);
            const input: SaveCardInput = { front, back, sourceKind: card?.sourceKind ?? 'note', sourceRef: card?.sourceRef ?? undefined, language: card?.language ?? lang, ...question };
            if (card)
                await window.electronAPI.knowledgeCards.update(card.id, input, card.cardRevision ?? 0);
            else
                await window.electronAPI.knowledgeCards.save(input);
            setFailed(false);
            onSaved();
            window.dispatchEvent(new CustomEvent(KNOWLEDGE_CARD_SAVED));
        }
        catch {
            setFailed(true);
        }
        finally {
            setBusy(false);
        }
    };
    const field = 'w-full min-w-0 rounded-lg border border-subtle bg-canvas p-2 leading-loose';
    return <form data-question-editor onSubmit={e => { e.preventDefault(); void save(); }} className="space-y-3 min-w-0">
    <label className="block">{t('practiceQuestion')}<textarea required dir="auto" maxLength={20000} value={front} onChange={e => setFront(e.target.value)} className={field}/></label>
    <label className="block">{t('practiceBack')}<textarea dir="auto" maxLength={20000} value={back} onChange={e => setBack(e.target.value)} className={field}/></label>
    <label className="block">{t('practiceKind')}<select value={kind} onChange={e => setKind(e.target.value as QuestionKind)} className={field}>{QUESTION_KINDS.map(k => <option key={k} value={k}>{t(kindKey(k))}</option>)}</select></label>
    {kind === 'choice' && <><label className="block">{t('practiceOptions')}<textarea required dir="auto" value={options} onChange={e => setOptions(e.target.value)} className={field}/></label><label className="block">{t('practiceCorrectIndex')}<input type="number" min={1} max={12} value={index} onChange={e => setIndex(e.target.value)} className={field}/></label></>}
    {kind === 'numeric' && <><label className="block">{t('practiceNumericAnswer')}<input required type="number" step="any" value={answer} onChange={e => setAnswer(e.target.value)} className={field}/></label><label className="block">{t('practiceTolerance')}<input required type="number" min={0} step="any" value={tolerance} onChange={e => setTolerance(e.target.value)} className={field}/></label><label className="block">{t('practiceUnit')}<input maxLength={100} value={unit} onChange={e => setUnit(e.target.value)} className={field}/></label></>}
    {['short', 'application', 'explain_back'].includes(kind) && <label className="block">{t('practiceModel')}<textarea dir="auto" maxLength={20000} value={model} onChange={e => setModel(e.target.value)} className={field}/></label>}
    {failed && <p role="alert">{t('srsFailed')}</p>}
    <button type="submit" disabled={busy} className="rounded-lg border border-subtle p-2">{t('practiceSaveQuestion')}</button>
  </form>;
}
