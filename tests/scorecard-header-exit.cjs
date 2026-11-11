const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
class Element {
 constructor(){this.children=[];this.hidden=false;this.textContent='';this.style={};}
 querySelector(selector){return this.children.find(child=>'.'+child.className===selector)||null;}
 append(...children){this.children.push(...children);}
 setAttribute(){}
}
const node=new Element();let active=false,clicks=0;
const cardExit={click:()=>clicks++};
const document={getElementById:id=>id==='golfSaveHealth'?node:cardExit,
 querySelector:selector=>selector==='.page.active #exitScorecard'&&active?cardExit:null,
 createElement:()=>new Element()};
const localStorage={length:0,getItem:()=>null,setItem(){},key(){}};
const ctx={document,localStorage,console,window:{addEventListener(){}}};vm.createContext(ctx);
vm.runInContext(fs.readFileSync('safe-cloud.js','utf8'),ctx);
ctx.window.GolfSafeCloud.reportStatus('Live','event');
const exit=node.querySelector('.golfSaveHealthExit'),button=exit.children[0];
assert.equal(exit.hidden,true,'Home must not show the hidden scorecard exit');button.onclick();assert.equal(clicks,0);
active=true;ctx.window.GolfSafeCloud.reportStatus('Live','event');assert.equal(exit.hidden,false);button.onclick();assert.equal(clicks,1);
active=false;button.onclick();assert.equal(clicks,1,'Stale header tap cannot trigger a hidden card');ctx.window.GolfSafeCloud.reportStatus('Live','event');assert.equal(exit.hidden,true);
const app=fs.readFileSync('app.js','utf8');const nav=app.slice(app.indexOf('  function nav(id) {'),app.indexOf('  function showSide('));assert(nav.includes('window.GolfSafeCloud?.reportStatus(cloudMessage, store.cloud?.eventId)'));
console.log('Header Exit appears and responds only on the active scorecard; Home and page changes clear the stale action.');
