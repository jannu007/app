const CACHE_NAME = "utsushi-kagami-v5";
const ASSETS = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/analyze.js",
  "./js/facetype.js",
  "./js/facetype-examples.js",
  "./js/measure.js",
  "./js/app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png",
  "./icons/favicon-16.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  // 顔ランドマークのモデル・WebAssembly は大きいので、
  // インストール時ではなく、実際に使われたときに保存する（cache-first）
  if (req.url.includes("/vendor/mediapipe/")) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return res;
      }))
    );
    return;
  }

  // Google Fonts: 手元のキャッシュを使いつつ裏で更新する
  if (req.url.includes("fonts.googleapis.com") || req.url.includes("fonts.gstatic.com")) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(req);
        const fetching = fetch(req)
          .then((res) => { if (res.ok) cache.put(req, res.clone()); return res; })
          .catch(() => cached);
        return cached || fetching;
      })
    );
    return;
  }

  // 同一オリジン: ネットワーク優先、失敗したらキャッシュ（オフラインでも起動する）
  if (new URL(req.url).origin === self.location.origin) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(req);
          if (cached) return cached;
          if (req.mode === "navigate") return caches.match("./index.html");
          return Response.error();
        })
    );
  }
});
