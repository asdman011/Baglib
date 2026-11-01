'use client';

import React, { useEffect, useRef, useState } from 'react';
import { BookmarkPlus, Check, Globe, Loader2, Repeat2, X } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { cardPosition, KNOWLEDGE_CARD_SAVED, type CardRequest } from '../../libs/knowledge-card-context';
import type { AggregateDictionaryLookupResult, WikipediaSummaryCard } from '../../../shared/types/dictionary';
import type { QuranRichNode } from '../../../shared/types/quran';
import type { KnowledgeCard } from '../../../shared/types/knowledge-cards';
import type { TranslationKey } from '../../translations';

const CARD_WIDTH = 380;
const MAX_TEXT = 900;

interface CardSection { title: string; text: string; source?: string }

const richText = (nodes: QuranRichNode[]): string => nodes.map(node => node.text ?? richText(node.children ?? [])).join(' ').replace(/\s+/gu, ' ').trim();
const clip = (text: string) => text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…` : text;

async function quranSections({ context }: CardRequest, t: (key: TranslationKey) => string): Promise<CardSection[]> {
  const { script, tafsir, surah, ayah, wordIndex } = context;
  const api = window.electronAPI.quran;
  if (!script || !surah || !ayah) return [];
  const sections: CardSection[] = [];
  const morphology = await api.morphology({ script, surah, ayah });
  if (morphology.ok) {
    const word = morphology.data.find(item => wordIndex !== undefined && item.location.endsWith(`:${wordIndex}`));
    const parts = [word?.root && `${t('knowledgeCardRoot')}: ${word.root}`, word?.lemma && `${t('knowledgeCardLemma')}: ${word.lemma}`].filter(Boolean);
    if (parts.length) sections.push({ title: t('quranCatMorphology'), text: parts.join(' · ') });
  }
  if (tafsir) {
    const commentary = await api.commentary({ script, pack: tafsir, surah, ayah });
    if (commentary.ok && commentary.data) sections.push({ title: t('quranCatTafsir'), text: clip(richText(commentary.data.nodes)), source: `${commentary.data.from} – ${commentary.data.to}` });
  }
  return sections;
}

async function narratorSections({ text, context }: CardRequest, t: (key: TranslationKey) => string): Promise<CardSection[]> {
  const api = window.electronAPI.sunnah;
  if (!context.researchId || !api.research || !api.narrator) return [];
  const research = await api.research(context.researchId);
  if (!research.ok) return [];
  const node = research.data.nodes.find(item => item.rijal_id && (text.includes(item.surface) || item.surface.includes(text)));
  if (!node?.rijal_id) return [];
  const narrator = await api.narrator(node.rijal_id);
  if (!narrator.ok) return [];
  const { name, grade, deathText, tabaqah, sources } = narrator.data;
  const parts = [name, grade && `${t('knowledgeCardGrade')}: ${grade}`, deathText && `${t('knowledgeCardDeath')}: ${deathText}`, tabaqah].filter(Boolean);
  return [{ title: t('knowledgeCardNarrator'), text: parts.join('\n'), source: sources.map(item => item.source).filter(Boolean).join('، ') || undefined }];
}

export function KnowledgeCardPopover({ request, onClose, onPointerEnter, onPointerLeave }: { request: CardRequest; onClose: () => void; onPointerEnter: () => void; onPointerLeave: () => void }) {
  const { t, lang, dir } = useWorkspace();
  const { text, context, x, y } = request;
  const panel = useRef<HTMLDivElement>(null);
  const [sections, setSections] = useState<CardSection[] | null>(null);
  const [wikipedia, setWikipedia] = useState<WikipediaSummaryCard | null | 'loading' | 'empty'>(null);
  const [saved, setSaved] = useState<KnowledgeCard | null>(null);
  const [failed, setFailed] = useState(false);
  const [position, setPosition] = useState(() => cardPosition(x, y, CARD_WIDTH, 240, window.innerWidth, window.innerHeight));

  useEffect(() => {
    let active = true;
    const load = async () => {
      const [special, dictionary] = await Promise.all([
        context.kind === 'quran' ? quranSections(request, t).catch(() => []) : context.kind === 'hadith' ? narratorSections(request, t).catch(() => []) : Promise.resolve([]),
        (window.electronAPI.dictionaryLookup(text, { lang, includeWikipedia: false }) as Promise<AggregateDictionaryLookupResult>).catch(() => null),
      ]);
      const entries: CardSection[] = (dictionary?.entries ?? []).slice(0, 3).map(entry => ({ title: entry.headword, text: clip(entry.definitionText), source: entry.dictTitle }));
      if (active) setSections([...special, ...entries]);
    };
    void load();
    return () => { active = false; };
  // A new request remounts this component, so these never change while it is open.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (panel.current) setPosition(cardPosition(x, y, panel.current.offsetWidth, panel.current.offsetHeight, window.innerWidth, window.innerHeight));
  }, [x, y, sections, wikipedia]);

  const searchWikipedia = async () => {
    setWikipedia('loading');
    const summary = await window.electronAPI.dictionaryWikipedia(text, lang).catch(() => null);
    setWikipedia(summary ?? 'empty');
  };

  const backText = () => [...(sections ?? []), ...(wikipedia && typeof wikipedia === 'object' ? [{ title: wikipedia.title, text: wikipedia.extract, source: t('knowledgeCardWikipediaSource') }] : [])]
    .map(section => `${section.title}\n${section.text}${section.source ? `\n(${section.source})` : ''}`).join('\n\n');

  const save = async (memorize: boolean) => {
    setFailed(false);
    try {
      const api = window.electronAPI.knowledgeCards;
      const card = saved ?? await api.save({ front: text, back: backText(), sourceKind: context.kind, sourceRef: context.ref, sourceLabel: context.label, language: lang, workId: context.workId });
      if (memorize) await api.setMemorizing(card.id, true);
      setSaved({ ...card, memorizing: memorize || card.memorizing });
      window.dispatchEvent(new Event(KNOWLEDGE_CARD_SAVED));
    } catch {
      setFailed(true);
    }
  };

  const isEmpty = sections?.length === 0 && (wikipedia === null || wikipedia === 'empty');
  return <div ref={panel} role="dialog" aria-label={t('knowledgeCardOpen')} dir={dir} data-knowledge-card onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave}
    style={{ left: position.left, top: position.top, width: `min(${CARD_WIDTH}px, calc(100vw - 32px))` }}
    className="fixed z-[80] max-h-[70dvh] overflow-y-auto rounded-2xl border border-subtle bg-surface p-4 shadow-2xl text-main">
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p dir="auto" className="font-reading text-lg leading-loose break-words">{text}</p>
        {context.label && <p dir="auto" className="text-xs text-muted">{context.label}</p>}
      </div>
      <button type="button" onClick={onClose} aria-label={t('knowledgeCardClose')} title={t('knowledgeCardClose')} className="shrink-0 rounded-lg p-1.5 text-muted hover:bg-canvas"><X className="size-4" /></button>
    </div>

    <div className="mt-3 space-y-3 text-sm">
      {sections === null && <p role="status" className="flex items-center gap-2 text-muted"><Loader2 className="size-4 animate-spin" />{t('knowledgeCardLoading')}</p>}
      {sections?.map((section, index) => <section key={index} className="border-t border-subtle pt-2">
        <h4 dir="auto" className="text-xs font-bold text-muted">{section.title}</h4>
        <p dir="auto" className="mt-1 whitespace-pre-line leading-relaxed break-words">{section.text}</p>
        {section.source && <p dir="auto" className="mt-1 text-xs text-muted">{section.source}</p>}
      </section>)}
      {wikipedia && typeof wikipedia === 'object' && <section className="border-t border-subtle pt-2">
        <h4 dir="auto" className="text-xs font-bold text-muted">{wikipedia.title}</h4>
        <p dir={wikipedia.dir} className="mt-1 leading-relaxed break-words">{clip(wikipedia.extract)}</p>
        <p className="mt-1 text-xs text-muted">{t('knowledgeCardWikipediaSource')}</p>
      </section>}
      {isEmpty && <p className="text-muted">{t('knowledgeCardEmpty')}</p>}
      {failed && <p role="alert" className="text-red-600 dark:text-red-400">{t('knowledgeCardFailed')}</p>}
    </div>

    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-subtle pt-3 text-xs">
      <button type="button" disabled={sections === null || saved !== null} onClick={() => void save(false)} className="inline-flex items-center gap-1.5 rounded-lg border border-subtle px-2.5 py-1.5 font-semibold hover:bg-canvas disabled:opacity-60">
        {saved ? <Check className="size-3.5" /> : <BookmarkPlus className="size-3.5" />}{t(saved ? 'knowledgeCardSaved' : 'knowledgeCardSave')}
      </button>
      <button type="button" disabled={sections === null || saved?.memorizing === true} onClick={() => void save(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-subtle px-2.5 py-1.5 font-semibold hover:bg-canvas disabled:opacity-60">
        {saved?.memorizing ? <Check className="size-3.5" /> : <Repeat2 className="size-3.5" />}{t(saved?.memorizing ? 'knowledgeCardMemorizing' : 'knowledgeCardMemorize')}
      </button>
      {wikipedia === null && <button type="button" onClick={() => void searchWikipedia()} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-muted hover:bg-canvas"><Globe className="size-3.5" />{t('knowledgeCardWikipedia')}</button>}
      {wikipedia === 'loading' && <Loader2 className="size-4 animate-spin text-muted" />}
    </div>
  </div>;
}
