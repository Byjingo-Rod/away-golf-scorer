/* Match Play journey and local transaction boundary. Live transport is intentionally separate. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.GolfMatchplaySession=api;})(globalThis,function(){
'use strict';
const copy=x=>structuredClone(x);
function prepareRound(M,s,key){const [round]=M.location(key),card=s.config.roundSettings?.[round];if(card){s.config.course=card.courseName;s.config.tee=card.teeLabel||card.tee||'Back Tee';if(s.config.indexSource==='club')s.config.clubIndex=card.clubIndex;}return card;}
function transaction(s,change,persist){const previous=copy(s);try{const value=change();if(persist()===false)throw Error('Not saved. Browser storage is unavailable; please try again.');return value;}catch(error){for(const k of Object.keys(s))delete s[k];Object.assign(s,previous);throw error;}}
function acknowledge(M,s,id,key,persist){const journey=M.playerJourney(s,id);if(journey.key!==key||!journey.canScore)throw Error('This player does not have an open match.');return transaction(s,()=>{prepareRound(M,s,key);s.matches[key].acknowledgements||={};s.matches[key].acknowledgements[id]=new Date().toISOString();s.matches[key].rulesAcknowledged||={};s.matches[key].rulesAcknowledged[id]=2;},persist);}
function enter(M,s,id,key,hole,own,marked,persist){if(!s.matches[key]?.acknowledgements?.[id])throw Error('Read the welcome page and press Got it before scoring.');return transaction(s,()=>{prepareRound(M,s,key);return M.recordPlayerScores(s,id,key,hole,own,marked);},persist);}
function confirm(M,s,id,key,persist){const access=M.playerJourney(s,id);if(access.key!==key||access.status!=='confirmation')throw Error('Only the two opponents may confirm this match.');return transaction(s,()=>M.confirmResult(s,key,access.players[0]===id?'a':'b'),persist);}
const STANDING_RULES=[
 'This match is played under the rules of Match Play. Enter total strokes for each hole. The app applies handicap strokes to determine the hole result.',
 'A given putt counts as one more stroke. If you have taken 3 strokes and your next putt is given then enter 4. This completes your score for the hole. It does not concede the hole.',
 'Use Concede Hole only when a player gives the whole hole to the opponent. Either player can record who conceded. The other player confirms the record on their screen. No hole scores are required.',
 'A concession is final under the Rules of Golf. Confirm concession acknowledges the app record.'
];
function standingRules(M,otherPlayer,isHandicapped=true){
 const possessive=M.handicapPossessive(otherPlayer).toLowerCase();
 const pronoun=['his','her'].includes(possessive)?possessive:'their';
 return STANDING_RULES.map((rule,index)=>index===0&&!isHandicapped?'This match is played under the rules of Match Play. Enter total strokes for each hole. Handicap strokes do not apply.':rule.replace('on their screen','on '+pronoun+' screen'));
}
function progressLabel(state){
 if(!state.played)return state.text+' · 0 holes played';
 return state.winnerId?state.text:state.text+' after '+state.played;
}
function concessionRole(M,s,id,key){const j=M.playerJourney(s,id);if(j.key!==key||!j.canScore)throw Error('You can only record or confirm a concession in your current match.');if(!s.matches[key].acknowledgements?.[id])throw Error('Read the opening rules and press Got it before scoring.');return j.players[0]===id?'a':'b';}
function requestConcession(M,s,id,key,hole,by,persist){return transaction(s,()=>{const role=concessionRole(M,s,id,key);prepareRound(M,s,key);M.requestHoleConcession(s,key,role,hole,by);},persist);}
function confirmConcession(M,s,id,key,hole,persist){return transaction(s,()=>{const role=concessionRole(M,s,id,key);prepareRound(M,s,key);M.confirmHoleConcession(s,key,role,hole);},persist);}
function nextHole(M,s,key,hole,own,marked){
 const row=s.matches[key].holes[hole],current=M.matchState(s,key);
 if(row?.pendingConcession)throw Error('The other player must confirm the concession record before moving on.');
 if(row?.concededTo)return Number(hole)+1;
 if(own==null||marked==null)throw Error('Enter both your score and your marker entry before moving on.');
 if(Number(hole)>=current.nextHole)throw Error('Waiting for the other player’s marker entry. Switch player views to enter it.');
 return Number(hole)+1;
}
function findMatch(M,s,id){return M.playerJourney(s,id);}
function welcome(M,s,id,key){prepareRound(M,s,key);const ids=M.opponents(s,key),side=ids.indexOf(id);if(side<0)throw Error('Player is not in this match.');const [round,match]=M.location(key),opponent=M.getPlayer(s,ids[1-side]),player=M.getPlayer(s,id),hcp=M.matchHandicaps(s,key);return {player,opponent,round,roundName:M.ROUNDS[round],time:M.teeTime(s,round,match),date:s.config.dates[round],course:s.config.course,tee:s.config.tee,playing:hcp.playing[side],opponentPlaying:hcp.playing[1-side],allowance:hcp.allowances[side],opponentAllowance:hcp.allowances[1-side],possessive:M.handicapPossessive(opponent)};}
function graphWindow(st,scheduled=18){
 const played=Number(st.played)||0,finished=!!st.winnerId;
 const start=finished?Math.floor(Math.max(0,played-1)/9)*9+1:Math.floor(played/9)*9+1;
 const end=start+8,turn=start>1?st.rows.find(row=>row.hole===start-1)||null:null;
 return {start,end,turn,rows:st.rows.filter(row=>row.hole>=start&&row.hole<=end),playoff:start>Number(scheduled)};
}
function holeInfo(M,s,key,hole){const card=prepareRound(M,s,key),allocation=M.holeStrokes(s,key,hole);const distance=Number(card?.metres?.[allocation.course-1]);return {...allocation,hole,dual:M.showCourseHole(s.config.scheduled,hole),par:Number(card?.par?.[allocation.course-1])||4,metres:Number.isFinite(distance)&&distance>0?Math.round(distance):null};}
return{STANDING_RULES,standingRules,progressLabel,prepareRound,transaction,acknowledge,enter,confirm,nextHole,requestConcession,confirmConcession,findMatch,welcome,holeInfo,graphWindow};
});
