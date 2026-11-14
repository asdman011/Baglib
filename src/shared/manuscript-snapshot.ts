import type { ManuscriptLink, ManuscriptScheme } from './manuscripts';
type JsonObject = Record<string, unknown>;
const object = (value: unknown): value is JsonObject => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const schemes = new Set(['quran', 'sunnah', 'poetry', 'book', 'note']);

/** BlockSuite text is either a string or its public serialized delta wrapper. */
function text(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(item => object(item) && typeof item.insert === 'string' ? item.insert : '').join('');
  if (object(value)) return text(value.delta ?? value['$blocksuite:internal:text$']);
  return '';
}
export function parseManuscriptSnapshot(snapshot: unknown): JsonObject {
  if (typeof snapshot !== 'string' || snapshot.length > 32 * 1024 * 1024) throw new Error('invalid-request');
  let value: unknown;
  try { value = JSON.parse(snapshot); } catch { throw new Error('invalid-request'); }
  if (!object(value) || !object(value.blocks)) throw new Error('invalid-request');
  return value;
}

/** Derive only editor text and BagLib references, leaving the serialized snapshot untouched. */
export function deriveManuscriptSnapshot(snapshot: string): { plainText: string; title?: string; links: ManuscriptLink[] } {
  const root = parseManuscriptSnapshot(snapshot);
  const paragraphs: string[] = [];
  const links = new Map<string, ManuscriptLink>();
  let title: string | undefined;
  const addUrl = (url: unknown, blockId: string) => {
    if (typeof url !== 'string') return;
    const match = /^(quran|sunnah|poetry|book|note):(.+)$/u.exec(url);
    if (!match || !match[2].trim()) return;
    const link = { block_id: blockId, target_scheme: match[1] as ManuscriptScheme, target_id: match[2] };
    links.set(JSON.stringify(link), link);
  };
  const urls = (value: unknown, blockId: string) => {
    if (Array.isArray(value)) { value.forEach(item => urls(item, blockId)); return; }
    if (!object(value)) return;
    addUrl(value.url, blockId);
    addUrl(value.link, blockId);
    for (const child of Object.values(value)) if (typeof child === 'object') urls(child, blockId);
  };
  const visit = (block: unknown) => {
    if (!object(block)) return;
    const id = typeof block.id === 'string' ? block.id : '';
    const props = object(block.props) ? block.props : {};
    if (typeof block.flavour === 'string' && /:page$/u.test(block.flavour)) {
      const value = text(props.title);
      if (value.trim()) title = value;
    }
    const textKeys = ['title', 'text', 'caption', 'quote', 'content', 'sadr', 'ajuz'];
    for (const key of textKeys) {
      const value = text(props[key]);
      if (value) paragraphs.push(value);
    }
    if (Array.isArray(props.verses)) for (const verse of props.verses) {
      if (object(verse)) paragraphs.push([text(verse.sadr), text(verse.ajuz)].filter(Boolean).join(' '));
    }
    const nestedText = (value: unknown) => {
      if (Array.isArray(value)) { value.forEach(nestedText); return; }
      if (!object(value)) return;
      if (Array.isArray(value.delta)) {
        const content = text(value);
        if (content) paragraphs.push(content);
        return;
      }
      Object.values(value).forEach(nestedText);
    };
    for (const [key, value] of Object.entries(props)) if (!textKeys.includes(key) && key !== 'verses') nestedText(value);
    if (id) {
      urls(props, id);
      if (typeof block.flavour === 'string' && block.flavour.startsWith('baglib:')) {
        // Support a bare scheme/target pair for the forthcoming RE-5 blocks.
        const scheme = props.target_scheme ?? props.targetScheme ?? props.scheme;
        const target = props.target_id ?? props.targetId;
        if (typeof scheme === 'string' && schemes.has(scheme) && typeof target === 'string') addUrl(`${scheme}:${target}`, id);
        const references = (value: unknown) => {
          if (typeof value === 'string') { addUrl(value, id); return; }
          if (Array.isArray(value)) { value.forEach(references); return; }
          if (object(value)) Object.values(value).forEach(references);
        };
        references(props);
      }
    }
    if (Array.isArray(block.children)) block.children.forEach(visit);
  };
  visit(root.blocks);
  return { plainText: paragraphs.join('\n'), title, links: [...links.values()] };
}
export function initialManuscriptSnapshot(id: string, title: string): string {
  return JSON.stringify({ id, blocks: { id: `${id}-page`, flavour: 'affine:page', props: { title: { '$blocksuite:internal:text$': true, delta: [{ insert: title }] } }, children: [] } });
}
export function renameManuscriptSnapshot(snapshot: string, title: string): string {
  const root = parseManuscriptSnapshot(snapshot);
  const rename = (block: unknown) => {
    if (!object(block)) return;
    if (typeof block.flavour === 'string' && /:page$/u.test(block.flavour)) {
      const props = object(block.props) ? block.props : {};
      props.title = { '$blocksuite:internal:text$': true, delta: [{ insert: title }] };
      block.props = props;
    }
    if (Array.isArray(block.children)) block.children.forEach(rename);
  };
  rename(root.blocks);
  return JSON.stringify(root);
}
