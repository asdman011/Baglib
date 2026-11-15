// KEY-372 (RE-11): a quick note embedded live in a manuscript. The block stores only the note reference;
// the Markdown stays in the note and is read through the bridge each time, so there is no duplicate copy.
import { CaptionedBlockComponent } from '@blocksuite/affine/components/caption';
import { BlockModel, BlockSchemaExtension, defineBlockSchema, type ExtensionType } from '@blocksuite/affine/store';
import { BlockViewExtension } from '@blocksuite/affine/std';
import { SlashMenuConfigExtension } from '@blocksuite/affine/widgets/slash-menu';
import { BlockMarkdownAdapterExtension, BlockHtmlAdapterExtension, type BlockMarkdownAdapterMatcher, type BlockHtmlAdapterMatcher } from '@blocksuite/affine/shared/adapters';
import { css, html, LitElement } from 'lit';
import { unsafeStatic } from 'lit/static-html.js';
import { NOTE_EMBED_FLAVOUR, noteEmbedProps, type NoteEmbedProps } from '../../../../src/shared/manuscript-notes';
import type { ResearchNoteSummary } from '../../../../src/shared/research-editor';
import { bridge } from '../bridge';

const isArabic = () => (bridge?.appearance?.().lang ?? document.documentElement.lang) === 'ar';
const labels = () => isArabic()
  ? { name: 'ملاحظة سريعة', missing: 'الملاحظة غير موجودة أو حُذفت.', open: 'افتح الملاحظة', search: 'ابحث في الملاحظات…', none: 'لا توجد ملاحظات مطابقة', group: 'مصادر بغداد' }
  : { name: 'Quick note', missing: 'The note is missing or was deleted.', open: 'Open the note', search: 'Search notes…', none: 'No matching notes', group: 'BagLib sources' };

class NoteEmbedModel extends BlockModel<NoteEmbedProps> {}
export const noteEmbedSchema = defineBlockSchema({
  flavour: NOTE_EMBED_FLAVOUR,
  props: (): NoteEmbedProps => ({ url: '', noteId: '', title: '' }),
  metadata: { version: 1, role: 'content', parent: ['affine:note'], children: [] },
  toModel: () => new NoteEmbedModel(),
});

const exportText = (p: NoteEmbedProps) => (p.title || p.noteId) + ' — ' + p.url;

export function noteEmbedStoreExtensions(): ExtensionType[] {
  const markdown: BlockMarkdownAdapterMatcher = {
    flavour: NOTE_EMBED_FLAVOUR, toMatch: () => false, fromMatch: o => o.node.flavour === NOTE_EMBED_FLAVOUR,
    toBlockSnapshot: {}, fromBlockSnapshot: { enter(o, context) {
      const p = o.node.props as unknown as NoteEmbedProps;
      const node = { type: 'blockquote', children: [{ type: 'paragraph', children: [{ type: 'text', value: exportText(p) }] }] };
      context.walkerContext.openNode(node as Parameters<typeof context.walkerContext.openNode>[0], 'children').closeNode();
    } },
  };
  const htmlMatcher: BlockHtmlAdapterMatcher = {
    flavour: NOTE_EMBED_FLAVOUR, toMatch: () => false, fromMatch: o => o.node.flavour === NOTE_EMBED_FLAVOUR,
    toBlockSnapshot: {}, fromBlockSnapshot: { enter(o, context) {
      const p = o.node.props as unknown as NoteEmbedProps;
      const node = { type: 'element', tagName: 'blockquote', properties: { className: ['baglib-note-embed'], dir: 'auto' }, children: [{ type: 'text', value: exportText(p) }] };
      context.walkerContext.openNode(node as Parameters<typeof context.walkerContext.openNode>[0], 'children').closeNode();
    } },
  };
  return [BlockSchemaExtension(noteEmbedSchema), BlockMarkdownAdapterExtension(markdown), BlockHtmlAdapterExtension(htmlMatcher)];
}

class NoteEmbedBlock extends CaptionedBlockComponent<NoteEmbedModel> {
  static override styles = css`
    .note-card { margin-block:12px; padding:12px 16px; border-inline-start:4px solid #6b7fd7; border-radius:10px; background:rgba(107,127,215,.10); text-align:start; cursor:pointer; }
    .note-title { font-weight:600; margin-block-end:6px; }
    .note-body { white-space:pre-wrap; overflow-wrap:anywhere; line-height:2; max-height:24em; overflow:auto; font-family:'Noto Naskh Arabic',Inter,sans-serif; }
    .missing { opacity:.75; font-style:italic; }
  `;
  private note: ResearchNoteSummary | null | undefined = undefined;
  private notesOff?: () => void;
  private appearanceOff?: () => void;
  override connectedCallback() {
    super.connectedCallback();
    this.contentEditable = 'false';
    this.appearanceOff = bridge?.subscribeAppearance(() => this.requestUpdate());
    this.notesOff = bridge?.notes?.subscribe(() => { void this.load(); });
    void this.load();
  }
  override disconnectedCallback() { super.disconnectedCallback(); this.notesOff?.(); this.appearanceOff?.(); }
  private async load() {
    try { this.note = (await bridge?.notes?.get(this.model.props.noteId)) ?? null; } catch { this.note = null; }
    this.requestUpdate();
  }
  private open(event: Event) {
    event.preventDefault(); event.stopPropagation();
    void bridge?.notes?.open(this.model.props.noteId).catch(error => bridge?.error(error));
  }
  override renderBlock() {
    const p = this.model.props; const note = this.note;
    return html`<figure class="note-card" dir="auto" data-note-embed=${p.noteId} title=${labels().open} @click=${this.open}>
      <div class="note-title" dir="auto">${note?.title || p.title || p.noteId}</div>
      ${note === null ? html`<div class="missing">${labels().missing}</div>` : html`<div class="note-body" dir="auto">${note?.content ?? ''}</div>`}
    </figure>`;
  }
}

class NotePicker extends LitElement {
  static override properties = { notes: { state: true }, query: { state: true } };
  static override styles = css`
    :host { position:fixed; inset-block-start:18%; inset-inline:0; margin-inline:auto; width:min(560px,92vw); z-index:10000; color:var(--affine-text-primary-color); }
    section { background:var(--affine-background-overlay-panel-color,#fff); border:1px solid #888; border-radius:12px; padding:12px; box-shadow:0 10px 30px #0004; }
    input { width:100%; box-sizing:border-box; padding:8px; font:inherit; background:transparent; color:inherit; border:1px solid #888; border-radius:6px; }
    ul { list-style:none; padding:0; margin-block:8px 0; max-height:45vh; overflow:auto; }
    button.item { width:100%; text-align:start; background:transparent; color:inherit; border:0; border-radius:6px; padding:8px; font:inherit; cursor:pointer; }
    button.item:hover, button.item:focus { background:#6b7fd733; }
    small { display:block; opacity:.75; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  `;
  declare notes: ResearchNoteSummary[];
  declare query: string;
  onPick: (note: ResearchNoteSummary) => void = () => {};
  constructor() { super(); this.notes = []; this.query = ''; }
  override connectedCallback() {
    super.connectedCallback();
    this.dir = document.documentElement.dir;
    void bridge?.notes?.list().then(list => { this.notes = list; }).catch(() => { this.notes = []; });
    this.addEventListener('keydown', event => { if (event.key === 'Escape') this.remove(); });
  }
  override firstUpdated() { this.renderRoot.querySelector('input')?.focus(); }
  override render() {
    const q = this.query.trim().toLowerCase();
    const shown = this.notes.filter(n => !q || (n.title + '\n' + n.content).toLowerCase().includes(q)).slice(0, 30);
    return html`<section role="dialog" aria-label=${labels().name}>
      <input dir="auto" placeholder=${labels().search} aria-label=${labels().search} .value=${this.query} @input=${(e: Event) => { this.query = (e.target as HTMLInputElement).value; }} />
      <ul>${shown.length
        ? shown.map(n => html`<li><button class="item" dir="auto" data-note-pick=${n.id} @click=${() => { this.onPick(n); this.remove(); }}>${n.title || n.content.slice(0, 60)}<small dir="auto">${n.content.slice(0, 120)}</small></button></li>`)
        : html`<li>${labels().none}</li>`}</ul>
    </section>`;
  }
}

let defined = false;
export function noteEmbedViewExtensions(): ExtensionType[] {
  if (!defined) {
    customElements.define('baglib-note-embed', NoteEmbedBlock);
    customElements.define('baglib-note-picker', NotePicker);
    defined = true;
  }
  return [
    BlockViewExtension(NOTE_EMBED_FLAVOUR, unsafeStatic('baglib-note-embed')),
    SlashMenuConfigExtension('baglib:note-embed', { items: () => [{
      name: labels().name,
      searchAlias: ['note', 'quick note', 'ملاحظة', 'ملاحظه'],
      group: `0_${labels().group}@9` as `0_${string}@${number}`,
      when: () => Boolean(bridge?.notes),
      action: ({ model }) => {
        if (model.store.readonly) return;
        const parent = model.store.getParent(model);
        if (!parent) return;
        document.querySelector('baglib-note-picker')?.remove();
        const picker = document.createElement('baglib-note-picker') as NotePicker;
        picker.onPick = note => {
          if (model.store.readonly || !parent.children.includes(model)) return;
          model.store.captureSync();
          model.store.addBlock(NOTE_EMBED_FLAVOUR, noteEmbedProps(note), parent, parent.children.indexOf(model) + 1);
          model.store.captureSync();
        };
        document.body.append(picker);
      },
    }] }),
  ];
}
