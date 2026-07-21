-- MarqueeNotes — sticker rotation + unified layering + personal sticker stash
--
-- Three things land together because they all touch the decorations/notes
-- columns:
--
--   1. Decorations can now be ROTATED like notes — add `rot` (degrees).
--   2. Notes AND decorations share one stacking order — add `z` to both and
--      backfill it per board so live boards keep their exact current look
--      (decorations used to sit beneath notes via CSS; the backfill reproduces
--      that ordering so nothing visibly jumps when this ships).
--   3. A personal, per-account sticker library ("stash") saved from any board
--      and reusable on any other. New `user_stickers` table scoped by auth.uid.
--
-- Apply after 0007_note_colors.sql (paste into the SQL editor, or
-- `supabase db push`). Safe/idempotent: every add uses `if not exists`, and the
-- backfill only touches rows where z is still null.

/* ----------------------- rotation + stacking order --------------------- */
alter table decorations add column if not exists rot real not null default 0;
alter table decorations add column if not exists z   integer not null default 0;
alter table notes add column if not exists           z   integer not null default 0;

-- Backfill z per board: decorations first (they used to render beneath notes),
-- then notes. Order within each group is created_at so the result is stable.
-- Runs once on existing rows; the `WHERE z = 0` guard means re-runs are a no-op.
--
-- NOTE: the counter is named `seq`, not `z` — in PL/pgSQL a block-local
-- variable of the same name as a column shadows it, making `WHERE z = 0`
-- and `SET z = z` ambiguous (or a self-assign no-op). A distinct name keeps
-- the column reference unambiguous.
do $$
declare
  b record;
  seq integer;
  d record;
  n record;
begin
  for b in select id from boards loop
    seq := 0;
    for d in
      select id from decorations where board_id = b.id and z = 0 order by created_at
    loop
      update decorations set z = seq where id = d.id;
      seq := seq + 1;
    end loop;
    for n in
      select id from notes where board_id = b.id and z = 0 order by created_at
    loop
      update notes set z = seq where id = n.id;
      seq := seq + 1;
    end loop;
  end loop;
end $$;

/* --------------------------- personal sticker stash --------------------- */
-- Saved-by-the-user images, decoupled from any team. One row per (user, src);
-- the unique index makes a re-save a no-op (the client upserts with
-- onConflict ignoreDuplicates).
create table if not exists user_stickers (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  src        text not null,
  created_at timestamptz not null default now()
);
create index if not exists user_stickers_user_idx on user_stickers (user_id);
create unique index if not exists user_stickers_user_src_uniq on user_stickers (user_id, src);

alter table user_stickers enable row level security;

-- A user only ever sees, saves, or removes their own stash. No team scoping.
create policy user_stickers_read   on user_stickers for select using (auth.uid() = user_id);
create policy user_stickers_insert on user_stickers for insert with check (auth.uid() = user_id);
create policy user_stickers_delete on user_stickers for delete using (auth.uid() = user_id);

/* ------------------------------- realtime ------------------------------- */
-- So a sticker saved on one device shows up in the Stickers modal on another.
alter publication supabase_realtime add table user_stickers;
