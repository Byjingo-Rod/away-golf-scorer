import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

assert.match(html, /Version 15\.90\.3/);
assert.match(app, /function continueWorkspaceEvent/);
assert.match(app, /data-continueevent/);
assert.match(app, /Continue Event Setup/);
assert.match(app, /reopenEventPlan\(\)/);
assert.match(app, /function openPlayerListManager/);
assert.match(app, /Available Player Lists/);
assert.match(app, /Create \/ Manage Player Lists/);
assert.match(app, /Load List into Invited/);
assert.match(app, /W\.invites\.set\(String\(id\), "awaiting"\)/);
assert.match(app, /store\.playerLists/);
assert.match(css, /\.savedPlayerListTools/);
assert.match(css, /\.namedPlayerChecklist/);

console.log("Version 15.90.2 draft reopening and Player Lists checks passed.");
