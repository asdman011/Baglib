import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { translations } from '../../src/renderer/translations';

// The storage manager's labels went through `isRtl ? 'عربي' : 'English'` branches instead of translations.
test('storage manager has no hardcoded Arabic and its duplicate count covers every Arabic plural form', () => {
  const source = fs.readFileSync(path.resolve('src/renderer/components/library/StorageManagerModal.tsx'), 'utf8');
  assert.equal(/[؀-ۿ]/u.test(source), false, 'no Arabic literals');
  // Technical values such as 'rtl' or 'ar-EG' may still branch; prose (anything with a space) may not.
  assert.equal(/isRtl \? '[^']* [^']*'/u.test(source), false, 'no language-branch prose');
  const forms = ['storageDuplicateCluster_zero', 'storageDuplicateCluster_one', 'storageDuplicateCluster_two', 'storageDuplicateCluster_few', 'storageDuplicateCluster_many', 'storageDuplicateCluster_other'] as const;
  for (const key of forms) assert.ok(translations.ar[key] && translations.en[key], key);
  for (const n of [0, 1, 2, 3, 11, 100]) assert.ok(translations.ar[`storageDuplicateCluster_${new Intl.PluralRules('ar').select(n)}` as typeof forms[number]], String(n));
  assert.equal(translations.ar.storageDuplicateCluster_two, 'مجموعة مكررة: نسختان');
});
