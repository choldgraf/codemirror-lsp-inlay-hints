import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// CodeMirror needs a DOM.
const { window } = new JSDOM('', { pretendToBeVisual: true });
Object.assign(globalThis, { window, document: window.document, MutationObserver: window.MutationObserver, Window: window.Window });

const { LSPClient } = await import('@codemirror/lsp-client');
const { EditorView } = await import('@codemirror/view');
const { inlayHints, refreshInlayHints } = await import('./index.ts');

// A server whose one hint is labelled `v<doc version>.<request number>`.
// `delays` holds how long, in ms, it waits before answering each hint request.
function fakeServer(delays: number[] = []) {
  let handler = (_: string) => {};
  let version = 0;
  let requests = 0;
  const reply = (id: number, result: unknown, ms = 0) => setTimeout(() => handler(JSON.stringify({ jsonrpc: '2.0', id, result })), ms);
  return {
    send(message: string) {
      const { id, method, params } = JSON.parse(message);
      if (method === 'textDocument/didChange') version = params.textDocument.version;
      if (method === 'initialize') reply(id, { capabilities: { inlayHintProvider: true, textDocumentSync: 2 } });
      if (method === 'textDocument/inlayHint') {
        const n = requests++;
        reply(id, [{ position: { line: 0, character: 4 }, label: `v${version}.${n}` }], delays[n]);
      }
    },
    subscribe: (h: (m: string) => void) => (handler = h),
    unsubscribe: () => {},
  };
}

const hint = (view: InstanceType<typeof EditorView>) => view.dom.querySelector('.cm-inlay-hint')?.textContent;
const until = async (check: () => boolean) => { while (!check()) await new Promise((r) => setTimeout(r, 5)); };

test('shows hints when the editor opens and after edits', { timeout: 5000 }, async () => {
  const client = new LSPClient({ rootUri: 'file:///', extensions: [inlayHints({ delay: 10 })] }).connect(fakeServer());
  const view = new EditorView({ doc: '@ref', extensions: client.plugin('file:///a.md'), parent: document.body });
  await until(() => hint(view) === 'v0.0');
  view.dispatch({ changes: { from: 0, insert: 'x' } });
  await until(() => hint(view) === 'v1.1');
  view.destroy();
});

test('keeps the newest response when an older one arrives late', { timeout: 5000 }, async () => {
  const client = new LSPClient({ rootUri: 'file:///', extensions: [inlayHints({ delay: null })] }).connect(fakeServer([50]));
  const view = new EditorView({ doc: '@ref', extensions: client.plugin('file:///a.md'), parent: document.body });
  await Promise.all([refreshInlayHints(view), refreshInlayHints(view)]);
  assert.equal(hint(view), 'v0.1');
  view.destroy();
});
