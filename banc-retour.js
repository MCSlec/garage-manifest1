#!/usr/bin/env node
/* ==========================================================================
   Banc NAVIGATEUR — bouton « retour » du téléphone (19/11)
   --------------------------------------------------------------------------
   Signalé par le propriétaire : « les boutons du téléphone genre flèche retour
   en arrière marchent pas toujours ». Dans une app installée (PWA), le bouton
   retour d'Android = history.back(). L'app n'inscrivait RIEN dans l'historique :
   « retour » quittait l'app (ou revenait à la page d'avant) au lieu de fermer
   la fiche ouverte. Le banc rejoue le geste (history.back(), comme Android) :
     · fiche ouverte depuis la collection → retour = fiche fermée, on reste ;
     · fiche fermée par sa croix → l'étape d'historique est consommée (sinon il
       faudrait appuyer deux fois sur retour pour sortir) ;
     · onglet Carte → fiche depuis la carte → retour ferme la fiche, puis retour
       ramène à l'onglet Collection ;
     · confirmation « Retirer du garage » → retour = ANNULER (la voiture reste),
       la fiche reste ouverte dessous ;
     · éditeur de recadrage (gm-specs.js) → retour le ferme, la fiche reste ;
     · capture (bouton +) → retour la ferme ;
     · rechargement de la page avec des étapes d'une session précédente → un
       seul retour les traverse : l'app n'est jamais « bloquée ».
   Usage : NODE_PATH=<node_modules avec playwright-core> node banc-retour.js
   ========================================================================== */
'use strict';
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');
const RACINE = __dirname, PORT = 8115;
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const serveur = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(RACINE, p);
  if (!f.startsWith(RACINE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'text/plain' }); res.end(fs.readFileSync(f));
});
const res = []; const v = (t, ok, d) => res.push({ t, ok: !!ok, d });

(async () => {
  await new Promise(r => serveur.listen(PORT, r));
  const nav = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await ctx.route(u => !u.href.startsWith(`http://localhost:${PORT}`), r => r.abort());   // aucun service tiers
  const page = await ctx.newPage();
  const erreurs = []; page.on('pageerror', e => erreurs.push(String(e)));
  const URL_APP = `http://localhost:${PORT}/index.html`;
  const pret = () => page.waitForFunction(() => window.GMSpecs && window.GMGarage, { timeout: 15000 });
  await page.goto(URL_APP, { waitUntil: 'networkidle' }); await pret();

  // Une vraie image (le recadrage la redessine), une prise géolocalisée.
  const photo = await page.evaluate(() => { const k = document.createElement('canvas'); k.width = 800; k.height = 600; const x = k.getContext('2d');
    x.fillStyle = '#8a949e'; x.fillRect(0, 0, 800, 600); x.fillStyle = '#b51f2d'; x.fillRect(120, 220, 560, 230); return k.toDataURL('image/jpeg', 0.9); });
  await page.evaluate((ph) => window.GMGarage.importer({ app: 'garage-manifest', version: 1, meta: {}, custom: { list: [] },
    spots: [{ carId: 'ferrari-f40', at: '2026-09-01T12:00:00.000Z', coords: { lat: 48.85, lng: 2.35 }, loc: 'Paris', note: '', photos: [ph], cover: 0, variants: [], favorite: false }] }), photo);
  await page.reload({ waitUntil: 'networkidle' }); await pret();
  const longueurDepart = await page.evaluate(() => history.length);

  /* Le geste du bouton retour d'Android dans une app installée. */
  /* Si « retour » QUITTE l'app (ancien comportement), on le note et on y revient pour la suite. */
  let quitte = false;
  const retour = async () => {
    quitte = false;
    try { await page.evaluate(() => { window.__memePage = true; history.back(); }); } catch (_) {}
    await page.waitForTimeout(450);
    const meme = await page.evaluate(() => window.__memePage === true && location.pathname.endsWith('index.html')).catch(() => false);
    if (!meme) { quitte = true; await page.goto(URL_APP, { waitUntil: 'networkidle' }); await pret(); }
  };
  const etat = () => { const q = quitte; quitte = false; return page.evaluate((q) => ({
    app: !q && !!window.GMGarage && location.pathname.endsWith('index.html'),
    fiche: !!document.querySelector('#overlay .detail-shell'),
    overlay: (document.getElementById('overlay')?.childElementCount || 0) > 0,
    onglet: document.querySelector('[data-tab].on, [data-tab].active, [data-tab][aria-current="page"]')?.dataset.tab || null,
    carte: !!document.getElementById('huntMap'),
    confirme: !!document.getElementById('confirmWrap'),
    recadrage: !!document.getElementById('gcz-full'),
    etatHist: history.state }), q); };
  const ouvrirFicheCollection = async () => {
    await page.evaluate(() => document.querySelector('[data-tab="collection"]')?.click()); await page.waitForTimeout(250);
    await page.evaluate(() => document.querySelector('[data-car="ferrari-f40"]')?.click());
    await page.waitForSelector('#overlay .detail-shell', { state: 'attached', timeout: 5000 });
  };

  v('au démarrage : aucune étape ajoutée à l\'historique', (await page.evaluate(() => history.length)) === longueurDepart);

  /* 1. Fiche depuis la collection */
  await ouvrirFicheCollection();
  await retour();
  let e = await etat();
  v('fiche ouverte puis « retour » : la fiche se ferme, on reste dans l\'app', e.app && !e.fiche && !e.overlay, JSON.stringify(e));

  /* 2. Fiche fermée par sa croix : l'étape est consommée */
  await ouvrirFicheCollection();
  await page.evaluate(() => document.querySelector('#overlay [data-close]')?.click());
  await page.waitForTimeout(450);
  e = await etat();
  v('fiche fermée par sa croix : l\'étape d\'historique est consommée (un seul « retour » suffira pour sortir)', e.app && !e.overlay && !(e.etatHist && e.etatHist.gm), JSON.stringify(e.etatHist));

  /* 3. Carte → fiche depuis la carte → retour, retour */
  await page.evaluate(() => document.querySelector('[data-tab="map"]')?.click()); await page.waitForTimeout(300);
  if (!(await page.$('#huntMap'))) { await page.evaluate(() => document.querySelector('[data-tab="plus"]')?.click()); await page.waitForTimeout(300); await page.evaluate(() => document.querySelector('[data-tab="map"]')?.click()); }
  await page.waitForTimeout(1500);
  await page.click('#huntMap path.leaflet-interactive', { force: true }).catch(() => {});
  await page.waitForSelector('.leaflet-popup [data-car]', { timeout: 4000 }).catch(() => {});
  await page.evaluate(() => document.querySelector('.leaflet-popup [data-car]')?.click());
  await page.waitForSelector('#overlay .detail-shell', { state: 'attached', timeout: 5000 }).catch(() => {});
  await retour();
  e = await etat();
  v('carte → fiche → « retour » : la fiche se ferme et la CARTE reste affichée', e.app && !e.fiche && e.carte, JSON.stringify(e));
  await retour();
  e = await etat();
  v('… « retour » encore : retour à l\'onglet Collection (on ne quitte pas l\'app)', e.app && !e.carte && !!(await page.$('[data-car="ferrari-f40"]')), JSON.stringify(e));

  /* 4. Confirmation « Retirer du garage » → retour = annuler */
  await ouvrirFicheCollection();
  await page.evaluate(() => document.querySelector('#overlay [data-release]')?.click());
  await page.waitForSelector('#confirmWrap', { timeout: 4000 }).catch(() => {});
  await retour();
  e = await etat();
  const encore = await page.evaluate(() => window.GMGarage.exporter().spots.some(s => s.carId === 'ferrari-f40'));
  v('« Retirer du garage » puis « retour » : la question est ANNULÉE, la voiture reste, la fiche reste ouverte', !e.confirme && encore && e.fiche, JSON.stringify({ ...e, encore }));
  await retour();
  e = await etat();
  v('… « retour » encore : la fiche se ferme', e.app && !e.fiche, JSON.stringify(e));

  /* 5. Éditeur de recadrage (gm-specs.js) */
  await ouvrirFicheCollection();
  await page.waitForSelector('#overlay .detail-hero .gcz-ouvrir', { state: 'attached', timeout: 5000 }).catch(() => {});
  await page.evaluate(() => document.querySelector('#overlay .detail-hero .gcz-ouvrir')?.click());
  await page.waitForSelector('#gcz-full', { timeout: 4000 }).catch(() => {});
  const recadrageOuvert = (await etat()).recadrage;
  await retour();
  e = await etat();
  v('éditeur de recadrage puis « retour » : l\'éditeur se ferme, la fiche reste', recadrageOuvert && !e.recadrage && e.fiche, JSON.stringify({ recadrageOuvert, ...e }));
  await retour();

  /* 6. Capture */
  await page.evaluate(() => document.querySelector('[data-fab]')?.click());
  await page.waitForSelector('#capBody', { state: 'attached', timeout: 4000 }).catch(() => {});
  const captureOuverte = (await etat()).overlay;
  await retour();
  e = await etat();
  v('capture (bouton +) puis « retour » : la capture se ferme', captureOuverte && !e.overlay && e.app, JSON.stringify({ captureOuverte, ...e }));

  /* 7. Étapes laissées par une session précédente (rechargement) */
  /* DEUX étapes laissées derrière (fiche + confirmation ouvertes au moment du rechargement) :
     sans traversée, le premier « retour » atterrirait sur la plus ancienne et ne ferait RIEN
     de visible — le « retour qui ne marche pas toujours ». */
  await ouvrirFicheCollection();
  await page.evaluate(() => document.querySelector('#overlay [data-release]')?.click());
  await page.waitForSelector('#confirmWrap', { timeout: 4000 }).catch(() => {});
  await page.reload({ waitUntil: 'networkidle' }); await pret();
  await retour();
  e = await etat();
  v('après un rechargement, un seul « retour » traverse les étapes d\'avant : rien de bloqué', e.app && !e.overlay && !(e.etatHist && e.etatHist.gm), JSON.stringify(e));

  v('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
  await nav.close(); serveur.close();
  let ok = 0, ko = 0;
  for (const r of res) { if (r.ok) ok++; else ko++; console.log(`  ${r.ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${r.t}${!r.ok && r.d !== undefined ? '  → ' + (typeof r.d === 'string' ? r.d : JSON.stringify(r.d)) : ''}`); }
  console.log(`\n  ${ok} passé(s) · ${ko} échec(s)`);
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
