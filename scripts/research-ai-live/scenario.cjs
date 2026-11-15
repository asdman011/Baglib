const assert = require('node:assert/strict');

// KEY-373 (RE-12) live run: the research AI panel against a local OpenAI-compatible mock provider (no real key).
// Arabic: "not set up" first, then summarise with citations, rewrite a selection, insert the answer, open a cited
// note. English: ask a question in LTR. Checks that only the chosen provider is called, with the chapter and its
// cited sources as context and the key in a header.
module.exports = {
  async execute({ evaluate, edit, until, shot, click, input, lang, labels, pause, mock }) {
    const records = [];
    const docs = await evaluate(`(async () => { const m = (await window.electronAPI.manuscripts.list()).find(x => x.title.startsWith('KEY-373')); return (await window.electronAPI.manuscripts.documents(m.id)).map(d => ({ id: d.id, title: d.title })); })()`);
    const [one, two] = docs;
    const openChapter = async title => {
      await click('[data-nav-item=notes-editor]');
      await until('!!document.querySelector(".research-sidebar-manuscript-row")');
      if (!(await evaluate('!!document.querySelector(".research-sidebar-tree-row")'))) await evaluate('document.querySelector(".research-sidebar-manuscript-row").click()');
      await until('!!document.querySelector(".research-sidebar-tree-row")');
      await evaluate(`[...document.querySelectorAll(".research-sidebar-tree-row")].find(r => r.textContent.includes(${JSON.stringify(title)})).click()`);
      await until('window.__baglibResearchEditor?.ready', true);
      await until(`document.querySelector('.research-editor-frame.ready') !== null`);
      await pause(500);
    };
    const messages = role => evaluate(`document.querySelectorAll('[data-research-ai-message=${role}]').length`);
    const lastText = role => evaluate(`[...document.querySelectorAll('[data-research-ai-message=${role}]')].pop()?.textContent ?? ''`);

    // 1. Arabic: open the chapter and the panel; with no key the panel says so and offers AI settings.
    await lang('ar');
    await openChapter(one.title);
    await click('[data-research-ai-fab]');
    await until('!!document.querySelector("[data-research-ai-panel]")');
    await click('[data-research-ai-action=summarize]');
    await until(`${JSON.stringify(labels.ar.researchAiNotConfigured)} && [...document.querySelectorAll('[data-research-ai-message=error]')].some(m => m.textContent.includes(${JSON.stringify(labels.ar.researchAiNotConfigured)}))`);
    assert.equal(mock.requests.length, 0, 'no provider call without a key');
    await shot('ar-1-not-configured');
    records.push({ step: 'ar-not-configured', providerCalls: 0 });

    // 2. Point BYOK at the local mock (OpenAI-compatible) and summarise: the answer carries citations.
    assert.ok(mock.port > 0, 'mock provider listening');
    await evaluate(`window.electronAPI.ai.saveSettings({ provider: 'custom', customBaseUrl: 'http://127.0.0.1:${mock.port}/v1', customApiKey: 'live-run-test-key', customModel: 'mock' })`);
    await click('[data-research-ai-action=summarize]');
    await until(`!!document.querySelector('[data-assistant-consent]') || document.querySelectorAll('[data-research-ai-message=assistant]').length === 1`);
    if (await evaluate("!!document.querySelector('[data-assistant-consent]')")) await click('[data-assistant-consent-allow]');
    await until(`document.querySelectorAll('[data-research-ai-message=assistant]').length === 1`);
    const first = mock.requests[0];
    assert.equal(mock.requests.length, 1);
    assert.equal(first.url, '/v1/chat/completions');
    assert.equal(first.authorization, 'Bearer live-run-test-key', 'key goes in a header');
    const system = first.body.messages[0].content;
    assert.match(system, /التوحيد أصل الدين وأساسه/, 'chapter text in context');
    assert.match(system, /\[1\] البقرة ٢٥٥ \(quran:hafs:2:255\)/, 'cited ayah in context');
    assert.match(system, /\[2\] فوائد في البلاغة \(note:/, 'embedded note in context');
    assert.match(system, /التشبيه البليغ ما حذفت فيه الأداة/, 'note text read live');
    assert.doesNotMatch(system, /This chapter explains the method/, 'other chapters are not context');
    assert.match(system, /Reply in Arabic/);
    assert.match(system, /<CHAPTER title="الفصل الأول: التوحيد">/, 'the open chapter is the page context');
    const answer = await lastText('assistant');
    assert.ok(!answer.includes('[9]'), 'invented citation dropped');
    const cites = await evaluate(`[...document.querySelectorAll('[data-research-ai-citation]')].map(b => b.dataset.researchAiCitation)`);
    assert.equal(cites.length, 2);
    assert.equal(cites[0], 'quran:hafs:2:255');
    assert.ok(cites[1].startsWith('note:'));
    await pause(300);
    await shot('ar-2-summary-with-citations');
    records.push({ step: 'ar-summarize', citations: cites, contextHasChapterAndSources: true, inventedCitationDropped: true });

    // 3. Select a phrase in the chapter, then "Rewrite the selection": the request carries only that passage.
    await edit(`(() => {
      const target = [...document.querySelectorAll('[data-block-id] .inline-editor, rich-text')].find(el => el.textContent.includes('التوحيد أصل الدين'));
      const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
      let node; while ((node = walker.nextNode()) && !node.textContent.includes('التوحيد')) {}
      const range = document.createRange(); range.setStart(node, 0); range.setEnd(node, node.textContent.indexOf('،'));
      const sel = document.getSelection(); sel.removeAllRanges(); sel.addRange(range);
      return sel.toString();
    })()`);
    await click('[data-research-ai-action=rewrite]');
    await until(`document.querySelectorAll('[data-research-ai-message=assistant]').length === 2`);
    const rewrite = mock.requests[1].body.messages[1].content;
    assert.match(rewrite, /<PASSAGE>\nالتوحيد أصل الدين وأساسه\n<\/PASSAGE>/, 'selection sent as the passage');
    records.push({ step: 'ar-rewrite-selection', passage: 'التوحيد أصل الدين وأساسه' });

    // 4. Insert the answer into the chapter: citations become source labels, and autosave keeps it.
    await evaluate(`[...document.querySelectorAll('[data-research-ai-insert]')][0].click()`);
    await until(`document.body.textContent.includes(${JSON.stringify(labels.ar.researchAiInserted)})`);
    await until(`document.body.textContent.includes('(البقرة ٢٥٥)')`, true);
    await evaluate('window.__baglibResearchEditorBridge?.explicitSave?.()').catch(() => {});
    await until(`window.electronAPI.manuscripts.document(${JSON.stringify(one.id)}).then(d => d.plain_text.includes('(البقرة ٢٥٥)'))`);
    await pause(300);
    await shot('ar-3-answer-inserted');
    records.push({ step: 'ar-insert-into-chapter', saved: true });

    // 5. A citation opens its BagLib source (the embedded note).
    await evaluate(`document.querySelector('[data-research-ai-citation^="note:"]').click()`);
    await until('!!document.querySelector("[data-note-manuscripts]")');
    records.push({ step: 'ar-citation-opens-note' });

    // 6. English: ask a question in the open chapter two; the panel is LTR and the answer cites in English.
    await lang('en');
    assert.equal(await evaluate('document.documentElement.dir'), 'ltr');
    await openChapter(two.title);
    await until('!!document.querySelector("[data-research-ai-fab]")');
    if (!(await evaluate('!!document.querySelector("[data-research-ai-panel]")'))) await click('[data-research-ai-fab]');
    await until('!!document.querySelector("[data-research-ai-input]")');
    await evaluate("document.querySelector('[data-assistant-new-chat]')?.click()");
    await evaluate(`(() => { const el = document.querySelector('[data-research-ai-input]'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, 'What is the method of this chapter?'); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await pause(150);
    await evaluate(`document.querySelector('[data-research-ai-input]').form.requestSubmit()`);
    await until(`[...document.querySelectorAll('[data-research-ai-message=assistant]')].some(m => m.textContent.includes('tawhid'))`);
    const last = mock.requests[mock.requests.length - 1].body.messages;
    assert.match(last[1].content, /^User: What is the method of this chapter\?$/, 'a new chat sends no earlier turns');
    assert.match(last[0].content, /This chapter explains the method/);
    assert.match(last[0].content, /<CHAPTER title="Chapter 2: Method">/);
    assert.doesNotMatch(last[0].content, /<SOURCES>/);
    assert.match(last[0].content, /Reply in English/);
    assert.ok((await evaluate(`document.querySelector('[data-research-ai-panel]').textContent`)).includes(labels.en.researchAiTitle));
    await pause(300);
    await shot('en-4-ask-question');
    records.push({ step: 'en-ask', providerCalls: mock.requests.length, allCallsToChosenProvider: mock.requests.filter(r => r.url !== '/v1/models').every(r => r.url === '/v1/chat/completions') });

    // 7. KEY-385: AI settings offer "Other provider (OpenAI-compatible)" with its own fields and "Load models".
    await evaluate(`document.querySelector('[data-research-ai-panel] [aria-label=${JSON.stringify(labels.en.researchAiOpenSettings)}]').click()`);
    await until(`[...document.querySelectorAll('button')].some(b => b.textContent.includes(${JSON.stringify(labels.en.aiProviderCustom)}))`);
    await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.includes(${JSON.stringify(labels.en.aiProviderCustom)})).click()`);
    await until('!!document.querySelector("[data-ai-custom-provider]")');
    assert.ok((await evaluate('document.querySelector("[data-ai-custom-url]").value')).includes('127.0.0.1'), 'the saved custom address is shown');
    await click('[data-ai-load-models]');
    await until('document.querySelector("[data-ai-models-status]")?.dataset.aiModelsStatus === "ok"');
    const options = await evaluate('[...document.querySelectorAll("[data-ai-model-option]")].map(b => b.dataset.aiModelOption)');
    assert.deepEqual(options, ['mock-chat', 'mock-reasoning'], 'speech models are filtered out');
    await pause(300);
    await shot('en-5-settings-other-provider');
    records.push({ step: 'en-settings-other-provider', models: options });

    // 8. Typing a model that cannot chat (a safety classifier) shows a warning under the model field.
    assert.equal(await evaluate('!!document.querySelector("[data-ai-model-not-chat]")'), false);
    await evaluate(`(() => { const el = document.querySelector('[data-ai-custom-model]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, 'meta-llama/llama-prompt-guard-2-86m'); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await until('!!document.querySelector("[data-ai-model-not-chat]")');
    assert.ok((await evaluate('document.querySelector("[data-ai-model-not-chat]").textContent')).includes(labels.en.aiModelNotChat.slice(0, 30)));
    await pause(200);
    await shot('en-6-settings-not-a-chat-model');
    records.push({ step: 'en-settings-not-chat-warning' });
    return records;
  },
};
