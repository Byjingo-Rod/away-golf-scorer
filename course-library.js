/* Revision-aware course sync. Local edits remain durable until acknowledged. */
(() => {
  'use strict';
  const copy = value => JSON.parse(JSON.stringify(value));
  const normal = value => Array.isArray(value) ? value.map(normal) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().filter(k => k !== 'activeScorecardTee').map(k => [k, normal(value[k])])) : value;
  const same = (a,b) => JSON.stringify(normal(a)) === JSON.stringify(normal(b));
  class Library {
    constructor({store, api, persist, changed, online = () => navigator.onLine}) {
      Object.assign(this, {store,api,persist,changed,online});
      this.message='Connect to the cloud master course list';this.busy=false;this.allowed=false;this.flight=null;
    }
    state() {
      const store=this.store();
      store.courseLibrary ||= {bases:{},pending:{},conflicts:{},countriesPending:[]};
      const s=store.courseLibrary;s.bases ||= {};s.pending ||= {};s.conflicts ||= {};s.countriesPending ||= [];
      return s;
    }
    notify() { this.changed?.(); }
    durable() { if(this.persist()===false) throw new Error('Device storage is full. The course has not been queued safely. Export a backup before retrying.'); }
    queue(course) {
      this.state().pending[String(course.id)]=copy(course);this.durable();this.notify();
    }
    queueCountry(name) {
      if(name && !this.state().countriesPending.some(v=>v.toLowerCase()===name.toLowerCase()))this.state().countriesPending.push(name);
      this.durable();this.notify();
    }
    accept(row) {
      const store=this.store(),id=String(row.id),s=this.state();
      const i=store.courses.findIndex(c=>String(c.id)===id);
      if(i<0)store.courses.push(copy(row.data));else store.courses[i]=copy(row.data);
      s.bases[id]={revision:row.revision,data:copy(row.data)};delete s.conflicts[id];
    }
    merge(rows,countries) {
      const store=this.store(),s=this.state(),remoteIds=new Set();
      for(const row of rows) {
        const id=String(row.id);remoteIds.add(id);
        const local=store.courses.find(c=>String(c.id)===id),base=s.bases[id],pending=s.pending[id];
        if(!local){this.accept(row);continue;}
        if(same(local,row.data) && (!pending || same(pending,row.data))) {
          s.bases[id]={revision:row.revision,data:copy(row.data)};delete s.pending[id];delete s.conflicts[id];continue;
        }
        if(base && +base.revision===+row.revision)continue;
        if(base && !pending && same(local,base.data)){this.accept(row);continue;}
        s.conflicts[id]=copy(row); // Preserve both until explicitly reviewed.
      }
      for(const local of store.courses) {
        const id=String(local.id);
        if(!remoteIds.has(id) && !s.bases[id] && !local.locationRequired && !s.pending[id])s.pending[id]=copy(local);
      }
      store.courseCountries=[...new Map(['Australia',...(store.courseCountries||[]),...countries].map(v=>[v.toLowerCase(),v])).values()];
      for(const name of store.courseCountries)if(!countries.some(v=>v.toLowerCase()===name.toLowerCase()))this.queueCountry(name);
      this.durable();
    }
    async sync() {
      if(this.flight){this.rerun=true;return this.flight;}
      this.flight=this.run().finally(()=>{this.flight=null;this.busy=false;this.notify();if(this.rerun){this.rerun=false;void this.sync();}});
      return this.flight;
    }
    async run() {
      if(!this.online()){this.message='Offline — edits saved on this device; cloud sync pending';this.notify();return;}
      this.busy=true;this.message='Synchronising master courses…';this.notify();
      try {
        this.durable();
        const library=await this.api.loadCourseLibrary();this.allowed=true;
        this.merge(library.courses,library.countries);
        for(const [id,payload] of Object.entries(this.state().pending)) {
          if(this.state().conflicts[id])continue;
          try {
            const base=this.state().bases[id];
            this.durable();
            const row=await this.api.saveMasterCourse(id,payload,base?.revision??null);
            this.state().bases[id]={revision:row.revision,data:copy(row.data)};
            if(same(this.state().pending[id],payload))delete this.state().pending[id];else this.rerun=true;
            this.durable();this.notify();
          } catch(error) {
            if(error.code==='40001' || error.code==='23505') {
              const latest=await this.api.loadMasterCourse(id);if(latest)this.state().conflicts[id]=copy(latest);
              this.durable();continue;
            }
            throw error;
          }
        }
        for(const name of [...this.state().countriesPending]) {
          this.durable();await this.api.saveMasterCountry(name);
          this.state().countriesPending=this.state().countriesPending.filter(v=>v!==name);this.durable();
        }
        this.state().lastSync=new Date().toISOString();this.durable();
        const conflicts=Object.keys(this.state().conflicts).length,pending=Object.keys(this.state().pending).length;
        this.message=conflicts ? `${conflicts} course${conflicts===1?'':'s'} need review — both copies retained` : pending ? `${pending} course save${pending===1?'':'s'} pending` : 'Cloud master course list is up to date';
      } catch(error) {
        if(error.code==='42501'){this.allowed=false;this.message='Owner Sign-In or approved Organiser Tablet access is required for the cloud master list';}
        else this.message='Cloud sync pending — '+(error.message||'connection unavailable');
      }
      this.notify();
    }
    retainLocal(id) {
      const data=this.store().courses.find(c=>String(c.id)===String(id));if(!data)return;
      this.state().retainedLocal ||= [];this.state().retainedLocal.push({id,savedAt:new Date().toISOString(),data:copy(data)});this.durable();
    }
    resolve(id,choice) {
      const s=this.state(),row=s.conflicts[id];if(!row)return;
      if(choice==='cloud') {this.retainLocal(id);delete s.pending[id];this.accept(row);}
      else {
        s.bases[id]={revision:row.revision,data:copy(row.data)};
        s.pending[id]=copy(this.store().courses.find(c=>String(c.id)===String(id)));delete s.conflicts[id];
      }
      this.durable();this.notify();
    }
    status(id) {
      const s=this.state();if(s.conflicts[id])return 'Review two copies';if(s.pending[id])return 'Cloud save pending';
      const base=s.bases[id],local=this.store().courses.find(c=>String(c.id)===String(id));
      if(base && local && !same(local,base.data))return 'Device changes — save Course Details to share';
      return base ? 'Cloud revision '+base.revision : 'On this device';
    }
  }
  const exported={Library,same};
  if(typeof module!=='undefined' && module.exports)module.exports=exported;
  else window.AwayCourseLibrary=exported;
})();
