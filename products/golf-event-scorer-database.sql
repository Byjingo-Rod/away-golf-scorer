-- Golf Event Scorer only. Install in a NEW, separate Supabase project.
-- Owner bootstrap is a trusted SQL Editor operation; no browser can self-enrol.
begin;

create table public.ges_owners (
  user_id uuid primary key references auth.users(id) on delete cascade
);
create table public.ges_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 120),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.ges_organisers (
  group_id uuid not null references public.ges_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  approved_by uuid not null references auth.users(id),
  approved_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create table public.ges_players (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.ges_groups(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  ga numeric check (ga between -10 and 54),
  active boolean not null default true,
  revision bigint not null default 1,
  unique (group_id, id)
);
create table public.ges_events (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.ges_groups(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  event_date date not null,
  field_size integer not null check (field_size between 1 and 60),
  status text not null default 'draft' check (status in ('draft', 'complete', 'archived')),
  planning_data jsonb not null default '{}' check (jsonb_typeof(planning_data) = 'object'),
  results_data jsonb not null default '{}' check (jsonb_typeof(results_data) = 'object'),
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ges_organisers_user on public.ges_organisers(user_id);
create index ges_players_group on public.ges_players(group_id);
create index ges_events_group_date on public.ges_events(group_id, event_date desc);

create function public.ges_is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.ges_owners o join auth.users u on u.id = o.user_id
    where o.user_id = auth.uid() and coalesce(u.is_anonymous, false) = false
    and u.email_confirmed_at is not null);
$$;
create function public.ges_can_access(p_group_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.ges_is_owner() or exists (
    select 1 from public.ges_organisers m
    join public.ges_groups g on g.id = m.group_id
    join auth.users u on u.id = m.user_id
    where m.group_id = p_group_id and m.user_id = auth.uid()
    and m.enabled and g.enabled and coalesce(u.is_anonymous, false) = false
    and u.email_confirmed_at is not null);
$$;

alter table public.ges_owners enable row level security;
alter table public.ges_groups enable row level security;
alter table public.ges_organisers enable row level security;
alter table public.ges_players enable row level security;
alter table public.ges_events enable row level security;
create policy ges_owner_read on public.ges_owners for select to authenticated using (user_id = auth.uid());
create policy ges_group_read on public.ges_groups for select to authenticated using (public.ges_can_access(id));
create policy ges_members_read on public.ges_organisers for select to authenticated using (public.ges_is_owner() or user_id = auth.uid());
create policy ges_player_read on public.ges_players for select to authenticated using (public.ges_can_access(group_id));
create policy ges_event_read on public.ges_events for select to authenticated using (public.ges_can_access(group_id));

create function public.ges_create_group(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
  if not public.ges_is_owner() then raise exception 'Owner approval required' using errcode = '42501'; end if;
  insert into public.ges_groups(name) values (trim(p_name)) returning id into result;
  return result;
end; $$;

create function public.ges_set_group_enabled(p_group_id uuid, p_enabled boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.ges_is_owner() then raise exception 'Owner approval required' using errcode = '42501'; end if;
  if p_enabled is null then raise exception 'Choose an access state'; end if;
  update public.ges_groups set enabled = p_enabled where id = p_group_id;
  if not found then raise exception 'Group not found'; end if;
end; $$;

create function public.ges_approve_organiser(p_group_id uuid, p_email text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare target uuid;
begin
  if not public.ges_is_owner() then raise exception 'Owner approval required' using errcode = '42501'; end if;
  select id into target from auth.users where lower(email) = lower(trim(p_email))
    and email_confirmed_at is not null and coalesce(is_anonymous, false) = false;
  if target is null then raise exception 'This organiser must sign in and verify their email first'; end if;
  insert into public.ges_organisers(group_id, user_id, approved_by)
    values (p_group_id, target, auth.uid())
    on conflict (group_id, user_id) do update set enabled = true, approved_by = auth.uid(), approved_at = now();
  return target;
end; $$;

create function public.ges_set_organiser_enabled(p_group_id uuid, p_user_id uuid, p_enabled boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.ges_is_owner() then raise exception 'Owner approval required' using errcode = '42501'; end if;
  if p_enabled is null then raise exception 'Choose an access state'; end if;
  update public.ges_organisers set enabled = p_enabled where group_id = p_group_id and user_id = p_user_id;
  if not found then raise exception 'Organiser not found'; end if;
end; $$;

create function public.ges_list_organisers(p_group_id uuid)
returns table(user_id uuid, email text, enabled boolean, approved_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.ges_is_owner() then raise exception 'Owner approval required' using errcode = '42501'; end if;
  return query select m.user_id, u.email::text, m.enabled, m.approved_at
    from public.ges_organisers m join auth.users u on u.id = m.user_id
    where m.group_id = p_group_id order by u.email;
end; $$;

create function public.ges_save_player(p_group_id uuid, p_name text, p_ga numeric,
  p_player_id uuid default null, p_expected_revision bigint default null, p_active boolean default true) returns uuid
language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
  if not public.ges_can_access(p_group_id) then raise exception 'Group access denied' using errcode = '42501'; end if;
  if p_player_id is null then
    insert into public.ges_players(group_id, name, ga, active) values(p_group_id, trim(p_name), p_ga, p_active) returning id into result;
  else
    update public.ges_players set name = trim(p_name), ga = p_ga, active = p_active, revision = revision + 1
      where id = p_player_id and group_id = p_group_id and revision = p_expected_revision returning id into result;
    if result is null then raise exception 'Player changed on another device. Refresh before saving.' using errcode = '40001'; end if;
  end if;
  return result;
end; $$;

create function public.ges_create_event(p_group_id uuid, p_name text, p_date date, p_field_size integer) returns uuid
language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
  if not public.ges_can_access(p_group_id) then raise exception 'Group access denied' using errcode = '42501'; end if;
  insert into public.ges_events(group_id, name, event_date, field_size) values(p_group_id, trim(p_name), p_date, p_field_size) returning id into result;
  return result;
end; $$;

create function public.ges_save_event(p_event_id uuid, p_expected_revision bigint,
  p_name text, p_date date, p_field_size integer, p_planning_data jsonb) returns bigint
language plpgsql security definer set search_path = '' as $$
declare target public.ges_events; result bigint;
begin
  select * into target from public.ges_events where id = p_event_id for update;
  if not found or not public.ges_can_access(target.group_id) then raise exception 'Group access denied' using errcode = '42501'; end if;
  if target.status <> 'draft' then raise exception 'Completed event planning is read-only'; end if;
  update public.ges_events set name = trim(p_name), event_date = p_date, field_size = p_field_size,
    planning_data = p_planning_data, revision = revision + 1, updated_at = now()
    where id = p_event_id and revision = p_expected_revision returning revision into result;
  if result is null then raise exception 'Event changed on another device. Refresh before saving.' using errcode = '40001'; end if;
  return result;
end; $$;

-- Table mutations are denied even if the browser bypasses its screens.
revoke all on public.ges_owners, public.ges_groups, public.ges_organisers, public.ges_players, public.ges_events from anon, authenticated;
grant select on public.ges_owners, public.ges_groups, public.ges_organisers, public.ges_players, public.ges_events to authenticated;
revoke all on function public.ges_is_owner(), public.ges_can_access(uuid), public.ges_create_group(text),
  public.ges_set_group_enabled(uuid, boolean), public.ges_approve_organiser(uuid, text),
  public.ges_set_organiser_enabled(uuid, uuid, boolean), public.ges_list_organisers(uuid), public.ges_save_player(uuid, text, numeric, uuid, bigint, boolean),
  public.ges_create_event(uuid, text, date, integer), public.ges_save_event(uuid, bigint, text, date, integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.ges_is_owner(), public.ges_can_access(uuid), public.ges_create_group(text),
  public.ges_set_group_enabled(uuid, boolean), public.ges_approve_organiser(uuid, text),
  public.ges_set_organiser_enabled(uuid, uuid, boolean), public.ges_list_organisers(uuid), public.ges_save_player(uuid, text, numeric, uuid, bigint, boolean),
  public.ges_create_event(uuid, text, date, integer), public.ges_save_event(uuid, bigint, text, date, integer, jsonb)
  to authenticated;
commit;
