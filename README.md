# TeamPin

A sticky-note pin board for teams. Create a team, add project boards inside it, and pin
sticky notes with checklists. Notes can be pinned for the whole team or assigned to a
specific member, and every pinned note rolls up into the team's **Pinned** tab.

Built with React + Vite. **Demo build: no backend, no logins** — boards are gated by a
shared team password and all data lives in the browser's `localStorage`. This is meant
for showing the concept (e.g. hosted free on GitHub Pages) before moving to a proper
backend.

## Features

| Feature | How |
|---|---|
| Teams | Independent workspaces, each with its own password |
| Projects | Each team contains any number of project boards |
| Sticky notes | Click **New note** on a board; drag notes anywhere |
| Checklists | Each note has its own list — add items, check them off |
| Pinning | Pin a note for the whole team or a specific member |
| Pinned tab | Team-wide view of all pinned notes, filterable by member |
| Colors | Six sticky-note colors per note |
| Demo data | "Load demo data" on first launch (demo team password: `demo`) |

## Run locally

```bash
npm install
npm run dev      # http://localhost:5173
```

## Deploy to GitHub Pages

A workflow at `.github/workflows/deploy.yml` builds and publishes automatically.
One-time setup:

1. Push this repo to GitHub.
2. On GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Push to `main` (or run the workflow manually). The site appears at
   `https://<user>.github.io/<repo>/`.

## Current limitations (by design, for the demo)

- **No shared data.** `localStorage` is per-browser — each viewer gets their own copy
  of the boards. Real team sync requires the backend phase.
- **Passwords are client-side only.** They gate the UI, not the data; don't treat them
  as security.
- All persistence goes through [`src/store.js`](src/store.js), so swapping in a real
  API later means changing only that file.
