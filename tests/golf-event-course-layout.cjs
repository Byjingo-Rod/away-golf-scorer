const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
class Element {
 constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.events={};this.value='';this.classList={add(){},remove(){},toggle(){}};}
 append(...nodes){for(const n of nodes){this.children.push(n);n.parent=this;}}
 insertBefore(node,before){const i=this.children.indexOf(before);this.children.splice(i,0,node);node.parent=this;}
 replaceChildren(...nodes){this.children=[];this.append(...nodes);}
 setAttribute(k,v){this[k]=v;}
 addEventListener(k,fn){(this.events[k]??=[]).push(fn);}
 dispatchEvent(e){for(const fn of this.events[e.type]||[])fn(e);}
 focus(){focused=this;}
 select(){this.selected=true;}
 querySelectorAll(selector){const found=[];const match=n=>{const a=selector.match(/^\[data-(card|info)="([^"]+)"\]$/);return a?n.dataset[a[1]]===a[2]:selector==='.include-tee'?n.className==='include-tee':false;};const walk=n=>{for(const c of n.children){if(match(c))found.push(c);walk(c);}};walk(this);return found;}
 querySelector(s){return this.querySelectorAll(s)[0];}
}
let focused;const ids=new Map();const document={getElementById:id=>{if(!ids.has(id))ids.set(id,new Element('div'));return ids.get(id);},createElement:tag=>new Element(tag),createTextNode:text=>Object.assign(new Element('text'),{textContent:text})};
const context={document,URLSearchParams,location:{search:''},structuredClone,Event:class{constructor(type){this.type=type;}},window:{confirm:()=>true},console};vm.createContext(context);
let source=fs.readFileSync('products/golf-event-scorer-assets/courses.mjs','utf8').replace(/^import .*;\n/gm,'').replace(/initialise\(\)\.catch.*;\s*$/,'');source+='\nglobalThis.renderForTest=render;globalThis.readForTest=holeInputs;';vm.runInContext(source,context);
const card={par:Array(18).fill(4),index:Array.from({length:18},(_,i)=>String(i+1)),metres:Array.from({length:18},(_,i)=>300+i)};
context.renderForTest({id:'test',name:'Test',details:{teeDetails:{middle:{name:'Middle',colour:'White',slope:'130',scratch:'72'}},teeScorecards:{middle:card}}});
const panels=ids.get('teeEditors').children,mid=panels.find(p=>p.dataset.tee==='middle');const table=mid.children.find(n=>n.tag==='fieldset').children.find(n=>n.className==='table-scroll').children[0];
assert.equal(table.children[0].children[0].children.length,8);assert.equal(table.children[1].children.length,9);assert.equal(table.children[1].children[0].children[0].textContent,1);assert.equal(table.children[1].children[0].children[4].textContent,10);
assert.deepEqual(Array.from(context.readForTest(mid,'metres'),n=>+n.value),card.metres);
const grid=mid.children.find(n=>n.tag==='fieldset').children[0],totals=grid.children.map(l=>l.children[0]).filter(n=>n.className==='calculated-total');assert.equal(totals.length,2);assert(totals.every(n=>n.readOnly));assert.equal(totals[0].value,72);assert.equal(totals[1].value,card.metres.reduce((a,b)=>a+b,0));
context.readForTest(mid,'metres')[0].value=400;mid.dispatchEvent({type:'input'});assert.equal(totals[1].value,card.metres.reduce((a,b)=>a+b,0)+100);
const inputs=field=>context.readForTest(mid,field);let prevented=false;
inputs('par')[0].dispatchEvent({type:'keydown',key:'Enter',preventDefault(){prevented=true;}});assert(prevented);assert.equal(focused,inputs('index')[0]);
inputs('index')[0].dispatchEvent({type:'keydown',key:'Enter',preventDefault(){}});assert.equal(focused,inputs('metres')[0]);
inputs('metres')[8].dispatchEvent({type:'keydown',key:'Enter',preventDefault(){}});assert.equal(focused,inputs('par')[9]);
inputs('metres')[17].dispatchEvent({type:'keydown',key:'Enter',preventDefault(){}});assert.equal(focused,inputs('par')[9]);
console.log('Passed: eight columns, nine rows, holes 1/10 paired, saved hole order, Enter across fields and hole 9 to 10');
