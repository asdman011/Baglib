import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { BrowserWindow } from 'electron';
import type { KhatmahConfig, KhatmahState } from '../../src/shared/types/khatmah';
import type { QuranResult } from '../../src/shared/types/quran';
import { localDate } from '../../src/shared/khatmah';

export async function verifyKhatmah(owner: BrowserWindow, directory: string, script: string, layout: string, evaluate: <Value = unknown>(code: string) => Promise<Value>, until: (expression: string) => Promise<unknown>) {
  const config: KhatmahConfig = { title: 'تدبر القرآن • Ramadan', script, layout, startDate: localDate(), mode: 'pages', durationDays: 30, targetDate: localDate(), pagesPerSession: 2, sessionsPerDay: 5, juzPerDay: 1, automatic: false, reminder: { enabled: false, time: '06:00', language: 'ar' } };
  const unwrap = <Value>(result: QuranResult<Value>) => { assert.ok(result.ok, JSON.stringify(result)); return result.data; };
  const firstState = unwrap(await evaluate<QuranResult<KhatmahState>>(`window.electronAPI.quran.khatmahMutate(${JSON.stringify({ action: 'create', config })})`));
  const first = firstState.plans[0];
  assert.equal(first.binding.juzPages.length, 30);
  assert.equal(first.binding.juzPages[1], 22);
  assert.equal(first.binding.totalPages, 604);
  const second = unwrap(await evaluate<QuranResult<KhatmahState>>(`window.electronAPI.quran.khatmahMutate(${JSON.stringify({ action: 'create', config: { ...config, title: 'Daily Juz', mode: 'juz' } })})`)).plans[1];
  assert.equal(second.durationDays, 30);
  const openDashboard = async () => {
    await evaluate("[...document.querySelectorAll('nav button')].find(button=>button.textContent.trim()===window.quranWorkspace.t('khatmahTitle')).click()");
    await until("document.querySelectorAll('[data-khatmah-card]').length===2");
  };
  await openDashboard();
  for (const language of ['ar', 'en']) {
    await evaluate(`if(window.quranWorkspace.lang!==${JSON.stringify(language)})window.quranWorkspace.toggleLanguage()`);
    for (const width of [480, 1280]) {
      owner.setContentSize(width, 1000);
      await evaluate(`if(window.quranWorkspace.isSidebarCollapsed!==${width < 1000})window.quranWorkspace.toggleSidebar()`);
      await new Promise(resolve => setTimeout(resolve, 220));
      assert.ok(await evaluate("(()=>{const view=document.querySelector('section[aria-label='+JSON.stringify(window.quranWorkspace.t('khatmahTitle'))+']');return view.scrollWidth<=view.clientWidth+1&&view.dir===(window.quranWorkspace.lang==='ar'?'rtl':'ltr');})()"));
      await evaluate("[...document.querySelectorAll('button')].find(button=>button.textContent.trim()===window.quranWorkspace.t('khatmahNew')).click()");
      await until("Boolean(document.querySelector('[data-khatmah-form]'))");
      await new Promise(resolve => setTimeout(resolve, 150));
      assert.equal(await evaluate("document.querySelector('[data-khatmah-form]').querySelectorAll('input[type=checkbox]:checked').length"), 0);
      assert.ok(await evaluate("(()=>{const form=document.querySelector('[data-khatmah-form]');return form.scrollWidth<=form.clientWidth+1;})()"));
      if (width === 1280) {
        for (const theme of ['dark', 'light']) {
          await evaluate(`document.documentElement.classList.toggle('dark',${theme === 'dark'})`);
          await new Promise(resolve => setTimeout(resolve, 150));
          const image = await owner.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
          await fs.writeFile(path.join(directory, `khatmah-${language}-${theme}.png`), image.toPNG());
        }
      }
      await evaluate("[...document.querySelector('[data-khatmah-form]').querySelectorAll('button')].find(button=>button.textContent.trim()===window.quranWorkspace.t('khatmahCancel')).click()");
    }
  }
  const mark = { action: 'mark', id: first.id, script, layout, pages: [1], read: true };
  unwrap(await evaluate<QuranResult<KhatmahState>>(`window.electronAPI.quran.khatmahMutate(${JSON.stringify(mark)})`));
  await until("document.querySelector('[data-khatmah-card] [role=progressbar]').getAttribute('aria-valuenow')==='1'");
  await evaluate("[...document.querySelector('[data-khatmah-card]').querySelectorAll('button')].find(button=>button.textContent.trim()===window.quranWorkspace.t('khatmahReadToday')).click()");
  await until("Boolean(document.querySelector('[data-khatmah-dock]')) && document.querySelector('[data-quran-workspace]')?.textContent.includes('2')");
  await until("document.querySelector('[data-khatmah-dock] button')?.textContent.includes(window.quranWorkspace.t('khatmahMarkPage',{page:2}))");
  await evaluate("document.querySelector('[data-khatmah-dock] button').click()");
  await until(`window.electronAPI.quran.khatmahList().then(result=>result.ok&&result.data.plans[0].reads.length===2)`);
  assert.equal(unwrap(await evaluate<QuranResult<KhatmahState>>("window.electronAPI.quran.khatmahList()")).plans[1].reads.length, 0);
  await evaluate("document.querySelector('[data-khatmah-dock] button').click()");
  await until(`window.electronAPI.quran.khatmahList().then(result=>result.ok&&result.data.plans[0].reads.length===1)`);
  await owner.webContents.reload();
  await until("Boolean(window.electronAPI?.quran && window.quranWorkspace && document.querySelector('[data-quran-reader]'))");
  const restored = unwrap(await evaluate<QuranResult<KhatmahState>>("window.electronAPI.quran.khatmahList()"));
  assert.equal(restored.plans[0].reads[0].page, 1);
  assert.equal(restored.plans[1].reads.length, 0);
  assert.equal((await evaluate<QuranResult<KhatmahState>>(`window.electronAPI.quran.khatmahMutate(${JSON.stringify({ ...mark, layout: 'wrong-layout' })})`)).ok, false);
  console.log(JSON.stringify({ khatmah: { plans: 2, nativeIpc: true, realHafsJuzBoundaries: 30, rtlLtrWidths: [480, 1280], directPageJump: 2, independentProgress: true, manualUndo: true, reloadPersistence: true, notificationsShown: false } }));
}
