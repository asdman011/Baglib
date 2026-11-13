import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseHTML } from 'linkedom';
import { NoteMarker } from '../../src/renderer/components/notes/NoteMarker';
import { NOTE_PANEL_EVENT, passageNote } from '../../src/renderer/components/actions/passage-actions';
import { translations, type TranslationKey } from '../../src/renderer/translations';

// KEY-337: notes on a passage open beside the text, and the text marks passages that have notes.
const keys = ['notePanelTitle', 'notePanelPlaceholder', 'notePanelSave', 'notePanelSaved', 'notePanelOpenInNotes', 'notePanelExisting', 'notePanelEmpty', 'notePanelOpenNote',
  'noteMarkerLabel_zero', 'noteMarkerLabel_one', 'noteMarkerLabel_two', 'noteMarkerLabel_few', 'noteMarkerLabel_many', 'noteMarkerLabel_other'] as const;

test('the note panel and marker have every Arabic plural form and an English text', () => {
  for (const key of keys) assert.ok(translations.ar[key] && translations.en[key], key);
  assert.ok(translations.ar.noteMarkerLabel_two.includes('ملاحظتان'));
  assert.ok(translations.ar.noteMarkerLabel_many.includes('ملاحظةً'));
});

test('a passage note asks for the side panel instead of switching to the Notes tab', () => {
  const { window } = parseHTML('<html><body></body></html>');
  const saved = (globalThis as { window?: unknown }).window;
  Object.assign(globalThis, { window, CustomEvent: window.CustomEvent });
  try {
    let detail: unknown = null;
    window.addEventListener(NOTE_PANEL_EVENT, (event: Event) => { detail = (event as CustomEvent).detail; });
    passageNote('quran:hafs:2:255', '2:255', 'اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ');
    assert.deepEqual(detail, { target: 'quran:hafs:2:255', label: '2:255', text: 'اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ', embed: false });
  } finally { Object.assign(globalThis, { window: saved }); }
});

for (const language of ['ar', 'en'] as const) test(`the marker names its count in ${language}`, () => {
  const t = (key: TranslationKey, params?: Record<string, string | number>) => Object.entries(params ?? {}).reduce((text, [name, value]) => text.replace(`{${name}}`, String(value)), translations[language][key]);
  const { document } = parseHTML(`<html lang="${language}"><body></body></html>`);
  const saved = (globalThis as { document?: unknown }).document;
  Object.assign(globalThis, { document });
  try {
    const page = parseHTML(renderToStaticMarkup(createElement(NoteMarker, { count: 2, t, onOpen: () => {} }))).document;
    const button = page.querySelector('[data-note-marker]');
    assert.equal(button?.getAttribute('data-note-count'), '2');
    assert.equal(button?.getAttribute('aria-label'), language === 'ar' ? translations.ar.noteMarkerLabel_two : translations.en.noteMarkerLabel_other.replace('{count}', '2'));
  } finally { Object.assign(globalThis, { document: saved }); }
});
