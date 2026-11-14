import { Prec, StateEffect, StateField, type Extension } from '@codemirror/state';
import { EditorView, ViewPlugin, keymap, showTooltip, type Tooltip, type ViewUpdate } from '@codemirror/view';
import { closeCompletion } from '@codemirror/autocomplete';
import { moveSelection, parseSlashCommand, suggestScopes, type SlashScope } from '../../../shared/slash-command';
import { matchSlashCommands } from '../../../shared/note-slash-commands';
import { searchSlashDatasets, slashResultLink, type SlashResult, type SlashSearchInput } from '../../utils/slash-search';

type MenuItem = { scope: SlashScope; result?: SlashResult };
interface Menu { from: number; to: number; items: MenuItem[]; selected: number; busy: boolean }
export interface SlashSearchLabels { scopes: Record<SlashScope, string>; loading: string; empty: string; label: string }
interface Config extends Omit<SlashSearchInput, 'scope' | 'query' | 'stale'> { labels: SlashSearchLabels; dir: 'rtl' | 'ltr' }
/** Separate from formatting completion so asynchronous dataset results cannot reorder those commands. */
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
    const dom = document.createElement('div');
    dom.className = 'cm-slash-search';
    dom.dataset.slashSearch = '';
    const render = () => {
      const current = view.state.field(menu);
      if (!current) return;
      const { labels, dir } = config();
      dom.dir = dir;
      dom.setAttribute('role', 'listbox');
      dom.setAttribute('aria-label', labels.label);
      dom.setAttribute('aria-busy', String(current.busy));
      dom.replaceChildren();
      let group: SlashScope | undefined;
      current.items.forEach((item, index) => {
        if (item.result && group !== item.scope) {
          const heading = document.createElement('div');
          heading.className = 'cm-slash-heading';
          heading.textContent = labels.scopes[item.scope];
          dom.append(heading);
          group = item.scope;
        }
        const option = document.createElement('div');
        option.id = `slash-option-${index}`;
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', String(index === current.selected));
        option.dataset.slashScope = item.scope;
        option.className = 'cm-slash-option';
        const label = document.createElement('bdi');
        label.textContent = item.result?.label || labels.scopes[item.scope];
        option.append(label);
        if (item.result?.snippet) {
          const snippet = document.createElement('div');
          snippet.className = 'cm-slash-snippet';
          snippet.dir = 'auto';
          snippet.textContent = item.result.snippet;
          option.append(snippet);
        }
        option.addEventListener('mouseenter', () => { if (view.state.field(menu)?.selected !== index) view.dispatch({ effects: change.of({ ...current, selected: index }) }); });
        option.addEventListener('mousedown', event => event.preventDefault());
        option.addEventListener('click', () => choose(view, index));
        dom.append(option);
      });
      if (current.busy || !current.items.length) {
        const status = document.createElement('div');
        status.setAttribute('role', 'status');
        status.className = 'cm-slash-heading';
        status.textContent = current.busy ? labels.loading : labels.empty;
        dom.append(status);
      }
      const selected = dom.querySelector('[aria-selected="true"]');
      selected?.scrollIntoView({ block: 'nearest' });
      view.contentDOM.setAttribute('aria-controls', 'slash-search-results');
      dom.id = 'slash-search-results';
      if (selected) view.contentDOM.setAttribute('aria-activedescendant', selected.id);
      else view.contentDOM.removeAttribute('aria-activedescendant');
    };
    render();
    return { dom, update: render, destroy: () => {
      view.contentDOM.removeAttribute('aria-controls');
      view.contentDOM.removeAttribute('aria-activedescendant');
    } };
  };
  const tooltip = StateField.define<Tooltip | null>({
    create: () => null,
    update(_value, tr) {
      const current = tr.state.field(menu);
      return current ? { pos: current.to, above: false, strictSide: false, create: createTooltip } : null;
    },
    provide: field => showTooltip.from(field),
  });
  const choose = (view: EditorView, index: number) => {
    const current = view.state.field(menu);
    const item = current?.items[index];
    if (!current || !item) return false;
    const insert = item.result ? slashResultLink(item.result) : `/${item.scope} `;
    view.dispatch({ changes: { from: current.from, to: current.to, insert }, selection: { anchor: current.from + insert.length }, userEvent: 'input.complete' });
    view.focus();
    return true;
  };
  const plugin = ViewPlugin.fromClass(class {
    timer?: ReturnType<typeof setTimeout>;
    revision = 0;
    constructor(readonly view: EditorView) { this.refresh(); }
    update(update: ViewUpdate) { if (update.docChanged || update.selectionSet || update.focusChanged) this.refresh(); }
    refresh() {
      clearTimeout(this.timer);
      const revision = ++this.revision;
      // Defer dispatch out of CodeMirror's update cycle; the revision invalidates every stale IPC result.
      this.timer = setTimeout(() => { void this.search(revision); }, 0);
    }
    async search(revision: number) {
      const { view } = this;
      if (revision !== this.revision) return;
      const selection = view.state.selection.main;
      const line = view.state.doc.lineAt(selection.head);
      const before = line.text.slice(0, selection.head - line.from);
      const open = selection.empty && view.hasFocus ? parseSlashCommand(before) : null;
      // Keep legacy formatting/quote commands accessible when their prefix is typed.
      const legacy = open && !open.scope && open.query && !suggestScopes(open.partialScope || open.query).length && matchSlashCommands(open.query).length;
      if (!open || legacy || open.query.length > 200) { view.dispatch({ effects: change.of(null) }); return; }
      closeCompletion(view);
      const from = line.from + open.start, to = selection.head;
      const scopeItems = !open.scope ? suggestScopes(open.partialScope || (open.query ? '\0' : '')).map(scope => ({ scope })) : [];
      const initial: Menu = { from, to, items: scopeItems, selected: 0, busy: !!open.query || !!open.scope };
      view.dispatch({ effects: change.of(initial) });
      if (!initial.busy) return;
      await new Promise(resolve => { this.timer = setTimeout(resolve, 240); });
      if (revision !== this.revision) return;
      const results = await searchSlashDatasets({ ...config(), scope: open.scope, query: open.query, stale: () => revision !== this.revision });
      if (revision !== this.revision) return;
      const items: MenuItem[] = [...scopeItems, ...results.map(result => ({ scope: result.scope, result }))];
      view.dispatch({ effects: change.of({ ...initial, items, busy: false }) });
    }
    destroy() { clearTimeout(this.timer); ++this.revision; }
  });
  const navigate = (view: EditorView, delta: number) => {
    const current = view.state.field(menu);
    if (!current) return false;
    view.dispatch({ effects: change.of({ ...current, selected: moveSelection(current.selected, delta, current.items.length) }) });
    return true;
  };
  return [menu, tooltip, plugin, Prec.highest(keymap.of([
    { key: 'ArrowDown', run: view => navigate(view, 1) },
    { key: 'ArrowUp', run: view => navigate(view, -1) },
    { key: 'Enter', run: view => view.state.field(menu) ? (choose(view, view.state.field(menu)!.selected), true) : false },
    { key: 'Escape', run: view => {
      if (!view.state.field(menu)) return false;
      const active = view.plugin(plugin);
      if (active) { clearTimeout(active.timer); ++active.revision; }
      view.dispatch({ effects: change.of(null) });
      return true;
    } },
  ])), EditorView.theme({
    '.cm-tooltip.cm-slash-search': { background: 'var(--bg-surface)', color: 'var(--text-main)', border: '1px solid rgb(128 128 128 / .35)', borderRadius: '.6rem', boxShadow: '0 4px 16px rgb(0 0 0 / .2)', padding: '.25rem', width: 'min(26rem, calc(100vw - 2rem))', maxHeight: '18rem', overflowY: 'auto', textAlign: 'start', lineHeight: '1.9', fontFamily: 'inherit' },
    '.cm-slash-option': { padding: '.3rem .6rem', borderRadius: '.35rem', cursor: 'pointer', overflowWrap: 'anywhere' },
    '.cm-slash-option[aria-selected="true"]': { background: 'rgb(16 185 129 / .18)' },
    '.cm-slash-heading': { fontSize: '.75rem', opacity: '.75', padding: '.3rem .6rem', fontWeight: '600' },
    '.cm-slash-snippet': { fontSize: '.75rem', opacity: '.75', maxHeight: '3.8em', overflow: 'hidden' },
  })];
}
