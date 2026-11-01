-- Away Golf Scorer 15.96.54 live spectator count correction.
-- Spectator polling reads the event directly and does not call the join RPC on
-- every refresh, so the organiser count represents registered spectators for
-- this event rather than an unsupported 30-second heartbeat.

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
  );
end;
$$;

revoke all on function public.away_event_spectator_count(uuid) from public, anon;
grant execute on function public.away_event_spectator_count(uuid) to authenticated;
