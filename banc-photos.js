#!/usr/bin/env node
/* ==========================================================================
   Banc NAVIGATEUR — limites de photos (par rareté) et taille par photo
   --------------------------------------------------------------------------
   Règle du propriétaire (29/09) : plus une voiture est rare, plus on garde
   d'images ; chaque photo a une taille maximale. Le banc passe par le VRAI
   parcours « Ajouter une photo » d'une fiche (fichier choisi → formulaire →
   Enregistrer) et vérifie :
     · sous le plafond, la photo est ajoutée ;
     · au plafond, la prise est enregistrée SANS la photo, avec un message ;
     · les photos déjà présentes au-delà du plafond ne sont jamais retirées ;
     · une ancienne photo trop lourde est recompressée sous le plafond par
       GMGarage.normaliserPhotos() (avant la sauvegarde cloud), et reste une image.
   Usage : NODE_PATH=<node_modules avec playwright-core> node banc-photos.js
   ========================================================================== */
'use strict';
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');
const RACINE = __dirname, PORT = 8106;
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const serveur = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(RACINE, p);
  if (!f.startsWith(RACINE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'text/plain' }); res.end(fs.readFileSync(f));
});
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const res = []; const v = (t, ok, d) => res.push({ t, ok: !!ok, d });

(async () => {
  await new Promise(r => serveur.listen(PORT, r));
  const nav = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await ctx.route(u => !u.href.startsWith(`http://localhost:${PORT}`), r => r.abort());   // relais IA & co : coupés
  const page = await ctx.newPage();
  const erreurs = []; page.on('pageerror', e => erreurs.push(String(e)));
  const pret = () => page.waitForFunction(() => window.GMSpecs && window.GMGarage, { timeout: 15000 });
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' }); await pret();
  const idb = (op, arg) => page.evaluate(([op, arg]) => new Promise((ok, ko) => {
    const rq = indexedDB.open('garage-manifest'); rq.onerror = ko;
    rq.onsuccess = () => { const tx = rq.result.transaction('spots', op === 'all' ? 'readonly' : 'readwrite'); const st = tx.objectStore('spots');
      if (op === 'put') { for (const r of arg) st.put(r); tx.oncomplete = () => ok(true); } else { const q = st.getAll(); q.onsuccess = () => ok(q.result); } tx.onerror = ko; };
  }), [op, arg]);
  const photo = (i) => `data:image/jpeg;base64,${Buffer.from('photo-' + i + '-'.repeat(6)).toString('base64')}`;
  const prise = (carId, n) => ({ carId, at: '2026-09-01T12:00:00.000Z', coords: null, loc: 'Banc', note: '', photos: Array.from({ length: n }, (_, i) => photo(i)), cover: 0, variants: [], favorite: false });
  const nbPhotos = async (id) => ((await idb('all')).find(r => r.carId === id) || {}).photos?.length;

  const ajouterPhotoVia = async (id) => {
    await page.evaluate(() => document.querySelector('[data-tab="collection"]')?.click()); await page.waitForTimeout(250);
    await page.evaluate(i => document.querySelector(`[data-car="${i}"]`)?.click(), id);
    await page.waitForSelector('[data-addphoto]', { state: 'attached', timeout: 5000 });
    await page.evaluate(() => document.querySelector('[data-addphoto]').click());
    await page.waitForSelector('#fileInput', { state: 'attached', timeout: 5000 });
    await page.setInputFiles('#fileInput', { name: 'voiture.png', mimeType: 'image/png', buffer: PNG });
    await page.waitForSelector('[data-act="save"]:not([disabled])', { timeout: 8000 });
    await page.click('[data-act="save"]');
    await page.waitForTimeout(600);
  };

  /* 205 (peu commune → 8 photos) */
  await idb('put', [prise('peugeot-205', 7), prise('ferrari-f40', 31)]);
  await page.reload({ waitUntil: 'networkidle' }); await pret();
  await ajouterPhotoVia('peugeot-205');
  v('sous le plafond (205 peu commune : 7/8) : la photo est ajoutée', (await nbPhotos('peugeot-205')) === 8, await nbPhotos('peugeot-205'));
  await ajouterPhotoVia('peugeot-205');
  // Au plafond, le parcours P0 affiche un panneau « Prise mise à jour » (E8) qui dit ce qui a été gardé.
  const toast = (await page.textContent('#p0Maj').catch(() => '')) || '';
  v('au plafond (8/8) : prise enregistrée sans la nouvelle photo', (await nbPhotos('peugeot-205')) === 8, await nbPhotos('peugeot-205'));
  v('… avec un message qui donne la limite et la rareté', /Limite de 8 photos/.test(toast) && /peu commun/i.test(toast), toast);
  /* F40 (légendaire → 30) déjà à 31 (ancienne version) : rien n'est retiré */
  await ajouterPhotoVia('ferrari-f40');
  v('au-delà du plafond (F40 : 31 photos anciennes) : rien n\'est retiré, rien n\'est ajouté', (await nbPhotos('ferrari-f40')) === 31, await nbPhotos('ferrari-f40'));

  /* Ancienne photo trop lourde (avant la compression) → recompressée */
  const lourde = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 3000; c.height = 2250; const x = c.getContext('2d');
    const im = x.createImageData(c.width, c.height); for (let i = 0; i < im.data.length; i++) im.data[i] = (i % 4 === 3) ? 255 : (Math.random() * 256) | 0;
    x.putImageData(im, 0, 0); return c.toDataURL('image/jpeg', 0.95);
  });
  const octets = (d) => Math.floor((d.length - d.indexOf(',') - 1) * 3 / 4);
  await idb('put', [{ ...prise('bmw-m3', 0), photos: [lourde, photo(1)] }]);
  await page.reload({ waitUntil: 'networkidle' }); await pret();
  const n = await page.evaluate(() => window.GMGarage.normaliserPhotos());
  const m3 = (await idb('all')).find(r => r.carId === 'bmw-m3');
  const taille = await page.evaluate(async (d) => { const im = new Image(); im.src = d; await im.decode(); return [im.width, im.height]; }, m3.photos[0]);
  v(`ancienne photo de ${(octets(lourde) / 1048576).toFixed(1)} Mo : recompressée sous 1,5 Mo, toujours une image valide`,
    n === 1 && octets(m3.photos[0]) <= 1.5 * 1048576 && Math.max(...taille) <= 1280, `${n} · ${(octets(m3.photos[0]) / 1048576).toFixed(2)} Mo · ${taille}`);
  v('… et les photos déjà légères ne sont pas touchées', m3.photos[1] === photo(1) && m3.photos.length === 2);
  /* Seconde relecture (10/11) : la version recompressée REMPLACE l'ancienne. Sans pierre
     tombale, un autre appareil (ou le cloud) qui possède encore l'ancienne la ramenait à la
     fusion — la même image en double, dont une trop lourde pour le serveur. */
  const shaLourde = require('crypto').createHash('sha256').update(Buffer.from(lourde.split(',')[1], 'base64')).digest('hex');
  const metaNorm = (await idb('all')).find(r => r.carId === '__meta__') || {};
  await page.evaluate(d => window.GMGarage.importer(d, { fusion: true }), { app: 'garage-manifest', version: 1, meta: {}, custom: { list: [] },
    spots: [{ ...prise('bmw-m3', 0), photos: [lourde, photo(1)], maj: '2026-09-01T12:00:00.000Z' }] });
  const m3Norm = (await idb('all')).find(r => r.carId === 'bmw-m3');
  v('photo recompressée : l\'ancienne version, encore présente sur un autre appareil, ne revient pas en double à la synchronisation',
    !!(metaNorm.photosSupprimees || {})['bmw-m3|' + shaLourde] && !!m3.maj && m3Norm.photos.length === 2 && !m3Norm.photos.includes(lourde), `photos=${m3Norm.photos.length} tombe=${!!(metaNorm.photosSupprimees || {})['bmw-m3|' + shaLourde]}`);

  /* Supprimer UNE photo : la corbeille greffée par gm-specs.js sur la photo
     affichée (.gsup-btn), qui passe désormais par window.GMGarage.supprimerPhoto */
  const empreinte = (d) => require('crypto').createHash('sha256').update(Buffer.from(d.split(',')[1], 'base64')).digest('hex');
  const meta = async () => (await idb('all')).find(r => r.carId === '__meta__') || {};
  /* reponse : '1' confirme, '0' annule, null = aucune boîte attendue */
  const supprimerVia = async (id, reponse = '1') => {
    await page.evaluate(() => document.querySelector('[data-tab="collection"]')?.click()); await page.waitForTimeout(250);
    await page.evaluate(i => document.querySelector(`[data-car="${i}"]`)?.click(), id);
    await page.waitForSelector('#overlay .detail-hero .gsup-btn', { state: 'attached', timeout: 5000 });
    await page.evaluate(() => document.querySelector('#overlay .detail-hero .gsup-btn').click());
    if (reponse !== null) {
      await page.waitForSelector(`#confirmWrap [data-cf="${reponse}"]`, { timeout: 5000 });
      await page.click(`#confirmWrap [data-cf="${reponse}"]`);
    }
    await page.waitForTimeout(700);
  };
  v('un seul bouton « supprimer cette photo » sur la fiche (pas de doublon avec l\'existant)',
    await page.evaluate(() => document.querySelectorAll('[data-delphoto]').length === 0));
  await idb('put', [{ ...prise('peugeot-205', 8), cover: 3 }]);
  await page.reload({ waitUntil: 'networkidle' }); await pret();
  await supprimerVia('peugeot-205', '0');
  v('corbeille de la photo : une confirmation est demandée, et « Annuler » ne supprime rien',
    (await nbPhotos('peugeot-205')) === 8 && await page.evaluate(() => !document.querySelector('#confirmWrap')), await nbPhotos('peugeot-205'));
  await supprimerVia('peugeot-205');
  const p205 = (await idb('all')).find(r => r.carId === 'peugeot-205');
  v('corbeille de la photo : la photo AFFICHÉE (couverture) disparaît, les autres restent dans l\'ordre',
    p205.photos.length === 7 && !p205.photos.includes(photo(3)) && p205.photos[3] === photo(4) && p205.cover === 2, `${p205.photos.length} · couverture ${p205.cover}`);
  const f40 = (await idb('all')).find(r => r.carId === 'ferrari-f40');
  v('… et JAMAIS dans une autre voiture qui contient la même image (F40 : photo identique conservée)',
    f40.photos.length === 31 && f40.photos.includes(photo(3)), f40.photos.length);
  v('… sans rechargement de la page : la fiche reste ouverte, à jour',
    await page.evaluate(() => !!document.querySelector('#overlay .detail-hero') && document.querySelectorAll('#overlay .thumbstrip .ts').length === 7));
  v('… horodatée (maj) et laissant une pierre tombale propre à CETTE voiture (« voiture|empreinte des octets », comme gm-compte.js)',
    !!p205.maj && !!((await meta()).photosSupprimees || {})['peugeot-205|' + empreinte(photo(3))] && !((await meta()).photosSupprimees || {})[empreinte(photo(3))],
    JSON.stringify(Object.keys((await meta()).photosSupprimees || {})).slice(0, 120));
  await ajouterPhotoVia('peugeot-205');
  v('… et la place libérée sous le plafond est réutilisable (7 → 8)', (await nbPhotos('peugeot-205')) === 8, await nbPhotos('peugeot-205'));

  /* Synchronisation : la photo supprimée ne revient pas, et une suppression faite ailleurs s'applique ici */
  const distante = { ...prise('peugeot-205', 8), maj: '2020-01-01T00:00:00.000Z' };   // l'autre appareil a encore photo(3)
  await page.evaluate(d => window.GMGarage.importer(d, { fusion: true }), { app: 'garage-manifest', version: 1, spots: [distante], meta: {}, custom: { list: [] } });
  const apres = (await idb('all')).find(r => r.carId === 'peugeot-205');
  v('fusion cloud : la photo supprimée ici ne revient PAS depuis l\'autre appareil', !apres.photos.includes(photo(3)), apres.photos.length);
  /* Seconde relecture (10/11) : la pierre tombale ne portait que l'empreinte. À la
     synchronisation, la même image disparaissait donc de TOUTES les voitures —
     une photo montrant deux voitures, retirée de l'une, était perdue pour l'autre. */
  const f40ApresFusion = (await idb('all')).find(r => r.carId === 'ferrari-f40');
  v('fusion cloud : la MÊME image, gardée sur une autre voiture (F40), n\'est pas emportée par la suppression faite sur la 205',
    f40ApresFusion.photos.includes(photo(3)) && f40ApresFusion.photos.length === 31, f40ApresFusion.photos.length);
  const tombeAilleurs = { ['peugeot-205|' + empreinte(photo(5))]: new Date().toISOString() };
  await page.evaluate(d => window.GMGarage.importer(d, { fusion: true }), { app: 'garage-manifest', version: 1, spots: [], meta: { photosSupprimees: tombeAilleurs }, custom: { list: [] } });
  const apres2 = (await idb('all')).find(r => r.carId === 'peugeot-205');
  v('fusion cloud : une photo supprimée sur l\'AUTRE appareil disparaît aussi ici', !apres2.photos.includes(photo(5)) && apres2.photos.includes(photo(4)), apres2.photos.length);
  const exportee = await page.evaluate(() => window.GMGarage.exporter());
  const tombes205 = (t) => Object.keys(t || {}).filter(k => k.startsWith('peugeot-205|')).length;
  v('… et les pierres tombales voyagent avec la sauvegarde (export)', tombes205(exportee.meta.photosSupprimees) === 2, JSON.stringify(Object.keys(exportee.meta.photosSupprimees || {})).slice(0, 200));
  // Ancien format (empreinte seule, sans voiture) : ignoré — on ne supprime pas sans savoir de quelle voiture il s'agit.
  await page.evaluate(d => window.GMGarage.importer(d, { fusion: true }), { app: 'garage-manifest', version: 1, spots: [], meta: { photosSupprimees: { [empreinte(photo(6))]: new Date().toISOString() } }, custom: { list: [] } });
  const apres3 = (await idb('all')).find(r => r.carId === 'peugeot-205');
  v('pierre tombale à l\'ancien format (sans voiture) : ignorée, la photo reste', apres3.photos.includes(photo(6)) && tombes205((await meta()).photosSupprimees) === 2 && !((await meta()).photosSupprimees || {})[empreinte(photo(6))], apres3.photos.length);

  /* Photo supprimée puis REMISE (même image) : elle ne doit pas redisparaître à la
     synchronisation suivante. Avant, rien ne disait que la remise était plus récente. */
  await idb('put', [{ ...prise('bmw-m3', 0), photos: [photo(1), photo(2)], maj: '2026-09-01T12:00:00.000Z' }]);
  await page.reload({ waitUntil: 'networkidle' }); await pret();
  await ajouterPhotoVia('bmw-m3');
  const X = (await idb('all')).find(r => r.carId === 'bmw-m3').photos[2];
  const rSup = await page.evaluate(src => window.GMGarage.supprimerPhoto(src), X);
  const tombeX = ((await meta()).photosSupprimees || {})['bmw-m3|' + empreinte(X)];
  await ajouterPhotoVia('bmw-m3');                              // le même fichier : la même image, remise
  const m3Remise = (await idb('all')).find(r => r.carId === 'bmw-m3');
  // Le cloud, lui, connaît la suppression (sauvegardée entre-temps) et l'ancienne version de la prise.
  await page.evaluate(d => window.GMGarage.importer(d, { fusion: true }), { app: 'garage-manifest', version: 1,
    spots: [{ ...prise('bmw-m3', 0), photos: [photo(1), photo(2)], maj: '2026-09-01T12:00:00.000Z' }], meta: { photosSupprimees: { ['bmw-m3|' + empreinte(X)]: tombeX } }, custom: { list: [] } });
  const m3Sync = (await idb('all')).find(r => r.carId === 'bmw-m3');
  v('photo supprimée puis remise (même image) : elle survit à la synchronisation suivante',
    rSup && rSup.ok && !!tombeX && m3Remise.photos.includes(X) && m3Sync.photos.includes(X), `remise=${m3Remise.photos.includes(X)} après synchro=${m3Sync.photos.includes(X)}`);
  const exportRemise = await page.evaluate(() => window.GMGarage.exporter());
  v('… la remise voyage avec la sauvegarde (export), sous la même clé que la pierre tombale',
    !!(exportRemise.meta.photosRetablies || {})['bmw-m3|' + empreinte(X)] && Date.parse(exportRemise.meta.photosRetablies['bmw-m3|' + empreinte(X)]) > Date.parse(tombeX));
  await page.evaluate(src => window.GMGarage.supprimerPhoto(src), X);
  await page.evaluate(d => window.GMGarage.importer(d, { fusion: true }), { app: 'garage-manifest', version: 1, spots: [], meta: {}, custom: { list: [] } });
  v('… et supprimée de nouveau ENSUITE, elle disparaît pour de bon (le dernier geste gagne)', !(await idb('all')).find(r => r.carId === 'bmw-m3').photos.includes(X));
  /* Remise faite sur l'AUTRE appareil : le cloud apporte la photo ET sa remise, plus récente que la suppression d'ici. */
  const tombeX2 = ((await meta()).photosSupprimees || {})['bmw-m3|' + empreinte(X)];
  await page.evaluate(d => window.GMGarage.importer(d, { fusion: true }), { app: 'garage-manifest', version: 1,
    spots: [{ ...prise('bmw-m3', 0), photos: [X, photo(1), photo(2)], maj: new Date(Date.now() + 60000).toISOString() }],
    meta: { photosRetablies: { ['bmw-m3|' + empreinte(X)]: new Date(Date.now() + 60000).toISOString() } }, custom: { list: [] } });
  v('remise faite sur l\'AUTRE appareil (plus récente que la suppression d\'ici) : la photo revient et reste',
    !!tombeX2 && (await idb('all')).find(r => r.carId === 'bmw-m3').photos.includes(X));
  // … et cette remise est RETENUE ici : une synchronisation suivante, même sans elle dans le message, ne retire pas la photo.
  await page.evaluate(d => window.GMGarage.importer(d, { fusion: true }), { app: 'garage-manifest', version: 1, spots: [], meta: {}, custom: { list: [] } });
  v('… la remise venue du cloud est enregistrée sur cet appareil (la photo tient à la synchronisation suivante)',
    (await idb('all')).find(r => r.carId === 'bmw-m3').photos.includes(X) && !!((await meta()).photosRetablies || {})['bmw-m3|' + empreinte(X)]);
  /* Fichier de sauvegarde réimporté (sans fusion) : une photo supprimée depuis y figure encore.
     C'est le choix du joueur — elle ne doit pas redisparaître à la synchronisation suivante. */
  await page.evaluate(src => window.GMGarage.supprimerPhoto(src), photo(2));
  const tombe2 = ((await meta()).photosSupprimees || {})['bmw-m3|' + empreinte(photo(2))];
  await page.waitForTimeout(20);
  await page.evaluate(d => window.GMGarage.importer(d), { app: 'garage-manifest', version: 1,
    spots: [{ ...prise('bmw-m3', 0), photos: [X, photo(1), photo(2)], maj: '2026-09-01T12:00:00.000Z' }], meta: {}, custom: { list: [] } });
  await page.evaluate(d => window.GMGarage.importer(d, { fusion: true }), { app: 'garage-manifest', version: 1, spots: [],
    meta: { photosSupprimees: { ['bmw-m3|' + empreinte(photo(2))]: tombe2 } }, custom: { list: [] } });
  v('photo supprimée puis réimportée depuis un fichier : elle survit à la synchronisation suivante',
    !!tombe2 && (await idb('all')).find(r => r.carId === 'bmw-m3').photos.includes(photo(2)));

  /* Ce qui est persisté repasse par les filtres au démarrage : pierres tombales à l'ancien
     format (empreinte seule) et entrées fantaisistes sont écartées, des deux tables. */
  {
    const m = await meta();
    const bonne = 'bmw-m3|' + empreinte(photo(1)), date = new Date().toISOString();
    await idb('put', [{ ...m, photosSupprimees: { ...(m.photosSupprimees || {}), [empreinte(photo(9))]: date, 'n\'importe quoi': date },
      photosRetablies: { ...(m.photosRetablies || {}), [bonne]: date, [empreinte(photo(9))]: date, '<img src=x>': 'pas une date' } }]);
    await page.reload({ waitUntil: 'networkidle' }); await pret();
    const ex = await page.evaluate(() => window.GMGarage.exporter());
    const cles = [...Object.keys(ex.meta.photosSupprimees || {}), ...Object.keys(ex.meta.photosRetablies || {})];
    v('au démarrage : pierres tombales et remises persistées repassent par les filtres (ancien format et entrées fantaisistes écartés)',
      cles.length > 0 && cles.every(k => /^[a-z0-9:-]+\|[0-9a-f]{64}$/.test(k)) && !!ex.meta.photosRetablies[bonne], JSON.stringify(cles).slice(0, 200));
  }

  /* Remplacer une photo (recadrage, floutage de plaque) : contrat GMGarage.remplacerPhoto.
     gm-specs.js écrivait lui-même en base : ni date, ni pierre tombale — à la
     synchronisation, l'ORIGINALE (plaque lisible) revenait à côté de la version floutée. */
  const floutee = photo(77), origine = photo(1);
  const aContrat = await page.evaluate(() => typeof window.GMGarage.remplacerPhoto === 'function');
  // La même image (photo 1) figure aussi dans la 205 et la F40 : fiche de la M3 ouverte, seule la M3 est visée.
  await page.evaluate(() => document.querySelector('[data-tab="collection"]')?.click()); await page.waitForTimeout(250);
  await page.evaluate(() => document.querySelector('[data-car="bmw-m3"]')?.click());
  await page.waitForSelector('#overlay .detail-hero', { state: 'attached', timeout: 5000 });
  const rangOrigine = (await idb('all')).find(r => r.carId === 'bmw-m3').photos.indexOf(origine);
  const rRemp = aContrat ? await page.evaluate(([a, b]) => window.GMGarage.remplacerPhoto(a, b), [origine, floutee]) : null;
  const m3Flou = (await idb('all')).find(r => r.carId === 'bmw-m3');
  v('GMGarage.remplacerPhoto : la nouvelle version prend la place de l\'ancienne, à la même position, prise horodatée',
    !!rRemp && rRemp.ok && rRemp.n === 1 && rangOrigine >= 0 && m3Flou.photos[rangOrigine] === floutee && !m3Flou.photos.includes(origine) && Date.parse(m3Flou.maj) > Date.parse('2026-11-01'), JSON.stringify(rRemp));
  const f40Remp = (await idb('all')).find(r => r.carId === 'ferrari-f40');
  v('… sur la fiche OUVERTE seulement : la même image, dans une autre voiture (F40), reste intacte et sans pierre tombale',
    f40Remp.photos.includes(origine) && !f40Remp.photos.includes(floutee) && !((await meta()).photosSupprimees || {})['ferrari-f40|' + empreinte(origine)]);
  v('… et la fiche ouverte montre la nouvelle version sans rechargement',
    await page.evaluate(f => [...document.querySelectorAll('#overlay .thumbstrip .ts img')].some(im => im.src === f), floutee));
  const tombeOrigine = ((await meta()).photosSupprimees || {})['bmw-m3|' + empreinte(origine)];
  await page.evaluate(d => window.GMGarage.importer(d, { fusion: true }), { app: 'garage-manifest', version: 1,
    spots: [{ ...prise('bmw-m3', 0), photos: [origine, photo(2)], maj: '2026-09-01T12:00:00.000Z' }], meta: {}, custom: { list: [] } });
  const m3FlouSync = (await idb('all')).find(r => r.carId === 'bmw-m3');
  v('… et à la synchronisation, l\'originale (plaque lisible) ne revient PAS d\'un autre appareil',
    !!tombeOrigine && !m3FlouSync.photos.includes(origine) && m3FlouSync.photos.includes(floutee), `tombe=${!!tombeOrigine} originale=${m3FlouSync.photos.includes(origine)}`);
  // « Photo d'origine » du recadrage : on remet l'originale. La remise est plus récente que sa pierre tombale.
  if (aContrat) await page.evaluate(([a, b]) => window.GMGarage.remplacerPhoto(a, b), [floutee, origine]);
  await page.evaluate(d => window.GMGarage.importer(d, { fusion: true }), { app: 'garage-manifest', version: 1,
    spots: [{ ...prise('bmw-m3', 0), photos: [floutee, photo(2)], maj: '2026-09-02T12:00:00.000Z' }], meta: { photosSupprimees: { ['bmw-m3|' + empreinte(origine)]: tombeOrigine || '2026-11-01T00:00:00.000Z' } }, custom: { list: [] } });
  const m3Retour = (await idb('all')).find(r => r.carId === 'bmw-m3');
  v('… retour à l\'originale : elle reste après synchronisation, et la version remplacée ne revient pas',
    aContrat && m3Retour.photos.includes(origine) && !m3Retour.photos.includes(floutee), `originale=${m3Retour.photos.includes(origine)} remplacée=${m3Retour.photos.includes(floutee)}`);
  v('… une photo inconnue ou une « nouvelle » qui n\'est pas une image : refusées, rien ne change',
    aContrat && await page.evaluate(async ([a, b]) => { const x = await window.GMGarage.remplacerPhoto('data:image/jpeg;base64,AAAA', a); const y = await window.GMGarage.remplacerPhoto(b, 'javascript:alert(1)'); return x.ok === false && y.ok === false; }, [photo(9), origine])
    && (await idb('all')).find(r => r.carId === 'bmw-m3').photos.includes(origine));

  /* Floutage de plaque : `partout` — l'image est protégée dans TOUTES les prises qui la contiennent. */
  const rPartout = aContrat ? await page.evaluate(([a, b]) => window.GMGarage.remplacerPhoto(a, b, { partout: true }), [photo(2), photo(78)]) : null;
  const apresPartout = (await idb('all')).filter(r => r.carId !== '__meta__' && Array.isArray(r.photos));
  const tombesPartout = (await meta()).photosSupprimees || {};
  v('GMGarage.remplacerPhoto({ partout:true }) (floutage) : toutes les prises contenant l\'image, chacune avec sa pierre tombale',
    !!rPartout && rPartout.ok && rPartout.n === 3 && !apresPartout.some(r => r.photos.includes(photo(2)))
    && ['bmw-m3', 'peugeot-205', 'ferrari-f40'].every(id => apresPartout.find(r => r.carId === id).photos.includes(photo(78)) && tombesPartout[id + '|' + empreinte(photo(2))]),
    JSON.stringify(rPartout));

  /* Couverture choisie par le joueur : une nouvelle capture de la même voiture
     ajoute sa photo EN TÊTE. L'index de couverture n'était pas décalé : la
     couverture devenait, sans rien dire, la photo d'à côté. */
  await idb('put', [{ ...prise('alpine-a110', 0), photos: [photo(1), photo(2), photo(3)], cover: 2 }]);
  await page.reload({ waitUntil: 'networkidle' }); await pret();
  const existeA110 = await page.evaluate(() => !!document.querySelector('[data-car="alpine-a110"]'));
  await page.evaluate(() => { document.querySelector('[data-close]')?.click(); document.querySelector('[data-fab]').click(); });
  await page.waitForSelector('#fileInput', { state: 'attached', timeout: 5000 });
  await page.setInputFiles('#fileInput', { name: 'voiture.png', mimeType: 'image/png', buffer: PNG });
  await page.waitForSelector('#capBody [data-cap="manuel"]', { timeout: 20000 });
  await page.evaluate(() => document.querySelector('#capBody [data-cap="manuel"]').click());
  await page.waitForSelector('#pickQ', { timeout: 5000 });
  await page.fill('#pickQ', 'alpine a110');
  await page.evaluate(() => document.querySelector('[data-pick="alpine-a110"]').click());
  await page.waitForSelector('[data-act="save"]:not([disabled])', { timeout: 5000 });
  await page.click('[data-act="save"]'); await page.waitForTimeout(700);
  const a110 = (await idb('all')).find(r => r.carId === 'alpine-a110');
  v('nouvelle capture d\'une voiture dont la couverture a été choisie : la couverture reste la MÊME photo',
    existeA110 && a110.photos.length === 4 && a110.photos[a110.cover] === photo(3), `photos=${a110.photos.length} couverture=${a110.cover} (${a110.photos[a110.cover] === photo(3) ? 'bonne' : 'autre photo'})`);
  await idb('put', [prise('bmw-m3', 1)]);
  await page.reload({ waitUntil: 'networkidle' }); await pret();
  await supprimerVia('bmw-m3', null);
  const m3b = (await idb('all')).find(r => r.carId === 'bmw-m3');
  v('dernière photo : refusée, avec un message (règle d\'origine conservée)',
    m3b && m3b.photos.length === 1 && await page.evaluate(() => /Dernière photo/.test(document.querySelector('.gsup-btn')?.title || '')), m3b && m3b.photos.length);
  v('… et SANS demander de confirmation pour ensuite refuser', await page.evaluate(() => !document.querySelector('#confirmWrap')));
  v('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));

  await nav.close(); serveur.close();
  let ko = 0; for (const x of res) { if (!x.ok) ko++; console.log(`  ${x.ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${x.t}${!x.ok && x.d != null ? '  → ' + x.d : ''}`); }
  console.log(`\n  ${res.length - ko} passé(s) · ${ko} échec(s)`); process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
