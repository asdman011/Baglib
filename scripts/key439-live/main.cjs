// KEY-439 Phase 1 live verification in Electron (ar & en, real Arabic & English PDFs, stubbed local Ollama tool-calling server).
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
setTimeout(() => { console.error('KEY-439 hard timeout'); app.exit(1); }, 180_000).unref();

let stubPort = 0;
let currentFixture = null;

function startStubOllama() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/api/chat') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          const parsed = JSON.parse(body || '{}');
          const userMsg = parsed.messages?.find(m => m.role === 'user')?.content || '';
          const isCancel = /CANCEL_ME|ألغِ/u.test(userMsg);
          const f = currentFixture;

          const tool_calls = isCancel
            ? [
                {
                  id: 'call_cancel',
                  type: 'function',
                  function: {
                    name: 'create_note',
                    arguments: { title: f.cancelTitle, content: 'Should never be saved' },
                  },
                },
              ]
            : [
                {
                  id: 'call_1',
                  type: 'function',
                  function: {
                    name: 'create_note',
                    arguments: { title: f.newNoteTitle, content: f.newNoteContent },
                  },
                },
                {
                  id: 'call_2',
                  type: 'function',
                  function: {
                    name: 'append_to_note',
                    arguments: { noteId: f.existingNoteId, text: f.appendText },
                  },
                },
                {
                  id: 'call_3',
                  type: 'function',
                  function: {
                    name: 'create_cards_from_selection',
                    arguments: {
                      cards: [{ front: f.cardFront, back: f.cardBack }],
                      sourceKind: 'book',
                      sourceRef: `book:${f.bookId}#p=2`,
                      sourceLabel: f.bookTitle,
                      workId: f.bookId,
                      language: f.lang,
                    },
                  },
                },
                {
                  id: 'call_4',
                  type: 'function',
                  function: {
                    name: 'add_to_personal_list',
                    arguments: {
                      listId: 'starred',
                      itemKind: 'ayah',
                      itemRef: 'quran:hafs:1:1',
                      label: f.listItemLabel,
                    },
                  },
                },
                {
                  id: 'call_5',
                  type: 'function',
                  function: {
                    name: 'open_source',
                    arguments: {
                      target: `book:${f.bookId}#p=2`,
                      label: f.bookTitle,
                    },
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

    console.log('KEY-439 waiting for app ready...');
    await until('!!window.electronAPI && !!document.querySelector("[data-nav-item=library]")');

    // Import real Arabic and English PDFs from tests/real-files/
    const arPdf = path.resolve('tests/real-files/pdf/ar/text-layer/الدفاع عن اراضي المسلمين اهم فروض الاعيان للشيخ عبدالله عزام.pdf');
    const enPdf = path.resolve('tests/real-files/pdf/en/text-layer/Why lyrics last_ evolution, cognition, and Shakesp.pdf');
    assert.ok(fs.existsSync(arPdf), 'Missing real Arabic PDF');
    assert.ok(fs.existsSync(enPdf), 'Missing real English PDF');

    const imported = await evaluate(`(async () => {
      await window.electronAPI.settings.set("onboarding.v1", { seen: true });
      await window.electronAPI.settings.set("workspace.tabs.v1", null);
      await window.electronAPI.settings.set("workspace.closed.v1", null);
      await window.electronAPI.ai.saveSettings({
        enabled: true,
        provider: 'ollama',
        ollamaEndpoint: 'http://127.0.0.1:${stubPort}',
        ollamaModel: 'stub-tools-model',
      });
      const arBook = await window.electronAPI.addBook({ filePath: ${JSON.stringify(arPdf)}, title: 'الدفاع عن أراضي المسلمين', digitalFormat: 'pdf', language: 'ar' });
      const enBook = await window.electronAPI.addBook({ filePath: ${JSON.stringify(enPdf)}, title: 'Why Lyrics Last', digitalFormat: 'pdf', language: 'en' });
      const arNote = await window.electronAPI.studyNotes.save({ title: 'ملاحظة أساسية', content: 'نص المستخدم الأصلي.', aliases: [], tags: [] });
      const enNote = await window.electronAPI.studyNotes.save({ title: 'Base Study Note', content: 'Original user text.', aliases: [], tags: [] });
      return { arBookId: arBook.id, enBookId: enBook.id, arNoteId: arNote.id, enNoteId: enNote.id };
    })()`);

    const results = {};
    for (const lang of ['ar', 'en']) {
      console.log(`KEY-439 testing lang=${lang}...`);
      currentFixture = lang === 'ar'
        ? {
            lang: 'ar',
            bookId: imported.arBookId,
            bookTitle: 'الدفاع عن أراضي المسلمين',
            existingNoteId: imported.arNoteId,
            cancelTitle: 'ملاحظة ملغاة',
            newNoteTitle: 'ملخص الذكاء الاصطناعي',
            newNoteContent: 'محتوى تم إنشاؤه للاختبار.',
            appendText: 'إضافة مذيّلة بالذكاء الاصطناعي.',
            cardFront: 'ما هي الفكرة الرئيسة؟',
            cardBack: 'الفكرة الرئيسة من النص.',
            listItemLabel: 'الفاتحة ١:١',
          }
        : {
            lang: 'en',
            bookId: imported.enBookId,
            bookTitle: 'Why Lyrics Last',
            existingNoteId: imported.enNoteId,
            cancelTitle: 'Cancelled Note',
            newNoteTitle: 'AI Action Summary',
            newNoteContent: 'Generated note content for test.',
            appendText: 'Appended insight from AI.',
            cardFront: 'Why do lyrics last?',
            cardBack: 'Because rhythm and melody aid memory.',
            listItemLabel: 'Al-Fatihah 1:1',
          };

      await evaluate(`window.electronAPI.settings.set("workspace.tabs.v1", null)`);
      await evaluate(`localStorage.setItem("baglib-lang", ${JSON.stringify(lang)})`);
      await evaluate(`location.reload()`);
      await until(`!!window.electronAPI && !!document.querySelector('[data-assistant-fab]')`);

      // Open GlobalAssistant and enable Actions mode
      await evaluate(`document.querySelector('[data-assistant-fab]').click()`);
      await until(`!!document.querySelector('[data-assistant-actions-mode]')`);
      await evaluate(`document.querySelector('[data-assistant-actions-mode]').click()`);

      // 1. Test Cancel flow
      await evaluate(`(() => {
        const input = document.querySelector('[data-research-ai-input]');
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
        setter.call(input, ${JSON.stringify(lang === 'ar' ? 'ألغِ إنشاء ملاحظة' : 'CANCEL_ME create a note')});
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.form.requestSubmit();
      })()`);
      await until(`!!document.querySelector('[data-ai-action-cancel]')`);
      await evaluate(`document.querySelector('[data-ai-action-cancel]').click()`);
      await until(`!!document.querySelector('[data-ai-action-cancelled]')`);
      const afterCancelNotes = await evaluate(`window.electronAPI.studyNotes.list()`);
      assert.ok(!afterCancelNotes.some(n => n.title === currentFixture.cancelTitle), 'Cancelled note must not exist');

      // 2. Test multi-step Plan -> Preview -> Confirm
      await evaluate(`(() => {
        const input = document.querySelector('[data-research-ai-input]');
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
        setter.call(input, ${JSON.stringify(lang === 'ar' ? 'نفذ جميع إجراءات المرحلة الأولى' : 'Run all phase 1 actions')});
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.form.requestSubmit();
      })()`);
      await until(`document.querySelectorAll('[data-ai-action-status="pending"] [data-ai-action-step]').length === 5`);
      await shot(`01-preview-${lang}`);

      await evaluate(`document.querySelector('[data-ai-action-status="pending"] [data-ai-action-confirm]').click()`);
      await until(`!!document.querySelector('[data-ai-action-executed]') && !!document.querySelector('[data-ai-action-undo]')`);
      await pause(800);
      await shot(`02-executed-${lang}`);

      const afterConfirm = await evaluate(`(async () => {
        const notes = await window.electronAPI.studyNotes.list();
        const cards = await window.electronAPI.knowledgeCards.list({ search: '' });
        const starredRes = await window.electronAPI.personalLists.invoke('items', 'starred');
        return { notes, cards, starred: starredRes.ok ? starredRes.data : [] };
      })()`);
      assert.ok(afterConfirm.notes.some(n => n.title === currentFixture.newNoteTitle), 'Created note missing');
      const appended = afterConfirm.notes.find(n => n.id === currentFixture.existingNoteId);
      assert.ok(appended && appended.content.includes(currentFixture.appendText), 'Appended text missing');
      const createdCard = afterConfirm.cards.find(c => c.front === currentFixture.cardFront);
      assert.ok(createdCard && createdCard.memorizing === false, 'Card must be in review state (memorizing=false)');
      assert.ok(afterConfirm.starred.some(i => i.itemRef === 'quran:hafs:1:1'), 'Starred item missing');

      // 3. Test Undo
      await evaluate(`document.querySelector('[data-ai-action-undo]').click()`);
      await until(`!!document.querySelector('[data-ai-action-undone-entry]')`);
      await shot(`03-undone-${lang}`);

      const afterUndo = await evaluate(`(async () => {
        const notes = await window.electronAPI.studyNotes.list();
        const cards = await window.electronAPI.knowledgeCards.list({ search: '' });
        const starredRes = await window.electronAPI.personalLists.invoke('items', 'starred');
        return { notes, cards, starred: starredRes.ok ? starredRes.data : [] };
      })()`);
      assert.ok(!afterUndo.notes.some(n => n.title === currentFixture.newNoteTitle), 'Created note not undone');
      const restored = afterUndo.notes.find(n => n.id === currentFixture.existingNoteId);
      assert.ok(restored && !restored.content.includes(currentFixture.appendText), 'Appended note not restored');
      assert.ok(!afterUndo.cards.some(c => c.front === currentFixture.cardFront), 'Created card not undone');
      assert.ok(!afterUndo.starred.some(i => i.itemRef === 'quran:hafs:1:1'), 'Starred item not undone');

      results[lang] = { ok: true, steps: 5, cancelled: true, undone: true };
    }

    assert.deepEqual(errors, [], 'Expected zero renderer errors, got: ' + JSON.stringify(errors));
    fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify({ ok: true, results, errors }, null, 2));
    console.log('KEY-439 live verification PASS');
    app.exit(0);
  } finally {
    stubServer.close();
  }
}

require('../../dist/main/index.js');
