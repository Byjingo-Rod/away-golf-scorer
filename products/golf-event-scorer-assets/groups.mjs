import {createGroupApi, validateAccountConfig} from './group-api.mjs';
const $=id=>document.getElementById(id);
let client,api,owner=false,groups=[],courses=[],selected='',editing=null,loadSerial=0,busy=false;
const privateSections=['owner','groups','approvals','setup','review','organiserHome','roster','events','eventEditor'];
function message(text,error=false){$('message').textContent=text;$('message').classList.toggle('error',error);}
function show(id,visible){$(id).hidden=!visible;}
function entry(text){const n=document.createElement('div');n.className='entry';n.textContent=text;return n;}
function button(parent,text,handler){const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=()=>action(handler);parent.append(b);}
function current(){const g=groups.find(g=>g.id===selected);if(!g)throw new Error('Choose a customer group.');return g;}
function status(g){return !g.enabled?'Suspended':({awaiting_setup:'Awaiting organiser setup',pending_review:'Awaiting owner approval',active:'Active'}[g.setup_status]||'Awaiting setup');}
function resetPrivate(){$('planningEntry').href='index.html';$('planningEntry').textContent='Back to scoring preview';privateSections.forEach(id=>show(id,false));['groupSelect','organiserList','playerList','eventList','customerList','courseOptions','courseReview','reviewSummary'].forEach(id=>$(id).replaceChildren());groups=[];courses=[];selected='';editing=null;owner=false;}
async function action(fn){if(busy)return;busy=true;const buttons=[...document.querySelectorAll('form button[type=submit],form button:not([type])')];buttons.forEach(b=>b.disabled=true);try{await fn();}catch(e){message(e.message||'Unable to save. Refresh and try again.',true);if($('setupFeedback').textContent==='Submitting setup…')$('setupFeedback').textContent=e.message||'Unable to submit. Please try again.';$('message').scrollIntoView({block:'center'});}finally{busy=false;buttons.forEach(b=>b.disabled=false);}}
function bindForm(id,fn){$(id).onsubmit=e=>{e.preventDefault();action(fn);};}
async function refresh(preferred=selected){const serial=++loadSerial;resetPrivate();const {data,error}=await client.auth.getUser();if(serial!==loadSerial)return;
 if(error||!data.user||data.user.is_anonymous){show('login',true);show('account',false);message('Sign in to access your group.');return;}
 show('login',false);show('account',true);$('signedInAs').textContent=`Signed in as ${data.user.email}`;
 const [isOwner,nextGroups,catalogue]=await Promise.all([api.isOwner(),api.groups(),api.courses()]);if(serial!==loadSerial)return;
 owner=isOwner;groups=nextGroups;courses=catalogue;$('pageTitle').textContent=owner?'Customer administration':'Organiser setup & events';show('owner',owner);show('groups',groups.length>0);
 $('groupHeading').textContent=owner?'Selected customer':'Your group';
 groups.forEach(g=>{const o=document.createElement('option');o.value=g.id;o.textContent=g.name;$('groupSelect').append(o);if(owner){const row=entry('');row.className='customer-row';const text=document.createElement('span');text.textContent=`${g.name} · ${status(g)}${g.golfer_count?` · ${g.golfer_count} golfers`:''}`;row.append(text);button(row,'View organisers & setup',async()=>{selected=g.id;$('groupSelect').value=selected;await loadGroup();$('groups').scrollIntoView({behavior:'smooth'});});$('customerList').append(row);}});
 if(owner&&!groups.length)$('customerList').textContent='No customers yet. Create your first customer group below.';
 if(!groups.length){message(owner?'Create your first customer group below.':'Your account is ready. The owner needs to approve your group access.');return;}
 preferred=preferred||new URLSearchParams(location.search).get('group');selected=groups.some(g=>g.id===preferred)?preferred:groups[0].id;$('groupSelect').value=selected;await loadGroup();
}
function checked(container){return [...$(container).querySelectorAll('input[type=checkbox]:checked')].map(n=>n.value);}
function checkRow(parent,id,text,checkedValue=false){const l=document.createElement('label');l.className='check';const box=document.createElement('input');box.type='checkbox';box.value=id;box.checked=checkedValue;const s=document.createElement('span');s.textContent=text;l.append(box,s);parent.append(l);return box;}
function courseName(id){return courses.find(c=>c.id===id)?.name||`Unavailable course (${id})`;}
function courseDetails(parent,c){const d=document.createElement('details');d.className='courseDetails';const s=document.createElement('summary');s.textContent=`View saved details: ${c.name}`;d.append(s);
 const details=c.details||{};
 const add=text=>{const p=document.createElement('p');p.textContent=text;d.append(p);};
 for(const [key,label] of [['region','Region'],['address','Address'],['website','Website'],['clubPhone','Club phone'],['clubEmail','Club email']])if(details[key])add(`${label}: ${details[key]}`);
 for(const [tee,card] of Object.entries(details.teeScorecards||{})){
  const info=details.teeDetails?.[tee]||{};add(`${info.name||tee} tee${info.colour?` · ${info.colour}`:''} · Par ${info.par||'not recorded'} · Slope ${info.slope||'not recorded'} · Scratch ${info.scratch||'not recorded'}`);
  const wrap=document.createElement('div');wrap.className='table-scroll';const table=document.createElement('table');const caption=document.createElement('caption');caption.textContent=`${info.name||tee} scorecard`;table.append(caption);
  const head=document.createElement('tr');['Hole','Par','Index','Metres'].forEach(t=>{const th=document.createElement('th');th.scope='col';th.textContent=t;head.append(th);});table.append(head);
  for(let i=0;i<18;i++){const row=document.createElement('tr');[i+1,card.par?.[i],card.index?.[i],card.metres?.[i]].forEach(v=>{const td=document.createElement('td');td.textContent=v===undefined||v===''?'—':String(v);row.append(td);});table.append(row);}wrap.append(table);d.append(wrap);
 }
 if(!Object.keys(details.teeScorecards||{}).length)add('No saved hole-by-hole scorecard. Course details need checking before use.');
 if(details.acceptedAt)add(`Accepted details saved: ${new Date(details.acceptedAt).toLocaleString()}`);
 const confirmed=(details.versions||[]).map(v=>v.confirmedDate).filter(Boolean);add(confirmed.length?`Saved confirmation dates: ${confirmed.join(', ')}`:'No saved confirmation date. Check this course against current club information.');parent.append(d);}
function updateCount(){$('selectionCount').textContent=`(${checked('courseOptions').length} selected)`;}
function renderSetup(g){$('coursePicker').hidden=true;$('selectedCourses').replaceChildren();g.requested_course_ids.forEach(id=>$('selectedCourses').append(entry(courseName(id))));$('golferCount').value=g.golfer_count||'';$('additionalCourses').value=g.additional_courses||'';$('courseOptions').replaceChildren();
 courses.forEach(c=>{const box=checkRow($('courseOptions'),c.id,c.name,g.requested_course_ids.includes(c.id));box.onchange=updateCount;});updateCount();
 $('setupIntro').textContent=g.setup_status==='active'?'Your setup is active. Submit changes only when your group size or intended courses change.':g.setup_status==='pending_review'?'Your request is awaiting the owner’s course checks and approval. You can correct and resubmit it.':'Tell us how many golfers are in your group and which courses you intend to use.';
}
function renderReview(g){$('reviewCoursesLink').href='courses.html?group='+encodeURIComponent(g.id);$('reviewSummary').replaceChildren();$('courseReview').replaceChildren();const summary=entry(g.golfer_count?`${g.golfer_count} golfers in the group · ${g.requested_course_ids.length} selected courses`:'The organiser has not submitted a setup request yet.');$('reviewSummary').append(summary);
 if(g.submitted_at)$('reviewSummary').append(entry(`Submitted ${new Date(g.submitted_at).toLocaleString()}`));
 g.requested_course_ids.forEach(id=>{const c=courses.find(c=>c.id===id);checkRow($('courseReview'),id,`I have checked that ${courseName(id)} is up to date.`);if(c){const link=document.createElement('a');link.href='courses.html?course='+encodeURIComponent(c.id)+'&group='+encodeURIComponent(g.id);link.textContent='Edit accepted course details';$('courseReview').append(link);courseDetails($('courseReview'),c);}});
 if(g.additional_courses)$('reviewSummary').append(entry(`Additional course request: ${g.additional_courses}`));
 if(g.reviewed_at)$('reviewSummary').append(entry(`Activated ${new Date(g.reviewed_at).toLocaleString()}`));
 show('additionalCheckLabel',!!g.additional_courses);$('additionalChecked').checked=false;show('activateGroup',true);document.querySelector('#activateGroup button').hidden=!(g.enabled&&g.setup_status==='pending_review');$('courseReview').querySelectorAll('input').forEach(box=>{box.checked=g.setup_status==='active';box.disabled=g.setup_status==='active';});
}
async function loadGroup(){const serial=++loadSerial,g=current();['approvals','setup','review','organiserHome','roster','events','eventEditor'].forEach(id=>show(id,false));editing=null;['organiserList','playerList','eventList'].forEach(id=>$(id).replaceChildren());$('groupStatus').textContent=status(g);$('groupStatus').classList.toggle('active-status',g.enabled&&g.setup_status==='active');sessionStorage.setItem('gesSelectedGroup',g.id);
 if(owner){show('approvals',true);show('review',true);$('customerName').value=g.name;renderReview(g);const members=await api.organisers(g.id);if(serial!==loadSerial)return;
 if(!members.length)$('organiserList').textContent='No organisers approved yet.';
 members.forEach(m=>{const row=entry(`${m.email} · ${m.enabled?'Access approved':'Suspended'}`);button(row,m.enabled?'Suspend organiser':'Restore organiser',async()=>{await api.setOrganiserEnabled(g.id,m.user_id,!m.enabled);await refresh(g.id);});$('organiserList').append(row);});$('toggleGroup').textContent=g.enabled?'Suspend group access':'Restore group access';
 }else{show('setup',g.enabled);renderSetup(g);if(g.enabled&&g.setup_status==='active'){const [players,events]=await Promise.all([api.players(g.id),api.events(g.id)]);if(serial!==loadSerial)return;show('organiserHome',true);show('roster',true);show('events',true);
 players.forEach(p=>{const li=document.createElement('li');li.textContent=`${p.name}${p.ga===null?'':` · GA ${p.ga<0?'+'+Math.abs(p.ga):p.ga}`}${p.active?'':' · inactive'}`;$('playerList').append(li);});
 events.slice().reverse().forEach(e=>{const row=entry(`${e.name} · ${e.event_date} · ${e.field_size} players · ${e.status}`);if(e.status==='draft')button(row,'Open event planner',()=>{location.href='planner.html?group='+encodeURIComponent(g.id)+'&event='+encodeURIComponent(e.id);});$('eventList').append(row);});}}
 message(`${g.name} · ${status(g)}`);if(g.enabled&&g.setup_status==='active'){const strong=document.createElement('strong');strong.className='active-status';strong.textContent='Active';$('message').replaceChildren(document.createTextNode(g.name+' · '),strong);}$('openPlanner').href='planner.html?group='+encodeURIComponent(g.id)+'&new=1';if(!owner&&g.enabled&&g.setup_status==='active'){$('planningEntry').href=$('openPlanner').href;$('planningEntry').textContent='Create New Event';}document.querySelector('#roster a').href='roster.html?group='+encodeURIComponent(g.id);
}
async function initialise(){try{const cfg=validateAccountConfig(window.GES_ACCOUNT_CONFIG);client=window.supabase.createClient(cfg.url,cfg.key,{auth:{storageKey:'golfEventScorerGroupAuth',persistSession:true,detectSessionInUrl:true,autoRefreshToken:true}});api=createGroupApi(client);}catch(e){message(e.message,true);return;}
 bindForm('signIn',async()=>{const {error}=await client.auth.signInWithOtp({email:$('email').value.trim(),options:{emailRedirectTo:new URL('groups.html',location.href).href}});if(error)throw error;message('Check your email for the sign-in link. The owner approves organiser access separately.');});
 bindForm('createGroup',async()=>{const id=await api.createGroup($('groupName').value);$('createGroup').reset();await refresh(id);});
 bindForm('renameGroup',async()=>{const g=current();await api.renameGroup(g.id,$('customerName').value,g.setup_revision);await refresh(g.id);message('Customer identifier saved.');});
 bindForm('approve',async()=>{const g=current();await api.approveOrganiser(g.id,$('organiserEmail').value);$('approve').reset();await refresh(g.id);});
 bindForm('submitSetup',async()=>{$('setupFeedback').textContent='Submitting setup…';const g=current();await api.submitSetup(g.id,g.setup_revision,Number($('golferCount').value),checked('courseOptions'),$('additionalCourses').value);await refresh(g.id);$('setupFeedback').textContent='Setup submitted successfully. Awaiting owner approval.';$('setupFeedback').scrollIntoView({block:'center'});message('Setup submitted. Event planning will be available after the owner reviews your courses and activates the group.');});
 bindForm('activateGroup',async()=>{const g=current();await api.activateGroup(g.id,g.setup_revision,checked('courseReview'),$('additionalChecked').checked);await refresh(g.id);message('Customer activated. Approved organisers can now manage their players and event drafts.');});
 bindForm('createEvent',async()=>{await api.createEvent(selected,$('eventName').value,$('eventDate').value,Number($('fieldSize').value));$('eventName').value='';await refresh(selected);});
 bindForm('saveEvent',async()=>{if(!editing)throw new Error('Choose an event first.');await api.saveEvent({...editing,name:$('editName').value,event_date:$('editDate').value,field_size:Number($('editSize').value),planning_data:{...editing.planning_data,notes:$('editNotes').value}});await refresh(selected);message('Event draft saved.');});
 $('addGolfCourses').onclick=()=>{$('coursePicker').hidden=false;$('coursePicker').open=true;$('coursePicker').scrollIntoView({block:'center',behavior:'smooth'});};
 $('customersButton').onclick=()=>{const open=$('customerList').hidden;show('customerList',open);$('customersButton').setAttribute('aria-expanded',String(open));};
 $('cancelEdit').onclick=()=>{show('eventEditor',false);editing=null;};$('refresh').onclick=()=>action(()=>refresh());$('signOut').onclick=()=>action(async()=>{++loadSerial;resetPrivate();const {error}=await client.auth.signOut();if(error)throw error;await refresh();});
 $('groupSelect').onchange=()=>action(async()=>{selected=$('groupSelect').value;await loadGroup();});$('toggleGroup').onclick=()=>action(async()=>{const g=current();await api.setGroupEnabled(g.id,!g.enabled);await refresh(g.id);});
 client.auth.onAuthStateChange(e=>{if(e==='SIGNED_OUT'){sessionStorage.removeItem('gesSelectedGroup');++loadSerial;resetPrivate();show('account',false);show('login',true);}if(e==='SIGNED_IN')setTimeout(()=>action(()=>refresh()),0);});await refresh();if(location.hash==='#organiserHome'&&!owner&&!$('organiserHome').hidden)$('organiserHome').scrollIntoView({block:'start'});if(location.hash==='#review'&&owner)$('review').scrollIntoView({block:'start'});
}
initialise().catch(e=>message(e.message,true));
