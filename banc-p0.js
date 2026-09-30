#!/usr/bin/env node
/* ==========================================================================
   Banc NAVIGATEUR — parcours P0 « capture → révélation » (design/SPEC-P0-*.md)
   --------------------------------------------------------------------------
   Le vrai parcours, dans Chromium, relais IA simulé (aucun appel réel) :
     · E3  : un état « analyse en cours », pas de formulaire prématuré ;
     · E4  : l'écran suit le STATUT du matcher — sûr, ambigu (plusieurs
             pistes montrées), pistes faibles, rien trouvé, erreurs nommées ;
     · un résultat qui arrive après un choix manuel est ignoré ;
     · E6  : révélation sans confettis, halo en trois paliers, toujours sombre ;
     · E7  : « Ce que ça débloque » avec les VRAIS compteurs ;
     · E8  : voiture déjà au garage → panneau, pas de fausse révélation ;
     · E9  : lot → révélations compactes puis un seul bilan ;
     · réglage « réduire les animations » respecté.
   Usage : NODE_PATH=<node_modules avec playwright-core> node banc-p0.js [dossier-captures]
   ========================================================================== */
'use strict';
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');
const RACINE = __dirname, PORT = 8124, CAPTURES = process.argv[2] || null;
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
  const nav = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
  /* Relais IA simulé : chaque appel prend la réponse suivante de la file. */
  const file = []; let appels = 0;
  await ctx.route(u => u.hostname.endsWith('workers.dev'), async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST' } });
    appels++;
    const r = file.shift() || { corps: [] };
    if (r.delai) await new Promise(ok => setTimeout(ok, r.delai));
    if (r.coupure) return route.abort('internetdisconnected');
    return route.fulfill({ status: r.statut || 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(r.corps) });
  });
  await ctx.route(u => !u.href.startsWith(`http://localhost:${PORT}`) && !u.hostname.endsWith('workers.dev'), r => r.abort());
  const page = await ctx.newPage();
  const erreurs = []; page.on('pageerror', e => erreurs.push(String(e)));
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.GMGarage && window.GMSpecs && window.GMMatcher, { timeout: 15000 });

  const photo = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 1280; c.height = 853; const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 853); g.addColorStop(0, '#5b6b7a'); g.addColorStop(.6, '#9aa4ad'); g.addColorStop(1, '#3a3f44'); x.fillStyle = g; x.fillRect(0, 0, 1280, 853);
    x.fillStyle = '#b51f2d'; x.beginPath(); x.ellipse(640, 560, 420, 110, 0, 0, Math.PI * 2); x.fill(); x.fillStyle = '#111'; x.beginPath(); x.arc(420, 650, 70, 0, 7); x.arc(860, 650, 70, 0, 7); x.fill(); return c.toDataURL('image/jpeg', .85); });
  const fichier = { name: 'rue.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(photo.split(',')[1], 'base64') };
  const capture = async (n) => { if (CAPTURES) { await page.waitForTimeout(450); await page.screenshot({ path: path.join(CAPTURES, n + '.png') }); } };
  const texte = (sel) => page.evaluate(s => document.querySelector(s)?.textContent.replace(/\s+/g, ' ').trim() || '', sel);
  const ouvrir = async () => { await page.evaluate(() => { document.querySelector('#revealWrap')?.remove(); document.querySelector('[data-close]')?.click(); }); await page.waitForTimeout(150); await page.evaluate(() => document.querySelector('[data-fab]').click()); await page.waitForSelector('#fileInput', { state: 'attached' }); };
  const photographier = async (reponse) => { file.push(reponse); await ouvrir(); await capture('p0-1-source'); await page.setInputFiles('#fileInput', fichier); };
  const resultat = () => page.waitForSelector('#capBody .p0-cand, #capBody [data-cap="manuel"].btn, #capBody [data-cap="choix"].btn', { timeout: 8000 });

  /* E3 — analyse visible, formulaire absent */
  await photographier({ corps: [{ brand: 'Alfa Romeo', model: 'Giulia', confidence: 0.93 }], delai: 900 });
  await page.waitForTimeout(250);
  const enAnalyse = await texte('#capBody');
  v('E3 : pendant la reconnaissance, « Analyse en cours » est affiché, sans formulaire', /Analyse en cours/.test(enAnalyse) && !(await page.$('#pickQ')), enAnalyse.slice(0, 80));
  v('E3 : annoncé aux lecteurs d\'écran (role=status)', !!(await page.$('#capBody [role="status"][aria-live="polite"]')));
  await capture('p0-3-analyse');

  /* E4a — sûr */
  await resultat();
  const sur = await texte('#capBody');
  v('E4a : statut CONFIRMÉ → « Modèle trouvé », Giulia, confiance réelle en %', /Modèle trouvé/.test(sur) && /Giulia/.test(sur) && /Confiance de reconnaissance : \d+ %/.test(sur), sur.slice(0, 120));
  await capture('p0-4a-confirme');
  await page.click('#capBody [data-cap="choix"].btn');
  await page.waitForSelector('[data-act="save"]:not([disabled])', { timeout: 5000 });
  v('« Oui, c\'est elle » → formulaire, Giulia présélectionnée', await page.evaluate(() => !!document.querySelector('[data-pick="alfa-giulia"].on')));
  await capture('p0-5-formulaire');

  /* E6 — révélation */
  await page.click('[data-act="save"]');
  await page.waitForSelector('#revealWrap .rv-card', { timeout: 5000 });
  const rv = await page.evaluate(() => { const c = document.querySelector('.rv-card'); return { palier: c.dataset.palier, texte: c.textContent.replace(/\s+/g, ' '), confettis: document.querySelectorAll('.cf').length, fond: getComputedStyle(c).backgroundColor }; });
  v('E6 : révélation sans confettis, palier 2 pour une peu commune', rv.confettis === 0 && rv.palier === '2', JSON.stringify(rv));
  v('E6 : rareté, nom complet, catégorie · millésimes, points', /Peu commun/i.test(rv.texte) && /Alfa Romeo Giulia/.test(rv.texte) && /Berline · 2015–/.test(rv.texte) && /\+4 pts/.test(rv.texte), rv.texte);
  await capture('p0-6-revelation');

  /* E7 — ce que ça débloque */
  await page.click('#revealWrap .rv-tap');
  await page.waitForSelector('.p0-gains', { timeout: 5000 });
  const gains = await texte('.sheet');
  v('E7 : « Ce que ça débloque » avec les vrais compteurs (garage 1 / total, première Alfa Romeo)', /Ce que ça débloque/.test(gains) && /Garage ?1 \/ 10\d\d/.test(gains) && /Première Alfa Romeo/.test(gains) && /moins de 1 % du catalogue/.test(gains), gains.slice(0, 200));
  v('E7 : déclinaisons de la Giulia (Ti, Veloce, Quadrifoglio) — pas des motorisations', /Déclinaisons ?0 \/ 3/.test(gains) && /Quadrifoglio/.test(gains) && !/Essence/.test(gains), gains);
  await capture('p0-7-debloque');
  await page.click('.sheet [data-car="alfa-giulia"]');
  v('E7 : « Voir la fiche » ouvre la fiche de la voiture', !!(await page.waitForSelector('.detail-shell[data-car-id="alfa-giulia"]', { state: 'attached', timeout: 5000 }).catch(() => null)));

  /* E8 — déjà au garage */
  await photographier({ corps: [{ brand: 'Alfa Romeo', model: 'Giulia', confidence: 0.93 }] });
  await resultat(); await page.click('#capBody [data-cap="choix"].btn');
  await page.waitForSelector('[data-act="save"]:not([disabled])'); await page.click('[data-act="save"]');
  await page.waitForSelector('#p0Maj', { timeout: 5000 });
  v('E8 : voiture déjà au garage → « Fiche mise à jour », pas de révélation', /Fiche mise à jour/.test(await texte('.sheet')) && !(await page.$('#revealWrap')));
  await capture('p0-8-maj');

  /* E4b — ambigu */
  await photographier({ corps: [{ brand: 'BMW', model: 'M3', confidence: 0.6 }, { brand: 'BMW', model: 'M4', confidence: 0.58 }] });
  await resultat();
  const amb = await page.evaluate(() => [...document.querySelectorAll('#capBody .p0-cand')].map(b => b.textContent.replace(/\s+/g, ' ').trim()));
  v('E4b : AMBIGU → les DEUX pistes sont montrées avec leur %, plus un écart', amb.length >= 2 && /M3/.test(amb[0]) && /M4/.test(amb[1]) && /Écart/.test(await texte('#capBody')), JSON.stringify(amb));
  await capture('p0-4b-ambigu');
  await page.click('#capBody .p0-cand:nth-child(2)');
  await page.waitForSelector('[data-act="save"]:not([disabled])');
  v('E4b : toucher la 2e piste présélectionne la BMW M4', await page.evaluate(() => !!document.querySelector('[data-pick="bmw-m4"].on')));

  /* E4c — pistes faibles / rien */
  await photographier({ corps: [{ brand: 'BMW', model: 'Serie 3 Touring', confidence: 0.3 }] });
  await resultat();
  v('E4c : AUCUNE CORRESPONDANCE SÛRE avec pistes → « Je ne suis pas sûr » + pistes', /Je ne suis pas sûr/.test(await texte('#capBody')) && (await page.$$('#capBody .p0-cand')).length >= 1);
  await capture('p0-4c-faible');
  await photographier({ corps: [{ brand: 'Zastava', model: 'Yugo 45', confidence: 0.8 }] });
  await resultat();
  v('E4c : rien trouvé → le dire (plus de silence), et proposer le choix manuel', /pas trouvé de correspondance sûre/.test(await texte('#capBody')) && !!(await page.$('#capBody [data-cap="manuel"].btn')));
  await capture('p0-4c-aucune');
  await page.click('#capBody [data-cap="nonclasse"]');
  v('E4c : « Voiture introuvable → Non classé » ouvre directement le formulaire hors catalogue', !!(await page.waitForSelector('#cBrand', { timeout: 3000 }).catch(() => null)));

  /* E4d — erreurs nommées */
  await photographier({ statut: 429, corps: { error: "Limite d'identifications du jour atteinte sur cet appareil : choisis la voiture à la main, ou reviens demain" } });
  await resultat();
  const quota = await texte('#capBody');
  v('E4d : quota du jour → titre dédié + message précis du relais', /plus disponible aujourd'hui/.test(quota) && /sur cet appareil/.test(quota), quota.slice(0, 160));
  await capture('p0-4d-quota');
  await photographier({ coupure: true });
  await resultat();
  v('E4d : relais injoignable → « Tu es hors ligne »', /Tu es hors ligne/.test(await texte('#capBody')));
  await photographier({ statut: 502, corps: { error: 'Identification indisponible' } });
  await resultat();
  v('E4d : relais en panne → « Reconnaissance indisponible », pas un code HTTP', /Reconnaissance indisponible/.test(await texte('#capBody')) && !/HTTP/.test(await texte('#capBody')));

  /* Résultat tardif ignoré */
  await photographier({ corps: [{ brand: 'Ferrari', model: 'F40', confidence: 0.95 }], delai: 1200 });
  await page.waitForTimeout(200);
  await page.click('#capBody [data-cap="manuel"]');
  await page.waitForTimeout(1600);
  v('choix manuel PENDANT l\'analyse : le résultat qui arrive ensuite est ignoré (formulaire intact, rien de présélectionné)',
    !!(await page.$('#pickQ')) && !(await page.$('#capBody .p0-etat')) && await page.evaluate(() => !document.querySelector('[data-pick].on')));

  /* E6 — paliers, par de VRAIES captures : une voiture de chaque rareté, choisie
     parmi celles que le matcher confirme sur leur nom exact (rien d'inventé). */
  const choisir = (rarete, sauf) => page.evaluate(([r, sauf]) => {
    for (const c of CARS) {
      if (c.r !== r || c.custom || sauf.includes(c.id)) continue;
      const m = window.GMMatcher.rapprocher([{ brand: c.brand, model: c.model, confidence: 0.95 }], { catalogue: CARS });
      if (m.statut === 'CONFIRME' && m.candidats[0].id === c.id) return { id: c.id, brand: c.brand, model: c.model };
    }
    return null;
  }, [rarete, sauf]);
  const reveler = async (c) => {
    await photographier({ corps: [{ brand: c.brand, model: c.model, confidence: 0.95 }] });
    await resultat(); await page.click('#capBody [data-cap="choix"].btn');
    await page.waitForSelector('[data-act="save"]:not([disabled])'); await page.click('[data-act="save"]');
    await page.waitForSelector('#revealWrap .rv-card', { timeout: 5000 });
    return page.evaluate(() => document.querySelector('.rv-card').dataset.palier);
  };
  const exclus = ['ferrari-f40', 'peugeot-308', 'alfa-giulia'];
  const vC = await choisir('courant', exclus), vL = await choisir('legendaire', exclus);
  const pC = vC && await reveler(vC); await capture('p0-6-revelation-courante');
  const pL = vL && await reveler(vL); await capture('p0-6-revelation-legendaire');
  v('E6 : halo en trois paliers (courante 1 · peu commune 2 · légendaire 3), jamais de confettis',
    pC === '1' && pL === '3' && (await page.$$('.cf')).length === 0, `${vC && vC.id}=${pC} · ${vL && vL.id}=${pL}`);
  await page.evaluate(() => document.querySelector('#revealWrap')?.remove());

  /* E9 — lot : révélations compactes puis un seul bilan */
  file.length = 0;
  file.push({ corps: [{ brand: 'Ferrari', model: 'F40', confidence: 0.95 }] }, { corps: [{ brand: 'Alfa Romeo', model: 'Giulia', confidence: 0.93 }] }, { corps: [{ brand: 'Peugeot', model: '308', confidence: 0.5 }] });
  await ouvrir();
  await page.evaluate(() => { const o = HTMLInputElement.prototype.click; HTMLInputElement.prototype.click = function () { if (this.multiple) { window.__lot = this; return; } return o.call(this); }; });
  await page.click('[data-cap="batch"]');
  const lot = await page.evaluateHandle(() => window.__lot);
  await lot.asElement().setInputFiles([fichier, { ...fichier, name: 'b.jpg' }, { ...fichier, name: 'c.jpg' }]);
  for (let i = 0; i < 3; i++) {
    await resultat();
    if (i === 0) v('E9 : position dans le lot affichée (« Photo 1 / 3 »)', /Photo 1 \/ 3/.test(await texte('#capBody')));
    await page.click('#capBody [data-cap="choix"].btn');
    await page.waitForSelector('[data-act="save"]:not([disabled])'); await page.click('[data-act="save"]');
    if (i === 0) { const fl = await page.waitForSelector('#p0Flash', { timeout: 3000 }).catch(() => null); v('E9 : nouvelle voiture pendant le lot → révélation COMPACTE non bloquante (pas de plein écran)', !!fl && !(await page.$('#revealWrap'))); await capture('p0-9-lot-flash'); }
  }
  await page.waitForSelector('#p0Bilan', { timeout: 5000 });
  const bilan = await texte('.sheet');
  v('E9 : fin du lot → UN bilan : 2 nouvelles voitures, 1 fiche mise à jour', /Lot terminé/.test(bilan) && /2 nouvelles voitures/.test(bilan) && /1 fiche mise à jour/.test(bilan), bilan.slice(0, 200));
  await capture('p0-9-bilan');

  /* Mouvement réduit + thème clair, sur une vraie révélation */
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => { document.querySelector('[data-close]')?.click(); document.documentElement.setAttribute('data-theme', 'light'); });
  const vR = await choisir('rare', exclus);
  if (vR) await reveler(vR);
  const rvR = await page.evaluate(() => { const c = document.querySelector('.rv-card'); return c ? { anim: getComputedStyle(c).animationName, fond: getComputedStyle(c).backgroundColor } : null; });
  v('« réduire les animations » du téléphone : aucune animation sur la révélation', rvR && rvR.anim === 'none', JSON.stringify(rvR));
  v('thème clair : la révélation reste sombre (décision C)', rvR && rvR.fond === 'rgb(22, 22, 24)', JSON.stringify(rvR));
  await capture('p0-6-revelation-rare-theme-clair');

  v('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
  await nav.close(); serveur.close();
  let ko = 0; for (const x of res) { if (!x.ok) ko++; console.log(`  ${x.ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${x.t}${!x.ok && x.d != null ? '  → ' + x.d : ''}`); }
  console.log(`\n  ${res.length - ko} passé(s) · ${ko} échec(s)`); process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
