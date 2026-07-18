-- MarqueeNotes — invite codes (time-limited, shareable team invites)
--
-- A team admin generates ONE code and drops it wherever the team already talks
-- — chat, email, a sticky note. Anyone signed in can redeem it to join, and it
-- keeps working for EVERYONE until it expires (3 hours after it's made). That's
-- the collaborative default: one code, many joiners, no per-person busywork.
--
-- Two things the client can't enforce on its own live here instead:
--   1. Expiry — a code past its window can't be redeemed, full stop.
--   2. Joining bypasses the admin-only membership policy — the person redeeming
--      isn't a member yet, so a member-scoped RLS policy would hide the invite
--      row and block the membership insert. redeem_invite() runs as SECURITY
--      DEFINER to look up the code and add the membership in one transaction.
--
-- Users can hold memberships in many teams, so redeeming just adds one more.
--
-- Apply after 0001_init.sql (paste into the SQL editor, or `supabase db push`).

/* -------------------------------- table --------------------------------- */
create table invite_codes (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references teams(id) on delete cascade,
  code        text not null unique,
  role        team_role not null default 'member',  -- role each joiner receives
  created_by  uuid not null references profiles(id),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,                  -- set 3h out by create_invite()
  uses        int not null default 0                 -- how many people have joined with it
);
create index on invite_codes (team_id);

/* --------------------------- code generation ---------------------------- */
-- A short, say-it-out-loud code: 8 chars from an alphabet with the ambiguous
-- ones (0/O, 1/I/L) removed. The UI shows it grouped as ABCD-EFGH; the dash is
-- cosmetic and redeem_invite() strips it back out.
create or replace function public.gen_invite_code()
returns text language sql volatile as $$
  select string_agg(
    substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789',
           1 + floor(random() * 31)::int, 1),
    '')
  from generate_series(1, 8);
$$;

/* ---------------------------- create an invite -------------------------- */
-- Admin-only. Mints a unique code that's good for 3 hours and returns the new
-- row. SECURITY DEFINER so it can insert past the RLS below; admin check is
-- explicit. Change the interval here to change how long codes last.
create or replace function public.create_invite(_team_id uuid, _role team_role default 'member')
returns invite_codes
language plpgsql security definer set search_path = public as $$
declare
  _row invite_codes;
begin
  if not public.is_team_admin(_team_id) then
    raise exception 'Only team admins can create invites';
  end if;

  -- Retry on the (astronomically unlikely) code collision.
  loop
    begin
      insert into invite_codes (team_id, code, role, created_by, expires_at)
      values (_team_id, public.gen_invite_code(), _role, auth.uid(), now() + interval '3 hours')
      returning * into _row;
      return _row;
    exception when unique_violation then
      -- generated the same code twice; loop and try another
    end;
  end loop;
end; $$;

/* ---------------------------- redeem an invite -------------------------- */
-- Anyone signed in, as many different people as want to, until the code
-- expires. Validates, then joins the caller to the team. Returns the team so
-- the client can jump straight to it.
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
  if _invite.id is null then
    raise exception 'That invite code is not valid';
  end if;
  if _invite.expires_at <= now() then
    raise exception 'That invite code has expired — ask for a fresh one';
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

/* ------------------------------ enable RLS ------------------------------ */
alter table invite_codes enable row level security;

-- Admins of the team manage its invites: list the live ones, revoke them.
-- There is deliberately NO insert or select policy for the person redeeming —
-- redemption goes exclusively through redeem_invite() above, which is why a
-- brand-new joiner (not yet a member) can still use a code.
create policy invites_read   on invite_codes for select using (public.is_team_admin(team_id));
create policy invites_delete on invite_codes for delete using (public.is_team_admin(team_id));

/* ------------------------------- realtime ------------------------------- */
-- Add memberships to the realtime feed so a redeem makes each new teammate show
-- up on everyone's roster live (RLS still scopes rows to each team's members).
alter publication supabase_realtime add table memberships;
