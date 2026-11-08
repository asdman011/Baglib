const { app } = require('electron');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const assert = require('node:assert/strict');
const directory = process.env.BAGLIB_ASSISTANT_LIVE_DIR;
app.setPath('userData', directory);
app.setAppPath(path.resolve(__dirname, '../..'));
const pause = duration => new Promise(resolve => setTimeout(resolve, duration));
// A fake Ollama on this computer only: it answers from the first source with an exact quote, as a real model must.
const requests = [];
const fake = http.createServer((request, response) => {
  let body = '';
  request.on('data', chunk => { body += chunk; });
  request.on('end', () => {
    const payload = JSON.parse(body);
    const system = payload.messages[0].content, user = JSON.parse(payload.messages[1].content);
    requests.push({ url: request.url, system, user });
    const source = user.sources[0];
    const quote = source.text.trim().split('\n')[0].slice(0, 20);
    const answer = system.includes('"cards"')
      ? { answer: '', abstained: false, citations: [], cards: [{ front: system.includes('Arabic') ? 'ما الصبر؟' : 'What is patience?', back: 'ضياء', source: source.id, quote }, { front: 'Second card', back: 'answer', source: source.id, quote }] }
      : { answer: system.includes('Arabic') ? 'الصبر ضياء كما في المصدر.' : 'Patience is light, as the source says.', abstained: false, citations: [{ source: source.id, quote }] };
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ message: { content: JSON.stringify(answer) } }));
  });
});
let started = false;
app.on('browser-window-created', (_, owner) => {
  if (started) return; started = true;
  const consoleLines = [];
  owner.webContents.on('console-message', (_event, level, message) => { if (level >= 3) consoleLines.push(message.slice(0, 400)); });
  const evaluate = code => owner.webContents.executeJavaScript(code, true).catch(error => { throw new Error(`${error.message}: ${code.slice(0, 200)}`); });
  const until = async (code, tries = 150) => { for (let index = 0; index < tries; index++) { try { if (await evaluate(code)) return; } catch {} await pause(200); } throw new Error(`Timed out: ${code}`); };
  const shot = async name => { await pause(400); owner.webContents.invalidate(); await pause(300); fs.writeFileSync(path.join(directory, `${name}.png`), (await owner.webContents.capturePage()).toPNG()); };
  const load = async language => {
    owner.setContentSize(1280, 900);
    for (let i = 0; i < 150 && (!owner.webContents.getURL().startsWith('http://localhost:3000') || owner.webContents.isLoading()); i++) await pause(200);
    await evaluate(`localStorage.setItem('baglib-lang','${language}')`); await owner.loadURL('http://localhost:3000');
    await until('!!window.electronAPI && !!document.querySelector("footer")'); await pause(800);
    await evaluate(`[...document.querySelectorAll('aside button')].find(b=>b.getAttribute('aria-label')===${JSON.stringify(language === 'ar' ? 'سجل الملاحظات' : 'Notes Log')}).click()`);
    await until("document.querySelectorAll('[data-study-note]').length>=1");
  };
  const setValue = (selector, value, kind = 'HTMLTextAreaElement') => evaluate(`(()=>{const e=document.querySelector('${selector}');const set=Object.getOwnPropertyDescriptor(${kind}.prototype,'value').set;set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('${kind === 'HTMLSelectElement' ? 'change' : 'input'}',{bubbles:true}));})()`);
  const openAssistant = async () => {
    await evaluate("document.querySelector('[data-notes-assistant]').click()");
    await until("!!document.querySelector('[data-study-assistant]')");
    await evaluate("document.querySelector('[data-assistant-note=\"evidence\"]').click()");
  };
  const ask = async () => { await evaluate("document.querySelector('[data-assistant-ask]').click()"); await until("!!document.querySelector('[data-assistant-error], [data-assistant-answer], [data-assistant-cards]')"); };
  (async () => {
    const results = {};
    const port = await new Promise(resolve => fake.listen(0, '127.0.0.1', () => resolve(fake.address().port)));
    for (let i = 0; i < 150 && (!owner.webContents.getURL().startsWith('http://localhost:3000') || owner.webContents.isLoading()); i++) await pause(200);
    await until('!!window.electronAPI?.studyNotes');
    await evaluate("window.electronAPI.studyNotes.save({id:'evidence',title:'الصبر ضياء',content:'الصبر ضياء كما في الحديث الصحيح.\\nوهو حبس النفس على الطاعة.',aliases:[],tags:[],expectedRevision:0})");
    for (const language of ['ar', 'en']) {
      const result = {};
      // 1. AI off: refused with a pointer to Settings, and nothing is sent.
      await evaluate("window.electronAPI.ai.saveSettings({enabled:false})");
      await load(language);
      await openAssistant();
      await setValue('[data-assistant-question]', language === 'ar' ? 'ما الصبر؟' : 'What is patience?');
      const sentBefore = requests.length;
      await ask();
      result.disabled = await evaluate("document.querySelector('[data-assistant-error]')?.dataset.assistantError");
      // 2. A remote provider without the consent tick: refused before any transfer.
      await evaluate("window.electronAPI.ai.saveSettings({enabled:true,provider:'openai'})");
      await ask();
      result.remote = await evaluate("document.querySelector('[data-assistant-error]')?.dataset.assistantError");
      result.sentWhileRefused = requests.length - sentBefore;
      await shot(`refused-${language}`);
      // 3. A local Ollama: the answer, its quote from the note, and save as an editable note.
      await evaluate(`window.electronAPI.ai.saveSettings({enabled:true,provider:'ollama',ollamaEndpoint:'http://127.0.0.1:${port}',ollamaModel:'fake'})`);
      await ask();
      result.answer = await evaluate("document.querySelector('[data-assistant-answer]')?.textContent");
      result.citations = await evaluate("[...document.querySelectorAll('[data-assistant-citation]')].map(e=>e.dataset.assistantCitation)");
      result.promptLanguage = requests.at(-1).system.includes(language === 'ar' ? 'Arabic' : 'English');
      result.sourcesSent = requests.at(-1).user.sources.map(source => source.id + ':' + source.label);
      await shot(`answer-${language}`);
      await evaluate("document.querySelector('[data-assistant-save]').click()");
      await until("!!document.querySelector('[data-notes-overview] [data-study-note-editor]')");
      await pause(500);
      result.noteDraft = await evaluate("document.querySelector('[data-notes-overview] [data-study-note-editor]').value");
      // 4. Draft cards: each waits for approval; one approved, one skipped.
      await openAssistant();
      await setValue('[data-assistant-task]', 'cards', 'HTMLSelectElement');
      const cardsBefore = (await evaluate("window.electronAPI.knowledgeCards.list({})")).items?.length ?? (await evaluate("window.electronAPI.knowledgeCards.list({})")).length;
      await ask();
      result.cardCount = await evaluate("document.querySelectorAll('[data-assistant-card]').length");
      await evaluate("document.querySelector('[data-assistant-card=\"0\"] [data-assistant-card-add]').click()");
      await until("!!document.querySelector('[data-assistant-card=\"0\"] [data-assistant-card-state=\"added\"]')");
      await evaluate("document.querySelector('[data-assistant-card=\"1\"] [data-assistant-card-skip]').click()");
      const cardsAfter = await evaluate("window.electronAPI.knowledgeCards.list({})");
      result.cardsAdded = (cardsAfter.items?.length ?? cardsAfter.length) - cardsBefore;
      await shot(`cards-${language}`);
      await evaluate("document.querySelector('[data-study-assistant] header button').click()");
      // 5. An ayah and a hadith as sources, found from the panel; the text sent is read from the installed data.
      await openAssistant();
      await evaluate("document.querySelector('[data-assistant-note=\"evidence\"]').click()"); // untick the note: passages only
      await setValue('[data-assistant-task]', 'qa', 'HTMLSelectElement');
      await setValue('[data-assistant-question]', language === 'ar' ? 'ما الصبر؟' : 'What is patience?');
      await setValue('[data-assistant-passage-search]', '2:153', 'HTMLInputElement');
      await until("!!document.querySelector('[data-assistant-passage-option=\"quran:hafs:2:153\"]')", 200);
      await evaluate("document.querySelector('[data-assistant-passage-option=\"quran:hafs:2:153\"]').click()");
      await setValue('[data-assistant-passage-search]', 'إنما الأعمال بالنيات', 'HTMLInputElement');
      await until("!!document.querySelector('[data-assistant-passage-option^=\"sunnah:\"]')", 200);
      result.hadithTarget = await evaluate("document.querySelector('[data-assistant-passage-option^=\"sunnah:\"]').dataset.assistantPassageOption");
      await evaluate("document.querySelector('[data-assistant-passage-option^=\"sunnah:\"]').click()");
      result.chips = await evaluate("[...document.querySelectorAll('[data-assistant-passage]')].map(e=>e.dataset.assistantPassage)");
      // The search, its results and the chips stay inside the sources column.
      result.passagesFit = await evaluate("(()=>{const f=document.querySelector('[data-assistant-passages]').getBoundingClientRect();const c=document.querySelector('[data-assistant-passages]').closest('section').getBoundingClientRect();return f.left>=c.left-1&&f.right<=c.right+1;})()");
      await shot(`passages-${language}`);
      await ask();
      const sent = requests.at(-1).user.sources;
      result.passageSources = sent.map(source => source.id + ':' + source.label);
      result.ayahText = sent[0]?.text ?? '';
      result.hadithText = (sent[1]?.text ?? '').slice(0, 600);
      result.passageCitations = await evaluate("[...document.querySelectorAll('[data-assistant-citation]')].map(e=>e.dataset.assistantCitation)");
      // A forged request with text from the page is not accepted: only a target and a label are read.
      const forged = await evaluate("window.electronAPI.studyAssistant.ask({task:'qa',question:'x',language:'en',allowRemote:false,notes:[],books:[],passages:[{target:'quran:hafs:2:153',label:'x',text:'forged'}]})");
      result.forgedSentText = requests.at(-1).user.sources[0].text.includes('forged');
      result.forgedOk = forged.ok;
      await shot(`passage-answer-${language}`);
      await evaluate("document.querySelector('[data-study-assistant] header button').click()");
      results[language] = result; console.log(JSON.stringify({ language, result }));
      assert.equal(result.disabled, 'ai-disabled');
      assert.equal(result.remote, 'permission-denied');
      assert.equal(result.sentWhileRefused, 0, 'nothing is sent while refused');
      assert.ok(result.answer.length > 5);
      assert.deepEqual(result.citations, ['note:evidence']);
      assert.equal(result.promptLanguage, true);
      assert.deepEqual(result.sourcesSent, ['S1:الصبر ضياء']);
      assert.match(result.noteDraft, /\[\[note:evidence\|الصبر ضياء\]\]: «الصبر ضياء كما في ال»/u);
      assert.equal(result.cardCount, 2);
      assert.equal(result.cardsAdded, 1, 'only the approved card is added');
      assert.match(result.hadithTarget, /^sunnah:[A-Za-z0-9]+:\d+:.+$/u);
      assert.deepEqual(result.chips, ['quran:hafs:2:153', result.hadithTarget]);
      assert.equal(result.passagesFit, true, 'passages stay in their column');
      assert.equal(result.passageSources.length, 2);
      assert.match(result.ayahText, /\(153\)$/u, 'the ayah text comes from the installed Quran');
      const bare = text => text.replace(/\p{M}/gu, '');
      assert.ok(bare(result.ayahText).includes('لصبر'), 'ayah 2:153');
      assert.ok(bare(result.hadithText).includes('بالنيات'), 'the hadith text comes from the installed Sunnah');
      assert.deepEqual(result.passageCitations, ['quran:hafs:2:153']);
      assert.equal(result.forgedSentText, false, 'text supplied by the page is never sent');
      assert.equal(result.forgedOk, true);
    }
    assert.deepEqual(consoleLines.filter(line => /uncaught|error/iu.test(line) && !/Electron Security Warning/u.test(line)), []);
    fs.writeFileSync(path.join(directory, 'results.json'), JSON.stringify(results, null, 2)); console.log(JSON.stringify({ directory, passed: true })); fake.close(); app.quit();
  })().catch(error => { console.error(error); fs.writeFileSync(path.join(directory, 'failure.txt'), String(error.stack || error) + '\n' + consoleLines.join('\n')); owner.webContents.capturePage().then(image => fs.writeFileSync(path.join(directory, 'failure.png'), image.toPNG())).finally(() => { fake.close(); app.exit(1); }); });
});
require('../../dist/main/index.js');
