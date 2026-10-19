-- Disposable fixtures, always rolled back. Run only in Golf Event Scorer.
begin;
insert into auth.users(id,email,email_confirmed_at,is_anonymous) values
 ('10000000-0000-4000-8000-000000000001','roster-test-1@example.invalid',now(),false),
 ('10000000-0000-4000-8000-000000000002','roster-test-2@example.invalid',now(),false);
insert into public.ges_groups(id,name,setup_status) values
 ('20000000-0000-4000-8000-000000000001','Disposable roster test A','active'),
 ('20000000-0000-4000-8000-000000000002','Disposable roster test B','active');
insert into public.ges_organisers(group_id,user_id,approved_by) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
do $$
declare g uuid='20000000-0000-4000-8000-000000000001'; p uuid='30000000-0000-4000-8000-000000000001'; details jsonb='{"firstName":"Test","lastName":"Golfer","nickname":"TG","registration":"123456","cellPhone":"0400123456","notes":"Private notes","addressDetails":{"houseNo":"7","streetName":"Test","streetType":"Rd","suburb":"Sydney","state":"NSW","postCode":"2000"}}'; r jsonb;
begin
 r=public.ges_save_player_details(g,p,0,details,12.3,true);
 if r->>'revision'<>'1' or r->'details' <> details then raise exception 'Create did not persist details'; end if;
 r=public.ges_save_player_details(g,p,0,details,12.3,true);
 if r->>'revision'<>'1' then raise exception 'Retry duplicated a save'; end if;
 r=public.ges_save_player_details(g,p,1,details,12.3,false);
 if r->>'revision'<>'2' or (r->>'active')::boolean then raise exception 'Inactive did not persist'; end if;
 begin perform public.ges_save_player_details(g,p,1,details,12.3,true);raise exception 'Stale revision accepted';exception when serialization_failure then null;end;
 r=public.ges_save_player_details(g,p,2,details,12.3,true);
 if r->>'revision'<>'3' or not (r->>'active')::boolean then raise exception 'Reactivate failed'; end if;
 begin perform public.ges_save_player_details('20000000-0000-4000-8000-000000000002',gen_random_uuid(),0,details,null,true);raise exception 'Cross-group write accepted';exception when insufficient_privilege then null;end;
 begin update public.ges_players set active=false where id=p;raise exception 'Direct table mutation accepted';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
do $$ begin if exists(select 1 from public.ges_players where group_id='20000000-0000-4000-8000-000000000001') then raise exception 'Cross-group read leaked';end if;end $$;
reset role;
update public.ges_organisers set enabled=false where user_id='10000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
do $$ begin
 if exists(select 1 from public.ges_players where group_id='20000000-0000-4000-8000-000000000001') then raise exception 'Suspended organiser read leaked';end if;
 begin perform public.ges_save_player_details('20000000-0000-4000-8000-000000000001',gen_random_uuid(),0,'{"firstName":"Test","lastName":"Denied"}',null,true);raise exception 'Suspended organiser saved';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform public.ges_save_player_details('20000000-0000-4000-8000-000000000001',gen_random_uuid(),0,'{}',null,true);raise exception 'Anonymous save accepted';exception when insufficient_privilege then null;end;
 begin perform 1 from public.ges_players;raise exception 'Anonymous read accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
select 'Passed: complete details, retry, inactive, reactivate, conflict, isolation, revocation, anonymous denial' as result;
rollback;
