-- Historical baseline ordering: this file predates the live Supabase migration ledger.
-- The timestamp establishes deterministic replay order; it is not an exact application time.

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


-- Reconstruction prerequisites. This pre-ledger baseline has not been an
-- entry in production's migration ledger. These out-of-band routines are
-- exported here so later immutable migrations have their actual dependencies.
-- The original historical SQL remains unchanged in database/history/legacy.
create schema if not exists golf_safe_private;
revoke all on schema golf_safe_private from public,anon,authenticated;
CREATE OR REPLACE FUNCTION golf_safe_private.shared_slot(plan jsonb, pid text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 select coalesce((select key from jsonb_each(coalesce(plan->'sharedPositions','{}')) p where p.key=pid or exists(select 1 from jsonb_each_text(p.value) d where d.value=pid) limit 1),pid);
$function$
;
CREATE OR REPLACE FUNCTION golf_safe_private.validate_substitution(before_plan jsonb, after_plan jsonb, cards jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare slot text; history jsonb; prior jsonb; addition jsonb; first_day integer; previous_count integer; d integer;
begin
 if coalesce(before_plan->'playerSubstitutions','{}')=coalesce(after_plan->'playerSubstitutions','{}') then return;end if;
 if jsonb_typeof(after_plan->'playerSubstitutions') is distinct from 'object' then raise exception 'Substitution history cannot be removed';end if;
 for slot,prior in select key,value from jsonb_each(coalesce(before_plan->'playerSubstitutions','{}')) loop
  if not (after_plan->'playerSubstitutions' ? slot) then raise exception 'Substitution history cannot be removed';end if;
 end loop;
 for slot,history in select key,value from jsonb_each(after_plan->'playerSubstitutions') loop
  prior=coalesce(before_plan->'playerSubstitutions'->slot,'[]');
  if history=prior then continue;end if;
  if jsonb_typeof(history) is distinct from 'array' or jsonb_typeof(prior) is distinct from 'array' then raise exception 'Invalid substitution history';end if;
  previous_count=jsonb_array_length(prior);
  if jsonb_array_length(history)<>previous_count+1 or (select coalesce(jsonb_agg(value order by ord),'[]') from jsonb_array_elements(history) with ordinality h(value,ord) where ord<=previous_count) is distinct from prior then raise exception 'Earlier substitution history is immutable';end if;
  addition=history->previous_count; first_day=(addition->>'fromDay')::integer;
  if coalesce((before_plan->>'locked')::boolean,false) is not true or first_day is null or first_day not between 1 and (before_plan->>'days')::integer or (previous_count>0 and first_day<=(prior->(previous_count-1)->>'fromDay')::integer) then raise exception 'Invalid substitution round';end if;
  if length(trim(coalesce(addition->'replacement'->>'name','')))=0 or length(addition->'replacement'->>'name')>120 or nullif(addition->'replacement'->>'id','') is null or (addition->'replacement'->>'ga')::numeric not between -10 and 54 or addition->'replacement'->>'ga' is null then raise exception 'Invalid substitute identity or handicap';end if;
  if not exists(select 1 from jsonb_array_elements_text(coalesce(before_plan->'dayFields'->('day'||first_day),before_plan->'confirmed','[]')) value where value=slot) then raise exception 'Substitution position is outside the round';end if;
  if exists(select 1 from jsonb_array_elements(coalesce(cards,'[]')) c cross join lateral jsonb_each(c->'score_data') h where (c->>'day')::integer>=first_day and h.key ~ '^([1-9]|1[0-8])$' and (nullif(h.value->'self'->>'gross','') is not null or nullif(h.value->'self'->>'putts','') is not null or nullif(h.value->'official'->>'gross','') is not null or nullif(h.value->'official'->>'putts','') is not null)) then raise exception 'Scoring has begun in an affected round. Substitution blocked.';end if;
  for d in first_day..(before_plan->>'days')::integer loop
   if coalesce(before_plan->'manualScorecards'->('day'||d)->'groups','{}')<>'{}'::jsonb then raise exception 'Paper card entry has begun in an affected round';end if;
  end loop;
  for d in 1..first_day-1 loop
   if before_plan->'dailyHandicaps'->('day'||d) is distinct from after_plan->'dailyHandicaps'->('day'||d) or before_plan->'teeHandicaps'->('day'||d) is distinct from after_plan->'teeHandicaps'->('day'||d) then raise exception 'Earlier round handicaps cannot change during substitution';end if;
  end loop;
  if before_plan->'groupSetup' is distinct from after_plan->'groupSetup' or before_plan->'dayFields' is distinct from after_plan->'dayFields' or before_plan->'capTeams' is distinct from after_plan->'capTeams' then raise exception 'Substitution must keep the existing event positions';end if;
 end loop;
end;$function$
;
CREATE OR REPLACE FUNCTION golf_safe_private.validate_shared_positions(before_plan jsonb, plan jsonb, players jsonb, allowance integer)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare slot text; assignments jsonb; d integer; pid text; count_positions integer;
begin
 if coalesce((before_plan->>'locked')::boolean,false) and coalesce(before_plan->'sharedPositions','{}') is distinct from coalesce(plan->'sharedPositions','{}') then raise exception 'Shared positions are fixed after final publication';end if;
 if jsonb_typeof(coalesce(plan->'sharedPositions','{}')) is distinct from 'object' then raise exception 'Invalid shared positions';end if;
 if coalesce(plan->'sharedPositions','{}')='{}'::jsonb then return;end if;
 if jsonb_typeof(players) is distinct from 'array' then raise exception 'Invalid player roster';end if;
 select count(distinct golf_safe_private.shared_slot(plan,value->>'id')) into count_positions from jsonb_array_elements(players);
 if count_positions<1 or count_positions>allowance then raise exception 'Too many playing positions';end if;
 for slot,assignments in select key,value from jsonb_each(coalesce(plan->'sharedPositions','{}')) loop
  if jsonb_typeof(assignments) is distinct from 'object' or (select count(distinct value) from jsonb_each_text(assignments))<2 or not exists(select 1 from jsonb_each_text(assignments) where value=slot) then raise exception 'Assign both golfers to the shared position';end if;
  if not exists(select 1 from jsonb_array_elements_text(coalesce(plan->'confirmed','[]')) where value=slot) then raise exception 'Shared position must belong to the selected field';end if;
  for d in 1..(plan->>'days')::integer loop
   pid=assignments->>('day'||d);
   if pid is null or not exists(select 1 from jsonb_array_elements(players) where value->>'id'=pid) then raise exception 'Assign a registered event golfer to every shared day';end if;
   if pid<>slot and exists(select 1 from jsonb_array_elements_text(coalesce(plan->'confirmed','[]')) where value=pid) then raise exception 'Shared golfer already has another position';end if;
   if exists(select 1 from jsonb_each(coalesce(plan->'sharedPositions','{}')) p where p.key<>slot and (p.key=pid or exists(select 1 from jsonb_each_text(p.value) where value=pid))) then raise exception 'A golfer cannot share two positions';end if;
  end loop;
 end loop;
 for d in 1..(plan->>'days')::integer loop
  if jsonb_array_length(coalesce(plan->'dayFields'->('day'||d),plan->'confirmed','[]'))>allowance or (select count(distinct value) from jsonb_array_elements_text(coalesce(plan->'dayFields'->('day'||d),plan->'confirmed','[]')))<>jsonb_array_length(coalesce(plan->'dayFields'->('day'||d),plan->'confirmed','[]')) then raise exception 'Invalid daily player count';end if;
  for pid in select value from jsonb_array_elements_text(coalesce(plan->'dayFields'->('day'||d),plan->'confirmed','[]')) loop
   if pid='system-no-partner' then continue;end if;
   if not exists(select 1 from jsonb_array_elements(players) where value->>'id'=pid) then raise exception 'Daily golfer outside published roster';end if;
   slot=golf_safe_private.shared_slot(plan,pid);
   if plan->'sharedPositions' ? slot and plan->'sharedPositions'->slot->>('day'||d) is distinct from pid then raise exception 'Shared golfer assigned to a different day';end if;
  end loop;
 end loop;
end;$function$
;
revoke all on all functions in schema golf_safe_private from public,anon,authenticated;
