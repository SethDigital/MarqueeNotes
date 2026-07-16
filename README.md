# MarqueeNotes

A shared whiteboard for teams. Put up sticky notes with step-by-step checklists,
see at a glance who's on what and what's already handled, and decorate the board
with images and GIFs so it feels like *your* team's wall.

Built with React + Vite. **Demo build: no backend, no logins** — all data lives in
the browser's `localStorage`. This phase is for showing the concept (hosted free on
GitHub Pages) before moving to a proper backend.

## Features

| Feature | How |
|---|---|
| Teams | Independent workspaces — open one and you're in |
| Projects | Each team contains any number of project boards |
| Sticky notes | Click **New note**; notes sit in a tidy, uniform grid |
| Steps (checklists) | Each note has its own step list — add steps, check them off |
| Who's on what | Assign a teammate to any step; done steps show who handled them |
| Working as | Pick your name in the top bar; steps you check off carry it |
| Pinning | Pin a note for the whole team or a specific member |
| Pinned tab | Team-wide view of every pinned note, filterable by member |
| Decorations | Upload images or transparent GIFs and place them anywhere on the board |
| Themes | Corkboard (default), Whiteboard, or Neon dark mode with glowing notes — pick in the top bar |
| Demo data | "Load demo data" on first launch to look around |

## Run locally

```bash
npm install
npm run dev      # http://localhost:5173
```

## Deploy to GitHub Pages

A workflow at `.github/workflows/deploy.yml` builds and publishes automatically.
One-time setup:

1. On GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
   (This must be "GitHub Actions", *not* "Deploy from a branch" — branch mode serves
   the raw source, which cannot run in a browser, and you'll get a blank page.)
2. Push to `main` (or run the workflow manually). The site appears at
   `https://<user>.github.io/<repo>/`.

## Current limitations (by design, for the demo)

- **No shared data.** `localStorage` is per-browser — each viewer gets their own copy
  of the boards. Real team sync requires the backend phase.
- **No accounts.** "Working as" is a name you pick, not a login.
- **Decorations are stored inline** (data URLs, ≤0.9 MB each) to stay inside
  `localStorage` quota; the backend phase moves them to real file storage.
- All persistence goes through [`src/store.js`](src/store.js), so swapping in a real
  API later means changing only that file.
