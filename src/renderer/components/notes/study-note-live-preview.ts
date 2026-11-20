import { Facet, RangeSetBuilder, StateField, type EditorState } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { completionStatus } from '@codemirror/autocomplete';
import { Decoration, EditorView, ViewPlugin, WidgetType, keymap, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { markdownBlockDirections } from '../../../shared/text-direction';
import { cellOffsetInTable, findMarkdownTables, moveTableCell, type MarkdownTable } from '../../../shared/markdown-table';
import { findMarkdownCallouts, type CalloutKind } from '../../../shared/note-callouts';

export const editorDirFacet = Facet.define<'rtl' | 'ltr', 'rtl' | 'ltr'>({
  combine: values => values[0] ?? 'ltr',
});

export const calloutLabelsFacet = Facet.define<Partial<Record<CalloutKind, string>>, Partial<Record<CalloutKind, string>>>({
  combine: values => values[0] ?? {},
});

const hidden = Decoration.replace({});

function activeLineNumbers(state: EditorState): Set<number> {
  const active = new Set<number>();
  for (const range of state.selection.ranges) {
    const startLine = state.doc.lineAt(range.from).number;
    const endLine = state.doc.lineAt(range.to).number;
    for (let line = startLine; line <= endLine; line++) active.add(line);
  }
  return active;
}

function buildLineDirections(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const fallback = view.state.facet(editorDirFacet);
  const directions = markdownBlockDirections(view.state.doc.toString(), fallback);
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to;) {
      const line = view.state.doc.lineAt(pos);
      const dir = directions[line.number - 1] ?? fallback;
      builder.add(line.from, line.from, Decoration.line({ attributes: { dir } }));
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

/**
 * Per-line direction decorations computed via `markdownBlockDirections`, paired with
 * `EditorView.perLineTextDirection` so Arabic and Latin lines each align and move naturally.
 */
export const lineDirectionPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildLineDirections(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.startState.facet(editorDirFacet) !== update.state.facet(editorDirFacet)) {
        this.decorations = buildLineDirections(update.view);
      }
    }
  },
  { decorations: plugin => plugin.decorations },
);

class BulletWidget extends WidgetType {
  eq() { return true; }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-lp-bullet';
    span.textContent = '• ';
    return span;
  }
}

class CalloutBadgeWidget extends WidgetType {
  constructor(readonly kind: CalloutKind, readonly label: string) { super(); }
  eq(other: CalloutBadgeWidget) { return other.kind === this.kind && other.label === this.label; }
  toDOM() {
    const badge = document.createElement('span');
    badge.className = `cm-lp-callout-badge cm-lp-callout-badge-${this.kind}`;
    badge.setAttribute('data-callout-badge', this.kind);
    badge.textContent = this.label;
    return badge;
  }
}

interface PendingDeco {
  from: number;
  to: number;
  deco: Decoration;
  isReplace?: boolean;
}

function buildSortedDecorations(items: PendingDeco[]): DecorationSet {
  items.sort((a, b) => a.from - b.from || a.deco.startSide - b.deco.startSide || a.to - b.to);
  const builder = new RangeSetBuilder<Decoration>();
  let lastReplaceEnd = -1;
  for (const item of items) {
    if (item.isReplace) {
      if (item.from < lastReplaceEnd) continue;
      lastReplaceEnd = item.to;
    }
    builder.add(item.from, item.to, item.deco);
  }
  return builder.finish();
}

function buildMarkdownLivePreview(view: EditorView): DecorationSet {
  const { state } = view;
  const doc = state.doc;
  const text = doc.toString();
  const active = activeLineNumbers(state);
  const calloutLines = new Set<number>();
  for (const callout of findMarkdownCallouts(text)) {
    for (let line = callout.fromLine; line <= callout.toLine; line++) calloutLines.add(line);
  }
  const tableLines = new Set<number>();
  for (const table of findMarkdownTables(text)) {
    const caretInside = state.selection.ranges.some(r => r.from <= table.end && r.to >= table.start);
    if (!caretInside) {
      for (let line = table.fromLine; line <= table.toLine; line++) tableLines.add(line);
    }
  }

  const pending: PendingDeco[] = [];
  const tree = syntaxTree(state);

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter(node) {
        if (node.name === 'FencedCode') return false;

        const startLine = doc.lineAt(node.from);
        if (tableLines.has(startLine.number)) return false;

        if (node.name.startsWith('ATXHeading')) {
          const level = Number(node.name.slice('ATXHeading'.length)) || 1;
          pending.push({
            from: startLine.from,
            to: startLine.from,
            deco: Decoration.line({ class: `cm-lp-heading cm-lp-h${Math.min(level, 6)}` }),
          });
          return;
        }

        if (node.name === 'HeaderMark') {
          if (!active.has(startLine.number)) {
            const after = doc.sliceString(node.to, node.to + 1) === ' ' ? 1 : 0;
            const hideTo = Math.min(startLine.to, node.to + after);
            if (hideTo > node.from) {
              pending.push({ from: node.from, to: hideTo, deco: hidden, isReplace: true });
            }
          }
          return;
        }

        if (node.name === 'StrongEmphasis') {
          pending.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: 'cm-lp-strong' }) });
          return;
        }

        if (node.name === 'Emphasis') {
          pending.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: 'cm-lp-em' }) });
          return;
        }

        if (node.name === 'EmphasisMark') {
          if (!active.has(startLine.number)) {
            pending.push({ from: node.from, to: node.to, deco: hidden, isReplace: true });
          }
          return;
        }

        if (node.name === 'InlineCode') {
          pending.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: 'cm-lp-code' }) });
          return;
        }

        if (node.name === 'CodeMark') {
          if (node.node.parent?.name === 'InlineCode' && !active.has(startLine.number)) {
            pending.push({ from: node.from, to: node.to, deco: hidden, isReplace: true });
          }
          return;
        }

        if (node.name === 'ListMark') {
          if (!active.has(startLine.number)) {
            const markText = doc.sliceString(node.from, node.to);
            if (markText === '-' || markText === '*' || markText === '+') {
              const after = doc.sliceString(node.to, node.to + 1) === ' ' ? 1 : 0;
              pending.push({
                from: node.from,
                to: node.to + after,
                deco: Decoration.replace({ widget: new BulletWidget() }),
                isReplace: true,
              });
            } else {
              pending.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: 'cm-lp-list-mark' }) });
            }
          }
          return;
        }

        if (node.name === 'Blockquote') {
          const endLine = doc.lineAt(node.to).number;
          for (let lineNo = startLine.number; lineNo <= endLine; lineNo++) {
            if (calloutLines.has(lineNo)) continue;
            const line = doc.line(lineNo);
            pending.push({ from: line.from, to: line.from, deco: Decoration.line({ class: 'cm-lp-quote' }) });
          }
          return;
        }

        if (node.name === 'QuoteMark') {
          if (!calloutLines.has(startLine.number) && !active.has(startLine.number)) {
            const after = doc.sliceString(node.to, node.to + 1) === ' ' ? 1 : 0;
            pending.push({ from: node.from, to: node.to + after, deco: hidden, isReplace: true });
          }
          return;
        }

        if (node.name === 'Link' && !active.has(startLine.number)) {
          // Skip `[[...]]` study links, which are handled by linkPreview.
          if (doc.sliceString(node.from, node.from + 2) === '[[') return false;
          const marks = node.node.getChildren('LinkMark');
          if (marks.length >= 3) {
            const openBracket = marks[0];
            const closeBracket = marks[1];
            if (closeBracket.from > openBracket.to) {
              pending.push({ from: openBracket.from, to: openBracket.to, deco: hidden, isReplace: true });
              pending.push({ from: openBracket.to, to: closeBracket.from, deco: Decoration.mark({ class: 'cm-study-link' }) });
              pending.push({ from: closeBracket.from, to: node.to, deco: hidden, isReplace: true });
            }
          }
          return false;
        }
      },
    });
  }

  return buildSortedDecorations(pending);
}

/** Live preview decorations for headings, emphasis, inline code, lists, quotes, and Markdown links. */
export const markdownLivePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildMarkdownLivePreview(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.selectionSet || update.focusChanged) {
        this.decorations = buildMarkdownLivePreview(update.view);
      }
    }
  },
  { decorations: plugin => plugin.decorations },
);

const DEFAULT_CALLOUT_LABELS: Record<CalloutKind, string> = {
  note: 'Note',
  tip: 'Tip',
  warning: 'Warning',
  ayah: 'Ayah',
  hadith: 'Hadith',
  poem: 'Poetry',
  question: 'Question',
  summary: 'Summary',
};

function buildCalloutPreview(view: EditorView): DecorationSet {
  const { state } = view;
  const doc = state.doc;
  const active = activeLineNumbers(state);
  const labels = state.facet(calloutLabelsFacet);
  const callouts = findMarkdownCallouts(doc.toString());
  if (!callouts.length) return Decoration.none;

  const pending: PendingDeco[] = [];
  for (const callout of callouts) {
    for (let lineNo = callout.fromLine; lineNo <= callout.toLine; lineNo++) {
      const line = doc.line(lineNo);
      const isFirst = lineNo === callout.fromLine;
      const isLast = lineNo === callout.toLine;
      const classes = [
        'cm-lp-callout',
        `cm-lp-callout-${callout.kind}`,
        isFirst ? 'cm-lp-callout-first' : '',
        isLast ? 'cm-lp-callout-last' : '',
      ].filter(Boolean).join(' ');

      pending.push({
        from: line.from,
        to: line.from,
        deco: Decoration.line({ class: classes, attributes: { 'data-callout': callout.kind } }),
      });

      if (isFirst) {
        if (!active.has(lineNo)) {
          const badgeText = labels[callout.kind] || DEFAULT_CALLOUT_LABELS[callout.kind] || callout.rawType;
          pending.push({
            from: callout.start,
            to: callout.headerMarkerEnd,
            deco: Decoration.replace({ widget: new CalloutBadgeWidget(callout.kind, badgeText) }),
            isReplace: true,
          });
          if (callout.headerMarkerEnd < line.to) {
            pending.push({
              from: callout.headerMarkerEnd,
              to: line.to,
              deco: Decoration.mark({ class: 'cm-lp-callout-title' }),
            });
          }
        }
      } else if (!active.has(lineNo)) {
        const quotePrefix = /^[ \t]*>[ \t]?/u.exec(line.text);
        if (quotePrefix) {
          pending.push({
            from: line.from,
            to: line.from + quotePrefix[0].length,
            deco: hidden,
            isReplace: true,
          });
        }
      }
    }
  }

  return buildSortedDecorations(pending);
}

/** Boxed callout decorations for `> [!note]`, `> [!tip]`, `> [!warning]`, and Arabic labels. */
export const calloutPreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildCalloutPreview(view);
    }
    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.selectionSet ||
        update.focusChanged ||
        update.startState.facet(calloutLabelsFacet) !== update.state.facet(calloutLabelsFacet)
      ) {
        this.decorations = buildCalloutPreview(update.view);
      }
    }
  },
  { decorations: plugin => plugin.decorations },
);

class TableWidget extends WidgetType {
  constructor(readonly table: MarkdownTable, readonly tableStart: number) { super(); }
  eq(other: TableWidget) {
    return (
      other.tableStart === this.tableStart &&
      JSON.stringify(other.table) === JSON.stringify(this.table)
    );
  }
  toDOM(view: EditorView) {
    const wrap = document.createElement('div');
    wrap.className = 'cm-lp-table-wrap';
    wrap.dir = 'auto';
    wrap.setAttribute('data-table-widget', '');

    const tableEl = document.createElement('table');
    tableEl.className = 'cm-lp-table';

    const attachCellClick = (cellEl: HTMLElement, rowIdx: number, colIdx: number) => {
      cellEl.addEventListener('mousedown', event => {
        event.preventDefault();
        event.stopPropagation();
        const target = cellOffsetInTable(view.state.doc.toString(), this.tableStart, rowIdx, colIdx);
        if (target) {
          view.dispatch({ selection: { anchor: target.anchor, head: target.head }, scrollIntoView: true });
          view.focus();
        }
      });
    };

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    this.table.header.forEach((cellText, colIdx) => {
      const th = document.createElement('th');
      th.dir = 'auto';
      const align = this.table.align[colIdx];
      if (align && align !== 'none') th.style.textAlign = align;
      th.textContent = cellText;
      attachCellClick(th, -1, colIdx);
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    tableEl.appendChild(thead);

    if (this.table.rows.length) {
      const tbody = document.createElement('tbody');
      this.table.rows.forEach((rowCells, rowIdx) => {
        const tr = document.createElement('tr');
        rowCells.forEach((cellText, colIdx) => {
          const td = document.createElement('td');
          td.dir = 'auto';
          const align = this.table.align[colIdx];
          if (align && align !== 'none') td.style.textAlign = align;
          td.textContent = cellText;
          attachCellClick(td, rowIdx, colIdx);
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      tableEl.appendChild(tbody);
    }

    wrap.appendChild(tableEl);
    return wrap;
  }
  ignoreEvent() { return true; }
}

function buildTableDecorations(state: EditorState): DecorationSet {
  const tables = findMarkdownTables(state.doc.toString());
  if (!tables.length) return Decoration.none;
  const builder = new RangeSetBuilder<Decoration>();
  for (const item of tables) {
    const caretInside = state.selection.ranges.some(r => r.from <= item.end && r.to >= item.start);
    if (!caretInside) {
      builder.add(
        item.start,
        item.end,
        Decoration.replace({ widget: new TableWidget(item.table, item.start), block: true }),
      );
    }
  }
  return builder.finish();
}

/** Block-level table grid widget shown whenever the caret is outside a Markdown table. */
export const tablePreviewField = StateField.define<DecorationSet>({
  create: state => buildTableDecorations(state),
  update(current, tr) {
    if (tr.docChanged || tr.selection) return buildTableDecorations(tr.state);
    return current;
  },
  provide: field => EditorView.decorations.from(field),
});

function handleTableTab(direction: 1 | -1) {
  return (view: EditorView): boolean => {
    if (completionStatus(view.state) === 'active') return false;
    const head = view.state.selection.main.head;
    const text = view.state.doc.toString();
    const moved = moveTableCell(text, head, direction);
    if (!moved) return false;
    if (moved.content !== text) {
      view.dispatch({
        changes: { from: 0, to: text.length, insert: moved.content },
        selection: { anchor: moved.anchor, head: moved.head },
        scrollIntoView: true,
        userEvent: 'input',
      });
    } else {
      view.dispatch({
        selection: { anchor: moved.anchor, head: moved.head },
        scrollIntoView: true,
      });
    }
    return true;
  };
}

/** Tab / Shift-Tab navigation between Markdown table cells. */
export const tableTabKeymap = keymap.of([
  { key: 'Tab', run: handleTableTab(1) },
  { key: 'Shift-Tab', run: handleTableTab(-1) },
]);
