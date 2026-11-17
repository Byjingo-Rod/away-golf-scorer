const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const file=process.argv[2]||'safe-cloud.js';
function device(){const storage=new Map(),window={};vm.runInNewContext(fs.readFileSync(file,'utf8'),{window,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},Error,JSON,Map,Set,Object,Math,Date});return window.GolfSafeCloud;}
(async()=>{
 for(const code of ['PT409','40001']){
  let revision=67,remote={1:{self:{gross:4}}},writes=0,retained=0;
  const safe=device(),api=safe.install({
   loadRound:async()=>({score_data:structuredClone(remote),revision}),
   saveRound:async(id,day,player,data,options)=>{writes++;if(options.expectedRevision!==revision)throw Object.assign(Error('Scores changed'),{code});remote=structuredClone(data);return {revision:++revision,saved_data:remote};},
   safeControl:async()=>{retained++;return {id:'review'};}
  });
  api.safeReconcileAcknowledged('event','score',remote,revision,1,'p');
  revision=70;remote[2]={self:{gross:6}};
  const receipt=await api.saveRound('event',1,'p',{1:{self:{gross:5}}});
  assert.equal(writes,2);assert.equal(receipt.saved_data[1].self.gross,5);assert.equal(receipt.saved_data[2].self.gross,6);assert.equal(api.saveHealth('event').pending,0);
  revision++;remote[1].self.gross=7;
  await assert.rejects(api.saveRound('event',1,'p',{...receipt.saved_data,1:{self:{gross:8}}}),e=>e.code==='GOLF_CONFLICT');
  assert.equal(retained,1);assert.equal(remote[1].self.gross,7);assert.equal(api.saveHealth('event').conflicts,1);
  let attempts=0;
  const busy=device().install({loadRound:async()=>({score_data:{},revision:1}),saveRound:async()=>{attempts++;throw Object.assign(Error('Still changed'),{code});}});
  await assert.rejects(busy.saveRound('busy',5,'p',{1:{self:{gross:4}}}),e=>e.code==='GOLF_BUSY');
  assert.equal(attempts,3);assert.equal(busy.saveHealth('busy').pending,1);
 }
 console.log('PT409 and legacy conflict recovery: fresh revision, independent edits, retained conflicts, bounded attempts and pending-card preservation passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
