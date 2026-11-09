import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBookTarget, validStudyTarget, studyLinks, studyLinkText, studyBacklinks } from '../../src/shared/study-notes';
import { ocrCorrectionsKey, ocrAcceptedKey } from '../../src/shared/ocr-suspects';
import { annotationsToNote } from '../../src/shared/annotation-note';
import { parseDeepLink } from '../../src/shared/deep-link';
import { exportNoteBody } from '../../src/shared/markdown-export';
import { studyLinkOptions } from '../../src/shared/study-link-completion';
import { SqliteWorkRepository } from '../../src/main/database/repositories/work.repository';
import { createTestDatabase } from '../helpers/test-db';
import { navigateStudyReference, consumePendingPage } from '../../src/renderer/utils/study-navigation';
import type { BookItem } from '../../src/shared/types/work';
test('book grammar preserves legacy links and validates optional source and page independently', () => {
    assert.deepEqual(parseBookTarget('book:work'), { id: 'work' });
    assert.deepEqual(parseBookTarget('book:work#p=12'), { id: 'work', page: 12 });
    assert.deepEqual(parseBookTarget('book:work@source'), { id: 'work', sourceId: 'source' });
    assert.deepEqual(parseBookTarget('book:work@source#p=12'), { id: 'work', sourceId: 'source', page: 12 });
    for (const value of ['book:@source', 'book:work@', 'book:work@@source', 'book:work@bad source', 'book:work@a:b', 'book:work@a|b', 'book:work@a#p=0', 'book:work@a#p=1000000', 'book:work@' + 's'.repeat(181)]) {
        assert.equal(parseBookTarget(value), null, value);
        assert.equal(validStudyTarget(value), false, value);
        assert.equal(parseDeepLink('baglib:' + value), null, value);
    }
});
test('precise book links survive wikilinks, deep links and exported Markdown', () => {
    const target = 'book:كتاب@source-2#p=12';
    const link = studyLinkText(target, 'صَفْحَة — Page');
    assert.equal(studyLinks(link)[0]?.target, target);
    assert.equal(parseDeepLink('baglib://' + encodeURIComponent(target)), target);
    const markdown = exportNoteBody(link, new Map());
    assert.equal(markdown, '[صَفْحَة — Page](<baglib:' + target + '>)');
    assert.equal(parseDeepLink(/<([^>]+)>/u.exec(markdown)![1]), target);
    assert.equal(studyLinkOptions('Book#12', [], [{ id: 'work', title: 'Book', sourceId: 'source-2' }])[0]?.target, 'book:work@source-2#p=12');
});
test('repository opens source identities across editions even when filenames match', () => {
    const db = createTestDatabase();
    try {
        const repo = new SqliteWorkRepository(db);
        const first = repo.addBook({ id: 'work', title: 'Book', bookType: 'digital', filePath: 'D:/one/same.pdf', digitalFormat: 'PDF' });
        const original = db.prepare('SELECT s.id, e.id editionId FROM source s JOIN edition e ON s.edition_id=e.id WHERE e.work_id=?').get('work') as {
            id: string;
            editionId: string;
        };
        assert.equal(first.sourceId, original.id);
        assert.equal(first.editionId, original.editionId);
        db.prepare('INSERT INTO edition(id,work_id,label) VALUES (?,?,?)').run('edition-two', 'work', 'Second');
        db.prepare('INSERT INTO source(id,edition_id,source_type) VALUES (?,?,?)').run('source-two', 'edition-two', 'digital');
        db.prepare('INSERT INTO file_source_detail(source_id,file_path,file_format) VALUES (?,?,?)').run('source-two', 'D:/two/same.pdf', 'PDF');
        const second = repo.getById('work', 'source-two')!;
        assert.equal(second.sourceId, 'source-two');
        assert.equal(second.editionId, 'edition-two');
        assert.equal(second.filePath, 'D:/two/same.pdf');
        assert.equal(second.sourceCount, 2);
        assert.equal(ocrCorrectionsKey(second.sourceId, 12), 'ocr.corrections.v1:source-two:12');
        assert.equal(ocrAcceptedKey(second.sourceId, 12), 'ocr.accepted.v1:source-two:12');
        assert.notEqual(ocrCorrectionsKey(first.sourceId, 12), ocrCorrectionsKey(second.sourceId, 12));
        assert.equal(repo.getById('other-work', 'source-two'), null);
        assert.equal(repo.getById('work', 'deleted'), null);
        assert.ok(repo.getAllWorks()[0].sourceId);
    }
    finally {
        db.close();
    }
});
test('navigation opens exact source/page and missing sources fall back with a notice', async () => {
    const beforeWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const beforeEvent = Object.getOwnPropertyDescriptor(globalThis, 'CustomEvent');
    const notices: string[] = [];
    const book = { id: 'work', title: 'Book', filePath: 'D:/one/same.pdf', sourceId: 'one' } as BookItem;
    const second = { ...book, filePath: 'D:/two/same.pdf', sourceId: 'two' };
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { electronAPI: { getBookSource: async (_work: string, source: string) => source === 'two' ? second : null }, dispatchEvent: (event: {
                type: string;
            }) => { notices.push(event.type); return true; } } });
    Object.defineProperty(globalThis, 'CustomEvent', { configurable: true, value: class {
            constructor(public type: string) { }
        } });
    const opened: BookItem[] = [];
    try {
        await navigateStudyReference('book:work@two#p=12', [book], b => opened.push(b), () => { });
        assert.equal(opened[0].filePath, second.filePath);
        assert.equal(opened[0].sourceId, 'two');
        assert.equal(consumePendingPage('work'), 12);
        await navigateStudyReference('book:work#p=3', [book], b => opened.push(b), () => { });
        assert.equal(opened[1].sourceId, 'one');
        assert.equal(consumePendingPage('work'), 3);
        await navigateStudyReference('book:work@deleted#p=5', [book], b => opened.push(b), () => { });
        assert.equal(opened[2].sourceId, 'one');
        assert.equal(consumePendingPage('work'), 5);
        assert.deepEqual(notices, ['baglib:study-source-missing']);
    }
    finally {
        if (beforeWindow)
            Object.defineProperty(globalThis, 'window', beforeWindow);
        else
            Reflect.deleteProperty(globalThis, 'window');
        if (beforeEvent)
            Object.defineProperty(globalThis, 'CustomEvent', beforeEvent);
        else
            Reflect.deleteProperty(globalThis, 'CustomEvent');
    }
});
test('annotation note citations preserve their open source', () => {
    const content = annotationsToNote([{ id: 'mark', bookId: 'work', type: 'highlight', locationCfiOrPage: '12', selectedText: 'Quote', createdAt: '2026-11-09' }], { id: 'work', title: 'Book', sourceId: 'two' });
    assert.equal(studyLinks(content)[0]?.target, 'book:work@two#p=12');
    const note = { id: 'note', title: 'Note', content, aliases: [], tags: [], createdAt: '', updatedAt: '' };
    assert.deepEqual(studyBacklinks([note], 'book:work').map(n => n.id), ['note']);
});
