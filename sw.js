const CACHE = "away-golf-v15-98-00-dev4";
const FILES = [
  "./",
  "./index.html",
  "./awarded-results.js",
  "./draw-print.js",
  "./matchplay-core.js",
  "./matchplay-planning.js",
  "./matchplay-session.js",
  "./matchplay-view.js",
  "./cloud-request.js?v=15.98.00-dev4",
  "./styles.css?v=15.98.00-dev4",
  "./supabase.js?v=15.98.00-dev4",
  "./cloud.js?v=15.98.00-dev4",
  "./data.js?v=15.98.00-dev4",
  "./course-library.js?v=15.98.00-dev4",
  "./course-categories.js?v=15.98.00-dev4",
  "./course-locations.js?v=15.98.00-dev4",
  "./catalogue-review.js?v=15.98.00-dev4",
  "./safe-cloud.js?v=15.98.00-dev4",
  "./course-layout.js?v=15.98.00-dev4",
  "./test-event-purge.js?v=15.98.00-dev4",
  "./app.js?v=15.98.00-dev4",
  "./shared-positions.js?v=15.98.00-dev4",
  "./player-substitution.js?v=15.98.00-dev4",
  "./spreadsheet-import.js?v=15.98.00-dev4",
  "./organiser-guide.js?v=15.98.00-dev4",
  "./organiser-guide.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./away-golf-mascot-mini.png",
  "./assets/away-golf-mascot-finish.png",
];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "ACTIVATE_UPDATE") self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((k) =>
          Promise.all(
            k.filter((x) => x.startsWith("away-golf-") && x !== CACHE).map((x) => caches.delete(x)),
          ),
        ),
    ]),
  );
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  if(url.pathname.endsWith("/development-tests.js"))return; // Explicit testing tools are never part of an event release.
  event.respondWith((async () => {
    const release=await caches.open(CACHE);
    const saved=await release.match(event.request) || await release.match(url.href,{ignoreSearch:true});
    if(saved)return saved;
    // Never mix a new network script with this release's cached page.
    if(event.request.mode==='navigate' || /\.(?:js|mjs|css|html|json|webmanifest|png|svg|ico)$/.test(url.pathname))
      return new Response("This release file is unavailable. Close the app and reopen it online to complete the update.",{status:503,headers:{"Content-Type":"text/plain"}});
    return fetch(event.request);
  })());
});

