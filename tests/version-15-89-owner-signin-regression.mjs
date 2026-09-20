import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const cloud = readFileSync(new URL("../cloud.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");

assert.match(html, /Version 15\.90\.4/);
assert.match(sw, /away-golf-v15-90-4/);
assert.match(html, /id="ownerAccount"/);
assert.match(app, /function openOwnerAccount/);
assert.match(app, /Protect This Organiser/);
assert.match(app, /Sign In to Existing Owner Account/);
assert.match(app, /Owner Signed In ✓/);
assert.match(app, /Owner Verification Pending/);
assert.match(app, /Verification Pending/);
assert.match(app, /Send a New Verification Email/);
assert.match(app, /Draft planning remains on this PC/);
assert.match(app, /store\.cloud\?\.secondaryOrganiser/);
assert.match(cloud, /async function ownerAccount/);
assert.match(cloud, /async function protectOwnerAccount/);
assert.match(cloud, /email_confirmed_at/);
assert.match(cloud, /async function resendOwnerVerification/);
assert.match(cloud, /type: "email_change"/);
assert.match(cloud, /https:\/\/byjingo-rod\.github\.io\/away-golf-scorer\//);
assert.doesNotMatch(cloud, /emailRedirectTo: window\.location/);
assert.match(cloud, /client\.auth\.updateUser/);
assert.match(cloud, /async function sendOwnerSignInLink/);
assert.match(cloud, /shouldCreateUser: false/);
assert.match(cloud, /detectSessionInUrl: true/);
assert.doesNotMatch(cloud, /service_role|sb_secret_/i);

console.log("Version 15.89.1 Owner Sign-In regression checks passed.");
