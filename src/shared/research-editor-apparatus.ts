/** RE-6 projections: derived content never rewrites the canonical source or heading text. */
export interface ResearchSettings {
  citationStyle: 'arabic' | 'chicago' | 'apa';
  quranPlacement: 'inline' | 'footnote';
  footnoteNumbering: 'chapter' | 'page';
  headingNumbering: boolean;
}
export const defaultResearchSettings: ResearchSettings = { citationStyle: 'arabic', quranPlacement: 'footnote', footnoteNumbering: 'chapter', headingNumbering: false };
export function researchSettings(value: unknown): ResearchSettings {
  const v = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    citationStyle: v.citationStyle === 'apa' || v.citationStyle === 'chicago' ? v.citationStyle : 'arabic',
    quranPlacement: v.quranPlacement === 'inline' ? 'inline' : 'footnote',
    footnoteNumbering: v.footnoteNumbering === 'page' ? 'page' : 'chapter',
    headingNumbering: v.headingNumbering === true,
  };
}
/** Validate a partial update without filling defaults over existing preferences. */
export function validateResearchSettingsPatch(value: unknown): Partial<ResearchSettings> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid-request');
  const v = value as Record<string, unknown>;
  if (v.citationStyle !== undefined && !['arabic', 'chicago', 'apa'].includes(v.citationStyle as string)) throw new Error('invalid-request');
  if (v.quranPlacement !== undefined && !['inline', 'footnote'].includes(v.quranPlacement as string)) throw new Error('invalid-request');
  if (v.footnoteNumbering !== undefined && !['chapter', 'page'].includes(v.footnoteNumbering as string)) throw new Error('invalid-request');
  if (v.headingNumbering !== undefined && typeof v.headingNumbering !== 'boolean') throw new Error('invalid-request');
  const result: Partial<ResearchSettings> = {};
  for (const key of ['citationStyle', 'quranPlacement', 'footnoteNumbering', 'headingNumbering'] as const) {
    if (v[key] !== undefined) Object.assign(result, { [key]: v[key] });
  }
  if (!Object.keys(result).length) throw new Error('invalid-request');
  return result;
}
export function validateResearchSettings(value: unknown): ResearchSettings {
  const patch = validateResearchSettingsPatch(value);
  if (patch.citationStyle === undefined || patch.quranPlacement === undefined || patch.footnoteNumbering === undefined || patch.headingNumbering === undefined) throw new Error('invalid-request');
  return researchSettings(patch);
}
export interface ResearchFootnote { label: string; reference: { type: string; url?: string; title?: string; description?: string } }
export interface ApparatusDelta { insert: string; attributes?: { footnote?: ResearchFootnote; [key: string]: unknown } }
export interface ApparatusBlock { id: string; flavour: string; props: Record<string, unknown>; children: ApparatusBlock[] }
export const isBaglibCitation = (note: ResearchFootnote): boolean => note.reference.type === 'url' && /^(quran|sunnah|poetry|book):\S+$/u.test(note.reference.url ?? '');
export function apparatusDeltas(value: unknown): ApparatusDelta[] {
  if (!value || typeof value !== 'object') return [];
  const text = value as { delta?: ApparatusDelta[]; toDelta?: () => ApparatusDelta[] };
  return text.toDelta?.() ?? text.delta ?? [];
}
export interface CitationEntry { key: string; blockId: string; offset: number; note: ResearchFootnote; number: number | null }
export interface HeadingEntry { id: string; title: string; level: number; number: string }
export function deriveApparatus(root: ApparatusBlock | null, settings: ResearchSettings) {
  const citations: CitationEntry[] = [], headings: HeadingEntry[] = [];
  const counters = [0, 0, 0, 0, 0, 0]; let ordinal = 0;
  function visit(block: ApparatusBlock) {
    if (block.flavour === 'affine:surface') return; // Page content only; never double-count canvas elements.
    const deltas = apparatusDeltas(block.props.text);
    const level = block.flavour === 'affine:paragraph' && /^h[1-6]$/u.test(String(block.props.type)) ? Number(String(block.props.type).slice(1)) : 0;
    if (level) {
      counters[level - 1]++; counters.fill(0, level);
      const number = counters.slice(0, level).map(n => n || 1).join('.');
      headings.push({ id: block.id, level, number, title: deltas.filter(d => !d.attributes?.footnote).map(d => d.insert).join('') });
    }
    let offset = 0;
    for (const delta of deltas) {
      const note = delta.attributes?.footnote;
      if (note && isBaglibCitation(note)) {
        const inline = settings.quranPlacement === 'inline' && note.reference.url?.startsWith('quran:');
        citations.push({ key: block.id + ':' + offset, blockId: block.id, offset, note, number: inline ? null : ++ordinal });
      }
      offset += typeof delta.insert === 'string' ? delta.insert.length : 1;
    }
    block.children.forEach(visit);
  }
  if (root) visit(root);
  const bibliography = [...new Map(citations.map(c => [c.note.reference.url!, c.note])).values()];
  return { citations, bibliography, headings };
}
export function readableCitation(note: ResearchFootnote): string {
  const url = note.reference.url ?? '';
  return [note.reference.title || url, ...(note.reference.title ? [url] : [])].join(' — ');
}
/** Source metadata is deliberately bounded by what the supplied reference actually contains. */
export function bibliographyCitation(note: ResearchFootnote, style: ResearchSettings['citationStyle'], noDate: string): string {
  const title = note.reference.title || note.reference.url || '';
  const url = note.reference.url ?? '';
  if (style === 'apa') return `${title}. (${noDate}). ${url}`;
  if (style === 'chicago') return `“${title}.” ${url}.`;
  return readableCitation(note);
}
export const headingAnchor = (id: string) => 'baglib-heading-' + encodeURIComponent(id);
export const footnoteAnchor = (key: string) => 'baglib-footnote-' + encodeURIComponent(key);
