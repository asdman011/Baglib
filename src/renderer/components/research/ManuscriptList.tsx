"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Manuscript, ManuscriptDocument, ManuscriptKind, ManuscriptsAPI } from '../../../shared/manuscripts';
import { translations } from '../../translations';
import './manuscripts.css';

interface Props {
  language: 'ar' | 'en';
  api: ManuscriptsAPI;
  onOpenDocument?: (document: ManuscriptDocument) => void | Promise<void>;
}
export function ManuscriptList({ language, api, onOpenDocument }: Props) {
  const t = translations[language];
  const [manuscripts, setManuscripts] = useState<Manuscript[]>([]);
  const [documents, setDocuments] = useState<ManuscriptDocument[]>([]);
  const [deleted, setDeleted] = useState<ManuscriptDocument[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loadedSelection, setLoadedSelection] = useState<string | null>(null);
  const [trashed, setTrashed] = useState(false);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<ManuscriptKind>('research');
  const [chapterTitle, setChapterTitle] = useState('');
  const [parent, setParent] = useState('');
  const [edit, setEdit] = useState<{ id: string; document: boolean; title: string } | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const generation = useRef({ value: 0 });
  const reload = useCallback(async () => {
    const request = ++generation.current.value;
    const list = await api.list(trashed);
    const available = selected && list.some(item => item.id === selected) && !trashed;
    const [active, trash] = available ? await Promise.all([api.documents(selected!), api.documents(selected!, true)]) : [[], []];
    if (request !== generation.current.value) return;
    setManuscripts(list); setDocuments(active); setDeleted(trash); setLoading(false);
    setLoadedSelection(selected);
    setParent(current => active.some(doc => doc.id === current) ? current : '');
  }, [api, selected, trashed]);
  useEffect(() => {
    void reload().catch(() => { setError(true); setLoading(false); });
    const requests = generation.current;
    return () => { requests.value++; };
  }, [reload]);
  const run = async (operation: () => Promise<unknown>) => {
    setBusy(true); setError(false);
    try { await operation(); await reload(); }
    catch { setError(true); }
    finally { setBusy(false); }
  };
  const selectedManuscript = manuscripts.find(item => item.id === selected);
  const editable = Boolean(selectedManuscript && !trashed && loadedSelection === selected);
  const siblings = (parentId: string | null) => documents.filter(doc => doc.parent_id === parentId).sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  const parentOptions = (id: string) => documents.filter(candidate => {
    let current: ManuscriptDocument | undefined = candidate;
    while (current) {
      if (current.id === id) return false;
      current = documents.find(doc => doc.id === current?.parent_id);
    }
    return true;
  });
  const renderTree = (parentId: string | null, level = 1) => {
    const rows = siblings(parentId);
    return <ul className={level === 1 ? 'manuscript-root-tree' : 'manuscript-children'} aria-label={level === 1 ? t.manuscriptChapters : undefined}>
      {rows.map((doc, index) => <li key={doc.id} data-level={level} data-document-id={doc.id}>
        <div className="manuscript-row">
          <button type="button" className="manuscript-name" disabled={!onOpenDocument} title={t.manuscriptOpen} onClick={() => void run(async () => { await onOpenDocument?.(doc); })}>{doc.title}</button>
          <button type="button" aria-label={t.manuscriptRename} onClick={() => setEdit({ id: doc.id, document: true, title: doc.title })}>{t.manuscriptRename}</button>
          <button type="button" aria-label={t.manuscriptUp} disabled={index === 0} onClick={() => void run(() => api.moveDocument(doc.id, parentId, rows[index - 1].position))}>↑</button>
          <button type="button" aria-label={t.manuscriptDown} disabled={index === rows.length - 1} onClick={() => void run(() => api.moveDocument(doc.id, parentId, rows[index + 1].position))}>↓</button>
          <select aria-label={t.manuscriptParent} value={doc.parent_id ?? ''} onChange={event => void run(() => api.moveDocument(doc.id, event.target.value || null, Number.MAX_SAFE_INTEGER))}>
            <option value="">{t.manuscriptRoot}</option>
            {parentOptions(doc.id).map(option => <option key={option.id} value={option.id}>{option.title}</option>)}
          </select>
          <button type="button" aria-label={t.manuscriptTrash} onClick={() => void run(() => api.trashDocument(doc.id))}>{t.manuscriptTrash}</button>
        </div>
        {documents.some(child => child.parent_id === doc.id) && renderTree(doc.id, level + 1)}
      </li>)}
    </ul>;
  };
  return <section className="manuscript-list" dir={language === 'ar' ? 'rtl' : 'ltr'} lang={language} aria-label={t.manuscriptsTitle}>
    <h2>{t.manuscriptsTitle}</h2>
    {error && <p role="alert">{t.manuscriptError}</p>}
    {loading && <p role="status">{t.manuscriptLoading}</p>}
    <fieldset disabled={busy}>
      <form className="manuscript-row" onSubmit={event => { event.preventDefault(); void run(async () => { const item = await api.create(title, kind); setTitle(''); setTrashed(false); setSelected(item.id); }); }}>
        <input required value={title} onChange={event => setTitle(event.target.value)} aria-label={t.manuscriptNew} placeholder={t.manuscriptNew} maxLength={1000} />
        <select aria-label={t.manuscriptKind} value={kind} onChange={event => setKind(event.target.value as ManuscriptKind)}><option value="research">{t.manuscriptResearch}</option><option value="book">{t.manuscriptBook}</option></select>
        <button type="submit" disabled={!title.trim()}>{t.manuscriptCreate}</button>
      </form>
      <button type="button" data-manuscripts-trash-toggle onClick={() => { setTrashed(!trashed); setSelected(null); setParent(''); }}>{trashed ? t.manuscriptShowActive : t.manuscriptShowTrash}</button>
      {!loading && manuscripts.length === 0 && <p>{t.manuscriptEmpty}</p>}
      <ul className="manuscript-projects">{manuscripts.map(item => <li className="manuscript-row" key={item.id} data-manuscript-id={item.id}>
        <button type="button" className="manuscript-name" aria-pressed={selected === item.id} onClick={() => { setSelected(item.id); setParent(''); }}>{item.title}</button>
        {trashed ? <button type="button" onClick={() => void run(() => api.restore(item.id))}>{t.manuscriptRestore}</button> : <>
          <button type="button" onClick={() => setEdit({ id: item.id, document: false, title: item.title })}>{t.manuscriptRename}</button>
          <button type="button" onClick={() => void run(() => api.trash(item.id))}>{t.manuscriptTrash}</button>
        </>}
      </li>)}</ul>
      {edit && <form className="manuscript-row" onSubmit={event => { event.preventDefault(); void run(async () => { await (edit.document ? api.renameDocument(edit.id, edit.title) : api.rename(edit.id, edit.title)); setEdit(null); }); }}>
        <input required aria-label={t.manuscriptName} value={edit.title} maxLength={1000} onChange={event => setEdit({ ...edit, title: event.target.value })} />
        <button type="submit" disabled={!edit.title.trim()}>{t.manuscriptSaveName}</button><button type="button" onClick={() => setEdit(null)}>{t.manuscriptCancel}</button>
      </form>}
      {editable && <div data-manuscript-tree>
        <h3>{selectedManuscript?.title}</h3>
        <form className="manuscript-row" onSubmit={event => { event.preventDefault(); void run(async () => { await api.createDocument(selected!, chapterTitle, parent || null); setChapterTitle(''); }); }}>
          <input required aria-label={t.manuscriptChapterNew} placeholder={t.manuscriptChapterNew} value={chapterTitle} maxLength={1000} onChange={event => setChapterTitle(event.target.value)} />
          <select aria-label={t.manuscriptParent} value={parent} onChange={event => setParent(event.target.value)}><option value="">{t.manuscriptRoot}</option>{documents.map(doc => <option key={doc.id} value={doc.id}>{doc.title}</option>)}</select>
          <button type="submit" disabled={!chapterTitle.trim()}>{t.manuscriptChapterCreate}</button>
        </form>
        {renderTree(null)}
        {deleted.length > 0 && <><h4>{t.manuscriptDeletedChapters}</h4><ul>{deleted.map(doc => <li key={doc.id} className="manuscript-row" data-deleted-document-id={doc.id}><span>{doc.title}</span><button type="button" disabled={Boolean(doc.parent_id && !documents.some(parentDoc => parentDoc.id === doc.parent_id))} onClick={() => void run(() => api.restoreDocument(doc.id))}>{t.manuscriptRestore}</button></li>)}</ul></>}
      </div>}
    </fieldset>
  </section>;
}
