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
| [`.env.example`](../.env.example) | The two env vars to copy into `.env` |

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

## Next step: wire the data layer

The schema is the foundation. Turning it on in the app means:

1. Add a sign-in screen (`supabase.auth`) and swap the "working as" name for `auth.uid()`.
2. Point `store.js`'s reads/writes at Supabase queries (the UI already goes
   through that one module, so this is contained).
3. Add the realtime board sync — Broadcast for live drag frames, Postgres Changes
   for persisted drops/edits — behind the `boardSync` seam from the architecture notes.

Say the word and that's the next piece to build.
