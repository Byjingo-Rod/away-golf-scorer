-- Away Golf Scorer shared database — initial secure schema
-- Run once in the Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.away_organiser_workspaces (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  workspace_data jsonb not null default '{}'::jsonb,
  revision bigint not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists public.away_events (
  id uuid primary key default gen_random_uuid(),
  join_code text not null unique check (join_code ~ '^[A-Z0-9]{6}$'),
  organiser_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  status text not null default 'setup' check (status in ('setup','locked','playing','complete','archived')),
  event_data jsonb not null default '{}'::jsonb,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.away_event_players (
  event_id uuid not null references public.away_events(id) on delete cascade,
  player_id text not null,
  display_name text not null check (char_length(display_name) between 1 and 120),
  player_data jsonb not null default '{}'::jsonb,
  member_user_id uuid references auth.users(id) on delete set null,
  joined_at timestamptz,
  primary key (event_id, player_id),
  unique (event_id, member_user_id)
);

create table if not exists public.away_round_scores (
  event_id uuid not null references public.away_events(id) on delete cascade,
  day smallint not null check (day between 1 and 7),
  scorer_player_id text not null,
  score_data jsonb not null default '{}'::jsonb,
  revision bigint not null default 1,
  updated_at timestamptz not null default now(),
  primary key (event_id, day, scorer_player_id),
  foreign key (event_id, scorer_player_id)
    references public.away_event_players(event_id, player_id) on delete cascade
);

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

create or replace function public.away_touch_revision()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  new.revision := old.revision + 1;
  return new;
end;
$$;

drop trigger if exists away_workspace_touch on public.away_organiser_workspaces;
create trigger away_workspace_touch before update on public.away_organiser_workspaces
for each row execute function public.away_touch_revision();

drop trigger if exists away_event_touch on public.away_events;
create trigger away_event_touch before update on public.away_events
for each row execute function public.away_touch_revision();

drop trigger if exists away_score_touch on public.away_round_scores;
create trigger away_score_touch before update on public.away_round_scores
for each row execute function public.away_touch_revision();

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
    where eo.event_id = p_event_id and eo.user_id = auth.uid()
  );
$$;

create or replace function public.is_away_event_member(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.away_event_players ep
    where ep.event_id = p_event_id and ep.member_user_id = auth.uid()
  );
$$;

create or replace function public.can_write_away_round(p_event_id uuid, p_player_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_away_event_organiser(p_event_id) or exists (
    select 1 from public.away_event_players ep
    where ep.event_id = p_event_id
      and ep.player_id = p_player_id
      and ep.member_user_id = auth.uid()
  );
$$;

alter table public.away_organiser_workspaces enable row level security;
alter table public.away_events enable row level security;
alter table public.away_event_players enable row level security;
alter table public.away_round_scores enable row level security;
alter table public.away_event_organisers enable row level security;
alter table public.away_event_organiser_keys enable row level security;

drop policy if exists "workspace owner reads" on public.away_organiser_workspaces;
create policy "workspace owner reads" on public.away_organiser_workspaces
for select to authenticated using (owner_id = auth.uid());
drop policy if exists "workspace owner inserts" on public.away_organiser_workspaces;
create policy "workspace owner inserts" on public.away_organiser_workspaces
for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists "workspace owner updates" on public.away_organiser_workspaces;
create policy "workspace owner updates" on public.away_organiser_workspaces
for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "event participants read" on public.away_events;
create policy "event participants read" on public.away_events
for select to authenticated
using (public.is_away_event_organiser(id) or public.is_away_event_member(id));
drop policy if exists "organiser updates event" on public.away_events;
create policy "organiser updates event" on public.away_events
for update to authenticated
using (public.is_away_event_organiser(id))
with check (public.is_away_event_organiser(id));

drop policy if exists "event participants read players" on public.away_event_players;
create policy "event participants read players" on public.away_event_players
for select to authenticated
using (public.is_away_event_organiser(event_id) or public.is_away_event_member(event_id));
drop policy if exists "organiser manages players" on public.away_event_players;
create policy "organiser manages players" on public.away_event_players
for all to authenticated
using (public.is_away_event_organiser(event_id))
with check (public.is_away_event_organiser(event_id));

drop policy if exists "event participants read scores" on public.away_round_scores;
create policy "event participants read scores" on public.away_round_scores
for select to authenticated
using (public.is_away_event_organiser(event_id) or public.is_away_event_member(event_id));
drop policy if exists "player inserts own scoring record" on public.away_round_scores;
create policy "player inserts own scoring record" on public.away_round_scores
for insert to authenticated
with check (public.can_write_away_round(event_id, scorer_player_id));
drop policy if exists "player updates own scoring record" on public.away_round_scores;
create policy "player updates own scoring record" on public.away_round_scores
for update to authenticated
using (public.can_write_away_round(event_id, scorer_player_id))
with check (public.can_write_away_round(event_id, scorer_player_id));

drop policy if exists "event organisers read membership" on public.away_event_organisers;
create policy "event organisers read membership" on public.away_event_organisers
for select to authenticated using (public.is_away_event_organiser(event_id));

drop policy if exists "event organisers read access keys" on public.away_event_organiser_keys;
create policy "event organisers read access keys" on public.away_event_organiser_keys
for select to authenticated using (public.is_away_event_organiser(event_id));

revoke all on public.away_organiser_workspaces, public.away_events,
  public.away_event_players, public.away_round_scores from anon;
grant select, insert, update on public.away_organiser_workspaces to authenticated;
grant select, update on public.away_events to authenticated;
grant select, insert, update, delete on public.away_event_players to authenticated;
grant select, insert, update on public.away_round_scores to authenticated;
grant select on public.away_event_organisers, public.away_event_organiser_keys to authenticated;

create or replace function public.create_away_organiser_key(p_event_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
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

create or replace function public.claim_away_organiser_access(
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
  select e.id, k.access_hash into v_event_id, v_hash
  from public.away_events e
  join public.away_event_organiser_keys k on k.event_id = e.id
  where e.join_code = upper(trim(p_join_code))
    and e.status not in ('archived')
  order by e.updated_at desc
  limit 1;
  if v_event_id is null or crypt(upper(trim(p_access_code)), v_hash) <> v_hash then
    raise exception 'The event code or organiser code is incorrect';
  end if;
  insert into public.away_event_organisers(event_id, user_id)
  values (v_event_id, auth.uid())
  on conflict do nothing;
  return v_event_id;
end;
$$;

revoke all on function public.create_away_organiser_key(uuid) from public;
revoke all on function public.claim_away_organiser_access(text, text) from public;
grant execute on function public.create_away_organiser_key(uuid) to authenticated;
grant execute on function public.claim_away_organiser_access(text, text) to authenticated;

create or replace function public.create_away_event(
  p_name text,
  p_event_data jsonb,
  p_players jsonb
)
returns table(event_id uuid, join_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_code text;
  v_player jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'Event name is required'; end if;
  if jsonb_typeof(coalesce(p_players, '[]'::jsonb)) <> 'array' then
    raise exception 'Players must be an array';
  end if;

  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (select 1 from public.away_events e where e.join_code = v_code);
  end loop;

  insert into public.away_events(join_code, organiser_id, name, event_data)
  values (v_code, auth.uid(), trim(p_name), coalesce(p_event_data, '{}'::jsonb))
  returning id into v_event_id;

  for v_player in select value from jsonb_array_elements(coalesce(p_players, '[]'::jsonb))
  loop
    insert into public.away_event_players(event_id, player_id, display_name, player_data)
    values (
      v_event_id,
      v_player->>'id',
      coalesce(nullif(trim(v_player->>'name'), ''), 'Player'),
      v_player - 'id' - 'name'
    );
  end loop;

  return query select v_event_id, v_code;
end;
$$;

create or replace function public.away_event_invitation(p_join_code text)
returns table(event_id uuid, event_name text, player_id text, display_name text, already_joined boolean)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.name, ep.player_id, ep.display_name, ep.member_user_id is not null
  from public.away_events e
  join public.away_event_players ep on ep.event_id = e.id
  where e.join_code = upper(trim(p_join_code))
    and e.status <> 'archived'
  order by ep.display_name;
$$;

create or replace function public.join_away_event(p_join_code text, p_player_id text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_member uuid;
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;

  select ep.event_id, ep.member_user_id
    into v_event_id, v_member
  from public.away_event_players ep
  join public.away_events e on e.id = ep.event_id
  where e.join_code = upper(trim(p_join_code))
    and ep.player_id = p_player_id
    and e.status <> 'archived'
  for update of ep;

  if v_event_id is null then raise exception 'Event code or player is not valid'; end if;
  if v_member is not null and v_member <> auth.uid() then
    raise exception 'That player has already joined on another device';
  end if;

  update public.away_event_players
  set member_user_id = auth.uid(), joined_at = coalesce(joined_at, now())
  where event_id = v_event_id and player_id = p_player_id;

  return v_event_id;
end;
$$;

revoke all on function public.create_away_event(text, jsonb, jsonb) from public, anon;
revoke all on function public.away_event_invitation(text) from public, anon;
revoke all on function public.join_away_event(text, text) from public, anon;
grant execute on function public.create_away_event(text, jsonb, jsonb) to authenticated;
grant execute on function public.away_event_invitation(text) to authenticated;
grant execute on function public.join_away_event(text, text) to authenticated;

create or replace function public.spectate_away_event(p_join_code text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'event', jsonb_build_object(
      'id', e.id, 'join_code', e.join_code, 'name', e.name,
      'status', e.status, 'event_data', e.event_data,
      'revision', e.revision, 'updated_at', e.updated_at
    ),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'player_id', ep.player_id, 'display_name', ep.display_name,
        'player_data', ep.player_data, 'joined_at', ep.joined_at
      ) order by ep.display_name)
      from public.away_event_players ep where ep.event_id = e.id
    ), '[]'::jsonb),
    'scores', coalesce((
      select jsonb_agg(jsonb_build_object(
        'day', rs.day, 'scorer_player_id', rs.scorer_player_id,
        'score_data', rs.score_data, 'revision', rs.revision,
        'updated_at', rs.updated_at
      ))
      from public.away_round_scores rs where rs.event_id = e.id
    ), '[]'::jsonb)
  )
  from public.away_events e
  where e.join_code = upper(trim(p_join_code))
    and e.status <> 'archived'
  limit 1;
$$;

revoke all on function public.spectate_away_event(text) from public, anon;
grant execute on function public.spectate_away_event(text) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.away_events;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.away_event_players;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.away_round_scores;
exception when duplicate_object then null;
end $$;

select 'Away Golf database created successfully' as result;
