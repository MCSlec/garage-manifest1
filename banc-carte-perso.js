#!/usr/bin/env node
/* ==========================================================================
   Banc NAVIGATEUR — la carte « à nous » (PMTiles sur notre stockage)
   --------------------------------------------------------------------------
   Quand CARTE_URL est renseignée (index.html), la carte doit être lue sur
   NOTRE serveur, et sur lui seul : plus aucune requête vers OpenStreetMap,
   même si notre serveur tombe.

   Pour le prouver sans réseau, le banc FABRIQUE une vraie carte PMTiles v3
   (spécification : github.com/protomaps/PMTiles/blob/main/spec/v3/spec.md) :
   une tuile vectorielle MVT encodée à la main — une moitié « eau », une
   moitié « terre » — répétée de z0 à z15 par une seule entrée de répertoire
   (run-length). Elle est servie par un petit serveur sur une AUTRE origine,
   avec requêtes Range et CORS, exactement comme le fera le stockage R2.

   Vérifié :
     · configuré   : protomaps-leaflet vient du dépôt ; la carte est lue par
                     morceaux (Range) sur notre serveur ; elle est DESSINÉE
                     (eau et terre de couleurs différentes) ; attribution
                     OpenStreetMap affichée (licence ODbL) ; aucune requête
                     vers un autre domaine ;
     · serveur HS  : toujours aucune requête vers OpenStreetMap (pas de repli
                     silencieux vers un tiers), aucune erreur JS ;
     · non configuré : comportement historique (tuiles OSM), protomaps-leaflet
                     n'est même pas chargé.
   Usage : NODE_PATH=<node_modules avec playwright-core> node banc-carte-perso.js
   ========================================================================== */
'use strict';
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');
const RACINE = __dirname;
const PORT_APP = 8105, PORT_CARTE = 8104;
const URL_APP = `http://localhost:${PORT_APP}/index.html`;
const URL_CARTE = `http://127.0.0.1:${PORT_CARTE}/carte.pmtiles`;   // autre origine, comme R2

/* ---- Encodage protobuf minimal ------------------------------------------ */
const varint = (n, o) => { while (n > 127) { o.push((n % 128) | 128); n = Math.floor(n / 128); } o.push(n); return o; };
const zz = (n) => (n << 1) ^ (n >> 31);
const cle = (champ, type) => varint(champ * 8 + type, []);
const enVarint = (champ, val) => [...cle(champ, 0), ...varint(val, [])];
const enOctets = (champ, octets) => [...cle(champ, 2), ...varint(octets.length, []), ...octets];
const enTexte = (champ, t) => enOctets(champ, [...Buffer.from(t, 'utf8')]);
const enPacked = (champ, nombres) => enOctets(champ, nombres.reduce((o, n) => varint(n, o), []));

/* Rectangle (x0,y0)-(x1,y1), sens horaire à l'écran = anneau extérieur (spéc. MVT). */
function rectangle(x0, y0, x1, y1) {
  const pts = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const g = [1 | (1 << 3)]; let cx = 0, cy = 0;
  const pousser = ([x, y]) => { g.push(zz(x - cx), zz(y - cy)); cx = x; cy = y; };
  pousser(pts[0]); g.push(2 | (3 << 3)); pts.slice(1).forEach(pousser); g.push(7 | (1 << 3));
  return g;
}
function couche(nom, kind, geometrie) {
  const entite = [...enVarint(1, 1), ...enPacked(2, [0, 0]), ...enVarint(3, 3), ...enPacked(4, geometrie)];
  return [...enVarint(15, 2), ...enTexte(1, nom), ...enOctets(2, entite), ...enTexte(3, 'kind'),
          ...enOctets(4, enTexte(1, kind)), ...enVarint(5, 4096)];
}
function tuileMVT() {
  return Buffer.from([...enOctets(3, couche('earth', 'earth', rectangle(2048, 0, 4096, 4096))),
                      ...enOctets(3, couche('water', 'ocean', rectangle(0, 0, 2048, 4096)))]);
}

/* ---- Archive PMTiles v3 -------------------------------------------------- */
function archivePMTiles() {
  const ZMAX = 15;
  const nbTuiles = (4 ** (ZMAX + 1) - 1) / 3;   // pyramide complète z0..z15 : ids 0..n-1 contigus
  const tuile = tuileMVT();
  // Répertoire racine : UNE entrée, id 0, répétée nbTuiles fois (run-length), décalage 0.
  const repertoire = Buffer.from([...varint(1, []), ...varint(0, []), ...varint(nbTuiles, []),
                                  ...varint(tuile.length, []), ...varint(0 + 1, [])]);
  const meta = Buffer.from(JSON.stringify({ name: 'banc', attribution: '© OpenStreetMap',
    vector_layers: [{ id: 'earth', fields: {} }, { id: 'water', fields: {} }] }));
  const h = Buffer.alloc(127);
  h.write('PMTiles', 0, 'ascii'); h.writeUInt8(3, 7);
  const racine = 127, metaO = racine + repertoire.length, donnees = metaO + meta.length;
  const u64 = (pos, n) => h.writeBigUInt64LE(BigInt(n), pos);
  u64(8, racine); u64(16, repertoire.length); u64(24, metaO); u64(32, meta.length);
  u64(40, 0); u64(48, 0); u64(56, donnees); u64(64, tuile.length);
  u64(72, nbTuiles); u64(80, 1); u64(88, 1);
  h.writeUInt8(1, 96);          // regroupé (clustered)
  h.writeUInt8(1, 97);          // compression interne : aucune
  h.writeUInt8(1, 98);          // compression des tuiles : aucune
  h.writeUInt8(1, 99);          // type : MVT
  h.writeUInt8(0, 100); h.writeUInt8(ZMAX, 101);
  h.writeInt32LE(-180e7, 102); h.writeInt32LE(-85e7, 106); h.writeInt32LE(180e7, 110); h.writeInt32LE(85e7, 114);
  h.writeUInt8(5, 118); h.writeInt32LE(Math.round(2.35e7), 119); h.writeInt32LE(Math.round(48.85e7), 123);
  return Buffer.concat([h, repertoire, meta, tuile]);
}

/* ---- Serveurs ------------------------------------------------------------ */
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const app = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(RACINE, p);
  if (!f.startsWith(RACINE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'text/plain' }); res.end(fs.readFileSync(f));
});
const ARCHIVE = archivePMTiles();
const requetesCarte = [];
/* Même contrat que le bucket R2 configuré (cloud/CARTE.md) : Range + CORS limité à l'app. */
const carte = http.createServer((req, res) => {
  const cors = { 'Access-Control-Allow-Origin': `http://localhost:${PORT_APP}`, 'Access-Control-Allow-Headers': 'Range, If-Match',
                 'Access-Control-Expose-Headers': 'ETag, Content-Range, Content-Length', 'Vary': 'Origin' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  requetesCarte.push({ url: req.url, range: req.headers.range || null });
  if (req.url.split('?')[0] !== '/carte.pmtiles') { res.writeHead(404, cors); return res.end(); }
  const m = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
  if (!m) { res.writeHead(200, { ...cors, 'Content-Length': ARCHIVE.length, ETag: '"banc"' }); return res.end(ARCHIVE); }
  const debut = Number(m[1]), fin = Math.min(m[2] ? Number(m[2]) : ARCHIVE.length - 1, ARCHIVE.length - 1);
  const morceau = ARCHIVE.subarray(debut, fin + 1);
  res.writeHead(206, { ...cors, 'Content-Range': `bytes ${debut}-${fin}/${ARCHIVE.length}`, 'Content-Length': morceau.length, ETag: '"banc"' });
  res.end(morceau);
});

const res = []; const v = (t, ok, d) => res.push({ t, ok: !!ok, d });
(async () => {
  await new Promise(r => app.listen(PORT_APP, r)); await new Promise(r => carte.listen(PORT_CARTE, '127.0.0.1', r));
  const nav = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

  async function ouvrirCarte(urlCarte, { moteurCasse = false } = {}) {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    if (urlCarte !== undefined) await ctx.addInitScript(u => { window.GM_CARTE_URL = u; }, urlCarte);
    const externes = [];
    // Tout ce qui ne vise ni l'app ni NOTRE serveur de carte est noté puis coupé : le banc ne sort jamais.
    await ctx.route('**/*', (route) => {
      const u = new URL(route.request().url());
      if (u.host === `localhost:${PORT_APP}` || u.host === `127.0.0.1:${PORT_CARTE}`) return route.continue();
      externes.push(u.hostname); return route.abort();
    });
    // Moteur qui se CHARGE (onload) mais plante à l'exécution : protomapsL n'existe jamais.
    if (moteurCasse) await ctx.route('**/vendor/protomaps-leaflet/protomaps-leaflet.js',
      r => r.fulfill({ status: 200, contentType: 'application/javascript', body: 'throw new Error("moteur cassé (banc)");' }));
    const page = await ctx.newPage();
    const erreurs = []; page.on('pageerror', e => erreurs.push(String(e)));
    await page.goto(URL_APP, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.GMSpecs, { timeout: 15000 });
    await page.evaluate(() => new Promise((ok, ko) => { const rq = indexedDB.open('garage-manifest'); rq.onsuccess = () => { const tx = rq.result.transaction('spots', 'readwrite');
      tx.objectStore('spots').put({ carId: 'ferrari-f40', at: new Date().toISOString(), coords: { lat: 48.85, lng: 2.35 }, photos: [], variants: [], loc: 'Paris', note: '', cover: 0, favorite: false });
      tx.oncomplete = ok; tx.onerror = ko; }; rq.onerror = ko; }));
    await page.reload({ waitUntil: 'networkidle' }); await page.waitForFunction(() => window.GMSpecs, { timeout: 15000 });
    await page.evaluate(() => document.querySelector('[data-tab="map"]')?.click()); await page.waitForTimeout(300);
    if (!(await page.$('#huntMap'))) { await page.evaluate(() => document.querySelector('[data-tab="plus"]')?.click()); await page.waitForTimeout(300); await page.evaluate(() => document.querySelector('[data-tab="map"]')?.click()); }
    await page.waitForSelector('#huntMap.leaflet-container', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2500);
    return { ctx, page, externes, erreurs };
  }
  /* Couleurs réellement peintes dans les tuiles-canevas de la carte. */
  const couleursPeintes = (page) => page.evaluate(() => {
    const vues = new Set();
    for (const c of document.querySelectorAll('#huntMap .leaflet-tile-pane canvas')) {
      if (!c.width || !c.height) continue;
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      for (let i = 0; i < d.length; i += 4 * 97) if (d[i + 3] > 0) vues.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
    }
    return [...vues];
  });

  /* 1. Configurée : notre carte, et elle seule */
  const A = await ouvrirCarte(URL_CARTE);
  const infoA = await A.page.evaluate(() => ({
    pm: !!window.protomapsL, src: [...document.querySelectorAll('script[src*="protomaps"]')].map(s => s.src),
    points: document.querySelectorAll('#huntMap path.leaflet-interactive').length,
    attribution: document.querySelector('#huntMap .leaflet-control-attribution')?.textContent || '' }));
  v('configurée : protomaps-leaflet chargé depuis le dépôt (vendor/)', infoA.pm && infoA.src.length === 1 && infoA.src[0].includes('/vendor/protomaps-leaflet/'), JSON.stringify(infoA.src));
  v('la carte est lue sur NOTRE serveur, par morceaux (requêtes Range)', requetesCarte.length > 0 && requetesCarte.every(r => /^bytes=\d+-\d+$/.test(r.range || '')), JSON.stringify(requetesCarte.slice(0, 3)));
  const couleurs = await couleursPeintes(A.page);
  v('la carte est dessinée : eau et terre, deux couleurs distinctes au moins', couleurs.length >= 2, JSON.stringify(couleurs.slice(0, 6)));
  v('le point de la prise est dessiné par-dessus', infoA.points === 1, infoA.points);
  v('attribution OpenStreetMap affichée (licence ODbL des données)', infoA.attribution.includes('OpenStreetMap'), infoA.attribution);
  v('aucune requête vers un autre domaine (OpenStreetMap compris)', A.externes.length === 0, JSON.stringify([...new Set(A.externes)]));
  v('aucune erreur JS', A.erreurs.length === 0, A.erreurs.join(' | '));
  await A.ctx.close();

  /* 2. Notre serveur de carte ne répond pas : pas de repli vers un tiers */
  const B = await ouvrirCarte(`http://127.0.0.1:${PORT_CARTE}/absente.pmtiles`);
  v('carte introuvable : toujours aucune requête vers OpenStreetMap ni ailleurs', B.externes.length === 0, JSON.stringify([...new Set(B.externes)]));
  v('… et l\'app reste debout (le point de la prise est là)', (await B.page.evaluate(() => document.querySelectorAll('#huntMap path.leaflet-interactive').length)) === 1);
  await B.ctx.close();

  /* 2 bis. Moteur de carte chargé mais en panne (défaut n°1 de /code-review) */
  const D = await ouvrirCarte(URL_CARTE, { moteurCasse: true });
  const infoD = await D.page.evaluate(() => ({ texte: document.querySelector('#huntMap')?.textContent || '', tuiles: document.querySelectorAll('#huntMap .leaflet-tile').length }));
  v('moteur en panne : aucune requête vers OpenStreetMap ni ailleurs (pas de repli silencieux)', D.externes.length === 0, JSON.stringify([...new Set(D.externes)]));
  v('… et un message « Carte indisponible » à la place', /Carte indisponible/.test(infoD.texte) && infoD.tuiles === 0, JSON.stringify(infoD));
  await D.ctx.close();

  /* 3. Non configurée : comportement historique */
  const C = await ouvrirCarte(undefined);
  const infoC = await C.page.evaluate(() => ({ pm: !!window.protomapsL, src: document.querySelectorAll('script[src*="protomaps"]').length }));
  v('non configurée : protomaps-leaflet n\'est pas chargé', !infoC.pm && infoC.src === 0);
  v('non configurée : tuiles OpenStreetMap comme avant', C.externes.length > 0 && C.externes.every(h => h.endsWith('tile.openstreetmap.org')), JSON.stringify([...new Set(C.externes)]));
  await C.ctx.close();

  await nav.close(); app.close(); carte.close();
  let ko = 0; for (const x of res) { if (!x.ok) ko++; console.log(`  ${x.ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${x.t}${!x.ok && x.d != null ? '  → ' + x.d : ''}`); }
  console.log(`\n  ${res.length - ko} passé(s) · ${ko} échec(s)`); process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
