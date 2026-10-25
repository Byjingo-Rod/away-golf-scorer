import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

assert.match(html,/Version 15\.96\.23/);
assert.match(app,/const EVENT_TEES = \["back", "middle", "front", "tee4", "tee5"\]/);
assert.match(app,/function enabledEventTeesForCategory/);
assert.match(app,/Choose .*tee positions \(Max 3\)/);
assert.match(app,/Calculate Hcps/);
assert.match(app,/Save \$\{activeCategory==="women"\?"Women's":"Men's"\} Hcps/);
assert.match(app,/teeSelectionByCategory/);
assert.match(app,/selectedEventTee\(day,store\.event,category\)/);
assert.match(app,/eventCourseScorecard\(day, event = store\.event, id = null\)[\s\S]*selectedEventTee\(day,event,category\)/);

console.log('mixed category tee regression test passed');
