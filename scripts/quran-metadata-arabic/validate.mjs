import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';

export function visibleText(value) {
  return parseHTML(`<!doctype html><html><body>${value}</body></html>`).document.body.textContent || '';
}

export function latinText(value, preservedTechnical = []) {
  let text = visibleText(value).replace(/(?:https?:\/\/|www\.)[^\s<>]+/g, '');
  for (const fragment of preservedTechnical) text = text.replaceAll(fragment, '');
  return /[A-Za-z]/.test(text);
}

const tags = value => value.match(/<!--[\s\S]*?-->|<\/?[A-Za-z][^>]*>/g) || [];

export function reviewScope(issue, directoryRows, batchRows, allowedFields) {
  const rows = Array.isArray(issue.rowid) ? issue.rowid : Number.isInteger(issue.rowid) ? [issue.rowid] : Array.isArray(issue.rowids) ? issue.rowids : Array.isArray(issue.files) ? issue.files.flatMap(file => batchRows[file] || []) : batchRows[issue.file] || directoryRows;
  const fields = (Array.isArray(issue.fields) ? issue.fields : String(issue.field || '').split(/[;,]/)).map(field => field.trim()).filter(field => allowedFields.includes(field));
  return { rows: [...new Set(rows)].sort((first, second) => first - second), fields: fields.length ? fields : [...allowedFields] };
}

export function reviewValue(scope, translations) {
  if (scope.rows.length === 1 && scope.fields.length === 1) return translations.get(scope.rows[0])?.[scope.fields[0]];
  return JSON.stringify(scope.rows.flatMap(rowid => scope.fields.map(field => ({ rowid, field, value: translations.get(rowid)?.[field] }))));
}

export function validateRow(source, target, definition, canonical, surahNames) {
  const issues = [];
  const fail = (field, issue) => issues.push({ rowid: source._rowid, field, issue });
  if (!target || typeof target !== 'object' || Array.isArray(target)) return [{ rowid: source._rowid, issue: 'missing-row' }];
  try { assert.deepEqual(Object.keys(target).sort(), Object.keys(source).sort()); } catch { fail('*', 'changed-object-keys'); }
  for (const [field, original] of Object.entries(source)) {
    const translated = target[field];
    if (!definition.fields.includes(field) || typeof original !== 'string' || !original || !latinText(original)) {
      if (translated !== original) fail(field, 'immutable-value-changed');
      continue;
    }
    if (typeof translated !== 'string' || !translated.trim()) { fail(field, 'missing-translation'); continue; }
    const sourceRegexArtifact = 'v?v?\\.?\\s*[0-9]+\\s*-\\s*[0-9]+';
    const preservedTechnical = definition.group === 'surahs' && source._rowid === 19 && field === 'text' && original.includes(sourceRegexArtifact) ? [sourceRegexArtifact] : [];
    if (latinText(translated, preservedTechnical)) fail(field, 'untranslated-latin-text');
    try { assert.deepEqual(tags(translated), tags(original)); } catch { fail(field, 'html-markup-changed'); }
    const originalSegments = original.split(/<!--[\s\S]*?-->|<\/?[A-Za-z][^>]*>/g);
    const translatedSegments = translated.split(/<!--[\s\S]*?-->|<\/?[A-Za-z][^>]*>/g);
    for (let index = 0; index < originalSegments.length; index++) {
      const segment = originalSegments[index];
      if (/[\u0600-\u06ff]/.test(segment) && !latinText(segment) && translatedSegments[index] !== segment) fail(field, 'existing-arabic-segment-changed');
    }
    for (const fragment of new Set(original.match(/[\u0600-\u06ff]+/g) || [])) if (!translated.includes(fragment)) fail(field, `existing-arabic-changed:${fragment}`);
    if (field === 'name' && source.arabic_name && translated !== source.arabic_name) fail(field, 'existing-arabic-name-not-reused');
    if (field === 'surah_name' && surahNames?.[source.surah_number] && translated !== surahNames[source.surah_number]) fail(field, 'canonical-surah-name-mismatch');
    if (field === 'keywords' && (original.match(/,/g) || []).length !== (translated.match(/,/g) || []).length) fail(field, 'keyword-delimiters-changed');
    for (const quote of translated.matchAll(/﴿([\s\S]*?)﴾/g)) {
      const words = quote[1].trim().replace(/\s+/g, ' ');
      if (!words || !canonical.includes(words)) fail(field, 'unverified-quran-quotation');
    }
    if (/UNRESOLVED|TODO|PENDING|⟦|⟧/i.test(translated)) fail(field, 'unresolved-placeholder');
  }
  return issues;
}
