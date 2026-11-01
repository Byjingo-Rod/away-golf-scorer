-- Away Golf Scorer 15.90 — single-event Guest Organiser access
-- Run once in the Supabase SQL Editor before testing Guest Organiser invitations.

create extension if not exists pgcrypto;

alter table public.away_event_organisers
  add column if not exists access_type text not null default 'tablet',
  add column if not exists revoked_at timestamptz,
  add column if not exists invited_email text;

do $$
begin
  alter table public.away_event_organisers
    add constraint away_event_organisers_access_type_check
    check (access_type in ('tablet', 'guest'));
exception when duplicate_object then null;
end $$;

create table if not exists public.away_event_guest_keys (
  event_id uuid primary key references public.away_events(id) on delete cascade,
  access_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days')
);

alter table public.away_event_guest_keys enable row level security;
revoke all on public.away_event_guest_keys from public, anon, authenticated;

create or replace function public.is_away_event_organiser(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.away_events e
    where e.id = p_event_id and e.organiser_id = auth.uid()
  ) or exists (
    select 1 from public.away_event_organisers eo
    where eo.event_id = p_event_id
      and eo.user_id = auth.uid()
      and eo.revoked_at is null
  );
$$;

create or replace function public.create_away_organiser_key(p_event_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if not exists (
    select 1 from public.away_events e
    where e.id = p_event_id and e.organiser_id = auth.uid()
  ) and not exists (
    select 1 from public.away_event_organisers eo
    where eo.event_id = p_event_id and eo.user_id = auth.uid()
      and eo.access_type = 'tablet' and eo.revoked_at is null
  ) then
    raise exception 'Owner or organiser-tablet access is required';
  end if;
  v_code := upper(substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 8));
  insert into public.away_event_organiser_keys(event_id, access_hash, updated_at)
  values (p_event_id, extensions.crypt(v_code, extensions.gen_salt('bf')), now())
  on conflict (event_id) do update
    set access_hash = excluded.access_hash, updated_at = now();
  return v_code;
end;
$$;

create or replace function public.create_away_guest_organiser_key(p_event_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if not exists (
    select 1 from public.away_events e
    where e.id = p_event_id and e.organiser_id = auth.uid()
  ) then
    raise exception 'Only the Owner Organiser can delegate an event';
  end if;

  -- One delegated planner at a time. Creating a replacement invitation
  -- immediately retires any earlier Guest Organiser for this event.
  update public.away_event_organisers
  set revoked_at = coalesce(revoked_at, now())
  where event_id = p_event_id and access_type = 'guest';

  v_code := upper(substr(encode(extensions.gen_random_bytes(10), 'hex'), 1, 10));
  insert into public.away_event_guest_keys(event_id, access_hash, created_at, expires_at)
  values (p_event_id, extensions.crypt(v_code, extensions.gen_salt('bf')), now(), now() + interval '14 days')
  on conflict (event_id) do update set
    access_hash = excluded.access_hash,
    created_at = now(),
    expires_at = now() + interval '14 days';
  return v_code;
end;
$$;

create or replace function public.claim_away_guest_organiser_access(
  p_join_code text,
  p_access_code text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_hash text;
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;

  -- A network interruption after a successful claim must not strand the
  -- guest merely because the one-use invitation key has already been removed.
  select e.id into v_event_id
  from public.away_events e
  join public.away_event_organisers eo on eo.event_id = e.id
  where e.join_code = upper(trim(p_join_code))
    and eo.user_id = auth.uid()
    and eo.access_type = 'guest'
    and eo.revoked_at is null
    and e.status not in ('complete', 'archived')
  limit 1;
  if v_event_id is not null then return v_event_id; end if;

  select e.id, k.access_hash into v_event_id, v_hash
  from public.away_events e
  join public.away_event_guest_keys k on k.event_id = e.id
  where e.join_code = upper(trim(p_join_code))
    and e.status not in ('complete', 'archived')
    and k.expires_at > now()
  order by e.updated_at desc
  limit 1;

  if v_event_id is null or extensions.crypt(upper(trim(p_access_code)), v_hash) <> v_hash then
    raise exception 'The event code or Guest Organiser code is incorrect or expired';
  end if;

  insert into public.away_event_organisers(event_id, user_id, access_type, revoked_at)
  values (v_event_id, auth.uid(), 'guest', null)
  on conflict (event_id, user_id) do update set
    access_type = 'guest', revoked_at = null, granted_at = now();

  delete from public.away_event_guest_keys where event_id = v_event_id;
  return v_event_id;
end;
$$;

create or replace function public.revoke_away_guest_organiser(p_event_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.away_events e
    where e.id = p_event_id and e.organiser_id = auth.uid()
  ) then
    raise exception 'Only the Owner Organiser can revoke delegated access';
  end if;
  update public.away_event_organisers
  set revoked_at = now()
  where event_id = p_event_id and access_type = 'guest' and revoked_at is null;
  delete from public.away_event_guest_keys where event_id = p_event_id;
  return true;
end;
$$;

create or replace function public.away_guest_organiser_active(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.away_event_organisers eo
    join public.away_events e on e.id = eo.event_id
    where eo.event_id = p_event_id
      and eo.user_id = auth.uid()
      and eo.access_type = 'guest'
      and eo.revoked_at is null
      and e.status not in ('complete', 'archived')
  );
$$;

create or replace function public.away_revoke_guests_when_event_closes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('complete', 'archived')
     and old.status is distinct from new.status then
    update public.away_event_organisers
    set revoked_at = coalesce(revoked_at, now())
    where event_id = new.id and access_type = 'guest';
    delete from public.away_event_guest_keys where event_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists away_event_revoke_guests on public.away_events;
create trigger away_event_revoke_guests
after update of status on public.away_events
for each row execute function public.away_revoke_guests_when_event_closes();

revoke all on function public.create_away_guest_organiser_key(uuid) from public;
revoke all on function public.claim_away_guest_organiser_access(text, text) from public;
revoke all on function public.revoke_away_guest_organiser(uuid) from public;
revoke all on function public.away_guest_organiser_active(uuid) from public;
grant execute on function public.create_away_guest_organiser_key(uuid) to authenticated;
grant execute on function public.claim_away_guest_organiser_access(text, text) to authenticated;
grant execute on function public.revoke_away_guest_organiser(uuid) to authenticated;
grant execute on function public.away_guest_organiser_active(uuid) to authenticated;

select 'Guest Organiser access installed successfully' as result;
