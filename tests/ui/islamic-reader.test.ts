import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseHTML } from 'linkedom';
import { IslamicReaderHeader, IslamicReaderPanel } from '../../src/renderer/components/islamic/IslamicReaderChrome';
import { readerChromeState, readerProfileSelection } from '../../src/renderer/components/islamic/reader-chrome';
import { CONTINUE_KEY, continueReading, saveContinueReading, quranContinueKey, loadQuranContinueReading, quranPageHint } from '../../src/renderer/components/islamic/continue-reading';
import { translations } from '../../src/renderer/translations';
import type { QuranReaderSource } from '../../src/shared/types/quran';

const initial = { settings:false, panel:false, tab:'commentary' as const };
test('reader chrome opens settings and study panel independently and retains selected tab', () => {
  const selected = readerChromeState(initial, {type:'tab',tab:'notes'});
  assert.deepEqual(selected, {settings:false,panel:true,tab:'notes'});
  const settings = readerChromeState(selected,{type:'settings'});
  assert.deepEqual(settings,{settings:true,panel:false,tab:'notes'});
  assert.deepEqual(readerChromeState(settings,{type:'panel'}),selected);
  assert.deepEqual(readerChromeState(selected,{type:'close'}),{...initial,tab:'notes'});
});
test('reader chrome settings and panel toggles close on a second activation', () => {
  assert.deepEqual(readerChromeState(readerChromeState(initial,{type:'settings'}),{type:'settings'}),initial);
  assert.deepEqual(readerChromeState(readerChromeState(initial,{type:'panel'}),{type:'panel'}),initial);
});
const sources: QuranReaderSource[] = [
  {id:'hafs',title:'Hafs',kind:'script',profile:'hafs'},
  {id:'warsh',title:'Warsh',kind:'script',profile:'warsh'},
  {id:'hafs-tafsir',title:'Hafs companion',kind:'tafsir',profile:'hafs'},
  {id:'hafs-translation',title:'Hafs translation',kind:'translation',profile:'hafs'},
  {id:'warsh-translation',title:'Warsh translation',kind:'translation',profile:'warsh'},
];
test('profile switch never carries Hafs companions or numbered targets into Warsh', () => {
  const hafs = {...readerProfileSelection(sources,'hafs'),surah:2,ayah:286};
  const warsh = readerProfileSelection(sources,'warsh');
  assert.equal(hafs.tafsir,'hafs-tafsir');
  assert.equal(warsh.tafsir,'');
  assert.equal(warsh.translation,'warsh-translation');
  assert.equal('ayah' in warsh,false);
  assert.equal('surah' in warsh,false);
  for (const id of Object.values(warsh).filter(Boolean)) assert.equal(sources.find(source => source.id === id)?.profile,'warsh');
  assert.equal(readerProfileSelection(sources,'hafs').translation,'hafs-translation');
});
test('continue-reading keeps Quran profile and rejects wrong kinds and invalid targets', () => {
  assert.deepEqual(continueReading({target:'quran:warsh:2:10',label:'البقرة 2:10'},'quran'),{target:'quran:warsh:2:10',label:'البقرة 2:10'});
  for (const value of [null,{}, {target:'quran:unknown:1:1',label:'bad'}, {target:'quran:hafs:115:1',label:'bad'}, {target:'quran:hafs:1:1',label:''}, {target:'sunnah:Bukhari:1:row-1',label:'wrong kind'}]) assert.equal(continueReading(value,'quran'),null);
});
test('continue-reading round trips all three entries across a storage restart without overwriting siblings', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis,'window');
  let data: Record<string,unknown> = {};
  Object.defineProperty(globalThis,'window',{configurable:true,value:{electronAPI:{settings:{set:async(key:string,value:unknown)=>{data[key]=value;}}},dispatchEvent:()=>true}});
  try {
    const entries = {quran:{target:'quran:warsh:1:3',label:'الفاتحة'},sunnah:{target:'sunnah:Bukhari:1:row-1',label:'Bukhari'},poetry:{target:'poetry:ashaar:12:2:3',label:'شِعْر Poetry'}} as const;
    for (const kind of ['quran','sunnah','poetry'] as const) await saveContinueReading(kind,entries[kind]);
    data = JSON.parse(JSON.stringify(data));
    for (const kind of ['quran','sunnah','poetry'] as const) assert.deepEqual(continueReading(data[kind === 'quran' ? quranContinueKey('warsh') : CONTINUE_KEY+'.'+kind],kind),entries[kind]);
    await saveContinueReading('quran',{target:'quran:invalid:1:1',label:'bad'});
    assert.equal(Object.keys(data).length,4);
  } finally { if (original) Object.defineProperty(globalThis,'window',original); else Reflect.deleteProperty(globalThis,'window'); }
});
for (const lang of ['ar','en'] as const) {
  const t = (key: keyof typeof translations.ar) => translations[lang][key];
  test(`shared header keeps secondary controls in a closed localized popover in ${lang}`, () => {
    const html = renderToStaticMarkup(createElement(IslamicReaderHeader,{title:t('navQuran'),t,panelOpen:false,onPanelToggle(){},picker:createElement('select',{'aria-label':t('quranSurah')},createElement('option',null,'الفاتحة')),settings:createElement('button',null,t('bayanTypography'))}));
    const {document} = parseHTML(html);
    assert.equal(document.querySelector('[data-reader-settings]')?.getAttribute('aria-expanded'),'false');
    assert.ok(document.querySelector('[data-reader-settings-popover]')?.hasAttribute('hidden'));
    assert.ok(document.querySelector('[data-reader-picker] select'));
    assert.equal(document.querySelectorAll('[data-islamic-reader-header]').length,1);
  });
  test(`shared panel exposes labeled tabs and a single scrolling body in ${lang}`, () => {
    const {document} = parseHTML(renderToStaticMarkup(createElement(IslamicReaderPanel,{active:'notes',t,onTab(){},onClose(){},recitation:true}, 'عِلْم Knowledge')));
    assert.equal(document.querySelectorAll('[role=tab]').length,5);
    assert.equal(document.querySelector('[role=tab][aria-selected=true]')?.textContent,t('navNotesLog'));
    assert.equal(document.querySelectorAll('[role=tabpanel]').length,1);
    assert.ok(document.querySelector('[role=tabpanel]')?.textContent.includes('عِلْم'));
  });
}

for (const legacyProfile of ['hafs', 'warsh'] as const) {
  test('Quran positions restore independently and migrate the legacy ' + legacyProfile + ' target once', async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
    let data: Record<string, unknown> = { [CONTINUE_KEY + '.quran']: { target: 'quran:' + legacyProfile + ':2:10', label: 'Legacy' } };
    const writes: string[] = [];
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { electronAPI: { settings: {
      get: async (key: string) => data[key], set: async (key: string, value: unknown) => { data[key] = value; writes.push(key); }
    } }, dispatchEvent: () => true } });
    try {
      const other = legacyProfile === 'hafs' ? 'warsh' : 'hafs';
      assert.equal(await loadQuranContinueReading(other), null);
      assert.equal((await loadQuranContinueReading())?.target, 'quran:' + legacyProfile + ':2:10');
      await loadQuranContinueReading(legacyProfile);
      assert.deepEqual(writes, [quranContinueKey(legacyProfile)]);
      const hafs = { target: 'quran:hafs:3:20', label: 'Hafs' };
      const warsh = { target: 'quran:warsh:4:30', label: 'Warsh' };
      await saveContinueReading('quran', hafs); await saveContinueReading('quran', warsh);
      data = JSON.parse(JSON.stringify(data));
      assert.deepEqual(await loadQuranContinueReading('hafs'), hafs);
      assert.deepEqual(await loadQuranContinueReading('warsh'), warsh);
      assert.deepEqual(await loadQuranContinueReading(), warsh);
      // A misplaced profile entry must never leak into the other reading.
      data[quranContinueKey(other)] = data[quranContinueKey(legacyProfile)];
      assert.equal(await loadQuranContinueReading(other), null);
    } finally { if (original) Object.defineProperty(globalThis, 'window', original); else Reflect.deleteProperty(globalThis, 'window'); }
  });
}

test('page hints are bounded and tied to the exact target, script and layout', () => {
  const hint = { target: 'quran:warsh:2:5', script: 'warsh', layout: 'svg', page: 3 };
  assert.deepEqual(quranPageHint(hint, hint.target, hint.script, hint.layout), hint);
  for (const value of [null, {}, { ...hint, target: 'quran:hafs:2:5' }, { ...hint, script: 'hafs' }, { ...hint, layout: 'other' }, { ...hint, page: 0 }, { ...hint, page: 605 }, { ...hint, page: 1.5 }]) assert.equal(quranPageHint(value, hint.target, hint.script, hint.layout), null);
});
