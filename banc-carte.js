#!/usr/bin/env node
/* ==========================================================================
   Banc NAVIGATEUR — la carte n'exécute aucun code tiers
   --------------------------------------------------------------------------
   Leaflet est hébergé dans le dépôt (vendor/leaflet, v1.9.4 du registre npm)
   depuis le 29/09 : avant, il était chargé depuis cdnjs, sans contrôle
   d'intégrité — un CDN compromis aurait exécuté son code dans l'app.
   Ce banc ouvre la carte dans Chromium et vérifie que :
     · Leaflet vient du dépôt (et pas d'un CDN) ;
     · la carte s'affiche, avec le point d'une prise géolocalisée ;
     · aucun SCRIPT ni FEUILLE DE STYLE ne vient d'un autre domaine. Les tuiles
       (images) d'OpenStreetMap restent autorisées : la carte du monde ne
       s'embarque pas, et une image n'exécute rien.
   Usage : NODE_PATH=<node_modules avec playwright-core> node banc-carte.js
   ========================================================================== */
'use strict';
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');
const RACINE = __dirname;
const TYPES = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.png':'image/png', '.webmanifest':'application/manifest+json' };
const serveur = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(RACINE, p);
  if (!f.startsWith(RACINE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'text/plain' }); res.end(fs.readFileSync(f));
});
const res = []; const v = (t, ok, d) => res.push({ t, ok: !!ok, d });
(async () => {
  await new Promise(r => serveur.listen(8101, r));
  const nav = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const page = await (await nav.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const externes = []; page.on('request', r => { const u = new URL(r.url()); if (u.hostname !== 'localhost') externes.push({ hote: u.hostname, type: r.resourceType() }); });
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  const pret = () => page.waitForFunction(() => window.GMSpecs, { timeout: 15000 });
  await page.goto('http://localhost:8101/index.html', { waitUntil: 'networkidle' }); await pret();
  await page.evaluate(() => new Promise((ok, ko) => { const rq = indexedDB.open('garage-manifest'); rq.onsuccess = () => { const tx = rq.result.transaction('spots', 'readwrite');
    tx.objectStore('spots').put({ carId: 'ferrari-f40', at: new Date().toISOString(), coords: { lat: 48.85, lng: 2.35 }, photos: [], variants: [], loc: 'Paris', note: '', cover: 0, favorite: false });
    tx.oncomplete = ok; tx.onerror = ko; }; rq.onerror = ko; }));
  await page.reload({ waitUntil: 'networkidle' }); await pret();
  await page.evaluate(() => document.querySelector('[data-tab="map"]')?.click()); await page.waitForTimeout(300);
  if (!(await page.$('#huntMap'))) { await page.evaluate(() => document.querySelector('[data-tab="plus"]')?.click()); await page.waitForTimeout(300); await page.evaluate(() => document.querySelector('[data-tab="map"]')?.click()); }
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => ({ L: window.L && window.L.version,
    sources: [...document.querySelectorAll('script[src*="leaflet"],link[href*="leaflet"]')].map(e => e.src || e.href),
    carte: !!document.querySelector('#huntMap.leaflet-container, #huntMap .leaflet-container'),
    points: document.querySelectorAll('#huntMap path.leaflet-interactive').length }));
  v('Leaflet 1.9.4 chargé', r.L === '1.9.4', r.L);
  v('Leaflet vient du dépôt (vendor/leaflet), pas d\'un CDN', r.sources.length === 2 && r.sources.every(u => u.includes('/vendor/leaflet/')), JSON.stringify(r.sources));
  v('la carte s\'affiche', r.carte);
  v('le point de la prise géolocalisée est dessiné', r.points === 1, r.points);
  const codeExterne = externes.filter(e => e.type === 'script' || e.type === 'stylesheet');
  v('aucun script ni style chargé depuis un autre domaine', codeExterne.length === 0, JSON.stringify(codeExterne));
  v('seules les tuiles OpenStreetMap sont externes', externes.every(e => e.hote.endsWith('tile.openstreetmap.org')), JSON.stringify([...new Set(externes.map(e => e.hote))]));
  v('aucune erreur JS', errs.length === 0, errs.join(' | '));
  await nav.close(); serveur.close();
  let ko = 0; for (const x of res) { if (!x.ok) ko++; console.log(`  ${x.ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${x.t}${!x.ok && x.d != null ? '  → ' + x.d : ''}`); }
  console.log(`\n  ${res.length - ko} passé(s) · ${ko} échec(s)`); process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
