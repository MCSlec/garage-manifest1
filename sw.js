/* Garage Manifest — service worker
   Stratégie: app-shell en cache-first (l'app tourne hors-ligne), réseau en repli.
   L'app (HTML+CSS+JS) est auto-contenue dans index.html : mettre index.html en
   cache suffit à rendre toute l'app disponible hors-ligne. Les données (photos,
   collection) vivent dans IndexedDB côté page, pas ici. */

const VERSION = "garage-v2.5.0";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon-180.png",
  "./favicon-32.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Navigations (ouverture de l'app) → renvoyer l'app-shell même hors-ligne.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("./index.html", { ignoreSearch: true }))
    );
    return;
  }

  // Même origine → cache d'abord, réseau ensuite (et on met en cache au passage).
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req, { ignoreSearch: true }).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((cache) => cache.put(req, copy)).catch(() => {});
          return res;
        }).catch(() => cached);
      })
    );
  }
});

// Permet à la page de forcer l'activation d'une nouvelle version.
self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") self.skipWaiting();
});
