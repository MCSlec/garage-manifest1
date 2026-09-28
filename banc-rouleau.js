#!/usr/bin/env node
/* ==========================================================================
   Banc NAVIGATEUR — le Rouleau (gm-rouleau.js)
   --------------------------------------------------------------------------
   Exigé par CONTEXT.md §11 bis-C AVANT tout branchement : le Rouleau sera le
   chemin par lequel l'utilisateur ajoute des voitures. Une pellicule qui perd
   une photo, ou qui la facture deux fois à l'IA, est un défaut de jeu.

   Le banc embarqué de banc-v1.html couvrait la rafale, le hors-ligne et le
   back-off. Celui-ci y ajoute ce que le cadrage exige et qu'aucun test ne
   prouvait : reprise après fermeture brutale, disjoncteur, purge à 7 jours,
   « même forme, autre couleur », dissociation, persistance au rechargement.

   Page d'essai générée à la volée (page.route) : aucun fichier de plus dans le
   dépôt. Réseau et identification sont pilotés depuis Node via window.__ctl.

   Usage : NODE_PATH=<node_modules avec playwright-core> node banc-rouleau.js
   Préfixé `banc-` : jamais mis en cache par sw.js (HORS_CACHE).
   ========================================================================== */
'use strict';
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');

const RACINE = __dirname;
const srv = http.createServer((q, s) => {
  const p = decodeURIComponent(q.url.split('?')[0]);
  const f = path.join(RACINE, p);
  if (!f.startsWith(RACINE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
  s.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'application/javascript' : 'text/html' });
  s.end(fs.readFileSync(f));
});

/* Page d'essai. navigator.onLine est remplacé AVANT le chargement du module :
   planifier() le lit dès init(). identify() obéit à window.__ctl.mode. */
const HARNAIS = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<div id="rouleau"></div>
<script>
window.__ctl = { reseau: true, mode: 'ok', appels: 0 };
Object.defineProperty(navigator, 'onLine', { get: () => window.__ctl.reseau, configurable: true });
window.photo = (teinte, bruit = 0) => {
  const c = document.createElement('canvas'); c.width = 360; c.height = 480;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 360, 480);
  g.addColorStop(0, 'hsl(' + teinte + ',60%,45%)'); g.addColorStop(1, 'hsl(' + (teinte + 40) + ',50%,15%)');
  x.fillStyle = g; x.fillRect(0, 0, 360, 480);
  x.fillStyle = 'hsl(' + (teinte + 180) + ',70%,60%)'; x.fillRect(40 + bruit, 190 + bruit, 280, 110);
  x.fillStyle = '#000'; x.beginPath();
  x.arc(100 + bruit, 305, 34, 0, 7); x.arc(262 + bruit, 305, 34, 0, 7); x.fill();
  x.fillStyle = 'rgba(255,255,255,.25)'; x.fillRect(70, 205 + bruit, 90, 44);
  return new Promise(r => c.toBlob(r, 'image/jpeg', .9));
};
</script>
<script src="/gm-rouleau.js"></script>
<script>
async function identify(blob, signal) {
  window.__ctl.appels++;
  const m = window.__ctl.mode;
  if (m === 'pendre') return new Promise(() => {});           // réponse qui ne revient jamais
  await new Promise((res, rej) => {
    const t = setTimeout(res, 120);
    signal.addEventListener('abort', () => { clearTimeout(t); rej(new Error('timeout')); });
  });
  if (!window.__ctl.reseau || m === 'fetch') throw new TypeError('Failed to fetch');
  if (m === '503') throw new Error('HTTP 503 service indisponible');
  if (m === '400') throw new Error('HTTP 400 : image refusée, 25 Mo maximum');
  return { libelle: 'Modèle ' + window.__ctl.appels };
}
GMRouleau.reglages.BACKOFF_BASE_MS = 300;
GMRouleau.reglages.BACKOFF_PLAFOND_MS = 1200;
GMRouleau.reglages.DISJONCTEUR_MS = 60000;   // long : on vérifie qu'il est OUVERT, pas qu'il se referme
window.__pret = GMRouleau.init({ identify, conteneur: '#rouleau' });
</script></body></html>`;

const res = [];
const v = (t, ok, d) => res.push({ t, ok: !!ok, d });

(async () => {
  await new Promise(r => srv.listen(8095, r));
  const nav = await chromium.launch({
    executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox'] });
  const ctx = await nav.newContext();
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.route('**/banc-rouleau-harnais.html', r => r.fulfill({ contentType: 'text/html', body: HARNAIS }));
  const URL = 'http://localhost:8095/banc-rouleau-harnais.html';
  const charger = async () => { await page.goto(URL); await page.evaluate(() => window.__pret); };
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const st = () => ev(() => GMRouleau.stats());
  const jusqua = async (pred, max = 8000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < max) { if (await ev(pred)) return true; await page.waitForTimeout(100); }
    return false;
  };
  const remise = (mode = 'ok') => ev(async (m) => {
    await GMRouleau.vider(false);
    Object.assign(window.__ctl, { reseau: true, mode: m, appels: 0 });
    GMRouleau._debug.economies = 0; GMRouleau._debug.echecsConsecutifs = 0; GMRouleau._debug.disjoncteurJusqua = 0;
  }, mode);
  const exposer = (teinte, bruit = 0) => ev(async ([t, b]) => GMRouleau.exposer(await window.photo(t, b)), [teinte, bruit]);

  await charger();
  v('module chargé depuis gm-rouleau.js, API exposée', await ev(() => /^1\./.test(GMRouleau.VERSION) && typeof GMRouleau.exposer === 'function'));

  // 1. Rafale : quatre photos de la même voiture = un seul appel IA
  await remise();
  for (let i = 0; i < 4; i++) await exposer(120, i);
  await jusqua(() => GMRouleau.stats().revelees === 4);
  let s = await st(), appels = await ev(() => window.__ctl.appels);
  v('1 · rafale : 4 vues révélées', s.revelees === 4, JSON.stringify(s));
  v('1 · rafale : 1 seul appel IA pour 4 jumelles', appels === 1, 'appels=' + appels);
  v('1 · rafale : 3 appels économisés comptés', s.economies === 3, s.economies);

  // 2. Deux voitures différentes = deux appels
  await remise();
  await exposer(10); await exposer(200);
  await jusqua(() => GMRouleau.stats().revelees === 2);
  appels = await ev(() => window.__ctl.appels);
  v('2 · deux voitures différentes : 2 appels', appels === 2, 'appels=' + appels);

  // 3. Même forme, autre couleur : le dHash (niveaux de gris) ne suffit pas
  await remise();
  await exposer(0); await exposer(240);
  await jusqua(() => GMRouleau.stats().revelees === 2);
  appels = await ev(() => window.__ctl.appels);
  v('3 · même forme, autre robe : jamais fusionnées', appels === 2, 'appels=' + appels);

  // 4. Hors ligne : rien ne part, rien ne se perd
  await remise();
  await ev(() => { window.__ctl.reseau = false; dispatchEvent(new Event('offline')); });
  await exposer(300); await exposer(60);
  await page.waitForTimeout(700);
  s = await st(); appels = await ev(() => window.__ctl.appels);
  v('4 · hors ligne : 2 vues latentes, 0 appel', s.latentes === 2 && appels === 0, JSON.stringify(s) + ' appels=' + appels);

  // 5. Retour du réseau : reprise sans intervention
  await ev(() => { window.__ctl.reseau = true; dispatchEvent(new Event('online')); });
  v('5 · retour réseau : développement automatique', await jusqua(() => GMRouleau.stats().revelees === 2));

  // 6. Panne serveur : back-off, puis révélation au retour du service
  await remise('503');
  await exposer(150);
  v('6 · panne 503 : réessais espacés (≥ 2 essais)', await jusqua(() => [...GMRouleau._debug.items.values()][0]?.essais >= 2));
  await ev(() => { window.__ctl.mode = 'ok'; });
  v('6 · service revenu : la vue se développe', await jusqua(() => GMRouleau.stats().revelees === 1));

  // 7. Disjoncteur : trois échecs RÉSEAU consécutifs coupent tout
  await remise('fetch');
  await exposer(20); await exposer(140); await exposer(260);
  v('7 · 3 échecs réseau : disjoncteur ouvert', await jusqua(() => GMRouleau.stats().disjoncteur === true));

  // 8. Une erreur APPLICATIVE ne doit pas ouvrir le disjoncteur
  //    (le message contient « 25 » : un test `includes('5')` la prendrait pour du réseau)
  await remise('400');
  await exposer(40); await exposer(170); await exposer(290);
  await jusqua(() => [...GMRouleau._debug.items.values()].every(i => i.essais >= 1));
  s = await st();
  v('8 · 3 erreurs 400 : disjoncteur FERMÉ (pas une panne réseau)', s.disjoncteur === false, JSON.stringify(s));

  // 9. Fermeture brutale pendant une requête : la vue n'est pas perdue
  await remise('pendre');
  await exposer(80);
  await jusqua(() => GMRouleau.stats().enCours === 1);
  const idEnVol = await ev(() => GMRouleau.items()[0].id);
  await charger();                                    // l'app est « tuée » et rouverte (mode 'ok' neuf)
  v('9 · au redémarrage, la vue orpheline est repassée en latente (pas bloquée « en cours »)',
    await ev(id => { const i = GMRouleau._debug.items.get(id); return i && (i.etat === 'latent' || i.etat === 'encours' && window.__ctl.appels >= 1 || i.etat === 'revele'); }, idEnVol));
  v('9 · fermeture brutale : la vue « en cours » revient et se développe',
    await jusqua(() => GMRouleau.stats().revelees === 1) && await ev(id => GMRouleau.items()[0]?.id === id, idEnVol));

  // 10. Persistance au rechargement
  const avant = (await st()).total;
  await charger();
  v('10 · persistance : la pellicule survit au rechargement', (await st()).total === avant && avant > 0, avant);

  // 11. Purge : révélées de plus de 7 jours supprimées, latentes jamais
  await remise();
  await ev(() => new Promise((ok, ko) => {
    const rq = indexedDB.open('gm-rouleau');
    rq.onsuccess = () => {
      const tx = rq.result.transaction('pellicule', 'readwrite'), s = tx.objectStore('pellicule');
      const vieux = Date.now() - 8 * 24 * 3600 * 1000;
      s.put({ id: 'vieille-revelee', creeLe: vieux, etat: 'revele', hash: '0'.repeat(16), couleur: '', groupe: 'a', essais: 0, prochainEssai: 0, resultat: { libelle: 'x' } });
      s.put({ id: 'vieille-latente', creeLe: vieux, etat: 'latent', hash: 'f'.repeat(16), couleur: '', groupe: 'b', essais: 0, prochainEssai: Date.now() + 3600e3 });
      tx.oncomplete = ok; tx.onerror = ko;
    };
  }));
  await charger();
  const ids = await ev(() => GMRouleau.items().map(i => i.id));
  v('11 · purge : révélée de 8 jours supprimée', !ids.includes('vieille-revelee'), JSON.stringify(ids));
  v('11 · purge : latente de 8 jours conservée (jamais développée)', ids.includes('vieille-latente'), JSON.stringify(ids));

  // 12. Dissocier : une fusion à tort se répare, avec sa propre identification
  await remise();
  await exposer(120, 0); await exposer(120, 1);
  await jusqua(() => GMRouleau.stats().revelees === 2);
  const avantDiss = await ev(() => window.__ctl.appels);
  await ev(() => GMRouleau.dissocier(GMRouleau.items()[0].id));
  await jusqua(() => GMRouleau.stats().revelees === 2 && window.__ctl.appels === 2);
  const apres = await ev(() => ({ appels: window.__ctl.appels, heritage: GMRouleau.items()[0].heritage }));
  v('12 · dissocier : 1 appel de plus, plus d\'héritage', avantDiss === 1 && apres.appels === 2 && apres.heritage === false, JSON.stringify(apres));

  v('aucune erreur JS', errs.length === 0, errs.join(' | '));
  await nav.close(); srv.close();
  let ko = 0;
  for (const r of res) { if (!r.ok) ko++; console.log(`  ${r.ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${r.t}${!r.ok && r.d != null ? '  → ' + r.d : ''}`); }
  console.log(`\n  ${res.length - ko} passé(s) · ${ko} échec(s)`);
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
