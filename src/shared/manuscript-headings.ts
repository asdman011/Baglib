type JsonObject = Record<string, unknown>;
const isObject = (value: unknown): value is JsonObject => Boolean(value && typeof value === 'object' && !Array.isArray(value));

function extractText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map(item => isObject(item) && typeof item.insert === 'string' ? item.insert : '').join('');
  }
  if (isObject(value)) {
    if (typeof value.insert === 'string') return value.insert;
    if (Array.isArray(value.delta)) return extractText(value.delta);
    if (value['$blocksuite:internal:text$'] !== undefined) return extractText(value['$blocksuite:internal:text$']);
  }
  return '';
}

export interface DocumentHeading {
  id: string;
  level: number; // 1 to 6
  text: string;
}

export interface DocumentStats {
  words: number;
  chars: number;
  paragraphs: number;
  headings: number;
}

/**
 * Extracts headings from a BlockSuite snapshot JSON string.
 * Supports affine:paragraph with type h1..h6 as well as the root page title.
 */
export function extractDocumentHeadings(snapshot: string): DocumentHeading[] {
  if (!snapshot || typeof snapshot !== 'string') return [];
  let root: unknown;
  try {
    root = JSON.parse(snapshot);
  } catch {
    return [];
  }
  if (!isObject(root) || !isObject(root.blocks)) return [];

  const headings: DocumentHeading[] = [];

  const visit = (block: unknown) => {
    if (!isObject(block)) return;
    const flavour = typeof block.flavour === 'string' ? block.flavour : '';
    const props = isObject(block.props) ? block.props : {};
    const id = typeof block.id === 'string' ? block.id : `heading-${headings.length + 1}`;

    if (flavour === 'affine:page' && props.title) {
      const title = extractText(props.title).trim();
      if (title) {
        headings.push({ id, level: 1, text: title });
      }
    } else if (flavour === 'affine:paragraph' && typeof props.type === 'string') {
      const match = /^h([1-6])$/i.exec(props.type);
      if (match) {
        const level = parseInt(match[1], 10);
        const text = extractText(props.text).trim();
        if (text) {
          headings.push({ id, level, text });
        }
      }
    }

    if (Array.isArray(block.children)) {
      for (const child of block.children) {
        visit(child);
      }
    }
  };

  visit(root.blocks);
  return headings;
}

/**
 * Computes statistics for document words, characters, paragraphs and headings.
 */
export function calculateDocumentStats(plainText: string, snapshot?: string): DocumentStats {
  const text = (plainText || '').trim();
  const chars = text.length;
  // Split words by whitespace, filtering out punctuation-only tokens
  const words = text ? text.split(/\s+/u).filter(w => w.length > 0).length : 0;
  const paragraphs = text ? text.split(/\r?\n+/).filter(line => line.trim().length > 0).length : 0;
  const headings = snapshot ? extractDocumentHeadings(snapshot).length : 0;

  return { words, chars, paragraphs, headings };
}
