import { test } from 'node:test';
import assert from 'node:assert/strict';
import { poetryDescriptionText } from '../../src/shared/poetry';

test('description display decodes nonbreaking spaces without rewriting source or verse text', () => {
  const source = { text: 'شرح&nbsp;القصيدة', children: ['A&#160;B', 'C&#xA0;D'] };
  assert.equal(poetryDescriptionText(source), 'شرح\u00a0القصيدة\nA\u00a0B\nC\u00a0D');
  assert.equal(source.text, 'شرح&nbsp;القصيدة');
  assert.equal(poetryDescriptionText('<script>text</script> &unknown;'), '<script>text</script> &unknown;');
});
