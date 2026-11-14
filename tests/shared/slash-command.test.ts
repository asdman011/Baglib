import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SLASH_SCOPES, groupSlashResults, moveSelection, parseSlashCommand, suggestScopes } from '../../src/shared/slash-command';

describe('parseSlashCommand', () => {
  it('opens on a lone slash with nothing typed', () => {
    assert.deepEqual(parseSlashCommand('/'), { start: 0, scope: null, query: '', partialScope: '' });
  });

  it('reads a scope name and keeps the rest of the line as the query', () => {
    assert.deepEqual(parseSlashCommand('/quran 2:255'), { start: 0, scope: 'quran', query: '2:255', partialScope: '' });
  });

  it('is case-insensitive and trims only the start of the query', () => {
    assert.deepEqual(parseSlashCommand('/QURAN  الحمد'), { start: 0, scope: 'quran', query: 'الحمد', partialScope: '' });
  });

  it('matches an Arabic alias ignoring tashkeel', () => {
    assert.deepEqual(parseSlashCommand('/قُرآن بسم'), { start: 0, scope: 'quran', query: 'بسم', partialScope: '' });
  });

  it('reports a scope name that is still being typed as a partial scope', () => {
    assert.deepEqual(parseSlashCommand('/qur'), { start: 0, scope: null, query: 'qur', partialScope: 'qur' });
  });

  it('treats free text after the slash as a query, not a scope', () => {
    assert.deepEqual(parseSlashCommand('/الصلاة'), { start: 0, scope: null, query: 'الصلاة', partialScope: 'الصلاة' });
  });

  it('ignores a slash inside a word', () => {
    assert.equal(parseSlashCommand('a/b'), null);
  });

  it('finds a slash token in the middle of a line', () => {
    assert.deepEqual(parseSlashCommand('hello /sun'), { start: 6, scope: null, query: 'sun', partialScope: 'sun' });
  });

  it('returns null when a newline separates the slash from the caret', () => {
    assert.equal(parseSlashCommand('/quran\n2:255'), null);
  });
});

describe('suggestScopes', () => {
  it('offers every scope for an empty partial', () => {
    assert.deepEqual(suggestScopes(''), [...SLASH_SCOPES]);
  });

  it('matches on Latin prefixes', () => {
    assert.deepEqual(suggestScopes('s'), ['sunnah']);
  });

  it('matches on Arabic aliases without tashkeel', () => {
    assert.deepEqual(suggestScopes('ك'), ['books']);
    assert.deepEqual(suggestScopes('القُر'), ['quran']);
  });
});

describe('groupSlashResults', () => {
  const results = [
    { id: 'n1', scope: 'notes' as const, score: 3 },
    { id: 'q1', scope: 'quran' as const, score: 1 },
    { id: 'q2', scope: 'quran' as const, score: 5 },
    { id: 'n2', scope: 'notes' as const, score: 3 },
    { id: 'q3', scope: 'quran' as const, score: 1 },
  ];

  it('groups in menu order, best score first, keeping equal scores stable', () => {
    const grouped = groupSlashResults(results, 10);
    assert.deepEqual(grouped.map(group => group.scope), ['quran', 'notes']);
    assert.deepEqual(grouped[0]!.items.map(item => item.id), ['q2', 'q1', 'q3']);
    assert.deepEqual(grouped[1]!.items.map(item => item.id), ['n1', 'n2']);
  });

  it('caps each group and omits empty scopes', () => {
    const grouped = groupSlashResults(results, 2);
    assert.deepEqual(grouped, [
      { scope: 'quran', items: [results[2], results[1]] },
      { scope: 'notes', items: [results[0], results[3]] },
    ]);
  });
});

describe('moveSelection', () => {
  it('wraps forwards and backwards', () => {
    assert.equal(moveSelection(0, 1, 3), 1);
    assert.equal(moveSelection(2, 1, 3), 0);
    assert.equal(moveSelection(0, -1, 3), 2);
  });

  it('returns -1 for an empty list', () => {
    assert.equal(moveSelection(0, 1, 0), -1);
  });
});
