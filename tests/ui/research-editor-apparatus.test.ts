import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveApparatus, researchSettings, validateResearchSettings, validateResearchSettingsPatch, readableCitation, bibliographyCitation, headingAnchor, type ApparatusBlock, type ResearchFootnote } from '../../src/shared/research-editor-apparatus';
import { researchEditorTranslations } from '../../src/shared/research-editor-i18n';
import { translations } from '../../src/renderer/translations';
const note = (scheme: string, label = scheme): ResearchFootnote => ({ label, reference: { type: 'url', url: scheme + ':source:1', title: 'عِلْم — Source ' + scheme, description: 'Original source text' } });
const paragraph = (id: string, type = 'text', notes: ResearchFootnote[] = []): ApparatusBlock => ({ id, flavour: 'affine:paragraph', props: { type, text: { delta: [{ insert: 'عِلْم — Heading ' }, ...notes.map(n => ({ insert: ' ', attributes: { footnote: n } }))] } }, children: [] });
const root = (...children: ApparatusBlock[]): ApparatusBlock => ({ id: 'root', flavour: 'affine:page', props: {}, children });
test('defaults are stable and invalid settings are rejected at the boundary', () => {
  assert.deepEqual(researchSettings(null), { citationStyle: 'arabic', quranPlacement: 'footnote', footnoteNumbering: 'chapter', headingNumbering: false });
  for (const value of [null, [], {}, { ...researchSettings({}), citationStyle: 'invented' }, { ...researchSettings({}), headingNumbering: 'yes' }]) assert.throws(() => validateResearchSettings(value), /invalid-request/);
  assert.deepEqual(validateResearchSettings(researchSettings({})), researchSettings({}));
});
test('all four schemes number in document order and renumber after deletion/reorder', () => {
  const nodes = ['quran', 'sunnah', 'poetry', 'book'].map((s, i) => paragraph(String(i), 'text', [note(s)]));
  const settings = researchSettings({});
  assert.deepEqual(deriveApparatus(root(...nodes), settings).citations.map(c => c.number), [1, 2, 3, 4]);
  assert.deepEqual(deriveApparatus(root(nodes[3], nodes[1]), settings).citations.map(c => [c.note.label, c.number]), [['book', 1], ['sunnah', 2]]);
});
test('partial settings validation never supplies replacement defaults', () => {
  assert.deepEqual(validateResearchSettingsPatch({ quranPlacement: 'inline' }), { quranPlacement: 'inline' });
  assert.deepEqual(validateResearchSettingsPatch({ linkedBoardId: null }), { linkedBoardId: null });
  for (const value of [{}, { unknown: true }, { headingNumbering: 'true' }, { citationStyle: ['apa'] }, { linkedBoardId: '../unsafe' }]) assert.throws(() => validateResearchSettingsPatch(value), /invalid-request/);
});
test('Quran inline placement excludes only Quran from the ordinal sequence', () => {
  const tree = root(paragraph('p', 'text', [note('quran'), note('book'), note('sunnah')]));
  const before = JSON.stringify(tree);
  const data = deriveApparatus(tree, researchSettings({ quranPlacement: 'inline' }));
  assert.deepEqual(data.citations.map(c => c.number), [null, 1, 2]);
  assert.equal(data.bibliography.length, 3);
  assert.equal(JSON.stringify(tree), before, 'canonical source and attributes unchanged');
});
test('bibliography deduplicates the exact canonical reference and updates after edits', () => {
  const tree = root(paragraph('a', 'text', [note('book'), note('book', 'second'), note('poetry')]));
  assert.equal(deriveApparatus(tree, researchSettings({})).bibliography.length, 2);
  tree.children[0] = paragraph('a');
  assert.deepEqual(deriveApparatus(tree, researchSettings({})).bibliography, []);
});
test('headings preserve mixed scripts and follow nested document order', () => {
  const h1 = paragraph('h1', 'h1'), h2 = paragraph('h2', 'h2'), h3 = paragraph('h3', 'h3'), next = paragraph('next', 'h1');
  h2.children.push(h3); h1.children.push(h2);
  assert.deepEqual(deriveApparatus(root(h1, next), researchSettings({})).headings.map(h => [h.id, h.number, h.title]), [['h1', '1', 'عِلْم — Heading '], ['h2', '1.1', 'عِلْم — Heading '], ['h3', '1.1.1', 'عِلْم — Heading '], ['next', '2', 'عِلْم — Heading ']]);
  assert.equal(headingAnchor('عِلْم"<'), 'baglib-heading-' + encodeURIComponent('عِلْم"<'));
});
test('headings with missing parent levels retain a deterministic number', () => {
  assert.deepEqual(deriveApparatus(root(paragraph('a', 'h2'), paragraph('b', 'h2')), researchSettings({})).headings.map(h => h.number), ['1.1', '1.2']);
});
test('non-BagLib footnotes and canvas blocks do not corrupt scholarly projections', () => {
  const external = { label: 'external', reference: { type: 'url', url: 'https://example.test' } };
  const surface = root(paragraph('hidden', 'h1', [note('book')])); surface.flavour = 'affine:surface';
  const data = deriveApparatus(root(surface, paragraph('p', 'text', [external])), researchSettings({}));
  assert.deepEqual(data, { citations: [], bibliography: [], headings: [] });
});
for (const lang of ['ar', 'en'] as const) test(`centralized ${lang} labels and bounded citation styles`, () => {
  const t = researchEditorTranslations[lang], source = note('book');
  for (const [key, value] of Object.entries(t)) { assert.ok(value); assert.equal(translations[lang][key as keyof typeof t], value); }
  assert.equal(readableCitation(source), source.reference.title + ' — ' + source.reference.url);
  assert.equal(bibliographyCitation(source, 'arabic', t.reNoDate), readableCitation(source));
  assert.match(bibliographyCitation(source, 'apa', t.reNoDate), new RegExp('\\(' + t.reNoDate.replace('.', '\\.') + '\\)'));
  assert.ok(bibliographyCitation(source, 'chicago', t.reNoDate).startsWith('“'));
  assert.equal(readableCitation({ label: 'x', reference: { type: 'url', url: 'quran:hafs:2:255' } }), 'quran:hafs:2:255');
});
test('Unicode offsets follow Y.Text UTF-16 positions', () => {
  const block = paragraph('p'); block.props.text = { delta: [{ insert: '📖عِلم' }, { insert: ' ', attributes: { footnote: note('book') } }] };
  assert.equal(deriveApparatus(root(block), researchSettings({})).citations[0].key, 'p:' + '📖عِلم'.length);
});
for (const footnoteNumbering of ['chapter', 'page']) test(`each chapter restarts numbering with the ${footnoteNumbering} preference`, () => {
  const settings = researchSettings({ footnoteNumbering });
  assert.deepEqual(deriveApparatus(root(paragraph('chapter-a', 'text', [note('book'), note('quran')])), settings).citations.map(c => c.number), [1, 2]);
  assert.deepEqual(deriveApparatus(root(paragraph('chapter-b', 'text', [note('poetry')])), settings).citations.map(c => c.number), [1]);
});
