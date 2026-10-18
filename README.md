# codemirror-lsp-inlay-hints

Inlay hints for [`@codemirror/lsp-client`](https://github.com/codemirror/lsp-client).

Inlay hints are the small labels a language server places in your code.
They can be a parameter name before an argument, an inferred type after a variable, or the "Figure 1" a MyST reference will render as.
`@codemirror/lsp-client` doesn't show them, and its maintainer [prefers that they live outside it](https://code.haverbeke.berlin/codemirror/dev/issues/1772).
This package adds them as one more client extension.

![Two references in a MyST document, each followed by a grey hint: "Figure 1" and "Section: The basics".](docs/images/inlay-hints.png)

## Install

```sh
npm install codemirror-lsp-inlay-hints
```

It uses your project's `@codemirror/lsp-client`, `@codemirror/state` and `@codemirror/view`.

## Use

Add `inlayHints()` to your client's extensions:

```ts
import { LSPClient, languageServerExtensions } from '@codemirror/lsp-client';
import { inlayHints } from 'codemirror-lsp-inlay-hints';

const client = new LSPClient({ extensions: [...languageServerExtensions(), inlayHints()] });
```

Each editor asks the server for hints when it opens, and again 300 ms after the last edit.
Nothing happens if the server doesn't support inlay hints.

### Options

`inlayHints({ delay })` sets how long to wait after the last edit, in ms, before asking again.
It defaults to `300`.
`delay: null` turns off automatic requests, so hints only come from `refreshInlayHints`.

### Refresh hints yourself

A file's hints can change without an edit to that file.
For example, a reference's label changes when someone edits the file it points to.
Servers announce this with `workspace/inlayHint/refresh`, but `@codemirror/lsp-client` doesn't handle requests from the server yet ([#1](https://github.com/choldgraf/codemirror-lsp-inlay-hints/issues/1)).

So call `refreshInlayHints(view)` when you know the hints are out of date.
Some servers re-publish diagnostics when another file changes, so that's a handy trigger.
[MyST Author](https://github.com/choldgraf/myst-author) does this with [mystmd-lsp](https://github.com/choldgraf/mystmd-lsp):

```ts
import { LSPClient, languageServerExtensions, type LSPClientExtension } from '@codemirror/lsp-client';
import { inlayHints, refreshInlayHints } from 'codemirror-lsp-inlay-hints';

const refreshOnDiagnostics: LSPClientExtension = {
  notificationHandlers: {
    'textDocument/publishDiagnostics': (client, params) => {
      const view = client.workspace.getFile(params.uri)?.getView();
      if (view) refreshInlayHints(view);
      return false; // keep going, so lsp-client still shows the diagnostics
    },
  },
};

// Handlers run in order until one returns true.
// languageServerExtensions() has a diagnostics handler that does, so put this one first.
const client = new LSPClient({ extensions: [inlayHints(), refreshOnDiagnostics, ...languageServerExtensions()] });
```

`refreshInlayHints` never rejects: if the request fails, the old hints stay.
If you refresh on diagnostics and the server also sends them when a file opens and after every edit, as mystmd-lsp does, `inlayHints({ delay: null })` avoids asking twice.

### Style

Each hint is a `<span class="cm-inlay-hint">`, which also gets these classes:

| Class | When |
| --- | --- |
| `cm-inlay-hint-type` | The server marks it as a type hint |
| `cm-inlay-hint-parameter` | The server marks it as a parameter hint |
| `cm-inlay-hint-padding-left`, `cm-inlay-hint-padding-right` | The server asks for space on that side |

Hints are grey and slightly smaller than the text.
Override that with a theme:

```ts
EditorView.theme({ '.cm-inlay-hint': { color: 'teal', fontStyle: 'italic' } });
```

A hint's tooltip, if the server sends one, becomes its `title`.

## How it works

- It asks for the whole document's hints, and shows each as a widget at its position.
- Hints move with the text while you type, until the next response replaces them.
- A response is dropped if the document changed or a newer request went out while it was on its way.

## Not supported yet

- Receiving `workspace/inlayHint/refresh` from the server (see [Refresh hints yourself](#refresh-hints-yourself)).
- Asking only for the visible part of the document, which matters for very long files.
- `inlayHint/resolve`, clickable label parts, and a hint's `textEdits`.

Issues and pull requests for any of these are welcome.
See [Contributing](docs/contributing.md).
