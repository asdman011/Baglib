// KEY-436 live verification in Electron (ar & en, real Arabic & English PDFs, stubbed local Ollama server).
// Tests Settings -> AI -> Learning mode per module, Revision (off -> hints -> full), and Study Assistant (hints -> off -> full).
const { app } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const profile = process.env.BAGLIB_KEY436_PROFILE;
const evidence = process.env.BAGLIB_KEY436_EVIDENCE;
assert.equal(path.dirname(profile), fs.realpathSync('.baglib-data'));

app.setPath('userData', profile);
app.setAppPath(process.cwd());

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
setTimeout(() => { console.error('KEY-436 hard timeout'); app.exit(1); }, 220_000).unref();

let stubPort = 0;
const stubCalls = [];

function startStubOllama() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/api/chat') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          const parsed = JSON.parse(body || '{}');
          const system = parsed.messages?.find(m => m.role === 'system')?.content || '';
          const user = parsed.messages?.find(m => m.role === 'user')?.content || '';
          const isHints = system.includes('LEARNING MODE — HINTS ONLY:');
          const isJson = Boolean(parsed.format) || system.includes('Return JSON only:');
          const isAr = /Arabic|العربية/u.test(system) || /[\u0600-\u06FF]/u.test(user);
          stubCalls.push({ isHints, isJson, isAr, user: user.slice(0, 200) });

          let content;
          if (isJson) {
            content = JSON.stringify({
              answer: isHints
                ? (isAr ? 'تلميح: راجع تعريف المبدأ في ملاحظتك وفكّر في مثاله.' : 'Hint: check the principle definition in your note and think of an example.')
                : (isAr ? 'الإجابة الكاملة: المبدأ يثبت بالبرهان والنص من الملاحظة.' : 'Full answer: the principle is established by the evidence in the note.'),
              abstained: false,
              citations: [
                {
                  source: 'S1',
                  quote: 'This study note records the core principle and its supporting evidence',
                },
              ],
            });
          } else {
            content = isHints
              ? (isAr ? 'تلميح: فكّر أولاً في الدليل المذكور قبل طلب الإجابة.' : 'Hint: think first about the cited evidence before asking for the answer.')
              : (isAr ? 'الإجابة الكاملة: هذا هو الشرح الكامل والمباشر للمسألة.' : 'Full answer: this is the complete direct explanation.');
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: { role: 'assistant', content } }));
        });
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ models: [{ name: 'stub-learning-model' }] }));
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
      let domInfo = '';
      try {
        domInfo = await win.webContents.executeJavaScript('JSON.stringify({ url: location.href, hasStudy: !!document.querySelector("[data-study-assistant]"), err: document.querySelector("[data-assistant-error]")?.textContent, activeTab: document.querySelector("[data-tab-active]")?.textContent })', true);
      } catch {}
      fs.writeFileSync(path.join(evidence, 'failure.txt'), (error.stack || String(error)) + '\n' + domInfo + '\n' + JSON.stringify(errors));
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
      await pause(280);
      win.webContents.invalidate();
      await pause(180);
      fs.writeFileSync(path.join(evidence, name + '.png'), (await win.webContents.capturePage()).toPNG());
    };

    console.log('KEY-436 waiting for app ready...');
    await until('!!window.electronAPI && !!document.querySelector("[data-nav-item=library]")');

    // Configure local stub Ollama with default learningModes (revision: off, others: hints)
    await evaluate(`window.electronAPI.ai.saveSettings({
      enabled: true,
      provider: 'ollama',
      ollamaEndpoint: 'http://127.0.0.1:${stubPort}',
      ollamaModel: 'stub-learning-model',
      learningModes: { revision: 'off', reader: 'hints', quran: 'hints', sunnah: 'hints', notes: 'hints', researchEditor: 'hints' }
    })`);

    const realPdfAr = path.resolve('tests/real-files/pdf/ar/text-layer/الدفاع عن اراضي المسلمين اهم فروض الاعيان للشيخ عبدالله عزام.pdf');
    const realPdfEn = path.resolve('tests/real-files/pdf/en/text-layer/Why lyrics last_ evolution, cognition, and Shakesp.pdf');
    assert.ok(fs.existsSync(realPdfAr), 'Missing real Arabic PDF');
    assert.ok(fs.existsSync(realPdfEn), 'Missing real English PDF');
    await evaluate(`window.electronAPI.settings.set("onboarding.v1", { seen: true })`);
    const importAr = await evaluate(`window.electronAPI.addBook({ filePath: ${JSON.stringify(realPdfAr)}, title: 'الدفاع عن أراضي المسلمين', digitalFormat: 'pdf', language: 'ar' })`);
    const importEn = await evaluate(`window.electronAPI.addBook({ filePath: ${JSON.stringify(realPdfEn)}, title: 'Why Lyrics Last', digitalFormat: 'pdf', language: 'en' })`);
    assert.ok(importAr?.id && importEn?.id, 'Real PDF import failed');

    const noteRes = await evaluate(`window.electronAPI.studyNotes.save({
      title: 'KEY-436 Learning Mode Note',
      content: 'This study note records the core principle and its supporting evidence for revision and study assistant checks.',
      aliases: [],
      tags: ['key436']
    })`);
    const noteId = noteRes.id;
    assert.ok(noteId, 'Study note creation failed');

    await evaluate(`window.electronAPI.knowledgeCards.save({
      front: 'What is the core principle in KEY-436?',
      back: 'Learners try first before seeing full answers.',
      sourceKind: 'note',
      sourceRef: 'note:' + ${JSON.stringify(noteId)},
      sourceLabel: 'KEY-436 Learning Mode Note'
    })`);

    const results = {};

    for (const lang of ['ar', 'en']) {
      console.log('KEY-436 testing language:', lang);
      // Clear workspace tabs before each language run
      await evaluate(`Promise.all([
        window.electronAPI.settings.set('workspace.tabs.v1', null),
        window.electronAPI.settings.set('workspace.closed.v1', null),
        window.electronAPI.ai.saveSettings({
          learningModes: { revision: 'off', reader: 'hints', quran: 'hints', sunnah: 'hints', notes: 'hints', researchEditor: 'hints' }
        })
      ]).then(() => localStorage.setItem('baglib-lang', ${JSON.stringify(lang)}))`);
      win.webContents.reload();
      await until('!!window.electronAPI && !!document.querySelector("[data-nav-item=library]")');
      await until(`document.documentElement.dir === ${JSON.stringify(lang === 'ar' ? 'rtl' : 'ltr')}`);

      // 1. Open Settings -> AI -> verify Learning mode controls
      await evaluate(`document.querySelector("[data-nav-item=settings]").click()`);
      await until('!!document.querySelector("[data-settings-entry=ai]")');
      await evaluate(`document.querySelector("[data-settings-entry=ai]").click()`);
      await until('!!document.querySelector("[data-learning-modes-section]")');
      const defaultsOk = await evaluate(`(() => {
        const rev = document.querySelector("[data-learning-mode-select=revision]")?.value;
        const notes = document.querySelector("[data-learning-mode-select=notes]")?.value;
        return rev === 'off' && notes === 'hints';
      })()`);
      assert.equal(defaultsOk, true, 'Default learning modes mismatch in Settings UI');
      await shot('01-settings-' + lang);
      await evaluate(`document.querySelector("[role=dialog] button")?.click()`);
      await pause(150);

      // 2. Enter Revision session (SrsReviewScreen) and test all 3 modes (off -> hints -> full)
      await evaluate(`document.querySelector("[data-nav-item=notes]")?.click()`);
      await until('!!document.querySelector("[data-notes-tab=cards]")');
      await evaluate(`document.querySelector("[data-notes-tab=cards]").click()`);
      await until('!!document.querySelector("[data-start-review-header]")');
      await evaluate(`document.querySelector("[data-start-review-header]").click()`);
      await until('!!document.querySelector("[data-srs-review-screen]")');

      // 2a. Revision = Off
      await evaluate(`document.querySelector("[data-assistant-fab]").click()`);
      await until('!!document.querySelector("[data-assistant-panel]")');
      await until('document.querySelector("[data-assistant-learning-mode]")?.getAttribute("data-assistant-learning-mode") === "off"');
      const revOffDisabled = await evaluate(`!!document.querySelector("[data-assistant-learning-mode-off]") && document.querySelector("[data-research-ai-input]")?.disabled === true`);
      assert.equal(revOffDisabled, true, 'Revision Off must disable GlobalAssistant');
      await shot('02-revision-off-' + lang);

      // 2b. Switch Revision -> Hints only
      await evaluate(`window.electronAPI.ai.saveSettings({ learningModes: { revision: 'hints' } }).then(() => window.dispatchEvent(new Event("baglib:ai-settings-changed")))`);
      await until('document.querySelector("[data-assistant-learning-mode]")?.getAttribute("data-assistant-learning-mode") === "hints"');
      const callsBeforeHints = stubCalls.length;
      await evaluate(`(() => {
        const input = document.querySelector("[data-research-ai-input]");
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
        setter.call(input, ${JSON.stringify(lang === 'ar' ? 'ما خلاصة المسألة؟' : 'What is the summary?')});
        input.dispatchEvent(new Event("input", { bubbles: true }));
      })()`);
      await evaluate(`document.querySelector("[data-assistant-panel] form button[type=submit]").click()`);
      await until(`document.querySelectorAll("[data-research-ai-message=assistant]").length >= 1`);
      assert.equal(stubCalls[callsBeforeHints].isHints, true, 'Revision Hints must send hints prompt');
      const noShowBeforeAttempt = await evaluate(`!document.querySelector("[data-assistant-show-full-answer]") && !!document.querySelector("[data-assistant-attempt-input]")`);
      assert.equal(noShowBeforeAttempt, true, 'Show full answer must stay hidden before attempt');
      // Type attempt -> Show full answer appears -> click it
      await evaluate(`(() => {
        const inp = document.querySelector("[data-assistant-attempt-input]");
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
        setter.call(inp, ${JSON.stringify(lang === 'ar' ? 'أظن أن المبدأ هو المحاولة أولاً' : 'My attempt is trying first')});
        inp.dispatchEvent(new Event("input", { bubbles: true }));
      })()`);
      await until('!!document.querySelector("[data-assistant-show-full-answer]")');
      await evaluate(`document.querySelector("[data-assistant-show-full-answer]").click()`);
      await until(`document.querySelectorAll("[data-research-ai-message=assistant]").length >= 2`);
      assert.equal(stubCalls[stubCalls.length - 1].isHints, false, 'Show full answer must bypass hints prompt');
      await shot('03-revision-hints-' + lang);

      // 2c. Switch Revision -> Full help
      await evaluate(`window.electronAPI.ai.saveSettings({ learningModes: { revision: 'full' } }).then(() => window.dispatchEvent(new Event("baglib:ai-settings-changed")))`);
      await until('document.querySelector("[data-assistant-learning-mode]")?.getAttribute("data-assistant-learning-mode") === "full"');
      await evaluate(`(() => {
        const input = document.querySelector("[data-research-ai-input]");
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
        setter.call(input, ${JSON.stringify(lang === 'ar' ? 'اشرح لي مباشرة' : 'Explain directly')});
        input.dispatchEvent(new Event("input", { bubbles: true }));
      })()`);
      await evaluate(`document.querySelector("[data-assistant-panel] form button[type=submit]").click()`);
      await until(`document.querySelectorAll("[data-research-ai-message=assistant]").length >= 3`);
      assert.equal(stubCalls[stubCalls.length - 1].isHints, false, 'Revision Full must not use hints prompt');
      await shot('04-revision-full-' + lang);

      // Close GlobalAssistant & exit SrsReviewScreen
      await evaluate(`document.querySelector("[data-assistant-fab]").click()`);
      await evaluate(`document.querySelector("[data-srs-exit-button]")?.click()`);
      await until('!document.querySelector("[data-srs-review-screen]")');
      await pause(150);

      // 3. Open StudyAssistant via GlobalAssistant's study tools button and test hints -> off -> full
      await evaluate(`document.querySelector("[data-notes-tab=notes]")?.click()`);
      await evaluate(`document.querySelector("[data-assistant-fab]").click()`);
      await until('!!document.querySelector("[data-assistant-study-tools]")');
      await evaluate(`document.querySelector("[data-assistant-study-tools]").click()`);
      await until('!!document.querySelector("[data-study-assistant]")');
      await evaluate(`document.querySelector("[data-assistant-note]")?.click()`);

      // 3a. Study Assistant = Hints only (default for notes)
      await until('document.querySelector("[data-study-assistant] [data-assistant-learning-mode]")?.getAttribute("data-assistant-learning-mode") === "hints"');
      await evaluate(`(() => {
        const q = document.querySelector("[data-assistant-question]");
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
        setter.call(q, ${JSON.stringify(lang === 'ar' ? 'ما الفكرة؟' : 'What is the idea?')});
        q.dispatchEvent(new Event("input", { bubbles: true }));
      })()`);
      await evaluate(`document.querySelector("[data-assistant-ask]").click()`);
      await until('!!document.querySelector("[data-study-assistant] [data-assistant-answer]")');
      assert.equal(stubCalls[stubCalls.length - 1].isHints, true, 'StudyAssistant Hints must send hints prompt');
      await evaluate(`(() => {
        const inp = document.querySelector("[data-study-assistant] [data-assistant-attempt-input]");
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
        setter.call(inp, ${JSON.stringify(lang === 'ar' ? 'محاولتي: الفكرة هي التدرج' : 'My attempt: gradual learning')});
        inp.dispatchEvent(new Event("input", { bubbles: true }));
      })()`);
      await until('!!document.querySelector("[data-study-assistant] [data-assistant-show-full-answer]")');
      await evaluate(`document.querySelector("[data-study-assistant] [data-assistant-show-full-answer]").click()`);
      await until('document.querySelectorAll("[data-study-assistant] [data-assistant-answer]").length >= 2');
      assert.equal(stubCalls[stubCalls.length - 1].isHints, false, 'StudyAssistant Show full answer must bypass hints prompt');
      await shot('05-study-hints-' + lang);

      // 3b. Study Assistant = Off
      await evaluate(`window.electronAPI.ai.saveSettings({ learningModes: { notes: 'off' } }).then(() => window.dispatchEvent(new Event("baglib:ai-settings-changed")))`);
      await until('document.querySelector("[data-study-assistant] [data-assistant-learning-mode]")?.getAttribute("data-assistant-learning-mode") === "off"');
      const studyOffDisabled = await evaluate(`!!document.querySelector("[data-study-assistant] [data-assistant-learning-mode-off]") && document.querySelector("[data-assistant-ask]")?.disabled === true`);
      assert.equal(studyOffDisabled, true, 'StudyAssistant Off must disable Ask button');
      await shot('06-study-off-' + lang);

      // 3c. Study Assistant = Full help
      await evaluate(`window.electronAPI.ai.saveSettings({ learningModes: { notes: 'full' } }).then(() => window.dispatchEvent(new Event("baglib:ai-settings-changed")))`);
      await until('document.querySelector("[data-study-assistant] [data-assistant-learning-mode]")?.getAttribute("data-assistant-learning-mode") === "full"');
      await evaluate(`document.querySelector("[data-assistant-ask]").click()`);
      await until('document.querySelectorAll("[data-study-assistant] [data-assistant-answer]").length >= 3');
      assert.equal(stubCalls[stubCalls.length - 1].isHints, false, 'StudyAssistant Full must not use hints prompt');
      await shot('07-study-full-' + lang);

      await evaluate(`document.querySelector("[data-study-assistant] header button")?.click()`);
      results[lang] = { ok: true };
    }

    assert.equal(errors.length, 0, 'Renderer console errors: ' + JSON.stringify(errors));
    fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify({
      ok: true,
      errors,
      stubCallsCount: stubCalls.length,
      results,
    }, null, 2));
    app.exit(0);
  } finally {
    stubServer.close();
  }
}

require('../../dist/main/index.js');
