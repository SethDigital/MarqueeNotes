# Changelog

All notable changes to MarqueeNotes, newest first. Dates are commit dates.

## 2026-07-23

### Added
- Sign-up now tells you a confirmation link is on its way (email confirmation
  was enabled on the backend, which made a successful sign-up look like
  nothing happened). Errors and notices also clear when switching between the
  sign-in and sign-up forms.

### Fixed
- Invite creation broke after `0009` with "function gen_random_bytes(integer)
  does not exist" — pgcrypto lives in Supabase's `extensions` schema, and
  `create_invite()` pins `search_path = public`, so the unqualified call
  couldn't resolve. `0011_fix_invite_code_rng` schema-qualifies it.

### Operations (Supabase dashboard, not in the repo)
- Email confirmation required for new accounts
- Minimum password length raised from 6 to 12

## 2026-07-22 — Security audit & hardening

A full audit of the app (client, schema, RLS, deployment) with every actionable
finding fixed the same day.

### Fixed
- **Identity is now id-based end to end** (migration-free refactor). Every
  identity field on a note — assignee, assigned-by, done-by, yoinks, member
  pins — carries a profile UUID, resolved to a display name only at render
  time. Previously the client mapped names→ids on write, and since display
  names are neither unique nor fixed, any member could rename themselves to
  match a teammate and silently capture that person's assignments, pins, and
  yoinks. Demo mode keeps old saves working (its member ids are the names).
- Ids spliced into PostgREST filter strings are validated as UUIDs first, so a
  corrupt value can't change a filter's meaning.

### Added (migrations `0009_security_hardening`, `0010_redeem_error_collapse`)
- `profiles.email` dropped — teammates could previously read each other's
  email addresses through the profile read policy; nothing in the app used it
- CHECK constraints on sticker images (both the board library and personal
  stash): `data:image/*` only, size-capped — the client's upload limits now
  hold against direct API writes, closing a tracking-pixel / storage-bloat
  vector
- Invite codes are minted from pgcrypto's CSPRNG instead of the seeded
  `random()`
- Invite redemption answers "never existed" and "expired" with one identical
  message, so a guesser can't learn that a code was once real
- The production build ships a Content-Security-Policy `<meta>` tag, injected
  at build time with `connect-src` pinned to the exact Supabase origin (plus
  its realtime websocket), `script-src 'self'`, and `img-src 'self' data:`.
  Dev builds are unaffected.

## 2026-07-21

### Added
- **Customize panel** — override the interface's accent, controls, text,
  background, and panel colors; background/panel accept 3-stop gradients;
  save, load, and delete named presets (PR-less follow-ups fixed a blank
  screen when opening the panel)
- **Per-note text color** with a contrast-aware automatic default, and an
  optional **3-stop gradient fill** with adjustable angle per note
- **Unified layering** — notes and stickers share one z-stack with
  bring-forward / send-backward controls; stickers can be rotated (#2)
- **Personal sticker stash** — save any placed sticker to a per-account,
  cross-board collection and drop it onto any other board (#2)

### Fixed
- Note colors are sanitized on load and save, so a malformed value can no
  longer blank the whole board

## 2026-07-20

### Added
- **Board Stickers** — the old one-shot decorations became a reusable
  per-board library: upload once, place many; deleting a sticker removes every
  placement
- **Rotate & free resize** for notes (corner handles, straighten button)
- **Note color picker** with hex input alongside the six quick swatches
- **Completed archive** — deleting a note now soft-deletes it into the
  board's Completed stack with its step record intact, instead of destroying
  it
- **My Board** became one click from every screen, with per-team resizable
  sections
- "Join with a code" added to the My Dashboard tab
- Inline SVG favicon (stopped the `favicon.ico` 404)

### Fixed
- 403 when re-editing a yoinked note (tunnels upsert conflict)
- Deploy workflow bumped off the deprecated Node 20 actions runtime

### Docs
- `docs/BACKEND.md` documents the migration-before-deploy sequencing rule and
  a probe for checking live migration state

## 2026-07-18

### Added
- **Team invite codes** — admins mint a short, say-it-out-loud code
  (`ABCD-EFGH`), good for 3 hours and usable by any number of joiners;
  listing, use counts, and revocation for admins; server-side expiry and
  membership via `SECURITY DEFINER` functions (#1)
- **Yoink** — bookmark a team note onto your personal board as a live link
  (edits write through to the original) (#1)
- **Cross-team My Board** — everything you've yoinked, across all teams,
  grouped per team (#1)
- **Completed-notes viewer** — expandable per-board stack showing who
  finished which step when, and deadline slack (#1)

## 2026-07-16 — Phase 2: real backend

### Added
- **Supabase schema** — teams, memberships (admin/member roles), boards,
  notes, checklist items, tunnels, decorations; Row-Level Security policies
  enforcing per-team visibility; realtime publication
- **Swappable data layer** — the whole app talks to a `db` repository with
  interchangeable `localStorage` and Supabase implementations, selected by env
  vars at startup; auth gate (email/password) appears only when a backend is
  configured
- The live GitHub Pages build connected to the Supabase project

### Fixed
- Fast typing no longer "rubberbands" — realtime reloads are deferred while
  the user is mid-edit

## 2026-07-15 — The rewrite

### Added
- Ground-up rewrite as a local-first sticky-note board for teams (briefly
  "TeamPin", renamed **MarqueeNotes** the same day)
- Teams → projects → boards structure; sticky notes with step checklists,
  assignment, and "who handled what"; working-as identity picker
- **Free-drag canvas** (replacing the initial grid), deadlines with live
  countdown, tunneling onto a personal dashboard (Pinned / Working On /
  Completed / Distributed)
- Image/GIF decorations placed anywhere on the board
- **Themes**: Corkboard (default), Whiteboard, and Neon dark mode
- GitHub Pages deployment via GitHub Actions

## 2026-06-23 — Prehistory

- Original single-file prototype uploaded; fully replaced by the 2026-07-15
  rewrite
