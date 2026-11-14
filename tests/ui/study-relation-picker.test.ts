import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STUDY_RELATIONS, studyLinks, withLinkRelation } from '../../src/shared/study-notes';
import { relationLabels } from '../../src/renderer/utils/relation-labels';

describe('KEY-356: Redesigned link relationship picker', () => {
  const editorCode = readFileSync('src/renderer/components/notes/StudyNoteEditor.tsx', 'utf8');
  const contentCode = readFileSync('src/renderer/components/notes/StudyNoteContent.tsx', 'utf8');

  it('never interrupts typing: no automatic popup on typing or cursor position (KEY-356/KEY-357)', () => {
    // The old automatic popup triggered at every cursor move or after typing is completely absent
    assert.ok(!editorCode.includes('relationMenu'), 'no old relationMenu');
    assert.ok(!editorCode.includes('data-relation-menu'), 'no old data-relation-menu');

    // StateField only activates when setRelationPicker effect is explicitly dispatched
    assert.ok(editorCode.includes('relationPickerField = StateField.define'), 'picker field is defined');
    assert.ok(editorCode.includes('if (tr.docChanged || tr.selection) return null;'), 'auto-closes on doc change or selection change');
  });

  it('provides on-demand triggers: hover card, chip click, right-click context menu, and Mod-Alt-r', () => {
    // 1. Hover card via hoverTooltip
    assert.ok(editorCode.includes('relationHover = hoverTooltip'), 'hoverTooltip installed');
    assert.ok(editorCode.includes('hoverTime: 300'), 'hover delay ensures mouse hover only, never keyboard typing');

    // 2. Chip click
    assert.ok(editorCode.includes('RelationChip'), 'RelationChip widget');
    assert.ok(editorCode.includes("chip.setAttribute('data-link-relation'"), 'data-link-relation attribute');
    assert.ok(editorCode.includes("chip.setAttribute('role', 'button')"), 'accessible button role on chip');

    // 3. Right-click context menu
    assert.ok(editorCode.includes('relationContextMenu = EditorView.domEventHandlers'), 'context menu handler installed');
    assert.ok(editorCode.includes('contextmenu(event, view)'), 'handles contextmenu events on links');

    // 4. Mod-Alt-r keyboard shortcut
    assert.ok(editorCode.includes('cycleRelation'), 'cycleRelation exists');
    assert.ok(editorCode.includes("key: 'Mod-Alt-r', preventDefault: true, run: cycleRelation"), 'Mod-Alt-r shortcut bound');

    // 5. Escape dismisses the picker
    assert.ok(editorCode.includes("key: 'Escape'"), 'Escape shortcut bound to dismiss picker');
  });

  it('generates the redesigned picker with 8 choices (7 relations + none) and active selection states', () => {
    assert.ok(editorCode.includes("data-relation-picker"), 'picker DOM container has data-relation-picker');
    assert.ok(editorCode.includes("data-relation-choice"), 'buttons have data-relation-choice');
    assert.ok(editorCode.includes("btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false')"), 'aria-pressed indicates active relation');

    // Check all 7 study relations
    assert.deepEqual(STUDY_RELATIONS, ['supports', 'refutes', 'explains', 'answers', 'example', 'contrasts', 'questions']);
  });

  it('studyLinkButton renders relation badge in hover preview card (StudyNoteContent)', () => {
    assert.ok(contentCode.includes('data-preview-relation'), 'preview card has data-preview-relation badge');
    assert.ok(contentCode.includes('data-study-link-preview'), 'study link preview card exists');
  });

  it('updates written links cleanly between relations and none', () => {
    const rawLink = '[[quran:hafs:2:255|Al-Baqarah 255]]';
    
    // Setting relation
    const withSupports = withLinkRelation(rawLink, 'supports');
    assert.equal(withSupports, '[[supports::quran:hafs:2:255|Al-Baqarah 255]]');

    // Changing relation
    const withRefutes = withLinkRelation(withSupports!, 'refutes');
    assert.equal(withRefutes, '[[refutes::quran:hafs:2:255|Al-Baqarah 255]]');

    // Removing relation
    const withNone = withLinkRelation(withRefutes!, undefined);
    assert.equal(withNone, '[[quran:hafs:2:255|Al-Baqarah 255]]');

    // Arabic relation names map to canonical relations
    const arabicSupports = withLinkRelation(rawLink, 'يؤيد');
    assert.equal(arabicSupports, '[[supports::quran:hafs:2:255|Al-Baqarah 255]]');
  });

  it('supports bilingual labels in Arabic RTL and English LTR', () => {
    const fakeT = (key: string) => {
      const arMap: Record<string, string> = {
        relationWord: 'علاقة',
        relationSupports: 'يؤيد',
        relationRefutes: 'يرد على',
        relationExplains: 'يشرح',
        relationAnswers: 'يجيب عن',
        relationExample: 'مثال على',
        relationContrasts: 'يخالف',
        relationQuestions: 'يسأل عن',
        relationNone: 'بلا علاقة',
        relationMenuHint: 'علاقة هذا الرابط. Ctrl+Alt+R للتنقل بينها',
      };
      return arMap[key] || key;
    };
    const labels = relationLabels(fakeT as any);
    assert.equal(labels.supports, 'يؤيد');
    assert.equal(labels.refutes, 'يرد على');
    assert.equal(labels.explains, 'يشرح');
    assert.equal(labels.answers, 'يجيب عن');
    assert.equal(labels.example, 'مثال على');
    assert.equal(labels.contrasts, 'يخالف');
    assert.equal(labels.questions, 'يسأل عن');
    assert.equal(labels.none, 'بلا علاقة');
    assert.equal(labels.relation, 'علاقة');
  });
});
