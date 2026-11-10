const assert = require('node:assert/strict');
function assertSavedAppearances(before, first, second) {
  for (const saved of [first, second]) {
    assert.deepEqual(saved.foreign, before.foreign, 'foreign annotation contents and streams preserved');
    assert.equal(saved.owned.length, 3);
    assert.equal(new Set(saved.owned.map(annotation => annotation.id)).size, 3);
    for (const annotation of saved.owned) {
      assert.equal(annotation.subtype, '/FreeText');
      assert.equal(annotation.appearance, true);
    }
  }
  assert.deepEqual(second.owned, first.owned, 'second save preserves annotation identities and appearances');
  assert.equal(second.fonts, first.fonts, 'second save adds no font objects');
}
module.exports = { assertSavedAppearances };
