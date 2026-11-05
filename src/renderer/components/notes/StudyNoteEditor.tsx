'use client';
import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Annotation, Compartment, EditorSelection, EditorState, Prec, RangeSetBuilder } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, keymap, placeholder as placeholderExtension, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, isolateHistory } from '@codemirror/commands';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { markdown } from '@codemirror/lang-markdown';
import { autocompletion, completionStatus, startCompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { tags } from '@lezer/highlight';
import { openStudyLink, studyLinkOptions } from '../../../shared/study-link-completion';
import { studyLinks, type StudyNote } from '../../../shared/study-notes';
import { matchSlashCommands, openSlashCommand, type SlashCommandId } from '../../../shared/note-slash-commands';
import { cardsFromLine } from '../../../shared/note-cards';
import { honorificExpansion } from '../../../shared/honorifics';
import { PARAGRAPH_ANCHOR, newParagraphAnchor, paragraphLink, paragraphOptions } from '../../../shared/note-paragraphs';
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
  '.cm-scroller': { fontFamily: 'inherit', lineHeight: '2', minHeight: '8rem', maxHeight: '28rem', overflow: 'auto' },
  // Room above and below each line so Arabic diacritics are never clipped.
  '.cm-content': { padding: '0.5rem 0.75rem', caretColor: 'currentColor' },
  '.cm-line': { padding: '0.1rem 0', textAlign: 'start' },
  '.cm-placeholder': { opacity: '0.6' },
  '.cm-tooltip-autocomplete': { borderRadius: '0.5rem', overflow: 'hidden' },
  '.cm-tooltip-autocomplete ul li': { padding: '0.25rem 0.5rem', lineHeight: '1.8' },
  // Emerald 500 reads on both the light and dark themes.
  '.cm-paragraph-anchor': { opacity: '0.35', fontSize: '0.75em' },
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
          builder.add(line.from + link.start, line.from + labelStart, hidden);
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

const linkPreview = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: EditorView) { this.decorations = linkDecorations(view); }
  update(update: ViewUpdate) { if (update.docChanged || update.viewportChanged || update.selectionSet || update.focusChanged) this.decorations = linkDecorations(update.view); }
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
  books: { id: string; title: string }[];
  kindLabels: Record<'note' | 'book' | 'quran' | 'hadith' | 'poem' | 'paragraph', string>;
  /** The note being edited, so its own paragraphs are not offered. */
  currentNoteId?: string;
  /** Saves a new anchor at the end of a paragraph in another note (the paragraph text is not changed). */
  onAnchorParagraph?: (noteId: string, start: number, anchor: string) => Promise<void>;
  /** Searches the installed Quran, Sunnah and poetry; optional so the editor works without them. */
  searchCorpus?: (kinds: CorpusKind[], query: string) => Promise<CorpusOption[]>;
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
}>(function StudyNoteEditor({ value, onChange, dir, disabled, ariaLabel, placeholder, notes, books, kindLabels, currentNoteId, onAnchorParagraph, searchCorpus, slashLabels, dateText, onMakeCards, autoFocus, expandHonorifics = true, newLinePrefix, onSave }, ref) {
  // CodeMirror needs a real DOM (MutationObserver, ranges). Simplified DOMs used by unit tests get a plain textarea.
  const supported = typeof MutationObserver !== 'undefined' && typeof document !== 'undefined' && typeof document.createRange === 'function';
  const fallback = useRef<HTMLTextAreaElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const latest = useRef({ onChange, onSave, notes, books, kindLabels, slashLabels, dateText, searchCorpus, onMakeCards, currentNoteId, onAnchorParagraph, newLinePrefix });
  latest.current = { onChange, onSave, notes, books, kindLabels, slashLabels, dateText, searchCorpus, onMakeCards, currentNoteId, onAnchorParagraph, newLinePrefix };
  const emitted = useRef<string[]>([]);
  const editable = useRef(new Compartment());
  const honorifics = useRef(new Compartment());
  const labels = useRef(new Compartment());

  useEffect(() => {
    if (!supported || !host.current) return;
    // Local suggestions (notes, books, typed ayah references) answer at once; the installed corpora answer
    // separately, so the list never waits on them and Enter always applies what is shown.
    const complete = (context: CompletionContext): CompletionResult | null => {
      const line = context.state.doc.lineAt(context.pos);
      const open = openStudyLink(line.text.slice(0, context.pos - line.from));
      if (!open) { if (context.view) quoteMode.delete(context.view); return null; }
      if (context.view && quoteMode.has(context.view)) return null;
      const { notes, books, kindLabels, currentNoteId } = latest.current;
      const options: Completion[] = studyLinkOptions(open.query, notes, books).map(option => ({ label: option.label, detail: kindLabels[option.kind], apply: option.text, boost: 99, type: option.kind === 'note' ? 'text' : option.kind === 'book' ? 'class' : 'constant' }));
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
            const text = paragraphLink(paragraph.noteId, anchor, paragraph.label);
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
            const text = quote ? option.quote : option.link;
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
      const open = openSlashCommand(line.text.slice(0, context.pos - line.from));
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
          history(),
          markdown(),
          syntaxHighlighting(highlight),
          EditorView.lineWrapping,
          EditorView.perLineTextDirection.of(true),
          lineDirection,
          linkPreview,
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
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          editable.current.of([EditorView.editable.of(!disabled), EditorState.readOnly.of(!!disabled)]),
          honorifics.current.of(expandHonorifics ? honorificInput : []),
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

  // Focus once the editor is first editable (a new note is disabled while its saved draft loads).
  const focused = useRef(false);
  useEffect(() => {
    if (!autoFocus || disabled || focused.current || !view.current) return;
    focused.current = true;
    const editor = view.current;
    requestAnimationFrame(() => editor.focus());
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
