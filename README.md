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
- **Search** (`/search?q=…`) — full-text over titles, alternative names and summaries, with kinds, fields, sorting and a library-catalogue query language (`"phrase"`, `OR`, `NOT`/`-word`, `( )`, `homot*`, `title:`, `summary:`, `kind:`); instant suggestions in every search box; A–Z index of all pages.
- **Editing and writing** — full-screen workspace with two ways to write:
  - *Visual*: type into the page as normal text; `$x$` becomes a formula, `[[page]]` a link, `## ` a section;
    theorems, equations and tables are cards edited as LaTeX in place.
  - *LaTeX*: CodeMirror with highlighting, line numbers and autocomplete for `\commands` (with symbol previews),
    `[[page links]]` and `\begin{environments}`, beside a paginated **PDF preview** (A4, Computer Modern) with *Download PDF*.
  - Drafts save automatically in the browser; *Changes* shows a diff; *Publish* walks through sending the page to ncatlab.org.
  - *Write* (`/write`) starts a new page from a template (concept, theorem, person, blank); scratch pages are in the Library's *Sandbox* section.
- **Forum** — a custom front end for the nForum (Zulip): channels, topics, threads with LaTeX. Signing in (with an nForum
  account, directly against nforum.ncatlab.org's API) enables live reading, replies and new topics.
- **Recent changes** from the forum's edit announcements, with authors and summaries.
- **Updates sign-up** — posts to `VITE_UPDATES_ENDPOINT` (any mailing-list form endpoint); without one it is a local demo.

- **Library** (`/library`) — every page filterable by kind (concepts, theorems, people, references), field and subject, sorted by how often pages are linked; authors placed in fields by the pages that cite them.
- **CQTS** (`/cqts/…`) — home page with the center's logo and an animated braid, and one page per section (research, people, Symposium 2026, materials, activities, colloquium, events, get involved, archive). **Materials** collects 200+ talks with slides, videos and papers from the center's nLab record.
- **Reading** — light/dark mode (remembers your choice, follows the system), and *ADHD reading* on articles (Lexend, wider spacing, bold word beginnings), with a short introduction on first use.
- **Diagrams** — the nLab's TikZ diagrams are pre-rendered at build time (`scripts/tikz-snapshot.mjs`).

## URLs and SEO

Clean URLs: `/wiki/Hopf+fibration/`, `/library/`, `/forum/`, `/cqts/people/`, `/search?q=…`, `/recent`, `/write`.
`scripts/seo.mjs` (run by `npm run build`) writes real pages with titles, descriptions, link-preview images and
structured data for the 3 000 most-linked articles and every CQTS page, plus `sitemap.xml`; every other address is
served by the app from `404.html`. Old `page.html?p=…` links redirect.

## How data is loaded

| What | Dev server | Static build (GitHub Pages) |
|---|---|---|
| Page sources | content mirror on GitHub (CORS) | same |
| Page index & redirects | `public/snapshot/nlab-index.json` (`scripts/mirror-index.mjs`) | same |
| Forum, recent changes | snapshot; live when signed in | snapshot (`scripts/snapshot.mjs`); live when signed in |

## Image credits

Images are from Wikimedia Commons (public domain, CC0 or CC BY); full credits are in the site footer and
`src/data/credits.json`.

## Database (accounts, synced drafts, updates list)

Accounts and data live in [Supabase](https://supabase.com). `.env` holds the project URL and the
**publishable** key (public by design); what anyone can read or write is set by the row-level security rules
in `supabase/schema.sql`. Never put the secret key in this repository.

- Set up once: Supabase dashboard → SQL Editor → paste `supabase/schema.sql` → Run.
- Sign-in links: Authentication → URL Configuration → Site URL `https://sviatoslavgladyshev.github.io/nlab-redesign/`,
  and add `http://localhost:5173/**` to the redirect URLs for local development.
- Drafts are kept in the browser and, when signed in, in the `drafts` table (merged on sign-in, newest wins).
- Account → My profile opens the private profile and settings pages. The `profiles` table stores profile details and preferences. To enable profiles on an existing project, rerun `supabase/schema.sql`, then `supabase/content.sql` to use the profile display name for future contributions.
- Profile settings → Delete account uses the `delete_my_account` function in `supabase/schema.sql`. Account deletion removes the profile and synced drafts and keeps published contributions.
- "Stay in the loop" sign-ups go to the `subscribers` table (Table Editor → export as CSV).
- Without `.env`, everything still works and stays in the browser.

## Content database and backend

The nLab's pages live in the site's database too (`supabase/content.sql`): sources, kinds, summaries, fields,
link counts, outgoing links and alternative names. The **backend** is a set of Postgres functions the site calls
through Supabase, plus one Edge Function:

| Function | What it does |
|---|---|
| `get_page(name)` | a page by name or alternative name |
| `search_pages(q, …)` | full-text search over every page's text (words, `"phrases"`, `OR`, `-word`) |
| `hybrid_search(q, embedding, …)` | **smart search (RAG retrieval)**: meaning (pgvector embeddings) + words, fused by rank |
| `related_pages(name)` | the pages closest in meaning |
| `backlinks(name)`, `similar_pages(name)`, `pages_exist(names)`, `page_history(name)` | links in, “did you mean”, missing links, history |
| `save_page(…)`, `suggest_edit(…)` | publish (new pages, sandboxes, pages started here) or suggest an edit; signed-in users only |
| `functions/search` (Edge Function) | embeds the question with gte-small (built into Supabase) and calls `hybrid_search` |

Pages load from the database first and fall back to the GitHub mirror, so the site works before (and without) it.

Set up once:

1. SQL Editor: run `supabase/schema.sql`, then `supabase/content.sql`, then `supabase/rag.sql`.
2. Put the project's **secret** key in `.env.local` (git-ignored): `SUPABASE_SECRET_KEY=sb_secret_…`
3. `npm run db:import` (all pages, ≈ 1 min) and `npm run db:embed` (embeddings on this computer, ≈ 15 min).
4. Edge Functions → Deploy a new function → Via editor → name `search`, paste `supabase/functions/search/index.ts`,
   deploy, and turn off “Verify JWT” for it (or `npx supabase functions deploy search --no-verify-jwt`).

Re-run step 3 to pick up new nLab pages; pages edited on the site are never overwritten.

## Code layout

```
index.html, wiki/, library/, forum/, cqts/   HTML entry points (one per section)
src/
  core/          data and logic, no UI
    nlab.js            the content mirror: page index, sources, names, URLs
    markup.js          nLab source → HTML (Markdown, itex/KaTeX, includes, theorems, TikZ)
    search-engine.js   search index, query language and ranking
    forum-data.js      forum snapshot and live nForum (Zulip) API
    db.js              the site's database (Supabase): accounts, drafts, updates list, content, smart search
    drafts.js          drafts in the browser, synced to your account
    hash.js
  ui/            shared interface
    app.js             site shell: icons, nav, dark mode, mobile menu, sign-up (every page imports it)
    account.js, suggest.js (search suggestions), preview.js (page-preview cards), codemirror.js
  styles/        base.css (layout, typography), theme.css (colours, dark mode, ADHD reading, mobile, scroll animations)
  pages/         one folder per section: its entry script and its own CSS
    home/              index.js, home.css, knowledge-graph.js (the 3D hero)
    wiki/              index.js (router) → article.js, render.js, reading.js, search.js, recent.js,
                       all-pages.js, write.js, templates.js, shell.js (shared helpers), article.css
    editor/            editor.js (workspace), visual.js (visual mode), editor.css — loaded only when editing
    library/, forum/, cqts/
  data/          credits.json (image credits)
scripts/         build-time generators (run by npm scripts)
  mirror-index.mjs     page index, library, knowledge graph and search index from the content mirror
  tikz-snapshot.mjs    pre-renders TikZ diagrams
  cqts-materials.mjs   CQTS talks, slides and videos
  snapshot.mjs         forum snapshot
  seo.mjs              static article/CQTS pages, sitemap, 404 page (after vite build)
  article-meta.mjs     per-article title/summary/image (shared by seo.mjs, og-articles.mjs and the dev server)
  db-import.mjs        loads every nLab page into the database
  db-embed.mjs         computes page embeddings (gte-small) for smart search
  og-articles.mjs      link-preview images for the most-linked articles (needs Chrome; `npm run og`)
supabase/        schema.sql (accounts, drafts, updates), content.sql (pages + backend functions),
                 rag.sql (embeddings, smart search), functions/search (Edge Function), email/ (templates)
public/          static files: images, brand, og/ previews, snapshot/ (generated, not committed)
```
