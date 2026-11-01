-- Read-only Recommendation 8 verification for the Away Golf production schema.

do $$
declare
  missing_count integer;
begin
  select count(*) into missing_count
  from (values
    ('public'),
    ('away_course_private'),
    ('golf_catalogue_private'),
    ('golf_safe_private')
  ) expected(schema_name)
  where not exists (
    select 1 from pg_namespace n where n.nspname = expected.schema_name
  );
  if missing_count <> 0 then
    raise exception 'One or more required Away Golf schemas are missing';
  end if;

  select count(*) into missing_count
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
    and c.relrowsecurity is false;
  if missing_count <> 0 then
    raise exception '% public tables do not have RLS enabled', missing_count;
  end if;

  select count(*) into missing_count
  from (values
    ('away_event_players_member_user_id_idx'),
    ('away_event_spectators_user_id_idx'),
    ('away_events_organiser_id_idx')
  ) expected(index_name)
  where not exists (
    select 1 from pg_indexes i
    where i.schemaname = 'public' and i.indexname = expected.index_name
  );
  if missing_count <> 0 then
    raise exception 'One or more required foreign-key indexes are missing';
  end if;

  select count(*) into missing_count
  from (values
    ('away_events'),
    ('away_event_players'),
    ('away_round_scores')
  ) expected(table_name)
  where not exists (
    select 1 from pg_publication_tables p
    where p.pubname = 'supabase_realtime'
      and p.schemaname = 'public'
      and p.tablename = expected.table_name
  );
  if missing_count <> 0 then
    raise exception 'One or more required Realtime tables are missing';
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    left join pg_roles grantee on grantee.oid = acl.grantee
    where n.nspname = 'public'
      and acl.privilege_type = 'EXECUTE'
      and (acl.grantee = 0 or grantee.rolname = 'anon')
  ) then
    raise exception 'A public function is executable by anon or PUBLIC';
  end if;

  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where not t.tgisinternal
      and n.nspname = 'public'
      and t.tgname = 'away_event_revoke_guests'
  ) then
    raise exception 'Guest organiser revocation trigger is missing';
  end if;
end
$$;

select 'Away Golf production schema verified' as result;
