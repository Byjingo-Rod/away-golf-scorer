import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = fs.readFileSync(new URL("../sw.js", import.meta.url), "utf8");

assert.match(html, /Version 15\.86\.18/);
assert.match(sw, /away-golf-v15-86-18/);
assert.match(app, /function recoverRidge2026History\(\)/);
assert.match(
  app,
  /\["Jeremy Ward", "Graeme Hennessy", "Ben Mees", "Rod Ruston"\]/,
);
assert.match(
  app,
  /\["Sam Reece", "Jerry Maher", "Ian Priest", "Maurice Melan"\]/,
);
assert.match(
  app,
  /\["Grant Lomas", "Luke Bradshaw", "Bob Valk", "David Fairweather"\]/,
);
assert.match(
  app,
  /\["Christian Fong", "Peter Rolfe", "Rob Blain", "Ross Smith"\]/,
);
assert.match(
  app,
  /if \(store\.historyRecoveries\.ridge2026\) return false/,
  "Ridge recovery must never be counted twice",
);
assert.match(
  app,
  /for \(let j = i \+ 1; j < group\.length; j\+\+\)/,
  "every pair of players in a Ridge foursome must count as played together",
);
assert.match(
  app,
  /\[group\.slice\(0, 2\), group\.slice\(2, 4\)\]/,
  "only the pictured Ridge pairs must count as 4BBB partners",
);

console.log("Version 15.86.18 regression checks passed.");
