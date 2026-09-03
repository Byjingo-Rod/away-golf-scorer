-- Away Golf Scorer 15.86.4
-- Read-only Spectator View. Run once in the Supabase SQL Editor.

create or replace function public.spectate_away_event(p_join_code text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'event', jsonb_build_object(
      'id', e.id,
      'join_code', e.join_code,
      'name', e.name,
      'status', e.status,
      'event_data', e.event_data,
      'revision', e.revision,
      'updated_at', e.updated_at
    ),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'player_id', ep.player_id,
        'display_name', ep.display_name,
        'player_data', ep.player_data,
        'joined_at', ep.joined_at
      ) order by ep.display_name)
      from public.away_event_players ep
      where ep.event_id = e.id
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
      where rs.event_id = e.id
    ), '[]'::jsonb)
  )
  from public.away_events e
  where e.join_code = upper(trim(p_join_code))
    and e.status <> 'archived'
  limit 1;
$$;

revoke all on function public.spectate_away_event(text) from public, anon;
grant execute on function public.spectate_away_event(text) to authenticated;
