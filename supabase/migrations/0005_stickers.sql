-- MarqueeNotes — reusable sticker library per board
--
-- "Decorate" becomes "Stickers": an uploaded image is no longer glued to the
-- one spot it was dropped on — it joins the board's library, and any team
-- member can drop it onto the canvas again without re-uploading. This splits
-- what used to be one row (an image WITH a position) into two concepts:
--
--   stickers    — the reusable image itself. One row per unique upload.
--   decorations — one placement of a sticker on the canvas (position + size).
--                 Many decorations can point at the same sticker.
--
-- Apply after 0004_soft_delete.sql (paste into the SQL editor, or `supabase db push`).

/* -------------------------------- table --------------------------------- */
create table stickers (
  id         uuid primary key default gen_random_uuid(),
  board_id   uuid not null references boards(id) on delete cascade,
  src        text not null,   -- move from data URLs to a Storage path in prod
  created_at timestamptz not null default now()
);
create index on stickers (board_id);

/* ------------------------- move decorations over ------------------------- */
-- Point each placement at a sticker instead of carrying its own image.
alter table decorations add column if not exists sticker_id uuid references stickers(id) on delete cascade;

-- Backfill: any decoration from before this migration gets its own one-off
-- sticker row (1:1, no ambiguity), so no image is lost when `src` moves off
-- decorations. On a fresh project this loop touches zero rows.
do $$
declare
  rec record;
  new_sticker_id uuid;
begin
  for rec in select id, board_id, src, created_at from decorations where sticker_id is null loop
    insert into stickers (board_id, src, created_at)
    values (rec.board_id, rec.src, rec.created_at)
    returning id into new_sticker_id;
    update decorations set sticker_id = new_sticker_id where id = rec.id;
  end loop;
end $$;

alter table decorations alter column sticker_id set not null;
alter table decorations drop column src;

/* ------------------------------ enable RLS ------------------------------ */
alter table stickers enable row level security;

-- Same visibility model as decorations: any team member of the board can see,
-- add, or remove a sticker. No update policy — like tunnels, a sticker's image
-- never changes after upload, so there's nothing to update.
create policy stickers_read   on stickers for select using (public.is_team_member(public.board_team(board_id)));
create policy stickers_insert on stickers for insert with check (public.is_team_member(public.board_team(board_id)));
create policy stickers_delete on stickers for delete using (public.is_team_member(public.board_team(board_id)));

/* ------------------------------- realtime ------------------------------- */
-- So a sticker someone just uploaded shows up in a teammate's library live.
alter publication supabase_realtime add table stickers;
