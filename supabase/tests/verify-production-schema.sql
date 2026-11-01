-- Read-only Recommendation 8 verification for the Away Golf production schema.

do $$
declare
  missing_count integer;
begin
  if to_regprocedure('golf_safe_private.assert_event_complete(uuid,jsonb)') is null
     or to_regprocedure('golf_safe_private.validate_ambrose(jsonb,jsonb,text,integer,jsonb)') is null then
    raise exception 'Lifecycle acceptance guards are missing';
  end if;
  if has_function_privilege('authenticated','golf_safe_private.assert_event_complete(uuid,jsonb)','EXECUTE')
     or has_function_privilege('authenticated','golf_safe_private.validate_ambrose(jsonb,jsonb,text,integer,jsonb)','EXECUTE') then
    raise exception 'Private lifecycle guard is callable by an application user';
  end if;
  if not exists(select 1 from pg_indexes where schemaname='public' and indexname='away_event_publication_identity') then
    raise exception 'Publication retry identity index is missing';
  end if;
  if not exists(select 1 from pg_trigger where tgname='away_event_revoke_guests' and not tgisinternal and pg_get_triggerdef(oid) like '%event_data%') then
    raise exception 'Guest revocation does not watch final event data';
  end if;
  if exists(select 1 from pg_trigger where not tgisinternal and tgenabled<>'D' and tgname in ('golf_course_changed','golf_country_changed','golf_location_changed')) then
    raise exception 'Retired catalogue bridge triggers are active';
  end if;
  if to_regclass('cron.job') is not null then
    if exists(select 1 from cron.job where jobname='golf-course-catalogue-retry' and active) then raise exception 'Retired catalogue retry job is active';end if;
  end if;
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('away_course_private','golf_safe_private','golf_catalogue_private') and c.relkind='r' and not c.relrowsecurity) then raise exception 'Private application table lacks defence-in-depth RLS';end if;
  if has_function_privilege('authenticated','away_course_private.write_master_course(text,jsonb,bigint,text,boolean,text)','EXECUTE') then raise exception 'Private master writer is callable by an application user';end if;
  if has_table_privilege('authenticated','public.away_event_players','DELETE') then raise exception 'Direct browser roster deletion is granted';end if;
  if not exists(select 1 from pg_trigger where not tgisinternal and tgname='protect_scored_player' and tgenabled<>'D') then raise exception 'Scored-player deletion guard is missing';end if;
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
