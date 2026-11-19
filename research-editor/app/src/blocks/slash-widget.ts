import { WidgetComponent, WidgetViewIdentifier, TextSelection } from '@blocksuite/affine/std';
import type { BlockModel, ExtensionType } from '@blocksuite/affine/store';
import { getInlineEditorByModel } from '@blocksuite/affine/rich-text';
import { SlashMenuExtension, type SlashMenuItem, type SlashMenuActionItem, type SlashMenuContext } from '@blocksuite/affine/widgets/slash-menu';
import { html, css, LitElement } from 'lit';
import { unsafeStatic } from 'lit/static-html.js';
import { normalizeArabicText } from '../../../../src/shared/utils/text-normalizer';
import { parseSlashCommand } from '../../../../src/shared/slash-command';
import { sourceLabels } from './dictionary';

let pendingSlashQuery = '';
export function consumeSlashInitialQuery(): string {
  const q = pendingSlashQuery;
  pendingSlashQuery = '';
  return q;
}

type Inline = NonNullable<ReturnType<typeof getInlineEditorByModel>>;
const normalized = (value: string) => normalizeArabicText(value, { normalizeTaaMarbuta: false });
/** The upstream menu observes keydown rather than text input. This public widget reads the
 * updated InlineEditor after beforeInput/compositionEnd, including native Arabic insertText. */
class BaglibSlashWidget extends WidgetComponent {
  private menu?: BaglibSlashMenu;
  private generation = 0;
  private closed = false;
  private listen = (event: Event) => {
    if (!(event.target instanceof Node) || !this.host.contains(event.target)) return;
    const generation = ++this.generation;
    const selection = this.host.selection.find(TextSelection);
    if (this.host.store.readonly) return;
    const anchor = window.getSelection()?.anchorNode;
    const element = anchor instanceof Element ? anchor : anchor?.parentElement;
    const blockId = element?.closest('[data-block-id]')?.getAttribute('data-block-id') ?? selection?.blockId;
    const model = blockId ? this.host.store.getBlock(blockId)?.model : undefined;
    const inline = model && getInlineEditorByModel(this.std, model);
    if (!inline || !model) return;
    void new Promise<void>(resolve => requestAnimationFrame(() => resolve())).then(() => inline.waitForUpdate()).then(() => {
      if (this.closed || generation !== this.generation) return;
      const range = inline.getInlineRange();
      if (!range || range.length) { this.close(); return; }
      const before = inline.yText.toString().slice(0, range.index);
      const match = /\/([^/\n]*)$/u.exec(before);
      if (!match) { this.close(); return; }
      const start = before.length - match[1].length - 1;
      const config = this.std.get(SlashMenuExtension).config;
      const context = { model, std: this.std };
      if (config.disableWhen?.(context)) { this.close(); return; }
      const all = typeof config.items === 'function' ? config.items(context) : config.items;
      if (!this.menu || this.menu.model !== model) {
        this.close();
        this.menu = document.createElement('baglib-slash-menu') as BaglibSlashMenu;
        this.menu.model = model; this.menu.context = context; this.menu.inline = inline;
        this.menu.onClose = () => this.close();
        document.body.append(this.menu);
      }
      this.menu.start = start; this.menu.query = match[1]; this.menu.setItems(all);
    }).catch(error => { this.close(); console.error(error); });
  };
  private key = (event: KeyboardEvent) => {
    if (!this.menu) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); this.close(); }
    if (!this.menu.items.length && (event.key === 'Enter' || event.key === 'Tab')) { this.close(); return; }
    if (['Enter','ArrowDown','ArrowUp','Tab'].includes(event.key) && !event.isComposing) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (event.key === 'Enter' || event.key === 'Tab') this.menu.pick(this.menu.selected);
      else this.menu.select(event.key === 'ArrowDown' ? 1 : -1);
    }
  };
  private close() { this.menu?.remove(); this.menu = undefined; }
  private outside = (event: PointerEvent) => {
    if (this.menu && !event.composedPath().includes(this.menu)) this.close();
  };
  override connectedCallback() {
    super.connectedCallback(); this.closed = false;
    document.addEventListener('beforeinput', this.listen, true);
    document.addEventListener('compositionend', this.listen, true);
    document.addEventListener('keydown', this.key, true);
    document.addEventListener('pointerdown', this.outside, true);
  }
  override disconnectedCallback() {
    this.closed = true; this.generation++; this.close();
    document.removeEventListener('beforeinput', this.listen, true);
    document.removeEventListener('compositionend', this.listen, true);
    document.removeEventListener('keydown', this.key, true);
    document.removeEventListener('pointerdown', this.outside, true);
    super.disconnectedCallback();
  }
}
class BaglibSlashMenu extends LitElement {
  static override styles = css`
    :host { position:fixed; z-index:9999; width:300px; max-width:90vw; color:var(--affine-text-primary-color); }
    ul { background:var(--affine-background-overlay-panel-color,#fff); border:1px solid #888; border-radius:8px; margin:0; padding:6px; max-block-size:min(320px,calc(100vh - 16px)); overflow:auto; list-style:none; box-shadow:0 8px 24px #0003; }
    li { padding:6px 10px; text-align:start; line-height:1.8; border-radius:4px; cursor:pointer; }
    li[aria-selected=true] { background:#2f9e6e33; } small { display:block; opacity:.75; }
  `;
  model!: BlockModel; context!: SlashMenuContext; inline!: Inline;
  start = 0; query = ''; selected = 0; items: SlashMenuActionItem[] = [];
  onClose = () => {};
  setItems(items: SlashMenuItem[]) {
    const flat = (values: SlashMenuItem[], ancestors: string[] = []): SlashMenuActionItem[] => values.flatMap(item => item.when && !item.when(this.context) ? [] : 'subMenu' in item ? flat(item.subMenu, [...ancestors, item.name, ...(item.searchAlias ?? [])]) : [{ ...item, searchAlias: [...(item.searchAlias ?? []), ...ancestors] }]);
    const parsed = parseSlashCommand('/' + this.query);
    const scopeTerms: Record<string, string[]> = {
      quran: ['ayah', 'quran'],
      sunnah: ['hadith', 'sunnah'],
      albayan: ['poetry', 'verse'],
      books: ['book', 'book-quote'],
      dictionary: ['dictionary'],
      people: ['people'],
      wikipedia: ['wikipedia'],
    };
    const allFlat = flat(items);
    const query = normalized(this.query);
    if (parsed?.scope) {
      const targetAliases = scopeTerms[parsed.scope] ?? [parsed.scope];
      this.items = allFlat.filter(item => [item.name, ...(item.searchAlias ?? [])].some(alias => targetAliases.includes(normalized(alias).toLowerCase())));
    } else {
      this.items = allFlat.filter(item => !query || [item.name,...(item.searchAlias ?? [])].some(alias => normalized(alias).includes(query)));
    }
    this.selected = 0;
    this.dir = document.documentElement.dir;
    const range = window.getSelection()?.rangeCount ? window.getSelection()!.getRangeAt(0).getBoundingClientRect() : null;
    if (range) {
      const menuWidth = Math.min(300, innerWidth * 0.9);
      const x = Math.max(8, Math.min(innerWidth - menuWidth - 8, this.dir === 'rtl' ? range.right - menuWidth : range.left));
      this.style.insetInlineStart = (this.dir === 'rtl' ? innerWidth - x - menuWidth : x) + 'px';
      this.style.insetBlockStart = Math.max(8,Math.min(innerHeight - 340,range.bottom + 6)) + 'px';
    }
    this.dataset.baglibSlash = query; this.requestUpdate();
  }
  select(delta: number) { this.selected = Math.max(0,Math.min(this.items.length - 1,this.selected + delta)); this.requestUpdate(); void this.updateComplete.then(() => this.renderRoot.querySelector('[aria-selected=true]')?.scrollIntoView({block:'nearest'})); }
  pick(index: number) {
    const item = this.items[index];
    if (!item || this.model.store.readonly) return;
    const range = this.inline.getInlineRange();
    if (!range || range.index < this.start || this.inline.yText.toString().slice(this.start,range.index) !== '/' + this.query) { this.onClose(); return; }
    this.inline.yText.delete(this.start,range.index - this.start);
    this.inline.setInlineRange({index:this.start,length:0});
    const parsed = parseSlashCommand('/' + this.query);
    pendingSlashQuery = parsed?.scope ? parsed.query : '';
    const context = this.context; this.onClose();
    void this.inline.waitForUpdate().then(() => item.action(context)).catch(console.error);
  }
  override render() {
    return html`<ul role="listbox" aria-label=${sourceLabels().group} @mousedown=${(event: MouseEvent) => event.preventDefault()}>
      ${this.items.length ? this.items.map((item,index) => html`<li role="option" aria-selected=${index===this.selected} @pointermove=${() => { this.selected=index; this.requestUpdate(); }} @click=${() => this.pick(index)}>${item.icon}${item.name}${item.description ? html`<small>${item.description}</small>` : ''}</li>`) : html`<li role="status">${sourceLabels().empty}</li>`}
    </ul>`;
  }
}
export function sourceSlashWidgetExtension(): ExtensionType {
  if (!customElements.get('baglib-slash-widget')) {
    customElements.define('baglib-slash-widget', BaglibSlashWidget);
    customElements.define('baglib-slash-menu', BaglibSlashMenu);
  }
  return { setup: di => di.override(WidgetViewIdentifier('affine:page|affine-slash-menu-widget'), unsafeStatic('baglib-slash-widget')) };
}
