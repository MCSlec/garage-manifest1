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
  const nav = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const page = await (await nav.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const externes = []; page.on('request', r => { const u = new URL(r.url()); if (u.hostname !== 'localhost') externes.push({ hote: u.hostname, type: r.resourceType() }); });
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  const pret = () => page.waitForFunction(() => window.GMSpecs, { timeout: 15000 });
  await page.goto('http://localhost:8101/index.html', { waitUntil: 'networkidle' }); await pret();
  /* Carte VIDE (aucune prise géolocalisée) : le fond OpenStreetMap s'affiche quand même,
     donc l'attribution est due (licence ODbL, politique d'usage des tuiles). Elle n'était
     écrite que s'il y avait au moins un point (RESTE-A-FAIRE §1, « go attribution » 20/11). */
  const ouvrirCarte = async () => {
    await page.evaluate(() => document.querySelector('[data-tab="map"]')?.click()); await page.waitForTimeout(300);
    if (!(await page.$('#huntMap'))) { await page.evaluate(() => document.querySelector('[data-tab="plus"]')?.click()); await page.waitForTimeout(300); await page.evaluate(() => document.querySelector('[data-tab="map"]')?.click()); }
    await page.waitForTimeout(1200);
  };
  await ouvrirCarte();
  const vide = await page.evaluate(() => {
    const n = document.querySelector('.map-note'); const a = n && n.querySelector('a[href="https://www.openstreetmap.org/copyright"]');
    return { texte: n ? n.textContent : null, lien: !!a, cible: a ? a.target : null };
  });
  v('carte VIDE : attribution « © OpenStreetMap » affichée, avec le lien vers la licence', /© OpenStreetMap/.test(vide.texte || '') && vide.lien && vide.cible === '_blank', JSON.stringify(vide));
  await page.evaluate(() => document.querySelector('[data-tab="collection"]')?.click()); await page.waitForTimeout(200);
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
  const avecPoint = await page.evaluate(() => { const n = document.querySelector('.map-note'); return { texte: n ? n.textContent : null, lien: !!(n && n.querySelector('a[href="https://www.openstreetmap.org/copyright"]')) }; });
  v('carte avec un point : attribution toujours là, avec le lien', /© OpenStreetMap/.test(avecPoint.texte || '') && avecPoint.lien && /1 prise géolocalisée/.test(avecPoint.texte || ''), JSON.stringify(avecPoint));
  const codeExterne = externes.filter(e => e.type === 'script' || e.type === 'stylesheet');
  v('aucun script ni style chargé depuis un autre domaine', codeExterne.length === 0, JSON.stringify(codeExterne));
  v('seules les tuiles OpenStreetMap sont externes', externes.every(e => e.hote.endsWith('tile.openstreetmap.org')), JSON.stringify([...new Set(externes.map(e => e.hote))]));
  /* Fiche ouverte DEPUIS la carte (19/11, capture du propriétaire : « la carte ne s'en va
     pas »). Les calques de Leaflet ont un z-index de 400 et le voile des fiches de 50 :
     sans contexte d'empilement propre à la carte, elle se dessinait PAR-DESSUS la fiche. */
  await page.click('#huntMap path.leaflet-interactive', { force: true }).catch(() => {});
  await page.waitForSelector('.leaflet-popup [data-car]', { timeout: 4000 }).catch(() => {});
  await page.evaluate(() => document.querySelector('.leaflet-popup [data-car]')?.click());
  await page.waitForSelector('#overlay .detail-shell', { state: 'attached', timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(400);
  const dessus = await page.evaluate(() => {
    const f = document.querySelector('#overlay .sheet') || document.querySelector('#overlay .detail-shell');
    if (!f) return 'aucune fiche ouverte';
    const r = f.getBoundingClientRect(), pts = [];
    for (const [fx, fy] of [[.5, .3], [.5, .5], [.3, .7], [.7, .85]]) {
      const x = r.left + r.width * fx, y = Math.min(innerHeight - 2, r.top + r.height * fy);
      const el = document.elementFromPoint(x, y);
      pts.push(el && el.closest('#overlay') ? 'fiche' : (el && el.closest('#huntMap') ? 'CARTE' : (el ? (el.id || el.className || el.tagName) : 'rien')));
    }
    return pts;
  });
  v('fiche ouverte depuis la carte : la fiche est au-dessus de la carte (rien de la carte ne la recouvre)',
    Array.isArray(dessus) && dessus.every(x => x === 'fiche'), JSON.stringify(dessus));
  v('aucune erreur JS', errs.length === 0, errs.join(' | '));
  await nav.close(); serveur.close();
  let ko = 0; for (const x of res) { if (!x.ok) ko++; console.log(`  ${x.ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${x.t}${!x.ok && x.d != null ? '  → ' + x.d : ''}`); }
  console.log(`\n  ${res.length - ko} passé(s) · ${ko} échec(s)`); process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
