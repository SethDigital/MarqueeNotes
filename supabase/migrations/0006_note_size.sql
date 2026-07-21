-- MarqueeNotes — resizable notes
--
-- Notes can now be resized (and rotated, but `rot` already existed). Width and
-- height need to persist so a resize sticks for the whole team. `h` is nullable:
-- null means "auto height, grows with content" — the default until someone drags
-- the resize handle.
--
-- Nullable + `if not exists`, so it's safe/idempotent on existing rows (they
-- read as w=240 / auto-height on the client). No RLS change — rides the existing
-- notes policies.
--
-- Apply after 0005_stickers.sql (paste into the SQL editor, or `supabase db push`).

alter table notes add column if not exists w real not null default 240;
alter table notes add column if not exists h real;
