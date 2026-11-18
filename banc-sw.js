#!/usr/bin/env node
/* ==========================================================================
   Banc NAVIGATEUR — service worker : installation, mise à jour, hors-ligne
   --------------------------------------------------------------------------
   POURQUOI
   Le service worker est la seule pièce de l'app qu'aucun banc n'exerçait :
   les autres bancs le BLOQUENT (serviceWorkers: 'block') pour rester
   déterministes. Or c'est lui qui décide de ce que voit un joueur hors ligne,
   et de l'arrivée d'une mise à jour.

   Ce banc joue un vrai cycle de déploiement, sur un serveur qui se comporte
   comme GitHub Pages (Cache-Control: max-age=600 sur les fichiers) :
     1. première visite → installation, coquille en cache ;
     2. NOUVEAU déploiement (index.html et sw.js changent) → mise à jour ;
     3. la coquille mise en cache par la nouvelle version doit être la
        NOUVELLE — pas la copie de moins de dix minutes que garde le cache
        HTTP du navigateur (défaut trouvé à la seconde relecture) ;
     4. le joueur est prévenu (« Nouvelle version disponible ») et le bouton
        fonctionne ;
     5. hors ligne, l'app démarre, sur la nouvelle coquille.

   ⚠️ Aucune interception réseau ici (ctx.route) : Playwright désactive le
   cache HTTP dès qu'on en pose une, et c'est justement lui qu'on éprouve.
   Usage : NODE_PATH=<node_modules avec playwright-core> node banc-sw.js
   ========================================================================== */
'use strict';
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');
const RACINE = __dirname, PORT = 8133;
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
let deploiement = 1;                                  // numéro du déploiement en ligne
const serveur = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(RACINE, p);
  if (!f.startsWith(RACINE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  let corps = fs.readFileSync(f);
  // Chaque déploiement change index.html (marqueur lisible par la page) et la version du service worker.
  if (p === '/index.html') corps = Buffer.from(corps.toString('utf8') + `\n<script>window.__deploiement = ${deploiement};</script>\n`);
  if (p === '/sw.js') corps = Buffer.from(corps.toString('utf8').replace(/const VERSION = "[^"]+";/, `const VERSION = "garage-banc-${deploiement}";`));
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'text/plain', 'Cache-Control': 'max-age=600' });   // comme GitHub Pages
  res.end(corps);
});
const res = []; const v = (t, ok, d) => res.push({ t, ok: !!ok, d });

(async () => {
  await new Promise(r => serveur.listen(PORT, r));
  const nav = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const erreurs = []; page.on('pageerror', e => erreurs.push(String(e)));
  const URL_APP = `http://localhost:${PORT}/index.html`;
  const pret = () => page.waitForFunction(() => window.GMSpecs && window.GMGarage, { timeout: 20000 });
  const caches_ = () => page.evaluate(() => caches.keys());
  /* waitForFunction ne sait pas attendre une fonction ASYNCHRONE (la promesse rendue
     est « vraie » d'emblée) : on interroge les caches depuis Node, jusqu'au délai. */
  const attendreCaches = async (ok, ms = 20000) => {
    const fin = Date.now() + ms;
    for (;;) { const k = await caches_().catch(() => []); if (ok(k)) return k; if (Date.now() > fin) return k; await new Promise(r => setTimeout(r, 200)); }
  };
  /* Numéro de déploiement de la coquille rangée dans le cache `nom` (null si absente). */
  const coquille = (nom) => page.evaluate(async (n) => {
    const c = await caches.open(n); const r = await c.match('./index.html');
    if (!r) return null; const m = /window\.__deploiement = (\d+);/.exec(await r.text()); return m ? Number(m[1]) : -1;
  }, nom);

  /* 1. Première visite */
  await page.goto(URL_APP, { waitUntil: 'networkidle' }); await pret();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await attendreCaches(k => k.includes('garage-banc-1'));
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
  v('première visite : service worker installé, coquille de l\'app en cache', (await coquille('garage-banc-1')) === 1, await coquille('garage-banc-1'));
  const modules = await page.evaluate(async () => { const c = await caches.open('garage-banc-1'); return (await c.keys()).map(r => new URL(r.url).pathname); });
  v('… avec les modules et la carte (hors-ligne complet), et AUCUN banc', ['/gm-specs.js', '/gm-matcher.js', '/gm-compte.js', '/vendor/leaflet/leaflet.js'].every(m => modules.includes(m)) && !modules.some(m => /\/banc[-.]/.test(m)), modules.length);
  v('première visite : pas d\'invitation à mettre à jour (rien à mettre à jour)', !(await page.$('#swUpdate')));

  /* 2. Nouveau déploiement, moins de dix minutes après la visite : le cache HTTP du
        navigateur tient encore l'ANCIEN index.html pour frais. */
  deploiement = 2;
  await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); await r.update(); });
  await attendreCaches(k => k.includes('garage-banc-2'));
  /* L'ancienne version n'est effacée qu'à l'ACTIVATION de la nouvelle : selon la stratégie,
     dès l'installation, ou quand le joueur accepte la mise à jour. On attend l'invitation
     (ou, faute d'invitation, que la nouvelle version soit installée). */
  await page.waitForFunction(() => !!document.getElementById('swUpdate'), null, { timeout: 8000 }).catch(() => null);
  const rangee = await coquille('garage-banc-2');
  v('mise à jour : la coquille mise en cache est celle du NOUVEAU déploiement (avant : la copie périmée du cache HTTP, resservie hors ligne)', rangee === 2, `déploiement rangé : ${rangee}`);

  /* 3. Le joueur est prévenu, et le bouton fonctionne */
  const invite = await page.waitForSelector('#swUpdate [data-swu="now"]', { timeout: 6000 }).catch(() => null);
  v('mise à jour : « Nouvelle version disponible » est affiché', !!invite);
  v('… l\'app ouverte tourne encore sur l\'ancienne version tant qu\'on n\'a pas rechargé', (await page.evaluate(() => window.__deploiement)) === 1);
  if (invite) {
    // Avant correction, le bouton ne faisait rien : on n'attend pas indéfiniment un rechargement qui ne vient pas.
    await Promise.all([page.waitForEvent('load', { timeout: 8000 }).catch(() => null), page.evaluate(() => document.querySelector('#swUpdate [data-swu="now"]').click())]);
    await pret().catch(() => null);
  }
  v('« Mettre à jour » : la page se recharge sur la nouvelle version (avant : le bouton ne faisait rien, la version s\'étant déjà activée seule)', (await page.evaluate(() => window.__deploiement).catch(() => null)) === 2, await page.evaluate(() => window.__deploiement).catch(() => null));
  const apresMaj = await attendreCaches(k => k.length === 1 && k[0] === 'garage-banc-2', 8000);
  v('… et la nouvelle version prend la place de l\'ancienne (un seul cache)', JSON.stringify(apresMaj) === '["garage-banc-2"]', JSON.stringify(apresMaj));
  await page.waitForTimeout(1200);
  v('… et l\'invitation ne revient pas en boucle', !(await page.$('#swUpdate')));

  /* 4. Hors ligne */
  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => null);
  const horsLigne = await pret().then(() => true, () => false);
  v('hors ligne : l\'app démarre (coquille + modules servis par le cache)', horsLigne);
  v('hors ligne : c\'est bien la NOUVELLE version qui démarre', horsLigne && (await page.evaluate(() => window.__deploiement)) === 2, horsLigne ? await page.evaluate(() => window.__deploiement) : 'app non démarrée');
  await ctx.setOffline(false);

  /* 5. « Plus tard », un AUTRE onglet de l'app reste ouvert, puis réouverture : la nouvelle
        version ne peut pas s'activer (un onglet utilise encore l'ancienne). L'invitation
        doit revenir, et son bouton fonctionner. Déterministe : c'est le cas qui, sinon,
        ne se produit que sous charge (réouverture plus rapide que la fermeture). */
  const attendreUnSeul = async (p, nom) => { for (let i = 0; i < 40; i++) { const k = await p.evaluate(() => caches.keys()); if (k.length === 1 && k[0] === nom) return k; await new Promise(r => setTimeout(r, 200)); } return p.evaluate(() => caches.keys()); };
  const ouvrir = async () => { const p = await ctx.newPage(); p.on('pageerror', e => erreurs.push(String(e))); await p.goto(URL_APP, { waitUntil: 'networkidle' }).catch(() => null); await p.waitForFunction(() => window.GMSpecs && window.GMGarage, { timeout: 20000 }).catch(() => null); return p; };
  deploiement = 3;
  await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); await r.update(); });
  const invite3 = await page.waitForSelector('#swUpdate [data-swu="later"]', { timeout: 15000 }).catch(() => null);
  if (invite3) await page.evaluate(() => document.querySelector('#swUpdate [data-swu="later"]').click());
  const autreOnglet = await ouvrir();
  await page.close();
  const page2 = await ouvrir();
  const invite4 = await page2.waitForSelector('#swUpdate [data-swu="now"]', { timeout: 8000 }).catch(() => null);
  if (invite4) {
    await Promise.all([page2.waitForEvent('load', { timeout: 10000 }).catch(() => null), page2.evaluate(() => document.querySelector('#swUpdate [data-swu="now"]').click())]);
    await page2.waitForFunction(() => window.GMSpecs && window.GMGarage, { timeout: 20000 }).catch(() => null);
  }
  const apres3 = await attendreUnSeul(page2, 'garage-banc-3');
  v('« Plus tard », puis réouverture alors qu\'une version attend encore : l\'invitation revient, et « Mettre à jour » installe la nouvelle',
    !!invite3 && !!invite4 && JSON.stringify(apres3) === '["garage-banc-3"]', `invitation=${!!invite4} → ${JSON.stringify(apres3)}`);

  /* 6. « Plus tard », puis TOUS les onglets fermés, puis réouverture. Deux issues correctes
        selon le moment où le navigateur relâche l'onglet fermé : la nouvelle version est
        déjà active, ou elle attend encore et l'invitation revient (cas prouvé au §5). */
  deploiement = 4;
  await page2.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); await r.update(); });
  const invite5 = await page2.waitForSelector('#swUpdate [data-swu="later"]', { timeout: 15000 }).catch(() => null);
  if (invite5) await page2.evaluate(() => document.querySelector('#swUpdate [data-swu="later"]').click());
  await autreOnglet.close(); await page2.close();
  const page3 = await ouvrir();
  let finale = await attendreUnSeul(page3, 'garage-banc-4'), issue = 'active';
  if (!(finale.length === 1 && finale[0] === 'garage-banc-4')) {
    issue = 'invitation';
    const invite6 = await page3.waitForSelector('#swUpdate [data-swu="now"]', { timeout: 8000 }).catch(() => null);
    if (invite6) {
      await Promise.all([page3.waitForEvent('load', { timeout: 10000 }).catch(() => null), page3.evaluate(() => document.querySelector('#swUpdate [data-swu="now"]').click())]);
      await page3.waitForFunction(() => window.GMSpecs && window.GMGarage, { timeout: 20000 }).catch(() => null);
      finale = await attendreUnSeul(page3, 'garage-banc-4');
    } else issue = 'aucune issue';
  }
  if (process.env.TRACE) console.log('    issue après réouverture :', issue);
  v('« Plus tard », app entièrement fermée puis rouverte : la nouvelle version est en place — jamais bloquée sur l\'ancienne',
    !!invite5 && JSON.stringify(finale) === '["garage-banc-4"]', `${issue} : ${JSON.stringify(finale)}`);

  v('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
  await nav.close(); serveur.close();
  let ko = 0; for (const x of res) { if (!x.ok) ko++; console.log(`  ${x.ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${x.t}${!x.ok && x.d != null ? '  → ' + x.d : ''}`); }
  console.log(`\n  ${res.length - ko} passé(s) · ${ko} échec(s)`); process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
