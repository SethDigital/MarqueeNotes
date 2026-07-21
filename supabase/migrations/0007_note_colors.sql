-- MarqueeNotes — per-note text color and 3-stop gradient fill
--
-- Notes can now carry their own text color (instead of always using the theme
-- token) and an optional 3-stop gradient fill. `text_color` is nullable: null
-- means "use the contrast-aware default the client computes from the fill".
-- `gradient` is a jsonb {stops:[hex,hex,hex], angle:0-360} or null for a solid.
--
-- Nullable + `if not exists`, so it's safe/idempotent on existing rows (they
-- read as text_color=null / gradient=null on the client, i.e. exactly today's
-- rendering). No RLS change — rides the existing notes policies.
--
-- Apply after 0006_note_size.sql (paste into the SQL editor, or `supabase db push`).

alter table notes add column if not exists text_color text;
alter table notes add column if not exists gradient jsonb;
