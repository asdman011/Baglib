'use client';
import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Annotation, Compartment, EditorSelection, EditorState, Facet, Prec, RangeSetBuilder, StateField } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType, keymap, showTooltip, type Tooltip, placeholder as placeholderExtension, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, isolateHistory } from '@codemirror/commands';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { markdown } from '@codemirror/lang-markdown';
import { autocompletion, completionStatus, startCompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { tags } from '@lezer/highlight';
import { openStudyLink, studyLinkOptions, withRelation } from '../../../shared/study-link-completion';
import { STUDY_RELATIONS, matchingStudyRelations, studyLinks, withLinkRelation, type StudyNote, type StudyRelation } from '../../../shared/study-notes';
import { matchSlashCommands, openSlashCommand, type SlashCommandId } from '../../../shared/note-slash-commands';
import { cardsFromLine } from '../../../shared/note-cards';
import { honorificExpansion } from '../../../shared/honorifics';
import { PARAGRAPH_ANCHOR, newParagraphAnchor, paragraphLink, paragraphOptions } from '../../../shared/note-paragraphs';
import { slashInsertion, slashSearchExtension, type SlashSearchLabels } from './slash-search-extension';
import type { SlashBook } from '../../utils/slash-search';
import { parseSlashCommand, suggestScopes } from '../../../shared/slash-command';
import type { CorpusKind, CorpusOption } from '../../utils/corpus-lookup';

// After /quran, /hadith or /poem the next `[[` search is limited to that source and inserts its text.
const quoteMode = new WeakMap<EditorView, CorpusKind>();

/** Marks a document replacement that came from the `value` prop, so it is not recorded as the editor's own change. */
const externalValue = Annotation.define<boolean>();

export interface StudyNoteEditorHandle { insert: (prefix: string, suffix?: string, options?: { spaced?: boolean }) => void; focus: () => void }

const highlight = HighlightStyle.define([
  { tag: tags.heading, fontWeight: '700', fontSize: '1.08em' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.quote, fontStyle: 'italic', color: 'rgb(180 83 9)' },
  { tag: tags.monospace, fontFamily: 'ui-monospace, monospace' },
  { tag: [tags.processingInstruction, tags.meta], opacity: '0.55' },
  { tag: tags.link, color: 'rgb(4 120 87)' },
]);

const theme = EditorView.theme({
  '&': { fontSize: '0.875rem', backgroundColor: 'transparent', color: 'inherit' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: "var(--font-amiri, 'Amiri', 'Traditional Arabic', serif)", lineHeight: '2.2', minHeight: '8rem', maxHeight: '28rem', overflow: 'auto' },
  // Room above and below each line so Arabic diacritics are never clipped.
  '.cm-content': { padding: '0.75rem 0.75rem', caretColor: 'currentColor', fontFamily: "var(--font-amiri, 'Amiri', 'Traditional Arabic', serif)" },
  '.cm-line': { padding: '0.2rem 0', textAlign: 'start', lineHeight: '2.2' },
  '.cm-placeholder': { opacity: '0.6' },
  '.cm-tooltip-autocomplete': { borderRadius: '0.5rem', overflow: 'hidden' },
  '.cm-tooltip-autocomplete ul li': { padding: '0.25rem 0.5rem', lineHeight: '1.8' },
  // Emerald 500 reads on both the light and dark themes.
  '.cm-paragraph-anchor': { opacity: '0.35', fontSize: '0.75em' },
  '.cm-link-relation': { fontSize: '0.75em', padding: '0 0.4em', marginInlineEnd: '0.3em', borderRadius: '0.4em', backgroundColor: 'rgb(16 185 129 / 0.15)', color: 'rgb(16 185 129)', fontWeight: '600' },
  // The app's own surface and ink, so the menu reads in both the light and dark themes.
  '.cm-tooltip.cm-relation-tooltip': { border: '1px solid rgb(128 128 128 / 0.35)', borderRadius: '0.6rem', padding: '0.25rem', backgroundColor: 'var(--bg-surface)', color: 'var(--text-main)', boxShadow: '0 4px 14px rgb(0 0 0 / 0.25)' },
  '.cm-relation-menu': { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.25rem', maxWidth: '28rem', fontSize: '0.75rem' },
  '.cm-relation-menu button': { border: '1px solid rgb(128 128 128 / 0.35)', borderRadius: '0.4rem', padding: '0 0.45rem', lineHeight: '1.8', cursor: 'pointer', background: 'transparent', color: 'inherit' },
  '.cm-relation-menu button[aria-pressed="true"]': { backgroundColor: 'rgb(16 185 129 / 0.2)', borderColor: 'rgb(16 185 129)', color: 'rgb(16 185 129)', fontWeight: '600' },
  '.cm-study-link': { color: 'rgb(16 185 129)', textDecoration: 'underline', textUnderlineOffset: '0.2em', textDecorationThickness: '1px' },
});

// Each line gets dir="auto", so it takes the direction of its first strong letter. CodeMirror reads that
// computed direction for cursor motion (perLineTextDirection), so Home, End and arrows follow what is shown.
const autoDirection = Decoration.line({ attributes: { dir: 'auto' } });
function directionDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to;) {
      const line = view.state.doc.lineAt(pos);
      // Judge the line by what it shows (link labels, not targets). A line with no letters, such as
      // `2:255-257`, keeps the note's direction instead of falling back to left-to-right.
      let shown = line.text;
      for (const link of studyLinks(line.text).reverse()) shown = shown.slice(0, link.start) + link.label + shown.slice(link.end);
      if (/\p{L}/u.test(shown)) builder.add(line.from, line.from, autoDirection);
      pos = line.to + 1;
    }
  }
  return builder.finish();
}
const lineDirection = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: EditorView) { this.decorations = directionDecorations(view); }
  update(update: ViewUpdate) { if (update.docChanged || update.viewportChanged) this.decorations = directionDecorations(update.view); }
}, { decorations: plugin => plugin.decorations });

// Live preview for links: on lines without the cursor, `[[target|label]]` shows only its label, styled as a
// link, so Arabic labels read in their own direction. The raw text comes back as soon as the cursor enters the line.
const hidden = Decoration.replace({});
/** Names for typed relationships in the interface language; a coined one shows as written. */
const relationNames = Facet.define<Record<string, string>, Record<string, string>>({ combine: values => values[0] ?? {} });
class RelationChip extends WidgetType {
  constructor(readonly text: string) { super(); }
  eq(other: RelationChip) { return other.text === this.text; }
  toDOM() {
    const chip = document.createElement('span');
    chip.className = 'cm-link-relation';
    chip.setAttribute('data-link-relation', '');
    chip.dir = 'auto';
    chip.textContent = this.text;
    return chip;
  }
}
const linkLabel = Decoration.mark({ class: 'cm-study-link' });
function linkDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const active = new Set(view.state.selection.ranges.flatMap(range => [view.state.doc.lineAt(range.from).number, view.state.doc.lineAt(range.to).number]));
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to;) {
      const line = view.state.doc.lineAt(pos);
      if (!active.has(line.number)) {
        for (const link of studyLinks(line.text)) {
          const raw = line.text.slice(link.start, link.end);
          const bar = raw.indexOf('|');
          if (bar < 0) continue;
          const labelStart = link.start + bar + 1;
          const labelEnd = link.end - 2;
          if (labelEnd <= labelStart) continue;
          // A typed relationship shows as a small chip before the label.
          builder.add(line.from + link.start, line.from + labelStart, link.relation ? Decoration.replace({ widget: new RelationChip(view.state.facet(relationNames)[link.relation] ?? link.relation) }) : hidden);
          builder.add(line.from + labelStart, line.from + labelEnd, linkLabel);
          builder.add(line.from + labelEnd, line.from + link.end, hidden);
        }
      }
      pos = line.to + 1;
    }
  }
  return builder.finish();
}
// Paragraph anchors (` ^a1b2c3` at a paragraph's end) are shown faint, and the cursor steps over them whole.
const anchorMark = Decoration.mark({ class: 'cm-paragraph-anchor' });
function anchorDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to;) {
      const line = view.state.doc.lineAt(pos);
      const match = PARAGRAPH_ANCHOR.exec(line.text);
      if (match) builder.add(line.from + match.index, line.to, anchorMark);
      pos = line.to + 1;
    }
  }
  return builder.finish();
}
const paragraphAnchors = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: EditorView) { this.decorations = anchorDecorations(view); }
  update(update: ViewUpdate) { if (update.docChanged || update.viewportChanged) this.decorations = anchorDecorations(update.view); }
}, { decorations: plugin => plugin.decorations, provide: plugin => EditorView.atomicRanges.of(view => view.plugin(plugin)?.decorations ?? Decoration.none) });

// The relationship menu (decision S4): with the cursor on a link, or just after one, a small bar above it sets,
// changes or removes the link's relationship. Ctrl+Alt+R (Cmd+Alt+R) steps through them from the keyboard.
interface LinkAtCursor { from: number; to: number; relation?: string }
function linkAtCursor(state: EditorState): LinkAtCursor | null {
  const selection = state.selection.main;
  if (!selection.empty || completionStatus(state)) return null;
  const line = state.doc.lineAt(selection.head);
  const offset = selection.head - line.from;
  const link = studyLinks(line.text).find(entry => offset > entry.start && offset <= entry.end);
  return link ? { from: line.from + link.start, to: line.from + link.end, relation: link.relation } : null;
}
function setLinkRelation(view: EditorView, relation?: string): boolean {
  const link = linkAtCursor(view.state);
  if (!link) return false;
  const next = withLinkRelation(view.state.sliceDoc(link.from, link.to), relation);
  if (!next) return false;
  view.dispatch({ changes: { from: link.from, to: link.to, insert: next }, selection: { anchor: link.from + next.length }, userEvent: 'input' });
  return true;
}
const cycleRelation = (view: EditorView) => {
  const link = linkAtCursor(view.state);
  if (!link) return false;
  const order: (StudyRelation | undefined)[] = [undefined, ...STUDY_RELATIONS];
  const index = order.indexOf(link.relation as StudyRelation | undefined);
  return setLinkRelation(view, order[(index + 1) % order.length]);
};
function relationTooltip(state: EditorState): Tooltip | null {
  const link = linkAtCursor(state);
  const names = state.facet(relationNames);
  if (!link || !names.relation) return null;
  return {
    pos: link.from,
    above: true,
    create: view => {
      const dom = document.createElement('div');
      dom.className = 'cm-relation-tooltip';
      const menu = document.createElement('div');
      menu.className = 'cm-relation-menu';
      menu.setAttribute('role', 'toolbar');
      menu.setAttribute('data-relation-menu', '');
      menu.setAttribute('aria-label', names.relation);
      menu.title = names.menuHint ?? '';
      menu.dir = 'auto';
      const title = document.createElement('span');
      title.textContent = names.relation;
      title.style.opacity = '0.7';
      menu.append(title);
      for (const relation of [...STUDY_RELATIONS, undefined]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = relation ? names[relation] ?? relation : names.none ?? '-';
        button.setAttribute('data-relation-choice', relation ?? 'none');
        button.setAttribute('aria-pressed', String(link.relation === relation));
        // Keep the cursor in the text: the click acts without moving focus away from the editor.
        button.addEventListener('mousedown', event => event.preventDefault());
        button.addEventListener('click', () => { setLinkRelation(view, relation); view.focus(); });
        menu.append(button);
      }
      dom.append(menu);
      return { dom };
    },
  };
}
const relationMenu = StateField.define<Tooltip | null>({
  create: relationTooltip,
  update(current, transaction) {
    if (transaction.annotation(slashInsertion)) return null;
    const same = !transaction.docChanged && !transaction.selection && transaction.startState.facet(relationNames) === transaction.state.facet(relationNames)
      && Boolean(completionStatus(transaction.startState)) === Boolean(completionStatus(transaction.state));
    return same ? current : relationTooltip(transaction.state);
  },
  provide: field => showTooltip.from(field),
});

const linkPreview = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: EditorView) { this.decorations = linkDecorations(view); }
  update(update: ViewUpdate) { if (update.docChanged || update.viewportChanged || update.selectionSet || update.focusChanged || update.startState.facet(relationNames) !== update.state.facet(relationNames)) this.decorations = linkDecorations(update.view); }
}, { decorations: plugin => plugin.decorations });

// Typed honorific triggers become their honorific. The typed character goes in first and the expansion is a
// separate undo step, so one Undo gives back exactly what was typed, e.g. `(رض)`.
const honorificInput = EditorView.inputHandler.of((view, from, to, text) => {
  if (from !== to || text.length !== 1 || view.composing) return false;
  const line = view.state.doc.lineAt(from);
  const hit = honorificExpansion(view.state.sliceDoc(line.from, from) + text);
  if (!hit) return false;
  view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length }, userEvent: 'input.type' });
  const start = line.from + hit.from, end = line.from + hit.to;
  const caret = view.state.selection.main.head - (end - start) + hit.text.length;
  view.dispatch({ changes: { from: start, to: end, insert: hit.text }, selection: { anchor: caret }, annotations: isolateHistory.of('full'), userEvent: 'input.complete' });
  return true;
});

/**
 * Markdown note editor (CodeMirror 6). Each line takes its own direction, so Arabic and English
 * paragraphs sit side by side; typing `[[` suggests notes, books and ayahs (`2:255`).
 */
export const StudyNoteEditor = forwardRef<StudyNoteEditorHandle, {
  value: string;
  onChange: (value: string) => void;
  dir: 'rtl' | 'ltr';
  disabled?: boolean;
  ariaLabel: string;
  placeholder: string;
  notes: StudyNote[];
  books: SlashBook[];
  slashSearchLabels?: SlashSearchLabels;
  kindLabels: Record<'note' | 'book' | 'quran' | 'hadith' | 'poem' | 'paragraph', string>;
  /** Names of the typed relationships (decision S4), and the word shown beside them in suggestions. */
  relationLabels?: Record<StudyRelation, string> & { relation: string; none: string; menuHint: string };
  /** The note being edited, so its own paragraphs are not offered. */
  currentNoteId?: string;
  /** Saves a new anchor at the end of a paragraph in another note (the paragraph text is not changed). */
  onAnchorParagraph?: (noteId: string, start: number, anchor: string) => Promise<void>;
  /** Searches the installed Quran, Sunnah and poetry; optional so the editor works without them. */
  searchCorpus?: import('../../utils/slash-search').SlashSearchInput['searchCorpus'];
  slashLabels: Record<SlashCommandId, string>;
  /** Today's date as text, for the `/date` command. */
  dateText: () => string;
  /** `/card`: makes review cards from the current line (and the next, for a question then its answer). */
  onMakeCards?: (line: string, nextLine: string | null) => Promise<boolean>;
  autoFocus?: boolean;
  /** Expand honorific triggers such as (ص) or PBUH while typing (decision S1). */
  expandHonorifics?: boolean;
  /** Enter starts the new line with this text when it returns one (lecture timestamps). */
  newLinePrefix?: () => string | null;
  onSave?: () => void;
}>(function StudyNoteEditor({ value, onChange, dir, disabled, ariaLabel, placeholder, notes, books, kindLabels, relationLabels, currentNoteId, onAnchorParagraph, searchCorpus, slashLabels, slashSearchLabels, dateText, onMakeCards, autoFocus, expandHonorifics = true, newLinePrefix, onSave }, ref) {
  // CodeMirror needs a real DOM (MutationObserver, ranges). Simplified DOMs used by unit tests get a plain textarea.
  const supported = typeof MutationObserver !== 'undefined' && typeof document !== 'undefined' && typeof document.createRange === 'function';
  const fallback = useRef<HTMLTextAreaElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const latest = useRef({ onChange, onSave, notes, books, kindLabels, relationLabels, slashLabels, dateText, searchCorpus, onMakeCards, currentNoteId, onAnchorParagraph, newLinePrefix, slashSearchLabels, dir });
  latest.current = { onChange, onSave, notes, books, kindLabels, relationLabels, slashLabels, dateText, searchCorpus, onMakeCards, currentNoteId, onAnchorParagraph, newLinePrefix, slashSearchLabels, dir };
  const emitted = useRef<string[]>([]);
  const editable = useRef(new Compartment());
  const honorifics = useRef(new Compartment());
  const labels = useRef(new Compartment());
  const relations = useRef(new Compartment());

  useEffect(() => {
    if (!supported || !host.current) return;
    // Local suggestions (notes, books, typed ayah references) answer at once; the installed corpora answer
    // separately, so the list never waits on them and Enter always applies what is shown.
    const complete = (context: CompletionContext): CompletionResult | null => {
      const line = context.state.doc.lineAt(context.pos);
      const open = openStudyLink(line.text.slice(0, context.pos - line.from));
      if (!open) { if (context.view) quoteMode.delete(context.view); return null; }
      if (context.view && quoteMode.has(context.view)) return null;
      const { notes, books, kindLabels, relationLabels, currentNoteId } = latest.current;
      const options: Completion[] = studyLinkOptions(open.query, notes, books).map(option => ({ label: option.label, detail: kindLabels[option.kind], apply: withRelation(option.text, open.relation), boost: 99, type: option.kind === 'note' ? 'text' : option.kind === 'book' ? 'class' : 'constant' }));
      // Typed relationships (decision S4): `[[sup` or `[[يؤ` offers `supports::`, then the search goes on for the target.
      if (!open.relation && relationLabels) {
        for (const relation of matchingStudyRelations(open.query)) {
          options.push({
            label: `${relation}::`,
            displayLabel: relationLabels[relation],
            detail: relationLabels.relation,
            boost: open.query.trim() ? 40 : -60,
            type: 'keyword',
            apply: (editor: EditorView, _completion: Completion, from: number, to: number) => {
              const text = `[[${relation}::`;
              editor.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } });
              startCompletion(editor);
            },
          });
        }
      }
      // Paragraphs of saved notes come after note titles. A paragraph without an anchor gets one in its own note.
      for (const paragraph of paragraphOptions(open.query, notes, currentNoteId)) {
        options.push({
          label: paragraph.label,
          detail: `${kindLabels.paragraph} · ${paragraph.noteTitle}`,
          info: paragraph.text.slice(0, 300),
          boost: 50,
          type: 'text',
          apply: (editor: EditorView, _completion: Completion, from: number, to: number) => {
            const target = latest.current.notes.find(note => note.id === paragraph.noteId);
            const anchor = paragraph.anchor ?? newParagraphAnchor(target?.content ?? '');
            const text = withRelation(paragraphLink(paragraph.noteId, anchor, paragraph.label), open.relation);
            editor.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } });
            if (!paragraph.anchor) void latest.current.onAnchorParagraph?.(paragraph.noteId, paragraph.start, anchor);
          },
        });
      }
      return options.length ? { from: line.from + open.from, filter: false, options } : null;
    };
    const completeCorpus = async (context: CompletionContext): Promise<CompletionResult | null> => {
      const line = context.state.doc.lineAt(context.pos);
      const open = openStudyLink(line.text.slice(0, context.pos - line.from));
      const { kindLabels, searchCorpus } = latest.current;
      const mode = context.view ? quoteMode.get(context.view) : undefined;
      if (!open || !searchCorpus) return null;
      const query = open.query.trim();
      // A typed reference already has its link option; only /quran needs the text looked up for it.
      const citation = /^[\d٠-٩]{1,3}\s*[:：]/u.test(query);
      if (query.length < (mode ? 1 : 3) || (citation && !mode)) return null;
      await new Promise(resolve => setTimeout(resolve, 200));
      if (context.aborted) return null;
      const found = await searchCorpus(mode ? [mode] : ['quran', 'hadith', 'poem'], query).catch(() => [] as CorpusOption[]);
      if (context.aborted || !found.length) return null;
      return {
        from: line.from + open.from,
        filter: false,
        options: found.map(option => ({
          label: option.label,
          detail: kindLabels[option.kind],
          info: option.snippet,
          // Below local matches, so late corpus results never move the item the cursor is on.
          boost: -1,
          type: 'variable',
          apply: (editor: EditorView, _completion: Completion, from: number, to: number) => {
            const quote = quoteMode.get(editor);
            quoteMode.delete(editor);
            const text = quote ? option.quote : withRelation(option.link, open.relation);
            // A quote starts on its own line so the Markdown block is valid.
            const lineStart = editor.state.doc.lineAt(from).from;
            const prefix = quote && from > lineStart && editor.state.sliceDoc(lineStart, from).trim() ? '\n' : '';
            editor.dispatch({ changes: { from, to, insert: prefix + text }, selection: { anchor: from + prefix.length + text.length } });
          },
        })),
      };
    };
    const slash = (context: CompletionContext): CompletionResult | null => {
      const line = context.state.doc.lineAt(context.pos);
      const before = line.text.slice(0, context.pos - line.from);
      const dataset = parseSlashCommand(before);
      if (latest.current.slashSearchLabels && dataset && (dataset.scope || !dataset.query || suggestScopes(dataset.partialScope || dataset.query).length || !matchSlashCommands(dataset.query).length)) return null;
      const open = openSlashCommand(before);
      if (!open) return null;
      const { slashLabels } = latest.current;
      const options: Completion[] = matchSlashCommands(open.query, slashLabels).map(command => ({
        label: `/${open.query}`,
        displayLabel: slashLabels[command.id],
        type: 'keyword',
        apply: (editor: EditorView, _completion: Completion, from: number, to: number) => {
          if (command.id === 'card') {
            editor.dispatch({ changes: { from, to, insert: '' }, selection: { anchor: from } });
            const line = editor.state.doc.lineAt(from);
            const next = line.number < editor.state.doc.lines ? editor.state.doc.line(line.number + 1).text : null;
            // Tag the line now, while it is still the line the cursor is on; the save runs after.
            if (cardsFromLine(line.text, next).length && !/(^|\s)#card\b/iu.test(line.text)) {
              // The tag goes before a paragraph anchor, which must stay last on the line.
              const anchored = PARAGRAPH_ANCHOR.exec(line.text);
              const at = anchored ? line.from + anchored.index : line.to;
              const before = editor.state.sliceDoc(line.from, at);
              const tag = `${/\s$/u.test(before) || !before ? '' : ' '}#card`;
              editor.dispatch({ changes: { from: at, insert: tag }, selection: { anchor: anchored ? line.to + tag.length : at + tag.length } });
            }
            void latest.current.onMakeCards?.(line.text, next);
            return;
          }
          const text = command.id === 'date' ? latest.current.dateText() : command.insert;
          editor.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } });
          if (command.id === 'quran' || command.id === 'hadith' || command.id === 'poem') quoteMode.set(editor, command.id);
          else quoteMode.delete(editor);
          if (text === '[[') startCompletion(editor);
        },
      }));
      return options.length ? { from: line.from + open.from, filter: false, options } : null;
    };
    const wrap = (prefix: string, suffix: string) => (editor: EditorView) => {
      editor.dispatch(editor.state.changeByRange(range => ({
        changes: [{ from: range.from, insert: prefix }, { from: range.to, insert: suffix }],
        range: EditorSelection.range(range.from + prefix.length, range.to + prefix.length),
      })));
      return true;
    };
    const editor = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          slashSearchExtension(() => ({ notes: latest.current.notes, books: latest.current.books, searchCorpus: latest.current.searchCorpus, labels: latest.current.slashSearchLabels ?? { scopes: { quran: latest.current.kindLabels.quran, sunnah: latest.current.kindLabels.hadith, albayan: latest.current.kindLabels.poem, notes: latest.current.kindLabels.note, books: latest.current.kindLabels.book, lectures: latest.current.kindLabels.book }, loading: '', empty: '', label: '' }, dir: latest.current.dir })),
          history(),
          markdown(),
          syntaxHighlighting(highlight),
          EditorView.lineWrapping,
          EditorView.perLineTextDirection.of(true),
          lineDirection,
          linkPreview,
          relationMenu,
          paragraphAnchors,
          theme,
          // interactionDelay 0: CodeMirror otherwise ignores Enter for 75 ms after the list changes, so a press that
          // coincided with late Quran/Sunnah/poetry results fell through and inserted a new line instead of the link.
          // Local matches appear at once and stay on top, so Enter always takes the highlighted item.
          autocompletion({ override: [complete, completeCorpus, slash], icons: false, interactionDelay: 0 }),
          // Lecture timestamps: Enter opens the new line with the current time, unless a suggestion is being picked.
          Prec.highest(keymap.of([{ key: 'Enter', run: editor => {
            if (completionStatus(editor.state) === 'active') return false;
            const prefix = latest.current.newLinePrefix?.();
            if (!prefix) return false;
            editor.dispatch(editor.state.replaceSelection(`\n${prefix}`), { scrollIntoView: true, userEvent: 'input' });
            return true;
          } }])),
          keymap.of([
            { key: 'Mod-b', run: wrap('**', '**') },
            { key: 'Mod-i', run: wrap('*', '*') },
            { key: 'Mod-s', preventDefault: true, run: () => { latest.current.onSave?.(); return true; } },
            { key: 'Mod-Alt-r', preventDefault: true, run: cycleRelation },
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          editable.current.of([EditorView.editable.of(!disabled), EditorState.readOnly.of(!!disabled)]),
          honorifics.current.of(expandHonorifics ? honorificInput : []),
          relations.current.of(relationNames.of(relationLabels ?? {})),
          labels.current.of([placeholderExtension(placeholder), EditorView.contentAttributes.of({ 'aria-label': ariaLabel, 'aria-multiline': 'true' })]),
          EditorView.updateListener.of(update => {
            if (!update.docChanged) return;
            const text = update.state.doc.toString();
            if (!update.transactions.some(transaction => transaction.annotation(externalValue))) {
              emitted.current.push(text);
              if (emitted.current.length > 50) emitted.current.shift();
            }
            latest.current.onChange(text);
          }),
        ],
      }),
    });
    view.current = editor;
    // Automation and accessibility hook: the wrapper exposes the text as `value`, like the textarea it replaced.
    Object.defineProperty(host.current, 'value', {
      configurable: true,
      get: () => editor.state.doc.toString(),
      set: (text: string) => editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: String(text) } }),
    });
    return () => { editor.destroy(); view.current = null; };
    // The editor is created once; later prop changes are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The editor owns the text while the user types. A `value` it sent itself comes back from React a render later,
  // possibly after newer keystrokes; applying it then would undo them (a lost Enter). So a value the editor emitted
  // is only an echo and is skipped, and only text from elsewhere (a loaded draft, Clear, an insert) replaces the document.
  useEffect(() => {
    const editor = view.current;
    if (!editor || editor.state.doc.toString() === value) { emitted.current = []; return; }
    const echo = emitted.current.lastIndexOf(value);
    if (echo >= 0) { emitted.current = emitted.current.slice(echo + 1); return; }
    emitted.current = [];
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value }, annotations: externalValue.of(true) });
  }, [value]);

  useEffect(() => {
    view.current?.dispatch({ effects: honorifics.current.reconfigure(expandHonorifics ? honorificInput : []) });
  }, [expandHonorifics]);

  // The names change with the interface language; compare by content, since the object is rebuilt each render.
  const relationKey = JSON.stringify(relationLabels ?? {});
  useEffect(() => {
    view.current?.dispatch({ effects: relations.current.reconfigure(relationNames.of(JSON.parse(relationKey))) });
  }, [relationKey]);

  // Focus once the editor is first editable (a new note is disabled while its saved draft loads).
  const focused = useRef(false);
  useEffect(() => {
    if (!autoFocus || disabled || focused.current || !view.current) return;
    // KEY-321: focus whichever editor is live in the next frame; a re-run (StrictMode) may have replaced it.
    const frame = requestAnimationFrame(() => {
      if (!view.current) return;
      focused.current = true;
      view.current.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [autoFocus, disabled]);

  useEffect(() => {
    view.current?.dispatch({ effects: [
      editable.current.reconfigure([EditorView.editable.of(!disabled), EditorState.readOnly.of(!!disabled)]),
      labels.current.reconfigure([placeholderExtension(placeholder), EditorView.contentAttributes.of({ 'aria-label': ariaLabel, 'aria-multiline': 'true' })]),
    ] });
  }, [disabled, ariaLabel, placeholder]);

  useImperativeHandle(ref, () => ({
    insert: (prefix, suffix = '', options) => {
      const editor = view.current;
      const area = fallback.current;
      if (!editor && area) {
        const { selectionStart: start, selectionEnd: end, value: text } = area;
        latest.current.onChange(`${text.slice(0, start)}${prefix}${text.slice(start, end)}${suffix}${text.slice(end)}`);
        return;
      }
      if (!editor) return;
      const { from, to } = editor.state.selection.main;
      // Inserted links and quotes never glue onto the word before the cursor.
      if (options?.spaced && from > 0 && !/\s/u.test(editor.state.sliceDoc(from - 1, from)) && !/^\s/u.test(prefix)) prefix = ` ${prefix}`;
      editor.dispatch({ changes: [{ from, insert: prefix }, { from: to, insert: suffix }], selection: { anchor: from + prefix.length, head: to + prefix.length } });
      editor.focus();
    },
    focus: () => (view.current ?? fallback.current)?.focus(),
  }), []);

  if (!supported) return <textarea ref={fallback} data-scratchpad-textarea data-study-note-editor disabled={disabled} aria-label={ariaLabel} placeholder={placeholder} value={value} onChange={event => onChange(event.target.value)} rows={5} dir={dir} className="w-full rounded-lg border border-subtle bg-canvas p-3 text-sm leading-loose resize-y" />;
  return <div ref={host} dir={dir} data-scratchpad-textarea data-study-note-editor aria-disabled={disabled || undefined} className={`w-full rounded-lg border border-subtle bg-canvas text-main focus-within:ring-2 focus-within:ring-amber-500 ${disabled ? 'opacity-60' : ''}`} />;
});
