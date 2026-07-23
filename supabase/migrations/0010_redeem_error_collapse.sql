-- MarqueeNotes — stop redeem_invite() confirming that a code once existed
--
-- The 2026-07 audit (finding L2) noted that redeem_invite() answered a bad
-- code with one of two distinguishable errors: "not valid" vs "has expired".
-- The second is an oracle — it confirms to a guesser that the code was real,
-- which is exactly the bit of information an invite code's unguessability is
-- supposed to protect. Invalid and expired now share one message.
--
-- "You are already a member" stays distinct: it can only fire on a valid,
-- unexpired code, and the caller it fires for already has everything the code
-- would grant — there's nothing left for the message to leak, and collapsing
-- it would just confuse a legitimate teammate double-tapping a link.
--
-- The function is otherwise byte-for-byte the one from 0002_invites.sql; see
-- that file for the full redemption-flow commentary.
--
-- Apply after 0009_security_hardening.sql (paste into the SQL editor, or
-- `supabase db push`).

create or replace function public.redeem_invite(_code text)
returns table (team_id uuid, team_name text)
language plpgsql security definer set search_path = public as $$
declare
  _invite invite_codes;
  _uid uuid := auth.uid();
begin
  if _uid is null then
    raise exception 'You must be signed in to redeem an invite';
  end if;

  -- Normalize: uppercase, drop the display dash / any stray whitespace.
  _code := upper(regexp_replace(coalesce(_code, ''), '[^A-Za-z0-9]', '', 'g'));

  select * into _invite from invite_codes where code = _code;
  -- One answer for "never existed" and "expired" — see the header.
  if _invite.id is null or _invite.expires_at <= now() then
    raise exception 'That invite code is not valid or has expired — ask for a fresh one';
  end if;
  if public.is_team_member(_invite.team_id) then
    raise exception 'You are already a member of this team';
  end if;

  insert into memberships (team_id, user_id, role)
  values (_invite.team_id, _uid, _invite.role);

  -- Bump the join counter so an admin can see how many used the code.
  update invite_codes set uses = uses + 1 where id = _invite.id;

  return query select t.id, t.name from teams t where t.id = _invite.team_id;
end; $$;
