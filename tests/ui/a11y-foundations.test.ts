import { QuranAyahInspector } from '../../src/renderer/components/quran/QuranAyahInspector';
import { QuranSimilarAyahsDrawer } from '../../src/renderer/components/quran/QuranSimilarAyahsDrawer';
import ts from 'typescript';
import { readdirSync } from 'node:fs';
import path from 'node:path';
﻿import { test } from 'node:test';
import assert from 'node:assert/strict';
import React, { act, useLayoutEffect, createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseHTML } from 'linkedom';
import { readFileSync } from 'node:fs';
import { WorkspaceProvider } from '../../src/renderer/components/context/WorkspaceContext';
import { Modal } from '../../src/renderer/components/ui/Modal';
import { Sheet } from '../../src/renderer/components/ui/Sheet';
import { ShortcutList } from '../../src/renderer/components/actions/ShortcutList';
import { SHORTCUTS, SHORTCUT_SCOPES, shortcutCollisions, shortcutForEvent, shortcutHint } from '../../src/renderer/components/actions/shortcuts';
import { translations } from '../../src/renderer/translations';

test('KEY-298 registry has unique keys in every overlapping scope and complete ar/en labels', () => {
  assert.equal(new Set(SHORTCUTS.map(shortcut => shortcut.id)).size, SHORTCUTS.length);
  assert.deepEqual(shortcutCollisions(SHORTCUTS), []);
  for (const shortcut of SHORTCUTS) {
    for (const scope of shortcut.scopes) assert.ok(SHORTCUT_SCOPES[scope], scope);
    for (const lang of ['ar', 'en'] as const) assert.ok(translations[lang][shortcut.labelKey].trim(), shortcut.id);
  }
  assert.equal(shortcutHint('ocr-next'), 'J / N / ENTER');
  assert.equal(shortcutHint('compare-next'), 'F3 / N');
  const first = SHORTCUTS[0];
  assert.deepEqual(shortcutCollisions([first, { ...first, id: 'duplicate' }]), ['palette/duplicate']);
});

test('KEY-298 both localized shortcut lists contain every registry entry under every declared scope', () => {
  for (const lang of ['ar', 'en'] as const) {
    const markup = renderToStaticMarkup(h(ShortcutList, { t: key => translations[lang][key] }));
    const { document } = parseHTML(markup);
    for (const [scope, label] of Object.entries(SHORTCUT_SCOPES)) {
      const section = document.querySelector(`[data-shortcut-scope="${scope}"]`)!;
      assert.ok(section.textContent?.includes(translations[lang][label]));
      assert.deepEqual([...section.querySelectorAll('[data-shortcut-id]')].map(element => element.getAttribute('data-shortcut-id')), SHORTCUTS.filter(shortcut => shortcut.scopes.includes(scope)).map(shortcut => shortcut.id));
    }
  }
});

test('KEY-298 question-mark help works in all workspaces and stays suppressed during text entry', () => {
  for (const scope of ['library', ...Object.keys(SHORTCUT_SCOPES)]) {
    for (const key of ['?', '\u061f']) assert.equal(shortcutForEvent({ key, shiftKey: true }, scope)?.id, 'help');
    for (const tagName of ['INPUT', 'TEXTAREA']) assert.equal(shortcutForEvent({ key: '?', target: { tagName } }, scope), null);
    assert.equal(shortcutForEvent({ key: '?', target: { isContentEditable: true } }, scope), null);
  }
});

function setup() {
  const { window } = parseHTML('<html><body><button id="opener">open</button><div id="root"></div></body></html>');
  Object.assign(globalThis, { window, document: window.document, HTMLElement: window.HTMLElement, React, IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(globalThis, 'getComputedStyle', { configurable: true, value: (element: HTMLElement) => ({ visibility: element.style.visibility || 'visible' }) });
  Object.defineProperty(window.HTMLElement.prototype, 'tabIndex', { configurable: true, get() { const value = this.getAttribute('tabindex'); return value === null ? (/^(BUTTON|INPUT|SELECT|TEXTAREA|A)$/.test(this.tagName) ? 0 : -1) : Number(value); } });
  window.HTMLElement.prototype.getClientRects = function () { return this.closest('[hidden]') ? [] : [{}]; };
  window.HTMLElement.prototype.focus = function () { window.document.activeElement = this; this.dispatchEvent(new window.Event('focusin', { bubbles: true })); };
  window.electronAPI = { getAllBooks: async () => [], getAllNotes: async () => [], getCategoryTree: async () => [], studyNotes: { list: async () => [], onChanged: () => () => {} }, knowledge: { getAll: async () => [] } };
  const opener = window.document.getElementById('opener') as HTMLButtonElement;
  opener.focus();
  const container = window.document.getElementById('root')!;
  const root = createRoot(container);
  const render = async (children: React.ReactNode) => { await act(async () => root.render(h(WorkspaceProvider, null, children))); };
  const key = async (value: string, shiftKey = false) => {
    const event = new window.Event('keydown', { bubbles: true, cancelable: true });
    Object.assign(event, { key: value, shiftKey });
    await act(async () => { window.dispatchEvent(event); });
    return event;
  };
  const unmount = async () => { await act(async () => root.unmount()); };
  return { window, container, opener, render, key, unmount };
}

test('KEY-298 Modal and Sheet share a topmost stack, preserve layout and return nested focus', async () => {
  const dom = setup();
  let parentCloses = 0;
  let childCloses = 0;
  const content = (child: boolean) => h(Modal, { open: true, onClose: () => parentCloses++, asChild: true, label: 'parent' },
    h('div', { className: 'existing-panel', 'data-original': 'yes' }, h('button', { id: 'first' }, 'first'), h('button', { id: 'last' }, 'last'),
      child && h(Sheet, { open: true, onClose: () => childCloses++, title: 'child' }, h('button', { id: 'child' }, 'child'))));
  await dom.render(content(false));
  assert.equal(dom.container.querySelector('[role=dialog]')?.className, 'existing-panel');
  const first = document.getElementById('first')!;
  const last = document.getElementById('last')!;
  assert.equal(document.activeElement, first);
  await act(async () => last.focus()); await dom.key('Tab'); assert.equal(document.activeElement, first);
  await dom.key('Tab', true); assert.equal(document.activeElement, last);
  await dom.render(content(true));
  const child = dom.container.querySelector('[data-ui-dialog=sheet]')!;
  assert.ok(child.contains(document.activeElement));
  await dom.key('Escape'); assert.equal(childCloses, 1); assert.equal(parentCloses, 0);
  await dom.render(content(false)); assert.equal(document.activeElement, last);
  await dom.key('Escape'); assert.equal(parentCloses, 1);
  await dom.unmount(); assert.equal(document.activeElement, dom.opener);
});

test('KEY-298 traps skip hidden/disabled/inert controls, contain forced focus and preserve focus on rerender', async () => {
  const dom = setup();
  let closes = 0;
  const content = (close: () => void) => h(Modal, { open: true, asChild: true, onClose: close, label: 'panel' }, h('div', null,
    h('button', { hidden: true }, 'hidden'), h('button', { disabled: true }, 'disabled'), h('div', { inert: true }, h('button', null, 'inert')),
    h('button', { id: 'one' }, 'one'), h('button', { id: 'two' }, 'two')));
  await dom.render(content(() => { closes = 1; }));
  const one = document.getElementById('one')!;
  const two = document.getElementById('two')!;
  assert.equal(document.activeElement, one);
  await act(async () => two.focus());
  await dom.render(content(() => { closes = 2; })); assert.equal(document.activeElement, two);
  await act(async () => dom.opener.focus()); assert.equal(document.activeElement, one);
  await dom.key('Escape'); assert.equal(closes, 2);
  await dom.unmount();
});

test('KEY-298 empty panels retain Tab focus and use their latest guarded close callback', async () => {
  const dom = setup();
  let busy = true;
  let closed = false;
  const content = () => h(Modal, { open: true, onClose: () => { if (!busy) closed = true; }, asChild: true, label: 'empty' }, h('div'));
  await dom.render(content());
  const panel = dom.container.querySelector('[role=dialog]');
  assert.equal(document.activeElement, panel);
  assert.equal((await dom.key('Tab')).defaultPrevented, true);
  await dom.key('Escape'); assert.equal(closed, false);
  busy = false; await dom.render(content()); await dom.key('Escape'); assert.equal(closed, true);
  await dom.unmount();
});

test('KEY-298 global focus-visible rule uses the focus token across legacy controls', () => {
  const css = readFileSync('src/renderer/app/globals.css', 'utf8');
  assert.match(css, /:where\(button,[^}]+:focus-visible\s*\{\s*outline: 2px solid var\(--color-focus\) !important;/);
});

function ChildAutofocus() {
  useLayoutEffect(() => { document.getElementById('child-autofocus')?.focus(); }, []);
  return h('button', { id: 'child-autofocus' }, 'autoFocus');
}

test('KEY-298 returns to the opener when a child moves focus before the modal layout effect', async () => {
  const dom = setup();
  await dom.render(h(Modal, { open: true, onClose: () => {}, title: 'autofocus' }, h(ChildAutofocus)));
  assert.ok(dom.container.querySelector('[role=dialog]')?.contains(document.activeElement));
  await dom.unmount();
  assert.equal(document.activeElement, dom.opener);
});

test('KEY-298 asynchronous result dialogs return to an explicit opener after a busy control loses focus', async () => {
  const dom = setup();
  const returnFocus = { current: null as HTMLElement | null };
  const content = (child: boolean) => h(Modal, { open: true, onClose: () => {}, title: 'parent' },
    h('button', { id: 'scan' }, 'scan'),
    child && h(Modal, { open: true, onClose: () => {}, title: 'results', returnFocus }, h('button', null, 'close')));
  await dom.render(content(false));
  returnFocus.current = document.getElementById('scan');
  await act(async () => returnFocus.current?.focus());
  await act(async () => dom.container.querySelector<HTMLElement>('[role=dialog]')?.focus());
  await dom.render(content(true));
  await dom.render(content(false));
  assert.equal(document.activeElement, returnFocus.current);
  await dom.unmount();
});


test('KEY-298 Quran modal modes share containment and restore focus in ar and en', async () => {
  for (const lang of ['ar', 'en'] as const) {
    const dom = setup();
    const t = (key: keyof typeof translations.ar) => translations[lang][key];
    let closed = 0;
    await dom.render(h(QuranAyahInspector, { details: null, reference: { surah: 1, ayah: 1 }, surahName: 'KEY298', error: false, t, dir: lang === 'ar' ? 'rtl' : 'ltr', onClose: () => closed++, onCopy: () => {}, onStudy: () => {} }));
    const panel = dom.container.querySelector('[data-ui-dialog]')!;
    assert.ok(panel.contains(document.activeElement));
    await act(async () => dom.opener.focus());
    assert.ok(panel.contains(document.activeElement));
    await dom.key('Escape');
    assert.equal(closed, 1);
    await dom.unmount();
    assert.equal(document.activeElement, dom.opener);
    const similar = setup();
    await similar.render(h(QuranSimilarAyahsDrawer, { surah: 1, ayah: 1, similarAyahs: [], t, lang, dir: lang === 'ar' ? 'rtl' : 'ltr', onClose: () => closed++, onNavigateAyah: () => {} }));
    await act(async () => similar.opener.focus());
    assert.ok(similar.container.querySelector('[data-ui-dialog]')?.contains(document.activeElement));
    await similar.key('Escape');
    assert.equal(closed, 2);
    await similar.unmount();
    assert.equal(document.activeElement, similar.opener);
  }
});

test('KEY-298 floating Quran inspector allows focus to leave its nonmodal panel', async () => {
  const dom = setup();
  await dom.render(h(QuranAyahInspector, { floating: true, details: null, reference: { surah: 1, ayah: 1 }, surahName: 'KEY298', error: false, t: key => translations.en[key], dir: 'ltr', onClose: () => {}, onCopy: () => {}, onStudy: () => {} }));
  assert.equal(dom.container.querySelector('[aria-modal=true]'), null);
  assert.equal(dom.container.querySelector('[data-ui-dialog]'), null);
  await act(async () => dom.opener.focus());
  assert.equal(document.activeElement, dom.opener);
  await dom.unmount();
});

function rendersOnlyIcons(node: ts.Node): boolean {
  if (ts.isJsxText(node)) return !node.text.trim();
  if (ts.isJsxExpression(node)) return !node.expression || rendersOnlyIcons(node.expression);
  if (ts.isParenthesizedExpression(node)) return rendersOnlyIcons(node.expression);
  if (ts.isJsxSelfClosingElement(node)) return /^[A-Z]|^svg$/.test(node.tagName.getText());
  if (ts.isJsxElement(node)) return node.children.every(rendersOnlyIcons);
  if (ts.isConditionalExpression(node)) return rendersOnlyIcons(node.whenTrue) && rendersOnlyIcons(node.whenFalse);
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) return rendersOnlyIcons(node.right);
  return node.kind === ts.SyntaxKind.NullKeyword || node.kind === ts.SyntaxKind.FalseKeyword;
}

test('KEY-298 renderer icon-only buttons carry explicit accessible names', () => {
  const missing: string[] = [];
  for (const relative of readdirSync('src/renderer', { recursive: true })) {
    if (typeof relative !== 'string' || !relative.endsWith('.tsx')) continue;
    const filename = path.join('src/renderer', relative);
    const source = ts.createSourceFile(filename, readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (node: ts.Node) => {
      const element = ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : null;
      if (element && ['button', 'Button'].includes(element.tagName.getText(source))) {
        const named = element.attributes.properties.some(attribute => ts.isJsxSpreadAttribute(attribute) || ['aria-label', 'aria-labelledby'].includes(attribute.name.getText(source)));
        const children = ts.isJsxElement(node) ? node.children.filter(child => !ts.isJsxText(child) || child.text.trim()) : [];
        if (!named && children.every(rendersOnlyIcons)) {
          missing.push(`${filename}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  assert.deepEqual(missing, []);
});
