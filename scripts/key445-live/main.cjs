// KEY-445 live verification in Electron (ar & en, real Arabic & English PDFs copied into throwaway profile, stubbed Ollama).
const { app } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const profile = process.env.BAGLIB_KEY445_PROFILE;
const evidence = process.env.BAGLIB_KEY445_EVIDENCE;
assert.equal(path.dirname(profile), fs.realpathSync('.baglib-data'));

app.setPath('userData', profile);
app.setAppPath(process.cwd());

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
setTimeout(() => { console.error('KEY-445 hard timeout'); app.exit(1); }, 220_000).unref();

let stubPort = 0;
let nextToolCalls = [];

function startStubOllama() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/api/chat') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: { role: 'assistant', content: '', tool_calls: nextToolCalls } }));
        });
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ models: [{ name: 'stub-tools-model' }] }));
    });
    server.listen(0, '127.0.0.1', () => {
      stubPort = server.address().port;
      resolve(server);
    });
  });
}

let running = false;
app.on('browser-window-created', (_, win) => {
  const errors = [];
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 3 && !/ERR_CONNECTION_REFUSED|Failed to fetch/u.test(message)) errors.push(message);
  });
  win.webContents.on('render-process-gone', (_e, details) => errors.push(`gone:${details.reason}`));
  win.webContents.on('did-fail-load', (_e, code, desc) => errors.push(`load:${code}:${desc}`));

  const waitFor = async (script, label, timeout = 30_000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const value = await win.webContents.executeJavaScript(script, true);
      if (value) return value;
      await pause(250);
    }
    throw new Error(`Timed out waiting for: ${label}`);
  };

  const snap = async name => {
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(evidence, name), img.toPNG());
  };

  const submitAssistant = async instruction => {
    await win.webContents.executeJavaScript(`(() => {
      const input = document.querySelector('[data-research-ai-input]');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
        || Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter.call(input, ${JSON.stringify(instruction)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.form.requestSubmit();
      return true;
    })()`, true);
  };

  win.webContents.once('did-finish-load', async () => {
    if (running) return;
    running = true;
    const server = await startStubOllama();
    try {
      win.setSize(1280, 900);
      await waitFor('!!window.electronAPI && document.body && document.body.innerText.trim().length > 20', 'app ready');

      const copyDir = path.join(profile, 'real-pdfs');
      fs.mkdirSync(copyDir, { recursive: true });

      const arTextSrc = path.resolve('tests/real-files/pdf/ar/text-layer/الدفاع عن اراضي المسلمين اهم فروض الاعيان للشيخ عبدالله عزام.pdf');
      const enTextSrc = path.resolve('tests/real-files/pdf/en/text-layer/Why lyrics last_ evolution, cognition, and Shakesp.pdf');

      const arTextCopy = path.join(copyDir, 'ar-text.pdf');
      const enTextCopy = path.join(copyDir, 'en-text.pdf');
      fs.copyFileSync(arTextSrc, arTextCopy);
      fs.copyFileSync(enTextSrc, enTextCopy);

      const arTextStat = fs.statSync(arTextCopy).size;
      const enTextStat = fs.statSync(enTextCopy).size;

      await win.webContents.executeJavaScript(`(async () => {
        await window.electronAPI.settings.set('onboarding.v1', { seen: true });
        await window.electronAPI.settings.set('workspace.tabs.v1', null);
        await window.electronAPI.settings.set('workspace.closedTabs.v1', null);
        await window.electronAPI.ai.saveSettings({
          enabled: true,
          provider: 'ollama',
          ollamaEndpoint: 'http://127.0.0.1:${stubPort}',
          ollamaModel: 'stub-tools-model',
          learningModes: { revision: 'off', reader: 'full', quran: 'full', sunnah: 'full', notes: 'full', researchEditor: 'full' },
        });
        await window.electronAPI.settings.set('ai.learningMode', 'full');
        await window.electronAPI.addBook({ filePath: ${JSON.stringify(arTextCopy)}, title: 'الدفاع عن أراضي المسلمين', digitalFormat: 'pdf', language: 'ar' });
        await window.electronAPI.addBook({ filePath: ${JSON.stringify(enTextCopy)}, title: 'Why Lyrics Last', digitalFormat: 'pdf', language: 'en' });
        return true;
      })()`, true);

      const runLang = async lang => {
        await win.webContents.executeJavaScript(`(async () => {
          await window.electronAPI.settings.set('workspace.tabs.v1', null);
          await window.electronAPI.settings.set('workspace.closedTabs.v1', null);
          localStorage.setItem('baglib-lang', '${lang}');
          location.reload();
        })()`, true);
        await waitFor(`!!window.electronAPI && document.documentElement.dir === '${lang === 'ar' ? 'rtl' : 'ltr'}' && !!document.querySelector('[data-assistant-fab]')`, `${lang} dir & fab`);
        await pause(800);

        await win.webContents.executeJavaScript(`document.querySelector('[data-assistant-fab]').click()`, true);
        await waitFor('!!document.querySelector("[data-assistant-actions-mode]")', 'actions mode button');
        await win.webContents.executeJavaScript(`(() => {
          const modeBtn = document.querySelector('[data-assistant-actions-mode]');
          if (modeBtn.getAttribute('aria-pressed') !== 'true') modeBtn.click();
          return true;
        })()`, true);

        // 1. Extract pages 8 to 12 by book title (no workId!)
        const extractCountBefore = fs.readdirSync(copyDir).length;
        nextToolCalls = [{
          id: 'call_extract',
          type: 'function',
          function: {
            name: 'extract_pdf_pages',
            arguments: lang === 'ar'
              ? { bookTitle: 'الدفاع عن اراضي المسلمين', pages: '8-12' }
              : { bookTitle: 'why lyrics last', pages: '8-12' },
          },
        }];
        await submitAssistant(lang === 'ar'
          ? 'استخرج الصفحات 8 إلى 12 من الدفاع عن أراضي المسلمين'
          : 'extract pages 8 to 12 from why lyrics last');

        await waitFor('document.querySelectorAll("[data-ai-action-confirm]").length === 1', `${lang} extract preview`, 30_000);
        await snap(`${lang}-extract-preview.png`);

        await win.webContents.executeJavaScript(`document.querySelectorAll("[data-ai-action-confirm]")[0].click()`, true);
        await waitFor('document.querySelectorAll("[data-ai-action-executed]").length === 1', `${lang} extract executed`, 60_000);
        await pause(300);
        await snap(`${lang}-extract-executed.png`);

        const filesAfterExtract = fs.readdirSync(copyDir);
        assert.equal(filesAfterExtract.length, extractCountBefore + 1, `${lang}: expected 1 new extracted PDF`);
        assert.equal(fs.statSync(arTextCopy).size, arTextStat);
        assert.equal(fs.statSync(enTextCopy).size, enTextStat);

        await win.webContents.executeJavaScript(`document.querySelectorAll("[data-ai-action-undo]")[0].click()`, true);
        await waitFor('document.querySelectorAll("[data-ai-action-undone]").length === 1', `${lang} extract undone`, 30_000);
        assert.equal(fs.readdirSync(copyDir).length, extractCountBefore, `${lang}: undo should remove extracted PDF`);

        // 2. Open ayah 2:11 ("ayah 2:11" in en, "سورة البقرة آية 11" in ar)
        nextToolCalls = [{
          id: 'call_open_ayah',
          type: 'function',
          function: {
            name: 'open_source',
            arguments: { target: lang === 'ar' ? 'سورة البقرة آية 11' : 'ayah 2:11' },
          },
        }];
        await submitAssistant(lang === 'ar' ? 'افتح سورة البقرة آية 11' : 'open ayah 2:11');
        await waitFor('document.querySelectorAll("[data-ai-action-confirm]").length === 1', `${lang} open ayah preview`, 30_000);

        await win.webContents.executeJavaScript(`document.querySelectorAll("[data-ai-action-confirm]")[0].click()`, true);
        await waitFor('document.querySelectorAll("[data-ai-action-executed]").length === 1', `${lang} open ayah executed`, 30_000);
        await waitFor(`(() => {
          const text = document.body.innerText;
          return text.includes('البقرة') || text.includes('Al-Baqarah') || text.includes('2:11') || !!document.querySelector('[data-quran-surah="2"]');
        })()`, `${lang} Al-Baqarah 2:11 opened`, 30_000);
        await pause(500);
        await snap(`${lang}-ayah-opened.png`);

        // 3. Missing book gives localized "not in library" error (never provider error)
        nextToolCalls = [{
          id: 'call_missing',
          type: 'function',
          function: {
            name: 'extract_pdf_pages',
            arguments: { bookTitle: 'Unknown Book XYZ', pages: '1-2' },
          },
        }];
        await submitAssistant(lang === 'ar' ? 'استخرج صفحات من Unknown Book XYZ' : 'extract pages from Unknown Book XYZ');
        await waitFor(`(() => {
          const body = document.body.innerText;
          return body.includes('Unknown Book XYZ');
        })()`, `${lang} missing book error`, 30_000);
        const bodyText = await win.webContents.executeJavaScript(`document.body.innerText`, true);
        assert.ok(!bodyText.includes('تعذّر الحصول على إجابة من المزوّد'), `${lang}: must not blame provider`);
        assert.ok(!bodyText.includes('The provider gave no answer'), `${lang}: must not blame provider`);
        await snap(`${lang}-missing-book-error.png`);

        return { lang, ok: true };
      };

      const arResult = await runLang('ar');
      const enResult = await runLang('en');

      assert.deepEqual(errors, [], `Renderer errors: ${errors.join(' | ')}`);
      fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify({ ok: true, ar: arResult, en: enResult, errors }, null, 2));
      server.close();
      app.exit(0);
    } catch (err) {
      fs.writeFileSync(path.join(evidence, 'failure.txt'), String(err?.stack || err));
      await snap('failure.png').catch(() => {});
      server.close();
      app.exit(1);
    }
  });
});

require(path.join(process.cwd(), 'dist', 'main', 'index.js'));
