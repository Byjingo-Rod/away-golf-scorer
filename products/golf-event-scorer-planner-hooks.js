  if (window.GES_PLANNER_CONTEXT) {
    const ctx=window.GES_PLANNER_CONTEXT;document.body.classList.add("gesOrganiser");
    store.players=ctx.players.map(p=>({...p.details,id:p.id,name:p.name,golfLink:p.details?.registration||'',ga:null,rosterActive:p.active,eventsPlayed:0}));
    store.courses=ctx.courses.map(c=>({...structuredClone(c.details),id:c.id,name:c.name,available:true}));
    store.template=null;delete store.cloud;store.cloudPlayers=[];
    store.event=ctx.event?.planning_data?.event?structuredClone(ctx.event.planning_data.event):null;
    if(ctx.event&&!store.event){openWizard();W.event.name=ctx.event.name;W.event.date=ctx.event.event_date;W.event.fieldSize=ctx.event.field_size;}
    if(ctx.liveEvent){store.cloud={role:"organiser",eventId:ctx.liveEvent.id,joinCode:ctx.liveEvent.join_code};}
    sessionStorage.setItem('golfEventScorerMyEventsShown1562','1');
    $('#newEvent').onclick=()=>{ctx.event=null;openWizard();};
    $('#saveEventDraft').onclick=async()=>{
      if(W.step===1)syncEventFields();
      if(!W.event.name)return alert('Please enter an event name before saving the draft.');
      const b=$('#saveEventDraft');b.disabled=true;
      try{saveWizardDraft();await ctx.save(structuredClone(store.event));$('#wizardShade').classList.remove('open');nav('home');alert('Event draft saved online. Open it from your group’s Event drafts on any device.');}
      catch(e){alert(e.message||'Could not save online. Your draft is still on this device. Try Save Draft again.');}
      finally{b.disabled=false;}
    };
    if(store.event)setTimeout(()=>{if(store.event.draftStep)reopenEventPlan();else nav("home");},0);
    else if(ctx.event)setTimeout(()=>{$('#wizardShade').classList.add('open');renderWizard();},0);
    else setTimeout(openWizard,0);
  }
