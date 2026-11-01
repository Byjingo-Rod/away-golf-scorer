-- Recommendation 8: catalog-backed performance corrections identified by the
-- Supabase database adviser after the function-permission migration.

create index if not exists away_event_players_member_user_id_idx
  on public.away_event_players (member_user_id);

create index if not exists away_event_spectators_user_id_idx
  on public.away_event_spectators (user_id);

create index if not exists away_events_organiser_id_idx
  on public.away_events (organiser_id);

alter policy "workspace owner reads"
  on public.away_organiser_workspaces
  using (owner_id = (select auth.uid()));

alter policy "workspace owner inserts"
  on public.away_organiser_workspaces
  with check (owner_id = (select auth.uid()));

alter policy "workspace owner updates"
  on public.away_organiser_workspaces
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
