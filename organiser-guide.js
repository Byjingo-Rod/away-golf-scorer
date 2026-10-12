(() => {
  'use strict';
  const topics = [
    ['phone','A phone dies during scoring',[
      'Continue on paper. Record gross strokes for every remaining hole and putts if putting is being played that day. Keep the scores already entered on the phones.',
      'On the organiser’s Home page, select the correct day in Round Progress. Tap Emergency Score Recovery → Phone Failed During Play.',
      'Select the player whose phone failed. Check the two names shown: the failed phone and the player whose official card it was marking. They are different people.',
      'Compare the available self-scores with the paper card. Fill any missing score or required putts. Tap Accept [number] Self-Scores as Correct and confirm.',
      'If the option to also accept the failed-phone player’s completed official card appears, check that card before accepting it. If that official card is incomplete, it still needs to be completed from the paper card.',
      'Check that the recovery has saved online and Round Progress shows the affected players complete. A charged phone can then reconnect and move on normally. Recovery does not invent missing scores.'
    ]],
    ['substitute','A real player substitutes for another player',[
      'On the organiser’s Home page, choose the substitute’s first day in Round Progress and tap Replace Player. Use this for a real substitute; Missing Player assigns virtual scores.',
      'Choose the player being replaced and select an existing substitute or enter their name and Golf ID / GolfLink Number. No Official Handicap is also accepted. Enter the substitute’s GA and handicap category.',
      'Review the calculated Daily Handicaps for every affected course and tee. Confirm Review and Send Substitution. The substitute takes the same groups, partnerships, tees, cap team and starting positions.',
      'Earlier cards and handicaps remain unchanged. The outgoing player’s scores and the substitute’s scores count together as one entry for aggregate competitions. Daily results identify the golfer who played. If the substitution is made before Day 1 scorecards open, the event shows only the substitute’s name. Once Day 1 has opened, aggregate results retain both names.',
      'Wait for online confirmation. The outgoing player’s phone connection is released. The substitute joins using the existing event code under their own name. Ask all players to receive the revised final update before play.',
      'Earlier rounds must be complete and scoring must not have started in any affected round. A position involved in a virtual-player replacement is blocked. If sending fails, keep the substitute off the app and tap Retry Substitute Update after restoring the connection.'
    ]],
    ['missing','A player does not turn up',[
      'Do this before the absent player’s group enters its first score. Select the correct day in Round Progress and tap Missing Player.',
      'Choose the absent player. Check the affected partner, the proposed virtual player and any NTP extra attempts shown.',
      'Tap Apply Emergency Replacement. Check that the change has reached the players’ phones before they start.',
      'The remaining three players mark each other. The selected virtual player stays in their own group; their scores supply the missing multiplayer contribution automatically.',
      'This requires a four-player group and an unused eligible virtual player outside that group. One group of four has no outside donor. The app blocks a replacement after that group starts scoring or when a replacement has already been applied for the day. Contact the event owner if the replacement cannot be made.'
    ]],
    ['offline','No reception or scores waiting to upload',[
      'Continue scoring in the app already open on the phone. Scores are saved on the device and uploads retry when a connection returns. If the app cannot open, use a paper card.',
      'Read the save-status strip. “Waiting to upload” means the online copy is not yet up to date. Keep the app installed and keep its data.',
      'When reception returns, open the app and allow it to sync. The organiser can use Refresh Scores or Refresh to check what has arrived.',
      'Before completing results, check every card is complete online. If a device-save warning appears, keep the app open and export a backup or restore storage space. Do not clear app data or reinstall while scores are waiting to upload.'
    ]],
    ['start','Players cannot open their scorecards',[
      'Check the correct event and day are open. Confirm the event is locked and its final update has been shared online.',
      'Check the playing tee is finalised and every player has a Daily Handicap. Ask each player to read the rules and tap GOT IT.',
      'Scoring normally opens 15 minutes before the first tee time. If play needs to begin sooner, use Open Scoring Now in Round Progress when that button is available.',
      'Refresh the organiser’s view and check the phone receives the update. Use one normal tap; a harder press is not required.'
    ]],
    ['hole','The club changes the starting hole',[
      'Before anyone begins scoring, open Teams / Groups and Teams and select the correct day.',
      'For a single-tee start, find the Starting Hole panel, choose New Starting Hole and tap APPLY STARTING HOLE.',
      'Check the shared update and ask players to confirm the first hole on their phones. For other starting arrangements, review each group’s starting position in the draw.',
      'The app prevents a starting-hole change once scoring has begun. Do not change earlier scores to make the card appear to start somewhere else.'
    ]],
    ['wrong','A score or putt count is wrong',[
      'Before the card is accepted, go back using Previous or the hole selector and correct the entry. The player and marker must check and agree.',
      'For an official card requiring organiser correction, select the correct day in Round Progress → Emergency Score Recovery → Correct a Player’s Card.',
      'Select the player and check the signed paper card. Correct the required holes or missing putts, then save the organiser corrections.',
      'Refresh and check card completion and results. Corrections are recorded. If prizes were already awarded, review those awards yourself; a correction does not automatically redo prize giving.'
    ]],
    ['check','A finished card still says Attention or In Progress',[
      'Ask the player and marker to complete the end-of-round card check. All required gross scores and putts must be entered and agree.',
      'Open the checking screen and examine the highlighted holes. Correct the actual error rather than copying a value simply to remove the warning.',
      'The checks can cover both the player’s own card and the card they marked: up to 36 hole checks for two 18-hole cards.',
      'Use Emergency Score Recovery only when normal phone completion is not possible. Wait for Round Progress to confirm completion before awarding the affected competition.'
    ]],
    ['next','Finish today and open the next day',[
      'Check Round Progress for the current day. Resolve missing entries and discrepancies until all required cards are complete.',
      'Tap Open Results Summary. Review daily results and progressive competitions, then record the day’s prizes.',
      'In Results Summary, tap OPEN DAY [number] when offered. Check that day’s course, groups, starting positions, playing tees and handicaps before opening scoring.',
      'Players return to their player view and choose the new day. From an accepted recovered card, use BACK TO PLAYER VIEW or VIEW DAY [number] when offered.',
      'Keep the event open between days. Use CONFIRM RESULTS & CLOSE EVENT only after the final day and all final results and prizes have been checked.'
    ]],
    ['prizes','Daily results, countback and prizes',[
      'Open Results Summary and choose the appropriate day or overall competition. Check the course and day in the heading.',
      '“In Progress” means required scoring or checks are unfinished. CB means countback has separated equal totals. Check the selected full-event or best-rounds format for aggregate competitions.',
      'Tap Award Prize only after checking the winner and the configured prize. Confirm the row shows Awarded.',
      'For NTP, check each recorded hole and any No Winner result. A jackpot follows the event’s planned setting; check the final prize shown before giving out balls or money.',
      'After the final day, review the overall results and awards, then tap CONFIRM RESULTS & CLOSE EVENT. Do not close a multi-day trip after its first day.'
    ]],
    ['ntp','Record NTP or a lost Yellow Ball',[
      'On a planned NTP hole, record each qualifying nearer attempt with the correct player. Confirm the NTP entry before moving on. Several players may record attempts; review the final holder for that hole.',
      'If nobody qualifies, leave it unwon. Do not create a name or score to force a winner. Check the configured jackpot in the results.',
      'On a Yellow Ball day, use the highlighted player to identify whose turn it is. If the ball is lost, record the loss on that hole using the Lost Ball control and check the confirmation.',
      'After loss, later holes do not contribute to the Yellow Ball total. Other competitions continue. If the wrong loss was recorded, correct it before finalising the card.'
    ]],
    ['ambrose','Running an Ambrose round',[
      'Before play, check each team’s nominated scorer and whether a marker is required. Confirm the planned minimum drives per player.',
      'On every hole, select the team’s gross score and the player whose drive was used. If a marker is included, both cards must agree.',
      'Monitor each player’s drive count during the round. Correct a mistaken drive selection using the scoring controls.',
      'A three-player team’s NTP extra attempt is assigned by the app. Follow the named player for that hole. Do not borrow a fourth player’s individual score for the Ambrose team card.',
      'At the end, check all 18 scores, selected drives and required-drive compliance before finalising.'
    ]],
    ['paper','Using paper cards / Record All Scores',[
      'Keep signed paper cards with gross strokes for each hole and required putts. Record NTP results and any Yellow Ball loss as well.',
      'For a day being scored on paper, select the correct day in Round Progress → Record All Scores. Enter one signed team card at a time, check it and submit it. Draft entries do not affect results.',
      'Complete all team cards and NTP results, then use Complete Day [number] Results when enabled. Review the leaderboards before awarding prizes.',
      'This bulk entry route does not support every competition, including Scratch and Eclectic. If the app reports an unsupported competition, keep the competition and use the appropriate individual-card recovery method with the owner’s help. Do not remove an underway competition just to enter paper results.',
      'If phones have already entered scores, use Emergency Score Recovery for the affected cards rather than replacing that team’s phone entries with a paper-summary card.'
    ]],
    ['join','A player cannot connect or needs another phone',[
      'Give the player this event’s six-character join code. They open the player joining page, enter the code and select their own name.',
      'Check Connected Players on the organiser’s Home page. A phone in player mode cannot recover organiser access using that code.',
      'If the player needs a replacement phone, first check all available scores have reached the organiser. Keep a paper record of any unsent holes.',
      'Release Phone is available beside that player’s connection. Release that individual phone only when required, then have the replacement phone join as the same player.',
      'Release All Phones affects everyone. Use it only for an intentional whole-field reconnection, not for one troublesome phone. Releasing a connection does not recreate scores that never uploaded.'
    ]],
    ['prepare','Before departure and before each round',[
      'Open and update the apps while you have reliable internet. Charge the tablet and phones, take a power bank and carry paper cards.',
      'Check the event name, dates, player list, approved courses, tee colours and scorecards. Golf ID / GolfLink numbers or No Official Handicap must be recorded for players as required.',
      'Review GA handicaps before the event begins scoring. For No Official Handicap players, set the proposed handicap against a course and tee in planning and check the calculated event estimate.',
      'Check competitions for each day, including putting days, NTP holes and jackpot settings. Check the draw and save or lock teams for every day.',
      'Publish the final locked event and share its final update. Ask players to join in advance and confirm their names. Each morning check the course’s actual starting arrangements and the day’s playing tees.',
      'Keep organiser sign-in details and the event code available. If you are using another organiser device, open the saved online event through organiser access rather than joining as a player.'
    ]],
    ['copies','Saved copies need organiser review',[
      'Keep the app and its data. This message means two devices changed the same information and the app retained both copies.',
      'The organiser opens Review Saved Copies. In Event Scorer draft planning, use Review Draft Saved Copies.',
      'Compare every highlighted difference with the correct plan or signed card. Choose the correct value for each field and save the reviewed copy.',
      'Refresh the affected devices and confirm they show the chosen information. Do not delete a whole event to remove a conflict. Course-card comparisons are a separate owner review.'
    ]],
    ['help','Ask the owner for help',[
      'For Golf Event Scorer, use Request Help / Event Help in the event planner. Describe the issue, the day, the player and the last action that worked.',
      'Include a clear screenshot if you can. State which device you are using and whether its scores are still waiting to upload.',
      'The help request lets the owner inspect the event information associated with that request. Keep the event available while the issue is examined; use Cancel help request if assistance is no longer needed.',
      'For Away Golf, contact your event owner with the same details. On the course, keep a paper card so play can continue while the issue is investigated.'
    ]]
  ].map(([id,title,steps])=>({id,title,steps}));
  const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function render(host) {
    if(!document.getElementById('organiserGuideStyle')){
      const style=document.createElement('style');style.id='organiserGuideStyle';style.textContent='.organiserGuide{color:#17324d;background:#fff;font:17px/1.55 system-ui,sans-serif}.organiserGuide h2{font-size:25px;margin:0 0 8px}.guideTools{display:flex;flex-wrap:wrap;gap:12px;margin:18px 0}.guideTools label{flex:1 1 220px;font-weight:650}.guideTools select,.guideTools input{display:block;box-sizing:border-box;width:100%;min-height:48px;font:inherit;margin-top:4px;padding:8px}.organiserGuide details{margin:10px 0;border:1px solid #bdcede;border-radius:10px;overflow:hidden}.organiserGuide summary{cursor:pointer;padding:14px;background:#e9f2fa;font-size:18px;font-weight:700;min-height:28px}.organiserGuide ol{padding:0 28px 8px 46px}.organiserGuide li{margin:12px 0}.organiserGuide a{color:#174f84}.guideIntro{margin:10px 0}.guideEmpty{font-weight:600}@media print{.guideTools,.guidePrint,.guideClose{display:none!important}.organiserGuide details{break-inside:avoid}.organiserGuide summary{background:#fff}}';document.head.append(style);
    }
    host.innerHTML=`<section class="organiserGuide"><h2>Organiser Instructions</h2><p class="guideIntro">Choose a topic or tap a heading to open its instructions. On a multi-day trip, always select the correct day before making a change.</p><div class="guideTools"><label for="guideTopic">Go straight to a topic<select id="guideTopic"><option value="">Choose a topic…</option>${topics.map(t=>`<option value="${t.id}">${esc(t.title)}</option>`).join('')}</select></label><label for="guideSearch">Search these instructions<input id="guideSearch" type="search" placeholder="Phone, missing player, prizes…"></label></div><p class="guidePrint"><a href="organiser-guide.html" target="_blank" rel="noopener">Open full guide / print a copy</a></p><p class="guideEmpty" hidden>No matching topic. Try another word.</p>${topics.map(t=>`<details data-guide-topic="${t.id}"><summary>${esc(t.title)}</summary><ol>${t.steps.map(s=>`<li>${esc(s)}</li>`).join('')}</ol></details>`).join('')}</section>`;
    const details=[...host.querySelectorAll('details')],search=host.querySelector('#guideSearch'),select=host.querySelector('#guideTopic');
    select.onchange=()=>{search.value='';details.forEach(d=>{d.hidden=false;d.open=d.dataset.guideTopic===select.value;});host.querySelector('.guideEmpty').hidden=true;details.find(d=>d.open)?.scrollIntoView?.({block:'nearest'});};
    search.oninput=()=>{select.value='';const query=search.value.trim().toLowerCase();details.forEach((d,i)=>{d.hidden=!matches(topics[i],query);d.open=!!query&&!d.hidden;});host.querySelector('.guideEmpty').hidden=details.some(d=>!d.hidden);};
  }
  const keywords={phone:'battery flat dead broken',missing:'absent no-show no show',offline:'offline internet network reception sync upload',next:'tomorrow transition next day',hole:'tee off tenth 10 starting hole',copies:'conflict duplicate review',paper:'manual all scores'};
  function matches(topic,query){return !query||(topic.id+' '+(keywords[topic.id]||'')+' '+topic.title+' '+topic.steps.join(' ')).toLowerCase().includes(query.toLowerCase());}
  window.GolfOrganiserGuide={topics,render,matches};
})();
