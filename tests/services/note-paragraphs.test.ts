import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { anchorParagraph, findParagraph, newParagraphAnchor, noteParagraphs, paragraphLabel, paragraphLink, paragraphOptions, parseNoteTarget, stripParagraphAnchors } from '../../src/shared/note-paragraphs';
import { studyBacklinks, studyLinks, studyNoteHeading, validStudyTarget } from '../../src/shared/study-notes';
import { cardsFromLine } from '../../src/shared/note-cards';

const NOTE = 'الصبر ضياء — Patience is light.\nسطر ثانٍ من الفقرة نفسها.\n\nفقرة ثانية عن الشكر ^thanks\n\n```\ncode\n\nblock\n```\n\n- Last item';

describe('note paragraphs', () => {
  it('splits on blank lines, keeps fenced code whole, and reads anchors', () => {
    const paragraphs = noteParagraphs(NOTE);
    assert.deepEqual(paragraphs.map(p => [p.text.split('\n')[0], p.anchor]), [
      ['الصبر ضياء — Patience is light.', undefined],
      ['فقرة ثانية عن الشكر', 'thanks'],
      ['```', undefined],
      ['- Last item', undefined],
    ]);
    assert.equal(paragraphs[2].text, '```\ncode\n\nblock\n```');
    assert.equal(findParagraph(NOTE, 'thanks')?.text, 'فقرة ثانية عن الشكر');
    assert.equal(findParagraph(NOTE, 'missing'), undefined);
  });

  it('adds an anchor at the end of a paragraph without changing its text, and keeps an existing one', () => {
    const first = noteParagraphs(NOTE)[0];
    const { content, anchor } = anchorParagraph(NOTE, first.start, 'a1b2c3');
    assert.equal(anchor, 'a1b2c3');
    assert.equal(content, NOTE.replace('من الفقرة نفسها.', 'من الفقرة نفسها. ^a1b2c3'));
    assert.equal(stripParagraphAnchors(content), NOTE.replace(' ^thanks', ''));
    const second = noteParagraphs(NOTE)[1];
    assert.deepEqual(anchorParagraph(NOTE, second.start, 'zzzzzz'), { content: NOTE, anchor: 'thanks' });
    assert.throws(() => anchorParagraph(NOTE, 3, 'a1b2c3'), /missing-paragraph/u);
    assert.throws(() => anchorParagraph(NOTE, first.start, 'bad id'), /invalid-anchor/u);
  });

  it('makes new anchors that are unique in the note', () => {
    let calls = 0;
    assert.equal(newParagraphAnchor(NOTE, () => (calls++ === 0 ? 'thanks' : 'q9w8e7')), 'q9w8e7');
    assert.match(newParagraphAnchor(NOTE), /^[A-Za-z0-9]{6}$/u);
  });

  it('parses and validates paragraph link targets, and counts them as backlinks of the note', () => {
    assert.deepEqual(parseNoteTarget('note:n1#^thanks'), { id: 'n1', anchor: 'thanks' });
    assert.deepEqual(parseNoteTarget('note:n1'), { id: 'n1' });
    assert.equal(validStudyTarget('note:n1#^thanks'), true);
    assert.equal(validStudyTarget('note:n1#^bad anchor'), false);
    assert.equal(validStudyTarget('note:n1#thanks'), false);
    const link = paragraphLink('n1', 'thanks', 'فقرة ثانية');
    assert.equal(link, '[[note:n1#^thanks|فقرة ثانية]]');
    assert.equal(studyLinks(`see ${link}`)[0].target, 'note:n1#^thanks');
    const linking = [{ id: 'n2', title: '', content: link, aliases: [], tags: [], createdAt: '', updatedAt: '' }];
    assert.equal(studyBacklinks(linking, 'note:n1').length, 1);
    assert.equal(studyBacklinks(linking, 'note:n10').length, 0);
  });

  it('searches paragraphs with Arabic normalisation, skips the note being edited, and labels them', () => {
    const notes = [{ id: 'n1', title: 'الصبر', content: NOTE }, { id: 'n2', title: 'Other', content: 'نص عن الشُّكْرِ هنا' }];
    assert.deepEqual(paragraphOptions('الشكر', notes).map(o => [o.noteId, o.anchor, o.label]), [['n1', 'thanks', 'فقرة ثانية عن الشكر'], ['n2', undefined, 'نص عن الشُّكْرِ هنا']]);
    assert.deepEqual(paragraphOptions('الشكر', notes, 'n1').map(o => o.noteId), ['n2']);
    assert.deepEqual(paragraphOptions('x', notes), []);
    assert.equal(paragraphLabel('## **One** two [[note:n1|three]] four five six seven eight nine ten'), 'One two three four five six seven eight…');
  });

  it('keeps anchors out of note headings and card text', () => {
    assert.equal(studyNoteHeading('فقرة أولى ^abc123'), 'فقرة أولى');
    assert.deepEqual(cardsFromLine('Capital :: Cairo ^abc123'), [{ front: 'Capital', back: 'Cairo' }]);
  });
});
