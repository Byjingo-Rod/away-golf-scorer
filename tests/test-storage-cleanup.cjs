const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');

const saved={
  'test-event:score:1:jerry':{pending:{holes:[1]},acknowledged:true,savedAt:Date.now()},
  'real-event:score:1:rod':{pending:{holes:[1]},acknowledged:true,savedAt:Date.now()},
};
const localStorage={
  data:{'golfSafeSaves.v1':JSON.stringify(saved)},
  getItem(key){return Object.hasOwn(this.data,key)?this.data[key]:null;},
  setItem(key,value){this.data[key]=String(value);},
  key(index){return Object.keys(this.data)[index]??null;},
  get length(){return Object.keys(this.data).length;},
};
const window={addEventListener(){}};
vm.runInNewContext(fs.readFileSync('safe-cloud.js','utf8'),{window,localStorage,document:undefined,console,setTimeout,clearTimeout});
assert.equal(window.GolfSafeCloud.discardTestEvent('test-event'),1);
const remaining=JSON.parse(localStorage.getItem('golfSafeSaves.v1'));
assert.equal(remaining['test-event:score:1:jerry'],undefined);
assert.deepEqual(JSON.parse(JSON.stringify(remaining['real-event:score:1:rod'].pending)),{holes:[1]});
assert.equal(window.GolfSafeCloud.storageRecords().length,1);
console.log('Passed: explicit TEST cleanup removes only the named test event and preserves genuine pending scores.');
