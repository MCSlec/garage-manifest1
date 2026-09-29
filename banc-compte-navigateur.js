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
  const mails = []; let appelsApi = 0, requetesBrutes = 0;
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
    if (process.env.TRACE) console.log("    API", req.method, req.url);
    const morceaux = []; for await (const c of req) morceaux.push(c);
    const corps = Buffer.concat(morceaux);
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

  /* 5. Suppression du compte */
  await ouvrirReglages(A.page); await cliquer(A.page, 'supprimer', 'Compte supprimé');
  v('suppression : plus rien sur le serveur (compte, garage, photos)', !sqlite.prepare("SELECT 1 FROM utilisateurs WHERE email = 'pilote@exemple.fr'").get() && !cloud() && env.PHOTOS._m.size === 0);
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
