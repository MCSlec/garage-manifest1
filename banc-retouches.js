#!/usr/bin/env node
/* ==========================================================================
   Banc NAVIGATEUR — retouches de photo et classement (gm-specs.js ↔ contrat GMGarage)
   --------------------------------------------------------------------------
   POURQUOI
   Floutage de plaque, recadrage, « Photo d'origine », « Associer à un modèle »
   et « Rattacher les voitures non classées » écrivaient DIRECTEMENT dans
   IndexedDB, à côté de l'app : ni date de modification, ni pierre tombale.
   Tant qu'il n'y avait qu'un appareil, rien ne se voyait. Avec la sauvegarde
   cloud, la synchronisation défaisait ces gestes :
     · une plaque « floutée pour de bon » revenait LISIBLE (les photos
       s'additionnent à la fusion) ;
     · une « Non classé » associée à son modèle revenait en double.
   Ces gestes passent désormais par window.GMGarage (remplacerPhoto,
   deplacerPrise). Le banc pilote la VRAIE interface (boutons greffés par
   gm-specs.js, tracé du rectangle à la souris, rechargement de la page) puis
   rejoue une synchronisation, et vérifie ce qui reste.

   Il couvre aussi : « Photo d'origine » (qui n'apparaissait jamais), le
   bouton « Rattacher » des Réglages (qui appliquait tout sans accord), le
   bloc « Partage » (affiché alors que rien ne peut partir), et le repli pour
   un index.html plus ancien encore en cache.
   Usage : NODE_PATH=<node_modules avec playwright-core> node banc-retouches.js
   ========================================================================== */
'use strict';
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const RACINE = __dirname, PORT = 8131;
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const serveur = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(RACINE, p);
  if (!f.startsWith(RACINE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'text/plain' }); res.end(fs.readFileSync(f));
});
const res = []; const v = (t, ok, d) => res.push({ t, ok: !!ok, d });
const sha = (d) => crypto.createHash('sha256').update(Buffer.from(d.split(',')[1], 'base64')).digest('hex');

(async () => {
  await new Promise(r => serveur.listen(PORT, r));
  const nav = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await ctx.route(u => !u.href.startsWith(`http://localhost:${PORT}`), r => r.abort());
  const page = await ctx.newPage();
  const erreurs = []; page.on('pageerror', e => erreurs.push(String(e)));
  const pret = () => page.waitForFunction(() => window.GMSpecs && window.GMGarage, { timeout: 15000 });
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' }); await pret();

  /* De VRAIES images (le floutage et le recadrage les redessinent) : une « voiture »
     et sa plaque, en deux couleurs. */
  const image = (couleur) => page.evaluate((c) => {
    const k = document.createElement('canvas'); k.width = 800; k.height = 600; const x = k.getContext('2d');
    x.fillStyle = '#8a949e'; x.fillRect(0, 0, 800, 600);
    x.fillStyle = c; x.fillRect(120, 220, 560, 230);
    x.fillStyle = '#fff'; x.fillRect(320, 380, 160, 44);
    x.fillStyle = '#000'; x.font = 'bold 30px sans-serif'; x.fillText('AB-123-CD', 328, 413);
    return k.toDataURL('image/jpeg', 0.9);
  }, couleur);
  const P1 = await image('#b51f2d'), P2 = await image('#1f4fb5'), P3 = await image('#2d8a3a');
  const ancien = '2026-09-01T12:00:00.000Z';
  const prise = (carId, photos, plus = {}) => ({ carId, at: ancien, coords: null, loc: 'Banc', note: '', photos, cover: 0, variants: [], favorite: false, maj: ancien, ...plus });
  const ID_A110 = 'custom:alpine-a110-banc', ID_205 = 'custom:peugeot-205-banc';
  const DEPART = { app: 'garage-manifest', version: 1, meta: {},
    custom: { list: [{ id: ID_A110, brand: 'Alpine', model: 'A110', yr: '' }, { id: ID_205, brand: 'Peugeot', model: '205', yr: '' }] },
    spots: [prise('bmw-m3', [P1, P2]), prise('ferrari-f40', [P1]), prise(ID_A110, [P2], { note: 'vue à Dieppe', favorite: true }), prise(ID_205, [P3])] };
  await page.evaluate(d => window.GMGarage.importer(d), DEPART);

  const etat = () => page.evaluate(() => window.GMGarage.exporter());
  const priseDe = async (id) => (await etat()).spots.find(s => s.carId === id);
  const fusionCloud = (spots, meta = {}, custom = { list: [] }) => page.evaluate(d => window.GMGarage.importer(d, { fusion: true }), { app: 'garage-manifest', version: 1, spots, meta, custom });
  /* Le panneau automatique « N voitures non classées peuvent rejoindre le catalogue »
     s'ouvre 2,5 s après chaque démarrage : on l'attend, puis on le ferme. */
  const fermerPanneauAuto = async () => { await page.waitForSelector('#gmr-rat', { timeout: 4500 }).catch(() => null); await page.evaluate(() => document.querySelector('#gmr-rat [data-rat="fermer"]')?.click()); };
  const ouvrirFiche = async (id) => {
    await page.evaluate(() => { document.querySelector('[data-close]')?.click(); document.querySelector('[data-tab="collection"]')?.click(); }); await page.waitForTimeout(250);
    await page.evaluate(i => document.querySelector(`[data-car="${i}"]`)?.click(), id);
    await page.waitForSelector(`#overlay .detail-shell[data-car-id="${id}"]`, { state: 'attached', timeout: 5000 });
  };
  /* Les retouches rechargent la page puis rouvrent la fiche (retour sur fiche de gm-specs). */
  const apresRechargement = async (action, idFiche) => {
    // Pas de rechargement (geste qui a échoué) : on le constate au lieu de faire planter le banc.
    const [recharge] = await Promise.all([page.waitForEvent('load', { timeout: 15000 }).then(() => true, () => false), action()]);
    await pret();
    const rouverte = idFiche ? !!(await page.waitForSelector(`#overlay .detail-shell[data-car-id="${idFiche}"]`, { state: 'attached', timeout: 8000 }).catch(() => null)) : true;
    await fermerPanneauAuto();
    return recharge && rouverte;
  };
  const flouter = async (idFiche) => {
    await page.waitForSelector('#overlay .detail-hero .gfl-ouvrir', { state: 'attached', timeout: 5000 });
    await page.evaluate(() => document.querySelector('#overlay .detail-hero .gfl-ouvrir').click());
    await page.waitForSelector('#gfl-full .gfl-scene img', { timeout: 5000 });
    await page.waitForFunction(() => { const i = document.querySelector('#gfl-full .gfl-scene img'); return i && i.complete && i.naturalWidth > 0; });
    const b = await (await page.$('#gfl-full .gfl-scene')).boundingBox();
    await page.mouse.move(b.x + b.width * 0.40, b.y + b.height * 0.48); await page.mouse.down();
    await page.mouse.move(b.x + b.width * 0.62, b.y + b.height * 0.56, { steps: 6 }); await page.mouse.up();
    await page.waitForSelector('#gfl-full [data-gfl="ok"]:not([disabled])', { timeout: 3000 });
    return apresRechargement(() => page.evaluate(() => document.querySelector('#gfl-full [data-gfl="ok"]').click()), idFiche);
  };
  const ouvrirCadrage = async () => {
    await page.waitForSelector('#overlay .detail-hero .gcz-ouvrir', { state: 'attached', timeout: 5000 });
    await page.evaluate(() => document.querySelector('#overlay .detail-hero .gcz-ouvrir').click());
    await page.waitForSelector('#gcz-full .gcz-plan img', { timeout: 5000 });
    await page.waitForFunction(() => { const i = document.querySelector('#gcz-full .gcz-plan img'); return i && i.complete && i.naturalWidth > 0; });
    await page.waitForTimeout(350);                       // lecture de l'original (IndexedDB) → bouton « Photo d'origine »
  };
  const recadrer = async (idFiche) => {
    await ouvrirCadrage();
    await page.evaluate(() => { const p = document.querySelector('#gcz-full [data-cz="plus"]'); p.click(); p.click(); p.click(); });
    return apresRechargement(() => page.evaluate(() => document.querySelector('#gcz-full [data-cz="ok"]').click()), idFiche);
  };
  const originaux = () => page.evaluate(() => new Promise((ok) => {
    const rq = indexedDB.open('gm-cadrage'); rq.onerror = () => ok(-1);
    rq.onsuccess = () => { const db = rq.result; if (!db.objectStoreNames.contains('pos')) return ok(0);
      const q = db.transaction('pos', 'readonly').objectStore('pos').getAll(); q.onsuccess = () => ok((q.result || []).filter(x => String(x.id).indexOf('orig:') === 0).length); q.onerror = () => ok(-1); };
  }));
  await page.reload({ waitUntil: 'networkidle' }); await pret(); await fermerPanneauAuto();

  /* ---------- 1. Floutage de plaque ---------- */
  await ouvrirFiche('bmw-m3');
  const rouverteFlou = await flouter('bmw-m3');
  let m3 = await priseDe('bmw-m3'), f40 = await priseDe('ferrari-f40'), meta = (await etat()).meta;
  const B = m3.photos[0];
  v('floutage : la photo est remplacée par sa version floutée, à la même place ; la fiche se rouvre',
    rouverteFlou && B !== P1 && /^data:image\/jpeg;base64,/.test(B) && m3.photos.length === 2 && m3.photos[1] === P2, `rouverte=${rouverteFlou} nb=${m3.photos.length}`);
  v('floutage : la prise est datée (la modification voyagera avec la sauvegarde)', Date.parse(m3.maj) > Date.parse(ancien), m3.maj);
  v('floutage : la MÊME image, dans une autre voiture (F40), est floutée aussi — c\'est l\'image qu\'on protège',
    f40.photos.length === 1 && f40.photos[0] === B, f40.photos[0] === P1 ? 'F40 encore lisible' : 'autre');
  v('floutage : l\'originale (plaque lisible) reçoit une pierre tombale dans chaque voiture',
    !!(meta.photosSupprimees || {})['bmw-m3|' + sha(P1)] && !!(meta.photosSupprimees || {})['ferrari-f40|' + sha(P1)], JSON.stringify(Object.keys(meta.photosSupprimees || {})).slice(0, 160));
  // Synchronisation : l'autre appareil (ou le cloud) possède encore l'originale.
  await fusionCloud([prise('bmw-m3', [P1, P2]), prise('ferrari-f40', [P1])]);
  m3 = await priseDe('bmw-m3'); f40 = await priseDe('ferrari-f40');
  v('floutage puis synchronisation : la plaque lisible ne REVIENT PAS (avant : elle réapparaissait à côté de la version floutée)',
    !m3.photos.includes(P1) && !f40.photos.includes(P1) && m3.photos.includes(B) && m3.photos.length === 2 && f40.photos.length === 1, `M3=${m3.photos.length} F40=${f40.photos.length}`);

  /* ---------- 2. Recadrage, puis « Photo d'origine » ---------- */
  const rouverteCadre = await recadrer('bmw-m3');
  m3 = await priseDe('bmw-m3'); f40 = await priseDe('ferrari-f40'); meta = (await etat()).meta;
  const C = m3.photos[0];
  v('recadrage : la photo de la fiche ouverte est remplacée, prise datée, fiche rouverte',
    rouverteCadre && C !== B && /^data:image\/jpeg;base64,/.test(C) && m3.photos.length === 2, `rouverte=${rouverteCadre}`);
  v('recadrage : propre à la fiche OUVERTE — la même image dans une autre voiture (F40) garde son cadrage',
    f40.photos[0] === B && !(meta.photosSupprimees || {})['ferrari-f40|' + sha(B)], f40.photos[0] === C ? 'F40 recadrée aussi' : 'autre');
  await fusionCloud([prise('bmw-m3', [B, P2])]);
  v('recadrage puis synchronisation : la version d\'avant ne revient pas en double', !(await priseDe('bmw-m3')).photos.includes(B) && (await priseDe('bmw-m3')).photos.length === 2);
  await ouvrirCadrage();
  const boutonOrigine = await page.evaluate(() => { const b = document.querySelector('#gcz-full [data-cz="orig"]'); return !!b && !b.hidden; });
  v('« Photo d\'origine » est proposée sur une photo recadrée (avant : le bouton n\'apparaissait jamais)', boutonOrigine);
  if (boutonOrigine) await apresRechargement(() => page.evaluate(() => document.querySelector('#gcz-full [data-cz="orig"]').click()), 'bmw-m3');
  else await page.evaluate(() => document.querySelector('#gcz-full [data-cz="annul"]').click());
  m3 = await priseDe('bmw-m3');
  v('« Photo d\'origine » : la photo d\'avant le recadrage est rétablie', m3.photos[0] === B && m3.photos.length === 2, m3.photos[0] === C ? 'toujours recadrée' : 'autre');
  await fusionCloud([prise('bmw-m3', [C, P2])], { photosSupprimees: { ['bmw-m3|' + sha(B)]: (meta.photosSupprimees || {})['bmw-m3|' + sha(B)] || new Date(Date.now() - 60000).toISOString() } });
  m3 = await priseDe('bmw-m3');
  v('« Photo d\'origine » puis synchronisation : l\'originale reste, la version recadrée ne revient pas', m3.photos.includes(B) && !m3.photos.includes(C) && m3.photos.length === 2, `B=${m3.photos.includes(B)} C=${m3.photos.includes(C)}`);
  v('« Photo d\'origine » : l\'original gardé de côté est effacé une fois rétabli', (await originaux()) === 0, await originaux());

  /* ---------- 2 bis. Deux recadrages de suite : « Photo d'origine » ramène la PREMIÈRE photo,
                    pas l'étape intermédiaire ---------- */
  await recadrer('bmw-m3');
  await recadrer('bmw-m3');
  const deuxFois = (await priseDe('bmw-m3')).photos[0];
  await ouvrirCadrage();
  const origine2 = await page.evaluate(() => { const b = document.querySelector('#gcz-full [data-cz="orig"]'); return !!b && !b.hidden; });
  if (origine2) await apresRechargement(() => page.evaluate(() => document.querySelector('#gcz-full [data-cz="orig"]').click()), 'bmw-m3');
  else await page.evaluate(() => document.querySelector('#gcz-full [data-cz="annul"]').click());
  m3 = await priseDe('bmw-m3');
  v('deux recadrages de suite, puis « Photo d\'origine » : c\'est la photo d\'AVANT le premier recadrage qui revient',
    origine2 && deuxFois !== B && m3.photos[0] === B && (await originaux()) === 0, `bouton=${origine2} première=${m3.photos[0] === B} gardés=${await originaux()}`);

  /* ---------- 3. Recadrer PUIS flouter : l'original (plaque lisible) ne doit pas dormir de côté ---------- */
  await ouvrirFiche('ferrari-f40');
  await recadrer('ferrari-f40');
  const gardes = await originaux();
  await flouter('ferrari-f40');
  v('recadrage puis floutage : l\'original d\'avant recadrage, plaque lisible, n\'est plus conservé nulle part',
    gardes === 1 && (await originaux()) === 0, `gardés après recadrage=${gardes}, après floutage=${await originaux()}`);

  /* ---------- 4. « Associer à un modèle du catalogue » (fiche d'une « Non classé ») ---------- */
  await ouvrirFiche(ID_A110);
  await page.waitForSelector('#overlay .gcl-btn', { state: 'attached', timeout: 5000 });
  await page.evaluate(() => document.querySelector('#overlay .gcl-btn').click());
  await page.waitForSelector('#gcls [data-gcs="pick"][data-id="alpine-a110"]', { timeout: 5000 });
  const rouverteA110 = await apresRechargement(() => page.evaluate(() => document.querySelector('#gcls [data-gcs="pick"][data-id="alpine-a110"]').click()), 'alpine-a110');
  let e = await etat();
  const a110 = e.spots.find(s => s.carId === 'alpine-a110');
  v('association : la prise passe sur le modèle du catalogue, avec ses photos, sa note et son favori ; la fiche du modèle s\'ouvre',
    rouverteA110 && !!a110 && a110.photos[0] === P2 && a110.note === 'vue à Dieppe' && a110.favorite === true && !e.spots.some(s => s.carId === ID_A110), JSON.stringify(e.spots.map(s => s.carId)));
  v('association : prise datée, ancienne « Non classé » retirée du registre et marquée d\'une pierre tombale',
    !!a110 && Date.parse(a110.maj) > Date.parse(ancien) && !!(e.meta.supprimes || {})[ID_A110] && !(e.custom.list || []).some(c => c.id === ID_A110), JSON.stringify(Object.keys(e.meta.supprimes || {})));
  // Synchronisation : le cloud a encore la « Non classé » d'avant l'association.
  await fusionCloud([prise(ID_A110, [P2], { note: 'vue à Dieppe' })], {}, { list: [{ id: ID_A110, brand: 'Alpine', model: 'A110', yr: '' }] });
  e = await etat();
  v('association puis synchronisation : la « Non classé » ne revient PAS en double (avant : la voiture apparaissait deux fois)',
    !e.spots.some(s => s.carId === ID_A110) && e.spots.filter(s => s.carId === 'alpine-a110').length === 1 && !(e.custom.list || []).some(c => c.id === ID_A110), JSON.stringify(e.spots.map(s => s.carId)));

  /* ---------- 5. Réglages : « Rattacher les voitures non classées » ---------- */
  const ouvrirReglages = async () => {
    await page.evaluate(() => { document.querySelector('[data-close]')?.click(); document.querySelector('[data-tab="plus"]')?.click(); }); await page.waitForTimeout(250);
    await page.evaluate(() => document.querySelector('[data-tab="settings"]')?.click());
    await page.waitForSelector('[data-gvr="rattacher"]', { timeout: 5000 });
  };
  await ouvrirReglages();
  await page.evaluate(() => document.querySelector('[data-gvr="rattacher"]').click());
  const panneau = await page.waitForSelector('#gmr-rat .gmr-li', { timeout: 4000 }).catch(() => null);
  await page.waitForTimeout(900);                          // l'ancien bouton appliquait tout, puis rechargeait après 0,5 s
  await pret();
  e = await etat();
  v('Réglages → « Rattacher » : les propositions sont MONTRÉES, rien n\'est appliqué sans accord (avant : tout était rattaché d\'un coup)',
    !!panneau && e.spots.some(s => s.carId === ID_205) && !e.spots.some(s => s.carId === 'peugeot-205'), JSON.stringify(e.spots.map(s => s.carId)));
  if (await page.$('#gmr-rat [data-rat="ok"]')) {
    await apresRechargement(() => page.evaluate(() => document.querySelector('#gmr-rat [data-rat="ok"]').click()), null);
  }
  e = await etat();
  v('… et « Associer » sur une ligne rattache CETTE voiture (prise datée, pierre tombale de l\'ancienne)',
    e.spots.some(s => s.carId === 'peugeot-205' && s.photos[0] === P3 && Date.parse(s.maj) > Date.parse(ancien)) && !e.spots.some(s => s.carId === ID_205) && !!(e.meta.supprimes || {})[ID_205], JSON.stringify(e.spots.map(s => s.carId)));
  await ouvrirReglages();
  await page.evaluate(() => document.querySelector('[data-gvr="rattacher"]').click());
  await page.waitForFunction(() => /Aucune correspondance/.test(document.querySelector('[data-gvr="rattacher"]')?.textContent || ''), null, { timeout: 4000 }).catch(() => null);
  v('… plus rien à rattacher : le bouton le dit (pas de silence)', /Aucune correspondance/.test(await page.textContent('[data-gvr="rattacher"]')));

  /* ---------- 6. Réglages : bloc « Partage des non classées » ---------- */
  const reglages = () => page.evaluate(() => document.getElementById('view').textContent.replace(/\s+/g, ' '));
  v('Réglages : « Partage des non classées » n\'est pas proposé tant qu\'aucun envoi n\'est possible (avant : « Partage activé ✓ » sans que rien ne parte)',
    !/Partage des non classées/.test(await reglages()) && !(await page.$('[data-gvr="part-oui"]')));
  v('Réglages : l\'explication de « Forcer la mise à jour » est sous son bouton',
    await page.evaluate(() => /efface la copie/.test(document.querySelector('[data-gvr="purge"]')?.nextElementSibling?.textContent || '')));
  await page.evaluate(() => { window.GMSpecs.definirEndpointSignalement('https://exemple.test/signalement'); document.querySelector('[data-tab="collection"]')?.click(); });
  await ouvrirReglages();
  v('Réglages : le bloc « Partage » revient dès qu\'une adresse d\'envoi est définie', /Partage des non classées/.test(await reglages()) && !!(await page.$('[data-gvr="part-oui"]')));
  await page.evaluate(() => window.GMSpecs.definirEndpointSignalement(''));

  /* ---------- 7. Contrat GMGarage.deplacerPrise : règles de réunion et refus ---------- */
  await page.evaluate(d => window.GMGarage.importer(d), { app: 'garage-manifest', version: 1, meta: {}, custom: { list: [{ id: 'custom:porsche-911-banc', brand: 'Porsche', model: '911', yr: '' }] },
    spots: [prise('custom:porsche-911-banc', [P3, P1], { at: '2025-05-05T12:00:00.000Z', note: 'la mienne', variants: ['Carrera S'], favorite: true, loc: 'Le Mans' }),
            prise('porsche-911', [P1, P2], { at: '2026-06-06T12:00:00.000Z', note: 'déjà vue', variants: ['Carrera'], cover: 1, loc: '' })] });
  const refus = await page.evaluate(async () => [
    await window.GMGarage.deplacerPrise('custom:inconnue-x', 'porsche-911'),
    await window.GMGarage.deplacerPrise('porsche-911', 'porsche-911'),
    await window.GMGarage.deplacerPrise('porsche-911', 'modele-qui-n-existe-pas'),
    await window.GMGarage.deplacerPrise('porsche-911', 'custom:porsche-911-banc'),
  ].map(r => r && r.ok));
  v('deplacerPrise : source inconnue, cible identique, cible inexistante, cible « Non classé » → refusés, rien ne change',
    refus.every(x => x === false) && (await etat()).spots.some(s => s.carId === 'custom:porsche-911-banc'), JSON.stringify(refus));
  const rDep = await page.evaluate(() => window.GMGarage.deplacerPrise('custom:porsche-911-banc', 'porsche-911'));
  e = await etat();
  const p911 = e.spots.find(s => s.carId === 'porsche-911');
  v('deplacerPrise vers une voiture DÉJÀ au garage : photos réunies sans doublon, date la plus ancienne, notes jointes, déclinaisons réunies, favori gardé, couverture inchangée',
    rDep && rDep.ok && !!p911 && JSON.stringify(p911.photos) === JSON.stringify([P1, P2, P3]) && p911.at.startsWith('2025-05-05') && p911.note === 'déjà vue · la mienne'
    && JSON.stringify([...p911.variants].sort()) === '["Carrera","Carrera S"]' && p911.favorite === true && p911.cover === 1 && p911.loc === 'Le Mans',
    p911 && JSON.stringify({ n: p911.photos.length, at: p911.at, note: p911.note, v: p911.variants, c: p911.cover, loc: p911.loc }));
  // Cible retirée du garage auparavant (pierre tombale) : y rattacher une prise la fait revivre, pour de bon.
  await page.evaluate(d => window.GMGarage.importer(d), { app: 'garage-manifest', version: 1, meta: {}, custom: { list: [{ id: 'custom:renault-clio-banc', brand: 'Renault', model: 'Clio', yr: '' }] },
    spots: [prise('custom:renault-clio-banc', [P2])] });
  const tombeClio = new Date().toISOString();
  await fusionCloud([], { supprimes: { 'renault-clio': tombeClio } });
  await page.waitForTimeout(15);
  await page.evaluate(() => window.GMGarage.deplacerPrise('custom:renault-clio-banc', 'renault-clio'));
  await fusionCloud([], { supprimes: { 'renault-clio': tombeClio } });
  e = await etat();
  v('deplacerPrise vers une voiture retirée auparavant : elle revit, et la synchronisation suivante ne l\'efface pas',
    e.spots.some(s => s.carId === 'renault-clio' && s.photos[0] === P2), JSON.stringify(e.spots.map(s => s.carId)));

  /* ---------- 8. Repli : index.html plus ancien encore en cache (contrat sans les nouvelles fonctions) ---------- */
  await ouvrirFiche('porsche-911');
  await page.evaluate(() => { const g = window.GMGarage; window.GMGarage = Object.freeze({ exporter: g.exporter, importer: g.importer, normaliserPhotos: g.normaliserPhotos, supprimerPhoto: g.supprimerPhoto }); });
  const avantRepli = (await priseDe('porsche-911')).photos[1];
  const rouverteRepli = await flouter('porsche-911');
  const apresRepli = (await priseDe('porsche-911')).photos;
  v('repli (ancien index.html en cache, sans remplacerPhoto) : le floutage fonctionne encore, par l\'écriture directe',
    rouverteRepli && apresRepli.length === 3 && apresRepli[1] !== avantRepli && /^data:image\/jpeg;base64,/.test(apresRepli[1]), `rouverte=${rouverteRepli} nb=${apresRepli.length}`);

  v('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
  await nav.close(); serveur.close();
  let ko = 0; for (const x of res) { if (!x.ok) ko++; console.log(`  ${x.ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${x.t}${!x.ok && x.d != null ? '  → ' + x.d : ''}`); }
  console.log(`\n  ${res.length - ko} passé(s) · ${ko} échec(s)`); process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
