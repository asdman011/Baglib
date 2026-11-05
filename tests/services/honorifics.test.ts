import { test } from 'node:test';
import assert from 'node:assert/strict';
import { honorificExpansion } from '../../src/shared/honorifics';

const apply = (before: string) => { const hit = honorificExpansion(before); return hit ? before.slice(0, hit.from) + hit.text + before.slice(hit.to) : before; };

test('honorific triggers expand in place, and only where intended', () => {
  assert.equal(apply('قال النبي (ص)'), 'قال النبي ﷺ');
  assert.equal(apply('محمد(ص)'), 'محمدﷺ');
  assert.equal(apply('الله (ج)'), 'الله ﷻ');
  assert.equal(apply('عن عمر (رض)'), 'عن عمر رضي الله عنه');
  assert.equal(apply('عن عائشة (رضها)'), 'عن عائشة رضي الله عنها');
  assert.equal(apply('ابن تيمية (رح)'), 'ابن تيمية رحمه الله');
  assert.equal(apply('The Prophet PBUH '), 'The Prophet ﷺ ');
  assert.equal(apply('Allah SWT,'), 'Allah سبحانه وتعالى,');
  // Not yet finished, not upper case, or part of a longer word: left as typed.
  assert.equal(honorificExpansion('The Prophet PBUH'), null);
  assert.equal(honorificExpansion('pbuh '), null);
  assert.equal(honorificExpansion('SWTICH '), null);
  assert.equal(honorificExpansion('XSWT '), null);
  assert.equal(honorificExpansion('(ص'), null);
});
