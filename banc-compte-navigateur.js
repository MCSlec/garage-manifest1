#!/usr/bin/env node
/* ==========================================================================
   Banc NAVIGATEUR — comptes et sauvegarde cloud, de bout en bout
   --------------------------------------------------------------------------
   Fait tourner le VRAI Worker (cloud/compte-worker.js) dans Node, avec D1
   simulé par SQLite et R2 en mémoire, et DEUX navigateurs isolés qui jouent
   deux téléphones. L'e-mail (Resend) est intercepté : on lit le code reçu.

   Parcours vérifié :
     1. téléphone A : demande un code, se trompe, le saisit, sauvegarde (collection + photos)
     2. téléphone B (vide) : se connecte, récupère → même garage, mêmes photos
     3. conflit : B puis A sauvegardent chacun une nouvelle voiture ; A reçoit
        409, fusionne, renvoie → rien n'est perdu, des deux côtés
     4. une sauvegarde cloud piégée ne passe pas les filtres (DT-09 / DT-10)
     5. suppression du compte : le serveur est vide
     6. module non configuré : aucun panneau, aucun appel réseau
   Usage : NODE_PATH=<node_modules avec playwright-core> node banc-compte-navigateur.js
   ========================================================================== */
'use strict';
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
process.removeAllListeners('warning');
const { DatabaseSync } = require('node:sqlite');

const RACINE = __dirname;
const PORT_APP = 8102, PORT_API = 8103;
const ORIGINE = `http://localhost:${PORT_APP}`, URL_APP = `${ORIGINE}/index.html`, URL_API = `http://localhost:${PORT_API}`;
const TYPES = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.png':'image/png', '.webmanifest':'application/manifest+json' };

function d1(sqlite) {
  const lier = (sql, args = []) => ({ bind: (...a) => lier(sql, a),
    first: async () => sqlite.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
    run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } }) });
  return { prepare: (sql) => lier(sql), batch: async (st) => Promise.all(st.map(s => s.run())) };
}
function r2() {
  const m = new Map();
  return { _m: m,
    put: async (k, o, opt = {}) => { m.set(k, { o: new Uint8Array(o), meta: opt.httpMetadata || {} }); },
    get: async (k) => m.has(k) ? { body: m.get(k).o, httpMetadata: m.get(k).meta } : null,
    head: async (k) => m.has(k) ? { key: k } : null,
    delete: async (k) => { for (const x of [].concat(k)) m.delete(x); },
    list: async ({ prefix }) => ({ objects: [...m.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })), truncated: false }) };
}

const res = []; const v = (t, ok, d) => res.push({ t, ok: !!ok, d });

(async () => {
  const tmp = path.join(os.tmpdir(), `compte-worker-nav-${process.pid}.mjs`);
  fs.copyFileSync(path.join(RACINE, 'cloud', 'compte-worker.js'), tmp);
  const worker = (await import('file://' + tmp)).default;
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(fs.readFileSync(path.join(RACINE, 'cloud', 'schema.sql'), 'utf8'));
  const env = { DB: d1(sqlite), PHOTOS: r2(), APP_ORIGIN: ORIGINE, MAIL_FROM: 'GM <x@test>', RESEND_API_KEY: 'test', CODE_SECRET: 'secret-de-banc-32-octets-minimum!' };
  const mails = []; let appelsApi = 0, requetesBrutes = 0; const requetesLots = [];
  const fetchReel = globalThis.fetch;
  globalThis.fetch = async (u, o) => {
    if (String(u).startsWith('https://api.resend.com/')) { mails.push(JSON.parse(o.body)); return new Response('{}', { status: 200 }); }
    return fetchReel(u, o);
  };

  const app = http.createServer((req, rep) => {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
    const f = path.join(RACINE, p);
    if (!f.startsWith(RACINE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rep.writeHead(404); return rep.end(); }
    rep.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'text/plain' }); rep.end(fs.readFileSync(f));
  });
  const api = http.createServer(async (req, rep) => {
    // Les pré-vols CORS (OPTIONS) sont émis par le navigateur, pas par le module :
    // on ne compte que les appels applicatifs.
    requetesBrutes++; if (req.method !== "OPTIONS") appelsApi++;
    const suivreLot = req.method === "POST" && req.url === "/photos/manquantes";
    if (process.env.TRACE) console.log("    API", req.method, req.url);
    const morceaux = []; for await (const c of req) morceaux.push(c);
    const corps = Buffer.concat(morceaux);
    if (suivreLot) { try { requetesLots.push(JSON.parse(corps.toString()).empreintes.length); } catch {} }
    const r = await worker.fetch(new Request(URL_API + req.url, { method: req.method, headers: req.headers,
      body: ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? undefined : corps }), env);
    const h = {}; r.headers.forEach((val, k) => { h[k] = val; });
    rep.writeHead(r.status, h); rep.end(Buffer.from(await r.arrayBuffer()));
  });
  await new Promise(ok => app.listen(PORT_APP, ok)); await new Promise(ok => api.listen(PORT_API, ok));

  const nav = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const erreurs = [];
  async function telephone(configure = true) {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    if (configure) await ctx.addInitScript(u => { window.GM_COMPTE_URL = u; }, URL_API);
    const page = await ctx.newPage();
    page.on('pageerror', e => erreurs.push(String(e)));
    const tel = { ctx, page, dialogues: [], refuser: false };
    page.on('dialog', d => { tel.dialogues.push(d.message()); tel.refuser ? d.dismiss() : d.accept(); });
    await page.goto(URL_APP, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.GMSpecs && window.GMGarage, { timeout: 15000 });
    return tel;
  }
  const idb = (page, op, arg) => page.evaluate(([op, arg]) => new Promise((ok, ko) => {
    const rq = indexedDB.open('garage-manifest'); rq.onerror = ko;
    rq.onsuccess = () => { const tx = rq.result.transaction('spots', op === 'all' ? 'readonly' : 'readwrite'); const st = tx.objectStore('spots');
      if (op === 'put') { for (const r of arg) st.put(r); tx.oncomplete = () => ok(true); } else { const q = st.getAll(); q.onsuccess = () => ok(q.result); } tx.onerror = ko; };
  }), [op, arg]);
  const garage = async (page) => Object.fromEntries((await idb(page, 'all')).filter(r => !r.carId.startsWith('__')).map(r => [r.carId, r]));
  const prise = (carId, photos) => ({ carId, at: '2026-09-01T12:00:00.000Z', coords: null, loc: 'Banc', note: '', photos, cover: 0, variants: [], favorite: false });
  const PH = (c) => `data:image/jpeg;base64,${c.repeat(12)}`;
  const recharger = async (page) => { await page.reload({ waitUntil: 'networkidle' }); await page.waitForFunction(() => window.GMGarage, { timeout: 15000 }); };
  const ouvrirReglages = async (page) => {
    await page.evaluate(() => document.querySelector('[data-tab="plus"]')?.click()); await page.waitForTimeout(250);
    await page.evaluate(() => document.querySelector('[data-tab="settings"]')?.click());
    await page.waitForSelector('[data-act="import"]', { timeout: 5000 }); await page.waitForTimeout(200);
  };
  const cliquer = async (page, action, attente) => {
    await page.click(`[data-gcp="${action}"]`);
    if (attente) await page.waitForFunction(t => (document.getElementById('gcp-msg')?.textContent || '').includes(t), attente, { timeout: 15000 });
  };
  const codeDuMail = () => /code de connexion à Garage Manifest : (\d{6})/.exec(mails[mails.length - 1].text)[1];
  const demanderCode = async (page, email) => {
    await ouvrirReglages(page);
    await page.fill('#gcp-email', email);
    await page.press('#gcp-email', 'Enter');                  // Entrée = « Recevoir un code »
    await page.waitForSelector('#gcp-code', { timeout: 10000 });
    return codeDuMail();
  };
  const connecter = async (page, email) => {
    const code = await demanderCode(page, email);
    await page.fill('#gcp-code', code);
    await cliquer(page, 'valider', 'Connecté');
    return code;
  };
  const cloud = () => { const g = sqlite.prepare('SELECT version, donnees FROM garages').get(); return g ? { version: g.version, donnees: JSON.parse(g.donnees) } : null; };

  /* 1. Téléphone A : connexion et sauvegarde */
  const A = await telephone();
  await idb(A.page, 'put', [prise('ferrari-f40', [PH('A'), PH('B')]), prise('peugeot-205', [PH('C')]),
    { carId: '__meta__', bonus: 120, missions: { '2026-09-29': ['m1', 'm2'] }, friends: [], feed: [], name: 'Pilote', ai: '' }]);
  await recharger(A.page);
  await ouvrirReglages(A.page);
  v('module configuré : panneau « Compte » affiché dans Réglages', !!(await A.page.$('#gcp-compte')));
  const codeA = await demanderCode(A.page, 'pilote@exemple.fr');
  v('code reçu par e-mail ; le panneau passe à la saisie du code', /^\d{6}$/.test(codeA) && (await A.page.textContent('#gcp-compte')).includes('pilote@exemple.fr'));
  v('champ de code prêt pour le remplissage automatique iOS / Android',
    (await A.page.getAttribute('#gcp-code', 'autocomplete')) === 'one-time-code' && (await A.page.getAttribute('#gcp-code', 'inputmode')) === 'numeric');
  await recharger(A.page); await ouvrirReglages(A.page);
  v('app fermée puis rouverte (le temps d\'aller lire ses mails) : la saisie du code reprend', !!(await A.page.$('#gcp-code')));
  await A.page.fill('#gcp-code', String((Number(codeA) + 1) % 1e6).padStart(6, '0'));
  await cliquer(A.page, 'valider', 'incorrect');
  v('code faux : message clair, toujours déconnecté', !(await A.page.evaluate(() => window.GMCompte.etat().connecte)));
  await A.page.fill('#gcp-code', `${codeA.slice(0, 3)} ${codeA.slice(3)}`);
  await A.page.press('#gcp-code', 'Enter');
  await A.page.waitForFunction(() => window.GMCompte.etat().connecte, null, { timeout: 10000 });
  v('bon code (avec espace, validé par Entrée) : connecté', (await A.page.evaluate(() => window.GMCompte.etat().email)) === 'pilote@exemple.fr');
  await ouvrirReglages(A.page);
  await cliquer(A.page, 'sauvegarder', 'Sauvegardé');
  let c = cloud();
  v('sauvegarde : 2 voitures dans le cloud, version 1', c && c.version === 1 && c.donnees.spots.length === 2, JSON.stringify(c && c.version));
  v('photos : 3 envoyées, désignées par empreinte dans la collection', env.PHOTOS._m.size === 3 && c.donnees.spots.every(s => s.photos.every(h => /^[0-9a-f]{64}$/.test(h))));
  const avant = env.PHOTOS._m.size, appelsAvant = appelsApi;
  await cliquer(A.page, 'sauvegarder', 'Sauvegardé');
  v('resauvegarde sans nouvelle photo : aucune photo renvoyée', env.PHOTOS._m.size === avant && (await A.page.textContent('#gcp-msg')).includes('0 nouvelle photo'), await A.page.textContent('#gcp-msg'));
  v('… et seulement 2 appels au serveur (liste des manquantes + collection)', appelsApi - appelsAvant === 2, appelsApi - appelsAvant);

  /* 2. Téléphone B : vide, se connecte, récupère */
  const B = await telephone();
  v('téléphone B : garage vide au départ', Object.keys(await garage(B.page)).length === 0);
  await connecter(B.page, 'pilote@exemple.fr');
  await ouvrirReglages(B.page);
  await cliquer(B.page, 'restaurer', 'Récupéré');
  const gB = await garage(B.page), gA = await garage(A.page);
  v('téléphone B : les 2 voitures récupérées', !!gB['ferrari-f40'] && !!gB['peugeot-205']);
  const metaB = (await idb(B.page, 'all')).find(r => r.carId === '__meta__') || {};
  v('téléphone B (neuf) : pseudo, bonus et missions récupérés',
    metaB.name === 'Pilote' && metaB.bonus === 120 && JSON.stringify(metaB.missions) === '{"2026-09-29":["m1","m2"]}', JSON.stringify(metaB));
  v('téléphone B : photos identiques au caractère près', JSON.stringify(gB['ferrari-f40'].photos) === JSON.stringify(gA['ferrari-f40'].photos) && gB['peugeot-205'].photos[0] === PH('C'));

  /* 3. Conflit : B puis A sauvegardent chacun une nouvelle voiture */
  await idb(B.page, 'put', [prise('bmw-m3', [PH('D')])]); await recharger(B.page);
  await ouvrirReglages(B.page); await cliquer(B.page, 'sauvegarder', 'Sauvegardé');
  await idb(A.page, 'put', [prise('lambo-miura', [PH('E')])]); await recharger(A.page);
  await ouvrirReglages(A.page); await cliquer(A.page, 'sauvegarder', 'Sauvegardé');
  c = cloud();
  const ids = c.donnees.spots.map(s => s.carId).sort();
  v('conflit résolu : le cloud contient les 4 voitures des deux téléphones', JSON.stringify(ids) === JSON.stringify(['bmw-m3', 'ferrari-f40', 'lambo-miura', 'peugeot-205']), JSON.stringify(ids));
  v('… et le téléphone A a récupéré celle de B au passage', !!(await garage(A.page))['bmw-m3']);
  v('versions : 1 → 2 (B) → 3 (A après fusion)', c.version === 4 || c.version === 3, c.version);

  /* 4. Une sauvegarde cloud piégée passe par les mêmes filtres qu'un fichier */
  const piege = { ...c.donnees, custom: { carId: '__customcars__', list: [{ id: 'custom:x" onfocus="window.__pwned=1', brand: 'P', model: 'X' }] },
    meta: { friends: [{ name: 'Z', score: '<img src=x onerror="window.__pwned=1">' }] } };
  sqlite.prepare('UPDATE garages SET donnees = ?').run(JSON.stringify(piege));
  const C = await telephone();
  await connecter(C.page, 'pilote@exemple.fr');
  await ouvrirReglages(C.page); await cliquer(C.page, 'restaurer', 'Récupéré');
  const gC = await idb(C.page, 'all');
  v('sauvegarde cloud piégée : id hostile rejeté, score ramené à un entier', !JSON.stringify(gC).includes('onfocus') && ((gC.find(r => r.carId === '__meta__')?.friends || [])[0]?.score ?? 0) === 0);
  v('… et aucune charge exécutée', !(await C.page.evaluate(() => window.__pwned)));

  /* 4 bis. Changer d'adresse avant d'avoir validé */
  const P = await telephone();
  await demanderCode(P.page, 'faute@exemple.fr');
  await cliquer(P.page, 'changer');
  await P.page.waitForSelector('#gcp-email', { timeout: 5000 });
  v('« Changer d\'adresse » : retour à la saisie de l\'e-mail, rien d\'ouvert', !(await P.page.evaluate(() => window.GMCompte.etat().connecte || window.GMCompte.etat().codeEnvoyeA)));

  /* 4 ter. Défauts de /code-review n°3 et n°2 côté app */
  const shaDe = (d) => require('crypto').createHash('sha256').update(Buffer.from(d.split(',')[1], 'base64')).digest('hex');
  // (a) Récupération manuelle avec une photo en panne réseau : on n'importe RIEN
  const F = await telephone();
  // 4e demande de code pour pilote@ en quelques secondes : la limite (3 / 15 min)
  // jouerait à juste titre. On simule le quart d'heure écoulé.
  sqlite.prepare('DELETE FROM limites').run();
  await connecter(F.page, 'pilote@exemple.fr');
  const shaPanne = cloud().donnees.spots.flatMap(x => x.photos)[0];
  await F.ctx.route(`${URL_API}/photos/${shaPanne}`, r => r.request().method() === 'GET' ? r.fulfill({ status: 503, body: '{"erreur":"indisponible"}', headers: { 'Access-Control-Allow-Origin': ORIGINE, 'Content-Type': 'application/json' } }) : r.continue());
  await ouvrirReglages(F.page); await cliquer(F.page, 'restaurer', 'réessaie');
  v('récupération avec une photo en panne : interrompue, message clair, rien d\'importé', Object.keys(await garage(F.page)).length === 0, await F.page.textContent('#gcp-msg'));
  await F.ctx.unroute(`${URL_API}/photos/${shaPanne}`);
  await cliquer(F.page, 'restaurer', 'Récupéré');
  v('… et la même récupération réussit une fois le réseau revenu', Object.keys(await garage(F.page)).length === 4);
  // (b) Conflit (409) pendant qu'une photo du cloud est injoignable : le cloud ne perd pas la photo
  await idb(A.page, 'put', [prise('ferrari-f40', [PH('A'), PH('B'), PH('G')])]); await recharger(A.page);
  await ouvrirReglages(A.page); await cliquer(A.page, 'sauvegarder', 'Sauvegardé');
  const shaG = shaDe(PH('G'));
  v('(préparation) la nouvelle photo de A est au cloud', cloud().donnees.spots.some(x => x.photos.includes(shaG)));
  await F.ctx.route(`${URL_API}/photos/${shaG}`, r => r.request().method() === 'GET' ? r.fulfill({ status: 503, body: '{"erreur":"indisponible"}', headers: { 'Access-Control-Allow-Origin': ORIGINE, 'Content-Type': 'application/json' } }) : r.continue());
  await idb(F.page, 'put', [prise('bmw-m3', [PH('D'), PH('H')])]); await recharger(F.page);
  await ouvrirReglages(F.page); await cliquer(F.page, 'sauvegarder', 'réessaie');
  v('conflit + photo injoignable : la sauvegarde s\'arrête, et le cloud garde la photo de A', cloud().donnees.spots.some(x => x.photos.includes(shaG)), await F.page.textContent('#gcp-msg'));
  await F.ctx.unroute(`${URL_API}/photos/${shaG}`);
  await cliquer(F.page, 'sauvegarder', 'Sauvegardé');
  const apres = cloud().donnees.spots;
  v('… puis, réseau revenu : sauvegarde complète, photo de A conservée et nouvelle photo de F ajoutée',
    apres.some(x => x.photos.includes(shaG)) && apres.some(x => x.photos.includes(shaDe(PH('H')))));
  // (c) Collection de plus de 1 000 photos : envoi des empreintes par lots
  const L = await telephone();
  const photosLot = Array.from({ length: 1050 }, (_, i) => `data:image/jpeg;base64,${Buffer.from('lot-' + i + '-'.repeat(8)).toString('base64')}`);
  await idb(L.page, 'put', [{ ...prise('ferrari-f40', photosLot.slice(0, 525)) }, { ...prise('peugeot-205', photosLot.slice(525)) }]);
  await recharger(L.page);
  await connecter(L.page, 'lots@exemple.fr');
  const lotsAvant = requetesLots.length;
  await ouvrirReglages(L.page); await cliquer(L.page, 'sauvegarder', 'Sauvegardé');
  const lots = requetesLots.slice(lotsAvant);
  v('1 050 photos : empreintes envoyées en 2 lots (≤ 1 000), toutes les photos au cloud',
    lots.length === 2 && lots.every(n => n <= 1000) && [...env.PHOTOS._m.keys()].length >= 1050, JSON.stringify(lots));

  /* 4 quater. Défaut n°4 : synchronisation à deux appareils — ajout, modification, suppression, fusion */
  sqlite.prepare('DELETE FROM limites').run();
  const S1 = await telephone(), S2 = await telephone();
  const maintenant = () => new Date().toISOString();
  const cloudDe = (email) => { const u = sqlite.prepare('SELECT id FROM utilisateurs WHERE email = ?').get(email);
    const g = u && sqlite.prepare('SELECT version, donnees FROM garages WHERE utilisateur = ?').get(u.id); return g ? { version: g.version, donnees: JSON.parse(g.donnees) } : null; };
  const retirerViaApp = async (page, id) => {
    await page.evaluate(() => document.querySelector('[data-tab="collection"]')?.click()); await page.waitForTimeout(300);
    await page.evaluate(i => document.querySelector(`[data-car="${i}"]`)?.click(), id);
    await page.waitForSelector(`[data-release="${id}"]`, { state: 'attached', timeout: 5000 });   // sur une page du carrousel de la fiche
    await page.evaluate(i => document.querySelector(`[data-release="${i}"]`).click(), id);
    await page.waitForSelector('[data-cf="1"]', { timeout: 5000 }); await page.click('[data-cf="1"]');
    await page.waitForFunction(i => !document.querySelector(`[data-release="${i}"]`), id, { timeout: 5000 });
  };
  const t0 = new Date(Date.now() - 3600e3).toISOString();
  await idb(S1.page, 'put', [{ ...prise('ferrari-f40', [PH('S')]), note: 'note d\'origine', maj: t0 }, { ...prise('peugeot-205', [PH('T')]), maj: t0 }]);
  await recharger(S1.page); await connecter(S1.page, 'sync@exemple.fr');
  await ouvrirReglages(S1.page); await cliquer(S1.page, 'sauvegarder', 'Sauvegardé');
  await connecter(S2.page, 'sync@exemple.fr');
  await ouvrirReglages(S2.page); await cliquer(S2.page, 'restaurer', 'Récupéré');
  v('sync · ajout : S2 récupère les 2 voitures de S1', Object.keys(await garage(S2.page)).length === 2);
  // Modification sur S2 (note réécrite + une photo en plus), sauvée
  const x2 = (await garage(S2.page))['ferrari-f40'];
  await idb(S2.page, 'put', [{ ...x2, note: 'note réécrite sur S2', photos: [...x2.photos, PH('U')], maj: maintenant() }]);
  await recharger(S2.page); await ouvrirReglages(S2.page); await cliquer(S2.page, 'sauvegarder', 'Sauvegardé');
  // Pendant ce temps, S1 (en retard d'une version) RETIRE la 205 via l'app et AJOUTE une M3
  await retirerViaApp(S1.page, 'peugeot-205');
  await idb(S1.page, 'put', [{ ...prise('bmw-m3', [PH('V')]), maj: maintenant() }]); await recharger(S1.page);
  await ouvrirReglages(S1.page); await cliquer(S1.page, 'sauvegarder', 'Sauvegardé');     // 409 → fusion → renvoi
  let cs = cloudDe('sync@exemple.fr'); const idsCloud = cs.donnees.spots.map(x => x.carId).sort();
  const xCloud = cs.donnees.spots.find(x => x.carId === 'ferrari-f40');
  v('sync · fusion après conflit : la 205 retirée par S1 ne revient pas, la M3 ajoutée est là', JSON.stringify(idsCloud) === '["bmw-m3","ferrari-f40"]', JSON.stringify(idsCloud));
  v('sync · la note la plus récente (S2) remplace l\'ancienne, sans concaténation', xCloud && xCloud.note === 'note réécrite sur S2', xCloud && JSON.stringify(xCloud.note));
  v('sync · les photos des deux appareils sont conservées', xCloud && xCloud.photos.length === 2, xCloud && xCloud.photos.length);
  v('sync · le retrait voyage avec la sauvegarde (pierre tombale)', !!(cs.donnees.meta && cs.donnees.meta.supprimes && cs.donnees.meta.supprimes['peugeot-205']));
  // S2 récupère : la 205 disparaît AUSSI chez lui
  await ouvrirReglages(S2.page); await cliquer(S2.page, 'restaurer', 'Récupéré');
  const g2 = await garage(S2.page);
  v('sync · S2 : la 205 retirée sur S1 disparaît, la M3 arrive, la note de S2 est intacte',
    !g2['peugeot-205'] && !!g2['bmw-m3'] && g2['ferrari-f40'].note === 'note réécrite sur S2', JSON.stringify(Object.keys(g2)));
  v('sync · … et le message le dit', /retirée sur un autre appareil/.test(await S2.page.textContent('#gcp-msg')), await S2.page.textContent('#gcp-msg'));
  // S2 resauve : rien ne ressuscite
  await cliquer(S2.page, 'sauvegarder', 'Sauvegardé');
  v('sync · resauvegarde : la 205 ne ressuscite pas', !cloudDe('sync@exemple.fr').donnees.spots.some(x => x.carId === 'peugeot-205'));
  // Recapture APRÈS le retrait (sur S2) : elle doit revenir partout
  await idb(S2.page, 'put', [{ ...prise('peugeot-205', [PH('W')]), maj: maintenant() }]); await recharger(S2.page);
  await ouvrirReglages(S2.page); await cliquer(S2.page, 'sauvegarder', 'Sauvegardé');
  await ouvrirReglages(S1.page); await cliquer(S1.page, 'restaurer', 'Récupéré');
  v('sync · une voiture recapturée après son retrait revient sur l\'autre appareil', !!(await garage(S1.page))['peugeot-205']);

  /* 4 quinquies. Relais IA : jeton de compte et limites, sur une vraie capture « Importer une photo » */
  const RELAIS = 'https://silent-firefly-2620.cyril-lapopin.workers.dev';
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const capturer = async (tel) => {
    await tel.page.evaluate(() => document.querySelector('[data-fab]')?.click());
    await tel.page.waitForSelector('#fileInput', { state: 'attached', timeout: 5000 });
    await tel.page.setInputFiles('#fileInput', { name: 'voiture.png', mimeType: 'image/png', buffer: PNG });
  };
  const espionnerRelais = async (tel, reponse) => {
    const vues = [];
    await tel.ctx.route(u => u.href.startsWith(RELAIS) || u.hostname === 'autre-relais.test', async (route) => {
      const h = route.request().headers();
      vues.push({ hote: new URL(route.request().url()).hostname, auth: h.authorization || null, methode: route.request().method() });
      return reponse(route, h);
    });
    return vues;
  };
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Content-Type': 'application/json' };
  const repondre = (statut, corps) => (route) => route.fulfill({ status: statut, headers: cors, body: JSON.stringify(corps) });
  // (a) sans compte : aucun jeton
  const R1 = await telephone(false);
  const vuesR1 = await espionnerRelais(R1, repondre(200, []));
  await capturer(R1); await R1.page.waitForTimeout(1500);
  const postsR1 = vuesR1.filter(x => x.methode === 'POST');
  v('relais · sans compte : identification envoyée, sans aucun jeton', postsR1.length === 1 && !postsR1[0].auth, JSON.stringify(vuesR1));
  // (b) compte connecté : jeton vers le relais officiel
  const vuesS1 = await espionnerRelais(S1, repondre(200, []));
  await S1.page.evaluate(() => document.querySelector('[data-tab="collection"]')?.click());
  await capturer(S1); await S1.page.waitForTimeout(1500);
  const postS1 = vuesS1.find(x => x.methode === 'POST');
  v('relais · compte connecté : le jeton de session part vers le relais officiel', !!postS1 && /^Bearer [A-Za-z0-9_-]{20,}$/.test(postS1.auth || ''), JSON.stringify(postS1));
  // (c) relais personnalisé (Réglages) : jamais le jeton
  await idb(S1.page, 'put', [{ ...((await idb(S1.page, 'all')).find(x => x.carId === '__meta__') || { carId: '__meta__' }), ai: 'https://autre-relais.test/' }]);
  await recharger(S1.page); vuesS1.length = 0;
  await capturer(S1); await S1.page.waitForTimeout(1500);
  const postPerso = vuesS1.find(x => x.methode === 'POST');
  v('relais · relais personnalisé : identification envoyée SANS le jeton (serveur tiers)', !!postPerso && postPerso.hote === 'autre-relais.test' && !postPerso.auth, JSON.stringify(vuesS1));
  const m0 = (await idb(S1.page, 'all')).find(x => x.carId === '__meta__'); await idb(S1.page, 'put', [{ ...m0, ai: '' }]); await recharger(S1.page);
  // (d) limite atteinte : le message du relais est affiché
  const R2 = await telephone(false);
  await espionnerRelais(R2, repondre(429, { error: "Limite d'identifications du jour atteinte sur cet appareil : choisis la voiture à la main, ou reviens demain" }));
  await capturer(R2);
  // Depuis le parcours P0, le résultat s'affiche dans l'écran de capture, plus dans un message bref.
  await R2.page.waitForFunction(() => /Limite d'identifications/.test(document.querySelector('#capBody')?.textContent || ''), null, { timeout: 8000 }).catch(() => {});
  v('relais · limite atteinte (429) : le message du relais est montré, pas un code HTTP', /choisis la voiture à la main/.test(await R2.page.textContent('#capBody')) && !/HTTP/.test(await R2.page.textContent('#capBody')), await R2.page.textContent('#capBody'));
  // (e) relais pas encore mis à jour (refuse le jeton) : nouvel essai anonyme
  await S1.ctx.unroute(u => true).catch(() => {});
  const vuesAncien = await espionnerRelais(S1, (route, h) => h.authorization ? route.abort('failed') : repondre(200, [])(route));
  await capturer(S1); await S1.page.waitForTimeout(2000);
  const postsAncien = vuesAncien.filter(x => x.methode === 'POST');
  v('relais · ancien relais qui refuse le jeton : second essai anonyme, la capture fonctionne', postsAncien.length === 2 && !!postsAncien[0].auth && !postsAncien[1].auth, JSON.stringify(postsAncien));

  /* 4 sexies. Mode essai sans R2 (offre gratuite) : collection sans photos, puis R2 branché */
  sqlite.prepare('DELETE FROM limites').run();
  const r2Reel = env.PHOTOS; delete env.PHOTOS;
  const E1 = await telephone(), E2 = await telephone();
  await idb(E1.page, 'put', [prise('ferrari-f40', [PH('X'), PH('Y')]), prise('peugeot-205', [PH('Z')])]);
  await recharger(E1.page); await connecter(E1.page, 'essai@exemple.fr');
  await ouvrirReglages(E1.page); await cliquer(E1.page, 'sauvegarder', 'Sauvegardé');
  const ce = cloudDe('essai@exemple.fr');
  v('essai sans R2 · sauvegarde réussie : les 2 voitures sont au cloud', ce && ce.donnees.spots.length === 2, JSON.stringify(ce && ce.version));
  v('essai sans R2 · le message dit que les photos ne sont pas sauvées', /sans les photos/.test(await E1.page.textContent('#gcp-msg')), await E1.page.textContent('#gcp-msg'));
  v('essai sans R2 · le panneau annonce « Collection seule »', /Collection seule/.test(await E1.page.textContent('#gcp-compte')));
  v('essai sans R2 · le téléphone garde toutes ses photos', (await garage(E1.page))['ferrari-f40'].photos.length === 2);
  await connecter(E2.page, 'essai@exemple.fr');
  await ouvrirReglages(E2.page); await cliquer(E2.page, 'restaurer', 'Récupéré');
  const gE2 = await garage(E2.page);
  v('essai sans R2 · téléphone neuf : les 2 voitures récupérées, sans photo, sans interruption',
    !!gE2['ferrari-f40'] && !!gE2['peugeot-205'] && gE2['ferrari-f40'].photos.length === 0, JSON.stringify(Object.keys(gE2)));
  v('essai sans R2 · … et le message le dit', /sans les photos/.test(await E2.page.textContent('#gcp-msg')), await E2.page.textContent('#gcp-msg'));
  await E2.page.evaluate(() => document.querySelector('[data-tab="collection"]')?.click()); await E2.page.waitForTimeout(300);
  await E2.page.evaluate(() => document.querySelector('[data-car="ferrari-f40"]')?.click());
  const ficheSansPhoto = await E2.page.waitForSelector('.detail-shell[data-car-id="ferrari-f40"]', { timeout: 5000 }).then(() => true, () => false);
  v('essai sans R2 · la fiche d\'une voiture sans photo s\'ouvre (aucune erreur JS, vérifié en fin de banc)', ficheSansPhoto);
  await recharger(E2.page);                                   // referme la fiche, qui masquerait les Réglages
  // Aller-retour : E1 récupère puis resauve — ses photos locales ne sont pas perdues
  await ouvrirReglages(E1.page); await cliquer(E1.page, 'restaurer', 'Récupéré');
  v('essai sans R2 · E1 récupère depuis le cloud sans photo : ses photos locales restent', (await garage(E1.page))['ferrari-f40'].photos.length === 2);
  // R2 branché plus tard : la sauvegarde suivante envoie les photos, sans migration
  env.PHOTOS = r2Reel;
  const photosAvant = env.PHOTOS._m.size;
  await ouvrirReglages(E1.page); await cliquer(E1.page, 'sauvegarder', 'Sauvegardé');
  v('R2 branché ensuite : la sauvegarde suivante envoie les 3 photos, sans migration', env.PHOTOS._m.size - photosAvant === 3 && /3 nouvelles photos/.test(await E1.page.textContent('#gcp-msg')), await E1.page.textContent('#gcp-msg'));
  v('R2 branché ensuite : le panneau repasse à « Collection et photos »', /Collection et photos/.test(await E1.page.textContent('#gcp-compte')) && !(await E1.page.evaluate(() => window.GMCompte.etat().sansPhotos)));
  await ouvrirReglages(E2.page); await cliquer(E2.page, 'restaurer', 'Récupéré');
  v('R2 branché ensuite : le téléphone neuf récupère enfin les photos', (await garage(E2.page))['ferrari-f40'].photos.length === 2);

  /* 5. Suppression du compte */
  const idPilote = sqlite.prepare("SELECT id FROM utilisateurs WHERE email = 'pilote@exemple.fr'").get().id;
  await ouvrirReglages(A.page); await cliquer(A.page, 'supprimer', 'Compte supprimé');
  v('suppression : plus rien sur le serveur pour ce compte (compte, garage, photos)', !sqlite.prepare("SELECT 1 FROM utilisateurs WHERE email = 'pilote@exemple.fr'").get()
    && !sqlite.prepare('SELECT 1 FROM garages WHERE utilisateur = ?').get(idPilote) && ![...env.PHOTOS._m.keys()].some(k => k.startsWith(`u/${idPilote}/`)));
  v('… et les autres comptes sont intacts', [...env.PHOTOS._m.keys()].length >= 1050);
  v('… et le téléphone garde son garage local', Object.keys(await garage(A.page)).length === 4);
  v('… et le panneau repasse à « Recevoir un code »', !!(await A.page.$('#gcp-email')));

  /* 6. En sommeil : non configuré → aucun panneau, aucun appel */
  const appels0 = requetesBrutes;
  const D = await telephone(false);
  await ouvrirReglages(D.page);
  v('non configuré : aucun panneau « Compte »', !(await D.page.$('#gcp-compte')));
  v('non configuré : aucune requête vers le serveur de comptes, pas même un pré-vol', requetesBrutes === appels0);

  v('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));

  await nav.close(); app.close(); api.close(); globalThis.fetch = fetchReel; try { fs.unlinkSync(tmp); } catch {}
  let ko = 0; for (const x of res) { if (!x.ok) ko++; console.log(`  ${x.ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${x.t}${!x.ok && x.d != null ? '  → ' + x.d : ''}`); }
  console.log(`\n  ${res.length - ko} passé(s) · ${ko} échec(s)`); process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
