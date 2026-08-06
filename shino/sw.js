const CACHE_NAME = "shino-zukan-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./img/hero-shino.png",
  "./img/type-mujishino.png",
  "./img/type-eshino.png",
  "./img/type-nezumishino.png",
  "./img/type-benishino.png",
  "./img/type-neriage.png",
  "./img/piece-unohanagaki.png",
  "./img/piece-hirosawa.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  if (req.url.includes("fonts.googleapis.com") || req.url.includes("fonts.gstatic.com")) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(req);
        const fetchPromise = fetch(req)
          .then((res) => { cache.put(req, res.clone()); return res; })
          .catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  event.respondWith(
    fetch(req, { cache: "no-store" })
      .then((res) => {
        if (res.ok && res.type === "basic") {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        if (req.mode === "navigate") return caches.match("./index.html");
      })
  );
});
