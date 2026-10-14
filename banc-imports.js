#!/usr/bin/env node
/* ==========================================================================
   Banc NAVIGATEUR — fichiers importés hostiles (sauvegarde, profil d'équipage)
   --------------------------------------------------------------------------
   Une sauvegarde ou un profil d'ami est un fichier reçu (WhatsApp, mail…) :
   donc une ENTRÉE NON FIABLE. Ce banc importe des fichiers forgés dans un vrai
   Chromium et vérifie qu'aucun ne parvient à exécuter du script ni à rendre
   l'application inutilisable — à l'import, puis au redémarrage suivant.

   Défauts couverts (index.html) :
     DT-09  id de « Non classé » non filtré → injection d'attribut data-car="…"
     DT-10  amis / fil / défis recopiés tels quels → HTML dans le classement,
            plantage de missionsFor() sur une valeur non-tableau
   Un piège `window.__pwned` est posé par chaque charge utile : s'il est
   défini, une charge s'est exécutée.

   Usage : NODE_PATH=<node_modules avec playwright-core> node banc-imports.js
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

const PIEGE = `<img src=x onerror="window.__pwned=(window.__pwned||0)+1">`;
const res = [];
const v = (t, ok, d) => res.push({ t, ok: !!ok, d });

(async () => {
  await new Promise(r => serveur.listen(8097, r));
  const nav = await chromium.launch({
    executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox'] });
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  const URL = 'http://localhost:8097/index.html';
  const pret = () => page.waitForFunction(() => window.GMSpecs, { timeout: 15000 });
  const pwned = () => page.evaluate(() => window.__pwned || 0);
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
  const ouvrirReglages = async () => {
    await page.evaluate(() => document.querySelector('[data-tab="plus"]')?.click());
    await page.waitForTimeout(300);
    await page.evaluate(() => document.querySelector('[data-tab="settings"]')?.click());
    await page.waitForSelector('[data-act="import"]', { timeout: 5000 });
  };
  const choisirFichier = async (selecteur, contenu) => {
    const fichier = path.join(os.tmpdir(), `gm-banc-imports-${Date.now()}.json`);
    fs.writeFileSync(fichier, JSON.stringify(contenu));
    const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 5000 }), page.click(selecteur)]);
    await chooser.setFiles(fichier);
    await page.waitForTimeout(800);
    try { fs.unlinkSync(fichier); } catch {}
  };
  /* L'onglet Équipage est une sous-page de « Plus » ; son nom exact n'est pas
     un contrat, on cherche donc le bouton qui porte data-act="importprofile". */
  const ouvrirEquipage = async () => {
    await page.evaluate(() => document.querySelector('[data-tab="plus"]')?.click());
    await page.waitForTimeout(300);
    for (const t of await page.$$eval('[data-tab]', els => els.map(e => e.dataset.tab))) {
      if (await page.$('[data-act="importprofile"]')) break;
      await page.evaluate(tab => document.querySelector(`[data-tab="${tab}"]`)?.click(), t);
      await page.waitForTimeout(250);
      if (!(await page.$('[data-act="importprofile"]'))) {
        await page.evaluate(() => document.querySelector('[data-tab="plus"]')?.click());
        await page.waitForTimeout(200);
      }
    }
  };

  await page.goto(URL, { waitUntil: 'networkidle' }); await pret();

  /* 1. Sauvegarde forgée */
  const idHostile = `custom:x" data-z="1"><img src=x onerror="window.__pwned=(window.__pwned||0)+1"><b x="`;
  const idSain = 'custom:peugeot-404-banc';
  await ouvrirReglages();
  await choisirFichier('[data-act="import"]', {
    app: 'garage-manifest', version: 1,
    custom: { carId: '__customcars__', list: [
      { id: idHostile, brand: 'Pirate', model: 'Injection', yr: '2026' },
      { id: idSain,    brand: 'Peugeot', model: '404 Banc', yr: '1965' },
    ] },
    spots: [
      { carId: idHostile, at: '2026-09-01T12:00:00.000Z', photos: [], variants: [] },
      { carId: idSain,    at: '2026-09-01T12:00:00.000Z', photos: [], variants: [] },
    ],
    meta: {
      bonus: 'Infinity',
      missions: { '2026-09-29': 'pas un tableau', 'x': [PIEGE, 3] },
      friends: [
        { name: 'Bob', score: PIEGE, count: PIEGE, ts: 'n\'importe quoi', rank: PIEGE, legends: 'pas un tableau' },
        { name: '', score: 10 },
        'pas un objet',
      ],
      feed: [{ who: PIEGE, id: 'n-existe-pas', at: '2026-09-01' }],
    },
  });
  let db = await parId();
  const custom = db['__customcars__'];
  const meta = db['__meta__'];
  v('DT-09 · id hostile de « Non classé » rejeté à l\'import', !(custom?.list || []).some(c => c.id === idHostile), JSON.stringify(custom?.list?.map(c => c.id)));
  v('DT-09 · id sain de « Non classé » conservé', (custom?.list || []).some(c => c.id === idSain));
  v('DT-09 · aucune prise enregistrée sous l\'id hostile', !db[idHostile]);
  v('DT-10 · ami sans nom ou non-objet écarté', meta?.friends?.length === 1, JSON.stringify(meta?.friends));
  v('DT-10 · score et nombre de voitures ramenés à des entiers', meta?.friends?.[0]?.score === 0 && meta?.friends?.[0]?.count === 0);
  v('DT-10 · défi non-tableau écarté, défi mixte filtré', !('2026-09-29' in (meta?.missions || {})) && JSON.stringify(meta?.missions?.x) === JSON.stringify([PIEGE]));
  v('DT-10 · bonus « Infinity » ramené à une valeur finie', Number.isFinite(meta?.bonus));
  v('DT-10 · fil d\'activité vers une voiture inconnue écarté', (meta?.feed || []).length === 0);

  await ouvrirEquipage();
  v('aucune charge exécutée après import + onglet Équipage', (await pwned()) === 0, await pwned());

  /* 2. Profil d'équipage forgé */
  if (await page.$('[data-act="importprofile"]')) {
    await choisirFichier('[data-act="importprofile"]', {
      app: 'garage-manifest', type: 'profile', v: 1, name: 'Alice', ts: '2026-09-28T10:00:00.000Z',
      score: PIEGE, count: '12', rank: PIEGE, legends: [{ id: 'ferrari-f40', at: '2026-09-01T00:00:00.000Z' }, { id: 'n-existe-pas' }, null],
    });
    db = await parId();
    const alice = (db['__meta__']?.friends || []).find(f => f.name === 'Alice');
    v('profil · ami importé avec score entier', alice && alice.score === 0 && alice.count === 12, JSON.stringify(alice));
    v('profil · légendes inconnues ou nulles écartées', alice && alice.legends.every(l => typeof l.id === 'string'), JSON.stringify(alice?.legends));
    v('profil · aucune charge exécutée', (await pwned()) === 0);
  } else {
    v('profil · bouton d\'import de profil introuvable', false, 'data-act="importprofile" absent');
  }

  /* 3. Données hostiles DÉJÀ persistées (antérieures au correctif) → assainies au démarrage */
  await idb('put', [
    { carId: '__customcars__', list: [{ id: idHostile, brand: 'Pirate', model: 'Injection' }, { id: idSain, brand: 'Peugeot', model: '404 Banc' }] },
    { carId: '__meta__', bonus: 5, missions: { a: 'pas un tableau' }, friends: [{ name: 'Eve', score: PIEGE, count: PIEGE }], feed: [], name: 'Moi' },
    { carId: idHostile, at: '2026-09-01T12:00:00.000Z', photos: [], variants: [] },
  ]);
  await page.reload({ waitUntil: 'networkidle' }); await pret(); await page.waitForTimeout(500);
  const avantRendu = await page.evaluate(() => document.querySelectorAll('[data-z]').length);
  v('démarrage · aucun attribut injecté dans le DOM', avantRendu === 0, avantRendu);
  await ouvrirEquipage();
  v('démarrage · aucune charge exécutée (grille + Équipage)', (await pwned()) === 0, await pwned());
  v('démarrage · missionsFor() ne plante plus sur un défi non-tableau', !errs.some(e => /push|includes|is not a function/.test(e)), errs.join(' | '));

  /* 4. Contrat DOM data-car-id : une « Non classé » homonyme d'une voiture du
        catalogue ne reçoit pas sa fiche technique (greffer() résolvait par titre). */
  const idHomonyme = 'custom:ferrari-f40-banc';
  await idb('put', [
    { carId: '__customcars__', list: [{ id: idHomonyme, brand: 'Ferrari', model: 'F40', yr: '', c: '🏳️', cat: 'Non classé', r: 'commun', custom: true }] },
    { carId: idHomonyme, at: '2026-09-01T12:00:00.000Z', coords: null, loc: '', note: '', photos: [], cover: 0, variants: [], favorite: false },
    { carId: 'ferrari-f40', at: '2026-09-01T12:00:00.000Z', coords: null, loc: '', note: '', photos: [], cover: 0, variants: [], favorite: false },
  ]);
  await page.reload({ waitUntil: 'networkidle' }); await pret(); await page.waitForTimeout(500);
  const ouvrir = async (id) => {
    await page.evaluate(() => document.querySelector('#overlay [data-close],#overlay .scrim')?.click());
    await page.waitForTimeout(200);
    await page.evaluate(() => document.querySelector('[data-tab="garage"],[data-tab="collection"],[data-tab="home"]')?.click());
    await page.waitForTimeout(200);
    await page.evaluate((i) => { const q = document.getElementById('q'); if (q) { q.value = 'F40'; q.dispatchEvent(new Event('input', { bubbles: true })); } }, id);
    await page.waitForTimeout(400);
    const trouve = await page.evaluate((i) => { const b = document.querySelector(`[data-car="${CSS.escape(i)}"]`); if (b) b.click(); return !!b; }, id);
    await page.waitForTimeout(900);
    return trouve && page.evaluate((i) => ({
      shell: document.querySelector('#overlay [data-car-id]')?.dataset.carId || null,
      fiche: !!document.querySelector('#overlay .gsp'),
    }), id);
  };
  const vraie = await ouvrir('ferrari-f40');
  v('data-car-id · la vraie F40 porte son id et reçoit sa fiche', vraie && vraie.shell === 'ferrari-f40' && vraie.fiche, JSON.stringify(vraie));
  const homonyme = await ouvrir(idHomonyme);
  v('data-car-id · la « Non classé » homonyme ne reçoit AUCUNE fiche', homonyme && homonyme.shell === idHomonyme && !homonyme.fiche, JSON.stringify(homonyme));

  /* 5. Taille des imports : vérifiée AVANT lecture, et photos plafonnées. */
  await page.reload({ waitUntil: 'networkidle' }); await pret(); await page.waitForTimeout(400);   // referme la fiche ouverte au test 4
  await ouvrirEquipage();
  if (await page.$('[data-act="importprofile"]')) {
    const avant = (await parId())['__meta__']?.friends?.length || 0;
    await choisirFichier('[data-act="importprofile"]', {
      app: 'garage-manifest', type: 'profile', v: 1, name: 'Lourd', score: 1, count: 1, legends: [],
      bourrage: 'x'.repeat(1.2 * 1024 * 1024) });
    const toastTxt = await page.evaluate(() => document.getElementById('toast')?.textContent || '');
    const apres = (await parId())['__meta__']?.friends?.length || 0;
    v('taille · profil de plus de 1 Mo refusé avec un message', apres === avant && /trop lourd/i.test(toastTxt), JSON.stringify({ avant, apres, toastTxt }));
  }
  await ouvrirReglages();
  const photo = i => `data:image/jpeg;base64,${String.fromCharCode(65 + (i % 26)).repeat(4)}${i.toString(36).padStart(4, 'A').replace(/[^A-Za-z0-9]/g, 'A')}`;
  await choisirFichier('[data-act="import"]', { app: 'garage-manifest', version: 1, spots: [
    { carId: 'ferrari-f40', at: '2026-09-02T12:00:00.000Z', photos: Array.from({ length: 510 }, (_, i) => photo(i)), variants: [] } ] });
  const nbPhotos = (await parId())['ferrari-f40']?.photos?.length;
  // Borne relevée de 50 à 500 le 29/09 : 50 amputait des collections réelles (capture sans plafond).
  v('taille · 510 photos importées pour une voiture → 500 conservées (borne anti-fichier piégé)', nbPhotos === 500, nbPhotos);

  v('aucune erreur JS', errs.length === 0, errs.join(' | '));

  await nav.close(); serveur.close();
  let ko = 0;
  for (const r of res) { if (!r.ok) ko++; console.log(`  ${r.ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${r.t}${!r.ok && r.d != null ? '  → ' + r.d : ''}`); }
  console.log(`\n  ${res.length - ko} passé(s) · ${ko} échec(s)`);
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
