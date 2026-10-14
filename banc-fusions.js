#!/usr/bin/env node
/* ==========================================================================
   Banc NAVIGATEUR — migration des collections lors d'une fusion de doublons
   --------------------------------------------------------------------------
   Retirer un id du catalogue (GMSpecs.FUSIONS) laisse ses prises dans
   IndexedDB ; index.html ne charge au démarrage que les ids connus. Ce banc
   vérifie, dans un vrai Chromium et une vraie base IndexedDB, que ces prises
   sont rattachées à l'id conservé — sans rien perdre et sans rien doubler.

   Scénarios :
     1. prise seule sous un id retiré      → renommée, case de déclinaison cochée
     2. prises sous l'id retiré ET conservé → fusionnées (photos, note, favori)
     3. second démarrage                    → idempotent (aucune photo doublée)
     4. doublon historique (avant FUSIONS)  → prise rendue au joueur
     5. import d'une sauvegarde ancienne    → id retiré accepté et rattaché

   Usage : NODE_PATH=<node_modules avec playwright-core> node banc-fusions.js
   Préfixé `banc-` : jamais mis en cache par sw.js (HORS_CACHE).
   ========================================================================== */
'use strict';
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');

const RACINE = __dirname;
const TYPES = { '.html':'text/html', '.js':'application/javascript', '.json':'application/json',
                '.png':'image/png', '.webmanifest':'application/manifest+json' };
const serveur = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(RACINE, p);
  if (!f.startsWith(RACINE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'text/plain' });
  res.end(fs.readFileSync(f));
});

/* Trois « photos » distinctes : il faut pouvoir compter. Déclarées en
   JPEG, car l'import rejette tout autre type (PHOTO_RE, index.html). */
const PX = c => `data:image/jpeg;base64,${c.repeat(8)}`;
const [PA, PB, PC] = [PX('A'), PX('B'), PX('C')];
const prise = (carId, o = {}) => ({ carId, at: '2026-09-01T12:00:00.000Z', coords: null, loc: 'Banc',
  note: '', photos: [], cover: 0, variants: [], favorite: false, ...o });

const res = [];
const v = (t, ok, d) => res.push({ t, ok: !!ok, d });

(async () => {
  await new Promise(r => serveur.listen(8096, r));
  const nav = await chromium.launch({
    executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox'] });
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  const URL = 'http://localhost:8096/index.html';
  const pret = () => page.waitForFunction(() => window.GMSpecs && window.GMSpecs.fusionDe, { timeout: 15000 });

  const idb = (op, arg) => page.evaluate(([op, arg]) => new Promise((ok, ko) => {
    const rq = indexedDB.open('garage-manifest');
    rq.onerror = ko;
    rq.onsuccess = () => {
      const tx = rq.result.transaction('spots', op === 'all' ? 'readonly' : 'readwrite');
      const st = tx.objectStore('spots');
      if (op === 'put') { for (const r of arg) st.put(r); tx.oncomplete = () => ok(true); }
      else { const q = st.getAll(); q.onsuccess = () => ok(q.result); }
      tx.onerror = ko;
    };
  }), [op, arg]);
  const parId = async () => Object.fromEntries((await idb('all')).map(r => [r.carId, r]));

  await page.goto(URL, { waitUntil: 'networkidle' });
  await pret();

  /* Pré-conditions : la table est bien celle qu'on croit tester. */
  const f = await page.evaluate(() => [
    window.GMSpecs.fusionDe('toyota-celica-gt-four'),
    window.GMSpecs.fusionDe('porsche-718-cayman'),
    window.GMSpecs.fusionDe('bmw-serie-1'),
    window.GMSpecs.fusionDe('toyota-celica-gt4'),
  ]);
  v('fusionDe : id retiré → id conservé + déclinaison', f[0]?.vers === 'toyota-celica-gt4' && f[0]?.declinaison === 'ST185', JSON.stringify(f[0]));
  v('fusionDe : id actif → null', f[3] === null);

  /* Mise en place : l'app est démarrée, on écrit « par-dessous » comme le
     ferait une ancienne version de l'app, puis on redémarre. */
  await idb('put', [
    prise('toyota-celica-gt-four', { photos: [PA], note: 'vue au Mans', variants: [] }),
    prise('porsche-cayman',        { photos: [PA], note: 'grise', favorite: false, variants: ['987'] }),
    prise('porsche-718-cayman',    { photos: [PB, PC], note: 'bleue', favorite: true }),
    prise('bmw-serie-1',           { photos: [PC] }),
  ]);
  await page.reload({ waitUntil: 'networkidle' }); await pret();
  await page.waitForTimeout(500);
  let db = await parId();

  // 1. prise seule
  v('1 · id retiré effacé de la base', !db['toyota-celica-gt-four']);
  v('1 · prise rattachée à l\'id conservé', !!db['toyota-celica-gt4']);
  v('1 · photo et note conservées', db['toyota-celica-gt4']?.photos?.[0] === PA && db['toyota-celica-gt4']?.note === 'vue au Mans');
  v('1 · case « ST185 » cochée', db['toyota-celica-gt4']?.variants?.includes('ST185'), JSON.stringify(db['toyota-celica-gt4']?.variants));

  // 2. fusion de deux prises
  const cay = db['porsche-cayman'];
  v('2 · id retiré effacé de la base', !db['porsche-718-cayman']);
  v('2 · les trois photos réunies, dans l\'ordre, sans doublon', JSON.stringify(cay?.photos) === JSON.stringify([PA, PB, PC]), cay?.photos?.length);
  v('2 · la prise conservée garde sa couverture et sa date', cay?.cover === 0 && cay?.at === '2026-09-01T12:00:00.000Z');
  v('2 · les deux notes conservées', cay?.note === 'grise\nbleue', JSON.stringify(cay?.note));
  v('2 · favori conservé (OU logique)', cay?.favorite === true);
  v('2 · déclinaisons réunies (987 + 718 (982))', cay?.variants?.includes('987') && cay?.variants?.includes('718 (982)'), JSON.stringify(cay?.variants));

  // 4. doublon historique
  v('4 · doublon historique rendu au joueur (bmw-serie-1 → bmw-serie1)', !db['bmw-serie-1'] && db['bmw-serie1']?.photos?.[0] === PC);

  // Visible dans l'app, pas seulement en base
  await page.evaluate(() => document.querySelector('[data-car="toyota-celica-gt4"]')?.click());
  await page.waitForTimeout(900);
  const vue = await page.evaluate(() => ({
    verrou: !!document.querySelector('#overlay [data-verrou]'),
    decl: [...document.querySelectorAll('#overlay .vchip.have')].map(e => e.textContent.trim()),
  }));
  v('1 · la GT-Four s\'ouvre comme spottée (pas de verrou)', !vue.verrou);
  v('1 · la case ST185 s\'affiche comme obtenue', vue.decl.includes('ST185'), JSON.stringify(vue.decl));
  await page.evaluate(() => document.querySelector('#overlay [data-close],#overlay .scrim')?.click());

  // 3. idempotence
  await page.reload({ waitUntil: 'networkidle' }); await pret(); await page.waitForTimeout(500);
  db = await parId();
  v('3 · second démarrage : aucune photo doublée', db['porsche-cayman']?.photos?.length === 3 && db['toyota-celica-gt4']?.photos?.length === 1);
  v('3 · second démarrage : note non doublée', db['porsche-cayman']?.note === 'grise\nbleue');

  // 5. import d'une sauvegarde qui contient un id retiré
  const fichier = path.join(os.tmpdir(), 'gm-banc-fusions.json');
  fs.writeFileSync(fichier, JSON.stringify({ app: 'garage-manifest', version: 1, spots: [
    prise('ford-shelby-gt500', { photos: [PB], note: 'sauvegarde' }),
  ] }));
  // Réglages est une sous-page du menu « Plus » : deux clics.
  await page.evaluate(() => document.querySelector('[data-tab="plus"]')?.click());
  await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector('[data-tab="settings"]')?.click());
  await page.waitForSelector('[data-act="import"]', { timeout: 5000 });
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 5000 }),
    page.click('[data-act="import"]'),
  ]);
  await chooser.setFiles(fichier);
  await page.waitForTimeout(800);
  db = await parId();
  v('5 · import : id retiré accepté et rattaché (→ ford-mustang-shelby)', !db['ford-shelby-gt500'] && db['ford-mustang-shelby']?.photos?.[0] === PB);

  v('aucune erreur JS', errs.length === 0, errs.join(' | '));

  await nav.close(); serveur.close(); try { fs.unlinkSync(fichier); } catch {}
  let ko = 0;
  for (const r of res) { if (!r.ok) ko++; console.log(`  ${r.ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${r.t}${!r.ok && r.d != null ? '  → ' + r.d : ''}`); }
  console.log(`\n  ${res.length - ko} passé(s) · ${ko} échec(s)`);
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
