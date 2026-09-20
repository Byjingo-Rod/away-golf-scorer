import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

assert.match(html, /Version 15\.90\.4/);
assert.match(html, /id="saveEventDraft"[^>]*>Save Draft</);
assert.doesNotMatch(html, /Save Draft &amp; Delegate/);
assert.match(app, /function saveWizardDraft\(\)/);
assert.match(app, /draftStep: W\.step/);
assert.match(app, /setupStage: "draft"/);
assert.match(app, /e\.draftStep \|\| 6/);
assert.match(app, /Save an event draft first/);
assert.match(app, /store\.event\.setupStage = "delegated-draft"/);
assert.match(styles, /grid-template-columns: 1fr 1fr 1fr 1fr/);

console.log("Version 15.90.2 Save Draft regression checks passed.");
