# nLab redesign — prototype

A redesign prototype of the [nLab](https://ncatlab.org/nlab/show/HomePage) home page and article view,
including the [Center for Quantum and Topological Systems](https://ncatlab.org/nlab/show/Center+for+Quantum+and+Topological+Systems) section.
**Not the official nLab.** All content belongs to the nLab and its contributors.

## Run locally

```sh
npm install
npm run dev        # http://localhost:5173 — articles and latest edits load live via a dev proxy
```

## Designs

One site, three switchable designs (chooser on first visit, switcher at the bottom of every page,
shareable links via `?theme=`):

| Design | Look |
|---|---|
| `folio` | paper & ink notebook |
| `lumen` | light, airy, glassy (Apple-inspired) |
| `prism` | tonal, rounded, colourful (Material-inspired) |

## How content is loaded

ncatlab.org does not send CORS headers, so a browser cannot fetch it directly.

- **Dev server** — a Vite proxy (`/nlab-api` → ncatlab.org) serves pages live.
- **Static build / GitHub Pages** — `npm run build:pages` first runs `scripts/snapshot.mjs`, which saves every nLab page
  the site links to (plus the latest-revisions list) into `public/snapshot/`, then builds. Pages outside the snapshot
  open on ncatlab.org. The GitHub Action in `.github/workflows/pages.yml` rebuilds every 6 hours to refresh it.

## Image credits

Images are from Wikimedia Commons (public domain, CC0 or CC BY); full credits are listed in the site footer
and in `src/data/credits.json`.
