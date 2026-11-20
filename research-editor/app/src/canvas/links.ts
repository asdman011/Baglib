export interface CanvasLink { url?: string; noteId?: string }
const supported = (url: string) => /^(https?|mailto|note|quran|sunnah|book|poetry|media|person|baglib):/iu.test(url.trim());

function allDeep(root: ParentNode): Element[] {
  const elements = Array.from(root.querySelectorAll('*'));
  return elements.flatMap(el => el.shadowRoot ? [el, ...allDeep(el.shadowRoot)] : [el]);
}

/** Capture before the canvas selection controller, including pointer-disabled note masks/cards. */
export function installCanvasLinks(editor: HTMLElement, active: () => boolean, open: (target: CanvasLink) => void) {
  const doc = editor.ownerDocument;
  const hit = (event: MouseEvent): CanvasLink | null => {
    const path = event.composedPath();
    if (!path.includes(editor)) return null;
    if (path.some(node => node instanceof Element && node.matches('button,input,textarea,[role="button"],.affine-block-caption'))) return null;
    const inside = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom;
    };
    // A mask is above the rendered text. Inspect only the note underneath that mask.
    const mask = path.find(node => node instanceof Element && node.localName === 'edgeless-note-mask') as Element | undefined;
    const block = path.find(node => node instanceof Element &&
      !!(node as Element & { model?: { flavour?: string } }).model?.flavour &&
      !['affine:page', 'affine:surface'].includes((node as Element & { model: { flavour: string } }).model.flavour));
    const scope = mask?.closest('affine-edgeless-note') ?? (block as Element | undefined);
    if (!scope) return null; // Empty canvas/toolbar must never activate a covered link.
    const elements = [scope, ...allDeep(scope)];
    for (const el of elements) {
      if (!inside(el)) continue;
      if (el instanceof HTMLAnchorElement) {
        const url = el.getAttribute('href') ?? '';
        if (supported(url)) return { url: url.trim() };
      }
      const model = (el as Element & { model?: { flavour?: string; props?: { url?: string; noteId?: string } } }).model;
      if (el.localName === 'baglib-note-embed' && model?.props?.noteId) return { noteId: model.props.noteId };
      // Embed view subclasses expose the same approved model URL as bookmark cards.
      if (model?.flavour === 'affine:bookmark' || model?.flavour?.startsWith('affine:embed-') || ['baglib:ayah', 'baglib:hadith', 'baglib:verse', 'baglib:book-quote'].includes(model?.flavour ?? '')) {
        const url = model?.props?.url;
        if (url && supported(url)) return { url: url.trim() };
      }
    }
    return null;
  };
  const plain = (e: MouseEvent) => e.button === 0 && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey;
  const consume = (e: Event) => { e.preventDefault(); e.stopImmediatePropagation(); };
  let press: { x: number; y: number; target: CanvasLink } | null = null;
  let pending: ReturnType<typeof setTimeout> | undefined;
  let lastClick = 0;
  let lastTarget = '';
  let editing = false;
  const key = (target: CanvasLink) => target.url ?? target.noteId ?? '';
  doc.addEventListener('pointerdown', event => {
    press = null;
    editing = false;
    if (!active() || !plain(event)) return;
    const target = hit(event);
    if (!target) return;
    // Let the second press reach BlockSuite so a double-click can edit/select.
    if (key(target) === lastTarget && Date.now() - lastClick < 400) {
      clearTimeout(pending);
      editing = true;
      return;
    }
    press = { x: event.clientX, y: event.clientY, target };
    consume(event);
  }, true);
  doc.addEventListener('mousedown', event => { if (press) consume(event); }, true);
  doc.addEventListener('pointermove', event => {
    if (press) consume(event);
  }, true);
  doc.addEventListener('pointerup', event => { if (press) consume(event); }, true);
  doc.addEventListener('mouseup', event => { if (press) consume(event); }, true);
  doc.addEventListener('pointercancel', () => { press = null; }, true);
  doc.addEventListener('click', event => {
    if (!active() || !plain(event) || editing || event.detail > 1) return;
    const target = hit(event);
    if (!target) { press = null; return; }
    consume(event);
    const moved = press && Math.hypot(event.clientX - press.x, event.clientY - press.y) >= 5;
    press = null;
    if (moved) return;
    lastTarget = key(target);
    lastClick = Date.now();
    clearTimeout(pending);
    // Disambiguate the native double-click editing gesture before opening.
    pending = setTimeout(() => { if (active() && editor.isConnected) open(target); }, 400);
  }, true);
}
