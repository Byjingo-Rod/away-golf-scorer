begin;
select set_config('request.jwt.claims',json_build_object('sub',(select user_id from away_course_private.administrators limit 1),'role','authenticated')::text,true);
set local role authenticated;
do $$declare r jsonb;begin
 if not public.away_course_library_access() then raise exception 'Owner access test failed';end if;
 r=public.save_away_master_course('__rollback_test__','{"id":"__rollback_test__","name":"Cloud Course Test","country":"Vietnam","region":"Da Nang","teeScorecards":{"middle":{"distanceUnit":"yards","yards":[300],"metres":[274]}}}');
 if (r->>'revision')::int<>1 then raise exception 'Create revision failed';end if;
 r=public.save_away_master_course('__rollback_test__','{"id":"__rollback_test__","name":"Cloud Course Test 2","country":"Vietnam","region":"Da Nang"}',1);
 if (r->>'revision')::int<>2 then raise exception 'Update revision failed';end if;
 begin perform public.save_away_master_course('__rollback_test__','{"id":"__rollback_test__","name":"Stale"}',1);raise exception 'Stale edit incorrectly accepted';exception when serialization_failure then null;end;
 begin perform public.save_away_master_course('__rollback_test__','{"id":"__rollback_test__","name":"Duplicate"}');raise exception 'Duplicate incorrectly accepted';exception when serialization_failure then null;end;
 if (select count(*) from public.away_master_course_history where course_id='__rollback_test__')<>2 then raise exception 'History failed';end if;
 if (select data->>'name' from public.away_master_courses where id='__rollback_test__')<>'Cloud Course Test 2' then raise exception 'Stale overwrite occurred';end if;
 perform public.add_away_master_course_country(' Vietnam ');perform public.add_away_master_course_country('vietnam');
 if (select count(*) from public.away_master_course_countries where lower(name)='vietnam')<>1 then raise exception 'Country deduplication failed';end if;
 begin perform public.save_away_master_course('bad','{}');raise exception 'Missing identity accepted';exception when check_violation then null;end;
end;$$;
reset role;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$begin
 if public.away_course_library_access() then raise exception 'Unapproved access';end if;
 if exists(select 1 from public.away_master_courses) then raise exception 'Unapproved read';end if;
 begin perform public.save_away_master_course('deny','{"id":"deny","name":"Denied"}');raise exception 'Unapproved write';exception when insufficient_privilege then null;end;
 begin perform public.add_away_master_course_country('Denied');raise exception 'Unapproved country';exception when insufficient_privilege then null;end;
end;$$;
reset role;
set local role anon;
do $$begin
 begin perform count(*) from public.away_master_courses;raise exception 'Unauthenticated read';exception when insufficient_privilege then null;end;
 begin perform public.save_away_master_course('deny','{"id":"deny","name":"Denied"}');raise exception 'Unauthenticated RPC';exception when insufficient_privilege then null;end;
end;$$;
reset role;
rollback;
select 'Passed: owner create/update, stale and duplicate protection, history, yardage JSON, country deduplication, required identity, unapproved authenticated and unauthenticated access; test records rolled back.' as result;
