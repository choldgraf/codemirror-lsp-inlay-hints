# Contributing

## Develop

```sh
npm install
npm test
npm run build
```

The tests run CodeMirror in [jsdom](https://github.com/jsdom/jsdom) against a fake language server, and take about a second.
`npm run build` also typechecks.
`npm install` runs it too, through the `prepare` script.
CI runs `npm ci` and the tests on every pull request.

To try a change in another project, install your checkout as a copy:

```sh
npm install ../codemirror-lsp-inlay-hints --install-links
```

A plain `file:` link would give that project two copies of `@codemirror/state`.
CodeMirror breaks when extensions come from different copies.
npm only re-copies when the version changes.
To pick up later changes, delete the copy in that project's `node_modules` and install again.

## Docs

The docs site is this repository's README plus this page.
`npm run docs:live` previews it, and `npm run docs` builds it.
It's published to GitHub Pages from `main`.

## Release

1. Bump `version` in `package.json` and merge it to `main`.
2. Run the Release workflow from the Actions tab, or `gh workflow run release.yml`.

It runs the tests, publishes the package to npm, tags the commit `v<version>`, and creates a GitHub release with generated notes.
Publishing needs npm's [trusted publisher](https://docs.npmjs.com/trusted-publishers) set up for `release.yml`.
