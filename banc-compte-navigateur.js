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
     4 nonies. synchronisation AUTOMATIQUE (20/11) : connexion, second téléphone,
        rafale = un envoi, pas d'aller-retour entre deux téléphones aux pseudos
        différents, geste pendant un envoi, rien avant la collection chargée,
        désactivation, panne puis reprise, « Réinitialiser » connecté, arrière-plan,
        app fermée avant l'envoi, déconnexion. Les autres téléphones du banc la
        gardent ÉTEINTE (option `auto`) : ils comptent les requêtes.
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
  /* Google du banc : une vraie paire RSA ; le Worker vérifie de vrais jetons signés. */
  const CLIENT_GOOGLE = 'client-banc.apps.googleusercontent.com';
  const { generateKeyPairSync, sign: signer } = require('crypto');
  const cleGoogle = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const b64u = (x) => Buffer.from(x).toString('base64url');
  let nJeton = 0;
  const jetonGoogle = (champs) => {
    const s = Math.floor(Date.now() / 1000);
    const h = b64u(JSON.stringify({ alg: 'RS256', kid: 'banc-1', typ: 'JWT' }));
    const p = b64u(JSON.stringify({ iss: 'https://accounts.google.com', aud: CLIENT_GOOGLE, email_verified: true, iat: s, exp: s + 3600, jti: String(++nJeton), ...champs }));
    return `${h}.${p}.${b64u(signer('sha256', Buffer.from(`${h}.${p}`), cleGoogle.privateKey))}`;
  };
  /* Faux script de Google, servi à l'adresse du vrai : même interface (initialize,
     renderButton, disableAutoSelect). Le « bouton » rend le jeton que le banc a posé. */
  const FAUX_GSI = `window.google = { accounts: { id: {
    initialize: function (o) { window.__gsiInit = (window.__gsiInit || 0) + 1; window.__gsi = o; },
    renderButton: function (el, opt) { var b = document.createElement('button'); b.id = 'faux-google'; b.type = 'button'; b.textContent = 'Continuer avec Google';
      b.onclick = function () { window.__gsi.callback({ credential: window.__jetonGoogle, select_by: 'btn' }); }; el.appendChild(b); window.__gsiOpt = opt; },
    disableAutoSelect: function () { window.__gsiDeco = (window.__gsiDeco || 0) + 1; } } } };`;

  const env = { DB: d1(sqlite), PHOTOS: r2(), APP_ORIGIN: ORIGINE, MAIL_FROM: 'GM <x@test>', RESEND_API_KEY: 'test', CODE_SECRET: 'secret-de-banc-32-octets-minimum!', GOOGLE_CLIENT_ID: CLIENT_GOOGLE };
  const mails = []; let appelsApi = 0, requetesBrutes = 0, ecrituresGarage = 0; const requetesLots = [];
  let ralentir = null;
  let ralentirReponse = null;   // délai APRÈS traitement : la requête a déjà agi côté serveur, sa réponse arrive tard
  const photosInvalides = [];                        // requêtes /photos/<x> dont <x> n'est pas une empreinte                               // (req) → millisecondes d'attente avant de répondre (réseau lent simulé)
  const fetchReel = globalThis.fetch;
  globalThis.fetch = async (u, o) => {
    if (String(u).startsWith('https://api.resend.com/')) { mails.push(JSON.parse(o.body)); return new Response('{}', { status: 200 }); }
    if (String(u) === 'https://www.googleapis.com/oauth2/v3/certs') {
      return new Response(JSON.stringify({ keys: [{ ...cleGoogle.publicKey.export({ format: 'jwk' }), kid: 'banc-1', alg: 'RS256', use: 'sig' }] }), { status: 200, headers: { 'Cache-Control': 'max-age=3600' } });
    }
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
    if (req.method === 'PUT' && req.url === '/garage') ecrituresGarage++;
    const suivreLot = req.method === "POST" && req.url === "/photos/manquantes";
    if (process.env.TRACE) console.log("    API", req.method, req.url);
    const morceaux = []; for await (const c of req) morceaux.push(c);
    const corps = Buffer.concat(morceaux);
    if (req.method !== 'OPTIONS' && req.url.startsWith('/photos/') && req.url !== '/photos/manquantes' && !/^\/photos\/[0-9a-f]{64}$/.test(req.url)) photosInvalides.push(req.url);
    const attente = ralentir && req.method !== 'OPTIONS' ? ralentir(req) : 0;
    if (attente) await new Promise(ok => setTimeout(ok, attente));
    if (suivreLot) { try { requetesLots.push(JSON.parse(corps.toString()).empreintes.length); } catch {} }
    const r = await worker.fetch(new Request(URL_API + req.url, { method: req.method, headers: req.headers,
      body: ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? undefined : corps }), env);
    const h = {}; r.headers.forEach((val, k) => { h[k] = val; });
    const tard = ralentirReponse && req.method !== 'OPTIONS' ? ralentirReponse(req) : 0;
    if (tard) await new Promise(ok => setTimeout(ok, tard));
    rep.writeHead(r.status, h); rep.end(Buffer.from(await r.arrayBuffer()));
  });
  await new Promise(ok => app.listen(PORT_APP, ok)); await new Promise(ok => api.listen(PORT_API, ok));

  const nav = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const erreurs = [];
  /* configure : true → serveur du banc ; false → sommeil forcé (GM_COMPTE_URL vide) ;
     'production' → aucune surcharge : l'adresse inscrite dans gm-compte.js, comme sur un vrai téléphone. */
  /* auto : synchronisation automatique (20/11). ÉTEINTE par défaut au banc : les tests d'avant
     comptent les requêtes et pilotent chaque sauvegarde au bouton. synchroMs : calme attendu. */
  async function telephone(configure = true, { google = false, bloquerGoogle = false, delai = 0, auto = false, synchroMs = 0 } = {}) {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
    if (configure !== 'production') await ctx.addInitScript(a => { window.GM_COMPTE_SYNCHRO_AUTO = a; }, auto);
    if (synchroMs) await ctx.addInitScript(m => { window.GM_COMPTE_SYNCHRO_MS = m; }, synchroMs);
    if (configure === true) await ctx.addInitScript(u => { window.GM_COMPTE_URL = u; }, URL_API);
    else if (configure === false) await ctx.addInitScript(() => { window.GM_COMPTE_URL = ''; });
    const versProduction = [];
    await ctx.route(u => u.hostname === 'garage-comptes.cyril-lapopin.workers.dev', (r) => { versProduction.push(r.request().method() + ' ' + r.request().url()); return r.abort(); });
    if (delai) await ctx.addInitScript(d => { window.GM_COMPTE_DELAI_MS = d; }, delai);
    if (google) await ctx.addInitScript(id => { window.GM_GOOGLE_CLIENT_ID = id; }, CLIENT_GOOGLE);
    // Sans « google », Google reste en sommeil — sauf en configuration de production (l'identifiant inscrit dans gm-compte.js).
    else if (configure !== 'production') await ctx.addInitScript(() => { window.GM_GOOGLE_CLIENT_ID = ''; });
    const page = await ctx.newPage();
    page.on('pageerror', e => erreurs.push(String(e)));
    const tel = { ctx, page, dialogues: [], refuser: false, requetesGoogle: [], versProduction };
    // TOUTE requête vers Google est comptée, sur chaque téléphone : c'est la preuve du « en sommeil ».
    await ctx.route(u => /(^|\.)google(apis)?\.com$/.test(u.hostname), (route) => {
      tel.requetesGoogle.push(route.request().url());
      return bloquerGoogle ? route.abort('failed') : route.fulfill({ status: 200, contentType: 'application/javascript', body: FAUX_GSI });
    });
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
  // Relecture de code du 26/10 : retirée, puis RÉIMPORTÉE depuis un fichier (ancienne sauvegarde) → la synchro suivante ne doit pas l'effacer
  await retirerViaApp(S1.page, 'bmw-m3');
  await ouvrirReglages(S1.page); await cliquer(S1.page, 'sauvegarder', 'Sauvegardé');      // la pierre tombale part AU CLOUD
  v('sync · (préalable) la pierre tombale de la M3 est au cloud', !!(cloudDe('sync@exemple.fr').donnees.meta.supprimes || {})['bmw-m3']);
  await S1.page.evaluate(async (p) => { await window.GMGarage.importer({ app: 'garage-manifest', spots: [p] }); }, { ...prise('bmw-m3', [PH('V')]), maj: t0 });
  await recharger(S1.page);
  v('sync · voiture retirée puis réimportée depuis un fichier : présente après l\'import', !!(await garage(S1.page))['bmw-m3']);
  await ouvrirReglages(S1.page); await cliquer(S1.page, 'restaurer', 'Récupéré');
  v('sync · … et « Récupérer » ne l\'efface pas de nouveau (sa pierre tombale ne la vise plus)', !!(await garage(S1.page))['bmw-m3'], JSON.stringify(Object.keys(await garage(S1.page))));

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
  /* (c bis) F-7, constaté en production le 19/11 : l'adresse OFFICIELLE saisie à la main
     avec un « / » final n'était pas reconnue — le joueur connecté consommait le quota
     anonyme. Même relais, donc le jeton doit partir… */
  const avecAi = async (ai) => { const m = (await idb(S1.page, 'all')).find(x => x.carId === '__meta__') || { carId: '__meta__' }; await idb(S1.page, 'put', [{ ...m, ai }]); await recharger(S1.page); vuesS1.length = 0; };
  await avecAi(RELAIS + '/');
  await capturer(S1); await S1.page.waitForTimeout(1500);
  const postSlash = vuesS1.find(x => x.methode === 'POST');
  v('relais · adresse officielle saisie avec « / » final : reconnue, le jeton part (quota du compte)', !!postSlash && /^Bearer /.test(postSlash.auth || ''), JSON.stringify(vuesS1));
  // … mais un hôte qui COMMENCE comme le relais officiel est un autre serveur : jamais le jeton.
  await avecAi(RELAIS + '.autre-relais.test/');
  await capturer(S1); await S1.page.waitForTimeout(1500);
  const postImitation = vuesS1.find(x => x.methode === 'POST');
  v('relais · hôte qui imite le relais officiel (préfixe) : SANS le jeton', !!postImitation && !postImitation.auth, JSON.stringify(vuesS1));
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

  /* 4 septies. « Continuer avec Google » (14/10) : sommeil, bouton, sauvegarde, second téléphone */
  sqlite.prepare('DELETE FROM limites').run();
  v('Google · compte configuré SANS identifiant Google : aucun bouton, aucune requête vers Google',
    !(await A.page.$('#gcp-google')) && A.requetesGoogle.length === 0, JSON.stringify(A.requetesGoogle));
  const G1 = await telephone(true, { google: true });
  await idb(G1.page, 'put', [prise('ferrari-f40', [PH('G')]), prise('alpine-a110', [])]);
  await recharger(G1.page);
  v('Google · tant que le panneau Compte n\'est pas ouvert : aucune requête vers Google', G1.requetesGoogle.length === 0, JSON.stringify(G1.requetesGoogle));
  await ouvrirReglages(G1.page);
  await G1.page.waitForSelector('#faux-google', { timeout: 8000 });
  const initG = await G1.page.evaluate(() => ({ n: window.__gsiInit, id: window.__gsi.client_id, auto: window.__gsi.auto_select, texte: window.__gsiOpt.text, langue: window.__gsiOpt.locale }));
  v('Google · panneau ouvert : script chargé UNE fois, bouton « Continuer avec Google » (fr), à côté du code e-mail',
    G1.requetesGoogle.length === 1 && initG.n === 1 && initG.id === CLIENT_GOOGLE && initG.auto === false && initG.texte === 'continue_with' && initG.langue === 'fr' && !!(await G1.page.$('#gcp-email')), JSON.stringify(initG));
  const connecterGoogleNav = async (tel, champs) => {
    await tel.page.evaluate(j => { window.__jetonGoogle = j; }, jetonGoogle(champs));
    await tel.page.click('#faux-google');
    await tel.page.waitForFunction(() => /Connecté|compte|code reçu|refus|indisponible/i.test(document.getElementById('gcp-msg')?.textContent || ''), null, { timeout: 10000 });
  };
  const JOUEUR = { sub: '7000000000000000000007', email: 'joueur@gmail.com' };
  await connecterGoogleNav(G1, JOUEUR);
  v('Google · un toucher : connecté, avec l\'adresse du compte Google',
    (await G1.page.evaluate(() => window.GMCompte.etat().connecte)) && /joueur@gmail\.com/.test(await G1.page.textContent('#gcp-compte')), await G1.page.textContent('#gcp-msg'));
  await cliquer(G1.page, 'sauvegarder', 'Sauvegardé');
  const cg = cloudDe('joueur@gmail.com');
  v('Google · « Sauvegarder » : le garage (2 voitures, photo comprise) est au cloud, sur le compte relié à Google',
    cg && cg.donnees.spots.length === 2 && env.PHOTOS._m.size > 0, cg && JSON.stringify(cg.donnees.spots.map(s => s.carId)));
  const G2 = await telephone(true, { google: true });
  await ouvrirReglages(G2.page); await G2.page.waitForSelector('#faux-google', { timeout: 8000 });
  await connecterGoogleNav(G2, JOUEUR);
  await cliquer(G2.page, 'restaurer', 'Récupéré');
  const gG2 = await garage(G2.page);
  v('Google · téléphone NEUF, même compte Google, « Récupérer » : le même garage revient, photo comprise',
    !!gG2['ferrari-f40'] && !!gG2['alpine-a110'] && gG2['ferrari-f40'].photos.length === 1, JSON.stringify(Object.keys(gG2)));
  await cliquer(G2.page, 'deconnecter', 'Déconnecté');
  v('Google · déconnexion : session oubliée, reconnexion automatique coupée (recommandation de Google)',
    !(await G2.page.evaluate(() => window.GMCompte.etat().connecte)) && (await G2.page.evaluate(() => window.__gsiDeco)) >= 1);
  await G2.page.waitForSelector('#faux-google', { timeout: 8000 });
  v('Google · après déconnexion, le bouton revient sans recharger le script ni réinitialiser',
    G2.requetesGoogle.length === 1 && (await G2.page.evaluate(() => window.__gsiInit)) === 1, `${G2.requetesGoogle.length} requête(s), init ${await G2.page.evaluate(() => window.__gsiInit)}`);
  sqlite.prepare("INSERT INTO utilisateurs (id, email, cree) VALUES ('banc-pro', 'pro@entreprise.fr', 0)").run();
  await connecterGoogleNav(G2, { sub: '8000000000000000000008', email: 'pro@entreprise.fr' });
  v('Google · adresse non Gmail déjà inscrite par code : message clair, aucune connexion',
    /code reçu par e-mail/.test(await G2.page.textContent('#gcp-msg')) && !(await G2.page.evaluate(() => window.GMCompte.etat().connecte)), await G2.page.textContent('#gcp-msg'));
  const G3 = await telephone(true, { google: true, bloquerGoogle: true });
  await ouvrirReglages(G3.page);
  await G3.page.waitForFunction(() => /indisponible/.test(document.getElementById('gcp-msg')?.textContent || ''), null, { timeout: 8000 }).catch(() => {});
  v('Google · script de Google bloqué (hors ligne, bloqueur) : message clair, le code par e-mail reste proposé',
    /indisponible/.test(await G3.page.textContent('#gcp-msg')) && !!(await G3.page.$('#gcp-email')) && !(await G3.page.$('#gcp-google')), await G3.page.textContent('#gcp-msg'));

  /* 4 septies. Seconde relecture (10/11) : une sauvegarde ne doit JAMAIS faire disparaître du
     cloud une voiture qui n'a pas été retirée volontairement (pierre tombale). */
  sqlite.prepare('DELETE FROM limites').run();
  const attendreMsg = (page, t, ms = 15000) => page.waitForFunction(x => (document.getElementById('gcp-msg')?.textContent || '').includes(x), t, { timeout: ms }).then(() => true, () => false);
  const reinitialiser = async (page) => {
    await ouvrirReglages(page);
    await page.click('[data-act="reset"]');
    await page.waitForSelector('#confirmWrap [data-cf="1"]', { timeout: 5000 });
    const texte = await page.textContent('#confirmWrap');
    await page.click('#confirmWrap [data-cf="1"]'); await page.waitForTimeout(400);
    return texte;
  };
  const K1 = await telephone();
  await idb(K1.page, 'put', [prise('ferrari-f40', [PH('K')]), prise('peugeot-205', [PH('L')])]);
  await recharger(K1.page); await connecter(K1.page, 'garde@exemple.fr');
  await ouvrirReglages(K1.page); await cliquer(K1.page, 'sauvegarder', 'Sauvegardé');
  const idGarde = sqlite.prepare("SELECT id FROM utilisateurs WHERE email = 'garde@exemple.fr'").get().id;
  const ecrireCloud = (donnees) => sqlite.prepare('UPDATE garages SET donnees = ?, version = version + 1 WHERE utilisateur = ?').run(JSON.stringify(donnees), idGarde);
  // (a) « Réinitialiser le garage » puis « Sauvegarder »
  const texteReset = await reinitialiser(K1.page);
  v('garde · (préalable) « Réinitialiser » a vidé le garage local', Object.keys(await garage(K1.page)).length === 0);
  v('garde · connecté : la confirmation de « Réinitialiser » dit que la sauvegarde cloud est conservée', /cloud/i.test(texteReset), texteReset.slice(0, 220));
  await ouvrirReglages(K1.page); await K1.page.click('[data-gcp="sauvegarder"]'); await attendreMsg(K1.page, 'Sauvegardé');
  let cgGarde = cloudDe('garde@exemple.fr');
  v('garde · « Réinitialiser » puis « Sauvegarder » : le cloud garde ses 2 voitures (avant : sauvegarde vidée, sans un mot)', cgGarde.donnees.spots.length === 2, cgGarde.donnees.spots.length);
  v('garde · … elles reviennent sur le téléphone, et le message le dit',
    Object.keys(await garage(K1.page)).length === 2 && /récupérée/.test(await K1.page.textContent('#gcp-msg')), await K1.page.textContent('#gcp-msg'));
  // (b) Session ouverte AVANT cette garde : l'appareil ne sait pas ce que contient le cloud.
  await K1.page.evaluate(() => { const e = JSON.parse(localStorage.getItem('gm-compte')); delete e.ids; localStorage.setItem('gm-compte', JSON.stringify(e)); });
  await reinitialiser(K1.page);
  await ouvrirReglages(K1.page); await K1.page.click('[data-gcp="sauvegarder"]'); await attendreMsg(K1.page, 'Sauvegardé');
  cgGarde = cloudDe('garde@exemple.fr');
  v('garde · session ouverte avant cette garde (contenu du cloud inconnu) : on récupère d\'abord, rien n\'est perdu', cgGarde.donnees.spots.length === 2 && Object.keys(await garage(K1.page)).length === 2, cgGarde.donnees.spots.length);
  // (c) Voiture ajoutée par une version PLUS RÉCENTE de l'app : id inconnu ici.
  const futur = { carId: 'voiture-du-futur', at: '2026-10-01T12:00:00.000Z', coords: null, loc: 'Demain', note: 'ajoutée par une version plus récente',
    photos: [shaDe(PH('K'))], cover: 0, variants: [], favorite: false, maj: maintenant() };
  const fantaisie = { carId: 'Pas Un Identifiant !', at: '2026-10-01T12:00:00.000Z', photos: [], note: 'entrée fantaisiste' };
  ecrireCloud({ ...cgGarde.donnees, spots: [...cgGarde.donnees.spots, futur, fantaisie] });
  await ouvrirReglages(K1.page); await K1.page.click('[data-gcp="restaurer"]'); await attendreMsg(K1.page, 'Récupéré');
  await idb(K1.page, 'put', [{ ...prise('bmw-m3', [PH('M')]), maj: maintenant() }]); await recharger(K1.page);
  await ouvrirReglages(K1.page); await K1.page.click('[data-gcp="sauvegarder"]'); await attendreMsg(K1.page, 'Sauvegardé');
  cgGarde = cloudDe('garde@exemple.fr');
  const futurApres = cgGarde.donnees.spots.find(x => x.carId === 'voiture-du-futur');
  v('garde · voiture d\'une version plus récente (id inconnu ici) : conservée telle quelle au cloud après une sauvegarde faite d\'ici',
    !!futurApres && futurApres.note === futur.note && futurApres.photos[0] === futur.photos[0] && cgGarde.donnees.spots.some(x => x.carId === 'bmw-m3'), JSON.stringify(cgGarde.donnees.spots.map(x => x.carId)));
  v('garde · … sans entrer dans le garage local, ni dans son registre', !(await garage(K1.page))['voiture-du-futur']);
  await K1.page.click('[data-gcp="sauvegarder"]'); await attendreMsg(K1.page, 'Sauvegardé');
  v('garde · … et elle survit aussi aux sauvegardes suivantes', cloudDe('garde@exemple.fr').donnees.spots.some(x => x.carId === 'voiture-du-futur'));
  v('garde · … mais une entrée fantaisiste (identifiant impossible) n\'est pas conservée indéfiniment', !cloudDe('garde@exemple.fr').donnees.spots.some(x => x.carId === fantaisie.carId));
  /* La garde ne doit PAS se déclencher à tort : un retrait volontaire (pierre tombale) et un doublon
     de catalogue fusionné ne sont pas des pertes. Sinon, chaque sauvegarde retélécharge tout le garage. */
  ecrireCloud({ ...cloudDe('garde@exemple.fr').donnees, spots: cloudDe('garde@exemple.fr').donnees.spots.filter(x => x.carId !== 'voiture-du-futur') });
  await K1.page.click('[data-gcp="restaurer"]'); await attendreMsg(K1.page, 'Récupéré');
  await retirerViaApp(K1.page, 'peugeot-205');
  await ouvrirReglages(K1.page);
  let appelsGarde = appelsApi;
  await K1.page.click('[data-gcp="sauvegarder"]'); await attendreMsg(K1.page, 'Sauvegardé');
  v('garde · voiture retirée volontairement : sauvegarde directe, sans récupération préalable (2 appels), et elle quitte le cloud',
    appelsApi - appelsGarde === 2 && !cloudDe('garde@exemple.fr').donnees.spots.some(x => x.carId === 'peugeot-205'), appelsApi - appelsGarde);
  // Le cloud contient une prise sous un identifiant RETIRÉ du catalogue (doublon fusionné) : l'app la range sous l'identifiant conservé.
  cgGarde = cloudDe('garde@exemple.fr');
  ecrireCloud({ ...cgGarde.donnees, spots: [...cgGarde.donnees.spots, { ...prise('bmw-serie-3', []), maj: maintenant() }] });
  await K1.page.click('[data-gcp="restaurer"]'); await attendreMsg(K1.page, 'Récupéré');
  appelsGarde = appelsApi;
  await K1.page.click('[data-gcp="sauvegarder"]'); await attendreMsg(K1.page, 'Sauvegardé');
  cgGarde = cloudDe('garde@exemple.fr');
  v('garde · doublon de catalogue fusionné (bmw-serie-3 → bmw-serie3) : pas de récupération à chaque sauvegarde, et le cloud ne garde que l\'identifiant conservé',
    appelsApi - appelsGarde === 2 && !!(await garage(K1.page))['bmw-serie3'] && cgGarde.donnees.spots.some(x => x.carId === 'bmw-serie3') && !cgGarde.donnees.spots.some(x => x.carId === 'bmw-serie-3'),
    `${appelsApi - appelsGarde} appels · ${JSON.stringify(cgGarde.donnees.spots.map(x => x.carId))}`);
  // (d) Sauvegarde et récupération lancées en même temps : la version annoncée doit être celle de l'EXPORT.
  sqlite.prepare('DELETE FROM limites').run();
  const K2 = await telephone();
  await connecter(K2.page, 'garde@exemple.fr');
  await ouvrirReglages(K2.page); await K2.page.click('[data-gcp="restaurer"]'); await attendreMsg(K2.page, 'Récupéré');
  await idb(K2.page, 'put', [{ ...prise('alpine-a110', [PH('N')]), maj: maintenant() }]); await recharger(K2.page);
  await ouvrirReglages(K2.page); await K2.page.click('[data-gcp="sauvegarder"]'); await attendreMsg(K2.page, 'Sauvegardé');
  await idb(K1.page, 'put', [{ ...prise('porsche-911', [PH('O')]), maj: maintenant() }]); await recharger(K1.page);
  ralentir = (req) => req.method === 'PUT' && req.url.startsWith('/photos/') ? 1500 : 0;
  const course = await K1.page.evaluate(() => Promise.all([window.GMCompte.sauvegarder(), window.GMCompte.restaurer()]).then(() => 'ok', e => 'erreur : ' + (e && e.message)));
  ralentir = null;
  cgGarde = cloudDe('garde@exemple.fr');
  const idsCourse = cgGarde.donnees.spots.map(x => x.carId);
  v('garde · sauvegarde et récupération simultanées : la voiture de l\'autre appareil n\'est pas écrasée au cloud',
    course === 'ok' && idsCourse.includes('alpine-a110') && idsCourse.includes('porsche-911'), `${course} · ${JSON.stringify(idsCourse)}`);
  /* Même course, mais entre DEUX ONGLETS de l'app (même appareil, même état de session
     dans localStorage) : la file d'attente ne les sépare pas. Seule la version lue AVEC
     l'export protège : sinon l'onglet qui sauve annonce la version que l'autre vient de
     récupérer, avec un contenu qui ne la contient pas. */
  await idb(K2.page, 'put', [{ ...prise('lancia-delta', [PH('P')]), maj: maintenant() }]); await recharger(K2.page);
  await ouvrirReglages(K2.page); await K2.page.click('[data-gcp="sauvegarder"]'); await attendreMsg(K2.page, 'Sauvegardé');
  await idb(K1.page, 'put', [{ ...prise('fiat-500', [PH('Q')]), maj: maintenant() }]); await recharger(K1.page);
  const onglet2 = await K1.ctx.newPage(); onglet2.on('pageerror', e => erreurs.push(String(e)));
  await onglet2.goto(URL_APP, { waitUntil: 'networkidle' }); await onglet2.waitForFunction(() => window.GMCompte && window.GMGarage, { timeout: 15000 });
  ralentir = (req) => req.method === 'PUT' && req.url.startsWith('/photos/') ? 1500 : 0;
  const sauveOnglet1 = K1.page.evaluate(() => window.GMCompte.sauvegarder().then(() => 'ok', e => 'erreur : ' + (e && e.message)));
  await K1.page.waitForTimeout(500);
  const recupOnglet2 = await onglet2.evaluate(() => window.GMCompte.restaurer().then(() => 'ok', e => 'erreur : ' + (e && e.message)));
  const resOnglet1 = await sauveOnglet1;
  ralentir = null;
  const idsOnglets = cloudDe('garde@exemple.fr').donnees.spots.map(x => x.carId);
  v('garde · deux onglets : l\'un sauvegarde pendant que l\'autre récupère — la voiture de l\'autre appareil reste au cloud',
    resOnglet1 === 'ok' && recupOnglet2 === 'ok' && idsOnglets.includes('lancia-delta') && idsOnglets.includes('fiat-500'), `${resOnglet1} · ${recupOnglet2} · ${JSON.stringify(idsOnglets)}`);
  await onglet2.close();
  // (e) Serveur qui ne répond pas : un délai, un message, et le bouton redevient utilisable.
  sqlite.prepare('DELETE FROM limites').run();
  const K3 = await telephone(true, { delai: 800 });           // requêtes courtes : 0,8 s ; envois lourds (collection, photos) : 3,2 s
  await connecter(K3.page, 'garde@exemple.fr');
  ralentir = (req) => req.method === 'GET' && req.url === '/garage' ? 6000 : 0;
  await ouvrirReglages(K3.page); await K3.page.click('[data-gcp="restaurer"]');
  const dit = await attendreMsg(K3.page, 'ne répond pas', 5000);
  v('serveur muet : la récupération s\'arrête au délai, avec un message (avant : « en cours… » sans fin)',
    dit && await K3.page.evaluate(() => !document.querySelector('[data-gcp="restaurer"]').disabled) && Object.keys(await garage(K3.page)).length === 0, await K3.page.textContent('#gcp-msg'));
  ralentir = null; await K3.page.waitForTimeout(4000);
  // (f) Contenu du cloud malformé : pas plus digne de confiance qu'un fichier reçu.
  ecrireCloud({ app: 'garage-manifest', version: 1, meta: {}, custom: { list: [] }, spots: [null, 'x', 7,
    { carId: 'lambo-miura', at: '2026-09-01T12:00:00.000Z', photos: 'pas-un-tableau' }, { carId: 'ferrari-f40', at: '2026-09-01T12:00:00.000Z', photos: [null, 5, 'zz'] }] });
  await ouvrirReglages(K3.page); await K3.page.click('[data-gcp="restaurer"]');
  const okMalforme = await attendreMsg(K3.page, 'Récupéré', 8000);
  v('cloud malformé : aucune requête pour une « photo » qui n\'est pas une empreinte', photosInvalides.length === 0, JSON.stringify(photosInvalides));
  v('cloud malformé (entrées nulles, photos qui ne sont pas une liste) : récupération sans plantage, les prises valides arrivent',
    okMalforme && !!(await garage(K3.page))['lambo-miura'] && !!(await garage(K3.page))['ferrari-f40'], await K3.page.textContent('#gcp-msg'));
  ecrireCloud({ app: 'garage-manifest', spots: { pas: 'une liste' } });
  await K3.page.click('[data-gcp="restaurer"]');
  v('cloud malformé (« spots » n\'est pas une liste) : message normal, rien de cassé', await attendreMsg(K3.page, 'Récupéré', 8000), await K3.page.textContent('#gcp-msg'));

  /* 4 octies. Relecture du 19/11, défauts vus en PRODUCTION (captures du propriétaire) */
  const LT = await telephone();
  await idb(LT.page, 'put', [prise('lambo-miura', [PH('L')]), prise('ferrari-f40', [PH('M')])]);
  await recharger(LT.page);
  await connecter(LT.page, 'lecteur@exemple.fr');
  await ouvrirReglages(LT.page);
  /* F-8 : avant toute sauvegarde, l'app ne SAIT pas si le serveur garde les photos.
     Le panneau annonçait « Collection et photos » — faux sur le serveur en essai. */
  const texteAvant = await LT.page.textContent('#gcp-compte');
  v('F-8 · avant la 1re sauvegarde : le panneau ne promet pas les photos (état inconnu)',
    !/Collection et photos/.test(texteAvant) && !/Collection seule/.test(texteAvant) && /retrouvable sur tous tes appareils/.test(texteAvant), texteAvant);
  /* F-9 : le message de sauvegarde était en bas du panneau, hors de l'écran et sous le
     bandeau partenaire : « Sauvegarder ne me dit rien ». Le bouton est placé au milieu de
     l'écran, comme sur la capture ; le message doit être VU (dans l'écran, non recouvert). */
  const messageVu = (page) => page.evaluate(() => {
    const m = document.getElementById('gcp-msg'); if (!m || !m.textContent.trim()) return 'vide';
    const r = m.getBoundingClientRect(); const x = r.left + Math.min(r.width / 2, 40), y = r.top + r.height / 2;
    if (!(r.height > 0 && y > 0 && y < innerHeight)) return 'hors écran (y=' + Math.round(y) + ')';
    const dessus = document.elementFromPoint(x, y);
    return dessus === m || m.contains(dessus) ? true : 'recouvert par ' + (dessus && (dessus.id || dessus.className || dessus.tagName));
  });
  await LT.page.evaluate(() => document.querySelector('[data-gcp="sauvegarder"]').scrollIntoView({ block: 'center' }));
  await LT.page.evaluate(() => document.querySelector('[data-gcp="sauvegarder"]').click());
  await attendreMsg(LT.page, 'Sauvegardé');
  v('F-9 · après « Sauvegarder » : le message est visible à l\'écran (pas sous le bandeau)', (await messageVu(LT.page)) === true, await messageVu(LT.page));
  v('F-9 · … et placé juste sous la ligne du bouton touché (là où le regard est déjà)',
    await LT.page.evaluate(() => { const prec = document.getElementById('gcp-msg')?.previousElementSibling;
      return !!prec && prec.classList.contains('srow') && !!prec.querySelector('[data-gcp="sauvegarder"]'); }));
  /* Bouton touché TOUT EN BAS de l'écran : le message, posé dessous, tomberait hors de
     l'écran → il y est ramené. Vérifié PENDANT la sauvegarde (« en cours »), avant que le
     panneau ne soit redessiné (le redessin fait bouger la page et masquerait le défaut). */
  ralentirReponse = (req) => req.method === 'PUT' && req.url === '/garage' ? 2500 : 0;
  // Petit écran : la fenêtre s'arrête juste sous le bouton (scrollIntoView ne suffit pas, la vue des Réglages ne défile pas ainsi).
  const basBouton = await LT.page.evaluate(() => Math.ceil(document.querySelector('[data-gcp="sauvegarder"]').closest('.srow').getBoundingClientRect().bottom));
  await LT.page.setViewportSize({ width: 390, height: basBouton + 4 });
  await LT.page.evaluate(() => { document.getElementById('gcp-msg').textContent = ''; document.querySelector('[data-gcp="sauvegarder"]').click(); });
  await attendreMsg(LT.page, 'en cours', 5000);
  await LT.page.waitForTimeout(300);
  const vuEnCours = await messageVu(LT.page);
  await attendreMsg(LT.page, 'Sauvegardé');
  ralentirReponse = null;
  await LT.page.setViewportSize({ width: 390, height: 844 });
  v('F-9 · bouton touché en bas de l\'écran : « Sauvegarde en cours… » est ramené à l\'écran', vuEnCours === true, vuEnCours);
  v('F-8 · après la 1re sauvegarde (serveur avec photos) : « Collection et photos »', /Collection et photos/.test(await LT.page.textContent('#gcp-compte')));
  await LT.page.evaluate(() => document.querySelector('[data-gcp="restaurer"]').scrollIntoView({ block: 'center' }));
  await LT.page.evaluate(() => document.querySelector('[data-gcp="restaurer"]').click());
  await attendreMsg(LT.page, 'Récupéré');
  v('F-9 · après « Récupérer » : le message est visible à l\'écran', (await messageVu(LT.page)) === true, await messageVu(LT.page));
  /* F-1 : « Se déconnecter » pendant une sauvegarde. La requête a DÉJÀ agi au serveur,
     sa réponse arrive après la déconnexion : elle réécrivait version et voitures du
     cloud dans l'état d'un appareil déconnecté. La déconnexion attend son tour. */
  await idb(LT.page, 'put', [prise('peugeot-205', [PH('N')])]); await recharger(LT.page); await ouvrirReglages(LT.page);
  /* Le geste part QUAND la collection est déjà écrite au serveur et que sa réponse est en
     route : c'est la fenêtre du défaut (attendre un temps fixe le ratait selon la charge). */
  let putTraite = false;
  const aprèsPutGarage = async () => { for (let i = 0; i < 100 && !putTraite; i++) await new Promise(ok => setTimeout(ok, 100)); };
  ralentirReponse = (req) => { if (req.method === 'PUT' && req.url === '/garage') { putTraite = true; return 2500; } return 0; };
  await LT.page.evaluate(() => document.querySelector('[data-gcp="sauvegarder"]').click());
  await aprèsPutGarage();
  await LT.page.evaluate(() => document.querySelector('[data-gcp="deconnecter"]')?.click());
  await LT.page.waitForFunction(() => !window.GMCompte.etat().connecte, null, { timeout: 15000 }).catch(() => {});
  await LT.page.waitForTimeout(3500);
  ralentirReponse = null;
  const etatL = await LT.page.evaluate(() => JSON.parse(localStorage.getItem('gm-compte') || '{}'));
  v('F-1 · déconnexion pendant une sauvegarde : l\'appareil déconnecté ne garde ni version ni liste du cloud',
    !etatL.session && !etatL.version && !etatL.ids && !etatL.derniere, JSON.stringify(etatL));
  const idLecteur = sqlite.prepare("SELECT id FROM utilisateurs WHERE email = 'lecteur@exemple.fr'").get().id;
  const gL = sqlite.prepare('SELECT donnees FROM garages WHERE utilisateur = ?').get(idLecteur);
  v('F-1 · … et la sauvegarde commencée a bien abouti (3 voitures au cloud)', gL && JSON.parse(gL.donnees).spots.length === 3, gL && JSON.parse(gL.donnees).spots.length);
  /* Même chose avec « Supprimer mon compte » : il attend la fin de la sauvegarde. */
  await connecter(LT.page, 'lecteur@exemple.fr'); await ouvrirReglages(LT.page);
  await cliquer(LT.page, 'restaurer', 'Récupéré');            // appareil à jour : la sauvegarde suivante passe du premier coup
  await idb(LT.page, 'put', [prise('bmw-m3', [PH('P')])]); await recharger(LT.page); await ouvrirReglages(LT.page);
  putTraite = false;
  ralentirReponse = (req) => { if (req.method === 'PUT' && req.url === '/garage') { putTraite = true; return 2500; } return 0; };
  await LT.page.evaluate(() => document.querySelector('[data-gcp="sauvegarder"]').click());
  await aprèsPutGarage();
  await LT.page.evaluate(() => document.querySelector('[data-gcp="supprimer"]')?.click());
  await attendreMsg(LT.page, 'Compte supprimé', 15000);
  await LT.page.waitForTimeout(3500);
  ralentirReponse = null;
  const etatL2 = await LT.page.evaluate(() => JSON.parse(localStorage.getItem('gm-compte') || '{}'));
  v('F-1 · suppression pendant une sauvegarde : rien ne reste sur le serveur, ni dans l\'état de l\'appareil',
    !sqlite.prepare("SELECT 1 FROM utilisateurs WHERE email = 'lecteur@exemple.fr'").get() && !etatL2.version && !etatL2.ids && !etatL2.session, JSON.stringify(etatL2));

  /* 4 nonies. Synchronisation AUTOMATIQUE (20/11, décision du propriétaire : « automatique »).
     Sans elle, chaque téléphone gardait sa collection : la sauvegarde cloud n'était qu'un
     bouton, et un garage pris sur un téléphone n'apparaissait sur l'autre qu'après
     « Sauvegarder » ici et « Récupérer » là-bas. */
  sqlite.prepare('DELETE FROM limites').run();
  const attendre = async (cond, ms = 10000) => { const fin = Date.now() + ms; for (;;) { if (await cond()) return true; if (Date.now() > fin) return false; await new Promise(r => setTimeout(r, 120)); } };
  const MAIL_AUTO = 'auto@exemple.fr';
  const nbCloud = () => ((cloudDe(MAIL_AUTO) || {}).donnees || { spots: [] }).spots.length;
  const geste = (page, ...ps) => page.evaluate(async (ps) => { for (const p of ps) await window.GMGarage.importer({ app: 'garage-manifest', spots: [p] }); }, ps);
  const etatAuto = (page) => page.evaluate(() => window.GMCompte.etat());
  const CORS_PANNE = { 'Access-Control-Allow-Origin': ORIGINE, 'Content-Type': 'application/json' };
  /* Pseudos DIFFÉRENTS sur les deux téléphones : la fusion garde chacun le sien. Leurs
     garages ne sont donc jamais identiques — exactement la situation où, si la récupération
     n'était pas silencieuse, chacun renverrait le sien après chaque récupération, sans fin. */
  const metaAuto = (name) => ({ carId: '__meta__', bonus: 0, missions: {}, friends: [], feed: [], name, ai: '' });
  const AU1 = await telephone(true, { auto: true, synchroMs: 600 });
  await idb(AU1.page, 'put', [prise('ferrari-f40', [PH('a1')]), prise('peugeot-205', [PH('a2')]), metaAuto('Pilote Un')]);
  await recharger(AU1.page);
  v('auto · hors connexion : aucune requête au démarrage', !(await etatAuto(AU1.page)).connecte);
  await connecter(AU1.page, MAIL_AUTO);
  v('auto · connexion : le garage du téléphone part au cloud SANS toucher « Sauvegarder », photos comprises',
    await attendre(() => nbCloud() === 2) && [...env.PHOTOS._m.keys()].some(k => k.endsWith(shaDe(PH('a1')))), nbCloud());
  const AU2 = await telephone(true, { auto: true, synchroMs: 600 });
  await idb(AU2.page, 'put', [metaAuto('Pilote Deux')]); await recharger(AU2.page);
  await connecter(AU2.page, MAIL_AUTO);
  v('auto · second téléphone (vide) : il reçoit le garage à la connexion, SANS « Récupérer », photos comprises',
    await attendre(async () => { const g = await garage(AU2.page); return !!g['ferrari-f40'] && !!g['peugeot-205'] && g['ferrari-f40'].photos[0] === PH('a1'); }));
  await AU2.page.waitForTimeout(1200);
  // Deux gestes en rafale : un seul envoi, après le calme
  /* Compté en VERSIONS du cloud (écritures acceptées), pas en requêtes : le téléphone 1 ne
     sait pas encore que le 2 a écrit à sa connexion — son envoi reçoit un 409, il récupère
     puis renvoie. Deux requêtes, une seule écriture : c'est le comportement voulu. */
  let ecr = ecrituresGarage; const verRafale = cloudDe(MAIL_AUTO).version;
  // Deux gestes à 300 ms d'écart (moins que le calme attendu) : une vraie rafale, pas deux écritures du même instant.
  await geste(AU1.page, prise('bmw-m3', [PH('a3')])); await AU1.page.waitForTimeout(300); await geste(AU1.page, prise('lambo-miura', [PH('a4')]));
  v('auto · deux gestes coup sur coup sur le téléphone 1 : ils partent au cloud tout seuls', await attendre(() => nbCloud() === 4), nbCloud());
  await AU1.page.waitForTimeout(1500);
  v('… en UN seul envoi (calme attendu après le dernier geste)', cloudDe(MAIL_AUTO).version - verRafale === 1, { versions: cloudDe(MAIL_AUTO).version - verRafale, requetes: ecrituresGarage - ecr });
  await recharger(AU2.page);
  v('auto · le téléphone 2 rouvre l\'app : les nouvelles voitures arrivent seules',
    await attendre(async () => { const g = await garage(AU2.page); return !!g['bmw-m3'] && !!g['lambo-miura'] && g['bmw-m3'].photos[0] === PH('a3'); }));
  // Pas d'aller-retour entre les deux téléphones
  await AU2.page.waitForTimeout(1500);
  ecr = ecrituresGarage; const verStable = cloudDe(MAIL_AUTO).version;
  for (let i = 0; i < 2; i++) { await recharger(AU1.page); await recharger(AU2.page); }
  await AU1.page.waitForTimeout(2500);
  v('auto · pas d\'aller-retour : rouvrir les deux téléphones (× 2), aux pseudos différents, ne réécrit RIEN au cloud',
    ecrituresGarage === ecr && cloudDe(MAIL_AUTO).version === verStable, { ecritures: ecrituresGarage - ecr, version: [verStable, cloudDe(MAIL_AUTO).version] });
  v('… et chacun garde son pseudo', (await AU1.page.evaluate(() => window.GMGarage.exporter().meta.name)) === 'Pilote Un' && (await AU2.page.evaluate(() => window.GMGarage.exporter().meta.name)) === 'Pilote Deux');
  /* Un geste PENDANT un envoi (photos lentes) : il n'est pas dans ce qui part, il ne doit
     donc pas être marqué « envoyé » — il part au tour suivant. */
  ralentir = (req) => req.method === 'PUT' && req.url.startsWith('/photos/') ? 2000 : 0;
  await geste(AU1.page, prise('renault-5', [PH('b1')]));
  await attendre(() => AU1.page.evaluate(() => window.GMCompte.etat().synchroEnCours), 5000);
  await AU1.page.waitForTimeout(400);
  await geste(AU1.page, prise('renault-twingo', [PH('b2')]));
  const pendantEnvoi = await attendre(() => { const ids = ((cloudDe(MAIL_AUTO) || {}).donnees || { spots: [] }).spots.map(x => x.carId); return ids.includes('renault-5') && ids.includes('renault-twingo'); }, 15000);
  ralentir = null;
  v('auto · un geste fait PENDANT un envoi n\'est pas perdu : il part au tour suivant', pendantEnvoi, ((cloudDe(MAIL_AUTO) || {}).donnees || { spots: [] }).spots.map(x => x.carId));
  await AU1.page.waitForTimeout(1500);
  await recharger(AU2.page); await attendre(async () => Object.keys(await garage(AU2.page)).length === nbCloud());
  await AU2.page.waitForTimeout(1500);
  ecr = ecrituresGarage;
  /* La synchronisation n'agit JAMAIS avant que la collection soit chargée : avant, exporter()
     rendrait un garage vide, et une récupération écrirait dans une app à moitié démarrée. */
  await AU1.ctx.addInitScript((api) => {
    window.__ordre = [];
    window.addEventListener('gm:pret', () => window.__ordre.push('pret'));
    const f = window.fetch; window.fetch = function (u, o) { if (String(u).startsWith(api)) window.__ordre.push('requete'); return f.apply(this, arguments); };
  }, URL_API);
  await recharger(AU1.page);
  await attendre(() => AU1.page.evaluate(() => window.__ordre.includes('requete')), 5000);
  const ordre = await AU1.page.evaluate(() => window.__ordre);
  v('auto · à l\'ouverture, aucune requête de synchronisation avant que la collection soit chargée', ordre[0] === 'pret' && ordre.includes('requete'), ordre);
  await AU1.page.waitForTimeout(1200);
  ecr = ecrituresGarage;
  // Une écriture qui ne change pas le contenu : aucun envoi
  await AU1.page.evaluate(() => window.dispatchEvent(new CustomEvent('gm:collection')));
  await AU1.page.waitForTimeout(1500);
  v('auto · une écriture qui ne change rien au contenu : aucun envoi (signature identique), plus rien en attente',
    ecrituresGarage === ecr && !(await etatAuto(AU1.page)).aEnvoyer, ecrituresGarage - ecr);
  // La ligne d'état, puis désactiver / réactiver
  await ouvrirReglages(AU1.page);
  v('auto · Réglages : la ligne « Synchronisation automatique » dit que tout est à jour', /à jour/.test(await AU1.page.textContent('#gcp-sync')), await AU1.page.textContent('#gcp-sync'));
  await cliquer(AU1.page, 'auto', 'utilise « Sauvegarder »');
  ecr = ecrituresGarage;
  await geste(AU1.page, prise('alpine-a110', [PH('a5')]));
  await AU1.page.waitForTimeout(1500);
  const eOff = await etatAuto(AU1.page);
  v('auto · désactivée : un geste ne part plus au cloud ; il est noté « en attente »',
    ecrituresGarage === ecr && eOff.aEnvoyer && !eOff.synchroAuto && /Désactivée/.test(await AU1.page.textContent('#gcp-sync')), { ecritures: ecrituresGarage - ecr, ligne: await AU1.page.textContent('#gcp-sync') });
  v('… et le choix survit à la réouverture de l\'app', await (async () => { await recharger(AU1.page); return !(await etatAuto(AU1.page)).synchroAuto && ecrituresGarage === ecr; })());
  await ouvrirReglages(AU1.page);
  await cliquer(AU1.page, 'auto', 'part maintenant');
  v('auto · réactivée : ce qui attendait part tout de suite', await attendre(() => nbCloud() === 7), nbCloud());
  // Serveur en panne : rien n'est perdu, la ligne d'état le dit, et l'envoi repart au retour du réseau
  await AU1.ctx.route(`${URL_API}/garage`, r => r.request().method() === 'PUT' ? r.fulfill({ status: 503, body: '{"erreur":"indisponible"}', headers: CORS_PANNE }) : r.continue());
  await geste(AU1.page, prise('renault-clio', [PH('a6')]));
  const panneVue = await attendre(async () => !!(await etatAuto(AU1.page)).erreurSynchro, 6000);
  const lignePanne = await AU1.page.textContent('#gcp-sync').catch(() => '');
  v('auto · serveur en panne : la ligne d\'état le dit, la modification reste en attente',
    panneVue && /Pas encore à jour/.test(lignePanne) && (await etatAuto(AU1.page)).aEnvoyer && nbCloud() === 7, lignePanne);
  await AU1.ctx.unroute(`${URL_API}/garage`);
  await AU1.page.evaluate(() => window.dispatchEvent(new Event('online')));
  v('auto · réseau revenu : l\'envoi repart seul, et la ligne d\'état redevient « à jour »',
    await attendre(() => nbCloud() === 8) && await attendre(async () => /à jour/.test(await AU1.page.textContent('#gcp-sync').catch(() => '')), 4000), await AU1.page.textContent('#gcp-sync').catch(() => ''));
  // « Réinitialiser le garage » connecté : remise à zéro LOCALE, le cloud n'est pas vidé et le garage revient
  await recharger(AU2.page); await attendre(async () => Object.keys(await garage(AU2.page)).length === 8);
  await ouvrirReglages(AU2.page);
  await AU2.page.click('[data-act="reset"]'); await AU2.page.waitForSelector('[data-cf="1"]', { timeout: 5000 });
  const questionReset = await AU2.page.textContent('#confirmWrap').catch(() => '');
  await AU2.page.click('[data-cf="1"]');
  v('auto · « Réinitialiser » connecté : le cloud n\'est PAS vidé, et le garage revient tout seul sur ce téléphone',
    await attendre(async () => Object.keys(await garage(AU2.page)).length === 8) && nbCloud() === 8 && /prochaine synchronisation/.test(questionReset), { local: Object.keys(await garage(AU2.page)).length, cloud: nbCloud(), questionReset });
  /* Récupération en PANNE à l'ouverture de l'app (relecture du 21/11) : elle réessaie seule,
     sans attendre un retour sur l'app ni un retour du réseau. */
  await AU1.ctx.addInitScript(() => { window.GM_COMPTE_RELANCE_MS = 800; });
  let pannesGet = 0;
  await AU1.ctx.route(`${URL_API}/garage`, r => (r.request().method() === 'GET' && pannesGet++ === 0) ? r.fulfill({ status: 503, body: '{"erreur":"indisponible"}', headers: CORS_PANNE }) : r.continue());
  await geste(AU2.page, prise('renault-megane', [PH('d1')]));
  await attendre(() => nbCloud() === 9);
  await recharger(AU1.page);
  v('auto · récupération en panne à l\'ouverture : nouvel essai tout seul, la voiture de l\'autre téléphone arrive',
    await attendre(async () => !!(await garage(AU1.page))['renault-megane'], 8000) && pannesGet >= 2, { pannesGet, cloud: nbCloud() });
  await AU1.ctx.unroute(`${URL_API}/garage`);
  // App passée en arrière-plan : ce qui attend part tout de suite, sans attendre le calme
  sqlite.prepare('DELETE FROM limites').run();
  const AU3 = await telephone(true, { auto: true, synchroMs: 60000 });
  await connecter(AU3.page, MAIL_AUTO);
  await attendre(async () => Object.keys(await garage(AU3.page)).length === 9);
  await AU3.page.waitForTimeout(800);
  await geste(AU3.page, prise('renault-captur', [PH('a7')]));
  await AU3.page.waitForTimeout(300);
  await AU3.page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  v('auto · geste puis app en arrière-plan : envoyé aussitôt (le calme de 60 s n\'est pas attendu)', await attendre(() => nbCloud() === 10, 6000), nbCloud());
  // App FERMÉE avant que l'envoi ait pu se faire : la modification attend, et part à la réouverture
  await recharger(AU3.page);
  await AU3.ctx.route(`${URL_API}/garage`, r => r.request().method() === 'PUT' ? r.abort() : r.continue());
  await geste(AU3.page, prise('renault-zoe', [PH('a8')]));
  await AU3.page.waitForTimeout(300);
  v('(préparation) le geste est noté en attente', (await etatAuto(AU3.page)).aEnvoyer);
  await AU3.page.close();
  await AU3.ctx.unroute(`${URL_API}/garage`);
  AU3.page = await AU3.ctx.newPage(); AU3.page.on('pageerror', e => erreurs.push(String(e)));
  await AU3.page.goto(URL_APP, { waitUntil: 'networkidle' }); await AU3.page.waitForFunction(() => window.GMGarage, { timeout: 15000 });
  v('auto · app fermée avant l\'envoi : à la réouverture, ce qui attendait part', await attendre(() => nbCloud() === 11, 8000), nbCloud());
  /* Un geste fait PENDANT une récupération silencieuse (relecture du 21/11) : le silence
     était GLOBAL, il couvrait aussi les gestes du joueur, qui n'étaient alors jamais envoyés. */
  await AU3.page.waitForTimeout(800);
  const dejaPris = new Set(['ferrari-f40', 'peugeot-205', 'bmw-m3', 'lambo-miura', 'alpine-a110', 'renault-clio', 'renault-5', 'renault-twingo', 'renault-captur', 'renault-zoe', 'renault-4', 'renault-megane', 'renault-espace']);
  const lotSilence = [...fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8').matchAll(/\{ id: "([a-z0-9-]+)"/g)].map(m => m[1]).filter(id => !dejaPris.has(id)).slice(0, 40).map(id => prise(id, [PH('zz')]));
  v('(préparation) rien en attente avant le geste', !(await etatAuto(AU3.page)).aEnvoyer);
  await AU3.page.evaluate(async ([lot, p]) => {
    const recuperation = window.GMGarage.importer({ app: 'garage-manifest', spots: lot }, { fusion: true, silencieux: true });
    await new Promise(r => setTimeout(r, 0));
    await window.GMGarage.importer({ app: 'garage-manifest', spots: [p] });       // le geste du joueur, au même moment
    await recuperation;
  }, [lotSilence, prise('renault-espace', [PH('c1')])]);
  await AU3.page.waitForTimeout(300);
  v('auto · un geste fait PENDANT une récupération silencieuse est noté « à envoyer »', (await etatAuto(AU3.page)).aEnvoyer);
  await AU3.page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  v('… et il part au cloud', await attendre(() => (((cloudDe(MAIL_AUTO) || {}).donnees || { spots: [] }).spots).some(x => x.carId === 'renault-espace'), 8000));
  // Déconnecté : plus aucun échange. Synchro d'abord DÉSACTIVÉE : ce choix doit survivre à la déconnexion.
  await ouvrirReglages(AU3.page); await cliquer(AU3.page, 'auto', 'utilise « Sauvegarder »');
  await cliquer(AU3.page, 'deconnecter', 'Déconnecté');
  v('auto · « désactivée » survit à la déconnexion (préférence de l\'appareil, pas du compte)', (await etatAuto(AU3.page)).synchroAuto === false);
  const appelsDeco = appelsApi;
  await geste(AU3.page, prise('renault-4', [PH('a9')]));
  await AU3.page.waitForTimeout(1500);
  v('auto · déconnecté : un geste ne contacte plus le serveur, rien n\'est noté pour le compte', appelsApi === appelsDeco && !(await etatAuto(AU3.page)).aEnvoyer, appelsApi - appelsDeco);
  // Deux comptes sur un même appareil : la signature et la version du premier ne passent pas au second
  const etatDeco = await AU3.page.evaluate(() => JSON.parse(localStorage.getItem('gm-compte') || '{}'));
  v('auto · après déconnexion : ni version, ni signature, ni modification en attente ne restent', !etatDeco.version && !etatDeco.empreinteCloud && !etatDeco.modif, JSON.stringify(etatDeco));
  /* Mode essai (serveur sans stockage photo) puis R2 branché : la photo restée sur le
     téléphone part TOUTE SEULE (relecture du 21/11 : le garage étant identique au cloud,
     la synchro concluait « rien à envoyer » et la photo n'aurait jamais quitté l'appareil). */
  sqlite.prepare('DELETE FROM limites').run();
  const r2Auto = env.PHOTOS; delete env.PHOTOS;
  const AU4 = await telephone(true, { auto: true, synchroMs: 600 });
  await idb(AU4.page, 'put', [prise('alpine-a110', [PH('e1')])]); await recharger(AU4.page);
  await connecter(AU4.page, 'essai-auto@exemple.fr');
  const photoE1 = () => [...r2Auto._m.keys()].some(k => k.endsWith(shaDe(PH('e1'))));
  const cloudEssai = () => cloudDe('essai-auto@exemple.fr');
  v('(préparation) mode essai : collection au cloud, sans la photo', await attendre(() => !!cloudEssai()) && !photoE1() && (await etatAuto(AU4.page)).sansPhotos);
  env.PHOTOS = r2Auto;
  await AU4.page.waitForTimeout(800);
  await AU4.page.evaluate(() => window.dispatchEvent(new CustomEvent('gm:collection')));
  v('auto · R2 branché ensuite : la photo restée sur le téléphone part toute seule', await attendre(photoE1, 8000));

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
  v('non configuré : aucune requête vers Google', D.requetesGoogle.length === 0, JSON.stringify(D.requetesGoogle));

  /* 7. Configuration de PRODUCTION (18/11) : l'adresse du vrai serveur est inscrite dans
     gm-compte.js. Sans surcharge, l'app doit afficher le panneau — et ne contacter le
     serveur QU'À la demande du joueur : ni au démarrage, ni à l'ouverture des Réglages. */
  const source = fs.readFileSync(path.join(RACINE, 'gm-compte.js'), 'utf8');
  const urlProd = (/const COMPTE_URL = '([^']*)'/.exec(source) || [])[1];
  v('production : COMPTE_URL est une adresse https du serveur de comptes, sans « / » final',
    /^https:\/\/garage-comptes\.[a-z0-9-]+\.workers\.dev$/.test(urlProd || ''), urlProd);
  const idProd = (/const GOOGLE_CLIENT_ID = '([^']*)'/.exec(source) || [])[1];
  v('production : GOOGLE_CLIENT_ID est un identifiant client Google (public, « ….apps.googleusercontent.com »)',
    /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(idProd || ''), idProd);
  const Prod = await telephone('production');
  await Prod.page.waitForTimeout(800);
  const googleAuDemarrage = Prod.requetesGoogle.length;
  await ouvrirReglages(Prod.page);
  await Prod.page.waitForSelector('#gcp-google #faux-google', { timeout: 8000 }).catch(() => null);
  v('production : le panneau « Compte » est proposé (adresse e-mail et code)', !!(await Prod.page.$('#gcp-compte #gcp-email')));
  v('production : aucune requête vers le serveur au démarrage ni à l\'ouverture des Réglages', Prod.versProduction.length === 0, JSON.stringify(Prod.versProduction));
  v('production : Google n\'est pas contacté au démarrage de l\'app', googleAuDemarrage === 0, googleAuDemarrage);
  v('production : à l\'ouverture du panneau Compte, le script de Google est chargé UNE fois, avec l\'identifiant inscrit, et le bouton apparaît',
    Prod.requetesGoogle.length === 1 && /accounts\.google\.com\/gsi\/client/.test(Prod.requetesGoogle[0] || '')
    && await Prod.page.evaluate(id => !!window.__gsi && window.__gsi.client_id === id, idProd) && !!(await Prod.page.$('#gcp-google #faux-google')),
    JSON.stringify(Prod.requetesGoogle));

  v('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));

  await nav.close(); app.close(); api.close(); globalThis.fetch = fetchReel; try { fs.unlinkSync(tmp); } catch {}
  let ko = 0; for (const x of res) { if (!x.ok) ko++; console.log(`  ${x.ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${x.t}${!x.ok && x.d != null ? '  → ' + x.d : ''}`); }
  console.log(`\n  ${res.length - ko} passé(s) · ${ko} échec(s)`); process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
