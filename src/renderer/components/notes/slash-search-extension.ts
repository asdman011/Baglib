import { Annotation, Prec, StateEffect, StateField, type Extension } from '@codemirror/state';
import { EditorView, ViewPlugin, keymap, showTooltip, type Tooltip, type ViewUpdate } from '@codemirror/view';
import { closeCompletion } from '@codemirror/autocomplete';
import { SLASH_SCOPES, moveSelection, parseSlashCommand, suggestScopes, type SlashScope } from '../../../shared/slash-command';
import { matchSlashCommands } from '../../../shared/note-slash-commands';
import { searchSlashDatasets, slashResultInsert, slashResultLink, type SlashResult, type SlashSearchInput } from '../../utils/slash-search';
import { cancelMaterialOcr, getMaterialOcrState, prepareSlashMaterial, runMaterialOcr, searchSlashMaterial, type SlashMaterial } from '../../utils/slash-material';

export const slashInsertion = Annotation.define<boolean>();
type MenuItem = { scope: SlashScope; result?: SlashResult; action?: 'more' | 'link' | 'inside' | 'ocr' | 'ocr-cancel' | 'transcribe'; offset?: number; after?: number };
interface Menu { from: number; to: number; items: MenuItem[]; selected: number; busy: boolean; material?: SlashResult; noText?: boolean }
export interface SlashSearchLabels {
  scopes: Record<SlashScope, string>;
  loading: string;
  empty: string;
  label: string;
  more?: string;
  insertLink?: string;
  searchInside?: string;
  noText?: string;
  typeQuery?: string;
  runOcr?: string;
  ocrProgress?: string;
  ocrCancel?: string;
  ocrCancelled?: string;
  ocrSuccess?: string;
  ocrFailed?: string;
  autoTranscribe?: string;
  autoTranscribeSoon?: string;
  autoTranscribeTitle?: string;
  close?: string;
}
interface Config extends Omit<SlashSearchInput, 'scope' | 'query' | 'stale'> { labels: SlashSearchLabels; dir: 'rtl' | 'ltr' }

function showAutoTranscribeDialog(labels: SlashSearchLabels, dir: 'rtl' | 'ltr', onDismiss?: () => void) {
  const existing = document.querySelector('[data-auto-transcribe-dialog]');
  if (existing) existing.remove();

  const backdrop = document.createElement('div');
  backdrop.dataset.autoTranscribeDialog = '';
  backdrop.setAttribute('role', 'presentation');
  backdrop.className = 'cm-dialog-backdrop';
  backdrop.dir = dir;

  const dialog = document.createElement('div');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.className = 'cm-auto-transcribe-modal';

  const title = document.createElement('h3');
  title.className = 'cm-dialog-title';
  title.textContent = labels.autoTranscribeTitle || 'Auto-transcription';

  const body = document.createElement('p');
  body.className = 'cm-dialog-body';
  body.textContent = labels.autoTranscribeSoon || 'Auto-transcription is coming soon.';

  const actions = document.createElement('div');
  actions.className = 'cm-dialog-actions';

  const okBtn = document.createElement('button');
  okBtn.type = 'button';
  okBtn.className = 'cm-dialog-button';
  okBtn.textContent = labels.close || 'OK';

  const close = () => {
    window.removeEventListener('keydown', onKey);
    backdrop.remove();
    onDismiss?.();
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' || e.key === 'Enter') {
      e.preventDefault();
      close();
    }
  };

  okBtn.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  window.addEventListener('keydown', onKey);

  actions.append(okBtn);
  dialog.append(title, body, actions);
  backdrop.append(dialog);
  document.body.append(backdrop);
  okBtn.focus();
}

export function slashSearchExtension(config: () => Config): Extension {
  const change = StateEffect.define<Menu | null>();
  const menu = StateField.define<Menu | null>({
    create: () => null,
    update(value, tr) {
      if (tr.docChanged || tr.selection) value = null;
      for (const effect of tr.effects) if (effect.is(change)) value = effect.value;
      return value;
    },
  });
  const createTooltip = (view: EditorView) => {
    const dom = document.createElement('div'); dom.className = 'cm-slash-search'; dom.dataset.slashSearch = '';
    const render = () => {
      const current = view.state.field(menu); if (!current) return;
      const { labels, dir } = config(); dom.dir = dir;
      dom.setAttribute('role', 'listbox'); dom.setAttribute('aria-label', labels.label); dom.setAttribute('aria-busy', String(current.busy)); dom.replaceChildren();
      if (current.material) {
        const title = document.createElement('bdi'); title.className = 'cm-slash-heading'; title.textContent = current.material.label; dom.append(title);
      }
      if (current.noText && current.material?.material) {
        const status = document.createElement('div');
        status.setAttribute('role', 'status');
        status.className = 'cm-slash-heading cm-slash-no-text';
        const ocrState = getMaterialOcrState(current.material.material.id);
        if (ocrState?.status === 'running') {
          status.textContent = labels.ocrProgress ? labels.ocrProgress.replace('{percent}', String(ocrState.percentage)) : `Running OCR… ${ocrState.percentage}%`;
        } else if (ocrState?.status === 'cancelled') {
          status.textContent = labels.ocrCancelled || 'OCR was cancelled.';
        } else if (ocrState?.status === 'failed') {
          status.textContent = labels.ocrFailed || 'OCR failed.';
        } else {
          status.textContent = labels.noText || '';
        }
        dom.append(status);
      }
      let group: SlashScope | undefined;
      current.items.forEach((item, index) => {
        if (item.result && group !== item.scope && !item.action) {
          const heading = document.createElement('div'); heading.className = 'cm-slash-heading'; heading.textContent = labels.scopes[item.scope]; dom.append(heading); group = item.scope;
        }
        const option = document.createElement('div'); option.id = `slash-option-${index}`;
        option.setAttribute('role', 'option'); option.setAttribute('aria-selected', String(index === current.selected));
        option.dataset.slashScope = item.scope; if (item.action) option.dataset.slashAction = item.action;
        option.className = 'cm-slash-option';
        const label = document.createElement('bdi');
        label.textContent = item.action === 'more' ? labels.more || ''
          : item.action === 'link' ? labels.insertLink || ''
          : item.action === 'inside' ? labels.searchInside || ''
          : item.action === 'ocr' ? labels.runOcr || 'Run OCR'
          : item.action === 'ocr-cancel' ? labels.ocrCancel || 'Cancel OCR'
          : item.action === 'transcribe' ? labels.autoTranscribe || 'Auto-transcribe'
          : item.result?.label || labels.scopes[item.scope];
        option.append(label);
        if (item.result?.snippet && !item.action) { const snippet = document.createElement('div'); snippet.className = 'cm-slash-snippet'; snippet.dir = 'auto'; snippet.textContent = item.result.snippet; option.append(snippet); }
        option.addEventListener('mouseenter', () => { const latest = view.state.field(menu); if (latest && latest.selected !== index) view.dispatch({ effects: change.of({ ...latest, selected: index }) }); });
        option.addEventListener('mousedown', event => event.preventDefault()); option.addEventListener('click', () => choose(view, index)); dom.append(option);
      });
      if (current.busy || (!current.items.length && !current.noText)) {
        const status = document.createElement('div'); status.setAttribute('role', 'status'); status.className = 'cm-slash-heading';
        status.textContent = current.busy ? labels.loading : current.material && !view.plugin(plugin)?.query ? labels.typeQuery || '' : labels.empty; dom.append(status);
      }
      const selected = dom.querySelector('[aria-selected="true"]'); selected?.scrollIntoView({ block: 'nearest' });
      view.contentDOM.setAttribute('aria-controls', 'slash-search-results'); dom.id = 'slash-search-results';
      if (selected) view.contentDOM.setAttribute('aria-activedescendant', selected.id); else view.contentDOM.removeAttribute('aria-activedescendant');
    };
    render(); return { dom, update: render, destroy: () => { view.contentDOM.removeAttribute('aria-controls'); view.contentDOM.removeAttribute('aria-activedescendant'); } };
  };
  const tooltip = StateField.define<Tooltip | null>({ create: () => null, update(_value, tr) { const current = tr.state.field(menu); return current ? { pos: current.to, above: false, strictSide: false, create: createTooltip } : null; }, provide: field => showTooltip.from(field) });
  const choose = (view: EditorView, index: number) => {
    const current = view.state.field(menu), item = current?.items[index]; if (!current || !item || current.busy) return false;
    const active = view.plugin(plugin)!;
    if (item.action === 'more') { void active.more(current, item); return true; }
    if (item.action === 'inside' && item.result) {
      active.material = { result: item.result, ready: prepareSlashMaterial(item.result).catch(() => ({ result: item.result!, indexed: false, pages: [], cues: [], available: false })) };
      view.dispatch({ changes: { from: current.from, to: current.to, insert: '/' }, selection: { anchor: current.from + 1 } }); view.focus(); return true;
    }
    if (item.action === 'ocr' && item.result?.material) {
      const book = item.result.material;
      void runMaterialOcr(book, (state) => {
        const latest = view.state.field(menu);
        if (latest && latest.material?.material?.id === book.id) {
          if (state.status === 'running') {
            view.dispatch({
              effects: change.of({
                ...latest,
                busy: false,
                items: [{ scope: 'books', action: 'ocr-cancel', result: item.result }],
              }),
            });
          } else if (state.status === 'completed') {
            if (active.material?.result?.material?.id === book.id) {
              active.material = { result: item.result!, ready: prepareSlashMaterial(item.result!) };
              active.refresh();
            }
          } else if (state.status === 'cancelled' || state.status === 'failed') {
            view.dispatch({
              effects: change.of({
                ...latest,
                busy: false,
                items: [{ scope: 'books', action: 'ocr', result: item.result }],
              }),
            });
          }
        }
      });
      view.dispatch({
        effects: change.of({
          ...current,
          busy: false,
          items: [{ scope: 'books', action: 'ocr-cancel', result: item.result }],
          selected: 0,
        }),
      });
      return true;
    }
    if (item.action === 'ocr-cancel' && item.result?.material) {
      const book = item.result.material;
      void cancelMaterialOcr(book.id);
      view.dispatch({
        effects: change.of({
          ...current,
          busy: false,
          items: [{ scope: 'books', action: 'ocr', result: item.result }],
          selected: 0,
        }),
      });
      return true;
    }
    if (item.action === 'transcribe') {
      const { labels, dir } = config();
      showAutoTranscribeDialog(labels, dir, () => {
        view.focus();
      });
      view.dispatch({ effects: change.of(null) });
      return true;
    }
    if (item.result?.material && !item.action) {
      view.dispatch({ effects: change.of({ ...current, material: item.result, selected: 0, items: [{ ...item, action: 'link' }, { ...item, action: 'inside' }] }) }); return true;
    }
    const result = item.result;
    const value = result ? item.action === 'link' ? slashResultLink(result) : slashResultInsert(result) : `/${item.scope} `;
    const insert = result?.quote ? `${current.from > view.state.doc.lineAt(current.from).from ? '\n' : ''}${value}\n` : value;
    active.material = undefined;
    view.dispatch({ changes: { from: current.from, to: current.to, insert }, selection: { anchor: current.from + insert.length }, userEvent: 'input.complete', annotations: slashInsertion.of(true) }); view.focus(); return true;
  };
  const plugin = ViewPlugin.fromClass(class {
    timer?: ReturnType<typeof setTimeout>; revision = 0; requestId?: string; query = '';
    material?: { result: SlashResult; ready: Promise<SlashMaterial> };
    constructor(readonly view: EditorView) { this.refresh(); }
    update(update: ViewUpdate) { if (update.docChanged || update.selectionSet || update.focusChanged) this.refresh(); }
    cancel() {
      clearTimeout(this.timer); ++this.revision;
      if (this.requestId) void window.electronAPI?.cancelSlashSearch?.(this.requestId).catch(() => {});
      this.requestId = undefined;
    }
    refresh() { this.cancel(); const revision = this.revision; this.timer = setTimeout(() => { void this.search(revision); }, 0); }
    items(results: SlashResult[], limit: number, offset = 0): MenuItem[] {
      return SLASH_SCOPES.flatMap(scope => {
        const rows = results.filter(result => result.scope === scope);
        return [...rows.map(result => ({ scope, result })), ...(rows.length === limit ? [{ scope, action: 'more' as const, offset: offset + rows.length, after: rows.at(-1)?.cursor }] : [])];
      });
    }
    async search(revision: number) {
      const { view } = this; if (revision !== this.revision) return;
      const selection = view.state.selection.main, line = view.state.doc.lineAt(selection.head);
      const before = line.text.slice(0, selection.head - line.from);
      const open = selection.empty && view.hasFocus ? parseSlashCommand(before) : null;
      const legacy = !this.material && open && !open.scope && open.query && !suggestScopes(open.partialScope || open.query).length && matchSlashCommands(open.query).length;
      if (!open || legacy || open.query.length > 200) { this.material = undefined; view.dispatch({ effects: change.of(null) }); return; }
      closeCompletion(view); this.query = open.query;
      const scopeItems: MenuItem[] = !this.material && !open.scope ? suggestScopes(open.partialScope || (open.query ? '\0' : '')).map(scope => ({ scope })) : [];
      const initial: Menu = { from: line.from + open.start, to: selection.head, items: scopeItems, selected: 0, busy: !!open.query || !!open.scope || !!this.material, material: this.material?.result };
      view.dispatch({ effects: change.of(initial) }); if (!initial.busy) return;
      await new Promise<void>(resolve => { setTimeout(resolve, 280); });
      if (revision !== this.revision) return;
      const stale = () => revision !== this.revision;
      this.requestId = crypto.randomUUID();
      const limit = open.scope || this.material ? 20 : 8;
      const selected = this.material ? await this.material.ready : undefined;
      if (stale()) return;
      const results = selected ? await searchSlashMaterial(selected, open.query, limit, 0, stale) : await searchSlashDatasets({ ...config(), scope: open.scope, query: open.query, limit, requestId: this.requestId, stale });
      if (stale()) return;
      let materialActionItems: MenuItem[] = [];
      if (selected && !selected.available && selected.result.material) {
        if (selected.result.scope === 'books') {
          const ocr = getMaterialOcrState(selected.result.material.id);
          materialActionItems = [{ scope: 'books', action: ocr?.status === 'running' ? 'ocr-cancel' : 'ocr', result: selected.result }];
        } else if (selected.result.scope === 'lectures') {
          materialActionItems = [{ scope: 'lectures', action: 'transcribe', result: selected.result }];
        }
      }
      view.dispatch({ effects: change.of({ ...initial, items: [...scopeItems, ...materialActionItems, ...this.items(results, limit)], busy: false, noText: selected && !selected.available }) });
    }
    async more(current: Menu, item: MenuItem) {
      const revision = this.revision, stale = () => revision !== this.revision;
      this.requestId = crypto.randomUUID();
      this.view.dispatch({ effects: change.of({ ...current, busy: true }) });
      const limit = this.material || parseSlashCommand(this.view.state.doc.lineAt(current.to).text.slice(0, current.to - this.view.state.doc.lineAt(current.to).from))?.scope ? 20 : 8;
      const selected = this.material ? await this.material.ready : undefined;
      const rows = selected ? await searchSlashMaterial(selected, this.query, limit, item.offset || 0, stale) : await searchSlashDatasets({ ...config(), scope: item.scope, query: this.query, offset: item.offset, after: item.after, limit, requestId: this.requestId, stale });
      if (stale()) return;
      const items = current.items.flatMap(entry => entry === item ? this.items(rows, limit, item.offset) : [entry]);
      this.view.dispatch({ effects: change.of({ ...current, items, selected: Math.min(current.selected, items.length - 1), busy: false }) });
    }
    destroy() { this.cancel(); }
  });
  const navigate = (view: EditorView, delta: number) => { const current = view.state.field(menu); if (!current) return false; view.dispatch({ effects: change.of({ ...current, selected: moveSelection(current.selected, delta, current.items.length) }) }); return true; };
  return [menu, tooltip, plugin, Prec.highest(keymap.of([
    { key: 'ArrowDown', run: view => navigate(view, 1) }, { key: 'ArrowUp', run: view => navigate(view, -1) },
    { key: 'Enter', run: view => view.state.field(menu) ? (choose(view, view.state.field(menu)!.selected), true) : false },
    { key: 'Escape', run: view => { if (!view.state.field(menu)) return false; const active = view.plugin(plugin); active?.cancel(); if (active) active.material = undefined; view.dispatch({ effects: change.of(null) }); return true; } },
  ])), EditorView.theme({
    '.cm-tooltip.cm-slash-search': { background: 'var(--bg-surface)', color: 'var(--text-main)', border: '1px solid rgb(128 128 128 / .35)', borderRadius: '.6rem', boxShadow: '0 4px 16px rgb(0 0 0 / .2)', padding: '.25rem', width: 'min(26rem, calc(100vw - 2rem))', maxHeight: '24rem', overflowY: 'auto', textAlign: 'start', lineHeight: '1.9', fontFamily: 'inherit' },
    '.cm-slash-option': { padding: '.3rem .6rem', borderRadius: '.35rem', cursor: 'pointer', overflowWrap: 'anywhere' },
    '.cm-slash-option[aria-selected="true"]': { background: 'rgb(16 185 129 / .18)' },
    '.cm-slash-heading': { display: 'block', fontSize: '.75rem', opacity: '.75', padding: '.3rem .6rem', fontWeight: '600' },
    '.cm-slash-snippet': { fontSize: '.75rem', opacity: '.75', maxHeight: '3.8em', overflow: 'hidden' },
    '.cm-dialog-backdrop': { position: 'fixed', inset: '0', zIndex: '9999', background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' },
    '.cm-auto-transcribe-modal': { background: 'var(--bg-surface, #ffffff)', color: 'var(--text-main, #111827)', border: '1px solid rgb(128 128 128 / .35)', borderRadius: '.75rem', boxShadow: '0 8px 30px rgba(0,0,0,0.25)', padding: '1.25rem', width: 'min(24rem, calc(100vw - 2rem))', textAlign: 'start', fontFamily: 'inherit' },
    '.cm-dialog-title': { margin: '0 0 .5rem', fontSize: '1rem', fontWeight: '700' },
    '.cm-dialog-body': { margin: '0 0 1rem', fontSize: '.875rem', lineHeight: '1.6', opacity: '.9' },
    '.cm-dialog-actions': { display: 'flex', justifyContent: 'flex-end', gap: '.5rem' },
    '.cm-dialog-button': { padding: '.35rem 1rem', borderRadius: '.375rem', border: '1px solid rgb(128 128 128 / .35)', background: 'var(--color-primary, #059669)', color: '#ffffff', cursor: 'pointer', fontWeight: '600', fontSize: '.875rem' },
  })];
}
