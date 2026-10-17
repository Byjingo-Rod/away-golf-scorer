import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const saveStart=source.indexOf('const cardChecks = ["men","women"]');
assert(saveStart>=0,'completed-course card validation was not found');
const saveBlock=source.slice(saveStart,source.indexOf('const cardCheck =',saveStart));

assert(saveBlock.includes('GolfCourseCategories.positions(categoryCourse)'), 'save must use the selected tee positions');
assert(saveBlock.includes('.filter(tee=>activeTees.has(tee))'), 'hidden retained tee cards must be excluded from completed-course validation');
assert(!saveBlock.includes('Object.keys(GolfCourseCategories.data(c,cat).teeScorecards||{}).map'), 'save must not validate every retained tee card');

console.log('hidden retained tee-card validation test passed');
