# MarqueeNotes

A shared corkboard for teams. Stick up notes with step-by-step checklists, drag
them anywhere, see at a glance who's on what and what's already handled — then
make the board *yours* with stickers, themes, and custom colors. Changes sync
live to every teammate looking at the same board.

Built with React + Vite on a Supabase backend (Postgres + Row-Level Security +
Realtime), deployed to GitHub Pages. Without backend credentials it runs as a
fully-featured single-browser demo on `localStorage` — same UI, no accounts.

## Features

### Notes & boards
- **Free-drag sticky notes** — place a note anywhere on the canvas, or hit
  **Tidy up** to snap everything into neat columns
- **Rotate & resize** any note from its corner handles; a one-click
  *straighten* resets the angle
- **Layering** — notes and stickers share one stacking order, with
  bring-forward / send-backward controls on every item
- **Deadlines** with a live countdown that turns amber when close and red when
  overdue
- **Completed archive** — "deleting" a note never destroys it; it moves into
  the board's Completed stack with its full step record intact. The viewer
  shows who finished which step when, and how far ahead of (or past) the
  deadline the note landed
- **Mark complete / reopen** — end a note early with steps still open, or let
  it auto-complete when the last step is checked

### Checklists & people
- **Steps** on every note — add, check off, remove
- **Assignment** — put a teammate on any step; done steps show who handled
  them ("Avery ✓")
- **Pinning** — flag a note for the whole team or a specific member; the
  team's **Pinned** tab collects every flag, filterable by person
- **My Dashboard** (per team) — four derived columns: *Pinned*, *Working On*,
  *Completed*, and *Distributed* (steps you handed to teammates)

### Yoink & My Board
- **Yoink** a team note onto your personal board — it's a link, not a copy, so
  edits made from either side land on the same note
- **My Board** — one click from every screen: everything you've yoinked across
  *all* your teams, grouped into one mini-board section per team, each with its
  own theme and resizable height

### Stickers
- **Board sticker library** — upload an image or transparent GIF once
  (PNG/JPEG/WebP/GIF, ≤ 0.9 MB), then place it on the canvas as many times as
  you like; placements drag, resize, and rotate like notes
- **Personal stash** — save any placed sticker to your own cross-board
  collection and drop it onto any other board

### Color & themes
- **Board themes** — Corkboard (default), Whiteboard, or Neon dark mode with
  glowing notes
- **Note colors** — six quick swatches plus a full picker with hex input; an
  optional **3-stop gradient fill** with adjustable angle
- **Per-note text color**, with a contrast-aware automatic default
- **Customize panel** — override the interface's accent, controls, text,
  background, and panel colors (background/panel accept gradients), and save
  named presets

### Teams, accounts & sync
- **Real accounts** (Supabase email/password with email confirmation) and
  **roles** — the team creator is admin; everyone else joins as a member
- **Invite codes** — an admin mints a short say-it-out-loud code
  (`ABCD-EFGH`), shares it anywhere, and anyone signed in can join with it
  until it expires (3 hours). Admins see live codes, their use counts, and can
  revoke them
- **Realtime sync** — persisted changes fan out to every open board, with
  in-flight typing protected from being stomped by echoes
- **Per-team visibility, enforced in the database** — Row-Level Security means
  a team's notes, stickers, and roster are readable *only* by that team's
  members, no matter what a client sends

## Security

The codebase went through a full security audit (2026-07-22) and the fixes are
in. Highlights:

- RLS on every table, with invite redemption and team creation going through
  `SECURITY DEFINER` functions that make their own checks
- **Identity is id-based end to end** — assignments, pins, and yoinks carry
  profile UUIDs, never display names, so renaming yourself can't capture
  someone else's work (`memberName()` resolves ids at render time only)
- Teammate email addresses are not stored in the readable profile table
- Sticker images are constrained at the database (`data:image/*`, size-capped)
  *and* by the production Content-Security-Policy, so an external tracking URL
  can't fire even if one slipped in
- Invite codes come from a CSPRNG, and redemption answers "never existed" and
  "expired" identically
- The production build ships a strict CSP (`script-src 'self'`, `connect-src`
  pinned to the one Supabase origin) injected at build time

## Run locally

```bash
npm install
npm run dev      # http://localhost:5173 — demo mode (localStorage, no login)
```

To run against a real backend, copy `.env.example` to `.env` and fill in
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. The app picks the backend at
startup — no code change.

```bash
npm run build && npm run preview   # production build (includes the CSP) on :4173
```

## Backend

Everything talks to a `db` repository ([`src/db/`](src/db)) with two
interchangeable implementations: `localStorage` (demo) and Supabase. The
schema, RLS policies, and invite functions live in ordered migrations under
[`supabase/migrations/`](supabase/migrations) — applied by pasting into the
Supabase SQL editor (or `supabase db push`).

**Rule: apply new migrations to the live database before (or immediately
after) deploying code that needs them.** Details, schema diagram, and a
migration-state probe are in [`docs/BACKEND.md`](docs/BACKEND.md).

## Deploy

Pushing to `main` builds and publishes to GitHub Pages via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) (Settings →
Pages → Source must be **GitHub Actions**). The Supabase URL and publishable
anon key are set in the workflow — safe to expose; RLS is what protects the
data.

## History

See [CHANGELOG.md](CHANGELOG.md) for the full dated history.
