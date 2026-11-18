// KEY-398 live check: a real book with two real highlights (a highlight and a comment, real text and
// pages). Mark it finished → "Time to revise!" → make the deck → suggest AI questions (a fake local
// Ollama on 127.0.0.1 stands in for the provider) → accept them → the cards quote the book verbatim
// with the page and are labelled AI-generated. Then the book/category dialog in the deck manager,
// and turning the prompt off. One language per launch, window off-screen (KEY-408).
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');

const directory = process.env.BAGLIB_BREV_PROFILE;
const evidence = process.env.BAGLIB_BREV_EVIDENCE;
const language = process.env.BAGLIB_BREV_LANG || 'ar';
const realPdf = process.env.BAGLIB_BREV_PDF;
const passages = JSON.parse(process.env.BAGLIB_BREV_PASSAGES);

app.setPath('userData', directory);
app.setAppPath(path.resolve(__dirname, '../..'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

// The fake provider: one Q&A question per annotation and one multiple-choice question for the first.
const requests = [];
const fake = http.createServer((req, res) => {
  let body = '';
  req.on('data', chunk => (body += chunk));
  req.on('end', () => {
    const input = JSON.parse(body);
    const user = JSON.parse(input.messages[1].content);
    requests.push({ system: input.messages[0].content.slice(0, 120), annotations: user.annotations.length });
    const ar = language === 'ar';
    const questions = user.annotations.flatMap((a, i) => [
      { source: a.id, kind: 'qa', question: ar ? `ما الفكرة في المقطع ${i + 1}؟` : `What is the idea of passage ${i + 1}?`, answer: a.passage.slice(0, 80) },
      ...(i === 0 ? [{ source: a.id, kind: 'choice', question: ar ? 'أيّ العبارات وردت في الكتاب؟' : 'Which phrase is in the book?', answer: a.passage.slice(0, 40), options: [ar ? 'عبارة أخرى' : 'Another phrase', a.passage.slice(0, 40), ar ? 'عبارة ثالثة' : 'A third phrase'], correct: 1 }] : []),
    ]);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: { content: JSON.stringify({ questions }) } }));
  });
});

let started = false;
app.on('browser-window-created', (_, owner) => {
  if (started) return;
  started = true;
  const errors = [];
  owner.webContents.on('console-message', (_e, level, message) => {
    if (level >= 3) errors.push(message.slice(0, 400));
  });
  owner.webContents.on('did-finish-load', () => {
    owner.webContents.executeJavaScript("window.electronAPI && window.electronAPI.settings.set('onboarding.v1',{seen:true})").catch(() => {});
  });
  const evaluate = code => owner.webContents.executeJavaScript(code, true).catch(error => {
    throw new Error(`${error.message}: ${code.slice(0, 240)}`);
  });
  const until = async (code, tries = 150) => {
    for (let i = 0; i < tries; i++) {
      try {
        if (await evaluate(`(async()=>(${code}))()`)) return;
      } catch {
        /* retry */
      }
      await pause(200);
    }
    throw new Error(`Timed out: ${code}`);
  };
  const shot = async name => {
    await pause(500);
    owner.webContents.invalidate();
    await pause(300);
    fs.writeFileSync(path.join(evidence, `${name}-${language}.png`), (await owner.webContents.capturePage()).toPNG());
  };
  const loadApp = async () => {
    for (let attempt = 1; ; attempt++) {
      try {
        await owner.loadURL('http://localhost:3000');
        return;
      } catch (error) {
        if (attempt >= 4) throw error;
        await pause(1000);
      }
    }
  };
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const setSelect = (selector, value) =>
    evaluate(`(()=>{const s=document.querySelector(${JSON.stringify(selector)});const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;set.call(s,${JSON.stringify(value)});s.dispatchEvent(new Event('change',{bubbles:true}));})()`);

  (async () => {
    const results = { language, passages };
    await new Promise(resolve => fake.listen(0, '127.0.0.1', resolve));
    const port = fake.address().port;
    owner.setContentSize(1280, 900);
    for (let i = 0; i < 150 && (!owner.webContents.getURL().startsWith('http://localhost:3000') || owner.webContents.isLoading()); i++) await pause(200);
    await loadApp();
    await evaluate(`localStorage.setItem('baglib-lang','${language}');localStorage.setItem('baglib-theme','dark')`);
    await loadApp();
    await until('!!window.electronAPI?.bookRevision && !!document.querySelector("footer")');
    await evaluate(`window.electronAPI.ai.saveSettings({ enabled: true, provider: 'ollama', ollamaEndpoint: 'http://127.0.0.1:${port}', ollamaModel: 'fake' })`);

    // A real book with a real highlight and a real comment.
    await evaluate(`window.electronAPI.importDigitalFile({ filePath: ${JSON.stringify(realPdf)}, copyToStorage: false })`);
    const book = (await evaluate(`window.electronAPI.getAllBooks()`))[0];
    assert.ok(book, 'real book imported');
    results.book = { id: book.id, title: book.title };
    const [p1, p2] = passages;
    await evaluate(`window.electronAPI.saveAnnotation({ bookId: ${JSON.stringify(book.id)}, type: 'highlight', locationCfiOrPage: '${p1.page}', selectedText: ${JSON.stringify(p1.text)}, color: '#ffeb3b' })`);
    const comment = language === 'ar' ? 'تعليقي: هذه فكرة أريد مراجعتها' : 'My comment: an idea I want to revise';
    await evaluate(`window.electronAPI.saveAnnotation({ bookId: ${JSON.stringify(book.id)}, type: 'note', locationCfiOrPage: '${p2.page}', selectedText: ${JSON.stringify(p2.text)}, noteContent: ${JSON.stringify(comment)}, color: '#ffeb3b' })`);
    await loadApp();
    await until('!!window.electronAPI?.bookRevision && !!document.querySelector("footer")');
    await pause(800);

    // 1. Finish the book → "Time to revise!".
    await evaluate(`window.electronAPI.updateReadingStatus(${JSON.stringify(book.id)}, 'completed')`);
    await until(`!!document.querySelector('[data-book-finished-prompt]')`);
    results.prompt = await evaluate(`document.querySelector('[data-book-finished-prompt]').textContent`);
    await shot('01-time-to-revise');
    await click('[data-book-finished-deck]');
    await until(`!!document.querySelector('[data-book-finished-message]')`, 300);
    results.deckMessage = await evaluate(`document.querySelector('[data-book-finished-message]').textContent`);
    const deck = (await evaluate(`window.electronAPI.knowledgeCards.deckTree()`)).find(d => d.name === book.title.replace(/::/gu, ':'));
    assert.ok(deck, 'the book deck exists');
    const deckNotes = await evaluate(`window.electronAPI.cardNotes.listNotes({ deckId: ${JSON.stringify(deck.id)}, limit: 50 })`);
    assert.equal(deckNotes.length, 2, 'the highlight and the comment became cards');
    assert.ok(deckNotes.some(n => Object.values(n.fields).some(v => String(v).includes(p1.text.slice(0, 20).replace(/&/gu, '&amp;')))), 'the highlight text is on its card');

    // 2. Suggest AI questions, accept them.
    await click('[data-book-finished-questions]');
    await until(`!!document.querySelector('[data-book-questions-dialog]') && !!document.querySelector('[data-book-questions-generate]') && !document.querySelector('[data-book-questions-generate]').disabled`, 200);
    await click('[data-book-questions-generate]');
    await until(`document.querySelectorAll('[data-book-question]').length >= 3 || !!document.querySelector('[data-book-questions-error]')`, 300);
    const genError = await evaluate(`document.querySelector('[data-book-questions-error]')?.textContent ?? ''`);
    assert.equal(genError, '', `questions suggested without error: ${genError}`);
    results.suggested = await evaluate(`document.querySelectorAll('[data-book-question]').length`);
    const notesBefore = (await evaluate(`window.electronAPI.cardNotes.listNotes({ deckId: ${JSON.stringify(deck.id)}, limit: 50 })`)).length;
    assert.equal(notesBefore, 2, 'nothing saved before accepting');
    // Accept the Q&A on the highlight and the multiple-choice question; reject the comment's question.
    await click('[data-book-question-accept="0"]');
    await click('[data-book-question-accept="1"]');
    await click('[data-book-question-reject="2"]');
    await shot('02-ai-questions');
    await click('[data-book-questions-save]');
    await until(`!!document.querySelector('[data-book-questions-message]') || !!document.querySelector('[data-book-questions-error]')`, 300);
    const saveError = await evaluate(`document.querySelector('[data-book-questions-error]')?.textContent ?? ''`);
    assert.equal(saveError, '', `accepted without error: ${saveError}`);
    results.acceptMessage = await evaluate(`document.querySelector('[data-book-questions-message]').textContent`);
    const after = await evaluate(`window.electronAPI.cardNotes.listNotes({ deckId: ${JSON.stringify(deck.id)}, limit: 50 })`);
    const ai = after.filter(n => (n.sourceRef ?? '').startsWith('ai-question:'));
    results.aiCards = ai.length;
    assert.equal(ai.length, 2, 'two accepted questions saved, the rejected one not');
    const label = language === 'ar' ? 'مولَّد بالذكاء الاصطناعي' : 'AI-generated';
    const pageLabel = language === 'ar' ? `ص ${p1.page}` : `p. ${p1.page}`;
    assert.ok(ai.every(n => n.fields.Back.includes(label)), 'labelled as AI-generated');
    assert.ok(ai.some(n => n.fields.Back.includes(pageLabel)), 'the page of the passage');
    assert.ok(ai.some(n => n.noteTypeId === 'stock-multiple-choice'), 'the multiple-choice question');
    await click('[data-close-book-questions]');

    // 3. The deck manager's book/category dialog (reuses the book's deck).
    await evaluate(`document.querySelector('[data-nav-item="notes"]')?.click()`);
    await until(`!!document.querySelector('button[data-notes-tab="cards"]')`);
    await click('button[data-notes-tab="cards"]');
    await until(`!!document.querySelector('[data-open-book-deck-btn]')`);
    await click('[data-open-book-deck-btn]');
    await until(`!!document.querySelector('[data-book-deck-dialog]') && !!document.querySelector('[data-book-deck-book] option[value=${JSON.stringify(book.id)}]')`);
    await setSelect('[data-book-deck-book]', book.id);
    await shot('03-book-deck-dialog');
    await click('[data-book-deck-create]');
    await until(`!!document.querySelector('[data-book-deck-message]') || !!document.querySelector('[data-book-deck-error]')`, 300);
    assert.equal(await evaluate(`document.querySelector('[data-book-deck-error]')?.textContent ?? ''`), '', 'book deck from the dialog');
    results.dialogMessage = await evaluate(`document.querySelector('[data-book-deck-message]').textContent`);
    const decksNamed = (await evaluate(`window.electronAPI.knowledgeCards.deckTree()`)).filter(d => d.name === book.title.replace(/::/gu, ':'));
    assert.equal(decksNamed.length, 1, 'the same deck is reused, not duplicated');
    await click('[data-close-book-deck]');

    // 4. Turning the prompt off: finishing the book again shows nothing.
    await evaluate(`window.electronAPI.updateReadingStatus(${JSON.stringify(book.id)}, 'reading')`);
    await evaluate(`window.electronAPI.updateReadingStatus(${JSON.stringify(book.id)}, 'completed')`);
    await until(`!!document.querySelector('[data-book-finished-prompt]')`);
    await click('[data-book-finished-off]');
    await evaluate(`window.electronAPI.updateReadingStatus(${JSON.stringify(book.id)}, 'reading')`);
    await evaluate(`window.electronAPI.updateReadingStatus(${JSON.stringify(book.id)}, 'completed')`);
    await pause(1500);
    assert.equal(await evaluate(`!!document.querySelector('[data-book-finished-prompt]')`), false, 'no prompt once turned off');
    assert.equal(await evaluate(`window.electronAPI.bookRevision.finishedPrompt()`), false);

    results.aiRequests = requests;
    results.rendererErrors = errors.filter(line => !/Download the React DevTools|favicon/u.test(line));
    fs.writeFileSync(path.join(evidence, `results-${language}.json`), JSON.stringify(results, null, 2));
    console.log(`[brev-live-${language}] passed`, JSON.stringify({ ...results, passages: undefined }));
    fake.close();
    app.exit(0);
  })().catch(error => {
    console.error(`[brev-live-${language}] FAILED`, error);
    try {
      fs.writeFileSync(path.join(evidence, `error-${language}.txt`), String(error && error.stack ? error.stack : error));
    } catch {
      /* ignore */
    }
    owner.webContents.capturePage().then(
      img => {
        fs.writeFileSync(path.join(evidence, `error-${language}.png`), img.toPNG());
        app.exit(1);
      },
      () => app.exit(1)
    );
  });
});

require('../../dist/main/index.js');
