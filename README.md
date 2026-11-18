# nLab redesign — prototype

A redesign prototype of the [nLab](https://ncatlab.org/nlab/show/HomePage): reading, writing and discussing,
all in one interface. **Not the official nLab.** All content belongs to the nLab and its contributors.

## Run locally

```sh
npm install
npm run dev          # http://localhost:5173
npm run build:pages  # refresh the page index + forum snapshot, then build into dist/
```

## What's in it

- **Every nLab page** (≈ 20 800) renders in this UI: sources are loaded from the nLab's public content mirror
  ([ncatlab/nlab-content](https://github.com/ncatlab/nlab-content)), which serves files with CORS headers, and are
  rendered in the browser (Markdown + itex/LaTeX via KaTeX, wiki links, theorem environments, includes, context menus).
- **Search** over all page names and redirects, with instant suggestions in every search box; A–Z index of all pages.
- **Editing and writing** — full-screen workspace with two ways to write:
  - *Visual*: type into the page as normal text; `$x$` becomes a formula, `[[page]]` a link, `## ` a section;
    theorems, equations and tables are cards edited as LaTeX in place.
  - *LaTeX*: CodeMirror with highlighting, line numbers and autocomplete for `\commands` (with symbol previews),
    `[[page links]]` and `\begin{environments}`, beside a paginated **PDF preview** (A4, Computer Modern) with *Download PDF*.
  - Drafts save automatically in the browser; *Changes* shows a diff; *Publish* walks through sending the page to ncatlab.org.
  - *Write an article* starts a new page from a template (concept, theorem, person, blank).
- **Forum** — a custom front end for the nForum (Zulip): channels, topics, threads with LaTeX. Signing in (with an nForum
  account, directly against nforum.ncatlab.org's API) enables live reading, replies and new topics.
- **Recent changes** from the forum's edit announcements, with authors and summaries.
- **Updates sign-up** — posts to `VITE_UPDATES_ENDPOINT` (any mailing-list form endpoint); without one it is a local demo.

## How data is loaded

| What | Dev server | Static build (GitHub Pages) |
|---|---|---|
| Page sources | content mirror on GitHub (CORS) | same |
| Page index & redirects | `public/snapshot/nlab-index.json` (`scripts/mirror-index.mjs`) | same |
| Forum, recent changes | snapshot; live when signed in | snapshot (`scripts/snapshot.mjs`); live when signed in |

## Image credits

Images are from Wikimedia Commons (public domain, CC0 or CC BY); full credits are in the site footer and
`src/data/credits.json`.
