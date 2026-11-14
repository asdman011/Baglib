import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseBookTarget, parseQuranTarget, studyBacklinks, studyLinks, validStudyTarget } from '../../src/shared/study-notes';
import { studyLinkOptions } from '../../src/shared/study-link-completion';
import { matchSlashCommands, openSlashCommand } from '../../src/shared/note-slash-commands';
import { parseSlashCommand } from '../../src/shared/slash-command';
import { plannerReferenceTarget } from '../../src/shared/study-planner';

describe('ayah ranges and page links (D4)', () => {
  it('parses single ayahs and ranges within a surah', () => {
    assert.deepEqual(parseQuranTarget('quran:hafs:2:255'), { profile: 'hafs', surah: 2, from: 255, to: 255 });
    assert.deepEqual(parseQuranTarget('quran:warsh:2:255-257'), { profile: 'warsh', surah: 2, from: 255, to: 257 });
    for (const bad of ['quran:hafs:2:257-255', 'quran:hafs:115:1', 'quran:hafs:2:0', 'quran:hafs:2:1-301', 'quran:other:2:1']) assert.equal(validStudyTarget(bad), false, bad);
    assert.equal(validStudyTarget('quran:hafs:2:255-257'), true);
  });

  it('parses book page links and keeps plain book links valid', () => {
    assert.deepEqual(parseBookTarget('book:b1#p=12'), { id: 'b1', page: 12 });
    assert.deepEqual(parseBookTarget('book:b1'), { id: 'b1' });
    assert.equal(validStudyTarget('book:b1#p=12'), true);
    assert.equal(validStudyTarget('book:b1#p=0'), false);
    assert.equal(validStudyTarget('book:b1#x'), false);
    assert.equal(studyLinks('see [[book:b1#p=12|رياض، 12]]')[0].target, 'book:b1#p=12');
  });

  it('counts page links as backlinks of their book', () => {
    const notes = [{ id: 'n', title: 'n', content: 'x [[book:b1#p=4|p]]', aliases: [], tags: [], createdAt: '', updatedAt: '' }];
    assert.equal(studyBacklinks(notes, 'book:b1').length, 1);
    assert.equal(studyBacklinks(notes, 'book:b10').length, 0);
  });

  it('planner surah scope works for ranges', () => {
    assert.equal(plannerReferenceTarget({ target: 'quran:hafs:2:255-257', label: '', scope: 'surah' }), 'quran:hafs:2:1');
  });

  it('suggests ranges and book pages', () => {
    const books = [{ id: 'b1', title: 'رياض الصالحين' }, { id: 'b2', title: 'Riyad' }];
    assert.equal(studyLinkOptions('2:255-257', [], books)[0].text, '[[quran:hafs:2:255-257|2:255-257]]');
    assert.equal(studyLinkOptions('٢:٢٥٥–٢٥٧', [], books)[0].target, 'quran:hafs:2:255-257');
    assert.deepEqual(studyLinkOptions('رياض#١٢', [], books).map(option => option.target), ['book:b1#p=12']);
    assert.equal(studyLinkOptions('رياض #12', [], books)[0].text, '[[book:b1#p=12|رياض الصالحين (12)]]');
  });
});

describe('slash commands', () => {
  it('opens only at a line start or after a space', () => {
    assert.deepEqual(openSlashCommand('/'), { from: 0, query: '' });
    assert.deepEqual(openSlashCommand('text /sal'), { from: 5, query: 'sal' });
    assert.deepEqual(openSlashCommand('قال /صلى'), { from: 4, query: 'صلى' });
    assert.equal(openSlashCommand('and/or'), null);
    assert.equal(openSlashCommand('https://x'), null);
  });

  it('matches English and Arabic keywords, ignoring hamza forms and diacritics', () => {
    assert.deepEqual(matchSlashCommands('sal').map(command => command.id), ['salla']);
    // KEY-357: Quran, hadith and poetry words open the dataset search (slash-command.ts), not the old link picker.
    for (const word of ['آية', 'اية', 'حديث', 'bayt', 'بيت', 'verse']) assert.deepEqual(matchSlashCommands(word), [], word);
    assert.deepEqual(parseSlashCommand('/آية الكرسي')?.scope, 'quran');
    assert.deepEqual(parseSlashCommand('/اية')?.scope, 'quran');
    assert.deepEqual(parseSlashCommand('/hadith')?.scope, 'sunnah');
    assert.deepEqual(parseSlashCommand('/بيت أرتجي')?.scope, 'albayan');
    assert.deepEqual(parseSlashCommand('/قصيدة')?.scope, 'albayan');
    assert.deepEqual(parseSlashCommand('/verse')?.scope, 'albayan');
    assert.ok(matchSlashCommands('رَضي').some(command => command.id === 'radiyaHa'));
    assert.equal(matchSlashCommands('').length, 12);
    assert.deepEqual(matchSlashCommands('zzz'), []);
  });
});
