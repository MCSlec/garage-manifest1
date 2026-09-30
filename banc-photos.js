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
  const nav = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
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
  const toast = await page.textContent('#toast');
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
  v('… horodatée (maj) et laissant une pierre tombale à l\'empreinte des octets, comme gm-compte.js',
    !!p205.maj && !!((await meta()).photosSupprimees || {})[empreinte(photo(3))]);
  await ajouterPhotoVia('peugeot-205');
  v('… et la place libérée sous le plafond est réutilisable (7 → 8)', (await nbPhotos('peugeot-205')) === 8, await nbPhotos('peugeot-205'));

  /* Synchronisation : la photo supprimée ne revient pas, et une suppression faite ailleurs s'applique ici */
  const distante = { ...prise('peugeot-205', 8), maj: '2020-01-01T00:00:00.000Z' };   // l'autre appareil a encore photo(3)
  await page.evaluate(d => window.GMGarage.importer(d, { fusion: true }), { app: 'garage-manifest', version: 1, spots: [distante], meta: {}, custom: { list: [] } });
  const apres = (await idb('all')).find(r => r.carId === 'peugeot-205');
  v('fusion cloud : la photo supprimée ici ne revient PAS depuis l\'autre appareil', !apres.photos.includes(photo(3)), apres.photos.length);
  const tombeAilleurs = { [empreinte(photo(5))]: new Date().toISOString() };
  await page.evaluate(d => window.GMGarage.importer(d, { fusion: true }), { app: 'garage-manifest', version: 1, spots: [], meta: { photosSupprimees: tombeAilleurs }, custom: { list: [] } });
  const apres2 = (await idb('all')).find(r => r.carId === 'peugeot-205');
  v('fusion cloud : une photo supprimée sur l\'AUTRE appareil disparaît aussi ici', !apres2.photos.includes(photo(5)) && apres2.photos.includes(photo(4)), apres2.photos.length);
  const exportee = await page.evaluate(() => window.GMGarage.exporter());
  v('… et les pierres tombales voyagent avec la sauvegarde (export)', Object.keys(exportee.meta.photosSupprimees || {}).length === 2);

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
