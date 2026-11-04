const CACHE = "away-golf-v15-97-09";
const FILES = [
  "./",
  "./index.html",
  "./styles.css?v=15.97.09",
  "./supabase.js?v=15.97.09",
  "./cloud.js?v=15.97.09",
  "./data.js?v=15.97.09",
  "./course-library.js?v=15.97.09",
  "./course-categories.js?v=15.97.09",
  "./course-locations.js?v=15.97.09",
  "./catalogue-review.js?v=15.97.09",
  "./safe-cloud.js?v=15.97.09",
  "./course-layout.js?v=15.97.09",
  "./app.js?v=15.97.09",
  "./shared-positions.js?v=15.97.09",
  "./player-substitution.js?v=15.97.09",
  "./organiser-guide.js?v=15.97.09",
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
