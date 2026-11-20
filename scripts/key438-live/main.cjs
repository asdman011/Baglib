// KEY-438 live verification in Electron (ar & en, real Arabic & English PDFs, stubbed local Ollama server).
// Verifies cited answers with BagLib links, unsourced statement badges, translation-not-quotation badge,
// and AI-generated cards keeping 'ai-generated' tag & staying out of revision until accepted.
const { app } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const profile = process.env.BAGLIB_KEY438_PROFILE;
const evidence = process.env.BAGLIB_KEY438_EVIDENCE;
assert.equal(path.dirname(profile), fs.realpathSync('.baglib-data'));

app.setPath('userData', profile);
app.setAppPath(process.cwd());

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
setTimeout(() => { console.error('KEY-438 hard timeout'); app.exit(1); }, 220_000).unref();

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
          const isJson = Boolean(parsed.format) || system.includes('Return JSON only:');
          const isCards = system.includes('"cards"');
          const isTranslate = system.includes('Translate') || user.includes('Translate');
          const isAr = /Arabic|العربية/u.test(system) || /[\u0600-\u06FF]/u.test(user);
          stubCalls.push({ isJson, isCards, isTranslate, isAr });

          let content;
          if (isCards) {
            content = JSON.stringify({
              answer: isAr ? 'بطاقة مقترحة [S1].' : 'Suggested card [S1].',
              abstained: false,
              citations: [{ source: 'S1', quote: 'This study note records the core principle' }],
              cards: [
                {
                  front: isAr ? 'ما هو المبدأ الأساسي في الملاحظة؟' : 'What is the core principle in the note?',
                  back: isAr ? 'المبدأ يعتمد على التوثيق بالمصادر.' : 'The principle relies on citing sources.',
                  source: 'S1',
                  quote: 'This study note records the core principle',
                },
              ],
            });
          } else if (isJson) {
            content = JSON.stringify({
              answer: isAr
                ? 'هذا ادعاء موثق من الملاحظة [S1].\nوهذا ادعاء إضافي بدون مصدر.'
                : 'This claim is backed by the note [S1].\nThis extra claim has no citation.',
              abstained: false,
              citations: [{ source: 'S1', quote: 'This study note records the core principle' }],
            });
          } else if (isTranslate) {
            content = isAr ? 'ترجمة تجريبية للنص المختار.' : 'Sample translation of the selected text.';
          } else {
            content = isAr
              ? 'نقطة موثقة من المصدر [1].\nنقطة إضافية غير موثقة.'
              : 'Cited point from the library [1].\nExtra point without a citation.';
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: { role: 'assistant', content } }));
        });
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ models: [{ name: 'stub-cited-model' }] }));
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
        domInfo = await win.webContents.executeJavaScript('JSON.stringify({ url: location.href, hasGlobal: !!document.querySelector("[data-assistant-panel]"), hasStudy: !!document.querySelector("[data-study-assistant]") })', true);
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

    console.log('KEY-438 waiting for app ready...');
    await until('!!window.electronAPI && !!document.querySelector("[data-nav-item=library]")');

    await evaluate(`window.electronAPI.ai.saveSettings({
      enabled: true,
      provider: 'ollama',
      ollamaEndpoint: 'http://127.0.0.1:${stubPort}',
      ollamaModel: 'stub-cited-model',
      translationProvider: 'llm',
      learningModes: { revision: 'off', reader: 'full', quran: 'full', sunnah: 'full', notes: 'full', researchEditor: 'full' }
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
      title: 'KEY-438 Cited Note',
      content: 'This study note records the core principle and its supporting evidence for cited answers.',
      aliases: [],
      tags: ['key438']
    })`);
    const noteId = noteRes.id;
    assert.ok(noteId, 'Study note creation failed');

    const results = {};

    for (const lang of ['ar', 'en']) {
      console.log('KEY-438 testing language:', lang);
      await evaluate(`Promise.all([
        window.electronAPI.settings.set('workspace.tabs.v1', null),
        window.electronAPI.settings.set('workspace.closedTabs.v1', null),
        window.electronAPI.settings.set('language', ${JSON.stringify(lang)})
      ]).then(() => localStorage.setItem('baglib-lang', ${JSON.stringify(lang)}))`);
      await evaluate('location.reload()');
      await until(`document.documentElement.dir === ${JSON.stringify(lang === 'ar' ? 'rtl' : 'ltr')} && !!document.querySelector("[data-nav-item=library]")`);
      await pause(800);

      // 1. Global Assistant: attach note, ask question, verify inline citation link + unsourced badge
      await evaluate('document.querySelector("[data-assistant-fab]").click()');
      await until('!!document.querySelector("[data-assistant-panel]")');
      await evaluate('document.querySelector("[data-assistant-new-chat]")?.click()');
      await evaluate('document.querySelector("[data-assistant-add-source]").click()');
      await until(`!!document.querySelector('[data-assistant-pick="note:${noteId}"]')`);
      await evaluate(`document.querySelector('[data-assistant-pick="note:${noteId}"]').click()`);
      await evaluate(`(() => {
        const ta = document.querySelector('[data-research-ai-input]');
        const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
        set.call(ta, ${JSON.stringify(lang === 'ar' ? 'ما الحكم في هذه المسألة؟' : 'What is the ruling on this?')});
        ta.dispatchEvent(new Event('input', { bubbles: true }));
      })()`);
      await evaluate('document.querySelector("[data-assistant-panel] form button[type=submit]").click()');
      await until('!!document.querySelector("[data-ai-unsourced-badge]")');
      const globalCheck = await evaluate(`({
        unsourcedCount: document.querySelectorAll('[data-assistant-panel] [data-ai-unsourced-badge]').length,
        inlineCiteCount: document.querySelectorAll('[data-assistant-panel] [data-research-ai-inline-citation]').length,
        sourceListCount: document.querySelectorAll('[data-assistant-panel] [data-research-ai-citation]').length
      })`);
      assert.ok(globalCheck.unsourcedCount >= 1, 'Expected unsourced badge in GlobalAssistant');
      assert.ok(globalCheck.inlineCiteCount >= 1 || globalCheck.sourceListCount >= 1, 'Expected BagLib citation link in GlobalAssistant');
      await shot(`01-global-cited-${lang}`);

      // 2. Study Assistant: open via Study Tools, ask QA (unsourced badge) and Cards (add card -> aiGenerated, memorizing=false)
      await evaluate('document.querySelector("[data-assistant-study-tools]").click()');
      await until('!!document.querySelector("[data-study-assistant]")');
      await evaluate(`(() => { const cb = document.querySelector('[data-assistant-note="${noteId}"]'); if (cb && !cb.checked) cb.click(); })()`);
      await evaluate(`(() => {
        const ta = document.querySelector('[data-assistant-question]');
        const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
        set.call(ta, ${JSON.stringify(lang === 'ar' ? 'اشرح المبدأ من الملاحظة' : 'Explain the principle from the note')});
        ta.dispatchEvent(new Event('input', { bubbles: true }));
      })()`);
      await evaluate('document.querySelector("[data-assistant-ask]").click()');
      await until('!!document.querySelector("[data-study-assistant] [data-ai-unsourced-badge]")');

      if (lang === 'en') {
        await evaluate('document.querySelector("[data-assistant-task-option=cards]").click()');
        await until('!!document.querySelector("[data-study-assistant] [data-assistant-card-add]")');
        await evaluate('document.querySelector("[data-study-assistant] [data-assistant-card-add]").click()');
        await until('document.querySelector("[data-study-assistant] [data-assistant-card-state]")?.getAttribute("data-assistant-card-state") === "added"');
        const savedCards = await evaluate('window.electronAPI.knowledgeCards.list({})');
        assert.ok(savedCards.length >= 1, 'Expected AI card to be saved, got: ' + JSON.stringify(savedCards));
        assert.equal(savedCards[0].memorizing, false, 'AI card must stay out of revision');
        assert.equal(savedCards[0].aiGenerated, true, 'AI card must carry ai-generated tag');
      }
      await shot(`02-study-cited-${lang}`);

      // Close StudyAssistant & GlobalAssistant
      await evaluate('document.querySelector("[data-study-assistant] header button")?.click()');
      await until('!document.querySelector("[data-study-assistant]")');
      await evaluate('document.querySelector("[data-assistant-fab]")?.click()');

      // 3. Test Reader Research Drawer translation-not-quotation badge via direct IPC + real book
      const bookId = lang === 'ar' ? importAr.id : importEn.id;
      const transRes = await evaluate(`window.electronAPI.ai.executeTool({
        bookId: ${JSON.stringify(bookId)},
        bookTitle: ${JSON.stringify(lang === 'ar' ? 'الدفاع عن أراضي المسلمين' : 'Why Lyrics Last')},
        currentPage: 1,
        tool: 'inline_translation',
        selectedText: ${JSON.stringify(lang === 'ar' ? 'طلب العلم فريضة' : 'Seeking knowledge is an obligation')},
        targetLang: ${JSON.stringify(lang === 'ar' ? 'en' : 'ar')}
      })`);
      assert.equal(transRes.isTranslation, true, 'Expected inline_translation to set isTranslation=true');

      results[lang] = { globalCheck, transIsTranslation: transRes.isTranslation };
    }

    const resultPayload = { ok: true, stubCallsCount: stubCalls.length, results, errors };
    fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify(resultPayload, null, 2));
    assert.deepEqual(errors, [], 'Expected zero renderer errors');
    console.log('KEY-438 live verification PASSED');
    app.exit(0);
  } finally {
    stubServer.close();
  }
}

require('../../dist/main/index.js');
