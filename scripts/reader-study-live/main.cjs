const { app } = require('electron');
const fs = require('node:fs'); const path = require('node:path'); const assert = require('node:assert/strict');
const profile = process.env.BAGLIB_SELECTION_PROFILE, evidence = process.env.BAGLIB_SELECTION_EVIDENCE, lang = process.env.BAGLIB_SELECTION_LANG;
const files = JSON.parse(process.env.BAGLIB_SELECTION_FILES);
app.setPath('userData', profile); app.setAppPath(path.resolve(__dirname, '../..'));
app.setAsDefaultProtocolClient = () => { throw new Error('No registration in live check'); };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms)); let started = false;
app.on('browser-window-created', (_, win) => {
  if (started) return; started = true;
  win.webContents.setBackgroundThrottling(false);
  const evaluate = code => win.webContents.executeJavaScript(code, true);
  const until = async code => { for (let i = 0; i < 300; i++) { try { if (await evaluate(code)) return; } catch {} await pause(200); } throw new Error(`Timeout ${code}`); };
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const shot = async name => { win.show(); win.focus(); win.webContents.focus(); await pause(700); fs.writeFileSync(path.join(evidence, `${lang}-${name}.png`), (await win.webContents.capturePage()).toPNG()); };
  const key = async (keyCode, modifiers = []) => { win.show(); win.focus(); win.webContents.focus(); win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers }); if (keyCode === 'Enter') win.webContents.sendInputEvent({type:'char',keyCode:'\r'}); await pause(80); win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers }); await pause(250); };
  const closeReader = async () => { await evaluate(`document.querySelector('button[title=${JSON.stringify(lang === 'ar' ? 'العودة للمكتبة' : 'Back to Library')} ]')?.click()`); await until('!document.querySelector("[data-reader-source]")'); };
  const notes = async () => {
    await evaluate(`Array.from(document.querySelectorAll('aside button')).find(b=>b.getAttribute('aria-label')===${JSON.stringify(lang === 'ar' ? 'سجل الملاحظات' : 'Notes Log')})?.click()`);
    await until('!!document.querySelector("[data-saved-cards]") && !!document.querySelector("[data-srs-review]")');
  };
  const open = async (book, page) => {
    app.emit('open-url', { preventDefault() {} }, `baglib:book:${book.id}@${book.sourceId}#p=${page}`);
    await until(`document.querySelector('[data-reader-source]')?.dataset.readerSource===${JSON.stringify(book.sourceId)}`);
    if (book.digitalFormat === 'EPUB') {
      await until('!!document.querySelector("[data-study-epub-page]")');
      // The cover has no selectable text. Select a real paragraph on a later rendered page.
      for (let i = 0; i < 15; i++) {
        if (await evaluate("[...document.querySelectorAll('[data-study-epub-page] p')].some(e=>e.textContent.trim().length>80)")) break;
        await evaluate("document.querySelector('[data-reader-source]').focus()"); await key('PageDown'); await pause(600);
      }
      await until("[...document.querySelectorAll('[data-study-epub-page] p')].some(e=>e.textContent.trim().length>40)");
    } else await until(`!!document.querySelector('.pdf-page-container[data-page-number="${page}"] canvas') && document.querySelector('[data-reader-page]')?.dataset.readerPage==='${page}'`);
    if (!book.id.startsWith('scan') && book.digitalFormat !== 'EPUB') {
      await until(`[...document.querySelectorAll('.pdf-page-container[data-page-number="${page}"] .textLayer span')].some(e=>e.textContent.trim().length>=4)`);
    }
    await pause(600);
  };
  const select = async (book, page) => {
    win.show(); win.focus(); win.webContents.focus();
    const selected = await evaluate(`(()=>{
      const root=${book.digitalFormat === 'EPUB' ? "[...document.querySelectorAll('[data-study-epub-page] p')].find(e=>e.textContent.trim().length>40)" : `document.querySelector('.pdf-page-container[data-page-number="${page}"] .textLayer')`};
      if(!root)throw new Error('No text root');
      const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;
      while((node=walker.nextNode()) && node.textContent.trim().length<4){}
      if(!node)throw new Error('No text');
      const range=document.createRange();const start=node.textContent.length>20?5:0;range.setStart(node,start);range.setEnd(node,Math.min(node.textContent.length,start+70));
      root.scrollIntoView({block:'center'});window.getSelection().removeAllRanges();window.getSelection().addRange(range);
      root.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
      return range.toString().trim();})()`);
    await until('!!document.querySelector("[data-reader-study=explain]")');
    await until('document.activeElement?.dataset.readerStudy==="explain"');
    return selected;
  };
  (async () => {
    win.setContentSize(1280, 900); win.show(); win.focus(); win.webContents.focus();
    await until('!!window.electronAPI && !!document.querySelector("footer")');
    await evaluate(`localStorage.setItem('baglib-lang',${JSON.stringify(lang)})`); win.reload();
    await until('!!window.electronAPI && !!document.querySelector("footer")'); await key('Escape');
    let books = await evaluate('window.electronAPI.getAllBooks()');
    for (const file of files) if (!books.some(b => b.id === file.id)) await evaluate(`window.electronAPI.addBook(${JSON.stringify({ id: file.id, title: `Study عِلْم — ${file.id}`, bookType: 'digital', digitalFormat: file.format, filePath: file.path })})`);
    win.reload(); await until('!!window.electronAPI && !!document.querySelector("footer")'); await key('Escape');
    books = await evaluate('window.electronAPI.getAllBooks()'); const results = [];
    for (const width of [1280, 480]) {
      win.setContentSize(width, 900);
      for (const file of files.filter(f => !f.id.startsWith('scan'))) {
        const book = books.find(b => b.id === file.id); book.digitalFormat = file.format;
        console.log(JSON.stringify({ lang, width, file: file.id, stage: 'open' }));
        await open(book, file.page);
        if (width === 480) await evaluate(`document.querySelector('[data-reader-chrome="tools"] button[aria-label=${JSON.stringify(lang === 'ar' ? 'إخفاء أدوات PDF' : 'Hide PDF Tools')}]')?.click()`);
        const text = await select(book, file.page); assert.ok(text.length);
        assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
        await shot(`${file.id}-menu-${width}`);
        // Explain via actual focused native Enter, preserving the selected source.
        await key('Enter'); await until('!!document.querySelector("[data-assistant-reader-source]")');
        assert.ok((await evaluate('document.querySelector("[data-assistant-reader-source]").textContent')).includes(text));
        await shot(`${file.id}-explain-${width}`);
        await key('Escape'); await until('!document.querySelector("[data-study-assistant]")');
        // Tab reaches Practice and Review later without hover.
        await evaluate("document.querySelector('[data-reader-study=explain]').focus()"); await key('Tab');
        assert.equal(await evaluate('document.activeElement?.dataset.readerStudy'), 'practice');
        await key('Enter'); await until('!!document.querySelector("[data-reader-study-editor]")');
        assert.equal(await evaluate('document.querySelector("[data-question-editor] textarea").value'), text);
        assert.equal(await evaluate('document.querySelector("[data-question-editor] select").value'), 'recall');
        // Use a numeric question to exercise the KEY-281 answer/attempt path afterward.
        await evaluate("(()=>{const s=document.querySelector('[data-question-editor] select');s.value='numeric';s.dispatchEvent(new Event('change',{bubbles:true}));})()");
        await until('!!document.querySelector("[data-question-editor] input[type=number]")');
        await evaluate("(()=>{const e=document.querySelector('[data-question-editor] input[type=number]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'3');e.dispatchEvent(new Event('input',{bubbles:true}));})()");
        await shot(`${file.id}-practice-${width}`);
        await evaluate("(()=>{const f=document.querySelector('[data-question-editor]');f.requestSubmit();f.requestSubmit();})()");
        await until('!document.querySelector("[data-reader-study-editor]")');
        let cards = await evaluate('window.electronAPI.knowledgeCards.list()');
        const practice = cards.find(c => c.front === text && c.questionKind === 'numeric' && c.workId === book.id); assert.ok(practice);
        assert.ok(practice.sourceRef.includes('@' + book.sourceId));
        assert.equal(practice.sourceRef.includes('#cfi='), file.format === 'EPUB');
        await evaluate("document.querySelector('[data-reader-study=explain]').focus()"); await key('Tab'); await key('Tab');
        assert.equal(await evaluate('document.activeElement?.dataset.readerStudy'), 'review');
        await key('Enter');
        await evaluate("document.querySelector('[data-reader-study=review]').click();document.querySelector('[data-reader-study=review]').click()");
        await until(`window.electronAPI.knowledgeCards.list().then(cards=>cards.some(c=>c.front===${JSON.stringify(text)}&&c.workId===${JSON.stringify(book.id)}&&c.questionKind==='recall'&&c.memorizing))`);
        cards = await evaluate('window.electronAPI.knowledgeCards.list()');
        const matching = cards.filter(c => c.front === text && c.workId === book.id && c.questionKind === 'recall'); assert.equal(matching.length, 1);
        const review = matching[0]; assert.equal(review.back, '');
        const queue = await evaluate('window.electronAPI.knowledgeCards.reviewQueue()'); assert.ok(queue.cards.some(c => c.id === review.id));
        await closeReader(); await notes();
        await click(`[data-saved-card="${practice.id}"] [data-card-source]`);
        await until(`document.querySelector('[data-reader-source]')?.dataset.readerSource===${JSON.stringify(book.sourceId)}`);
        if (file.format === 'EPUB') {
          await until('!!document.querySelector("[data-study-passage]")');
          assert.equal((await evaluate('window.getSelection().toString()')).replace(/\s/gu, ''), text.replace(/\s/gu, ''));
        } else await until(`document.querySelector('[data-reader-page]')?.dataset.readerPage==='${file.page}'`);
        await shot(`${file.id}-card-source-${width}`); await closeReader(); await notes();
        await until(`document.querySelector('[data-srs-card]')?.dataset.srsCard===${JSON.stringify(review.id)}`);
        await click(`[data-srs-card="${review.id}"] [data-card-source]`);
        await until(`document.querySelector('[data-reader-source]')?.dataset.readerSource===${JSON.stringify(book.sourceId)}`);
        if (file.format === 'EPUB') { await until('!!document.querySelector("[data-study-passage]")'); assert.equal((await evaluate('window.getSelection().toString()')).replace(/\s/gu, ''), text.replace(/\s/gu, '')); }
        else await until(`document.querySelector('[data-reader-page]')?.dataset.readerPage==='${file.page}'`);
        await shot(`${file.id}-srs-source-${width}`); await closeReader(); await notes();
        // Answer the authored numeric card using the normal saved-card practice flow.
        await evaluate(`document.querySelector('[data-saved-card="${practice.id}"] .flex.flex-wrap button').click()`);
        const root = `[data-saved-card="${practice.id}"]`;
        await until(`!!document.querySelector('${root} [data-practice-reveal]')`);
        await click(`${root} input[name="confidence-${practice.id}"][value="3"]`);
        await evaluate(`(()=>{const e=document.querySelector('${root} textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'٣');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
        await click(`${root} [data-practice-reveal]`); await until(`!!document.querySelector('${root} [data-practice-save]')`);
        await click(`${root} [data-practice-save]`); await until(`!!document.querySelector('${root} [data-practice-saved]')`);
        const attempts = await evaluate(`window.electronAPI.knowledgeCards.listAttempts({knowledgeId:${JSON.stringify(practice.id)}})`);
        assert.equal(attempts.length, 1); assert.equal(attempts[0].sourceRef, practice.sourceRef); assert.equal(attempts[0].result, 'correct');
        results.push({ width, file: file.id, text, practice, review, attempt: attempts[0] });
        // Isolate the next case so SRS always exposes this case's sole review card.
        await evaluate(`Promise.all([window.electronAPI.knowledgeCards.remove(${JSON.stringify(practice.id)}),window.electronAPI.knowledgeCards.remove(${JSON.stringify(review.id)})])`);
      }
      const scan = files.find(f => f.id === 'scan-ar'); const book = books.find(b => b.id === scan.id); book.digitalFormat = 'PDF';
      await open(book, scan.page); await pause(1000);
      assert.equal(await evaluate("[...document.querySelectorAll('.textLayer span')].some(e=>e.textContent.trim())"), false);
      assert.equal(await evaluate('!!document.querySelector("[data-reader-study]")'), false);
      await shot(`scan-no-text-${width}`); await closeReader();
    }
    fs.writeFileSync(path.join(evidence, `${lang}-checks.json`), JSON.stringify({ passed: true, results }, null, 2)); app.quit();
  })().catch(async error => {
    console.error(error); fs.writeFileSync(path.join(evidence, `${lang}-failure.txt`), String(error.stack));
    fs.writeFileSync(path.join(evidence, `${lang}-failure-dom.html`), await evaluate('document.body.innerHTML').catch(() => ''));
    await shot('failure').catch(() => {}); app.exit(1);
  });
});
require('../../dist/main/index.js');
