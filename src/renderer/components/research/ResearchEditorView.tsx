'use client';
import { createResearchSourceSearch } from './source-search';
import { researchSettings } from '../../../shared/research-editor-apparatus';
import { navigateStudyReference } from '../../utils/study-navigation';
import { translations } from '../../translations';
import { collectionKeys } from '../../utils/sunnah-collections';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { ManuscriptList } from './ManuscriptList';
import { createResearchEditorHost, shouldForwardEditorShortcut } from './editor-host';
import { registerEditorLeave } from './editor-leave';
import { registerCloseGuard } from '../../utils/close-guard';
import type { ResearchEditorBridge } from '../../../shared/research-editor';
import './research-editor.css';

declare global { interface Window { __baglibResearchEditorBridge?: ResearchEditorBridge } }

export function ResearchEditorView() {
  const { lang, dir, theme, t, books, openBookForReading } = useWorkspace();
  const current = useRef({ books, lang, openBookForReading });
  useLayoutEffect(() => { current.current = { books, lang, openBookForReading }; }, [books, lang, openBookForReading]);
  const [error, setError] = useState(false);
  const [opened, setOpened] = useState(false);
  const [ready, setReady] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const [host] = useState(() => createResearchEditorHost(window.electronAPI.manuscripts, window.electronAPI.researchEditor.blobs, { lang, dir, theme, fontScale: 1 }, () => setError(true)));
  const listApi = useMemo(() => ({
    ...window.electronAPI.manuscripts,
    renameDocument: host.renameDocument,
    async trashDocument(id: string) {
      // A parent can hide the open chapter, so flush before any chapter-tree deletion.
      await host.close();
      setOpened(false);
      await window.electronAPI.manuscripts.trashDocument(id);
    },
    async trash(id: string) {
      if (host.activeDocument()?.manuscript_id === id) {
        await host.close();
        setOpened(false);
      }
      await window.electronAPI.manuscripts.trash(id);
    },
  }), [host]);
  useLayoutEffect(() => {
    const root = document.documentElement;
    const update = () => host.appearance({ lang, dir, theme, fontScale: Number.parseFloat(getComputedStyle(root).fontSize) / 16 || 1 });
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ['style', 'class'] });
    return () => observer.disconnect();
  }, [host, lang, dir, theme]);
  useLayoutEffect(() => {
    window.__baglibResearchEditorBridge = {
      ...host.bridge,
      settings: {
        async load(id) {
          const manuscript = (await window.electronAPI.manuscripts.list()).find(m => m.id === id);
          if (!manuscript) throw new Error('invalid-request');
          return researchSettings(JSON.parse(manuscript.settings_json));
        },
        save: (id, settings) => window.electronAPI.manuscripts.updateSettings(id, settings),
      },
      sources: createResearchSourceSearch(window.electronAPI, () => current.current.books, async url => {
        await host.bridge.explicitSave();
        await navigateStudyReference(url, current.current.books, book => current.current.openBookForReading(book), () => {});
      }, id => {
        const key = collectionKeys[id as keyof typeof collectionKeys];
        return key ? translations[current.current.lang][key] : id;
      }),
      async connect(session) { await host.bridge.connect(session); setReady(true); },
    };
    const leave = async () => {
      try { await host.close(); return true; } catch { setError(true); return false; }
    };
    const removeLeave = registerEditorLeave(leave);
    const removeClose = registerCloseGuard(async () => { window.electronAPI.appClose.hold(); return leave(); });
    return () => {
      removeLeave(); removeClose();
      delete window.__baglibResearchEditorBridge;
      // Normal navigation and native close have already awaited close through their guards.
      void host.close().then(() => host.dispose()).catch(() => setError(true));
    };
  }, [host]);
  useEffect(() => {
    const child = frame.current?.contentWindow;
    if (!ready || !child) return;
    const forward = (event: KeyboardEvent) => {
      if (!shouldForwardEditorShortcut(event)) return;
      const copy = new KeyboardEvent('keydown', { key: event.key, code: event.code, ctrlKey: event.ctrlKey, metaKey: event.metaKey, altKey: event.altKey, shiftKey: event.shiftKey, bubbles: true, cancelable: true });
      window.dispatchEvent(copy);
      if (copy.defaultPrevented) event.preventDefault();
    };
    child.addEventListener('keydown', forward);
    return () => child.removeEventListener('keydown', forward);
  }, [ready]);
  return <section className="research-editor-view" dir={dir} aria-label={t('navEditor')}>
    <aside className="research-editor-manuscripts"><ManuscriptList language={lang} api={listApi} onOpenDocument={async value => { setError(false); await host.open(value); setOpened(true); }} /></aside>
    <div className="research-editor-document">
      {error && <p role="alert">{t('manuscriptError')}</p>}
      {!ready && <p role="status">{t('manuscriptLoading')}</p>}
      {ready && !opened && <p>{t('editorSelectChapter')}</p>}
      <iframe ref={frame} title={t('navEditor')} src="/research-editor/index.html" className={ready && opened ? 'research-editor-frame ready' : 'research-editor-frame'} />
    </div>
  </section>;
}
