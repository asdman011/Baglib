'use client';

/**
 * Baglib — choose what a deck follows (KEY-393, KEY-409): a book, a Sunnah book (kitab), bab or
 * collection, a poem, or a poet. Reports the subscription's source reference, or '' while
 * incomplete.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { collectionKeys } from '../../utils/sunnah-collections';
import type { SunnahCatalog, SunnahCollectionId } from '../../../shared/types/sunnah';

export type DeckSourceKind = 'book_highlights' | 'book_comments' | 'sunnah_book' | 'sunnah_bab' | 'hadith_collection' | 'poem' | 'poet';

const field = 'w-full rounded-lg border border-subtle bg-canvas px-2 py-1.5 text-sm text-main';

export function DeckSourcePicker({ kind, onChange }: { kind: DeckSourceKind; onChange: (ref: string) => void }) {
  const { t, books, lang } = useWorkspace();
  const [bookId, setBookId] = useState('');
  const [catalog, setCatalog] = useState<SunnahCatalog['collections']>([]);
  const [collection, setCollection] = useState('');
  const [chapter, setChapter] = useState('');
  const [sections, setSections] = useState<Array<{ number: string; title: string }>>([]);
  const [section, setSection] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Array<{ id: number; label: string }>>([]);
  const [picked, setPicked] = useState('');
  const isSunnah = kind === 'sunnah_book' || kind === 'sunnah_bab' || kind === 'hadith_collection';
  const isPoetry = kind === 'poem' || kind === 'poet';

  // The Sunnah catalog, once.
  useEffect(() => {
    if (!isSunnah || catalog.length) return;
    let active = true;
    void window.electronAPI.sunnah.catalog().then(response => {
      if (!active) return;
      setCatalog(response.ok && response.data ? response.data.collections.filter(c => c.id in collectionKeys && c.chapters.length) : []);
    });
    return () => {
      active = false;
    };
  }, [isSunnah, catalog.length]);

  // A chapter's babs, for the bab picker.
  useEffect(() => {
    if (kind !== 'sunnah_bab' || !collection || !chapter) return;
    let active = true;
    void window.electronAPI.sunnah.chapter(collection as SunnahCollectionId, Number(chapter)).then(response => {
      if (!active || !response.ok) return;
      const seen = new Map<string, string>();
      for (const h of response.data.hadiths) {
        const number = String(h.section?.number ?? '');
        if (number && !seen.has(number)) seen.set(number, h.section.title[lang === 'ar' ? 'ar' : 'en'] || h.section.title.ar || number);
      }
      setSections([...seen].map(([number, title]) => ({ number, title })));
    });
    return () => {
      active = false;
    };
  }, [kind, collection, chapter, lang]);

  // Poem or poet search, debounced.
  useEffect(() => {
    if (!isPoetry) return;
    const handle = setTimeout(() => {
      const language = /[؀-ۿ]/u.test(query) || !query ? 'ar' : 'en';
      if (kind === 'poem') {
        void window.electronAPI.poetry.search({ query, language, limit: 25 }).then(response => {
          setResults(response.ok ? response.data.items.map(p => ({ id: p.id, label: `${p.title} — ${p.poetName}` })) : []);
        });
      } else {
        void window.electronAPI.poetry.poets({ query, language }).then(response => {
          setResults(response.ok ? response.data.items.slice(0, 25).map(p => ({ id: p.id, label: `${p.name} (${p.poemCount})` })) : []);
        });
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [isPoetry, kind, query]);

  const ref = useMemo(() => {
    if (kind === 'book_highlights' || kind === 'book_comments') return bookId;
    if (kind === 'hadith_collection') return collection;
    if (kind === 'sunnah_book') return collection && chapter ? `${collection}:${chapter}` : '';
    if (kind === 'sunnah_bab') return collection && chapter && section ? `${collection}:${chapter}:${section}` : '';
    return picked;
  }, [kind, bookId, collection, chapter, section, picked]);
  useEffect(() => onChange(ref), [ref, onChange]);

  const chapters = catalog.find(c => c.id === collection)?.chapters ?? [];

  if (kind === 'book_highlights' || kind === 'book_comments') {
    return (
      <label className="space-y-1 text-xs text-muted">
        <span>{t('deckSyncBook')}</span>
        <select value={bookId} data-deck-sync-book onChange={e => setBookId(e.target.value)} className={field}>
          <option value="">{t('deckSyncChooseBook')}</option>
          {books.map(book => (
            <option key={book.id} value={book.id} dir="auto">
              {book.title}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (isSunnah) {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="space-y-1 text-xs text-muted">
          <span>{t('deckSyncCollection')}</span>
          <select
            value={collection}
            data-deck-sync-collection
            onChange={e => {
              setCollection(e.target.value);
              setChapter('');
              setSection('');
              setSections([]);
            }}
            className={field}
          >
            <option value="">{t('deckSyncChooseCollection')}</option>
            {catalog.map(c => (
              <option key={c.id} value={c.id}>
                {t(collectionKeys[c.id])}
              </option>
            ))}
          </select>
        </label>
        {kind !== 'hadith_collection' && (
          <label className="space-y-1 text-xs text-muted">
            <span>{t('deckSyncKitab')}</span>
            <select
              value={chapter}
              data-deck-sync-chapter
              disabled={!collection}
              onChange={e => {
                setChapter(e.target.value);
                setSection('');
                setSections([]);
              }}
              className={field}
            >
              <option value="">{t('deckSyncChooseKitab')}</option>
              {chapters.map(c => (
                <option key={c.number} value={String(c.number)} dir="auto">
                  {c.number}. {c.title[lang === 'ar' ? 'ar' : 'en'] || c.title.ar}
                </option>
              ))}
            </select>
          </label>
        )}
        {kind === 'sunnah_bab' && (
          <label className="space-y-1 text-xs text-muted sm:col-span-2">
            <span>{t('deckSyncBab')}</span>
            <select value={section} data-deck-sync-bab disabled={!sections.length} onChange={e => setSection(e.target.value)} className={field}>
              <option value="">{t('deckSyncChooseBab')}</option>
              {sections.map(s => (
                <option key={s.number} value={s.number} dir="auto">
                  {s.title}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className="block space-y-1 text-xs text-muted">
        <span>{kind === 'poem' ? t('deckSyncSearchPoem') : t('deckSyncSearchPoet')}</span>
        <input value={query} dir="auto" data-deck-sync-poetry-query onChange={e => setQuery(e.target.value)} className={field} />
      </label>
      <select value={picked} data-deck-sync-poetry-pick size={Math.min(6, Math.max(2, results.length))} onChange={e => setPicked(e.target.value)} className={field}>
        {results.map(r => (
          <option key={r.id} value={String(r.id)} dir="auto">
            {r.label}
          </option>
        ))}
      </select>
      {!results.length && <p className="text-xs text-muted">{t('deckSyncNoResults')}</p>}
    </div>
  );
}
