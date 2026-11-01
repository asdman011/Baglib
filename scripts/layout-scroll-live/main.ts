import { app, BrowserWindow } from 'electron';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const directory = process.env.BAGLIB_LAYOUT_TEST_DIRECTORY!;
app.setPath('userData', path.join(directory, 'profile'));
app.disableHardwareAcceleration();

async function run() {
  await app.whenReady();
  const window = new BrowserWindow({ width: 1280, height: 800, show: false, webPreferences: { offscreen: true, backgroundThrottling: false } });
  const results = [];
  try {
    for (const language of ['ar', 'en']) {
      for (const theme of ['dark', 'light']) {
        for (const width of [480, 1280]) {
          window.setContentSize(width, 800);
          const filename = path.join(directory, 'index.html');
          fs.writeFileSync(filename, `<!doctype html><html lang="${language}" dir="${language === 'ar' ? 'rtl' : 'ltr'}" class="${theme === 'dark' ? 'dark' : ''}"><head><meta charset="utf-8"><link rel="stylesheet" href="style.css"></head><body style="margin:0;display:flex;flex-direction:column;min-height:100%"><div id="shell" style="height:100vh;width:100vw;display:flex;flex-direction:column;overflow:hidden;position:relative;flex-shrink:0"><header style="height:40px;flex-shrink:0">Baglib بغلب</header><main id="panel" style="flex:1;min-height:0;overflow:auto"><div style="height:3200px">كِتَابٌ — Book 123</div></main><footer style="height:24px;flex-shrink:0">الحالة — Status</footer></div><div aria-hidden="true" style="position:absolute;top:200vh;height:40px;width:1px"></div></body></html>`);
          await window.loadFile(filename);
          await window.webContents.executeJavaScript(`document.getElementById('panel').scrollTop = 3200; window.scrollTo(0, document.documentElement.scrollHeight);`);
          await new Promise(resolve => setTimeout(resolve, 40));
          window.webContents.sendInputEvent({ type: 'mouseWheel', x: Math.floor(width / 2), y: 400, deltaX: 0, deltaY: -600, canScroll: true });
          await new Promise(resolve => setTimeout(resolve, 80));
          const metrics = await window.webContents.executeJavaScript(`(() => {
            const panel = document.getElementById('panel');
            const footer = document.querySelector('footer').getBoundingClientRect();
            return { scrollY, shellTop: document.getElementById('shell').getBoundingClientRect().top, footerBottom: footer.bottom, panelScroll: panel.scrollTop, direction: getComputedStyle(panel).direction, background: getComputedStyle(document.documentElement).backgroundColor, height: innerHeight };
          })()`);
          assert.equal(metrics.scrollY, 0, `${language}/${theme}/${width}: outer document scrolled`);
          assert.equal(metrics.shellTop, 0);
          assert.equal(metrics.footerBottom, metrics.height);
          assert.ok(metrics.panelScroll > 0, 'inner content must remain scrollable');
          assert.equal(metrics.direction, language === 'ar' ? 'rtl' : 'ltr');
          assert.notEqual(metrics.background, 'rgba(0, 0, 0, 0)');
          results.push({ language, theme, width, ...metrics });
        }
      }
    }
    fs.writeFileSync(path.join(directory, 'results.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify({ passed: results.length, directory, results }));
    if (process.env.BAGLIB_LAYOUT_TEST_URL) {
      await window.loadURL(process.env.BAGLIB_LAYOUT_TEST_URL);
      for (const language of ['ar', 'en']) {
        for (const theme of ['dark', 'light']) {
          await window.webContents.executeJavaScript(`localStorage.setItem('baglib-lang', '${language}'); localStorage.setItem('baglib-theme', '${theme}');`);
          await window.loadURL(process.env.BAGLIB_LAYOUT_TEST_URL);
          await new Promise(resolve => setTimeout(resolve, 4500));
          const metrics = await window.webContents.executeJavaScript(`(() => {
            const probe = document.createElement('div');
            probe.style.cssText = 'position:absolute;top:200vh;width:1px;height:40px';
            document.body.appendChild(probe);
            window.scrollTo(0, document.documentElement.scrollHeight);
            const footer = document.querySelector('footer');
            const result = { scrollY, footerBottom: footer?.getBoundingClientRect().bottom, height: innerHeight, direction: document.documentElement.dir, theme: document.documentElement.classList.contains('dark') };
            probe.remove();
            return result;
          })()`);
          assert.equal(metrics.scrollY, 0, 'actual app document must not scroll');
          assert.equal(metrics.footerBottom, metrics.height, 'actual app footer must remain visible');
          assert.equal(metrics.direction, language === 'ar' ? 'rtl' : 'ltr');
          assert.equal(metrics.theme, theme === 'dark');
          fs.writeFileSync(path.join(directory, `app-${language}-${theme}.png`), (await window.webContents.capturePage()).toPNG());
          console.log(JSON.stringify({ actualApp: { language, theme, ...metrics } }));
        }
      }
    }
  } finally {
    window.destroy();
  }
}

run().then(() => app.exit(0)).catch(error => { console.error(error); app.exit(1); });
