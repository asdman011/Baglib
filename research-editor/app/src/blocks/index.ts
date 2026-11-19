import { getInlineEditorByModel } from '@blocksuite/affine/rich-text';
import { consumeSlashInitialQuery, sourceSlashWidgetExtension } from './slash-widget';
import { CaptionedBlockComponent } from '@blocksuite/affine/components/caption';
import { BlockModel, BlockSchemaExtension, defineBlockSchema, type ExtensionType, Text } from '@blocksuite/affine/store';
import { BlockViewExtension } from '@blocksuite/affine/std';
import { SlashMenuConfigExtension } from '@blocksuite/affine/widgets/slash-menu';
import { BlockMarkdownAdapterExtension, BlockHtmlAdapterExtension, type BlockMarkdownAdapterMatcher, type BlockHtmlAdapterMatcher } from '@blocksuite/affine/shared/adapters';
import { css, html, LitElement } from 'lit';
import { unsafeStatic } from 'lit/static-html.js';
import { emptySourceProps, type ResearchSourceKind, type ResearchSourceProps, type ResearchSourceResult } from '../../../../src/shared/research-editor-sources';
import { bridge } from '../bridge';
import { sourceAliases, sourceLabels } from './dictionary';
import { sourceMarkdownAst, sourceHtmlAst } from './exporters';

export const sourceKinds: ResearchSourceKind[] = ['ayah', 'hadith', 'verse', 'book-quote'];
export const slashSourceKinds: ResearchSourceKind[] = ['ayah', 'hadith', 'verse', 'book-quote', 'dictionary', 'people', 'wikipedia'];
class SourceModel extends BlockModel<ResearchSourceProps> {}
export const sourceSchemas = sourceKinds.map(kind => defineBlockSchema({
  flavour: 'baglib:' + kind, props: emptySourceProps,
  metadata: { version: 1, role: 'content', parent: ['affine:note'], children: [] },
  toModel: () => new SourceModel(),
}));
export function sourceStoreExtensions(): ExtensionType[] {
  return sourceSchemas.flatMap(schema => {
    const kind = schema.model.flavour.slice(7) as ResearchSourceKind;
    const markdown: BlockMarkdownAdapterMatcher = {
      flavour: 'baglib:' + kind, toMatch: () => false, fromMatch: o => o.node.flavour === 'baglib:' + kind,
      toBlockSnapshot: {}, fromBlockSnapshot: { enter(o, context) {
        context.walkerContext.openNode(sourceMarkdownAst(kind, o.node.props as unknown as ResearchSourceProps) as Parameters<typeof context.walkerContext.openNode>[0], 'children').closeNode();
      } },
    };
    const htmlMatcher: BlockHtmlAdapterMatcher = {
      flavour: 'baglib:' + kind, toMatch: () => false, fromMatch: o => o.node.flavour === 'baglib:' + kind,
      toBlockSnapshot: {}, fromBlockSnapshot: { enter(o, context) {
        context.walkerContext.openNode(sourceHtmlAst(kind, o.node.props as unknown as ResearchSourceProps) as Parameters<typeof context.walkerContext.openNode>[0], 'children').closeNode();
      } },
    };
    return [BlockSchemaExtension(schema), BlockMarkdownAdapterExtension(markdown), BlockHtmlAdapterExtension(htmlMatcher)];
  });
}
class SourceBlock extends CaptionedBlockComponent<SourceModel> {
  static override styles = css`
    .source-card { margin-block:12px; padding:14px 18px; border-inline-start:4px solid #2f9e6e; border-radius:10px; background:rgba(47,158,110,.10); text-align:start; }
    .source-text, td { font-family:'Noto Naskh Arabic',serif; font-size:1.25em; line-height:2.1; white-space:pre-wrap; overflow-wrap:anywhere; }
    table { width:100%; table-layout:fixed; border-collapse:collapse; } td { width:50%; padding-inline:8px; vertical-align:top; }
    a { color:inherit; line-height:1.8; } .grade { margin-inline-start:8px; }
  `;
  private appearanceOff?: () => void;
  override connectedCallback() { super.connectedCallback(); this.contentEditable = 'false'; this.appearanceOff = bridge?.subscribeAppearance(() => this.requestUpdate()); }
  override disconnectedCallback() { super.disconnectedCallback(); this.appearanceOff?.(); }
  private openSource(event: Event) { event.preventDefault(); event.stopPropagation(); void bridge?.sources?.open(this.model.props.url).catch(bridge.error); }
  override renderBlock() {
    const p = this.model.props; const kind = this.model.flavour.slice(7);
    return html`<figure class="source-card" dir="rtl" data-source-kind=${kind} @click=${this.openSource}>
      ${kind === 'verse' ? html`<table dir="rtl"><tbody>${p.verses.map(v => html`<tr><td dir="auto">${v.sadr}</td><td dir="auto">${v.ajuz}</td></tr>`)}</tbody></table>`
        : html`<div class="source-text" dir="auto">${kind === 'ayah' ? '﴿' + p.text + '﴾' : p.text}</div>`}
      <figcaption dir="auto"><a href=${p.url} title=${sourceLabels().open}>${p.label}</a><span class="grade">${p.grade}</span></figcaption>
    </figure>`;
  }
}
export class SourceSearch extends LitElement {
  static override properties = { results: { state: true }, status: { state: true }, selected: { state: true } };
  static override styles = css`
    :host { position:fixed; inset-block-start:18%; inset-inline:0; margin-inline:auto; width:min(620px,92vw); z-index:10000; color:var(--affine-text-primary-color); }
    section { background:var(--affine-background-overlay-panel-color,#fff); border:1px solid #888; border-radius:12px; padding:12px; box-shadow:0 10px 30px #0004; }
    header { display:flex; justify-content:space-between; align-items:center; margin-block-end:8px; }
    input { width:100%; box-sizing:border-box; padding:8px; font:inherit; line-height:1.8; background:transparent; color:inherit; border:1px solid #888; border-radius:6px; }
    ul { list-style:none; padding:0; margin-block:8px 0; max-height:45vh; overflow:auto; }
    li button { width:100%; text-align:start; background:transparent; color:inherit; border:0; border-radius:6px; padding:8px; font:inherit; line-height:1.9; cursor:pointer; }
    li[aria-selected=true] { background:#2f9e6e33; } small { display:block; white-space:pre-wrap; max-height:5em; overflow:hidden; font-family:'Noto Naskh Arabic',serif; }
    .wiki-lang-bar { display:flex; gap:6px; margin-block-end:8px; }
    .wiki-lang-btn { padding:3px 10px; font-size:12px; border-radius:6px; border:1px solid #888; background:transparent; color:inherit; cursor:pointer; }
    .wiki-lang-btn[aria-pressed=true] { background:#059669; color:#fff; border-color:#059669; font-weight:600; }
    .dict-group-heading { font-size:12px; font-weight:600; color:#059669; padding:4px 8px 2px; }
    .role-badge { display:inline-block; margin-inline-start:6px; font-size:11px; padding:1px 6px; border-radius:4px; border:1px solid #8885; opacity:.85; }
  `;
  kind: ResearchSourceKind = 'ayah';
  initialQuery = '';
  declare results: ResearchSourceResult[]; declare status: 'empty' | 'loading' | 'error' | 'offline' | ''; declare selected: number;
  private wikiLangOverride?: 'ar' | 'en';
  private lastQuery = '';
  constructor() { super(); this.results = []; this.status = 'empty'; this.selected = 0; }
  onPick: (result: ResearchSourceResult) => void = () => {};
  onClose: () => void = () => {};
  private timer?: ReturnType<typeof setTimeout>;
  private requestId = '';
  private sequence = 0;
  private appearanceOff?: () => void;
  override connectedCallback() { super.connectedCallback(); this.dir = document.documentElement.dir; this.appearanceOff = bridge?.subscribeAppearance(a => { this.dir = a.dir; this.requestUpdate(); }); }
  override firstUpdated() {
    setTimeout(() => {
      const input = this.renderRoot.querySelector('input');
      if (input) {
        if (this.initialQuery) {
          input.value = this.initialQuery;
          this.query(this.initialQuery);
        } else if (this.kind === 'people') {
          this.query('');
        }
        input.focus();
      }
    }, 100);
  }
  override disconnectedCallback() { super.disconnectedCallback(); clearTimeout(this.timer); this.cancel(); this.appearanceOff?.(); }
  private cancel() { if (this.requestId) { void bridge?.sources?.cancel(this.requestId).catch(bridge.error); this.requestId = ''; } this.sequence++; }
  private close() { this.remove(); this.onClose(); }
  private pick(index: number) { const value = this.results[index]; if (!value || this.status === 'loading') return; this.onPick(value); this.remove(); }
  private currentWikiLang(): 'ar' | 'en' {
    if (this.wikiLangOverride) return this.wikiLangOverride;
    if (/[\u0600-\u06FF]/u.test(this.lastQuery)) return 'ar';
    return document.documentElement.lang === 'ar' ? 'ar' : 'en';
  }
  private setWikiLang(lang: 'ar' | 'en') {
    this.wikiLangOverride = lang;
    this.requestUpdate();
    if (this.lastQuery.trim().length >= 2) this.query(this.lastQuery);
  }
  private query(value: string) {
    this.lastQuery = value;
    clearTimeout(this.timer); this.cancel(); this.results = []; this.selected = 0;
    if (this.kind !== 'people' && value.trim().length < 2) { this.status = 'empty'; return; }
    this.status = 'loading'; const seq = this.sequence;
    const wikiLang = this.kind === 'wikipedia' ? this.currentWikiLang() : undefined;
    this.timer = setTimeout(async () => {
      const id = 're366-' + crypto.randomUUID().replaceAll('-', ''); this.requestId = id;
      try {
        const found = await bridge?.sources?.search(this.kind, value, id, wikiLang ? { wikiLang } : undefined) ?? [];
        if (!this.isConnected || seq !== this.sequence) return;
        this.results = found; this.status = found.length ? '' : 'empty';
      } catch (err) {
        if (!this.isConnected || seq !== this.sequence) return;
        this.status = err instanceof Error && err.message === 'offline' ? 'offline' : 'error';
      }
    }, 180);
  }
  private key(event: KeyboardEvent) {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); this.close(); }
    if (event.key === 'Enter') { event.preventDefault(); this.pick(this.selected); }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); this.selected = Math.max(0, Math.min(this.results.length - 1, this.selected + (event.key === 'ArrowDown' ? 1 : -1)));
      void this.updateComplete.then(() => this.renderRoot.querySelector('[aria-selected=true]')?.scrollIntoView({ block: 'nearest' }));
    }
  }
  override render() {
    const t = sourceLabels();
    const activeWikiLang = this.kind === 'wikipedia' ? this.currentWikiLang() : 'ar';
    let lastDict = '';
    return html`<section role="dialog" aria-label=${t[this.kind]} @keydown=${this.key}>
      <header><strong>${t[this.kind]}</strong><button @click=${this.close} aria-label=${t.close}>×</button></header>
      ${this.kind === 'wikipedia' ? html`<div class="wiki-lang-bar" role="group" aria-label=${t.wikipedia}>
        <button type="button" class="wiki-lang-btn" aria-pressed=${activeWikiLang === 'ar'} @click=${() => this.setWikiLang('ar')}>${t.wikiAr}</button>
        <button type="button" class="wiki-lang-btn" aria-pressed=${activeWikiLang === 'en'} @click=${() => this.setWikiLang('en')}>${t.wikiEn}</button>
      </div>` : ''}
      <input dir="auto" aria-label=${t.search} placeholder=${t.search} role="combobox" aria-controls="source-results" aria-expanded="true" aria-activedescendant=${this.results.length ? 'source-' + this.selected : ''} @input=${(e: InputEvent) => this.query((e.target as HTMLInputElement).value)} />
      <div role="status">${this.status ? t[this.status] : ''}</div>
      <ul id="source-results" role="listbox">${this.results.map((r, i) => {
        const showDictHeader = this.kind === 'dictionary' && r.props.collection && r.props.collection !== lastDict;
        if (showDictHeader) lastDict = r.props.collection;
        const roleLabel = this.kind === 'people' && (r.props.collection === 'narrator' || r.props.collection === 'scholar') ? t[r.props.collection] : '';
        const meta = this.kind === 'people' || this.kind === 'dictionary' ? '' : r.props.grade;
        return html`${showDictHeader ? html`<li class="dict-group-heading" role="presentation">${r.props.collection}</li>` : ''}<li id=${'source-' + i} role="option" aria-selected=${i === this.selected}><button tabindex="-1" @pointermove=${() => { this.selected = i; }} @click=${() => this.pick(i)}><b dir="auto">${r.props.label}</b>${roleLabel ? html`<span class="role-badge">${roleLabel}</span>` : ''}<small dir="auto">${r.kind === 'verse' ? r.props.verses.map(v => v.sadr + ' ' + v.ajuz).join('\n') : r.props.text}</small>${meta}</button></li>`;
      })}</ul>
    </section>`;
  }
}
let defined = false;
export function sourceViewExtensions(): ExtensionType[] {
  if (!defined) {
    for (const kind of sourceKinds) customElements.define('baglib-' + kind, class extends SourceBlock {});
    customElements.define('baglib-source-search', SourceSearch); defined = true;
  }
  return [
    sourceSlashWidgetExtension(),
    ...sourceKinds.map(kind => BlockViewExtension('baglib:' + kind, unsafeStatic('baglib-' + kind))),
    SlashMenuConfigExtension('baglib:sources', { items: () => slashSourceKinds.map((kind, index) => ({
      name: sourceLabels()[kind], searchAlias: sourceAliases[kind], group: `0_${sourceLabels().group}@${index}` as `0_${string}@${number}`,
      when: () => Boolean(bridge?.sources),
      action: ({ model, std }) => {
        if (model.store.readonly) return;
        const parent = model.store.getParent(model); if (!parent) return;
        const insertionIndex = getInlineEditorByModel(std, model)?.getInlineRange()?.index;
        document.querySelector('baglib-source-search')?.remove();
        const panel = document.createElement('baglib-source-search') as SourceSearch; panel.kind = kind;
        panel.initialQuery = consumeSlashInitialQuery();
        const focus = (id: string) => { setTimeout(() => {
          const next = model.store.getBlock(id)?.model;
          if (next) getInlineEditorByModel(std, next)?.focusStart();
        }, 50); };
        panel.onClose = () => focus(model.id);
        panel.onPick = picked => {
          if (model.store.readonly || !parent.children.includes(model)) return;
          model.store.captureSync();
          if (picked.kind === 'people') {
            const inline = getInlineEditorByModel(std, model);
            const idx = insertionIndex ?? (model.props.text instanceof Text ? model.props.text.length : 0);
            if (model.props.text instanceof Text) {
              model.props.text.insert(picked.props.label, idx, { link: picked.props.url });
              model.store.captureSync();
              setTimeout(() => { inline?.setInlineRange({ index: idx + picked.props.label.length, length: 0 }); }, 50);
              return;
            }
          }
          const position = parent.children.indexOf(model) + 1;
          const text = model.props.text;
          const suffix = text instanceof Text && insertionIndex !== undefined && insertionIndex <= text.length ? text.split(insertionIndex, 0) : new Text();
          if (picked.kind === 'dictionary') {
            const sourceLabel = [picked.props.collection, picked.props.label].filter(Boolean).join(': ');
            const quoteText = `${picked.props.text.trim()}\n— ${sourceLabel}`;
            model.store.addBlock('affine:paragraph', { type: 'quote', text: new Text(quoteText) }, parent, position);
          } else if (picked.kind === 'wikipedia') {
            const pText = new Text();
            pText.insert(picked.props.label, 0, { bold: true });
            if (picked.props.text.trim()) pText.insert('\n' + picked.props.text.trim(), pText.length);
            pText.insert('\n', pText.length);
            pText.insert(picked.props.url, pText.length, { link: picked.props.url });
            model.store.addBlock('affine:paragraph', { type: 'quote', text: pText }, parent, position);
          } else {
            model.store.addBlock('baglib:' + kind, JSON.parse(JSON.stringify(picked.props)) as ResearchSourceProps, parent, position);
          }
          const following = model.store.addBlock('affine:paragraph', { text: suffix }, parent, position + 1);
          model.store.captureSync(); focus(following);
        };
        document.body.append(panel);
      },
    })) }),
  ];
}
