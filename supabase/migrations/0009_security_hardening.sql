-- MarqueeNotes — security hardening (from the 2026-07 audit)
--
-- Three independent fixes land together because they're all small and none
-- changes app behavior:
--
--   1. Stop storing teammate emails. profiles.email was readable by every
--      teammate via the profiles_read policy (shares_team), so anyone joining
--      through a shareable invite code could harvest the whole roster's
--      addresses. Nothing in the client ever reads it — the canonical copy
--      lives in auth.users — so the column simply goes away. The signup
--      trigger still uses new.email to derive a default display name; it just
--      no longer copies the address into public.profiles.
--
--   2. Constrain sticker images at the database. The client enforces "image
--      data URL, ≤ ~0.9 MB" (store.js MAX_STICKER_BYTES), but the tables took
--      any text of any size from a team member hitting the API directly — an
--      external https:// src becomes a tracking pixel that leaks teammates'
--      IPs the moment Realtime fans it out, and oversized rows bloat storage.
--      A CHECK constraint makes the client's rule real: data:image/* only,
--      capped at 1.3 M chars (900 KB of file inflates to ~1.23 M chars of
--      base64 — the cap leaves headroom, and anything bigger was never
--      writable from the UI). Applies to both the board library and the
--      personal stash.
--
--   3. Mint invite codes from a crypto-grade source. gen_invite_code() drew
--      from random(), which is a seeded PRNG, not a CSPRNG. The 31^8 keyspace
--      and 3-hour expiry already made guessing impractical; drawing each char
--      from pgcrypto's gen_random_bytes() removes the predictability caveat
--      too. (256 % 31 = 8, so 8 of the 31 chars are drawn with probability
--      9/256 instead of 8/256 — a bias far too small to matter at this
--      keyspace.) Same alphabet, same 8-char shape: existing codes, the
--      ABCD-EFGH display grouping, and redeem_invite() all work unchanged.
--
-- Idempotent: the function replacements are CREATE OR REPLACE, the column drop
-- is IF EXISTS, and each constraint is dropped before it's re-added. If a
-- constraint ADD fails, a row written around the client's limits already
-- exists — find it with, e.g.:
--   select id, left(src, 40), length(src) from stickers
--   where src not like 'data:image/%' or length(src) > 1300000;
-- delete (or shrink) the offender and re-run. Do NOT loosen the constraint to
-- fit it; a non-image src is exactly what this migration exists to reject.
--
-- Apply after 0008_sticker_layer_stash.sql (paste into the SQL editor, or
-- `supabase db push`).

/* ------------------- 1. drop teammate-readable emails ------------------- */
-- Replace the trigger first so a signup mid-migration can't reference the
-- dropped column (new.email still feeds the display-name fallback — it comes
-- from auth.users, not from the column being removed).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end; $$;

alter table profiles drop column if exists email;

/* ----------------- 2. sticker src shape + size constraints --------------- */
alter table stickers drop constraint if exists stickers_src_shape;
alter table stickers add constraint stickers_src_shape
  check (src like 'data:image/%' and length(src) <= 1300000);

alter table user_stickers drop constraint if exists user_stickers_src_shape;
alter table user_stickers add constraint user_stickers_src_shape
  check (src like 'data:image/%' and length(src) <= 1300000);

/* ------------------ 3. crypto-grade invite code source ------------------ */
-- Same contract as 0002: 8 chars from the ambiguity-free alphabet (no 0/O,
-- 1/I/L). Only the randomness source changes. pgcrypto is already enabled
-- (0001 uses it for gen_random_uuid()).
create or replace function public.gen_invite_code()
returns text language sql volatile as $$
  select string_agg(
    substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789',
           1 + (get_byte(gen_random_bytes(1), 0) % 31), 1),
    '')
  from generate_series(1, 8);
$$;
