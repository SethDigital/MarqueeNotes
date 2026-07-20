-- MarqueeNotes — soft-delete notes into the Completed archive
--
-- "Deleting" a note no longer removes the row. Instead the client stamps
-- notes.completed_at (so it lands in the board's Completed stack, its
-- checklist_items — and thus the record of which steps were done — kept intact)
-- and notes.deleted_at (so it drops off the board and every active view). This
-- adds the one column that state needs.
--
-- Nullable + `if not exists`, so it's safe/idempotent on existing rows (they
-- read as not-deleted). No RLS change — it rides the existing notes policies,
-- and a soft delete is an UPDATE (which team members are already allowed).
--
-- Apply after 0003_completion.sql (paste into the SQL editor, or `supabase db push`).

alter table notes add column if not exists deleted_at timestamptz;
