# nLab redesign — prototype

A redesign prototype of the [nLab](https://ncatlab.org/nlab/show/HomePage) home page and article view,
including the [Center for Quantum and Topological Systems](https://ncatlab.org/nlab/show/Center+for+Quantum+and+Topological+Systems) section.
**Not the official nLab.** All content belongs to the nLab and its contributors.

## Run locally

```sh
npm install
npm run dev        # http://localhost:5173 — articles and latest edits load live via a dev proxy
```

## Design

A single, quiet design based on Google's Material style. Articles use a paper-like reading layout:
serif text, numbered sections and LaTeX-style theorem environments.

## Editing articles

Every article has an **Edit** button (or press <kbd>E</kbd>). The editor loads the page's nLab source
(Markdown + LaTeX) and offers:

- source and live preview side by side (math rendered with KaTeX), or each on its own;
- a toolbar for formatting, `[[wiki links]]`, inline/displayed math and theorem environments;
- a **Changes** view with a line-by-line diff against the published source;
- an edit summary, <kbd>⌘S</kbd> to save, <kbd>Esc</kbd> to cancel.

Saved edits are kept in the browser (localStorage) and shown in place of the published page, with
options to compare, keep editing, discard, or **Submit to nLab** — this copies the source and opens the
page's editor on ncatlab.org, where it is actually published.

## How content is loaded

ncatlab.org does not send CORS headers, so a browser cannot fetch it directly.

- **Dev server** — a Vite proxy (`/nlab-api` → ncatlab.org) serves pages live.
- **Static build / GitHub Pages** — `npm run build:pages` first runs `scripts/snapshot.mjs`, which saves every nLab page
  the site links to (plus the latest-revisions list) into `public/snapshot/`, and their sources (for the editor), then builds. Pages outside the snapshot
  open on ncatlab.org. The GitHub Action in `.github/workflows/pages.yml` rebuilds every 6 hours to refresh it.

## Image credits

Images are from Wikimedia Commons (public domain, CC0 or CC BY); full credits are listed in the site footer
and in `src/data/credits.json`.
