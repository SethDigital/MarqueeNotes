-- MarqueeNotes — Phase 2 schema (Supabase / Postgres)
--
-- Everything the demo kept in localStorage becomes rows here. Row-Level
-- Security enforces the core rule the client could never enforce: a team's
-- notes, deadlines, and decorations are visible ONLY to that team's members,
-- and only admins manage the team and its membership.
--
-- Apply this by pasting it into the Supabase SQL editor, or with the CLI:
--   supabase db push
-- It has NOT been run against a live project yet — see docs/BACKEND.md.

/* ------------------------------ extensions ------------------------------ */
create extension if not exists "pgcrypto";   -- gen_random_uuid()

/* -------------------------------- enums --------------------------------- */
create type team_role       as enum ('admin', 'member');
create type note_status     as enum ('todo', 'in_progress', 'done');
create type pin_scope       as enum ('none', 'team', 'member');
create type tunnel_category as enum ('pinned', 'working', 'completed', 'distributed');

/* ------------------------ profiles (mirror auth) ------------------------ */
-- One row per auth user; carries the display name/avatar the UI shows. The
-- old "working as" name string becomes this real identity.
create table profiles (
  id           uuid primary key references auth.users on delete cascade,
  email        text,
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now()
);

-- Auto-create a profile when someone signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

/* -------------------------------- teams --------------------------------- */
create table teams (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

/* ---------------------- memberships (roles per team) -------------------- */
-- Roles live on the join table, not the user: someone can be admin of one
-- team and a member of another. This table IS the permission model.
create table memberships (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references teams(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  role       team_role not null default 'member',
  created_at timestamptz not null default now(),
  unique (team_id, user_id)
);
create index on memberships (user_id);
create index on memberships (team_id);

-- The team creator becomes its first admin. Runs as SECURITY DEFINER so it
-- isn't blocked by the admin-only insert policy (there's no admin yet).
create or replace function public.handle_new_team()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.memberships (team_id, user_id, role)
  values (new.id, new.created_by, 'admin');
  return new;
end; $$;

create trigger on_team_created
  after insert on teams
  for each row execute function public.handle_new_team();

/* ------------------ boards (a team's shared workspace) ------------------ */
-- One per project/workspace — the public canvas a team collaborates on. The
-- current UI calls this a "project".
create table boards (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references teams(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);
create index on boards (team_id);

/* -------------------------------- notes --------------------------------- */
create table notes (
  id            uuid primary key default gen_random_uuid(),
  board_id      uuid not null references boards(id) on delete cascade,
  created_by    uuid references profiles(id),
  title         text not null default '',
  color         text not null default '#fef08a',
  rot           real not null default 0,
  x             real not null default 40,          -- free-drag position
  y             real not null default 40,
  status        note_status not null default 'todo',
  pin           pin_scope not null default 'none', -- 'team' | 'member' | 'none'
  pinned_member uuid references profiles(id),       -- set when pin = 'member'
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deadline_at   timestamptz                          -- optional; drives the countdown
);
create index on notes (board_id);

/* ---------------------------- checklist items --------------------------- */
create table checklist_items (
  id             uuid primary key default gen_random_uuid(),
  note_id        uuid not null references notes(id) on delete cascade,
  text           text not null,
  position       int  not null default 0,
  done           boolean not null default false,
  assignee_id    uuid references profiles(id),      -- who's on this step
  assigned_by_id uuid references profiles(id),      -- who handed it out → "Distributed"
  done_by_id     uuid references profiles(id),      -- who checked it off
  created_at     timestamptz not null default now()
);
create index on checklist_items (note_id);

/* ------------------- tunnels (note → personal dashboard) ---------------- */
-- A LINK from a team note onto a user's personal dashboard, never a copy.
-- Delete the tunnel and the note is untouched on the team board.
create table tunnels (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  note_id    uuid not null references notes(id) on delete cascade,
  category   tunnel_category not null default 'pinned',
  created_at timestamptz not null default now(),
  unique (user_id, note_id)
);
create index on tunnels (user_id);

/* ----------------------------- decorations ------------------------------ */
create table decorations (
  id         uuid primary key default gen_random_uuid(),
  board_id   uuid not null references boards(id) on delete cascade,
  src        text not null,   -- move from data URLs to a Storage path in prod
  x          real not null default 48,
  y          real not null default 48,
  w          real not null default 180,
  created_at timestamptz not null default now()
);
create index on decorations (board_id);

/* --------------------------- updated_at touch --------------------------- */
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger notes_touch before update on notes
  for each row execute function public.touch_updated_at();

/* ------------------------- access helper functions ---------------------- */
-- All SECURITY DEFINER so they bypass RLS on `memberships`/`boards` — without
-- that, a membership policy that queries memberships recurses infinitely.
create or replace function public.is_team_member(_team uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from memberships where team_id = _team and user_id = auth.uid()
  );
$$;

create or replace function public.is_team_admin(_team uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from memberships
    where team_id = _team and user_id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.board_team(_board uuid)
returns uuid language sql security definer stable set search_path = public as $$
  select team_id from boards where id = _board;
$$;

create or replace function public.can_access_note(_note uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from notes n join boards b on b.id = n.board_id
    where n.id = _note and public.is_team_member(b.team_id)
  );
$$;

create or replace function public.shares_team(_other uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from memberships m1
    join memberships m2 on m1.team_id = m2.team_id
    where m1.user_id = auth.uid() and m2.user_id = _other
  );
$$;

/* ------------------------------ enable RLS ------------------------------ */
alter table profiles        enable row level security;
alter table teams           enable row level security;
alter table memberships     enable row level security;
alter table boards          enable row level security;
alter table notes           enable row level security;
alter table checklist_items enable row level security;
alter table tunnels         enable row level security;
alter table decorations     enable row level security;

/* ------------------------------- policies ------------------------------- */
-- profiles: read yourself and teammates; edit only yourself.
create policy profiles_read   on profiles for select using (id = auth.uid() or public.shares_team(id));
create policy profiles_insert on profiles for insert with check (id = auth.uid());
create policy profiles_update on profiles for update using (id = auth.uid());

-- teams: members read; anyone signed in may create; admins change/remove.
create policy teams_read   on teams for select using (public.is_team_member(id));
create policy teams_create on teams for insert with check (created_by = auth.uid());
create policy teams_update on teams for update using (public.is_team_admin(id));
create policy teams_delete on teams for delete using (public.is_team_admin(id));

-- memberships: members see the roster; admins manage it; anyone may leave.
create policy memberships_read   on memberships for select using (public.is_team_member(team_id));
create policy memberships_insert on memberships for insert with check (public.is_team_admin(team_id));
create policy memberships_update on memberships for update using (public.is_team_admin(team_id));
create policy memberships_delete on memberships for delete using (public.is_team_admin(team_id) or user_id = auth.uid());

-- boards: members read/create/edit; only admins delete a whole board.
create policy boards_read   on boards for select using (public.is_team_member(team_id));
create policy boards_insert on boards for insert with check (public.is_team_member(team_id));
create policy boards_update on boards for update using (public.is_team_member(team_id));
create policy boards_delete on boards for delete using (public.is_team_admin(team_id));

-- notes: full access for members of the note's team — this one policy is the
-- "notes/deadlines only visible to their team" rule.
create policy notes_read   on notes for select using (public.is_team_member(public.board_team(board_id)));
create policy notes_insert on notes for insert with check (public.is_team_member(public.board_team(board_id)));
create policy notes_update on notes for update using (public.is_team_member(public.board_team(board_id)));
create policy notes_delete on notes for delete using (public.is_team_member(public.board_team(board_id)));

-- checklist items: gated by access to the parent note.
create policy items_read   on checklist_items for select using (public.can_access_note(note_id));
create policy items_insert on checklist_items for insert with check (public.can_access_note(note_id));
create policy items_update on checklist_items for update using (public.can_access_note(note_id));
create policy items_delete on checklist_items for delete using (public.can_access_note(note_id));

-- tunnels: a user manages only their own, and only for notes they can see.
create policy tunnels_read   on tunnels for select using (user_id = auth.uid());
create policy tunnels_insert on tunnels for insert with check (user_id = auth.uid() and public.can_access_note(note_id));
create policy tunnels_delete on tunnels for delete using (user_id = auth.uid());

-- decorations: gated by membership in the board's team.
create policy decorations_read   on decorations for select using (public.is_team_member(public.board_team(board_id)));
create policy decorations_insert on decorations for insert with check (public.is_team_member(public.board_team(board_id)));
create policy decorations_update on decorations for update using (public.is_team_member(public.board_team(board_id)));
create policy decorations_delete on decorations for delete using (public.is_team_member(public.board_team(board_id)));

/* ------------------------------- realtime ------------------------------- */
-- Persisted changes fan out over Realtime (Postgres Changes) so drops, edits,
-- and tunnels reach every open board. Ephemeral drag frames use Broadcast and
-- need no table replication.
alter publication supabase_realtime add table notes;
alter publication supabase_realtime add table checklist_items;
alter publication supabase_realtime add table decorations;
alter publication supabase_realtime add table tunnels;
