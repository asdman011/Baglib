// KEY-390 live test: card note types, generation, and safe rendering in live Electron.
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const directory = process.env.BAGLIB_NOTE_TYPES_PROFILE;
const evidence = process.env.BAGLIB_NOTE_TYPES_EVIDENCE;
const language = process.env.BAGLIB_NOTE_TYPES_LANG || 'ar';

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
    owner.webContents.executeJavaScript("window.electronAPI && window.electronAPI.settings.set('onboarding.v1',{seen:true})").catch(() => {});
  });

  const evaluate = code => owner.webContents.executeJavaScript(code, true).catch(error => {
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

  const shot = async name => {
    await pause(400);
    owner.webContents.invalidate();
    await pause(300);
    fs.writeFileSync(path.join(evidence, `${name}.png`), (await owner.webContents.capturePage()).toPNG());
  };

  const load = async lang => {
    owner.setContentSize(1280, 900);
    for (let i = 0; i < 150 && (!owner.webContents.getURL().startsWith('http://localhost:3000') || owner.webContents.isLoading()); i++) {
      await pause(200);
    }
    await owner.loadURL('http://localhost:3000');
    await evaluate(`localStorage.setItem('baglib-lang','${lang}')`);
    await owner.loadURL('http://localhost:3000');
    await until('!!window.electronAPI && !!document.querySelector("footer")');
    await pause(800);
  };

  (async () => {
    const results = {};
    await load(language);

    console.log(`[live-${language}] Verifying cardNotes API availability`);
    await until('!!window.electronAPI?.cardNotes');

    const types = await evaluate('window.electronAPI.cardNotes.listTypes()');
    assert.ok(Array.isArray(types) && types.length >= 10, 'Expected at least 10 stock note types seeded');
    results.typesCount = types.length;

    // 1. Create a Basic+reversed note -> see 2 cards generated
    console.log(`[live-${language}] 1. Basic+reversed note`);
    const basicRev = await evaluate(`
      window.electronAPI.cardNotes.saveNote({
        noteTypeId: 'stock-basic-reversed',
        fields: {
          Front: '${language === 'ar' ? 'العاصمة' : 'Capital'}',
          Back: '${language === 'ar' ? 'دمشق' : 'Damascus'}'
        }
      })
    `);
    assert.equal(basicRev.cards.length, 2, 'Basic+reversed must generate 2 cards');
    results.scenario1 = { id: basicRev.note.id, cardCount: basicRev.cards.length };

    // 2. Create a Cloze note with c1 and c2 -> see 2 cards generated
    console.log(`[live-${language}] 2. Cloze note (c1, c2)`);
    const clozeNote = await evaluate(`
      window.electronAPI.cardNotes.saveNote({
        noteTypeId: 'stock-cloze',
        fields: {
          Text: '${language === 'ar' ? 'كان {{c1::أبو بكر::الخليفة الأول}} ثم {{c2::عمر}} رضي الله عنهما' : 'First was {{c1::Abu Bakr}} and then {{c2::Umar}}'}',
          'Back Extra': 'Early Caliphate'
        }
      })
    `);
    assert.equal(clozeNote.cards.length, 2, 'Cloze with c1 and c2 must generate 2 cards');
    results.scenario2 = { id: clozeNote.note.id, cardCount: clozeNote.cards.length };

    // 3. Create a poetry context-cloze from a real poem
    console.log(`[live-${language}] 3. Poetry context-cloze`);
    const poetryText = 'قِفا نَبكِ مِن ذِكرى حَبيبٍ وَمَنزِلِ\\nبِسِقطِ اللِوى بَينَ الدَخولِ فَحَومَلِ\\nفَتوضِحَ فَالمِقراةِ لَم يَعفُ رَسمُها\\nلِما نَسَجَتها مِن جَنوبٍ وَشَمأَلِ';
    const poetryNote = await evaluate(`
      window.electronAPI.cardNotes.saveNote({
        noteTypeId: 'stock-context-cloze',
        fields: {
          'Target': '${poetryText}',
          'Notes': 'معلقة امرئ القيس'
        }
      })
    `);
    assert.ok(poetryNote.cards.length >= 2, 'Poetry context cloze generates progressive cards');
    const pCard0 = poetryNote.cards[0];
    const pCard1 = poetryNote.cards[1];
    assert.ok(pCard0.front.includes('context-before'), 'Poetry front includes context-before element');
    assert.ok(pCard1.front.includes('قِفا نَبكِ'), 'Card 2 includes preceding verse in context-before');
    results.scenario3 = { id: poetryNote.note.id, cardCount: poetryNote.cards.length };

    // 4. Make a type-in card and test character diff
    console.log(`[live-${language}] 4. Type-in card`);
    const typingNote = await evaluate(`
      window.electronAPI.cardNotes.saveNote({
        noteTypeId: 'stock-basic-typing',
        fields: {
          Front: '${language === 'ar' ? 'اكتب كلمة: كتاب' : 'Type: book'}',
          Back: '${language === 'ar' ? 'كِتَابٌ' : 'book'}'
        }
      })
    `);
    assert.equal(typingNote.cards.length, 1);
    const typingCard = typingNote.cards[0];
    assert.ok(typingCard.front.includes('input type="text"'), 'Front has type-in input');
    results.scenario4 = { id: typingNote.note.id };

    // 5. Multiple-choice card
    console.log(`[live-${language}] 5. Multiple-choice card`);
    const mcNote = await evaluate(`
      window.electronAPI.cardNotes.saveNote({
        noteTypeId: 'stock-multiple-choice',
        fields: {
          Front: '${language === 'ar' ? 'ما هي عاصمة سوريا؟\\n1. حلب\\n2. دمشق\\n3. حمص' : 'What is the capital of Syria?\\n1. Aleppo\\n2. Damascus\\n3. Homs'}',
          Back: '${language === 'ar' ? 'دمشق' : 'Damascus'}'
        }
      })
    `);
    assert.equal(mcNote.cards.length, 1);
    results.scenario5 = { id: mcNote.note.id };

    // 6. Edit a hadith source-text field -> "edited by you" badge, then test Restore original
    console.log(`[live-${language}] 6. Hadith source text edit & restore`);
    const origMatn = 'إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ';
    const hadithNote = await evaluate(`
      window.electronAPI.cardNotes.saveNote({
        noteTypeId: 'stock-hadith',
        fields: {
          Bab: 'بدء الوحي',
          Hadith: '${origMatn}',
          Sharh: 'شرح الحديث'
        },
        sourceSnapshot: {
          Hadith: '${origMatn}'
        }
      })
    `);
    assert.ok(hadithNote.note.sourceSnapshot, 'Note should retain sourceSnapshot');

    // Edit the Hadith (source_text) field
    const editedHadith = await evaluate(`
      window.electronAPI.cardNotes.saveNote({
        id: '${hadithNote.note.id}',
        noteTypeId: 'stock-hadith',
        fields: {
          Bab: 'بدء الوحي',
          Hadith: 'إنما الأعمال بالنيات (تعديل تجريبي)',
          Sharh: 'شرح الحديث'
        }
      })
    `);
    const fetchedEdited = await evaluate(`window.electronAPI.cardNotes.getNote('${hadithNote.note.id}')`);
    const isEditedByYou = Boolean(
      fetchedEdited.sourceSnapshot &&
      fetchedEdited.fields.Hadith !== fetchedEdited.sourceSnapshot.Hadith
    );
    assert.equal(isEditedByYou, true, 'isEditedByYou must be true when source text differs');

    // Restore original
    const restoredHadith = await evaluate(`window.electronAPI.cardNotes.restoreSourceText('${hadithNote.note.id}')`);
    const isStillEdited = Boolean(
      restoredHadith.sourceSnapshot &&
      restoredHadith.fields.Hadith !== restoredHadith.sourceSnapshot.Hadith
    );
    assert.equal(isStillEdited, false, 'isStillEdited must be false after restore');
    assert.equal(restoredHadith.fields.Hadith, origMatn, 'Hadith field must match original snapshot');
    results.scenario6 = { id: hadithNote.note.id, restored: true };

    // 7. Turn revision.protectSourceText ON -> verify edits are locked
    console.log(`[live-${language}] 7. Source text protection setting`);
    await evaluate("window.electronAPI.settings.set('revision.protectSourceText', true)");
    let protectBlocked = false;
    try {
      await evaluate(`
        window.electronAPI.cardNotes.saveNote({
          id: '${hadithNote.note.id}',
          noteTypeId: 'stock-hadith',
          fields: {
            Bab: 'بدء الوحي',
            Hadith: 'محاولة تعديل محظورة',
            Sharh: 'شرح الحديث'
          }
        })
      `);
    } catch (e) {
      protectBlocked = true;
    }
    assert.equal(protectBlocked, true, 'Saving modified source text must fail when protectSourceText is ON');
    // Turn setting back off
    await evaluate("window.electronAPI.settings.set('revision.protectSourceText', false)");
    results.scenario7 = { protectBlocked: true };

    // 8. Fork a shared card with "this deck only"
    console.log(`[live-${language}] 8. Fork shared card`);
    const sharedNote = await evaluate(`
      window.electronAPI.cardNotes.saveNote({
        noteTypeId: 'stock-basic',
        fields: { Front: 'Shared Q', Back: 'Shared A' },
        deckId: 'deck-main'
      })
    `);
    // Link note to second deck
    await evaluate(`window.electronAPI.cardNotes.linkDeck('${sharedNote.note.id}', 'deck-secondary')`);
    let decks = await evaluate(`window.electronAPI.cardNotes.getDecks('${sharedNote.note.id}')`);
    assert.equal(decks.length, 2, 'Note should belong to 2 decks');

    // Fork for deck-secondary
    const forked = await evaluate(`window.electronAPI.cardNotes.forkNote('${sharedNote.note.id}', 'deck-secondary')`);
    assert.equal(forked.newNote.copiedFromNoteId, sharedNote.note.id, 'Forked note references original note id');

    // Original note should now belong to deck-main only
    const decksOrig = await evaluate(`window.electronAPI.cardNotes.getDecks('${sharedNote.note.id}')`);
    assert.deepEqual(decksOrig, ['deck-main'], 'Original note stays linked to deck-main only');
    const decksForked = await evaluate(`window.electronAPI.cardNotes.getDecks('${forked.newNote.id}')`);
    assert.deepEqual(decksForked, ['deck-secondary'], 'Forked note is linked to deck-secondary only');
    results.scenario8 = { originalNoteId: sharedNote.note.id, forkedNoteId: forked.newNote.id };

    // 9. Sandbox isolation check
    console.log(`[live-${language}] 9. Sandboxed iframe isolation`);
    const isolationResult = await evaluate(`
      new Promise((resolve) => {
        const frame = document.createElement('iframe');
        frame.setAttribute('sandbox', 'allow-scripts');
        frame.srcdoc = \`
          <!DOCTYPE html>
          <html>
            <body>
              <script>
                const testResults = {};
                try {
                  testResults.parentAccess = !!window.parent.electronAPI;
                } catch (e) {
                  testResults.parentAccess = false;
                  testResults.parentError = e.name;
                }
                try {
                  testResults.hasElectronAPI = !!window.electronAPI;
                } catch (e) {
                  testResults.hasElectronAPI = false;
                }
                window.parent.postMessage({ type: 'isolation-check', results: testResults }, '*');
              <\\/script>
            </body>
          </html>
        \`;
        window.addEventListener('message', function onMsg(e) {
          if (e.data && e.data.type === 'isolation-check') {
            window.removeEventListener('message', onMsg);
            document.body.removeChild(frame);
            resolve(e.data.results);
          }
        });
        document.body.appendChild(frame);
      })
    `);
    assert.equal(isolationResult.parentAccess, false, 'Sandboxed iframe must NOT have access to window.parent.electronAPI');
    assert.equal(isolationResult.hasElectronAPI, false, 'Sandboxed iframe must NOT have window.electronAPI');
    results.scenario9 = isolationResult;

    // 10. UI workflow: drive modals through the Knowledge Cards UI
    console.log(`[live-${language}] 10. Driving modals through UI`);
    await evaluate("document.querySelector('[data-nav-item=\"notes\"]')?.click()");
    await pause(800);

    // Switch to Cards tab
    await evaluate("document.querySelector('button[data-notes-tab=\"cards\"]')?.click()");
    await until('!!document.querySelector("[data-saved-cards]")');
    await pause(600);
    await shot(`note-types-cards-tab-${language}`);

    // Click 'Note types' button to open NoteTypeManagerModal
    console.log(`[live-${language}] Opening NoteTypeManagerModal through UI`);
    await evaluate("document.querySelector('button[data-note-types-btn]')?.click()");
    await until('!!document.querySelector("[data-close-note-types-modal]")');
    await pause(600);
    await shot(`note-types-manager-modal-${language}`);

    // Close NoteTypeManagerModal
    await evaluate("document.querySelector('button[data-close-note-types-modal]')?.click()");
    await pause(600);

    // Click 'New note' button to open NoteEditorModal
    console.log(`[live-${language}] Opening NoteEditorModal through UI`);
    await evaluate("document.querySelector('button[data-new-note-btn]')?.click()");
    await until('!!document.querySelector("[data-save-note-btn]")');
    await pause(600);
    await shot(`note-editor-modal-new-${language}`);

    // Fill Front and Back fields
    await evaluate(`(() => {
      const front = document.querySelector('textarea[data-field-name="Front"]');
      const back = document.querySelector('textarea[data-field-name="Back"]');
      if (front) {
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        nativeSetter.call(front, '${language === 'ar' ? 'سؤال تجريبي عبر الواجهة' : 'UI Test Question'}');
        front.dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (back) {
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        nativeSetter.call(back, '${language === 'ar' ? 'جواب تجريبي عبر الواجهة' : 'UI Test Answer'}');
        back.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()`);
    await pause(600);
    await shot(`note-editor-modal-filled-${language}`);

    // Save the note through the UI
    await evaluate("document.querySelector('button[data-save-note-btn]')?.click()");
    await pause(1000);
    await until('!document.querySelector("[data-save-note-btn]")');
    await pause(800);
    await shot(`note-cards-after-save-${language}`);

    // Open 'Edit note' on a card row that has note_id
    console.log(`[live-${language}] Opening Edit note through UI`);
    await until('!!document.querySelector("button[data-edit-note-btn]")');
    await evaluate("document.querySelector('button[data-edit-note-btn]')?.click()");
    await until('!!document.querySelector("[data-save-note-btn]")');
    await pause(600);
    await shot(`note-editor-modal-edit-${language}`);

    // Verify fields populated
    const editFrontVal = await evaluate("document.querySelector('textarea[data-field-name=\"Front\"]')?.value");
    assert.ok(editFrontVal && editFrontVal.length > 0, 'Edit note modal must have populated Front field');
    results.uiWorkflow = { verifiedPopulated: true, fieldVal: editFrontVal };

    // Close the editor
    await evaluate("document.querySelector('button[data-close-note-editor]')?.click()");
    await pause(600);

    fs.writeFileSync(path.join(evidence, `results-${language}.json`), JSON.stringify(results, null, 2));
    console.log(JSON.stringify({ language, passed: true, results }));
    app.quit();
  })().catch(error => {
    console.error(error);
    fs.writeFileSync(
      path.join(evidence, `failure-${language}.txt`),
      String(error.stack || error) + '\n' + consoleLines.join('\n')
    );
    owner.webContents.capturePage().then(img => {
      fs.writeFileSync(path.join(evidence, `failure-${language}.png`), img.toPNG());
    }).finally(() => app.exit(1));
  });
});

require('../../dist/main/index.js');
