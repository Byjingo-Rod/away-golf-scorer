-- Read-only assertions: synthetic JSON only; no users, events or scores written.
do $$
declare p jsonb;card jsonb;cards jsonb;rejected boolean;
begin
 p='{"date":"2080-01-01","days":1,"timeZone":"Australia/Sydney","startTimes":{"day1":["09:00"]},"competitions":["ambrose"],"ambroseScoringMode":"scorerOnly","ambroseMinimumDrives":3,"groupSetup":{"day1":{"groups":[["p1","p2","p3"]]}}}';
 if golf_safe_private.scoring_is_open(p,1) then raise exception 'Future round opened';end if;
 if not golf_safe_private.scoring_is_open(p||'{"scoringOpenedEarly":{"day1":true}}',1) then raise exception 'Organiser early opening failed';end if;
 if golf_safe_private.scoring_is_open(p||'{"scoringOpenedEarly":{"day1":false}}',1) then raise exception 'False early override opened round';end if;
 if not golf_safe_private.scoring_is_open(p||'{"testMode":true}',1) then raise exception 'Explicit test opening failed';end if;
 select jsonb_object_agg(h::text,jsonb_build_object('self',jsonb_build_object('playerId','p1','gross',4),'ambrose',jsonb_build_object('drivePlayerId','p'||(h%3+1))))||'{"_meta":{"finalisedAt":"2026-11-02T01:00:00Z","ambroseDriveCompliant":true}}'::jsonb into card from generate_series(1,18)h;
 perform golf_safe_private.validate_ambrose(card,p,'p1',1,'{}');
 rejected=false;begin perform golf_safe_private.validate_ambrose(card,p,'p2',1,'{}');exception when sqlstate '42501' then rejected=true;end;if not rejected then raise exception 'Non-scorer accepted';end if;
 rejected=false;begin perform golf_safe_private.validate_ambrose(jsonb_set(card,'{1,ambrose,drivePlayerId}','"outsider"'),p,'p1',1,'{}');exception when others then rejected=true;end;if not rejected then raise exception 'Outside drive accepted';end if;
 p=p||'{"ambroseScoringMode":"scorerMarker"}';cards=jsonb_build_object('p2',card);
 perform golf_safe_private.validate_ambrose(card,p,'p1',1,cards);
 rejected=false;begin perform golf_safe_private.validate_ambrose(card,p,'p1',1,jsonb_set(cards,'{p2,1,self,gross}','5'));exception when others then rejected=true;end;if not rejected then raise exception 'Mismatched marker accepted';end if;
 if golf_safe_private.round_settings(p,1) is distinct from golf_safe_private.round_settings(p||'{"dailyHandicaps":{"day2":{"p1":12}}}',1) then raise exception 'Later-round handicap affected earlier settings';end if;
 if golf_safe_private.round_settings(p,1) is not distinct from golf_safe_private.round_settings(p||'{"dailyHandicaps":{"day1":{"p1":12}}}',1) then raise exception 'Affected-round handicap absent from lock';end if;
end $$;
select 'Away lifecycle read-only assertions passed' as result;
