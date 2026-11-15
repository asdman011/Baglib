import { BlockModel, BlockSchemaExtension, defineBlockSchema, Text, type Store, type ExtensionType } from '@blocksuite/affine/store';
import { BlockViewExtension, type BlockStdScope } from '@blocksuite/affine/std';
import { CaptionedBlockComponent } from '@blocksuite/affine/components/caption';
import { FootNoteNodeConfigExtension } from '@blocksuite/affine/inlines/footnote';
import { SlashMenuConfigExtension } from '@blocksuite/affine/widgets/slash-menu';
import { getInlineEditorByModel } from '@blocksuite/affine/rich-text';
import { BlockMarkdownAdapterExtension, BlockHtmlAdapterExtension, InlineDeltaToMarkdownAdapterExtension, InlineDeltaToHtmlAdapterExtension, FOOTNOTE_DEFINITION_PREFIX, type BlockMarkdownAdapterMatcher, type BlockHtmlAdapterMatcher } from '@blocksuite/affine/shared/adapters';
import { html, css, LitElement } from 'lit';
import { unsafeStatic } from 'lit/static-html.js';
import { bridge } from './bridge';
import { SourceSearch, sourceKinds } from './blocks';
import { sourceLabels, sourceAliases } from './blocks/dictionary';
import { researchEditorLabels } from '../../../src/shared/research-editor-i18n';
import { deriveApparatus, researchSettings, isBaglibCitation, readableCitation, bibliographyCitation, headingAnchor, footnoteAnchor, type ResearchFootnote, type ApparatusBlock } from '../../../src/shared/research-editor-apparatus';

const labels = () => researchEditorLabels(document.documentElement.lang);
export let activeSettings = researchSettings({});
let activeStore: Store | undefined;
let manuscriptId = '';
let settingsSave: Promise<void> = Promise.resolve();
export const flushApparatusSettings = () => settingsSave;
const refreshEvent = 'baglib-apparatus-update';
function liveBlock(model: BlockModel): ApparatusBlock {
  return { id: model.id, flavour: model.flavour, props: model.props, children: model.children.map(liveBlock) };
}
let projection: ReturnType<typeof deriveApparatus> | undefined;
let refreshPending = false;
export const currentApparatus = () => projection ??= deriveApparatus(activeStore?.root ? liveBlock(activeStore.root) : null, activeSettings);
export function refreshApparatus() {
  projection = undefined;
  if (refreshPending) return;
  refreshPending = true;
  queueMicrotask(() => { refreshPending = false; document.dispatchEvent(new Event(refreshEvent)); });
  requestAnimationFrame(() => {
    document.querySelectorAll<HTMLElement>('[data-heading-number]').forEach(e => { delete e.dataset.headingNumber; });
    const blocks = new Map(Array.from(document.querySelectorAll<HTMLElement>('affine-paragraph')).map(e => [e.getAttribute('data-block-id'), e]));
    for (const heading of currentApparatus().headings) {
      const block = blocks.get(heading.id);
      if (block) {
        block.id = headingAnchor(heading.id);
        block.dataset.headingNumber = activeSettings.headingNumbering ? heading.number : '';
        const wrapper = block.querySelector<HTMLElement>('.affine-paragraph-rich-text-wrapper');
        if (wrapper) wrapper.dataset.headingNumber = activeSettings.headingNumbering ? heading.number : '';
      }
    }
  });
}
export async function loadApparatus(store: Store, id: string) {
  const settings = await bridge?.settings?.load(id) ?? researchSettings({});
  activeStore = store; manuscriptId = id; activeSettings = settings; refreshApparatus();
}
export function standaloneApparatus(store: Store) { activeStore = store; refreshApparatus(); }
export function citationFromSource(props: { url: string; label: string; text: string; verses: { sadr: string; ajuz: string }[] }): ResearchFootnote {
  return { label: 'baglib-' + crypto.randomUUID(), reference: { type: 'url', url: props.url, title: props.label, description: props.verses.length ? props.verses.map(v => [v.sadr, v.ajuz].filter(Boolean).join(' — ')).join('\n') : props.text } };
}
function open(note: ResearchFootnote, event?: Event) {
  event?.preventDefault(); event?.stopPropagation();
  if (isBaglibCitation(note)) void bridge?.sources?.open(note.reference.url!).catch(bridge.error);
}
type NativeFootnote = HTMLElement & {
  footnote?: ResearchFootnote; readonly: boolean; onFootnoteClick(): void;
  selfInlineRange?: { index: number; length: number };
  inlineEditor?: { formatText(range: { index: number; length: number }, attributes: Record<string, unknown>): void };
};
function nativeFootnote(note: ResearchFootnote) {
  return Array.from(document.querySelectorAll<NativeFootnote>('affine-footnote-node')).find(e => e.footnote?.label === note.label);
}
class ReactiveApparatus extends LitElement {
  private refresh = () => this.requestUpdate();
  private off?: () => void;
  override connectedCallback() { super.connectedCallback(); document.addEventListener(refreshEvent, this.refresh); this.off = bridge?.subscribeAppearance(this.refresh); }
  override disconnectedCallback() { super.disconnectedCallback(); document.removeEventListener(refreshEvent, this.refresh); this.off?.(); }
}
class CitationNode extends ReactiveApparatus {
  static override properties = { note: { attribute: false } };
  declare note: ResearchFootnote;
  override createRenderRoot() { return this; }
  override render() {
    const host = this.closest('affine-footnote-node') as HTMLElement & { selfInlineRange?: { index: number } } | null;
    const block = this.closest('[data-block-id]')?.getAttribute('data-block-id');
    const all = currentApparatus().citations;
    const entry = all.find(c => c.key === block + ':' + host?.selfInlineRange?.index) ?? all.find(c => c.note.label === this.note.label);
    const inline = this.note.reference.url?.startsWith('quran:') && activeSettings.quranPlacement === 'inline';
    return html`<button type="button" class="baglib-citation" dir="auto" title=${readableCitation(this.note)} aria-label=${readableCitation(this.note)} @click=${(e: Event) => open(this.note, e)}>${inline ? '(' + (this.note.reference.title || this.note.reference.url) + ')' : html`<sup>${entry?.number ?? '•'}</sup>`}</button>`;
  }
}
class CitationPopup extends ReactiveApparatus {
  static override properties = { note: { attribute: false } };
  static override styles = css`:host{display:block;max-width:min(440px,90vw);padding:12px;border:1px solid #888;border-radius:8px;background:var(--affine-background-overlay-panel-color,#fff);color:var(--affine-text-primary-color);font:inherit;line-height:1.9;text-align:start} p{white-space:pre-wrap;max-height:35vh;overflow:auto;margin-block:8px;font-family:'Noto Naskh Arabic',serif;font-size:1.15em} button{font:inherit;cursor:pointer} bdi{overflow-wrap:anywhere}`;
  declare note: ResearchFootnote;
  override render() {
    const scheme = this.note.reference.url?.split(':')[0];
    const icon = ({ quran: '۞', sunnah: '❖', poetry: '❦', book: '▤' } as Record<string, string>)[scheme ?? ''] ?? '↗';
    return html`<section dir=${document.documentElement.dir} aria-label=${labels().reCitation}><span aria-hidden="true">${icon}</span> <bdi>${this.note.reference.title || this.note.reference.url}</bdi><p dir="auto" aria-label=${labels().reSourceText}>${this.note.reference.description ?? ''}</p><button @click=${(e: Event) => open(this.note, e)}>${labels().reOpenSource}</button></section>`;
  }
}
type GeneratedProps = { kind: 'bibliography' | 'contents' | 'footnotes' };
class GeneratedModel extends BlockModel<GeneratedProps> {}
export const apparatusSchemas = ['bibliography', 'contents', 'footnotes'].map(kind => defineBlockSchema({
  flavour: 'baglib:' + kind, props: () => ({ kind }), metadata: { version: 1, role: 'content', parent: ['affine:note'], children: [] }, toModel: () => new GeneratedModel(),
}));
function rows(kind: string, data = currentApparatus(), settings = activeSettings) {
  if (kind === 'contents') return data.headings.map(h => ({ key: h.id, href: '#' + headingAnchor(h.id), text: (settings.headingNumbering ? h.number + ' ' : '') + h.title, level: h.level }));
  if (kind === 'footnotes') return data.citations.filter(c => c.number !== null).map(c => ({ key: c.key, href: c.note.reference.url!, text: c.number + '. ' + readableCitation(c.note), level: 1 }));
  return data.bibliography.map(n => ({ key: n.reference.url!, href: n.reference.url!, text: bibliographyCitation(n, settings.citationStyle, labels().reNoDate), level: 1 }));
}
function title(kind: string) { const t = labels(); return kind === 'contents' ? t.reContents : kind === 'footnotes' ? t.reFootnotes : t.reBibliography; }
function jump(href: string, event: Event, store = activeStore) {
  event.preventDefault(); event.stopPropagation();
  if (href.startsWith('#')) {
    const target = document.getElementById(href.slice(1)); target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const id = currentApparatus().headings.find(h => '#' + headingAnchor(h.id) === href)?.id;
    const model = id && store?.getBlock(id)?.model;
    if (model) { const rich = target?.querySelector('rich-text') as HTMLElement & { inlineEditor?: { focusStart(): void } } | null; rich?.inlineEditor?.focusStart(); }
  } else open({ label: '', reference: { type: 'url', url: href } });
}
class GeneratedBlock extends CaptionedBlockComponent<GeneratedModel> {
  static override styles = css`.apparatus{padding:16px;margin-block:12px;border:1px solid #8886;border-radius:8px;line-height:1.9;text-align:start} h2{margin-block:0 8px} ul{list-style:none;padding:0;margin:0} li{padding-block:4px;overflow-wrap:anywhere} a{color:inherit} .level-2{padding-inline-start:1em}.level-3{padding-inline-start:2em}.level-4{padding-inline-start:3em}.level-5{padding-inline-start:4em}.level-6{padding-inline-start:5em}`;
  private refresh = () => this.requestUpdate();
  override connectedCallback() { super.connectedCallback(); this.contentEditable = 'false'; document.addEventListener(refreshEvent, this.refresh); }
  override disconnectedCallback() { super.disconnectedCallback(); document.removeEventListener(refreshEvent, this.refresh); }
  override renderBlock() {
    const kind = this.model.flavour.slice(7), entries = rows(kind);
    return html`<nav class="apparatus" dir=${document.documentElement.dir} aria-label=${title(kind)}><h2>${title(kind)}</h2>${entries.length ? html`<ul>${entries.map(r => html`<li class=${'level-' + r.level}><a dir="auto" href=${r.href} @click=${(e: Event) => jump(r.href, e, this.model.store)}>${r.text}</a></li>`)}</ul>` : html`<p>${labels().reEmpty}</p>`}</nav>`;
  }
}
class FootnoteList extends ReactiveApparatus {
  static override styles = css`:host{display:block;padding:12px 24px;font:inherit;line-height:1.9;color:var(--affine-text-primary-color)} section{border-block-start:1px solid #8886;padding-block-start:12px} li{padding-block:4px;overflow-wrap:anywhere} a{color:inherit} h2{font-size:1em} ul{list-style:none;padding:0}`;
  override render() { const entries = rows('footnotes'); return entries.length ? html`<section dir=${document.documentElement.dir}><h2>${labels().reFootnotes}</h2><ul>${entries.map(r => html`<li id=${footnoteAnchor(r.key)}><a dir="auto" href=${r.href} @click=${(e: Event) => jump(r.href, e)}>${r.text}</a></li>`)}</ul></section>` : ''; }
}
class ScholarlyToolbar extends ReactiveApparatus {
  static override properties = { expanded: { state: true }, status: { state: true }, saving: { state: true } };
  static override styles = css`:host{display:block;position:sticky;inset-block-start:0;z-index:5;background:var(--affine-background-primary-color,#fff);color:var(--affine-text-primary-color);padding:8px 16px;border-block-end:1px solid #8884;font:inherit;line-height:1.9} form{display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding-block:8px} label{display:flex;gap:6px;align-items:center} button,select{font:inherit;color:inherit;background:transparent;border:1px solid #888;border-radius:4px;padding:4px 8px;line-height:1.7} p{margin-block:4px} button{cursor:pointer}`;
  declare expanded: boolean; declare status: string; declare saving: boolean;
  constructor() { super(); this.expanded = false; this.status = ''; this.saving = false; }
  private async save(event: Event) {
    event.preventDefault(); if (this.saving) return;
    const form = new FormData(event.target as HTMLFormElement);
    const next = researchSettings({ citationStyle: form.get('style'), quranPlacement: form.get('placement'), footnoteNumbering: form.get('numbering'), headingNumbering: form.has('headings') });
    const savingStore = activeStore, savingManuscript = manuscriptId;
    this.saving = true; this.status = '';
    settingsSave = bridge?.settings?.save(savingManuscript, next) ?? Promise.resolve();
    try { await settingsSave; if (activeStore === savingStore && manuscriptId === savingManuscript) { activeSettings = next; this.status = 'saved'; refreshApparatus(); } }
    catch { this.status = 'error'; }
    finally { this.saving = false; }
  }
  override render() {
    const t = labels(), s = activeSettings;
    return html`<div dir=${document.documentElement.dir}><button type="button" aria-expanded=${this.expanded} @click=${() => { this.expanded = !this.expanded; this.status = ''; }}>${t.reSettings}</button>${this.expanded ? html`<form @submit=${this.save}>
      <label>${t.reStyle}<select name="style" .value=${s.citationStyle}><option value="arabic">${t.reArabicStyle}</option><option value="chicago">${t.reChicago}</option><option value="apa">${t.reAPA}</option></select></label>
      <label>${t.rePlacement}<select name="placement" .value=${s.quranPlacement}><option value="footnote">${t.reFootnote}</option><option value="inline">${t.reInline}</option></select></label>
      <label>${t.reNumbering}<select name="numbering" .value=${s.footnoteNumbering}><option value="chapter">${t.reChapter}</option><option value="page">${t.rePage}</option></select></label>
      <label><input type="checkbox" name="headings" .checked=${s.headingNumbering}>${t.reHeadingNumbering}</label><button type="submit" ?disabled=${this.saving || Boolean(bridge && !manuscriptId)}>${t.reSave}</button>
      </form><p>${t.rePagePending}</p><p role="status">${this.status === 'saved' ? t.reSaved : this.status === 'error' ? t.reError : ''}</p>` : ''}</div>`;
  }
}
export function apparatusViewExtensions(): ExtensionType[] {
  if (!customElements.get('baglib-citation')) {
    customElements.define('baglib-citation', CitationNode); customElements.define('baglib-citation-popup', CitationPopup);
    customElements.define('baglib-generated-block', GeneratedBlock); customElements.define('baglib-footnote-list', FootnoteList); customElements.define('baglib-scholarly-toolbar', ScholarlyToolbar);
  }
  return [
    ...apparatusSchemas.map(s => BlockViewExtension(s.model.flavour, unsafeStatic('baglib-generated-block'))),
    FootNoteNodeConfigExtension({
      customNodeRenderer: note => isBaglibCitation(note) ? html`<baglib-citation .note=${note}></baglib-citation>` : html`<span class="footnote-content-default" @click=${(event: Event) => { const node = (event.target as HTMLElement).closest('affine-footnote-node') as HTMLElement & { onFootnoteClick(): void }; node?.onFootnoteClick(); }}>${note.label.match(/^(?:doc|attachment)-(\d+)$/u)?.[1] ?? note.label}</span>`,
      customPopupRenderer: (note, std, abortController) => isBaglibCitation(note) ? html`<baglib-citation-popup .note=${note}></baglib-citation-popup>` : html`<footnote-popup .footnote=${note} .std=${std} .abortController=${abortController} .onPopupClick=${() => nativeFootnote(note)?.onFootnoteClick()} .updateFootnoteAttributes=${(next: ResearchFootnote) => { const node = nativeFootnote(note); if (node && !node.readonly && node.selfInlineRange) node.inlineEditor?.formatText(node.selfInlineRange, { footnote: next }); }}></footnote-popup>`,
    }),
    SlashMenuConfigExtension('baglib:apparatus', { items: () => [
      ...['bibliography', 'contents'].map((kind, index) => ({ name: title(kind), searchAlias: [kind, kind === 'contents' ? 'toc' : 'references', title(kind)], group: `0_${labels().reCitation}@${index}` as `0_${string}@${number}`, action: ({ model }: { model: BlockModel }) => { const parent = model.store.getParent(model); if (parent && !model.store.readonly) { model.store.captureSync(); model.store.addBlock('baglib:' + kind, {}, parent, parent.children.indexOf(model) + 1); model.store.captureSync(); } } })),
      ...sourceKinds.map((kind, index) => ({
        name: labels().reInsertCitation + ' · ' + sourceLabels()[kind], searchAlias: ['cite', 'citation', 'توثيق', ...sourceAliases[kind]], group: `0_${labels().reCitation}@${index + 2}` as `0_${string}@${number}`,
        when: () => Boolean(bridge?.sources),
        action: ({ model, std }: { model: BlockModel; std: BlockStdScope }) => {
          if (model.store.readonly || !(model.props.text instanceof Text)) return;
          const text = model.props.text, position = getInlineEditorByModel(std, model)?.getInlineRange()?.index ?? text.length;
          document.querySelector('baglib-source-search')?.remove();
          const search = document.createElement('baglib-source-search') as SourceSearch; search.kind = kind;
          search.onPick = result => {
            if (model.store.readonly || !model.store.getBlock(model.id)) return;
            const index = Math.min(position, text.length); model.store.captureSync();
            text.insert(' ', index); text.format(index, 1, { footnote: citationFromSource(result.props) }); model.store.captureSync();
            setTimeout(() => { const editor = getInlineEditorByModel(std, model); editor?.focusEnd(); editor?.setInlineRange({ index: index + 1, length: 0 }); }, 50);
          };
          search.onClose = () => getInlineEditorByModel(std, model)?.focusEnd(); document.body.append(search);
        },
      })),
    ] }),
  ];
}

/** Add derived export data to a clone, never the live Y document or its history. */
export function prepareApparatusExport<T extends { blocks: unknown }>(snapshot: T): T {
  const copy = structuredClone(snapshot), root = copy.blocks as ApparatusBlock;
  const data = deriveApparatus(root, activeSettings);
  const walk = (block: ApparatusBlock) => {
    const text = block.props.text as { delta?: { insert: string; attributes?: { footnote?: ResearchFootnote } }[] } | undefined;
    let offset = 0;
    for (const delta of text?.delta ?? []) {
      const entry = data.citations.find(c => c.key === block.id + ':' + offset); offset += delta.insert.length;
      if (!entry) continue;
      if (entry.number === null) { delta.insert = '(' + (entry.note.reference.title || entry.note.reference.url) + ')'; delete delta.attributes?.footnote; }
      else delta.attributes!.footnote = { ...entry.note, label: String(entry.number) };
    }
    const heading = data.headings.find(h => h.id === block.id);
    if (heading && activeSettings.headingNumbering && text?.delta) text.delta.unshift({ insert: heading.number + ' ' });
    if (block.flavour === 'baglib:bibliography' || block.flavour === 'baglib:contents') block.props.entries = rows(block.flavour.slice(7), data);
    block.children.forEach(walk);
  };
  walk(root);
  const note = root.children.find(c => c.flavour === 'affine:note');
  if (note && data.citations.some(c => c.number !== null)) note.children.push({ id: 'baglib-export-footnotes', flavour: 'baglib:footnotes', props: { entries: rows('footnotes', data) }, children: [], type: 'block', version: 1 } as ApparatusBlock);
  return copy;
}
export function apparatusStoreExtensions(): ExtensionType[] {
  return [
    ...apparatusSchemas.flatMap(schema => {
      const flavour = schema.model.flavour, kind = flavour.slice(7);
      const markdown: BlockMarkdownAdapterMatcher = { flavour, toMatch: () => false, fromMatch: o => o.node.flavour === flavour, toBlockSnapshot: {}, fromBlockSnapshot: { enter(o, ctx) {
        // Markdown's inline adapter emits actual [^n] definitions; do not duplicate them here.
        if (kind === 'footnotes') return;
        const entries = (o.node.props.entries ?? rows(kind)) as ReturnType<typeof rows>;
        ctx.walkerContext.openNode({ type: 'heading', depth: 2, children: [{ type: 'text', value: title(kind) }] }, 'children').closeNode();
        for (const r of entries) ctx.walkerContext.openNode({ type: 'paragraph', children: [{ type: 'link', url: r.href, children: [{ type: 'text', value: r.text }] }] }, 'children').closeNode();
      } } };
      const htmlMatcher: BlockHtmlAdapterMatcher = { flavour, toMatch: () => false, fromMatch: o => o.node.flavour === flavour, toBlockSnapshot: {}, fromBlockSnapshot: { enter(o, ctx) {
        const entries = (o.node.props.entries ?? rows(kind)) as ReturnType<typeof rows>;
        ctx.walkerContext.openNode({ type: 'element', tagName: 'section', properties: { dir: document.documentElement.dir }, children: [
          { type: 'element', tagName: 'h2', properties: {}, children: [{ type: 'text', value: title(kind) }] },
          ...entries.map(r => ({ type: 'element' as const, tagName: 'p', properties: { id: kind === 'footnotes' ? 'baglib-footnote-' + r.text.split('.')[0] : undefined, dir: 'auto' }, children: [{ type: 'element' as const, tagName: 'a', properties: { href: r.href }, children: [{ type: 'text' as const, value: r.text }] }] })),
        ] }, 'children').closeNode();
      } } };
      return [BlockSchemaExtension(schema), BlockMarkdownAdapterExtension(markdown), BlockHtmlAdapterExtension(htmlMatcher)];
    }),
    InlineDeltaToMarkdownAdapterExtension({ name: 'baglib-readable-footnote', match: d => Boolean(d.attributes?.footnote && isBaglibCitation(d.attributes.footnote)), toAST: (delta, ctx) => {
      const note = delta.attributes!.footnote!;
      ctx.configs.set(FOOTNOTE_DEFINITION_PREFIX + note.label, readableCitation(note));
      return { type: 'footnoteReference', label: note.label, identifier: note.label };
    } }),
    InlineDeltaToHtmlAdapterExtension({ name: 'baglib-readable-footnote', match: d => Boolean(d.attributes?.footnote && isBaglibCitation(d.attributes.footnote)), toAST: delta => {
      const note = delta.attributes!.footnote!;
      return { type: 'element', tagName: 'sup', properties: {}, children: [{ type: 'element', tagName: 'a', properties: { href: '#baglib-footnote-' + note.label, title: readableCitation(note) }, children: [{ type: 'text', value: note.label }] }] };
    } }),
  ];
}
