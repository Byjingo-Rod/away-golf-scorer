-- Away Golf Scorer 15.86.19
-- Active spectator count. Run once in the Supabase SQL Editor.

create table if not exists public.away_event_spectators (
  event_id uuid not null references public.away_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_seen timestamptz not null default now(),
  primary key (event_id, user_id)
);

alter table public.away_event_spectators enable row level security;
revoke all on public.away_event_spectators from public, anon, authenticated;

create or replace function public.away_event_spectator_count(p_event_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_away_event_organiser(p_event_id) then
    raise exception 'Organiser access is required';
  end if;
  return (
    select count(*)::integer
    from public.away_event_spectators
    where event_id = p_event_id
      and last_seen >= now() - interval '30 seconds'
  );
end;
$$;

revoke all on function public.away_event_spectator_count(uuid) from public, anon;
grant execute on function public.away_event_spectator_count(uuid) to authenticated;

create or replace function public.spectate_away_event(p_join_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.away_events%rowtype;
  v_result jsonb;
begin
  select * into v_event
  from public.away_events
  where join_code = upper(trim(p_join_code))
    and status <> 'archived'
  limit 1;

  if v_event.id is null then
    return null;
  end if;

  insert into public.away_event_spectators(event_id, user_id, last_seen)
  values (v_event.id, auth.uid(), now())
  on conflict (event_id, user_id) do update set last_seen = now();

  select jsonb_build_object(
    'event', jsonb_build_object(
      'id', v_event.id,
      'join_code', v_event.join_code,
      'name', v_event.name,
      'status', v_event.status,
      'event_data', v_event.event_data,
      'revision', v_event.revision,
      'updated_at', v_event.updated_at
    ),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'player_id', ep.player_id,
        'display_name', ep.display_name,
        'player_data', ep.player_data,
        'joined_at', ep.joined_at
      ) order by ep.display_name)
      from public.away_event_players ep
      where ep.event_id = v_event.id
    ), '[]'::jsonb),
    'scores', coalesce((
      select jsonb_agg(jsonb_build_object(
        'day', rs.day,
        'scorer_player_id', rs.scorer_player_id,
        'score_data', rs.score_data,
        'revision', rs.revision,
        'updated_at', rs.updated_at
      ))
      from public.away_round_scores rs
      where rs.event_id = v_event.id
    ), '[]'::jsonb),
    'spectator_count', (
      select count(*)::integer
      from public.away_event_spectators
      where event_id = v_event.id
        and last_seen >= now() - interval '30 seconds'
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.spectate_away_event(text) from public, anon;
grant execute on function public.spectate_away_event(text) to authenticated;
