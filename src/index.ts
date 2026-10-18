import { LSPPlugin, type LSPClientExtension } from '@codemirror/lsp-client';
import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import type * as lsp from 'vscode-languageserver-protocol';

class Hint extends WidgetType {
  label: string;
  title: string;
  className: string;
  constructor(label: string, title: string, className: string) {
    super();
    this.label = label;
    this.title = title;
    this.className = className;
  }
  eq(other: Hint) { return other.label === this.label && other.title === this.title && other.className === this.className; }
  toDOM() {
    const span = document.createElement('span');
    span.className = this.className;
    span.textContent = this.label;
    if (this.title) span.title = this.title;
    return span;
  }
}

function widget({ label, tooltip, kind, paddingLeft, paddingRight }: lsp.InlayHint) {
  const text = typeof label === 'string' ? label : label.map((p) => p.value).join('');
  const title = typeof tooltip === 'object' ? tooltip.value : tooltip ?? '';
  const classes = ['cm-inlay-hint'];
  if (kind === 1 /* Type */) classes.push('cm-inlay-hint-type');
  if (kind === 2 /* Parameter */) classes.push('cm-inlay-hint-parameter');
  if (paddingLeft) classes.push('cm-inlay-hint-padding-left');
  if (paddingRight) classes.push('cm-inlay-hint-padding-right');
  return Decoration.widget({ widget: new Hint(text, title, classes.join(' ')), side: 1 });
}

const setHints = StateEffect.define<DecorationSet>();
const hints = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update: (deco, tr) => tr.effects.find((e) => e.is(setHints))?.value ?? deco.map(tr.changes),
  provide: (f) => EditorView.decorations.from(f),
});

// Each editor's newest request, so responses to older requests are dropped.
const latest = new WeakMap<EditorView, object>();

/**
 * Ask the server for this editor's inlay hints now.
 * Use it when hints change without an edit to this file, such as after edits to other files.
 * It never rejects.
 * If the request fails, the old hints stay.
 */
export const refreshInlayHints = (view: EditorView) => requestHints(view).catch(() => {});

async function requestHints(view: EditorView) {
  const plugin = LSPPlugin.get(view);
  if (!plugin || !view.state.field(hints, false)) return;
  const request = {};
  latest.set(view, request);
  await plugin.client.initializing;
  if (!plugin.client.serverCapabilities?.inlayHintProvider) return;
  plugin.client.sync();
  const doc = view.state.doc;
  const range = { start: { line: 0, character: 0 }, end: plugin.toPosition(doc.length, doc) };
  const result = await plugin.client.request<lsp.InlayHintParams, lsp.InlayHint[] | null>('textDocument/inlayHint', { textDocument: { uri: plugin.uri }, range });
  // Ignore this response if a newer request was sent or the doc changed since.
  if (latest.get(view) !== request || view.state.doc !== doc) return;
  const decos = (result ?? []).map((h) => widget(h).range(plugin.fromPosition(h.position, doc)));
  view.dispatch({ effects: setHints.of(Decoration.set(decos, true)) });
}

// Requests hints when the editor opens, and again `delay` ms after the last edit.
const scheduler = (delay: number) => ViewPlugin.fromClass(class {
  view: EditorView;
  timer = setTimeout(() => refreshInlayHints(this.view), 0);
  constructor(view: EditorView) { this.view = view; }
  update(update: ViewUpdate) {
    if (!update.docChanged) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => refreshInlayHints(this.view), delay);
  }
  destroy() { clearTimeout(this.timer); }
});

const theme = EditorView.baseTheme({
  '.cm-inlay-hint': { color: '#9ca3af', fontSize: '0.9em' },
  '.cm-inlay-hint-padding-left': { paddingLeft: '0.3em' },
  '.cm-inlay-hint-padding-right': { paddingRight: '0.3em' },
});

/**
 * Show the server's [inlay hints](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_inlayHint) as widgets.
 * Pass `delay: null` to turn off automatic requests if you call `refreshInlayHints` yourself.
 */
export function inlayHints({ delay = 300 }: { delay?: number | null } = {}): LSPClientExtension {
  return {
    clientCapabilities: { textDocument: { inlayHint: {} } },
    editorExtension: [hints, theme, delay === null ? [] : scheduler(delay)],
  };
}
