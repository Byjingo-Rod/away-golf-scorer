const CACHE = "away-golf-v15-62";
const FILES = [
  "./",
  "./index.html",
  "./styles.css?v=15.62",
  "./supabase.js?v=15.62",
  "./cloud.js?v=15.62",
  "./data.js?v=15.62",
  "./app.js?v=15.62",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./assets/away-golf-mascot.png",
  "./away-golf-mascot-mini.png",
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
            k.filter((x) => x !== CACHE).map((x) => caches.delete(x)),
          ),
        ),
    ]),
  );
});
self.addEventListener("fetch", (e) => {
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        let copy = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return r;
      })
      .catch(() => caches.match(e.request)),
  );
});
