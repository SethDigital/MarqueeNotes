-- MarqueeNotes — note completion + per-step timing
--
-- Adds the two timestamps the Completed-notes viewer needs:
--   * notes.completed_at      — when a note was finished (auto when the last
--                               step is checked, or set directly by "Mark
--                               complete"). This single column is the source of
--                               truth for "is this note done?".
--   * checklist_items.done_at — when each step was checked off, so the viewer
--                               can show who finished what and when.
--
-- Both are nullable and default null (existing rows read as not-completed / not
-- individually timed). No RLS changes — these ride on the notes / checklist_items
-- policies already in 0001.
--
-- Apply after 0002_invites.sql (paste into the SQL editor, or `supabase db push`).

alter table notes           add column if not exists completed_at timestamptz;
alter table checklist_items add column if not exists done_at      timestamptz;
