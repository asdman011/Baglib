const { app, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
require('tsx/cjs');
const { translations } = require('../../src/renderer/translations.ts');
const profile = process.env.BAGLIB_SPLASH_PROFILE;
const evidence = process.env.BAGLIB_SPLASH_EVIDENCE;
const baseline = process.env.BAGLIB_SPLASH_BASELINE === '1';
app.setPath('userData', profile);
app.setAppPath(path.resolve(__dirname, '../..'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
// Hold the production splash long enough to load its fonts and capture the title.
const register = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, listener) => register(channel, channel === 'search:get-fts-stats' ? async (...args) => { await pause(1800); return listener(...args); } : listener);
let started = false;
app.on('browser-window-created', (_, win) => {
  if (started) return;
  started = true;
  const evaluate = code => win.webContents.executeJavaScript(code, true);
  const until = async code => {
    for (let i = 0; i < 200; i++) {
      try { if (await evaluate(code)) return; } catch {}
      await pause(50);
    }
    throw new Error('Timed out ' + code);
  };
  win.webContents.on('did-finish-load', () => { void evaluate("window.electronAPI && window.electronAPI.settings.set('onboarding.v1',{seen:true})").catch(() => {}); });
  (async () => {
    win.setMinimumSize(320, 400);
    await until('!!window.electronAPI && !!document.querySelector("footer")');
    await evaluate('document.fonts.ready');
    const results = [];
    for (const language of ['ar', 'en']) for (const theme of ['light', 'dark']) for (const width of [1280, 480]) {
      win.setContentSize(width, 900);
      await evaluate('localStorage.setItem("baglib-lang",' + JSON.stringify(language) + ');localStorage.setItem("baglib-theme",' + JSON.stringify(theme) + ')');
      await win.loadURL('http://localhost:3000');
      await until('!!document.querySelector("[role=dialog] h1")');
      await evaluate('document.fonts.ready');
      await pause(650);
      const metrics = await evaluate(`(() => {
        const title=document.querySelector('[role=dialog] h1');
        if(!title)throw new Error('Splash dismissed before capture');
        const style=getComputedStyle(title),rect=title.getBoundingClientRect();
        const ctx=document.createElement('canvas').getContext('2d');
        ctx.font=style.fontStyle+' '+style.fontWeight+' '+style.fontSize+' '+style.fontFamily;
        const ink=ctx.measureText(title.textContent);
        const lineHeight=parseFloat(style.lineHeight),paddingStart=parseFloat(style.paddingBlockStart),paddingEnd=parseFloat(style.paddingBlockEnd);
        const baseline=paddingStart+(lineHeight-ink.fontBoundingBoxAscent-ink.fontBoundingBoxDescent)/2+ink.fontBoundingBoxAscent;
        return {text:title.textContent,width:rect.width,height:rect.height,font:ctx.font,fontSize:parseFloat(style.fontSize),lineHeight,paddingStart,paddingEnd,
          inkTop:baseline-ink.actualBoundingBoxAscent,inkBottom:baseline+ink.actualBoundingBoxDescent,inkHeight:ink.actualBoundingBoxAscent+ink.actualBoundingBoxDescent,
          dir:title.closest('[role=dialog]').dir,background:getComputedStyle(title.closest('[role=dialog]')).backgroundColor,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth};
      })()`);
      fs.writeFileSync(path.join(evidence, `${language}-${theme}-${width}.png`), (await win.webContents.capturePage()).toPNG());
      assert.equal(metrics.dir, language === 'ar' ? 'rtl' : 'ltr');
      assert.equal(metrics.overflow, false);
      if (!baseline) {
        assert.equal(metrics.text, translations[language].splashTitle);
        assert.ok(metrics.inkTop >= 0 && metrics.inkBottom <= metrics.height, 'Splash ink exceeds title box ' + JSON.stringify(metrics));
        assert.ok(metrics.lineHeight >= metrics.fontSize * 1.6);
      }
      results.push({ language, theme, viewportWidth: width, ...metrics });
    }
    fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify({ baseline, results }, null, 2));
    console.log('PASS splash', results.length, evidence);
    app.quit();
  })().catch(async error => {
    console.error(error);
    fs.writeFileSync(path.join(evidence, 'failure.txt'), String(error.stack || error));
    try { fs.writeFileSync(path.join(evidence, 'failure.png'), (await win.webContents.capturePage()).toPNG()); } finally { app.exit(1); }
  });
});
require('../../dist/main/index.js');
