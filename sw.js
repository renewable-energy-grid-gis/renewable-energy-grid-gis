/* Renewable Energy & Grid GIS — service worker */
const VERSION = "v2-2026-07-05";
const CACHE_STATIC = `static-${VERSION}`;
const CACHE_RUNTIME = `runtime-${VERSION}`;

const PRECACHE = [
  "/",
  "/css/main.css",
  "/css/katex.min.css",
  "/js/site.js",
  "/assets/logo.svg",
  "/assets/logo-mark.svg",
  "/assets/icons/favicon.ico",
  "/assets/icons/icon-192.png",
  "/assets/icons/icon-512.png",
  "/assets/icons/apple-touch-icon.png",
  "/manifest.webmanifest",
  "/offline.html"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_STATIC).then((cache) =>
      cache.addAll(PRECACHE).catch(() => {
        // Tolerate missing files (e.g. offline.html on first build)
      })
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_STATIC && k !== CACHE_RUNTIME)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

function isSameOrigin(url) {
  return new URL(url).origin === self.location.origin;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (!isSameOrigin(req.url)) return;

  const url = new URL(req.url);
  const accept = req.headers.get("accept") || "";

  // HTML: network-first with offline fallback
  if (req.mode === "navigate" || accept.includes("text/html")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_RUNTIME).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() =>
          caches.match(req).then((cached) => cached || caches.match("/offline.html") || caches.match("/"))
        )
    );
    return;
  }

  // CSS/JS: stale-while-revalidate
  if (/\.(css|js)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const fetchPromise = fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE_RUNTIME).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Images/fonts/icons: cache-first
  if (/\.(png|jpg|jpeg|svg|webp|ico|woff2?|ttf)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_STATIC).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }))
    );
    return;
  }
});
