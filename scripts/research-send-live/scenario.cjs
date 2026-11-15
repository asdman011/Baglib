const assert = require('node:assert/strict');

// Payloads mirror src/shared/manuscript-transfer.ts builders (the scenario is plain CJS).
const ayah = { kind: 'ayah', props: { url: 'quran:hafs:2:255', label: 'البقرة 2:255', text: 'اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ' } };
const hadith = { kind: 'hadith', props: { url: 'sunnah:bukhari:1:1', label: 'صحيح البخاري · 1', text: 'إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ', collection: 'صحيح البخاري', number: '1', grade: '' } };
const verse = { kind: 'verse', props: { url: 'poetry:ashaar:1:1:1', label: 'المتنبي', text: 'عَلى قَدْرِ أَهْلِ العَزْمِ تَأتي العَزائِمُ ... وَتَأتي عَلى قَدْرِ الكِرامِ المَكارِمُ', poet: 'المتنبي', poem: '', verses: [{ sadr: 'عَلى قَدْرِ أَهْلِ العَزْمِ تَأتي العَزائِمُ', ajuz: 'وَتَأتي عَلى قَدْرِ الكِرامِ المَكارِمُ' }] } };

module.exports = {
  async execute({ evaluate, edit, until, shot, click, lang, labels, pause }) {
    const records = [];
    const docs = await evaluate(`(async () => { const m = (await window.electronAPI.manuscripts.list()).find(x => x.title.startsWith('KEY-370')); return (await window.electronAPI.manuscripts.documents(m.id)).map(d => ({ id: d.id, title: d.title })); })()`);
    assert.equal(docs.length, 2, 'two seeded chapters');
    const [one, two] = docs;
    const send = payload => evaluate(`window.dispatchEvent(new CustomEvent('baglib:send-to-manuscript', { detail: ${JSON.stringify(payload)} }))`);
    const dialogOpen = '!!document.querySelector("[role=dialog] select")';
    const pickChapter = async id => {
      await until(`document.querySelectorAll("[role=dialog] select").length === 2 && [...document.querySelectorAll("[role=dialog] select")[1].options].some(o => o.value === ${JSON.stringify(id)})`);
      await evaluate(`(() => { const el = document.querySelectorAll("[role=dialog] select")[1]; Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, ${JSON.stringify(id)}); el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
      await pause(200);
    };
    const confirm = async language => {
      await evaluate(`[...document.querySelectorAll("[role=dialog] button")].find(b => b.textContent.trim() === ${JSON.stringify(labels[language].manuscriptSendConfirm)}).click()`);
    };
    const snapshotHas = (id, text) => `window.electronAPI.manuscripts.document(${JSON.stringify(id)}).then(d => d.snapshot.includes(${JSON.stringify(text)}))`;

    // A. Arabic: send an ayah to a chapter that is not open.
    await lang('ar');
    await evaluate('localStorage.removeItem("baglib:last-manuscript-id"); localStorage.removeItem("baglib:last-chapter-id")');
    await send(ayah);
    await until(dialogOpen);
    await pickChapter(two.id);
    await shot('ar-1-picker');
    await confirm('ar');
    await until(`document.body.innerText.includes(${JSON.stringify(labels.ar.manuscriptSendDone)})`);
    await until(snapshotHas(two.id, 'quran:hafs:2:255'));
    assert.equal(await evaluate('document.documentElement.dir'), 'rtl');
    records.push({ step: 'ar-closed-chapter', chapter: two.title, saved: true });

    // B. Arabic: open chapter one in the editor, then send a hadith into it (live insert through the editor).
    await click('[data-nav-item=notes-editor]');
    await until('!!document.querySelector(".research-sidebar-manuscript-row")');
    if (!(await evaluate('!!document.querySelector(".research-sidebar-tree-row")'))) await evaluate('document.querySelector(".research-sidebar-manuscript-row").click()');
    await until('!!document.querySelector(".research-sidebar-tree-row")');
    await evaluate(`[...document.querySelectorAll(".research-sidebar-tree-row")].find(r => r.textContent.includes(${JSON.stringify(one.title)})).click()`);
    await until('window.__baglibResearchEditor?.ready', true);
    await pause(800);
    await shot('ar-2a-before-send');
    const probe = () => evaluate('({ rows: document.querySelectorAll(".research-sidebar-tree-row").length, loading: document.body.innerText.includes(' + JSON.stringify(labels.ar.loading || 'جارٍ التحميل') + '), frames: document.querySelectorAll("iframe").length })');
    const before = await probe();
    await send(hadith);
    await until(dialogOpen);
    await pickChapter(one.id);
    await confirm('ar');
    await until(`window.__baglibResearchEditor.editor.doc.getModelsByFlavour('baglib:hadith').length === 1`, true);
    await until(snapshotHas(one.id, 'sunnah:bukhari:1:1'));
    const afterInsert = await probe();
    await pause(500);
    await shot('ar-2-live-insert');
    const later = await probe();
    records.push({ step: 'ar-view-state', before, afterInsert, later });
    records.push({ step: 'ar-open-chapter-live', chapter: one.title, inEditor: true, savedByAutosave: true });

    // C. English: the picker preselects the last used chapter; send a verse pair to chapter two.
    await lang('en');
    await send(verse);
    await until(dialogOpen);
    await until(`document.querySelectorAll("[role=dialog] select").length === 2 && document.querySelectorAll("[role=dialog] select")[1].value === ${JSON.stringify(one.id)}`);
    records.push({ step: 'en-default-last-used', preselected: one.title });
    await pickChapter(two.id);
    assert.equal(await evaluate('document.documentElement.dir'), 'ltr');
    await shot('en-3-picker');
    await confirm('en');
    await until(`document.body.innerText.includes(${JSON.stringify(labels.en.manuscriptSendDone)})`);
    await until(snapshotHas(two.id, 'وَتَأتي عَلى قَدْرِ الكِرامِ المَكارِمُ'));
    const kept = await evaluate(snapshotHas(two.id, 'quran:hafs:2:255'));
    assert.ok(kept, 'earlier ayah kept');
    records.push({ step: 'en-closed-chapter-verse', chapter: two.title, sadrAjuzKept: true });
    return records;
  },
};
