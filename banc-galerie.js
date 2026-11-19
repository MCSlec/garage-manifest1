#!/usr/bin/env node
/* ==========================================================================
   Banc NAVIGATEUR — « Enregistrer cette photo sur le téléphone » (19/11)
   --------------------------------------------------------------------------
   Demande du propriétaire : retrouver dans la galerie du téléphone une photo
   prise depuis l'app. Une app web ne peut pas écrire seule dans la galerie :
   gm-specs.js pose un bouton sur la photo affichée de la fiche. Le banc passe
   par la vraie interface (fiche ouverte, vignette touchée, bouton touché) :
     · Android / ordinateur : un TÉLÉCHARGEMENT, nommé d'après la voiture, dont
       les octets sont EXACTEMENT ceux de la photo affichée (pas une autre de la
       série, pas une version retouchée) ;
     · iPhone : la FEUILLE DE PARTAGE avec le fichier (seule voie vers
       « Photos ») ; annulée par le joueur → aucun téléchargement à la place ;
       partage en échec → repli sur le téléchargement ;
     · aucun bouton sur une voiture non collectée (verrou, contrat DOM §3) ;
     · retour visible SUR le bouton touché (leçon F-9).
   Usage : NODE_PATH=<node_modules avec playwright-core> node banc-galerie.js
   ========================================================================== */
'use strict';
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');
const RACINE = __dirname, PORT = 8113;
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const serveur = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(RACINE, p);
  if (!f.startsWith(RACINE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'text/plain' }); res.end(fs.readFileSync(f));
});
const res = []; const v = (t, ok, d) => res.push({ t, ok: !!ok, d });

// Deux vraies petites images (octets distincts), comme l'app les garde : JPEG en dataURL.
const JPEG_A = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64');
const JPEG_B = Buffer.concat([JPEG_A.subarray(0, JPEG_A.length - 2), Buffer.from('banc-galerie-B'), JPEG_A.subarray(JPEG_A.length - 2)]);
const durl = (b) => 'data:image/jpeg;base64,' + b.toString('base64');
const prise = (carId, photos) => ({ carId, at: '2026-09-01T12:00:00.000Z', coords: null, loc: 'Banc', note: '', photos, cover: 0, variants: [], favorite: false, maj: '2026-09-01T12:00:00.000Z' });

const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';

/* Faux partage, posé AVANT le chargement : on note ce qui est partagé, et on
   peut le faire échouer (annulation du joueur, ou panne). */
const fauxPartage = (mode) => {
  window.__partages = [];
  navigator.canShare = (d) => !!(d && Array.isArray(d.files) && d.files.length);
  navigator.share = async (d) => {
    const f = d.files[0]; const o = new Uint8Array(await f.arrayBuffer());
    window.__partages.push({ nom: f.name, type: f.type, octets: Array.from(o) });
    if (mode === 'annule') { const e = new Error('annulé'); e.name = 'AbortError'; throw e; }
    if (mode === 'panne') throw new Error('panne');
  };
};

(async () => {
  await new Promise(r => serveur.listen(PORT, r));
  const nav = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const erreurs = [];

  async function ouvrir(ua, partage) {
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', userAgent: ua, acceptDownloads: true });
    await ctx.route(u => !u.href.startsWith(`http://localhost:${PORT}`), r => r.abort());   // aucun service tiers (Google, relais, tuiles)
    if (partage) await ctx.addInitScript(fauxPartage, partage);
    const page = await ctx.newPage();
    page.on('pageerror', e => erreurs.push(String(e)));
    await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.GMSpecs && window.GMGarage, { timeout: 15000 });
    await page.evaluate((recs) => new Promise((ok, ko) => {
      const rq = indexedDB.open('garage-manifest'); rq.onerror = ko;
      rq.onsuccess = () => { const tx = rq.result.transaction('spots', 'readwrite'); for (const r of recs) tx.objectStore('spots').put(r); tx.oncomplete = () => ok(); tx.onerror = ko; };
    }), [prise('ferrari-f40', [durl(JPEG_A), durl(JPEG_B)])]);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.GMSpecs && window.GMGarage, { timeout: 15000 });
    return { ctx, page };
  }
  const fiche = async (page, id) => {
    await page.evaluate(() => document.querySelector('[data-tab="collection"]')?.click()); await page.waitForTimeout(250);
    await page.evaluate(i => document.querySelector(`[data-car="${i}"]`)?.click(), id);
    await page.waitForSelector('#overlay .detail-shell', { state: 'attached', timeout: 5000 });
    await page.waitForTimeout(300);
  };
  const imageAffichee = (page) => page.evaluate(() => { const i = document.querySelector('#overlay .detail-hero img'); return i ? (i.currentSrc || i.src) : null; });

  /* ---- Android : téléchargement de la photo AFFICHÉE ---- */
  {
    const { ctx, page } = await ouvrir(UA_ANDROID, 'ok');
    await fiche(page, 'ferrari-f40');
    const btn = await page.$('#overlay .detail-hero .genr-btn');
    v('Android : bouton « Enregistrer » posé sur la photo de la fiche', !!btn);
    // Passer à la 2e photo (vignette), comme le joueur : c'est ELLE qui doit partir.
    await page.evaluate(() => document.querySelector('#overlay [data-setcover="1"]')?.click());
    await page.waitForTimeout(400);
    await page.waitForSelector('#overlay .detail-hero .genr-btn', { state: 'attached', timeout: 3000 }).catch(() => {});
    const affichee = await imageAffichee(page);
    const attendu = affichee && affichee.startsWith('data:image/jpeg;base64,') ? Buffer.from(affichee.split(',')[1], 'base64') : null;
    let dl = null;
    try {
      [dl] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }), page.click('#overlay .detail-hero .genr-btn')]);
    } catch (_) {}
    v('Android : un téléchargement part (pas la feuille de partage)', !!dl && (await page.evaluate(() => window.__partages.length)) === 0,
      dl ? 'partages=' + await page.evaluate(() => window.__partages.length) : 'aucun téléchargement');
    if (dl) {
      const nom = dl.suggestedFilename();
      v('… nommé d\'après la voiture (garage-manifest-ferrari-f40-….jpg)', /^garage-manifest-ferrari-f40-[a-z0-9-]+\.jpg$/.test(nom), nom);
      const octets = fs.readFileSync(await dl.path());
      v('… octets IDENTIQUES à la photo affichée (2e de la série)', attendu && octets.equals(attendu) && octets.equals(JPEG_B),
        `reçu ${octets.length} o, affichée ${attendu && attendu.length} o, B ${JPEG_B.length} o`);
    }
    const etat = await page.evaluate(() => { const b = document.querySelector('#overlay .genr-btn'); return b && { ok: b.classList.contains('genr-ok'), label: b.getAttribute('aria-label') }; });
    v('… retour visible sur le bouton touché (coche, libellé « Photo téléchargée »)', etat && etat.ok && etat.label === 'Photo téléchargée', etat);
    // Visible pour de vrai : dans la fenêtre, et rien par-dessus (leçon F-9).
    const visible = await page.evaluate(() => {
      const b = document.querySelector('#overlay .genr-btn'); if (!b) return false;
      const r = b.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const dessus = document.elementFromPoint(x, y);
      return r.width > 0 && y > 0 && y < innerHeight && x > 0 && x < innerWidth && (dessus === b || b.contains(dessus));
    });
    v('… bouton réellement visible (dans l\'écran, non recouvert)', visible);
    const chevauche = await page.evaluate(() => {
      const a = document.querySelector('#overlay .genr-btn')?.getBoundingClientRect(), b = document.querySelector('#overlay .gsup-btn')?.getBoundingClientRect();
      return !a || !b ? 'absent' : !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
    });
    v('… ne recouvre pas la corbeille de la photo', chevauche === false, chevauche);
    await ctx.close();
  }

  /* ---- iPhone : feuille de partage, annulation, panne ---- */
  for (const mode of ['ok', 'annule', 'panne']) {
    const { ctx, page } = await ouvrir(UA_IPHONE, mode);
    await fiche(page, 'ferrari-f40');
    const affichee = await imageAffichee(page);
    let dl = null;
    const attente = page.waitForEvent('download', { timeout: 2500 }).then(d => (dl = d)).catch(() => {});
    await page.click('#overlay .detail-hero .genr-btn').catch(() => {});
    await attente;
    const parts = await page.evaluate(() => window.__partages);
    const p0 = parts[0];
    const memes = p0 && affichee && Buffer.from(p0.octets).equals(Buffer.from(affichee.split(',')[1], 'base64'));
    if (mode === 'ok') {
      v('iPhone : la feuille de partage reçoit la photo affichée (seule voie vers « Photos »)', parts.length === 1 && memes && p0.type === 'image/jpeg' && /^garage-manifest-ferrari-f40-.+\.jpg$/.test(p0.nom), p0 && p0.nom);
      v('iPhone : … et aucun téléchargement en plus', !dl);
    } else if (mode === 'annule') {
      v('iPhone : partage ANNULÉ par le joueur → aucun téléchargement à la place', parts.length === 1 && !dl);
      const ok = await page.evaluate(() => document.querySelector('#overlay .genr-btn')?.classList.contains('genr-ok'));
      v('iPhone : … et pas de coche (rien n\'a été enregistré)', !ok);
    } else {
      v('iPhone : partage en PANNE → repli sur le téléchargement', parts.length === 1 && !!dl, dl ? dl.suggestedFilename() : 'aucun');
    }
    await ctx.close();
  }

  /* ---- Verrou : aucune photo, aucun bouton sur une voiture non collectée ---- */
  {
    const { ctx, page } = await ouvrir(UA_ANDROID, 'ok');
    await fiche(page, 'peugeot-205');     // non collectée dans ce banc
    const n = await page.evaluate(() => document.querySelectorAll('#overlay .genr-btn').length);
    v('voiture non collectée : aucun bouton « Enregistrer »', n === 0, n);
    await ctx.close();
  }

  v('aucune erreur JS', erreurs.length === 0, erreurs.join(' | '));
  await nav.close(); serveur.close();
  let ok = 0, ko = 0;
  for (const r of res) { if (r.ok) ok++; else ko++; console.log(`  ${r.ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${r.t}${!r.ok && r.d !== undefined ? '  → ' + (typeof r.d === 'string' ? r.d : JSON.stringify(r.d)) : ''}`); }
  console.log(`\n  ${ok} passé(s) · ${ko} échec(s)`);
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
