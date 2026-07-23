-- MarqueeNotes — fix "function gen_random_bytes(integer) does not exist"
--
-- 0009 rewrote gen_invite_code() to draw from pgcrypto's gen_random_bytes(),
-- and broke invite creation in the process. The trap: gen_random_uuid() is a
-- Postgres BUILT-IN (pg_catalog), but gen_random_bytes() genuinely lives in
-- pgcrypto — and on Supabase, extensions install into the `extensions`
-- schema, not `public`. create_invite() pins `search_path = public` (that
-- pinning is a security feature; keep it), so when it calls gen_invite_code()
-- the unqualified gen_random_bytes() has nowhere to resolve.
--
-- Fix: schema-qualify the call. Same alphabet, same 8-char shape, same
-- crypto-grade source — only the resolution changes.
--
-- Apply after 0010_redeem_error_collapse.sql (paste into the SQL editor, or
-- `supabase db push`). Verify by minting an invite code from the Members tab.

create or replace function public.gen_invite_code()
returns text language sql volatile as $$
  select string_agg(
    substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789',
           1 + (get_byte(extensions.gen_random_bytes(1), 0) % 31), 1),
    '')
  from generate_series(1, 8);
$$;
