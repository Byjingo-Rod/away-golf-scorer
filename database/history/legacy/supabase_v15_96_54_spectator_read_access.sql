-- Away Golf Scorer 15.96.54 live spectator read-access correction.
-- Registered spectators are read-only, but normal live polling must be able to
-- read the event, player list and score rows after the initial join response.

create or replace function public.is_away_event_spectator(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.away_event_spectators s
      where s.event_id = p_event_id
        and s.user_id = auth.uid()
    );
$$;

revoke all on function public.is_away_event_spectator(uuid) from public, anon;
grant execute on function public.is_away_event_spectator(uuid) to authenticated;

drop policy if exists "event participants read" on public.away_events;
create policy "event participants read" on public.away_events
for select to authenticated
using (
  public.is_away_event_organiser(id)
  or public.is_away_event_member(id)
  or public.is_away_event_spectator(id)
);

drop policy if exists "event participants read players" on public.away_event_players;
create policy "event participants read players" on public.away_event_players
for select to authenticated
using (
  public.is_away_event_organiser(event_id)
  or public.is_away_event_member(event_id)
  or public.is_away_event_spectator(event_id)
);

drop policy if exists "event participants read scores" on public.away_round_scores;
create policy "event participants read scores" on public.away_round_scores
for select to authenticated
using (
  public.is_away_event_organiser(event_id)
  or public.is_away_event_member(event_id)
  or public.is_away_event_spectator(event_id)
);
