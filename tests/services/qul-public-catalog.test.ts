import { test } from 'node:test';
import assert from 'node:assert/strict';
import snapshot from '../../src/shared/data/qul-public-catalog.json';
import { parseResourceDetails, parseResourceListing } from '../../src/main/services/quran/qul-catalog';
import { selectedExport } from '../../src/main/services/quran/resource-download';
import { presetResource } from '../../src/main/services/quran/reader-resources';
import { quranResourceBundles, quranResourceDependencies, quranResourceGuidance } from '../../src/shared/quran-resource-guidance';
import { QURAN_CATEGORIES } from '../../src/shared/types/quran';
import { localResourceCandidates } from '../../src/main/services/quran/local-resources';
import path from 'node:path';

test('scraped offline catalog covers every category without storing credentials or ephemeral export tokens', () => {
  assert.equal(snapshot.resources.length, 546);
  assert.deepEqual(Object.keys(snapshot.counts).sort(), [...QURAN_CATEGORIES].sort());
  assert.equal(new Set(snapshot.resources.map(resource => resource.id)).size, snapshot.resources.length);
  const encoded = JSON.stringify(snapshot);
  for (const sensitive of ['authenticity_token', 'user[password]', 'user[email]', '/download', 'X-Amz-Signature']) assert.ok(!encoded.includes(sensitive));
  assert.ok(snapshot.resources.filter(resource => resource.formats.some(format => /sqlite|\.db/i.test(format))).length > 500);
});

test('logged-out format buttons preserve advertised SQLite formats but do not become actionable export links', () => {
  const html = '<body><ul><li><h3><a href="/resources/translation/193">Saheeh International</a></h3><a href="/tags/english">English</a><a href="#_" data-controller="ajax-modal" data-url="/users/sign_in?modal=true">Download translation-with-inline-footnote.sqlite</a></li></ul></body>';
  const resource = parseResourceListing(html, 'translation')[0];
  assert.equal(resource.downloadAccess, 'sign-in-required');
  assert.deepEqual(resource.tags, ['English']);
  assert.ok(resource.formats[0].includes('sqlite'));
  const details = parseResourceDetails(html, resource);
  assert.equal(details.downloads.length, 0);
  assert.equal(details.resource.downloadAccess, 'sign-in-required');
  assert.throws(() => selectedExport(html, resource), /authentication-required/);
  assert.throws(() => selectedExport(html.replace('<body>', '<body>This resource is copyrighted'), resource), /restricted/);
});

test('known companion dependencies terminate, remain deduplicated and do not join Warsh to Hafs annotations', () => {
  const warsh = quranResourceDependencies(['quran-script/qpc-warsh-script-wbw']);
  assert.deepEqual(warsh.sort(), ['quran-script/qpc-warsh-script-wbw', 'font/qpc-warsh-font', 'mushaf-layout/569'].sort());
  const glyphs = quranResourceDependencies(['quran-script/47']);
  for (const id of ['font/240', 'mushaf-layout/19', 'quran-script/312']) assert.ok(glyphs.includes(id));
  assert.equal(glyphs.length, new Set(glyphs).size);
  for (const bundle of quranResourceBundles) assert.ok(quranResourceDependencies([...bundle.resources]).length >= bundle.resources.length);
  const unknown = { ...presetResource('translation/193'), id: 'translation/unknown', tags: ['Hafs'] };
  assert.equal(quranResourceGuidance(unknown).supported, false);
  assert.equal(quranResourceGuidance(unknown).profile, 'unverified');
  assert.ok(quranResourceGuidance(presetResource('translation/193')).features.includes('footnotes'));
  assert.equal(quranResourceGuidance(presetResource('recitation/957')).audioMetadataOnly, true);
});

test('additional supplied metadata can install locally without claiming reader support or accepting arbitrary paths', () => {
  const root = path.resolve('repos/Quran/QUL Developer Resources');
  assert.ok(localResourceCandidates('quran-metadata/69', root)[0].endsWith('quran-metadata-ayah.sqlite.zip'));
  assert.ok(localResourceCandidates('morphology/481', root)[0].endsWith('ayah-stem.db.zip'));
  assert.equal(quranResourceGuidance({id:'quran-metadata/69',formats:['SQLite']}).supported,false);
  assert.deepEqual(localResourceCandidates('../../private', root), []);
  assert.deepEqual(localResourceCandidates('__proto__', root), []);
  assert.equal(localResourceCandidates('font/240', root).length, 2);
  for(const candidate of localResourceCandidates('mushaf-layout/569', root)) assert.ok(candidate.startsWith(root+path.sep));
});
