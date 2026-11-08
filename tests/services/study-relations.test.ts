import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchingStudyRelations, studyBacklinks, studyLinkText, studyLinks, studyRelation } from '../../src/shared/study-notes';
import { openStudyLink, withRelation } from '../../src/shared/study-link-completion';
import { buildKnowledgeGraph } from '../../src/shared/knowledge-graph';
import { exportNoteBody } from '../../src/shared/markdown-export';

test('a relationship is written inside the link text, in English or Arabic', () => {
  const [english, arabic, coined, plain, unknownTarget] = studyLinks('[[supports::note:a|A]] [[يُؤَيِّد::quran:hafs:2:153|2:153]] [[شاهد::book:b1#p=4|ب (4)]] [[note:a|A]] [[supports::nothing|x]]');
  assert.deepEqual(english, { target: 'note:a', label: 'A', embed: false, start: 0, end: 22, relation: 'supports' });
  assert.equal(arabic.relation, 'supports', 'Arabic name with tashkeel maps to the same key');
  assert.equal(arabic.target, 'quran:hafs:2:153');
  assert.equal(coined.relation, 'شاهد', 'a coined word is kept as written');
  assert.equal(coined.target, 'book:b1#p=4');
  assert.equal(plain.relation, undefined);
  assert.equal(unknownTarget, undefined, 'an invalid target is still not a link');
  assert.equal(studyLinks('![[explains::note:a|A]]')[0].embed, true);
  assert.equal(studyLinks('[[two words::note:a|A]]').length, 0, 'a relationship is one word');
});

test('relationship names, link text and backlinks', () => {
  assert.equal(studyRelation('Refutes'), 'refutes');
  assert.equal(studyRelation('ينقض'), 'refutes');
  assert.equal(studyRelation('a b'), undefined);
  assert.deepEqual(matchingStudyRelations('ي').sort(), ['answers', 'contrasts', 'explains', 'questions', 'refutes', 'supports'].sort());
  assert.deepEqual(matchingStudyRelations('ex'), ['explains', 'example']);
  assert.equal(matchingStudyRelations('').length, 7);
  assert.equal(studyLinkText('note:a', 'A', false, 'يرد'), '[[refutes::note:a|A]]');
  assert.equal(studyBacklinks([{ id: 'x', title: '', content: '[[supports::note:a|A]]', aliases: [], tags: [], createdAt: '', updatedAt: '' }], 'note:a').length, 1);
});

test('completion after a typed relationship searches the target and keeps the relationship', () => {
  assert.deepEqual(openStudyLink('see [[supports::الصبر'), { from: 4, query: 'الصبر', relation: 'supports' });
  assert.deepEqual(openStudyLink('[[الصبر'), { from: 0, query: 'الصبر' });
  assert.equal(withRelation('[[note:a|A]]', 'supports'), '[[supports::note:a|A]]');
  assert.equal(withRelation('![[note:a|A]]', 'explains'), '![[explains::note:a|A]]');
  assert.equal(withRelation('[[note:a|A]]'), '[[note:a|A]]');
});

test('the graph names relationship lines and keeps their direction', () => {
  const graph = buildKnowledgeGraph([
    { id: 'a', title: 'A', content: '[[note:b|B]] [[supports::quran:hafs:2:153|2:153]]', tags: [] },
    { id: 'b', title: 'B', content: '[[refutes::note:a|A]]', tags: [] },
  ]);
  assert.deepEqual(graph.edges.find(edge => edge.target === 'quran:2:153'), { source: 'note:a', target: 'quran:2:153', kind: 'link', relation: 'supports' });
  assert.deepEqual(graph.edges.filter(edge => [edge.source, edge.target].sort().join() === 'note:a,note:b'), [{ source: 'note:b', target: 'note:a', kind: 'link', relation: 'refutes' }]);
});

test('Markdown export writes relationships as Dataview inline fields', () => {
  const names = new Map([['a', 'Alpha']]);
  assert.equal(exportNoteBody('x [[supports::note:a|A]] [[explains::quran:hafs:1:1|1:1]]', names), 'x [supports:: [[Alpha|A]]] [explains:: [1:1](<baglib:quran:hafs:1:1>)]');
});

test('paragraph search matches what is shown, not a relationship hidden in a link', async () => {
  const { paragraphOptions } = await import('../../src/shared/note-paragraphs');
  const notes = [{ id: 'n', title: 'N', content: 'A hadith [[supports::note:a|patience]]' }];
  assert.equal(paragraphOptions('sup', notes).length, 0);
  assert.equal(paragraphOptions('patience', notes).length, 1);
});

test('a written link can have its relationship set, changed or removed', async () => {
  const { withLinkRelation } = await import('../../src/shared/study-notes');
  assert.equal(withLinkRelation('[[note:a|A]]', 'supports'), '[[supports::note:a|A]]');
  assert.equal(withLinkRelation('[[supports::note:a|A]]', 'يرد'), '[[refutes::note:a|A]]');
  assert.equal(withLinkRelation('![[explains::note:a#^p1|A|B]]'), '![[note:a#^p1|A|B]]');
  assert.equal(withLinkRelation('[[quran:hafs:2:153]]', 'example'), '[[example::quran:hafs:2:153]]');
  assert.equal(withLinkRelation('[[nothing|x]]', 'supports'), null);
  assert.equal(withLinkRelation('plain text', 'supports'), null);
});
