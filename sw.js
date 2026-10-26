const CACHE = "away-golf-v15-96-33";
const FILES = [
  "./",
  "./index.html",
  "./styles.css?v=15.96.33",
  "./supabase.js?v=15.96.33",
  "./cloud.js?v=15.96.33",
  "./data.js?v=15.96.33",
  "./course-library.js?v=15.96.33",
  "./course-categories.js?v=15.96.33",
  "./course-locations.js?v=15.96.33",
  "./catalogue-review.js?v=15.96.33",
  "./safe-cloud.js?v=15.96.33",
  "./app.js?v=15.96.33",
  "./shared-positions.js?v=15.96.33",
  "./player-substitution.js?v=15.96.33",
  "./organiser-guide.js?v=15.96.33",
  "./organiser-guide.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./away-golf-mascot-mini.png",
  "./assets/away-golf-mascot-finish.png",
];
self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    Promise.all([
      self.clients.claim(),
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
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, copy)).catch(() => {}));
    }
    return response;
  }).catch(async () => (await caches.match(event.request)) ||
    new Response("This page is not available offline. Reconnect and try again.", {status:503,headers:{"Content-Type":"text/plain"}})));
});
