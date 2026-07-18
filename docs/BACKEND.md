# Phase 2 — Supabase backend

This is the scaffold for moving MarqueeNotes off the per-browser localStorage
demo and onto a real backend, so that team boards are **shared**, roles are
**enforced**, and a team's notes are **visible only to its members**.

The app still runs today with no backend. Nothing here is wired into the UI
yet — this sets up the database so the data-layer swap is the next, isolated
step.

## What's in the box

| File | Purpose |
|---|---|
| [`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql) | The full schema: tables, enums, Row-Level Security policies, triggers, and Realtime setup |
| [`src/supabase.js`](../src/supabase.js) | Browser client, configured from env vars; exports `null` until you set them |
| [`src/db/`](../src/db) | The repository the whole app talks to: `local.js` (localStorage), `supabase.js` (backend), `index.js` (picks one) |
| [`src/AuthGate.jsx`](../src/AuthGate.jsx) | Email sign-in shown when a backend is configured; pass-through in demo mode |
| [`.env.example`](../.env.example) | The two env vars to copy into `.env` |

## Wiring status

The data layer **is now wired**. Every mutation in the app goes through the
`db` repository in [`src/db/`](../src/db), which has two interchangeable
implementations behind one interface:

- **localStorage** (`local.js`) — the default, and the one the browser tests
  cover. Verified end-to-end.
- **Supabase** (`supabase.js`) — activates automatically once the env vars are
  set. It maps the UI's nested tree to/from the normalized tables and subscribes
  to Realtime. **Written against the schema and reviewed, but not yet run against
  a live project** — expect to shake out query/column details on the first real
  connection.

Flipping between them is nothing more than setting (or unsetting) the two env
vars — no code change.

## Schema at a glance

```
auth.users ──1:1── profiles
profiles ──< memberships >── teams          (membership.role = admin | member)
teams ──< boards ──< notes ──< checklist_items
notes ──< tunnels >── profiles              (a note pinned onto a user's dashboard)
boards ──< decorations
```

- **Roles live on `memberships`**, per team — admin of one team, member of another.
- **`checklist_items.assigned_by_id`** is what makes the dashboard's "Distributed"
  column possible (who handed a step to someone else).
- **Tunnels are links, not copies** — deleting one leaves the note on the team board.
- **The visibility rule is one RLS policy**: you can `select` a note only if you
  hold a membership in that note's team. Deadlines ride along on the note row, so
  "timers only visible to the team" is enforced by the same policy.

## Setup

1. **Create a project** at [supabase.com](https://supabase.com) (free tier is fine).
2. **Apply the schema** — either paste `supabase/migrations/0001_init.sql` into the
   dashboard's **SQL Editor** and run it, or with the CLI:
   ```bash
   supabase link --project-ref <your-ref>
   supabase db push
   ```
3. **Enable auth** — **Authentication → Providers → Email**. (Magic-link or
   password; either replaces the demo's "working as" name with a real identity.)
4. **Set env vars** — copy `.env.example` to `.env` and fill in from
   **Project Settings → API**:
   ```
   VITE_SUPABASE_URL=https://<ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon public key>
   ```
5. **Install the client** (already in `package.json`):
   ```bash
   npm install
   ```

Because the SPA talks to Supabase's hosted API, the app can stay on the same free
GitHub Pages hosting — set the two env vars as repo Actions secrets and reference
them in the build step when you're ready to ship the connected build.

> These SQL files have been reviewed but **not executed against a live Supabase
> project** — creating and running against a project needs your account. Run step 2
> in a throwaway project first to confirm before pointing production at it.

## Seeding a demo (optional)

Seeds need a real user to own the rows, so sign up once, grab your UID from
**Authentication → Users**, then run something like:

```sql
-- replace with your auth user id
with me as (select '00000000-0000-0000-0000-000000000000'::uuid as uid),
     t  as (insert into teams (name, created_by) select 'Design Team', uid from me returning id),
     b  as (insert into boards (team_id, name) select t.id, 'Website Refresh' from t returning id)
insert into notes (board_id, created_by, title, color, x, y, deadline_at)
select b.id, me.uid, 'Homepage hero', '#fef08a', 40, 40, now() + interval '3 days'
from b, me;
```

The team-creator trigger makes you an admin automatically.

## Next step: verify against a live project

The wiring is in place; what remains needs a real Supabase instance:

1. Create a project and apply the migration (steps above).
2. Set the env vars, run `npm run dev`, sign up — you should land on an empty
   Teams screen backed by real tables.
3. Exercise create-team / project / note / drag / check / tunnel and watch the
   rows in the Supabase dashboard. Fix any column/query mismatches in
   `src/db/supabase.js` (this is the shake-out the code hasn't had yet).
4. Known simplifications to revisit: assignee/tunnel fields still round-trip via
   member **display names** (should move to profile ids). "Working On" drag
   sync is per-drop over Realtime; add Broadcast for smooth live frames later.

## Joining a team: invite codes

Adding a member isn't a name string here — people join through shareable invite
codes ([`supabase/migrations/0002_invites.sql`](../supabase/migrations/0002_invites.sql)):

- A team **admin** generates a code (Members tab → *Invite codes*). It's minted
  server-side by `create_invite()`, which enforces the admin check and stamps
  the code to expire **3 hours** out.
- Anyone signed in redeems it (home screen → *Join with a code*).
  `redeem_invite()` runs as `SECURITY DEFINER` so a not-yet-member can use it,
  checks the code hasn't expired, and inserts the membership.
- **Multi-use, time-limited**: one code lets the whole team join — drop it in
  chat and everyone uses the same code until it lapses. A `uses` counter tracks
  how many joined. Expiry is a server invariant, not a UI check. Users can hold
  memberships in many teams, so redeeming just adds another.
- To change the window, edit the `interval '3 hours'` in `create_invite()` and
  the matching `INVITE_TTL_MS` in [`src/store.js`](../src/store.js).

Apply `0002_invites.sql` after `0001_init.sql`. The whole flow is exercised
end-to-end on the localStorage backend (which mirrors it in a single browser);
the Supabase RPCs are written against the schema — give them a first live run
before relying on them, same as the rest of `src/db/supabase.js`.

## Yoink & My Board

A note can be **yoinked** (the feature formerly called "tunneling") onto your
personal **My Board** — a cross-team surface, reached from Home, that gathers
everything you've yoinked into one themeable section per team. A yoink is a
**link, not a copy**: editing a note on My Board writes straight back to the
original team-board note (`src/PersonalBoard.jsx` → `patchNote` → `db.updateNote`).
The underlying storage is unchanged — still the `tunnels` join table (`user_id`,
`note_id`) — so no migration is needed for this; it's a UI + selector layer
(`selectMyBoard` in `src/store.js`).

## Completion & the Completed viewer

Each board has a **Completed** stack listing finished notes newest-first, with
per-step who/when and how much deadline time was left. This needs two timestamps
([`supabase/migrations/0003_completion.sql`](../supabase/migrations/0003_completion.sql)):

- `notes.completed_at` — the single source of truth for "is this note done?".
  Set automatically when the last step is checked, or directly via **Mark
  complete** (which can end a note early with steps still open); unchecking a
  step reopens it.
- `checklist_items.done_at` — when each step was checked, for the "who finished
  what, when" detail.

Apply `0003_completion.sql` after `0002_invites.sql`. Both columns are nullable,
so existing rows read as not-completed. All of Yoink / My Board / completion is
exercised end-to-end on the localStorage backend; the Supabase mappings in
`src/db/supabase.js` are written against the schema — give them a first live run,
same caveat as the rest.

Say the word once you have a project and I'll help work through the first
real connection.
