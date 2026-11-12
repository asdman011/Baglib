import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { translations, type TranslationKey } from '../../src/renderer/translations';
import { discardedArtifactCountLabel, pageCountLabel } from '../../src/renderer/utils/book-count';

test('Library UI language branches use centralized translations', () => {
  const directory = path.resolve('src/renderer/components/library');
  const files = fs.readdirSync(directory, { recursive: true }).filter(file => typeof file === 'string' && /\.tsx?$/u.test(file));
  const technicalPairs = new Set(['nameAr/nameEn', 'ar-EG/en-US', 'rtl/ltr']);
  const violations: string[] = [];
  for (const filename of files) {
    const fullPath = path.join(directory, String(filename));
    const source = ts.createSourceFile(fullPath, fs.readFileSync(fullPath, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (node: ts.Node) => {
      if (ts.isConditionalExpression(node) && /\blang\s*===\s*['"]ar['"]/u.test(node.condition.getText(source))) {
        const yes = node.whenTrue, no = node.whenFalse;
        if (ts.isStringLiteral(yes) && ts.isStringLiteral(no) && !technicalPairs.has(`${yes.text}/${no.text}`) ||
          ts.isTemplateExpression(yes) && ts.isTemplateExpression(no)) violations.push(`${filename}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    for (const match of source.text.matchAll(/\bt\(['"](\w+)['"]/gu)) {
      const key = match[1] as TranslationKey;
      assert.ok(translations.ar[key], `${filename} missing Arabic ${key}`);
      assert.ok(translations.en[key], `${filename} missing English ${key}`);
    }
  }
  assert.deepEqual(violations, []);
});

test('Library page and discarded-artifact counts cover every Arabic plural category', () => {
  const t = (language: 'ar' | 'en') => (key: TranslationKey, params?: Record<string, string | number>) => {
    let value: string = translations[language][key];
    for (const [name, replacement] of Object.entries(params ?? {})) value = value.replaceAll(`{${name}}`, String(replacement));
    return value;
  };
  const cases = [
    [0, 'لا صفحات', 'لا شوائب مستبعدة'],
    [1, 'صفحة واحدة', 'شائبة واحدة مستبعدة'],
    [2, 'صفحتان', 'شائبتان مستبعدتان'],
    [3, '٣ صفحات', '٣ شوائب مستبعدة'],
    [11, '١١ صفحة', '١١ شائبة مستبعدة'],
    [102, '١٠٢ صفحة', '١٠٢ شائبة مستبعدة'],
  ] as const;
  for (const [count, pages, discarded] of cases) {
    assert.equal(pageCountLabel(String(count), 'ar', t('ar')), pages);
    assert.equal(discardedArtifactCountLabel(count, 'ar', t('ar')), discarded);
  }
  assert.equal(pageCountLabel('١١', 'ar', t('ar')), '١١ صفحة');
  assert.equal(pageCountLabel('1', 'en', t('en')), '1 page');
  assert.equal(pageCountLabel('2', 'en', t('en')), '2 pages');
  assert.equal(pageCountLabel('xiv + 200', 'ar', t('ar')), 'عدد الصفحات xiv + 200');
  assert.equal(pageCountLabel('xiv + 200', 'en', t('en')), 'Pages xiv + 200');
});
