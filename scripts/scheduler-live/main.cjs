// KEY-389 live check: Anki-parity scheduler in Arabic (RTL) and English (LTR) through the UI.
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const directory = process.env.BAGLIB_SCHEDULER_PROFILE;
const evidence = process.env.BAGLIB_SCHEDULER_EVIDENCE;
const language = process.env.BAGLIB_SCHEDULER_LANG || 'ar';

app.setPath('userData', directory);
app.setAppPath(path.resolve(__dirname, '../..'));

const pause = duration => new Promise(resolve => setTimeout(resolve, duration));
let started = false;

app.on('browser-window-created', (_, owner) => {
  if (started) return;
  started = true;

  const consoleLines = [];
  owner.webContents.on('console-message', (_event, level, message) => {
    if (level >= 3) consoleLines.push(message.slice(0, 400));
  });

  owner.webContents.on('did-finish-load', () => {
    owner.webContents
      .executeJavaScript("window.electronAPI && window.electronAPI.settings.set('onboarding.v1',{seen:true})")
      .catch(() => {});
  });

  const evaluate = code =>
    owner.webContents.executeJavaScript(code, true).catch(error => {
      throw new Error(`${error.message}: ${code.slice(0, 240)}`);
    });

  const until = async (code, tries = 150) => {
    for (let index = 0; index < tries; index++) {
      try {
        if (await evaluate(`(async()=>(${code}))()`)) return;
      } catch {
        /* retry */
      }
      await pause(200);
    }
    throw new Error(`Timed out: ${code}`);
  };

  const setValue = (selector, value) =>
    evaluate(`(()=>{
      const e = document.querySelector(${JSON.stringify(selector)});
      if (!e) throw new Error('Missing element: ' + ${JSON.stringify(selector)});
      const proto = e instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(e, ${JSON.stringify(String(value))});
      e.dispatchEvent(new Event(e instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);

  const shot = async name => {
    await pause(350);
    owner.webContents.invalidate();
    await pause(250);
    fs.writeFileSync(path.join(evidence, `${name}.png`), (await owner.webContents.capturePage()).toPNG());
  };

  const load = async lang => {
    owner.setContentSize(1280, 900);
    for (
      let i = 0;
      i < 150 && (!owner.webContents.getURL().startsWith('http://localhost:3000') || owner.webContents.isLoading());
      i++
    ) {
      await pause(200);
    }
    await owner.loadURL('http://localhost:3000');
    await evaluate(`localStorage.setItem('baglib-lang','${lang}')`);
    await owner.loadURL('http://localhost:3000');
    await until('!!window.electronAPI && !!document.querySelector("footer")');
    await pause(800);
  };

  (async () => {
    const report = { language };
    await load(language);

    // Import a real PDF from tests/real-files to ensure real library context exists
    const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../tests/real-files/manifest.json'), 'utf8'));
    const realPdf = manifest.files.find(f => f.kind === 'pdf' && f.lang === language && f.textLayer === 'yes');
    if (realPdf) {
      const absPdf = path.resolve(__dirname, '../../tests/real-files', realPdf.path);
      await evaluate(`window.electronAPI.importDigitalFile({ filePath: ${JSON.stringify(absPdf)}, copyToStorage: false })`);
      report.importedRealPdf = realPdf.path;
    }

    // Open Notes -> Knowledge Cards tab
    console.log(`[scheduler-live:${language}] Navigating to Knowledge Cards & Deck Manager`);
    await evaluate(`document.querySelector('[data-nav-item="notes"]').click()`);
    await until(`!!document.querySelector('[data-notes-tab="cards"]')`);
    await evaluate(`document.querySelector('[data-notes-tab="cards"]').click()`);
    await until(`!!document.querySelector('[data-deck-manager]')`);

    // 1. Create a deck tree through the UI (Parent -> Child)
    console.log(`[scheduler-live:${language}] 1. Creating deck tree through UI`);
    const parentName = language === 'ar' ? 'العلوم الشرعية' : 'Islamic Studies';
    const childName = language === 'ar' ? 'تفسير وحفظ' : 'Quran Study';
    const fullChildName = `${parentName}::${childName}`;

    await setValue('[data-deck-create-name]', parentName);
    await evaluate(`document.querySelector('[data-deck-create-btn]').click()`);
    await until(`!!document.querySelector('[data-deck-fullname=${JSON.stringify(parentName)}]')`);

    const parentId = await evaluate(
      `document.querySelector('[data-deck-fullname=${JSON.stringify(parentName)}]').getAttribute('data-deck-node')`
    );
    assert.ok(parentId, 'Parent deck node created');

    await setValue('[data-deck-create-parent]', parentId);
    await setValue('[data-deck-create-name]', childName);
    await evaluate(`document.querySelector('[data-deck-create-btn]').click()`);
    await until(`!!document.querySelector('[data-deck-fullname=${JSON.stringify(fullChildName)}]')`);

    const childId = await evaluate(
      `document.querySelector('[data-deck-fullname=${JSON.stringify(fullChildName)}]').getAttribute('data-deck-node')`
    );
    assert.ok(childId, 'Child deck node created under parent');
    report.deckTree = { parentId, childId, fullChildName };
    await shot(`01-deck-tree-${language}`);

    // 2. Set a preset with steps of 1m 10m and 5 new cards per day through the UI
    console.log(`[scheduler-live:${language}] 2. Configuring preset (1m 10m, 5 new/day)`);
    await evaluate(`document.querySelector('[data-deck-options=${JSON.stringify(childId)}]').click()`);
    await until(`!!document.querySelector('[data-deck-options-modal]')`);
    await evaluate(`document.querySelector('[data-preset-new-btn]').click()`);
    await pause(300);
    await setValue('[data-preset-name-input]', language === 'ar' ? 'إعداد ٥ يوميا' : '5 New Per Day');
    await setValue('[data-preset-learn-steps]', '1 10');
    await setValue('[data-preset-new-per-day]', 5);
    await shot(`02-deck-options-${language}`);
    await evaluate(`document.querySelector('[data-preset-save-btn]').click()`);
    await until(`!document.querySelector('[data-deck-options-modal]')`);

    // 3. Add a range of ayahs (Al-Baqarah 255-261 = 7 ayahs) and see New = 5
    console.log(`[scheduler-live:${language}] 3. Adding range of ayahs (2:255-261) and checking New = 5`);
    await evaluate(`(()=>{const d=document.querySelector('[data-card-decks]');d.open=true;d.scrollIntoView({block:'start'});})()`);
    await setValue('[data-card-decks] input[dir="auto"]', fullChildName);
    await setValue('[data-ayah-deck-surah]', 2);
    await setValue('[data-ayah-deck-from]', 255);
    await setValue('[data-ayah-deck-to]', 261);
    await evaluate(`document.querySelector('[data-ayah-deck-generate]').click()`);
    await until(`document.querySelector('[data-deck-new=${JSON.stringify(childId)}]')?.textContent?.trim() === '5'`, 100);

    const newCountBefore = Number(
      await evaluate(`document.querySelector('[data-deck-new=${JSON.stringify(childId)}]').textContent.trim()`)
    );
    assert.equal(newCountBefore, 5, 'New count in child deck must be capped at 5 by preset');
    report.newCountAfterAyahs = newCountBefore;
    await shot(`03-ayahs-new-5-${language}`);

    // 4. Review a card and see a learning card come back
    console.log(`[scheduler-live:${language}] 4. Studying child deck, grading Again (1m step), and seeing learning card come back`);
    await evaluate(`document.querySelector('[data-deck-study=${JSON.stringify(childId)}]').click()`);
    await until(`!!document.querySelector('[data-srs-review-screen]') && !!document.querySelector('[data-srs-card]')`);

    const reviewNewCount = Number(await evaluate(`document.querySelector('[data-srs-new-count]').textContent.trim()`));
    assert.equal(reviewNewCount, 5);
    const firstCardId = await evaluate(`document.querySelector('[data-srs-card]').getAttribute('data-srs-card')`);
    await shot(`04-review-screen-${language}`);

    // Select confidence 2, reveal, and rate 1 (Again -> 1m learning step)
    await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'2',code:'Digit2',bubbles:true}))`);
    await until(`!document.querySelector('[data-srs-reveal]').disabled`);
    await evaluate(`document.querySelector('[data-srs-reveal]').click()`);
    await until(`!!document.querySelector('[data-srs-rating="1"]')`);
    await evaluate(`document.querySelector('[data-srs-rating="1"]').click()`);

    // Wait until New count drops to 4
    await until(`document.querySelector('[data-srs-new-count]')?.textContent?.trim() === '4'`);

    // Set due date of firstCardId to 0 (due now) or wait for the 1m learning step:
    // Wait 61 seconds so the 1m learning step expires naturally in real time!
    console.log(`[scheduler-live:${language}] Waiting ~61s for the 1m learning step to come due naturally...`);
    await until(
      `window.electronAPI.knowledgeCards.reviewQueue(${JSON.stringify(childId)}).then(q => q.learningCount === 1)`,
      350
    );
    await evaluate(`document.querySelector('button[aria-label]') && window.dispatchEvent(new Event('baglib:knowledge-card-saved'))`);
    await until(`document.querySelector('[data-srs-learning-count]')?.textContent?.trim() === '1'`);

    const learningCountNow = Number(
      await evaluate(`document.querySelector('[data-srs-learning-count]').textContent.trim()`)
    );
    const currentCardId = await evaluate(`document.querySelector('[data-srs-card]').getAttribute('data-srs-card')`);
    assert.equal(learningCountNow, 1, 'Learning card must come back with Learning = 1');
    assert.equal(currentCardId, firstCardId, 'The learning card is at the front of the queue');
    report.learningCardCameBack = true;
    await shot(`05-learning-card-back-${language}`);

    // 5. Forget the card through the UI menu and see it back in New (New = 5, Learning = 0)
    console.log(`[scheduler-live:${language}] 5. Forgetting the learning card and seeing it back in New`);
    await evaluate(`document.querySelector('[data-srs-card-menu-trigger]').click()`);
    await until(`!!document.querySelector('[data-srs-forget-card]')`);
    await evaluate(`document.querySelector('[data-srs-forget-card]').click()`);
    await until(`document.querySelector('[data-srs-new-count]')?.textContent?.trim() === '5'`);

    const newAfterForget = Number(await evaluate(`document.querySelector('[data-srs-new-count]').textContent.trim()`));
    const learnAfterForget = Number(
      await evaluate(`document.querySelector('[data-srs-learning-count]').textContent.trim()`)
    );
    assert.equal(newAfterForget, 5, 'After Forget, New count returns to 5');
    assert.equal(learnAfterForget, 0, 'After Forget, Learning count returns to 0');
    report.forgetRestoredNew = true;
    await shot(`06-forget-back-in-new-${language}`);

    // Exit review back to Cards tab
    await evaluate(`document.querySelector('[data-srs-exit-button]').click()`);
    await until(`!!document.querySelector('[data-deck-manager]')`);

    // 6. Bury a sibling of a reversed note, and see that a different note about the same ayah is NOT buried
    console.log(`[scheduler-live:${language}] 6. Verifying sibling burying vs different note about same ayah`);
    const buryDeck = await evaluate(`window.electronAPI.knowledgeCards.createDeck({ name: 'BuryCheck-${language}' })`);
    const revNote = await evaluate(`
      window.electronAPI.cardNotes.saveNote({
        noteTypeId: 'stock-basic-reversed',
        fields: { Front: 'آية الكرسي ٢:٢٥٥ (وجه ١)', Back: 'ٱللَّهُ لَآ إِلَٰهَ إِلَّا هُوَ (وجه ٢)' },
        sourceRef: 'quran:hafs:2:255',
        deckId: ${JSON.stringify(buryDeck.id)}
      })
    `);
    const otherNoteSameAyah = await evaluate(`
      window.electronAPI.cardNotes.saveNote({
        noteTypeId: 'stock-basic',
        fields: { Front: 'سؤال مستقل عن البقرة ٢٥٥', Back: 'جواب مستقل عن نفس الآية' },
        sourceRef: 'quran:hafs:2:255',
        deckId: ${JSON.stringify(buryDeck.id)}
      })
    `);
    assert.equal(revNote.cards.length, 2);
    assert.equal(otherNoteSameAyah.cards.length, 1);

    await evaluate(`window.dispatchEvent(new Event('baglib:srs-reviewed'))`);
    await until(`!!document.querySelector('[data-deck-study=${JSON.stringify(buryDeck.id)}]')`);
    await evaluate(`document.querySelector('[data-deck-study=${JSON.stringify(buryDeck.id)}]').click()`);
    await until(`!!document.querySelector('[data-srs-review-screen]') && !!document.querySelector('[data-srs-card]')`);

    // Bury siblings of the reversed note via the card menu
    await evaluate(`document.querySelector('[data-srs-card-menu-trigger]').click()`);
    await until(`!!document.querySelector('[data-srs-bury-siblings]')`);
    await evaluate(`document.querySelector('[data-srs-bury-siblings]').click()`);
    await until(`!!document.querySelector('[data-srs-unbury]')`);

    const buryQueue = await evaluate(`window.electronAPI.knowledgeCards.reviewQueue(${JSON.stringify(buryDeck.id)})`);
    assert.equal(buryQueue.buriedCount, 1, 'Exactly 1 sibling card of the reversed note is buried');
    assert.ok(
      buryQueue.cards.some(c => c.id === otherNoteSameAyah.cards[0].id),
      'The separate note about the same ayah is NOT buried'
    );
    report.siblingBuried = true;
    report.otherNoteSameAyahUnburied = true;
    await shot(`07-sibling-bury-${language}`);

    // Also grade the other note's card with Again (rating 1) and advance its last_review by 2 days in DB or set due
    // so prop:r<0.85 has a card with retrievability < 0.85!
    await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'2',code:'Digit2',bubbles:true}))`);
    await until(`!document.querySelector('[data-srs-reveal]').disabled`);
    await evaluate(`document.querySelector('[data-srs-reveal]').click()`);
    await until(`!!document.querySelector('[data-srs-rating="1"]')`);
    await evaluate(`document.querySelector('[data-srs-rating="1"]').click()`);
    await pause(300);

    // Exit review
    await evaluate(`document.querySelector('[data-srs-exit-button]').click()`);
    await until(`!!document.querySelector('[data-deck-manager]')`);

    // 7. Create a filtered deck "prop:r<0.85" through the UI
    console.log(`[scheduler-live:${language}] 7. Creating filtered deck "prop:r<0.85" through UI`);
    await evaluate(`document.querySelector('[data-open-filtered-deck-btn]').click()`);
    await until(`!!document.querySelector('[data-filtered-deck-modal]')`);
    await evaluate(`document.querySelector('[data-filtered-preset="weakest"]').click()`);
    await setValue('[data-filtered-deck-name]', language === 'ar' ? 'مراجعة الأضعف' : 'Weakest Cards');
    const filterSearchVal = await evaluate(`document.querySelector('[data-filtered-deck-search]').value`);
    assert.equal(filterSearchVal, 'prop:r<0.85');
    await shot(`08-filtered-deck-modal-${language}`);
    await evaluate(`document.querySelector('[data-filtered-deck-submit]').click()`);
    await until(`!document.querySelector('[data-filtered-deck-modal]')`);
    await until(`!!document.querySelector('[data-srs-review-screen]')`);
    await evaluate(`document.querySelector('[data-srs-exit-button]').click()`);
    await until(`!!document.querySelector('[data-deck-manager]')`);
    report.filteredDeckCreated = true;

    // 8. Switch the day start to midnight through the Settings UI
    console.log(`[scheduler-live:${language}] 8. Switching day start to midnight in Settings`);
    await evaluate(`document.querySelector('[data-nav-item="settings"]').click()`);
    await until(`!!document.querySelector('[data-settings-entry="srsRollover"]')`);
    await evaluate(`document.querySelector('[data-settings-entry="srsRollover"]').click()`);
    await until(`!!document.querySelector('[data-rollover-option="0"]') && !document.querySelector('[data-rollover-option="0"]').disabled`);
    await evaluate(`document.querySelector('[data-rollover-option="0"]').click()`);
    await until(`window.electronAPI.knowledgeCards.getRolloverHour().then(h => h === 0)`);
    const savedRollover = await evaluate(`window.electronAPI.knowledgeCards.getRolloverHour()`);
    assert.equal(savedRollover, 0, 'Rollover hour must be updated to 0 (midnight)');
    report.rolloverHourAfterSwitch = savedRollover;
    await shot(`09-settings-rollover-midnight-${language}`);

    assert.deepEqual(
      consoleLines.filter(line => /uncaught/iu.test(line)),
      [],
      'Zero uncaught renderer errors'
    );

    fs.writeFileSync(path.join(evidence, `results-${language}.json`), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ language, passed: true, report }));
    app.quit();
  })().catch(error => {
    console.error(error);
    fs.writeFileSync(
      path.join(evidence, `failure-${language}.txt`),
      String(error.stack || error) + '\n' + consoleLines.join('\n')
    );
    owner.webContents
      .capturePage()
      .then(image => fs.writeFileSync(path.join(evidence, `failure-${language}.png`), image.toPNG()))
      .finally(() => app.exit(1));
  });
});

require('../../dist/main/index.js');
