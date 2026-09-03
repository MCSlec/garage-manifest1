/* Garage Manifest — service worker
   Stratégie : app-shell en cache-first (l'app tourne hors-ligne), réseau en repli.
   L'app (HTML+CSS+JS) est auto-contenue dans index.html : mettre index.html en
   cache suffit à rendre toute l'app disponible hors-ligne. Les données (photos,
   collection) vivent dans IndexedDB côté page, pas ici.

   v13.6.0 — gm-specs.js : vague 5 (France — Peugeot, Citroën, Renault, Alpine, Matra, Bugatti).
             Le numéro DOIT être incrémenté à chaque modification d'un fichier
             mis en cache, sinon l'ancienne copie est resservie indéfiniment.
*/

const VERSION = "garage-v20.32.0";

/* ESSENTIEL : sans ces fichiers, l'app ne démarre pas hors-ligne.
   Mis en cache de façon atomique — si l'un manque, l'installation doit échouer
   bruyamment plutôt que produire une app à moitié hors-ligne. */
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
];

/* OPTIONNEL : confort (icônes) et modules complémentaires.
   Mis en cache un par un, et une absence n'empêche pas l'installation.
   C'est ce qui te permet d'ajouter ici un module AVANT de l'avoir déployé,
   sans casser le service worker entre-temps. */
const EXTRAS = [
  "./gm-specs.js",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon-180.png",
  "./favicon-32.png",
];

/* Chemins jamais mis en cache : bancs d'essai et fichiers de travail, qu'on
   veut toujours frais sans avoir à incrémenter VERSION à chaque retouche. */
const HORS_CACHE = [/\/banc[-.]/i, /\/test[-.]/i, /\/apercu[-.]/i];

/* Fichiers servis en RÉSEAU D'ABORD : on veut toujours la dernière version,
   avec le cache comme filet hors-ligne. Y mettre tout module susceptible
   d'évoluer souvent. */
const FRAIS = [/gm-[a-z0-9-]+\.js$/i, /\/sw\.js$/i];

const estHorsCache = (url) => HORS_CACHE.some((re) => re.test(url.pathname));
const estFrais     = (url) => FRAIS.some((re) => re.test(url.pathname));

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then(async (cache) => {
      // Le shell d'abord : toute erreur ici doit faire échouer l'installation.
      await cache.addAll(SHELL);
      // Les extras ensuite, individuellement et sans conséquence en cas d'échec.
      await Promise.all(
        EXTRAS.map((url) => cache.add(url).catch(() => {
          console.warn("[SW] extra non mis en cache :", url);
        }))
      );
      await self.skipWaiting();
    })
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

  let url;
  try { url = new URL(req.url); } catch { return; }

  // Navigations (ouverture de l'app) → réseau d'abord, app-shell en repli hors-ligne.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("./index.html", { ignoreSearch: true }))
    );
    return;
  }

  // Fichiers de travail : toujours le réseau, jamais le cache.
  if (url.origin === self.location.origin && estHorsCache(url)) return;

  /* Modules complémentaires → réseau d'abord, cache en repli.
     On rafraîchit le cache au passage, pour que le hors-ligne dispose
     toujours de la dernière version connue. */
  if (url.origin === self.location.origin && estFrais(url)) {
    event.respondWith(
      fetch(req).then((res) => {
        if (res && res.ok && res.type === "basic") {
          const copie = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copie)).catch(() => {});
        }
        return res;
      }).catch(() => caches.match(req, { ignoreSearch: true }))
    );
    return;
  }

  // Même origine → cache d'abord, réseau ensuite (et on met en cache au passage).
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req, { ignoreSearch: true }).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          // On ne met en cache QUE les réponses valides. Sans ce garde-fou, une
          // 404 passagère est mémorisée et resservie jusqu'au prochain VERSION.
          if (res && res.ok && res.type === "basic") {
            const copie = res.clone();
            caches.open(VERSION).then((cache) => cache.put(req, copie)).catch(() => {});
          }
          return res;
        }).catch(() => cached);
      })
    );
  }
});

// Permet à la page de forcer l'activation d'une nouvelle version.
self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting" || event.data?.type === "SKIP_WAITING") self.skipWaiting();

  /* Purge du cache des modules, à la demande. Sert de porte de sortie si un
     module reste bloqué en version ancienne : on efface sa copie sans toucher
     au shell, donc sans jamais casser le démarrage hors-ligne. */
  if (event.data?.type === "PURGE_MODULES") {
    event.waitUntil(caches.open(VERSION).then(async (c) => {
      for (const r of await c.keys()) {
        try { if (estFrais(new URL(r.url))) await c.delete(r); } catch (_) {}
      }
    }));
  }
});
