const assert = require('node:assert/strict');

// KEY-372 (RE-11) live run: embed a quick note in a manuscript, see it live in the editor, edit the note and
// see the embed update, see "Used in manuscripts" on the note and open the chapter from it, and find the
// manuscript from global search with an Arabic word. Arabic first, then English.
module.exports = {
  async execute({ evaluate, edit, until, shot, click, lang, labels, pause }) {
    const records = [];
    const docs = await evaluate(`(async () => { const m = (await window.electronAPI.manuscripts.list()).find(x => x.title.startsWith('KEY-372')); return (await window.electronAPI.manuscripts.documents(m.id)).map(d => ({ id: d.id, title: d.title })); })()`);
    assert.equal(docs.length, 2, 'two seeded chapters');
    const [one] = docs;
    const note = await evaluate(`window.electronAPI.studyNotes.save({ title: 'فوائد في البلاغة', content: 'التشبيه البليغ ما حذف فيه الأداة ووجه الشبه.', aliases: [], tags: [] })`);
    assert.ok(note.id, 'note created');
    const notePayload = { kind: 'note-embed', props: { url: 'note:' + note.id, noteId: note.id, title: note.title, label: note.title } };
    const send = payload => evaluate(`window.dispatchEvent(new CustomEvent('baglib:send-to-manuscript', { detail: ${JSON.stringify(payload)} }))`);
    const embedText = `(() => { const el = document.querySelector('baglib-note-embed'); return el ? (el.shadowRoot ? el.shadowRoot.textContent : el.textContent) : ''; })()`;

    // 1. Arabic: embed the note in chapter one (not open) through the picker.
    await lang('ar');
    await send(notePayload);
    await until('document.querySelectorAll("[role=dialog] select").length === 2');
    await until(`[...document.querySelectorAll("[role=dialog] select")[1].options].some(o => o.value === ${JSON.stringify(one.id)})`);
    await evaluate(`(() => { const el = document.querySelectorAll("[role=dialog] select")[1]; Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, ${JSON.stringify(one.id)}); el.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await pause(200);
    await evaluate(`[...document.querySelectorAll("[role=dialog] button")].find(b => b.textContent.trim() === ${JSON.stringify(labels.ar.manuscriptSendConfirm)}).click()`);
    await until(`window.electronAPI.manuscripts.document(${JSON.stringify(one.id)}).then(d => d.snapshot.includes('baglib:note-embed') && !d.snapshot.includes('التشبيه البليغ'))`);
    const backlinks = await evaluate(`window.electronAPI.manuscripts.backlinks('note:${note.id}')`);
    assert.equal(backlinks.length, 1, 'one backlink row from manuscript_link');
    records.push({ step: 'ar-embed-saved', noCopyOfNoteText: true, backlinkRows: backlinks.length });

    // 2. Open the chapter in the editor: the embed shows the note's current text.
    await click('[data-nav-item=notes-editor]');
    await until('!!document.querySelector(".research-sidebar-manuscript-row")');
    if (!(await evaluate('!!document.querySelector(".research-sidebar-tree-row")'))) await evaluate('document.querySelector(".research-sidebar-manuscript-row").click()');
    await until('!!document.querySelector(".research-sidebar-tree-row")');
    await evaluate(`[...document.querySelectorAll(".research-sidebar-tree-row")].find(r => r.textContent.includes(${JSON.stringify(one.title)})).click()`);
    await until('window.__baglibResearchEditor?.ready', true);
    await until(`${embedText}.includes('التشبيه البليغ')`, true);
    await pause(400);
    await shot('ar-1-embed-in-editor');
    records.push({ step: 'ar-embed-renders-note' });

    // 3. Edit the note: the open embed updates without reopening the chapter.
    const updated = 'التشبيه البليغ ما حذف فيه الأداة ووجه الشبه، مثل: زيدٌ أسدٌ.';
    await evaluate(`window.electronAPI.studyNotes.save({ id: ${JSON.stringify(note.id)}, expectedRevision: ${note.revision ?? 'undefined'}, title: ${JSON.stringify(note.title)}, content: ${JSON.stringify(updated)}, aliases: [], tags: [] }).then(() => window.dispatchEvent(new CustomEvent('baglib:notes-changed')))`);
    await until(`${embedText}.includes('زيدٌ أسدٌ')`, true);
    await pause(300);
    await shot('ar-2-embed-updated');
    records.push({ step: 'ar-embed-live-update' });

    // 4. Clicking the embed opens the note; its details show "Used in manuscripts" with the chapter.
    await edit(`document.querySelector('baglib-note-embed').shadowRoot?.querySelector('figure')?.click() ?? document.querySelector('baglib-note-embed figure').click()`);
    await until('!!document.querySelector("[data-note-manuscripts]")');
    await until(`!!document.querySelector('[data-note-manuscript-chapter=${JSON.stringify(one.id)}]')`);
    await pause(300);
    await shot('ar-3-note-used-in-manuscripts');
    records.push({ step: 'ar-note-backlink-visible' });

    // 5. The backlink opens the chapter in the editor.
    await evaluate(`document.querySelector('[data-note-manuscript-chapter=${JSON.stringify(one.id)}]').click()`);
    await until('!!document.querySelector(".research-sidebar")');
    await until(`!!document.querySelector('baglib-note-embed')`, true);
    records.push({ step: 'ar-backlink-opens-chapter' });

    // 6. Global search finds the manuscript with an Arabic word from the chapter title.
    const direct = await evaluate(`Promise.all(['البلاغية', 'البلاغيه'].map(q => window.electronAPI.manuscripts.search(q).then(r => r.length)))`);
    console.log('manuscripts.search hits (exact, folded):', JSON.stringify(direct));
    await evaluate(`window.dispatchEvent(new CustomEvent('baglib:search-selection', { detail: 'البلاغيه' }))`);
    await until(`!!document.querySelector('[data-search-manuscript=${JSON.stringify(one.id)}]')`);
    await pause(300);
    await shot('ar-4-global-search');
    records.push({ step: 'ar-global-search', query: 'البلاغيه (taa marbuta folded)' });
    await evaluate('document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))');
    await pause(300);

    // 7. English: the note details show the same backlink in LTR.
    await lang('en');
    assert.equal(await evaluate('document.documentElement.dir'), 'ltr');
    await until(`!!document.querySelector('baglib-note-embed')`, true);
    await edit(`document.querySelector('baglib-note-embed').shadowRoot?.querySelector('figure')?.click() ?? document.querySelector('baglib-note-embed figure').click()`);
    await until(`!!document.querySelector('[data-note-manuscript-chapter=${JSON.stringify(one.id)}]')`);
    await until(`document.querySelector('[data-note-manuscripts]').textContent.includes(${JSON.stringify(labels.en.notesUsedInManuscripts)})`);
    await pause(300);
    await shot('en-5-note-used-in-manuscripts');
    records.push({ step: 'en-note-backlink-visible' });
    return records;
  },
};
