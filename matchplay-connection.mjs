// Transport for the next connected build. No endpoint is enabled until server deployment is verified.
export function createMatchplayConnection({request,storage,key,onState=()=>{},onStatus=()=>{}}){
 let saved=JSON.parse(storage.getItem(key)||'{"revision":null,"queue":[]}'),busy=false,stopped=false;
 const persist=()=>storage.setItem(key,JSON.stringify(saved));
 function install(snapshot){saved.revision=snapshot.revision;saved.state=snapshot.state;persist();onState(structuredClone(snapshot));}
 async function refresh(){if(busy||stopped||saved.queue.length)return false;busy=true;try{install(await request('read'));return true;}finally{busy=false;}}
 async function flush(){
  if(busy||stopped)return;busy=true;
  try{
   while(saved.queue.length&&!stopped){
    const entry=saved.queue[0];onStatus('sending');
    // Freeze the revision before the first attempt. A lost response retries the exact same request.
    if(entry.expectedRevision==null){entry.expectedRevision=saved.revision;persist();}
    let result;
    try{result=await request('command',entry);}catch(error){onStatus(error.code==='revision_conflict'?'conflict':'pending');throw error;}
    saved.queue.shift();install(result);onStatus(saved.queue.length?'pending':'connected');
   }
  }finally{busy=false;}
 }
 return {
  refresh,flush,
  async enqueue(command){
   if(saved.revision==null)throw Error('Load the current match before entering scores.');
   const item={...command,requestId:crypto.randomUUID()};saved.queue.push(item);
   try{persist();}catch(error){saved.queue.pop();throw error;}
   onStatus('pending');await flush();
  },
  async reviewConflict(){
   if(busy)throw Error('Wait for the current request to finish.');
   // Preserve the unsent entries for display. Never silently overwrite a newer score.
   const pending=structuredClone(saved.queue),latest=await request('read');
   return {pending,latest};
  },
  async discardPendingAndReload(){
   if(busy)throw Error('Wait for the current request to finish.');
   const latest=await request('read');const previous=structuredClone(saved);
   saved.queue=[];try{install(latest);}catch(error){saved=previous;throw error;}onStatus('connected');
  },
  stop(){stopped=true;},
  get pending(){return saved.queue.length;}
 };
}
