import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translations } from '../../src/renderer/translations';
import { resolveStirlingOperation } from '../../src/shared/stirling-contract';
import { ADDITIONAL_FILES, STIRLING_TOOL_OPTIONS, applyToolOption, defaultToolValues, invalidToolOption, missingToolOption, optionVisible, toolParameters } from '../../src/renderer/components/pdf-workstation/stirling-tool-options';

const options = Object.values(STIRLING_TOOL_OPTIONS).flat();

test('every option label, hint and choice is translated in both languages', () => {
  const keys = options.flatMap(option => [option.label, ...(option.hint ? [option.hint] : []), ...(option.format ? [option.format.message] : []), ...(option.differsFrom ? [option.differsFrom.message] : []), ...(option.choices ?? []).map(choice => choice.label)]);
  keys.push('stirlingOptNoOptions', 'pdfPrivateKeyFormat', 'pdfAutoRedactUnverified', 'pdfPermissionsPasswordRequired', 'pdfWrongPassword');
  for (const key of new Set(keys)) {
    assert.ok(translations.en[key], `missing en ${key}`);
    assert.ok(translations.ar[key], `missing ar ${key}`);
  }
});

test('select defaults are real choices', () => {
  for (const option of options.filter(item => item.kind === 'select')) assert.ok(option.choices?.some(choice => choice.value === option.value), option.name);
});

test('required inputs are reported before the engine can refuse them', () => {
  assert.equal(missingToolOption('remove-pages', defaultToolValues('remove-pages'))?.name, 'pageNumbers');
  assert.equal(missingToolOption('remove-pages', { pageNumbers: '2' }), undefined);
  assert.equal(missingToolOption('merge', { [ADDITIONAL_FILES]: [] })?.name, ADDITIONAL_FILES);
  assert.equal(missingToolOption('reorder', { customMode: 'REVERSE_ORDER' }), undefined);
  assert.equal(missingToolOption('watermark', { watermarkType: 'image' })?.name, 'watermarkImage');
});

test('hidden options stay out of the request', () => {
  const parameters = toolParameters('crop', { ...defaultToolValues('crop'), autoCrop: true });
  assert.equal(parameters.x, undefined);
  assert.equal(toolParameters('crop', { ...defaultToolValues('crop'), autoCrop: false }).x, 0);
  assert.equal(toolParameters('merge', { [ADDITIONAL_FILES]: ['other.pdf'], sortType: 'orderProvided' })[ADDITIONAL_FILES], undefined);
});

test('options that share a field swap to their own default', () => {
  const values = defaultToolValues('split-by-size');
  assert.equal(values.splitValue, '10MB');
  assert.equal(applyToolOption('split-by-size', values, 'splitType', 1).splitValue, '10');
  assert.equal(applyToolOption('split-by-size', values, 'splitType', 2).splitValue, '2');
  assert.ok(STIRLING_TOOL_OPTIONS['split-by-size'].filter(option => optionVisible(option, { splitType: 1 })).length === 2);
});

test('special request shapes match the engine', () => {
  assert.deepEqual(toolParameters('ocr-pdf', { languages: 'ara,eng' }).languages, ['ara', 'eng']);
  assert.deepEqual(toolParameters('overlay-pdfs', { overlayMode: 'FixedRepeatOverlay', overlayPosition: 0, counts: '1, 2' }).counts, ['1', '2']);
  assert.equal(toolParameters('reorder', { customMode: 'REVERSE_ORDER' }).pageNumbers, 'all');
  assert.deepEqual(toolParameters('edit-metadata', { title: 'عنوان', deleteAll: false }), { title: 'عنوان', deleteAll: false, author: '', subject: '', keywords: '', creator: '', producer: '' });
});

test('page numbering sends the field the engine actually reads', () => {
  const parameters = toolParameters('add-page-numbers', { ...defaultToolValues('add-page-numbers'), pagesToNumber: '2n+1' });
  assert.equal(parameters.pagesToNumber, '2n+1');
  assert.equal(parameters.pageNumbers, undefined);
});

test('form-only choices never reach the engine', () => {
  for (const [id, name] of [['add-stamp', 'customPlacement'], ['auto-redact', 'redactPattern'], ['remove-password', 'removeMode'], ['compress-pdf', 'compressGoal']]) {
    assert.ok(STIRLING_TOOL_OPTIONS[id].some(option => option.name === name && option.local), name);
    assert.equal(toolParameters(id, { ...defaultToolValues(id), listOfText: 'x', password: 'x' })[name], undefined, name);
  }
});

test('stamps keep the engine position until an exact one is asked for', () => {
  const values = { ...defaultToolValues('add-stamp'), stampText: 'A' };
  assert.equal(toolParameters('add-stamp', values).overrideX, undefined);
  const exact = toolParameters('add-stamp', applyToolOption('add-stamp', values, 'customPlacement', true));
  assert.equal(exact.overrideX, 36);
  assert.equal(exact.position, undefined);
  assert.equal(resolveStirlingOperation('/api/v1/misc/add-stamp', {}).parameters.overrideX, -1);
});

test('a redaction preset sends its own expression as a regular expression', () => {
  const base = defaultToolValues('auto-redact');
  assert.equal(missingToolOption('auto-redact', base)?.name, 'listOfText');
  const values = applyToolOption('auto-redact', base, 'redactPattern', 'email');
  assert.equal(missingToolOption('auto-redact', values), undefined);
  const parameters = toolParameters('auto-redact', values);
  assert.equal(parameters.useRegex, true);
  assert.equal(parameters.wholeWordSearch, false);
  assert.match(String(parameters.listOfText), /@/u);
  assert.equal(parameters.convertPDFToImage, true);
});

test('each password removal mode sends what the engine needs', () => {
  const base = defaultToolValues('remove-password');
  assert.deepEqual(toolParameters('remove-password', { ...base, password: 'p' }), { password: 'p', removeAll: true });
  assert.deepEqual(toolParameters('remove-password', { ...base, removeMode: 'open', password: 'p' }), { password: 'p' });
  assert.deepEqual(toolParameters('remove-password', { removeMode: 'permissions', ownerPassword: 'o', retainedOpeningPassword: 'p' }), { ownerPassword: 'o', retainedOpeningPassword: 'p', sourcePassword: 'o' });
});

test('changing a mode clears a value that belonged to the old one', () => {
  const values = applyToolOption('remove-password', { ...defaultToolValues('remove-password'), password: 'secret' }, 'removeMode', 'open');
  assert.equal(values.password, '');
  const order = applyToolOption('reorder', applyToolOption('reorder', defaultToolValues('reorder'), 'customMode', 'DUPLICATE'), 'customMode', 'CUSTOM');
  assert.equal(order.pageNumbers, '');
});

test('repeating pages sends the copy count, while other modes send all', () => {
  assert.equal(toolParameters('reorder', applyToolOption('reorder', defaultToolValues('reorder'), 'customMode', 'DUPLICATE')).pageNumbers, 2);
  assert.equal(toolParameters('reorder', { customMode: 'ODD_EVEN_SPLIT' }).pageNumbers, 'all');
});

test('values the engine would silently lose are refused first', () => {
  assert.equal(invalidToolOption('edit-metadata', { creationDate: '03-02-2020' }), 'stirlingOptDateInvalid');
  assert.equal(invalidToolOption('edit-metadata', { creationDate: '2020/02/03 04:05:06' }), undefined);
  assert.equal(invalidToolOption('edit-metadata', {}), undefined);
  assert.equal(invalidToolOption('add-password', { password: 'same', ownerPassword: 'same' }), 'stirlingOptPasswordsMustDiffer');
  assert.equal(invalidToolOption('add-password', { password: 'one', ownerPassword: 'two' }), undefined);
  assert.equal(invalidToolOption('compress-pdf', { compressGoal: 'size', expectedOutputSize: 'small' }), 'stirlingOptTargetSizeInvalid');
  assert.equal(invalidToolOption('compress-pdf', { compressGoal: 'size', expectedOutputSize: '500KB' }), undefined);
});

test('a target size is not overridden by the default compression level', () => {
  assert.equal(resolveStirlingOperation('/api/v1/misc/compress-pdf', { expectedOutputSize: '500KB' }).parameters.optimizeLevel, undefined);
  assert.equal(resolveStirlingOperation('/api/v1/misc/compress-pdf', {}).parameters.optimizeLevel, 3);
});

test('signing always sends a password, because the engine reads it without a null check', () => {
  assert.equal(toolParameters('cert-sign', { ...defaultToolValues('cert-sign'), certType: 'PEM' }).password, '');
  assert.equal(toolParameters('cert-sign', { ...defaultToolValues('cert-sign'), password: 'secret' }).password, 'secret');
});
