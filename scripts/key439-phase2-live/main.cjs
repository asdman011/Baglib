// KEY-439 Phase 2 live verification in Electron (ar & en, real Arabic & English PDFs copied into throwaway profile, stubbed Ollama).
const { app } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const profile = process.env.BAGLIB_KEY439_PROFILE;
const evidence = process.env.BAGLIB_KEY439_EVIDENCE;
assert.equal(path.dirname(profile), fs.realpathSync('.baglib-data'));

app.setPath('userData', profile);
app.setAppPath(process.cwd());

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
setTimeout(() => { console.error('KEY-439 Phase 2 hard timeout'); app.exit(1); }, 220_000).unref();

let stubPort = 0;
let currentFixture = null;

function startStubOllama() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/api/chat') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          const f = currentFixture;
          const tool_calls = f.lang === 'ar'
            ? [
                {
                  id: 'call_split',
                  type: 'function',
                  function: {
                    name: 'split_pdf',
                    arguments: { workId: f.arTextWorkId, ranges: '1-2,3-4' },
                  },
                },
                {
                  id: 'call_extract',
                  type: 'function',
                  function: {
                    name: 'extract_pdf_pages',
                    arguments: { workId: f.arTextWorkId, pages: '1,3' },
                  },
                },
                {
                  id: 'call_rotate',
                  type: 'function',
                  function: {
                    name: 'rotate_pdf_pages',
                    arguments: { workId: f.arTextWorkId, angle: 90, pages: '1-2' },
                  },
                },
                {
                  id: 'call_ocr',
                  type: 'function',
                  function: {
                    name: 'ocr_pdf_page',
                    arguments: { workId: f.arScanWorkId, page: 1, language: 'ara' },
                  },
                },
              ]
            : [
                {
                  id: 'call_merge',
                  type: 'function',
                  function: {
                    name: 'merge_pdfs',
                    arguments: { sources: [{ workId: f.enTextWorkId }, { workId: f.arTextWorkId }] },
                  },
                },
                {
                  id: 'call_rotate_en',
                  type: 'function',
                  function: {
                    name: 'rotate_pdf_pages',
                    arguments: { workId: f.enTextWorkId, angle: 180, pages: '1' },
                  },
                },
              ];

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: { role: 'assistant', content: '', tool_calls } }));
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
      const arScanSrc = path.resolve('tests/real-files/pdf/ar/scanned-image-only/تفسير الموعذتين لابن تيمية.pdf');
      const enTextSrc = path.resolve('tests/real-files/pdf/en/text-layer/Why lyrics last_ evolution, cognition, and Shakesp.pdf');

      const arTextCopy = path.join(copyDir, 'ar-text.pdf');
      const arScanCopy = path.join(copyDir, 'ar-scan.pdf');
      const enTextCopy = path.join(copyDir, 'en-text.pdf');
      fs.copyFileSync(arTextSrc, arTextCopy);
      fs.copyFileSync(arScanSrc, arScanCopy);
      fs.copyFileSync(enTextSrc, enTextCopy);

      const arTextStat = fs.statSync(arTextCopy).size;
      const arScanStat = fs.statSync(arScanCopy).size;
      const enTextStat = fs.statSync(enTextCopy).size;

      const imported = await win.webContents.executeJavaScript(`(async () => {
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
        const arTextBook = await window.electronAPI.addBook({ filePath: ${JSON.stringify(arTextCopy)}, title: 'الدفاع عن أراضي المسلمين', digitalFormat: 'pdf', language: 'ar' });
        const arScanBook = await window.electronAPI.addBook({ filePath: ${JSON.stringify(arScanCopy)}, title: 'تفسير المعوذتين', digitalFormat: 'pdf', language: 'ar' });
        const enTextBook = await window.electronAPI.addBook({ filePath: ${JSON.stringify(enTextCopy)}, title: 'Why Lyrics Last', digitalFormat: 'pdf', language: 'en' });
        return { arTextId: arTextBook.id, arScanId: arScanBook.id, enTextId: enTextBook.id };
      })()`, true);

      const runLang = async lang => {
        currentFixture = {
          lang,
          arTextWorkId: imported.arTextId,
          arScanWorkId: imported.arScanId,
          enTextWorkId: imported.enTextId,
        };
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

        const instruction = lang === 'ar'
          ? 'قسّم الكتاب واستخرج الصفحات 1 و3 ودوّر 1-2 بزاوية 90 وشغّل التعرف الضوئي على الصفحة 1 من الكتاب المصور'
          : 'Merge the English and Arabic PDFs and rotate page 1 by 180 degrees';

        await win.webContents.executeJavaScript(`(() => {
          const input = document.querySelector('[data-research-ai-input]');
          const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
            || Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
          setter.call(input, ${JSON.stringify(instruction)});
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.form.requestSubmit();
          return true;
        })()`, true);

        await waitFor('!!document.querySelector("[data-ai-action-confirm]")', `${lang} preview card`, 30_000);
        await snap(`${lang}-preview.png`);

        // Before confirm: only the 3 source PDFs exist in copyDir
        assert.equal(fs.readdirSync(copyDir).length, 3, `${lang}: no output files should exist before confirm`);

        // Confirm & run
        await win.webContents.executeJavaScript(`document.querySelector("[data-ai-action-confirm]").click()`, true);
        await waitFor('!!document.querySelector("[data-ai-action-executed]")', `${lang} executed`, 90_000);
        await pause(400);
        await snap(`${lang}-executed.png`);

        const filesAfterExec = fs.readdirSync(copyDir);
        assert.ok(filesAfterExec.length > 3, `${lang}: expected new output files after confirm`);
        assert.equal(fs.statSync(arTextCopy).size, arTextStat);
        assert.equal(fs.statSync(arScanCopy).size, arScanStat);
        assert.equal(fs.statSync(enTextCopy).size, enTextStat);

        // Undo deletes only the newly created files
        await win.webContents.executeJavaScript(`document.querySelector("[data-ai-action-undo]").click()`, true);
        await waitFor('!!document.querySelector("[data-ai-action-undone]")', `${lang} undone`, 30_000);
        await pause(300);

        const filesAfterUndo = fs.readdirSync(copyDir).sort();
        assert.deepEqual(filesAfterUndo, ['ar-scan.pdf', 'ar-text.pdf', 'en-text.pdf'], `${lang}: undo should delete only new output files`);
        return { lang, createdCount: filesAfterExec.length - 3 };
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
