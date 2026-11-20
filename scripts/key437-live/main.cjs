// KEY-437 live verification in Electron (ar & en, real ayah & real hadith with stubbed local Ollama provider).
const { app } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const profile = process.env.BAGLIB_KEY437_PROFILE;
const evidence = process.env.BAGLIB_KEY437_EVIDENCE;
assert.equal(path.dirname(profile), fs.realpathSync('.baglib-data'));

app.setPath('userData', profile);
app.setAppPath(process.cwd());

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
setTimeout(() => { console.error('KEY-437 hard timeout'); app.exit(1); }, 180_000).unref();

const capturedPrompts = [];
let stubPort = 0;

function startStubOllama() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/api/chat') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          const parsed = JSON.parse(body || '{}');
          const userMsg = parsed.messages?.find(m => m.role === 'user')?.content || '';
          capturedPrompts.push(userMsg);
          const isArabic = /Write all feedback fields in Arabic/i.test(parsed.messages?.[0]?.content || '');
          const isHadith = /\(hadith\)/i.test(userMsg);
          const quote = isHadith
            ? 'إنما الأعمال بالنيات'
            : 'الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ';
          const sourceTitle = isHadith ? 'bukhari 1' : '1:2';
          const reply = isArabic
            ? {
                right: ['أصبت في ذكر الفكرة الأساسية للمعنى.'],
                missingOrWrong: [
                  {
                    point: 'يجدر التوسع في دلالة اللفظ الوارد في النص.',
                    quote,
                    sourceTitle,
                  },
                ],
                followUpQuestion: 'ما الأثر العملي لهذا المعنى في السياق؟',
              }
            : {
                right: ['You captured the core meaning accurately.'],
                missingOrWrong: [
                  {
                    point: 'Consider elaborating on the phrasing in the source.',
                    quote,
                    sourceTitle,
                  },
                ],
                followUpQuestion: 'How does this apply in practice?',
              };
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: { role: 'assistant', content: JSON.stringify(reply) } }));
        });
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ models: [{ name: 'stub-model' }] }));
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
    if (level >= 3) errors.push(message);
  });
  win.webContents.on('did-finish-load', () => {
    if (running || win.webContents.getURL().startsWith('devtools:')) return;
    running = true;
    run(win, errors).catch(async error => {
      console.error(error);
      fs.writeFileSync(path.join(evidence, 'failure.txt'), (error.stack || String(error)) + '\n' + JSON.stringify(errors));
      try {
        fs.writeFileSync(path.join(evidence, 'failure.png'), (await win.webContents.capturePage()).toPNG());
      } catch {}
      app.exit(1);
    });
  });
});

async function run(win, errors) {
  const stubServer = await startStubOllama();
  try {
    win.setSize(1280, 900);
    win.show();
    // live-harness-window.ts keeps windows off-screen and unfocused.
    const evaluate = code => win.webContents.executeJavaScript(code, true);
    async function until(code, tries = 180) {
      for (let i = 0; i < tries; i++) {
        try {
          if (await evaluate(code)) return;
        } catch {}
        await pause(120);
      }
      throw new Error('Timed out: ' + code);
    }
    const shot = async name => {
      await pause(300);
      win.webContents.invalidate();
      await pause(200);
      fs.writeFileSync(path.join(evidence, name + '.png'), (await win.webContents.capturePage()).toPNG());
    };

    console.log('KEY-437 waiting for app ready...');
    await until('!!window.electronAPI && !!document.querySelector("[data-nav-item=quran]")');

    // Configure stub local Ollama endpoint + clear workspace tabs.
    await evaluate(`(async () => {
      await window.electronAPI.settings.set("onboarding.v1", { seen: true });
      await window.electronAPI.settings.set("workspace.tabs.v1", null);
      await window.electronAPI.settings.set("workspace.closed.v1", null);
      await window.electronAPI.ai.saveSettings({
        enabled: true,
        provider: 'ollama',
        ollamaEndpoint: 'http://127.0.0.1:${stubPort}',
        ollamaModel: 'stub-model',
      });
    })()`);

    const results = {};
    for (const lang of ['ar', 'en']) {
      console.log(`KEY-437 testing lang=${lang}...`);
      await evaluate(`window.electronAPI.settings.set("workspace.tabs.v1", null)`);
      await evaluate(`localStorage.setItem("baglib-lang", ${JSON.stringify(lang)})`);
      await evaluate(`location.reload()`);
      await until(`!!window.electronAPI && !!document.querySelector('[data-nav-item="quran"]')`);
      await until(`document.documentElement.dir === ${JSON.stringify(lang === 'ar' ? 'rtl' : 'ltr')}`);

      // 1. Real Quran Ayah (Al-Fatihah 1:2)
      await evaluate(`document.querySelector('[data-nav-item="quran"]')?.click()`);
      await until(`!!document.querySelector('[data-surah="1"][data-aya="2"], [data-quran-ayah-actions]')`);
      await pause(500);

      // Trigger Explain it back via real ayah context menu or ayah actions button
      const ayahMenuTriggered = await evaluate(`(() => {
        const el = document.querySelector('[data-surah="1"][data-aya="2"]');
        if (el) {
          const r = el.getBoundingClientRect();
          el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 10, clientY: r.top + 10 }));
          return true;
        }
        const btn = document.querySelector('[data-quran-ayah-actions]');
        if (btn) { btn.click(); return true; }
        return false;
      })()`);
      assert.equal(ayahMenuTriggered, true, 'Real ayah element found in ' + lang);
      await until(`!!document.querySelector('[role="menuitem"]')`);
      const clicked = await evaluate(`(() => {
        const items = [...document.querySelectorAll('[role="menuitem"]')];
        const item = items.find(i => /Explain it back|اشرح بأسلوبك/.test(i.textContent || ''));
        if (!item) return false;
        item.click();
        return true;
      })()`);
      assert.ok(clicked, 'Explain it back menu item found on real ayah in ' + lang);

      await until(`!!document.querySelector('[data-explain-back-modal]')`);
      // Principle 1: no AI feedback is shown before the user writes and submits theirs
      const feedbackBefore = await evaluate(`!!document.querySelector('[data-explain-back-feedback]')`);
      assert.equal(feedbackBefore, false, 'Feedback must not appear before user writes explanation');

      const userExplanation = lang === 'ar'
        ? 'الثناء على الله تعالى رب جميع المخلوقات.'
        : 'All praise belongs to Allah, Lord of all worlds.';
      await evaluate(`(() => {
        const ta = document.querySelector('[data-explain-back-input]');
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
        setter.call(ta, ${JSON.stringify(userExplanation)});
        ta.dispatchEvent(new Event('input', { bubbles: true }));
      })()`);
      await evaluate(`document.querySelector('[data-explain-back-submit]')?.click()`);
      await until(`!!document.querySelector('[data-explain-back-feedback]')`);
      await shot(`ayah-feedback-${lang}`);

      // Save as note and verify user's text is preserved & AI feedback is marked
      await evaluate(`document.querySelector('[data-explain-back-save]')?.click()`);
      await until(`!!document.querySelector('[data-explain-back-saved]')`);

      const savedNoteCheck = await evaluate(`(async () => {
        const notes = await window.electronAPI.studyNotes.list();
        const latest = notes[0];
        return latest ? { title: latest.title, content: latest.content } : null;
      })()`);
      assert.ok(savedNoteCheck && savedNoteCheck.content.includes(userExplanation), 'Saved note preserves user explanation verbatim');
      assert.ok(savedNoteCheck.content.includes(lang === 'ar' ? 'مُنشأ تلقائيًا' : 'Auto-generated'), 'Saved note marks AI feedback as generated');

      // Close modal (Modal close button has aria-label="Close" / "إغلاق")
      await evaluate(`document.querySelector('[data-ui-dialog="modal"] button[aria-label]')?.click()`);
      await until(`!document.querySelector('[data-explain-back-modal]')`);

      // 2. Real Sunnah Hadith (Bukhari)
      await evaluate(`document.querySelector('[data-nav-item="sunnah"]')?.click()`);
      await until(`!!document.querySelector('[data-hadith-id]') || !!document.querySelector('[data-hadith-explain-back]')`);
      await pause(400);

      const hadithOpened = await evaluate(`(() => {
        const btn = document.querySelector('[data-hadith-explain-back]');
        if (btn) { btn.click(); return true; }
        const el = document.querySelector('[data-hadith-id]');
        if (!el) return false;
        const r = el.getBoundingClientRect();
        el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 10, clientY: r.top + 10 }));
        return 'menu';
      })()`);
      if (hadithOpened === 'menu') {
        await until(`!!document.querySelector('[role="menuitem"]')`);
        const clicked = await evaluate(`(() => {
          const items = [...document.querySelectorAll('[role="menuitem"]')];
          const item = items.find(i => /Explain it back|اشرح بأسلوبك/.test(i.textContent || ''));
          if (!item) return false;
          item.click();
          return true;
        })()`);
        assert.ok(clicked, 'Explain it back menu item found on real hadith in ' + lang);
      } else {
        assert.equal(hadithOpened, true, 'Hadith explain-back entry point opened in ' + lang);
      }

      await until(`!!document.querySelector('[data-explain-back-modal]')`);
      const hadithExplanation = lang === 'ar'
        ? 'النية أساس قبول الأعمال الصالحة.'
        : 'Deeds are judged according to intentions.';
      await evaluate(`(() => {
        const ta = document.querySelector('[data-explain-back-input]');
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
        setter.call(ta, ${JSON.stringify(hadithExplanation)});
        ta.dispatchEvent(new Event('input', { bubbles: true }));
      })()`);
      await evaluate(`document.querySelector('[data-explain-back-submit]')?.click()`);
      await until(`!!document.querySelector('[data-explain-back-feedback]')`);
      await shot(`hadith-feedback-${lang}`);
      await evaluate(`document.querySelector('[data-ui-dialog="modal"] button[aria-label]')?.click()`);
      await until(`!document.querySelector('[data-explain-back-modal]')`);

      results[lang] = { ayah: true, hadith: true, noteSaved: true };
    }

    assert.equal(errors.length, 0, 'Renderer errors: ' + JSON.stringify(errors));
    assert.ok(capturedPrompts.length >= 4, 'Stubbed provider received all 4 prompts (ar/en ayah+hadith)');

    fs.writeFileSync(
      path.join(evidence, 'result.json'),
      JSON.stringify({ ok: true, results, promptsCount: capturedPrompts.length, errors }, null, 2)
    );
    console.log('KEY-437 live verification PASSED:', results);
    app.exit(0);
  } finally {
    stubServer.close();
  }
}

require('../../dist/main/index.js');
