import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildKnowledgeGraph, connectionCount, graphNodeFor, localGraph } from '../../src/shared/knowledge-graph';

const notes = [
  { id: 'a', title: 'الصبر', content: 'الصبر ضياء [[quran:hafs:2:153|2:153]] [[book:b1#p=4|رياض (4)]] [[note:b#^p1|فقرة]]', tags: ['أخلاق'] },
  { id: 'b', title: 'Gratitude', content: 'See [[book:b1#p=9|رياض (9)]] ![[sunnah:Bukhari:1:Bukhari:1:1|البخاري 1]] [[poetry:ashaar:7:0:1|شعر]] [[media:11111111-1111-1111-1111-111111111111:42|درس · 0:42]]', tags: ['أخلاق'] },
  { id: 'c', title: 'Alone', content: 'No links here', tags: [] },
];

test('graph nodes fold pages into books, paragraphs into notes and lecture moments into lectures', () => {
  assert.deepEqual(graphNodeFor('book:b1#p=4', 'رياض (4)'), { id: 'book:b1', kind: 'book', label: 'رياض', target: 'book:b1' });
  assert.equal(graphNodeFor('note:b#^p1', 'x')?.id, 'note:b');
  assert.equal(graphNodeFor('quran:hafs:2:255-257', '2:255-257')?.id, 'quran:2:255-257');
  assert.equal(graphNodeFor('media:11111111-1111-1111-1111-111111111111:42', 'درس · 0:42')?.label, 'درس');
  assert.equal(graphNodeFor('poetry:ashaar:7:0:1', 'شعر')?.id, 'poetry:7');
  assert.equal(graphNodeFor('nothing', 'x'), null);
});

test('the library graph links notes to what they cite and to their tags, without duplicates', () => {
  const graph = buildKnowledgeGraph(notes, { books: new Map([['b1', 'رياض الصالحين']]) });
  const ids = graph.nodes.map(node => node.id).sort();
  assert.deepEqual(ids, ['book:b1', 'media:11111111-1111-1111-1111-111111111111', 'note:a', 'note:b', 'note:c', 'poetry:7', 'quran:2:153', 'sunnah:Bukhari:1:Bukhari:1:1', 'tag:أخلاق'].sort());
  assert.equal(graph.nodes.find(node => node.id === 'book:b1')?.label, 'رياض الصالحين');
  assert.equal(graph.nodes.find(node => node.id === 'note:b')?.label, 'Gratitude', 'a note keeps its own title, not a link label');
  assert.equal(graph.edges.filter(edge => edge.kind === 'tag').length, 2);
  assert.equal(graph.edges.find(edge => edge.target === 'sunnah:Bukhari:1:Bukhari:1:1')?.kind, 'embed');
  assert.equal(connectionCount(graph, 'note:c'), 0);
  assert.equal(connectionCount(graph, 'book:b1'), 2);
});

test('the local graph is a note and its neighbours', () => {
  const graph = buildKnowledgeGraph(notes);
  const local = localGraph(graph, 'note:a');
  assert.deepEqual(local.nodes.map(node => node.id).sort(), ['book:b1', 'note:a', 'note:b', 'quran:2:153', 'tag:أخلاق'].sort());
  assert.ok(local.edges.every(edge => local.nodes.some(node => node.id === edge.source) && local.nodes.some(node => node.id === edge.target)));
  assert.deepEqual(localGraph(graph, 'note:c').nodes.map(node => node.id), ['note:c']);
});

test('the relationship filter keeps only the chosen lines and the note the map is about', async () => {
  const { filterByRelations, graphRelations } = await import('../../src/shared/knowledge-graph');
  const graph = buildKnowledgeGraph([
    { id: 'a', title: 'A', content: '[[supports::note:b|B]] [[refutes::note:c|C]] [[note:d|D]] [[supports::quran:hafs:1:1|1:1]]', tags: ['t'] },
    { id: 'b', title: 'B', content: '', tags: [] }, { id: 'c', title: 'C', content: '', tags: [] }, { id: 'd', title: 'D', content: '', tags: [] },
  ]);
  assert.deepEqual(graphRelations(graph), [{ relation: 'supports', count: 2 }, { relation: 'refutes', count: 1 }]);
  const supports = filterByRelations(graph, new Set(['supports']), 'note:a');
  assert.deepEqual(supports.nodes.map(node => node.id).sort(), ['note:a', 'note:b', 'quran:1:1']);
  assert.ok(supports.edges.every(edge => edge.relation === 'supports'));
  assert.equal(filterByRelations(graph, new Set(['supports', 'refutes'])).edges.length, 3);
  assert.equal(filterByRelations(graph, new Set()), graph);
  assert.deepEqual(filterByRelations(graph, new Set(['answers']), 'note:d').nodes.map(node => node.id), ['note:d']);
});
