import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");

assert.match(html, /Version 15\.88/);
assert.match(sw, /away-golf-v15-88/);
assert.match(app, /ambrose:\s*"Ambrose"/);
assert.match(app, /id:\s*"ambrose"/);
assert.match(app, /function renderAmbroseScoring/);
assert.match(app, /Whose drive was selected\?/);
assert.match(app, /ambroseMinimumDrives/);
assert.match(app, /ambroseScoringMode/);
assert.match(app, /Scorer Only/);
assert.match(app, /Scorer and Marker/);
assert.match(app, /name="ambroseNtpCount" value="0"/);
assert.match(app, /name="ambroseNtpCount" value="1"/);
assert.match(app, /name="ambroseNtpCount" value="2"/);
assert.match(app, /Who signed the NTP card\?/);
assert.match(app, /confirmedAt: new Date\(\)\.toISOString\(\)/);
assert.match(app, /extra NTP tee shot/);
assert.match(app, /function ambroseTeamHandicap/);
assert.match(app, /values\.reduce[\s\S]*team\.length \* 2/);
assert.match(app, /def\.type === "ambrose"/);
assert.match(css, /\.ambroseDriveChoices/);
assert.match(css, /\.ambroseFinalScore/);

console.log("Version 15.88 Ambrose regression checks passed.");
