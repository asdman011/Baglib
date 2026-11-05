import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { openStudyLink, studyLinkOptions } from '../../src/shared/study-link-completion';

const notes = [
  { id: 'n1', title: 'الصبر عند البلاء', aliases: ['patience'] },
  { id: 'n2', title: 'Seeking knowledge', aliases: [] },
];
const books = [{ id: 'b1', title: 'رياض الصالحين' }, { id: 'b2', title: 'Riyad as-Salihin' }];

describe('study link suggestions', () => {
  it('finds the open [[ before the cursor, including embeds', () => {
    assert.deepEqual(openStudyLink('see [[الصب'), { from: 4, query: 'الصب' });
    assert.deepEqual(openStudyLink('![[2:255'), { from: 1, query: '2:255' });
    assert.equal(openStudyLink('done [[note:n1|x]] then'), null);
    assert.equal(openStudyLink('no link'), null);
  });

  it('matches notes by title or alias, ignoring diacritics', () => {
    assert.deepEqual(studyLinkOptions('الصَّبر', notes, books).map(o => o.target), ['note:n1']);
    assert.deepEqual(studyLinkOptions('patience', notes, books).map(o => o.target), ['note:n1']);
  });

  it('matches books and writes a valid link', () => {
    const [option] = studyLinkOptions('رياض', notes, books);
    assert.equal(option.kind, 'book');
    assert.equal(option.text, '[[book:b1|رياض الصالحين]]');
  });

  it('offers an ayah for 2:255 and Arabic-Indic digits, and rejects impossible surahs', () => {
    assert.equal(studyLinkOptions('2:255', notes, books)[0].text, '[[quran:hafs:2:255|2:255]]');
    assert.equal(studyLinkOptions('٢:٢٥٥', notes, books)[0].target, 'quran:hafs:2:255');
    assert.equal(studyLinkOptions('115:1', notes, books).some(o => o.kind === 'quran'), false);
  });

  it('lists everything for an empty query, up to the limit', () => {
    assert.equal(studyLinkOptions('', notes, books).length, 4);
    assert.equal(studyLinkOptions('', notes, books, 3).length, 3);
  });
});
