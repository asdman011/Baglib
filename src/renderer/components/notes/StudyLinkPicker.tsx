'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import type { StudyNote } from '../../../shared/study-notes';
import { studyLinkText } from '../../../shared/study-notes';
import { bookStudyTarget, matchesStudyQuery } from '../../../shared/study-notes';
import { SUNNAH_COLLECTION_IDS } from '../../../shared/types/sunnah';
import { collectionKeys } from '../../utils/sunnah-collections';

export function StudyLinkPicker({ notes, onInsert }: { notes: StudyNote[]; onInsert: (text: string) => void }) {
  const { books, t } = useWorkspace();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ target: string; label: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadedKey, setLoadedKey] = useState('');
  const [error, setError] = useState(false);
  const [embed, setEmbed] = useState(false);
  const [profile, setProfile] = useState<'hafs' | 'warsh'>('hafs');
  const [collection, setCollection] = useState<typeof SUNNAH_COLLECTION_IDS[number]>('Bukhari');
  const scope = /^\/(notes|books|quran|sunnah)\b\s*/iu.exec(query);
  const kind = scope?.[1].toLowerCase() || 'notes';
  const keyword = query.replace(/^\/(notes|books|quran|sunnah)\b\s*/iu, '').trim();
  const local = useMemo(() => kind === 'books'
    ? books.filter(book => matchesStudyQuery(`${book.title} ${book.author}`, keyword)).map(book => ({ target: bookStudyTarget(book), label: book.title }))
    : notes.filter(note => matchesStudyQuery(`${note.title} ${note.content} ${note.aliases.join(' ')} ${note.tags.join(' ')}`, keyword)).map(note => ({ target: `note:${note.id}`, label: note.title || note.content.slice(0, 70) })), [kind, books, notes, keyword]);
  const searchKey = `${kind}:${keyword}:${profile}:${collection}`;
  useEffect(() => {
    let alive = true;
    if (!['quran', 'sunnah'].includes(kind) || !keyword) return;
    const timer = setTimeout(() => {
      setResults([]); setError(false); setBusy(true);
      void (async () => {
        const found: { target: string; label: string }[] = [];
        if (kind === 'quran') {
          const api = window.electronAPI?.quran;
          const catalog = await api?.readerCatalog();
          if (!catalog?.ok) throw new Error('unavailable');
          const source = catalog.data.sources.find(source => source.kind === 'script' && source.profile === profile);
          if (!source) throw new Error('unavailable');
          const citation = /^(\d{1,3})\s*:\s*(\d{1,3})$/u.exec(keyword.replace(/[٠-٩]/gu, n => String(n.charCodeAt(0) - 0x660)));
          if (citation) {
            const passage = await api.read({ script: source.id, surah: +citation[1], from: +citation[2] });
            if (!passage.ok) throw new Error('unavailable');
            for (const ayah of passage.data.ayahs.filter(ayah => ayah.number === +citation[2])) found.push({ target: `quran:${profile}:${+citation[1]}:${ayah.number}`, label: `${citation[1]}:${ayah.number} · ${ayah.words.filter(word => !word.marker).map(word => word.text).join(' ')}` });
          } else {
            const response = await api.searchAyahs({ script: source.id, text: keyword });
            if (!response.ok) throw new Error('unavailable');
            for (const hit of response.data) found.push({ target: `quran:${profile}:${hit.surah}:${hit.ayah}`, label: `${hit.surah}:${hit.ayah} · ${hit.text}` });
          }
        } else {
          // Search the installed corpus, yielding between chapter IPC reads; stale searches stop.
          const api = window.electronAPI?.sunnah;
          const catalog = await api?.catalog();
          if (!catalog?.ok || !catalog.data) throw new Error('unavailable');
          const chapters = catalog.data.collections.find(item => item.id === collection)?.chapters || [];
          for (const chapter of chapters) {
            if (!alive) return;
            const response = await api.chapter(collection, chapter.number);
            if (!response.ok) throw new Error('unavailable');
            for (const hadith of response.data.hadiths) {
              if (matchesStudyQuery(`${hadith.number} ${hadith.text.ar.full} ${hadith.text.en.full}`, keyword)) found.push({ target: `sunnah:${collection}:${chapter.number}:${hadith.id}`, label: `${t(collectionKeys[collection])} · ${hadith.number} · ${hadith.text.ar.matn.slice(0, 75)}` });
              if (found.length >= 12) break;
            }
            if (found.length >= 12) break;
          }
        }
        if (alive) setResults(found);
      })().catch(() => { if (alive) setError(true); }).finally(() => { if (alive) { setBusy(false); setLoadedKey(searchKey); } });
    }, 300);
    return () => { alive = false; clearTimeout(timer); };
  }, [kind, keyword, profile, collection, t, searchKey]);
  const remote = ['quran', 'sunnah'].includes(kind);
  const searching = remote && !!keyword && (busy || loadedKey !== searchKey);
  const shown = remote ? (loadedKey === searchKey ? results : []) : local.slice(0, 12);
  return <div className="rounded-xl border border-subtle bg-canvas p-3 space-y-2" data-study-link-picker>
    <label className="block text-xs space-y-1"><span>{t('studyLinkSearch')}</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder={t('studyLinkSearchPlaceholder')} className="w-full rounded-lg border border-subtle bg-surface px-3 py-2 text-sm" /></label>
    <div className="flex flex-wrap gap-2 text-xs">
      {(['notes', 'books', 'quran', 'sunnah'] as const).map(value => <button type="button" key={value} onClick={() => setQuery(`/${value} `)} className="rounded border border-subtle px-2 py-1" dir="ltr">/{value}</button>)}
      {kind === 'quran' && <select aria-label={t('quranReadingProfile')} value={profile} onChange={event => setProfile(event.target.value as typeof profile)}><option value="hafs">{t('quranProfileHafs')}</option><option value="warsh">{t('quranProfileWarsh')}</option></select>}
      {kind === 'sunnah' && <select aria-label={t('sunnahCollection')} value={collection} onChange={event => setCollection(event.target.value as typeof collection)}>{SUNNAH_COLLECTION_IDS.map(value => <option key={value} value={value}>{t(collectionKeys[value])}</option>)}</select>}
      <label className="flex items-center gap-1"><input type="checkbox" checked={embed} onChange={event => setEmbed(event.target.checked)} disabled={kind !== 'notes'} />{t('studyEmbedNote')}</label>
    </div>
    <div className="max-h-44 overflow-y-auto space-y-1">
      {searching ? <p role="status">{t('quranLoading')}</p> : remote && loadedKey === searchKey && error ? <p role="alert">{t('studySourceUnavailable')}</p> : shown.length ? shown.map(item => <button type="button" key={item.target} dir="auto" className="block w-full text-start rounded-lg p-2 hover:bg-surface text-xs leading-relaxed" onClick={() => onInsert(studyLinkText(item.target, item.label, embed && kind === 'notes'))}>{item.label}</button>) : <p className="text-xs text-muted">{t('studyNoResults')}</p>}
    </div>
  </div>;
}
