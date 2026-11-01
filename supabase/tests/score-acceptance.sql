-- Pure synthetic assertions: no event, course, user or score rows are written.
do $$
declare plan jsonb;course jsonb;card jsonb;full_card jsonb;cards jsonb='{}';pid text;target text;j integer;rejected boolean;sample jsonb;method text;
begin
 select jsonb_build_object('id','synthetic-course','teeScorecards',jsonb_build_object('middle',jsonb_build_object('par',jsonb_agg(4),'index',jsonb_agg(i)))) into course from generate_series(1,18)i;
 plan=jsonb_build_object('days',1,'competitions',jsonb_build_array('single'),'course1','synthetic-course','teeSelection',jsonb_build_object('day1','middle'),'dailyHandicaps',jsonb_build_object('day1',jsonb_build_object('p1',0,'p2',0,'p3',0,'p4',0)),'groupSetup',jsonb_build_object('day1',jsonb_build_object('groups',jsonb_build_array(jsonb_build_array('p1','p2','p3','p4')))),'_scoreAcceptanceCourses',jsonb_build_array(course));
 if not golf_safe_private.gross_agree(plan,'p1',1,1,'P','6') then raise exception 'Stableford pickup equivalence failed';end if;
 if golf_safe_private.gross_agree(plan,'p1',1,1,'P','5') then raise exception 'A scoring bogey must not equal pickup';end if;
 if not golf_safe_private.gross_agree(plan,'p1',1,1,'6','7') then raise exception 'Zero-point equivalence differs from the client';end if;
 if golf_safe_private.gross_agree(plan||'{"competitions":["single","scratch"]}','p1',1,1,'P','6') then raise exception 'Scratch requires literal gross agreement';end if;
 if golf_safe_private.gross_agree(plan||'{"competitions":["single","eclectic"]}','p1',1,1,'P','6') then raise exception 'Eclectic policy was changed unintentionally';end if;
 if not golf_safe_private.gross_agree(plan||'{"competitions":["single","scratch"],"competitionDays":{"scratch":[2]}}','p1',1,1,'P','6') then raise exception 'Daily competition scope ignored';end if;
 if golf_safe_private.gross_agree(plan-'_scoreAcceptanceCourses','p1',1,1,'P','6') then raise exception 'Missing trusted card must fail closed';end if;
 if not golf_safe_private.gross_agree(plan||'{"dailyHandicaps":{"day1":{"p1":-4}}}','p1',1,18,'P','5') then raise exception 'Plus handicap at easy hole failed';end if;
 if golf_safe_private.gross_agree(plan||'{"dailyHandicaps":{"day1":{"p1":-4}}}','p1',1,1,'P','5') then raise exception 'Plus handicap applied to wrong hole';end if;
 course=jsonb_set(course,'{teeScorecards,middle,index,0}','"1/19"');
 if not golf_safe_private.gross_agree(plan||jsonb_build_object('_scoreAcceptanceCourses',jsonb_build_array(course),'dailyHandicaps','{"day1":{"p1":40}}'::jsonb),'p1',1,1,'P','9') then raise exception 'Dual index above 36 failed';end if;
 course=jsonb_set(course,'{womenTeeData}',jsonb_build_object('teeScorecards',jsonb_build_object('middle',jsonb_build_object('par',jsonb_build_array(5),'index',jsonb_build_array(1)))));
 if not golf_safe_private.gross_agree(plan||jsonb_build_object('_scoreAcceptanceCourses',jsonb_build_array(course),'courseCategoryVersion',1,'gaCategories','{"p1":"women"}'::jsonb),'p1',1,1,'P','7') then raise exception 'Women course snapshot was not used';end if;
 -- Ordinary four-player marker rotation; all P/6 comparisons give zero points.
 for j in 1..4 loop
   pid='p'||j;target='p'||(j%4+1);
   select jsonb_object_agg(i::text,jsonb_build_object('self',jsonb_build_object('playerId',pid,'gross',6),'official',jsonb_build_object('playerId',target,'gross','P'))) into card from generate_series(1,18)i;
   cards=cards||jsonb_build_object(pid,card);
 end loop;
 card=cards->'p1'||'{"_meta":{"finalisedAt":"2026-11-01T10:00:00Z"}}';
 perform golf_safe_private.validate_score(card,plan,'p1',1,false);
 perform golf_safe_private.guard_player(card,cards->'p1',plan,'p1',1,cards);
 -- Genuine one-point mismatch must still block acceptance.
 cards=jsonb_set(cards,'{p4,1,official,gross}','5');rejected=false;
 begin perform golf_safe_private.guard_player(card,'{}',plan,'p1',1,cards);exception when others then rejected=true;end;
 if not rejected then raise exception 'A real score mismatch was accepted';end if;
 select jsonb_object_agg(i::text,jsonb_build_object('self',jsonb_build_object('playerId','p1','gross',4,'putts',2),'official',jsonb_build_object('playerId','p1','gross',4,'putts',2)))||'{"_meta":{"finalisedAt":"2026-11-01T10:00:00Z","fullCardEnteredByPlayer":true}}'::jsonb into full_card from generate_series(1,18)i;
 perform golf_safe_private.validate_score(full_card,plan||'{"scoringMethods":{"day1":"fullCardPlayer"}}','p1',1,false);
 perform golf_safe_private.guard_player(full_card,'{}',plan||'{"scoringMethods":{"day1":"fullCardPlayer"},"competitions":["single","teamPutts"]}','p1',1,'{}');
 rejected=false;
 begin perform golf_safe_private.validate_score(full_card,plan,'p1',1,false);exception when others then rejected=true;end;
 if not rejected then raise exception 'Client metadata bypassed the published marker method';end if;
 rejected=false;
 begin perform golf_safe_private.guard_player(full_card-'18','{}',plan||'{"scoringMethods":{"day1":"fullCardPlayer"}}','p1',1,'{}');exception when others then rejected=true;end;
 if not rejected then raise exception 'Incomplete full card accepted';end if;
 rejected=false;
 begin perform golf_safe_private.guard_player(jsonb_set(full_card,'{1,self,putts}','1'),'{}',plan||'{"scoringMethods":{"day1":"fullCardPlayer"},"competitions":["single","teamPutts"]}','p1',1,'{}');exception when others then rejected=true;end;
 if not rejected then raise exception 'Mismatched full-card putts accepted';end if;
 foreach method in array array['finalStableford','finalGross'] loop
   sample=jsonb_build_object('_finalScore',jsonb_build_object('kind',case when method='finalGross' then 'gross' else 'stableford' end,'total',case when method='finalGross' then 82 else 0 end,'putts',30,'confirmedAt','2026-11-01T10:00:00Z'));
   perform golf_safe_private.validate_score(sample,plan||jsonb_build_object('scoringMethods',jsonb_build_object('day1',method)),'p1',1,false);
   perform golf_safe_private.guard_player(sample,'{}',plan||jsonb_build_object('scoringMethods',jsonb_build_object('day1',method)),'p1',1,'{}');
   if not golf_safe_private.closed(plan,1,'p1',sample) then raise exception 'Accepted final total is not protected';end if;
 end loop;
 for sample in select value from jsonb_array_elements('[{"_finalScore":{"kind":"stableford","total":-1,"confirmedAt":"today"}},{"_finalScore":{"kind":"stableford","total":2.5,"confirmedAt":"today"}},{"_finalScore":{"kind":"stableford","total":"36","confirmedAt":"today"}},{"_finalScore":{"kind":"stableford","total":401,"confirmedAt":"today"}},{"_finalScore":{"kind":"gross","total":82,"confirmedAt":"today"}}]') loop
   rejected=false;
   begin perform golf_safe_private.validate_score(sample,plan||'{"scoringMethods":{"day1":"finalStableford"}}','p1',1,false);exception when others then rejected=true;end;
   if not rejected then raise exception 'Invalid or wrong-method total accepted: %',sample;end if;
 end loop;
 rejected=false;
 begin perform golf_safe_private.validate_score('{"_finalScore":{"kind":"stableford","total":36,"confirmedAt":"2026-11-01T10:00:00Z"}}',plan,'p1',1,false);exception when others then rejected=true;end;
 if not rejected then raise exception 'Final total bypassed hole-by-hole event method';end if;
 if has_function_privilege('authenticated','golf_safe_private.gross_agree(jsonb,text,integer,integer,text,text)','EXECUTE') or has_function_privilege('anon','golf_safe_private.competition_on(jsonb,text,integer)','EXECUTE') then raise exception 'Private acceptance helpers are publicly callable';end if;
 raise notice 'Score acceptance synthetic assertions passed';
end;
$$;
