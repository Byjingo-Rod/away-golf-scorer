import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const authKey = "sb-qlxcpsbyfhgatujrqxkd-auth-token";
const values = new Map([[authKey, JSON.stringify({ access_token: "retired.jwt.token" })]]);
const localStorage = {
  get length() { return values.size; },
  key(index) { return [...values.keys()][index] ?? null; },
  getItem(key) { return values.get(key) ?? null; },
  removeItem(key) { values.delete(key); },
};

let clientsCreated = 0;
let anonymousSignIns = 0;
const clients = [];
const makeClient = () => {
  clientsCreated += 1;
  const created = {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      signInAnonymously: async () => {
        anonymousSignIns += 1;
        return { data: { session: { access_token: "new-token", user: { id: "new-user" } } }, error: null };
      },
    },
  };
  clients.push(created);
  return created;
};

const context = {
  window: { localStorage, supabase: { createClient: makeClient } },
  fetch: async (_url, options) => {
    assert.equal(options.headers.Authorization, "Bearer retired.jwt.token");
    return { status: 403 };
  },
  AbortSignal,
  atob,
  console,
};
vm.createContext(context);
vm.runInContext(fs.readFileSync("cloud.js", "utf8"), context);

const session = await context.window.AwayCloud.ensureSignedIn();
assert.equal(values.has(authKey), false, "rejected stored token should be removed");
assert.equal(clientsCreated, 2, "auth client should be recreated after stale-token removal");
assert.equal(anonymousSignIns, 1, "a replacement anonymous session should be established");
assert.equal(session.access_token, "new-token");
assert.equal(context.window.AwayCloud.client, clients[1], "public API should expose the replacement client");
console.log("Version 15.96.3 stale Supabase auth recovery checks passed");
