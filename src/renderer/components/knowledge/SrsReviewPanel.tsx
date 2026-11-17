'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MISTAKE_CATEGORIES,mistakeKey,type MistakeCategory } from '../../../shared/practice';
import { PracticeAnswer } from './PracticeAnswer';
import { SafeCardRenderer, isTemplateHtml } from './SafeCardRenderer';
import { navigateStudyReference, openStudyNote } from '../../utils/study-navigation';
import { useWorkspace } from '../context/WorkspaceContext';
import { KNOWLEDGE_CARD_SAVED } from '../../libs/knowledge-card-context';
import { renderTemplate } from '../../../shared/revision/template-engine';
import { poetryBayts } from '../../../shared/poetry';
import type { CardNote, CardNoteType } from '../../../shared/types/card-notes';
import type { ReviewQueue, ReviewRating } from '../../../shared/srs';

const playCardTts = async (text: string, ttsLang: string) => {
  const pocketLang = ttsLang.startsWith('en') ? 'english'
    : ttsLang.startsWith('fr') ? 'french'
    : ttsLang.startsWith('de') ? 'german'
    : ttsLang.startsWith('es') ? 'spanish'
    : ttsLang.startsWith('it') ? 'italian'
    : ttsLang.startsWith('pt') ? 'portuguese'
    : ttsLang.startsWith('nl') ? 'dutch'
    : undefined;

  if (pocketLang) {
    try {
      const ttsApi = window.electronAPI?.audio?.tts;
      if (ttsApi) {
        const status = await ttsApi.getStatus().catch(() => null);
        if (status?.isLoaded) {
          await ttsApi.synthesize({ text, voiceId: status.currentVoice || 'default', language: pocketLang });
          return;
        }
      }
    } catch {}
  }

  try {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      if (ttsLang) u.lang = ttsLang;
      window.speechSynthesis.speak(u);
    }
  } catch {}
};

export function SrsReviewPanel({ deckId }: { deckId?: string | null } = {}) {
  const { t, dir, lang, books, openBookForReading } = useWorkspace();
  const ioStrings = useMemo(() => ({ toggleMasks: t('ioToggleMasks'), noImage: t('ioNoImage') }), [t]);
  const [queue, setQueue] = useState<ReviewQueue | null>(null);
  const [mistake,setMistake]=useState<MistakeCategory|undefined>();
  const [confidence,setConfidence]=useState(0);
  const [practiceDone,setPracticeDone]=useState(false);
  const [revealed, setRevealed] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<CardNote | null>(null);
  const [noteType, setNoteType] = useState<CardNoteType | null>(null);
  const [typedAnswers, setTypedAnswers] = useState<Record<string, string>>({});
  const locked = useRef(false);
  const started = useRef(0);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    if (locked.current) return;
    const request = ++generation.current;
    try {
      const value = await window.electronAPI.knowledgeCards.reviewQueue(deckId ?? undefined);
      if (request !== generation.current) return;
      setQueue(value); setRevealed(false);setConfidence(0);setMistake(undefined);setPracticeDone(false); setFailed(false); started.current = Date.now();
    } catch { if (request === generation.current) setFailed(true); }
  }, [deckId]);
  useEffect(() => {
    const pending = generation;
    const update = () => void refresh();
    update();
    window.addEventListener(KNOWLEDGE_CARD_SAVED, update);
    return () => { pending.current++; window.removeEventListener(KNOWLEDGE_CARD_SAVED, update); };
  }, [refresh]);
  useEffect(() => {
    if (!queue || queue.cards.length || !queue.nextDue) return;
    const delay = Math.min(2_147_483_647, Math.max(1000, Date.parse(queue.nextDue) - Date.now()));
    const timer = setTimeout(() => void refresh(), delay);
    return () => clearTimeout(timer);
  }, [queue, refresh]);
  const card = queue?.cards[0];
  const typedAnswer = (card ? typedAnswers[card.id] : undefined) ?? '';

  useEffect(() => {
    let active = true;
    if (!card?.noteId) return;

    window.electronAPI.cardNotes.getNote(card.noteId)
      .then(async (fetchedNote) => {
        if (!active) return;
        setNote(fetchedNote);
        if (fetchedNote) {
          const fetchedType = await window.electronAPI.cardNotes.getType(fetchedNote.noteTypeId);
          if (!active) return;
          setNoteType(fetchedType);
        }
      })
      .catch(() => {});

    return () => { active = false; };
  }, [card?.noteId]);

  const renderedContent = useMemo(() => {
    if (!card) return { front: '', back: '', css: '' };

    const currentNote = note && note.id === card.noteId ? note : null;
    const currentNoteType = currentNote && noteType && noteType.id === currentNote.noteTypeId ? noteType : null;

    if (currentNote && currentNoteType) {
      try {
        const cardOrd = card.ord ?? 0;
        let template = currentNoteType.templates[cardOrd];
        let clozeNum = cardOrd + 1;

        if (currentNoteType.kind === 'cloze') {
          template = currentNoteType.templates[0] || { ord: 0, name: 'Cloze', front: '{{cloze:Text}}', back: '{{cloze:Text}}<br>{{Back Extra}}' };
        } else if (currentNoteType.kind === 'context_cloze') {
          template = currentNoteType.templates[0] || {
            ord: 0,
            name: 'Context Card',
            front: '<div class="context-before">{{Context Before}}</div>\n<div class="cloze-target">{{cloze:Target}}</div>\n<div class="context-after context-blurred">{{Context After}}</div>',
            back: '{{FrontSide}}\n\n<hr id=answer>\n\n<div class="notes">{{Notes}}</div>',
          };
        }

        if (template) {
          let fields = { ...currentNote.fields };
          if (currentNoteType.kind === 'context_cloze') {
            const textToSplit = fields['Target'] || fields['Poem'] || fields['Text'] || Object.values(fields)[0] || '';
            const verses = textToSplit.split(/\r?\n/u).map((s) => s.trim()).filter(Boolean);
            const bayts = poetryBayts(verses);
            if (bayts.length > 0 && cardOrd < bayts.length) {
              const i = cardOrd;
              const prevBayt = i > 0 ? (bayts[i - 1].ajuz ? `${bayts[i - 1].sadr} ... ${bayts[i - 1].ajuz}` : bayts[i - 1].sadr) : '';
              const currBayt = bayts[i];
              const targetText = currBayt.ajuz ? `${currBayt.sadr} {{c1::${currBayt.ajuz}}}` : `{{c1::${currBayt.sadr}}}`;
              const nextBayt = i + 1 < bayts.length ? (bayts[i + 1].ajuz ? `${bayts[i + 1].sadr} ... ${bayts[i + 1].ajuz}` : bayts[i + 1].sadr) : '';
              fields = {
                ...fields,
                'Context Before': prevBayt,
                'Target': targetText,
                'Context After': nextBayt,
              };
              clozeNum = 1;
            }
          }

          const frontHtml = renderTemplate(template.front, { fields, cardOrd, clozeNum }, 'front');
          const backHtml = renderTemplate(template.back, { fields, cardOrd, clozeNum, frontRendered: frontHtml, typedAnswer }, 'back');
          return { front: frontHtml, back: backHtml, css: currentNoteType.css };
        }
      } catch (err) {
        console.warn('Failed to render note template:', err);
      }
    }

    return {
      front: card.front,
      back: card.back || card.front,
      css: '',
    };
  }, [card, note, noteType, typedAnswer]);

  const grade = useCallback(async (rating: ReviewRating) => {
    if (!card || locked.current || !revealed) return;
    locked.current = true; setBusy(true); generation.current++;
    try {
      if ((card.questionKind??'recall')==='recall' && !practiceDone) {
        await window.electronAPI.knowledgeCards.recordAttempt({knowledgeId:card.id,cardRevision:card.cardRevision,answerText:'',confidence,checkMethod:'self',mistakeCategory:rating<=2?mistake:undefined,result:rating===1?'incorrect':rating===2?'partial':'correct',durationMs:Math.min(86_400_000,Math.max(0,Date.now()-started.current))});
        setPracticeDone(true); window.dispatchEvent(new CustomEvent('baglib:practice-recorded'));
      }
      const value = await window.electronAPI.knowledgeCards.gradeReview({ id: card.id, revision: card.revision, rating, durationMs: Math.min(86_400_000, Math.max(0, Date.now() - started.current)), ...(deckId ? { deckId } : {}) });
      setQueue(value); setRevealed(false);setConfidence(0);setMistake(undefined);setPracticeDone(false); setFailed(false); started.current = Date.now();
      window.dispatchEvent(new CustomEvent('baglib:srs-reviewed'));
    } catch { setFailed(true); }
    finally { locked.current = false; setBusy(false); }
  }, [card, revealed,confidence,practiceDone,mistake, deckId]);
  return <section dir={dir} data-srs-review className="rounded-2xl border border-subtle bg-surface p-4 space-y-3 min-w-0">
    <header className="flex flex-wrap justify-between gap-2"><h3 className="font-bold">{t('srsTitle')}</h3><button type="button" disabled={busy} onClick={() => void refresh()} className="text-sm underline">{t('srsRefresh')}</button></header>
    {queue && <p className="text-sm text-muted" aria-live="polite">{t('srsCounts', { due: queue.due, reviewed: queue.reviewedToday })} · {t('deckCountsBadge', { newCount: queue.newCount ?? 0, learningCount: queue.learningCount ?? 0, dueCount: queue.dueCount ?? queue.due })}</p>}
    {failed && <p role="alert" className="text-sm text-red-600">{t('srsFailed')}</p>}
    {!queue && !failed && <p role="status">{t('srsLoading')}</p>}
    {card ? <article key={card.id} className="space-y-3" data-srs-card={card.id}>
      <SafeCardRenderer
        html={revealed ? renderedContent.back : renderedContent.front}
        css={renderedContent.css}
        side={revealed ? 'back' : 'front'}
        rtl={dir === 'rtl'}
        className="w-full"
        onTypedAnswerChange={(val) => {
          if (card) setTypedAnswers((prev) => ({ ...prev, [card.id]: val }));
        }}
        onPlayTts={playCardTts}
        ioStrings={ioStrings}
      />
      <p dir="auto" className="font-reading text-lg leading-loose whitespace-pre-wrap break-words sr-only">{card.front}</p>
      {card.sourceRef && (
        <button
          type="button"
          data-card-source={card.id}
          className="rounded border border-subtle p-2 text-sm underline"
          onClick={() => void navigateStudyReference(card.sourceRef!, books, openBookForReading, (id, anchor) => openStudyNote({ id, anchor })).catch(() => setFailed(true))}
        >
          {t('practiceOpenSource')}
        </button>
      )}
      {card.sourceLabel && <p dir="auto" className="text-xs text-muted">{card.sourceLabel}</p>}
      {(card.questionKind??'recall')!=='recall'&&<PracticeAnswer key={`${card.id}-${card.cardRevision}`} card={card} onRecorded={()=>{setPracticeDone(true);setRevealed(true);}}/>}
      {(card.questionKind??'recall')==='recall'&&!revealed&&<fieldset><legend className="leading-loose">{t('practiceConfidence')}</legend><div className="flex flex-wrap gap-2">{[1,2,3,4].map(n=><label className="rounded border border-subtle p-2" key={n}><input type="radio" name="srs-confidence" value={n} checked={confidence===n} onChange={()=>setConfidence(n)}/> {n}</label>)}</div></fieldset>}
      {revealed ? <>
        {(card.questionKind??'recall')==='recall'&&!isTemplateHtml(card.back)&&<p dir="auto" data-srs-answer className="border-t border-subtle pt-3 leading-loose whitespace-pre-wrap break-words">{card.back || t('srsRecall')}</p>}
        {(card.questionKind??'recall')==='recall'&&<label className="block">{t('practiceMistake')}<select aria-label={t('practiceMistake')} value={mistake??''} onChange={e=>setMistake(e.target.value as MistakeCategory||undefined)} className="w-full min-w-0 bg-canvas rounded border border-subtle p-2"><option value="">{t('practiceSkipMistake')}</option>{MISTAKE_CATEGORIES.map(m=><option key={m} value={m}>{t(mistakeKey(m))}</option>)}</select></label>}
        <p className="text-sm">{t('practiceSrsSeparate')}</p>
        {(card.questionKind??'recall')==='recall'&&<p>{t('practiceCheckedSelf')}</p>}
        <div className="flex flex-wrap gap-2">{([1, 2, 3, 4] as const).map(rating => <button key={rating} type="button" data-srs-rating={rating} disabled={busy} onClick={() => void grade(rating)} className="rounded-lg border border-subtle px-3 py-2 disabled:opacity-50">{t((['srsAgain', 'srsHard', 'srsGood', 'srsEasy'] as const)[rating - 1])}</button>)}</div>
      </> : (card.questionKind??'recall')==='recall' && <button type="button" disabled={!confidence} data-srs-reveal onClick={() => setRevealed(true)} className="rounded-lg bg-emerald-700 text-white px-3 py-2">{t('srsReveal')}</button>}
    </article> : queue && <p role="status" className="text-sm text-muted">{t('srsEmpty')}{queue.nextDue && <> · {t('srsNext')} <time dateTime={queue.nextDue}>{new Date(queue.nextDue).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB')}</time></>}</p>}
  </section>;
}
