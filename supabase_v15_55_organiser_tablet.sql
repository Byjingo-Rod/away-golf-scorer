-- Away Golf Scorer 15.55 — secure organiser tablet access
-- Run once in the Supabase SQL Editor before connecting the organiser tablet.

create extension if not exists pgcrypto;

create table if not exists public.away_event_organisers (
  event_id uuid not null references public.away_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create table if not exists public.away_event_organiser_keys (
  event_id uuid primary key references public.away_events(id) on delete cascade,
  access_hash text not null,
  updated_at timestamptz not null default now()
);

alter table public.away_event_organisers enable row level security;
alter table public.away_event_organiser_keys enable row level security;

create or replace function public.is_away_event_organiser(p_event_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.away_events e
    where e.id = p_event_id and e.organiser_id = auth.uid()
  ) or exists (
    select 1 from public.away_event_organisers eo
    where eo.event_id = p_event_id and eo.user_id = auth.uid()
  );
$$;

drop policy if exists "event organisers read membership" on public.away_event_organisers;
create policy "event organisers read membership" on public.away_event_organisers
for select to authenticated using (public.is_away_event_organiser(event_id));
drop policy if exists "event organisers read access keys" on public.away_event_organiser_keys;
create policy "event organisers read access keys" on public.away_event_organiser_keys
for select to authenticated using (public.is_away_event_organiser(event_id));

grant select on public.away_event_organisers, public.away_event_organiser_keys to authenticated;

create or replace function public.create_away_organiser_key(p_event_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  if not public.is_away_event_organiser(p_event_id) then
    raise exception 'Organiser access is required';
  end if;
  v_code := upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 8));
  insert into public.away_event_organiser_keys(event_id, access_hash, updated_at)
  values (p_event_id, crypt(v_code, gen_salt('bf')), now())
  on conflict (event_id) do update
    set access_hash = excluded.access_hash, updated_at = now();
  return v_code;
end;
$$;

create or replace function public.claim_away_organiser_access(p_join_code text, p_access_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_event_id uuid; v_hash text;
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;
  select e.id, k.access_hash into v_event_id, v_hash
  from public.away_events e
  join public.away_event_organiser_keys k on k.event_id = e.id
  where e.join_code = upper(trim(p_join_code)) and e.status <> 'archived'
  order by e.updated_at desc limit 1;
  if v_event_id is null or crypt(upper(trim(p_access_code)), v_hash) <> v_hash then
    raise exception 'The event code or organiser code is incorrect';
  end if;
  insert into public.away_event_organisers(event_id, user_id)
  values (v_event_id, auth.uid()) on conflict do nothing;
  return v_event_id;
end;
$$;

revoke all on function public.create_away_organiser_key(uuid) from public;
revoke all on function public.claim_away_organiser_access(text, text) from public;
grant execute on function public.create_away_organiser_key(uuid) to authenticated;
grant execute on function public.claim_away_organiser_access(text, text) to authenticated;
