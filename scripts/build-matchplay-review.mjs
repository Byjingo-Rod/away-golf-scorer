// Build an isolated, browser-local copy of Away for owner review. No production cloud code is copied.
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const destination=path.resolve(process.argv[2]||path.join(root,'dist'));
fs.mkdirSync(destination,{recursive:true});
for(const name of fs.readdirSync(destination))fs.rmSync(path.join(destination,name),{recursive:true,force:true});
for(const name of fs.readdirSync(root)){
 if(['cloud.js','supabase.js'].includes(name))continue;
 if(/\.(js|css|png|webmanifest)$/.test(name)||['assets','icons'].includes(name))fs.cpSync(path.join(root,name),path.join(destination,name),{recursive:true});
}
let html=fs.readFileSync(path.join(root,'index.html'),'utf8');
html=html.replace('<script src="app.js', '<script src="review-course-cards.js"></script><script src="app.js');
html=html.replace('<meta charset="utf-8" />','<meta charset="utf-8" /><meta http-equiv="Content-Security-Policy" content="connect-src \'none\'; form-action \'none\'; object-src \'none\'">');
html=html.replace(/    <script src="supabase.js[^\n]+\n/,'').replace(/    <script src="cloud.js[^\n]+\n/,'    <script src="review-bootstrap.js"></script>\n');
html=html.replace('<title>Away Golf Scorer</title>','<title>Away Match Play — Development Review</title>').replace('</body>','<script src="review-controls.js"></script></body>');
fs.writeFileSync(path.join(destination,'index.html'),html);
fs.writeFileSync(path.join(destination,'review-bootstrap.js'),`window.AWAY_REVIEW_BUILD=true;
sessionStorage.setItem('awayGolfMyEventsShown1562','1');
window.AwayCloud={ensureSignedIn:async()=>{throw Error('Local development review');},client:{removeChannel:()=>{}},loadCourseLibrary:async()=>[],loadCourseLocations:async()=>[],loadWorkspace:async()=>null,ownerAccount:async()=>null,subscribe:()=>null};
`);
fs.writeFileSync(path.join(destination,'review-controls.js'),`(()=>{
const banner=document.createElement('section');banner.className='mpReviewBanner';banner.innerHTML='<h2>Away Match Play · Development Review 16</h2><p><a href="/connected-review">Open the connected scoring test</a></p><p>Use sample players to review planning, joining and scoring. Scores save in this browser. Your installed Away app and live events are separate.</p><button id="reviewHandicap" class="primary">Start 18-hole handicap sample</button><button id="reviewScratch" class="soft">Start 36-hole scratch sample</button><button id="reviewContinue" class="soft">Continue saved player review</button><details><summary>How to check this step</summary><ol><li>Start a sample, enter <b>PLAY26</b> and select Alex Andrews.</li><li>Check the welcome details and the four strokes Parker receives. Press <b>Got it</b>.</li><li>Enter both scores using − / +, or tap the grey par to record par.</li><li>Switch to Parker Price below the phone, press Got it and enter the matching scores.</li><li>Open Match Overview to check the hole result. Reload the page, select Continue saved player review and enter PLAY26 again to check saving.</li><li>To test the finish quickly, open Concede this match in either player view. For a hole concession the other player selects Confirm concession. For a match result both players must confirm before the winner progresses.</li><li>Use Back to draw to check the bracket, or Home → New Event to test the planning and qualifier import.</li></ol><p>This step tests one browser. Separate phones and real event-code permissions are not connected yet.</p></details>';
document.querySelector('header').after(banner);
document.getElementById('reviewHandicap').onclick=()=>window.AwayMatchplayReview.sample('handicapped',18);
document.getElementById('reviewScratch').onclick=()=>window.AwayMatchplayReview.sample('scratch',36);
document.getElementById('reviewContinue').onclick=()=>document.querySelector('[data-nav="scorePage"]').click();
document.getElementById('cloudHeader').textContent='Development review';
})();`);
// Assert no production backend endpoint/client was packaged.
for(const name of ['cloud.js','supabase.js'])if(fs.existsSync(path.join(destination,name)))throw Error('Production backend leaked into review');
console.log('Isolated Away review built at '+destination);
// Deterministic visual check. Separate page leaves saved review scores untouched.
fs.writeFileSync(path.join(destination,'milestone-review.html'),`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="connect-src 'none'; form-action 'none'; object-src 'none'"><title>Match Play milestone example</title><link rel="stylesheet" href="styles.css?v=15.98.00-dev16"></head><body><main style="padding:24px"><h1>Milestone example</h1><p>Sample scores only. Your saved review event is unchanged.</p><a href="./">Return to your review event</a><div id="example"></div></main><script src="matchplay-core.js?v=15.98.00-dev16"></script><script src="matchplay-session.js?v=15.98.00-dev16"></script><script src="matchplay-view.js?v=15.98.00-dev16"></script><script src="milestone-example.js?v=15.98.00-dev16"></script></body></html>`);
fs.writeFileSync(path.join(destination,'milestone-example.js'),`(()=>{const M=GolfMatchplay,s=M.sampleDivision(18);s.published=true;s.config.format='scratch';s.config.finalMode='players';for(let h=1;h<=9;h++){M.recordScores(s,'r0m0','a',h,h<=6?5:4,4);M.recordScores(s,'r0m0','b',h,4,h<=6?5:4);}GolfMatchplayView.start({host:document.getElementById('example'),event:{name:s.config.title,matchplay:{draws:{demo:s}}},grades:[{id:'demo',name:'Milestone example'}],save:()=>true,draw:()=>location.assign('./'),leaderboard:true});})();`);

fs.writeFileSync(path.join(destination,'scoring-layout-review.html'),`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Match Play phone layout review</title><link rel="stylesheet" href="styles.css?v=15.98.00-dev16"></head><body><main style="padding:16px"><h1>Phone scoring layout</h1><p>360px phone panel. Sample only. Enter PLAY26 then choose Alex Andrews.</p><a href="./">Return to review event</a><div id="example" style="width:min(100%,360px);margin:20px auto"></div></main><script src="matchplay-core.js?v=15.98.00-dev16"></script><script src="matchplay-session.js?v=15.98.00-dev16"></script><script src="matchplay-view.js?v=15.98.00-dev16"></script><script src="scoring-layout-example.js?v=15.98.00-dev16"></script></body></html>`);
fs.writeFileSync(path.join(destination,'scoring-layout-example.js'),`(()=>{const M=GolfMatchplay,s=M.sampleDivision(18);s.published=true;s.config.format='handicapped';s.config.finalMode='players';s.players.forEach((p,i)=>{p.playingHcp=i===0?-2:2;p.gender='male';});M.freezeQualifyingHandicaps(s);s.config.roundSettings=[{par:Array(18).fill(4),metres:Array(18).fill(323),courseName:'Oatlands GC',teeLabel:'Back Markers'}];GolfMatchplayView.start({host:document.getElementById('example'),event:{name:s.config.title,matchplay:{reviewCode:'PLAY26',draws:{demo:s}}},grades:[{id:'demo',name:'Phone layout sample'}],save:()=>true,draw:()=>location.assign('./')});})();`);
