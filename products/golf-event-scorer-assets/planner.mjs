import {createGroupApi,validateAccountConfig} from './group-api.mjs';
const params=new URLSearchParams(location.search),cfg=validateAccountConfig(window.GES_ACCOUNT_CONFIG);
const client=window.supabase.createClient(cfg.url,cfg.key,{auth:{storageKey:'golfEventScorerGroupAuth',persistSession:true,detectSessionInUrl:false,autoRefreshToken:true}}),api=createGroupApi(client);
const banner=document.getElementById('plannerAccount');
try{
 const {data,error}=await client.auth.getUser();if(error||!data.user||data.user.is_anonymous)throw new Error('Sign in through Groups & Organiser Accounts first.');
 const groups=await api.groups(),id=params.get('group')||sessionStorage.getItem('gesSelectedGroup'),group=groups.find(g=>g.id===id);
 if(!group?.enabled||group.setup_status!=='active')throw new Error('The owner must activate this group before event planning.');
 const [players,courses,events]=await Promise.all([api.players(group.id),api.courses(),api.events(group.id)]);
 const event=params.get('event')?events.find(e=>e.id===params.get('event')):null;
 if(params.get('event')&&!event)throw new Error('This event is not available for this group.');
 if(event&&event.status!=='draft')throw new Error('This event is read-only.');
 const approved=courses.filter(c=>group.requested_course_ids.includes(c.id));if(!approved.length)throw new Error('No courses have been approved for this group.');
 let saveQueue=Promise.resolve(),autoTimer;
 const context={group,players,courses:approved,event,newEvent:params.has('new'),save:async plan=>{
   if(plan.fieldSize>group.golfer_count)throw new Error('Your approved limit is '+group.golfer_count+' golfers.');
   if(!plan.name?.trim()||!plan.date)throw new Error('Enter the event name and start date before saving.');
   if(!group.requested_course_ids.includes(plan.course1)||(plan.days===2&&!group.requested_course_ids.includes(plan.course2)))throw new Error('Choose an approved course.');
   if(!context.event){const eventId=await api.createEvent(group.id,plan.name,plan.date,plan.fieldSize);context.event=(await api.events(group.id)).find(e=>e.id===eventId);if(!context.event)throw new Error('Draft created, but could not load it. Return to your event list.');}
   const revision=await api.saveEvent({...context.event,name:plan.name,event_date:plan.date,field_size:plan.fieldSize,planning_data:{...context.event.planning_data,event:plan,courseSnapshots:approved.map(c=>({id:c.id,name:c.name,details:c.details,updated_at:c.updated_at}))}});
   const fresh=(await api.events(group.id)).find(e=>e.id===context.event.id);context.event={...context.event,...fresh,revision,planning_data:{...context.event.planning_data,event:structuredClone(plan)}};
   const url=new URL(location.href);url.searchParams.delete('new');url.searchParams.set('event',context.event.id);history.replaceState(null,'',url);
 }};
 const savePlan=context.save;
 context.save=plan=>{const task=saveQueue.then(()=>savePlan(structuredClone(plan)));saveQueue=task.catch(()=>{});return task;};
 context.autoSave=plan=>{clearTimeout(autoTimer);const snapshot=structuredClone(plan);autoTimer=setTimeout(()=>context.save(snapshot).catch(e=>{banner.textContent='Online save did not complete: '+e.message;banner.classList.add('error');}),700);};
 const liveRows=await window.AwayCloud.loadRecentOwnedEvents(100);context.liveEvent=context.event?liveRows.find(e=>e.draft_id===context.event.id):null;
 window.GES_PLANNER_CONTEXT=context;
 banner.replaceChildren();const title=document.createElement('strong');title.textContent=group.name+' · Active';banner.append(title,document.createTextNode(' — Event Planning'));
 document.querySelectorAll('.planner-back').forEach(link=>link.href='groups.html?group='+encodeURIComponent(group.id)+'#organiserHome');
 await import('./app.js');
}catch(error){banner.textContent=error.message||'Unable to load your group. Refresh and try again.';banner.classList.add('error');document.getElementById('app').hidden=true;}
