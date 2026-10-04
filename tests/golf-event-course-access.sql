begin;
insert into auth.users(id,email,email_confirmed_at,is_anonymous) values ('10000000-0000-4000-8000-000000000011','course-owner@example.invalid',now(),false),('10000000-0000-4000-8000-000000000012','course-organiser@example.invalid',now(),false);
insert into public.ges_owners(user_id) values ('10000000-0000-4000-8000-000000000011');
insert into public.ges_courses(id,name,details) values ('disposable-course-test','Disposable course','{}');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000011',true);
do $$ declare details jsonb; stamp timestamptz; saved jsonb; begin
 select updated_at into stamp from public.ges_courses where id='disposable-course-test';
 details=jsonb_build_object('preserved','original metadata','teeDetails',jsonb_build_object('middle',jsonb_build_object('name','Middle','slope','130','scratch','72.5','par','72')),'teeScorecards',jsonb_build_object('middle',jsonb_build_object('par',(select jsonb_agg(4) from generate_series(1,18)),'index',(select jsonb_agg(i) from generate_series(1,18) i),'metres',(select jsonb_agg(350) from generate_series(1,18)))));
 saved=public.ges_save_course('disposable-course-test',stamp,'Accepted test course',details);
 if saved->>'name'<>'Accepted test course' or saved->'details'->>'preserved'<>'original metadata' or saved->'details'->>'acceptedBy'<>'10000000-0000-4000-8000-000000000011' then raise exception 'Save did not persist accepted details';end if;
 begin perform public.ges_save_course('disposable-course-test',stamp,'Stale',details);raise exception 'Stale save accepted';exception when serialization_failure then null;end;
 stamp=(saved->>'updated_at')::timestamptz;
 begin perform public.ges_save_course('disposable-course-test',stamp,'Bad card',jsonb_set(details,'{teeScorecards,middle,index,1}','1'));raise exception 'Duplicate index accepted';exception when raise_exception then if SQLERRM='Duplicate index accepted' then raise;end if;end;
 begin perform public.ges_save_course('disposable-course-test',stamp,'Duplicate secondary',jsonb_set(jsonb_set(details,'{teeScorecards,middle,index,0}','"1/19"'),'{teeScorecards,middle,index,1}','"2/19"'));raise exception 'Duplicate secondary accepted';exception when raise_exception then if SQLERRM='Duplicate secondary accepted' then raise;end if;end;
 begin perform public.ges_save_course('disposable-course-test',stamp,'Missing eighteen',jsonb_set(details,'{teeScorecards,middle,index,17}','19'));raise exception 'Standalone nineteen accepted';exception when raise_exception then if SQLERRM='Standalone nineteen accepted' then raise;end if;end;
 begin perform public.ges_save_course('disposable-course-test',stamp,'Missing rating',jsonb_set(details,'{teeDetails,middle,scratch}','""'));raise exception 'Missing rating accepted';exception when raise_exception then if SQLERRM='Missing rating accepted' then raise;end if;end;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000012',true);
do $$ begin
 begin perform public.ges_save_course('disposable-course-test',now(),'Denied','{}');raise exception 'Organiser save accepted';exception when insufficient_privilege then null;end;
 update public.ges_courses set name='Denied direct edit' where id='disposable-course-test';if found then raise exception 'Organiser direct edit accepted';end if;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform public.ges_save_course('disposable-course-test',now(),'Denied','{}');raise exception 'Anonymous save accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
select 'Passed: owner persistence, metadata retention, conflict rejection, invalid card rejection, organiser and anonymous denial' as result;
rollback;
