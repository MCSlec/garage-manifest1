#!/usr/bin/env node
/* Banc NAVIGATEUR — vérification comportementale du contrat DOM.
   CLAUDE.md §6.9 : `node --check` ne prouve rien sur le câblage. On écrit un
   vrai spot dans IndexedDB, on ouvre la fiche, on lit le DOM rendu. */
'use strict';
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');

const RACINE = '/home/user/garage-manifest1';
const TYPES = { '.html':'text/html', '.js':'application/javascript', '.json':'application/json',
                '.png':'image/png', '.webmanifest':'application/manifest+json' };

const serveur = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(RACINE, p);
  if (!f.startsWith(RACINE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'text/plain' });
  res.end(fs.readFileSync(f));
});

const resultats = [];
const verifier = (intitule, ok, detail) => { resultats.push({ intitule, ok, detail }); };

(async () => {
  await new Promise(r => serveur.listen(8099, r));
  const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
                                      args: ['--no-sandbox'] });
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });  // iPhone vertical
  const page = await ctx.newPage();
  const erreursJS = [];
  page.on('pageerror', e => erreursJS.push(String(e)));

  await page.goto('http://localhost:8099/index.html', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.GMSpecs && window.GMSpecs.fichePourInterface, { timeout: 15000 });

  verifier('gm-specs.js et gm-matcher.js sont chargés',
    await page.evaluate(() => !!(window.GMSpecs && window.GMMatcher)));

  /* --- Voiture NON spottée : le verrou doit être étanche --------------- */
  await page.evaluate(() => { document.querySelector('[data-car="alfa-giulia"]')?.click(); });
  await page.waitForTimeout(900);

  const nonSpottee = await page.evaluate(() => ({
    verrou: !!document.querySelector('#overlay [data-verrou]'),
    titre:  document.querySelector('#overlay .info-head h2')?.textContent.trim() || null,
    greffe: !!document.querySelector('#overlay .gsp'),
    moto:   !!document.querySelector('#overlay [data-moto-actif]')
  }));
  verifier('non spottée — `.info-head h2` présent (contrat gm-specs)', !!nonSpottee.titre, nonSpottee.titre);
  verifier('non spottée — `[data-verrou]` posé', nonSpottee.verrou);
  verifier('non spottée — AUCUNE fiche technique greffée (verrou étanche)', !nonSpottee.greffe);

  await page.evaluate(() => document.querySelector('#overlay [data-close],#overlay .scrim')?.click());
  await page.waitForTimeout(400);

  /* --- On spotte la Giulia, puis on rouvre ---------------------------- */
  await page.evaluate(() => new Promise((res, rej) => {
    const rq = indexedDB.open('garage-manifest');
    rq.onsuccess = () => {
      const db = rq.result;
      const tx = db.transaction('spots', 'readwrite');
      tx.objectStore('spots').put({
        carId: 'alfa-giulia', at: new Date().toISOString(), coords: null,
        photos: ['data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'],
        loc: 'Banc', note: '', cover: 0, variants: [], favorite: false
      });
      tx.oncomplete = res; tx.onerror = rej;
    };
    rq.onerror = rej;
  }));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.GMSpecs && window.GMSpecs.fichePourInterface, { timeout: 15000 });
  await page.evaluate(() => { document.querySelector('[data-car="alfa-giulia"]')?.click(); });
  await page.waitForTimeout(1200);

  const spottee = await page.evaluate(() => {
    const o = document.querySelector('#overlay');
    const gsp = o.querySelector('.gsp');
    return {
      verrou: !!o.querySelector('[data-verrou]'),
      titre:  o.querySelector('.info-head h2')?.textContent.trim() || null,
      motoActif: o.querySelector('[data-moto-actif]')?.getAttribute('data-moto-actif') || null,
      nbBoutonsType: o.querySelectorAll('[data-moto-type]').length,
      nbVariantes:   o.querySelectorAll('[data-moto-variant]').length,
      greffe: !!gsp,
      nbFiches: o.querySelectorAll('.gsp:not(.gsp-gens)').length,
      nbGens:   o.querySelectorAll('.gsp-gens').length,
      texteGreffe: gsp ? gsp.textContent.replace(/\s+/g, ' ').slice(0, 220) : null,
      shell: !!o.querySelector('.detail-shell'),
      marque: o.querySelector('.detail-shell')?.getAttribute('data-brand') || null,
      rarete: o.querySelector('.detail-shell')?.getAttribute('data-rarity') || null
    };
  });

  verifier('spottée — `.info-head h2` toujours présent', !!spottee.titre, spottee.titre);
  verifier('spottée — verrou levé', !spottee.verrou);
  verifier('spottée — `.detail-shell` avec marque et rareté',
    spottee.shell && spottee.marque === 'Alfa Romeo' && spottee.rarete === 'peucommun',
    `brand=${spottee.marque} rarity=${spottee.rarete}`);
  /* L'UI n'affiche que les variantes du type ACTIF — Essence n'en a qu'une.
     La première version de ce test en attendait 6 : c'était le test qui avait
     tort, pas l'interface. */
  verifier('spottée — sélecteur de motorisation RENDU (3 types, variantes du type actif)',
    spottee.nbBoutonsType === 3 && spottee.nbVariantes >= 1,
    `${spottee.nbBoutonsType} types · ${spottee.nbVariantes} variante(s) affichée(s)`);
  verifier('spottée — `[data-moto-actif]` posé', !!spottee.motoActif, spottee.motoActif);
  verifier('spottée — fiche technique greffée par gm-specs.js', spottee.greffe);
  /* blocHTML() produit DEUX elements partageant la classe de base `gsp` :
     la fiche technique (`.gsp`) et les generations (`.gsp.gsp-gens`). Compter
     `.gsp` tout court faisait croire a un doublon — faux positif du test. */
  verifier('spottée — exactement UNE fiche technique et UN bloc générations',
    spottee.nbFiches === 1 && spottee.nbGens === 1,
    `${spottee.nbFiches} fiche(s) · ${spottee.nbGens} générations`);

  /* --- Les chiffres greffés suivent-ils la motorisation choisie ? ------ */
  const avant = spottee.texteGreffe;
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#overlay [data-moto-type]')]
      .find(x => x.getAttribute('data-moto-type').includes('|diesel'));
    b?.click();
  });
  await page.waitForTimeout(1200);
  const apres = await page.evaluate(() => {
    const o = document.querySelector('#overlay');
    return {
      motoActif: o.querySelector('[data-moto-actif]')?.getAttribute('data-moto-actif') || null,
      texte: o.querySelector('.gsp')?.textContent.replace(/\s+/g, ' ').slice(0, 220) || null
    };
  });
  verifier('bascule Essence → Diesel : `[data-moto-actif]` a changé',
    apres.motoActif && apres.motoActif !== spottee.motoActif, `${spottee.motoActif} → ${apres.motoActif}`);
  verifier('bascule Essence → Diesel : les CHIFFRES GREFFÉS ont changé',
    !!(apres.texte && avant && apres.texte !== avant));

  verifier('aucune erreur JS levée pendant le parcours', erreursJS.length === 0, erreursJS.join(' | ').slice(0, 200));

  await page.screenshot({ path: './banc-capture.png', fullPage: true });
  await nav.close(); serveur.close();

  let ko = 0;
  console.log('\nBanc navigateur — contrat DOM (viewport 390×844)\n');
  for (const r of resultats) {
    if (!r.ok) ko++;
    console.log(`  ${r.ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${r.intitule}` +
                (r.detail ? `\x1b[2m  — ${r.detail}\x1b[0m` : ''));
  }
  console.log(`\n  ${resultats.length - ko} passé(s) · ${ko} échec(s)\n`);
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
