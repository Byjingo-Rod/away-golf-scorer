(() => {
 'use strict';
 const intro='To provide the greatest protection against data loss during play, it is recommended that each player carries a paper score card. Scores from a paper card can be entered manually using Emergency Score Recovery on the Home page. The instructions included in this list show what steps to take if a paper card is not available.';
 const discretion='If neither recorded copy settles a missing score, agree it with the player and marker. The organiser may use discretion under the group’s agreed rules and save the accepted score through organiser correction.';
 const phases=[
  {id:'planning',title:'A Guide to the Planning Phase',topics:['prepare','shared','copies','help']},
  {id:'published',title:'After Publishing but before Play',topics:['missing','join','start','hole']},
  {id:'playing',title:'During Play',topics:['phone','offline','wrong','ntp','ambrose']},
  {id:'finishing',title:'On Completion of Play before Cards are Final',topics:['check','paper','prizes','next']}
 ];
 const topics=[
  ['prepare','Plan and check the event',[
   'Check dates, players, courses, tee colours and scorecards.',
   'Set each golfer’s GA or event estimate. Review Daily Handicaps for every enabled tee and day.',
   'Check each day’s competitions, putting days, NTP holes and jackpot. Set and save groups for every day.',
   'Save your draft as you go. Complete the final check, lock the event and send its final update before play.'
  ]],
  ['shared','Two golfers share one position across different days',[
   'In Choose players, select the primary golfer’s position → Share this position across days.',
   'Choose the other golfer, enter both GAs and assign one golfer to each day → Save Shared Position.',
   'Review GA & Tee Hcps and save the groups again before publishing. Each golfer joins under their own name for their assigned days.',
   'Their scores combine for aggregate competitions and they share an aggregate prize. Daily prizes belong to the golfer who played.'
  ]],
  ['copies','Conflicting saved event information — what to do',[
   'Keep the app and its data. Open Review Saved Copies; for an Event Scorer draft, use Review Draft Saved Copies.',
   'Compare the highlighted differences with the agreed plan or recorded scores. Choose each correct value and save.',
   'Refresh affected devices. Course-card comparisons are a separate owner review.'
  ]],
  ['help','Ask the owner for help',[
   'In Event Scorer planning, tap Request Help / Event Help. Give the day, player, problem and last action that worked.',
   'Include a screenshot, device type and whether scores are waiting to upload. Keep the event available for the owner to inspect.',
   'In Away Golf, contact the event owner with the same details. Cancel an Event Scorer help request when assistance is no longer needed.'
  ]],
  ["missing", "A player pulls out", ["With no replacement available — On the Home page select the correct day in Round Progress → Missing Player. Select the withdrawn player → Apply Emergency Replacement. The app allocates a virtual player to the vacant position.", "With a replacement available — On the Home page select the replacement’s first day in Round Progress → Replace Player. Select the player being replaced and add the replacement player with the details requested → Review and Send Substitution."]],
  ["join", "A player cannot connect or needs another phone", ["Cannot Connect: Check the player has the correct six-character event code.", "Check the player has selected their own name from the Player List.", "Has Connected but cannot open the Event: Home → Connected Players → Release Phone beside the player’s name. Ask the player to enter the code again and join the event.", "Needs to change phones: Home → Connected Players → Release Phone beside the player’s name. Ask the player to enter the code and join the event on the replacement phone under their own name."]],
  ['start','Players cannot open their scorecards',[
   'Check the event and day. Confirm the event is locked and its final update has been shared.',
   'Finalise the playing tee, complete Daily Handicaps and have each golfer read the rules → GOT IT.',
   'Scoring opens 15 minutes before the first tee time. To start sooner, use Open Scoring Now in Round Progress.',
   'Refresh and check the phones receive the update.'
  ]],
  ['hole','The club changes the starting hole',[
   'Before scoring starts: Teams / Groups and Teams → correct day.',
   'For a single-tee start: New Starting Hole → choose the hole → APPLY STARTING HOLE.',
   'Confirm the phones show the new first hole. For other starts, check each group’s starting position.',
   'Starting-hole changes are blocked once scoring has begun.'
  ]],
  ["phone", "A phone dies during scoring", ["Keep the working phones scoring normally.", "Home → correct day in Round Progress → Emergency Score Recovery → Phone Failed During Play.", "Select FAILED PHONE and the app will select PLAYER TO RECOVER: they are different people.", "Use the PLAYER self score and Putts listed to complete the missing scores for the PLAYER TO RECOVER. Press Accept [number] Self-Scores as Correct. Putts apply only on days with a putting competition.", "For the failed-phone player, use the official scores recorded by their marker. Accept their completed official card when offered; use Correct One Official Hole for remaining holes.", "Check both cards are complete online."]],
  ["offline", "No reception or scores waiting to upload", ["Each player’s phone saves scores entered in the app even without an internet connection. The latest leaderboard information will be unavailable until the phone reconnects.", "If the phone loses its connection, continue scoring in the already open event scoring pages. Uploads restart automatically when reception returns, for example by connecting to Wi-Fi in the clubhouse.", "“Waiting to upload” means the online copy is behind. When reconnected, open the app and let it sync.", "Once the players’ phones have reconnected and synced, go to Home → Refresh Scores / Refresh. Check all required scores have arrived before finalising results.", "If device saving fails, keep the app open and export a backup or restore storage space. Do not clear app data or reinstall while uploads are pending."]],
  ['wrong','A score or putt count is wrong',[
   'Before acceptance, use Previous or the hole selector to correct the entry. Player and marker check and agree.',
   'For organiser correction: Home → correct day → Emergency Score Recovery → Correct One Official Hole.',
   'Choose the player and hole. Agree the entry with player and marker → Save Organiser Correction.',
   'Refresh and check completion and results. Review any prize already awarded; corrections do not redo awards automatically.'
  ]],
  ["ntp", "Record NTP or a lost Yellow Ball", ["A player whose tee shot finishes on the green may claim NTP if no name is recorded or their ball is closer than the existing marker. Move the physical NTP marker to their ball’s position and record their name.", "To follow the NTP competition on the leaderboard, the marker must confirm in the app when the player they are marking records their name on the physical NTP marker.", "The app uses the latest confirmed entry for each NTP hole. Check the final holder against the physical NTP sheet before awarding the prize.", "If nobody qualifies, leave it unwon. Check the configured jackpot in results.", "For Yellow Ball, follow the highlighted golfer. If lost, press BALL LOST and confirm. If pressed by mistake, press UNDO BALL LOST before leaving that hole.", "The Yellow Ball will no longer be highlighted on subsequent holes. Previously earned Yellow Ball points remain and other competitions continue."]],
  ['ambrose','Running an Ambrose round',[
   'Check the nominated scorer, whether a marker is required and the minimum drives per golfer.',
   'Each hole: select the team gross score and whose drive was used. If a marker is required, both cards must agree.',
   'Track drive counts and correct mistaken selections. For a three-player team’s NTP extra attempt, follow the app’s named golfer.',
   'Before finalising, check all 18 scores, selected drives and required-drive compliance.'
  ]],
  ["check", "A “finished” card still says # Holes Need Attention", ["Any holes needing attention will be highlighted in red.", "On the Round Verification screen, both columns show the same golfer’s scores, recorded separately by that golfer and their marker. Check the golfer’s name above the table because verification also covers the card they marked.", "For each hole highlighted in red, check the scores recorded by the player and their marker. Correct the difference causing the red highlight.", "Have the player and marker complete the end-of-round checks.", "If a phone cannot finish, in this instruction menu follow ‘A phone dies during scoring’ under During Play to recover both affected cards.", "Settle remaining gaps under the organiser-discretion guidance. Wait for Round Progress to show completion."]],
  ['paper','Enter results manually / Record All Scores',[
   'Home → correct day in Round Progress → Record All Scores. Check and submit each team’s entries; drafts do not affect results.',
   'Complete all team entries and NTP results → Complete Day [number] Results when enabled.',
   'For mixed phone entries or an unsupported competition such as Scratch or Eclectic, use individual Emergency Score Recovery instead. Keep the competitions as planned and ask the owner for help if needed.'
  ]],
  ['prizes','Check results, countback and prizes',[
   'Once required cards are complete, open Results Summary. Check the day, course and daily or aggregate competition.',
   '“In Progress” means scoring or checks remain unfinished. CB means countback separated equal totals.',
   'Check each winner and prize → Award Prize. Confirm Awarded. For NTP, check each hole, No Winner and the final jackpot amount.',
   'After the final day, check overall results and awards → CONFIRM RESULTS & CLOSE EVENT.'
  ]],
  ['next','Finish today and open the next day',[
   'Resolve outstanding entries and checks in Round Progress → Open Results Summary. Review results and record prizes.',
   'In Results Summary → OPEN DAY [number]. Check the next course, groups, starting positions, tees and handicaps.',
   'Players return to player view and select the new day. From a recovered card, use BACK TO PLAYER VIEW or VIEW DAY [number].',
   'Keep the event open between days; close it only after the final results and awards.'
  ]]
 ].map(([id,title,steps])=>({id,title,steps}));
 const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const keywords={phone:'battery flat dead broken marker self score official',missing:'absent no-show no show',offline:'offline internet network reception sync upload',next:'tomorrow transition next day',hole:'tee off tenth 10 starting hole',copies:'conflict duplicate review',paper:'manual all scores',shared:'bill garry shared position',substitute:'replace replacement reserve'};
 function matches(topic,query){return !query||(topic.id+' '+(keywords[topic.id]||'')+' '+topic.title+' '+topic.steps.join(' ')).toLowerCase().includes(query.toLowerCase());}
 function expandAll(host){host.querySelectorAll('[data-guide-phase], [data-guide-topic]').forEach(d=>{d.hidden=false;d.open=true;});const empty=host.querySelector('.guideEmpty');if(empty)empty.hidden=true;}
 function render(host){
  if(!document.getElementById('organiserGuideStyle')){
   const style=document.createElement('style');style.id='organiserGuideStyle';style.textContent='.organiserGuide{color:#17324d;background:#fff;font:16px/1.5 system-ui,sans-serif}.organiserGuide h2{font-size:25px;margin:0 0 8px}.guideIntro{margin:10px 0}.guideDiscretion{padding:10px 12px;background:#f4f7fa;border-left:4px solid #7d9ebd}.guideTools{display:flex;flex-wrap:wrap;gap:12px;margin:16px 0}.guideTools label{flex:1 1 220px;font-weight:650}.guideTools select,.guideTools input{display:block;box-sizing:border-box;width:100%;min-height:44px;font:inherit;margin-top:4px;padding:8px}.guideActions{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:12px 0}.organiserGuide button{min-height:44px;padding:8px 12px;font:650 15px system-ui;color:#17324d;border:1px solid #9fb7cd;border-radius:8px;background:#edf4fa;cursor:pointer}.organiserGuide details{margin:10px 0;border:1px solid #bdcede;border-radius:10px;overflow:hidden}.organiserGuide summary{cursor:pointer;padding:14px;min-height:26px;font-size:17px;font-weight:700}.guidePhase>summary{background:#dceaf7;font-size:19px}.guidePhaseBody{padding:4px 12px 12px}.guidePhaseBody details>summary{background:#f0f6fc}.organiserGuide ol{padding:0 20px 8px 38px}.organiserGuide li{margin:10px 0}.organiserGuide a{color:#174f84}.guideEmpty{font-weight:600}@media print{.guideTools,.guideActions,.guidePhaseHelp,.guideClose{display:none!important}.organiserGuide details[data-guide-topic]{break-inside:avoid}.guidePhase{break-inside:auto}.organiserGuide summary{background:#fff!important}}';document.head.append(style);
  }
  const topicHtml=id=>{const t=topics.find(t=>t.id===id);
   const section=(title,steps)=>`<h3 style="font-size:16px;padding:0 14px;margin:12px 0 0">${esc(title)}</h3><ol>${steps.map(step=>`<li>${esc(step)}</li>`).join('')}</ol>`;
   if(id==='join')return `<details data-guide-topic="${t.id}"><summary>${esc(t.title)}</summary>${section('Cannot Connect',[t.steps[0].replace('Cannot Connect: ',''),t.steps[1]])}${section('Has Connected but cannot open the Event',[t.steps[2].replace('Has Connected but cannot open the Event: ','')])}${section('Needs to change phones',[t.steps[3].replace('Needs to change phones: ','')])}</details>`;
   return `<details data-guide-topic="${t.id}"><summary>${esc(t.title)}</summary><ol>${t.steps.map(step=>`<li>${esc(step)}</li>`).join('')}</ol></details>`;};
  host.innerHTML=`<section class="organiserGuide"><h2>Organiser Instructions</h2><p class="guideIntro">${esc(intro)}</p><p class="guideDiscretion">${esc(discretion)}</p><div class="guideActions"><button type="button" id="guideReset">Show the four sections</button><button type="button" id="guideHelp">Ask for Help</button><a href="organiser-guide.html" target="_blank" rel="noopener">Open full guide / print a copy</a></div><div class="guideTools"><label for="guideTopic">Go straight to a topic<select id="guideTopic"><option value="">Choose a topic…</option>${phases.map(phase=>`<optgroup label="${esc(phase.title)}">${phase.topics.map(id=>{const t=topics.find(t=>t.id===id);return `<option value="${id}">${esc(t.title)}</option>`;}).join('')}</optgroup>`).join('')}</select></label><label for="guideSearch">Search these instructions<input id="guideSearch" type="search" placeholder="Phone, missing player, prizes…"></label></div><p class="guideEmpty" hidden>No matching topic. Try another word.</p>${phases.map(phase=>`<details class="guidePhase" data-guide-phase="${phase.id}"><summary tabindex="0">${esc(phase.title)}</summary><div class="guidePhaseBody">${phase.topics.map(topicHtml).join('')}<button class="guidePhaseHelp" type="button" data-guide-help>Ask for Help</button></div></details>`).join('')}</section>`;
  const rows=[...host.querySelectorAll('[data-guide-topic]')],sections=[...host.querySelectorAll('[data-guide-phase]')],search=host.querySelector('#guideSearch'),select=host.querySelector('#guideTopic'),empty=host.querySelector('.guideEmpty');
  function openTopic(id){search.value='';select.value=id;rows.forEach(row=>{row.hidden=false;row.open=row.dataset.guideTopic===id;});sections.forEach(section=>{section.hidden=false;section.open=phases.find(p=>p.id===section.dataset.guidePhase).topics.includes(id);});empty.hidden=true;rows.find(row=>row.open)?.scrollIntoView?.({block:'nearest'});}
  function reset(){openTopic('');sections[0]?.querySelector('summary')?.focus?.();}
  select.onchange=()=>openTopic(select.value);
  search.oninput=()=>{select.value='';const query=search.value.trim().toLowerCase();rows.forEach(row=>{row.hidden=!matches(topics.find(t=>t.id===row.dataset.guideTopic),query);row.open=Boolean(query)&&!row.hidden;});sections.forEach(section=>{const phase=phases.find(p=>p.id===section.dataset.guidePhase);section.hidden=!rows.some(row=>phase.topics.includes(row.dataset.guideTopic)&&!row.hidden);section.open=Boolean(query)&&!section.hidden;});empty.hidden=rows.some(row=>!row.hidden);};
  host.querySelector('#guideReset').onclick=reset;host.querySelector('#guideHelp').onclick=()=>openTopic('help');host.querySelectorAll('[data-guide-help]').forEach(button=>button.onclick=()=>openTopic('help'));
 }
 window.GolfOrganiserGuide={topics,phases,intro,discretion,render,matches,expandAll};
})();
