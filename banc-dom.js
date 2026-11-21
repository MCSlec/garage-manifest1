#!/usr/bin/env node
/* Banc NAVIGATEUR — vérification comportementale du contrat DOM.
   CLAUDE.md §6.9 : `node --check` ne prouve rien sur le câblage. On écrit un
   vrai spot dans IndexedDB, on ouvre la fiche, on lit le DOM rendu. */
'use strict';
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');

const RACINE = __dirname;
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
  const nav = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium',
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

  /* --- Fiche plein écran (21/11) : le verrou reste étanche ------------------
     Voiture NON capturée, sans `INFO.hp` mais avec une fiche technique (599 GTO) : la
     puissance de la fiche ne doit PAS apparaître (elle n'est reprise que pour une voiture
     capturée), et « Changer de modèle » n'a rien à reclasser. Le lien vers la base de la
     série spéciale, lui, est public (c'est le catalogue, pas la fiche). */
  await page.evaluate(() => { const b = document.createElement('button'); b.setAttribute('data-car', 'ferrari-599-gto');
    document.body.appendChild(b); b.click(); b.remove(); });
  await page.waitForTimeout(900);
  const gto = await page.evaluate(() => ({
    verrou: !!document.querySelector('#overlay [data-verrou]'),
    puissance: [...document.querySelectorAll('#overlay .specs-info dt')].some(d => /puissance/i.test(d.textContent)),
    reclasser: !!document.querySelector('#overlay .gcl-btn'),
    base: document.querySelector('#overlay .fx-serie[data-car]')?.getAttribute('data-car') || null,
    titre: document.querySelector('#overlay .fx-modele')?.textContent.trim() || null,
  }));
  verifier('fiche non capturée (599 GTO) : en-tête plein écran avec le modèle', gto.verrou && gto.titre === '599 GTO', JSON.stringify(gto));
  verifier('fiche non capturée : AUCUNE puissance tirée de la fiche technique (verrou étanche)', gto.verrou && !gto.puissance, JSON.stringify(gto));
  verifier('fiche non capturée : pas de « Changer de modèle » (aucune prise à reclasser)', gto.verrou && !gto.reclasser, JSON.stringify(gto));
  verifier('série spéciale : renvoie à sa base (599 GTO → ferrari-599)', gto.base === 'ferrari-599', JSON.stringify(gto));
  await page.evaluate(() => document.querySelector('#overlay [data-close]')?.click());
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
      // Seconde voiture capturée (photo + fiche) : pour vérifier qu'elle ne s'ouvre pas à la position de la Giulia.
      tx.objectStore('spots').put({
        carId: 'ferrari-f40', at: new Date().toISOString(), coords: { lat: 45.76, lng: 4.84 },
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

  /* --- Choisir une motorisation ne ramène PAS sur la photo (20/11) ------ */
  /* Signalé par le propriétaire : « quand j'appuie sur Diesel ou Essence, ça me renvoie sur
     la photo, mais la page de droite est bien actualisée ». La fiche était redessinée en
     entier, et le carrousel repartait de sa première page. On se place sur la page fiche,
     sélecteur à l'écran, puis on touche un type, puis une variante (vrais clics).
     Fiche à onglets (21/11) : la page fiche est l'onglet qui porte `.detail-shell` (le
     premier) — retrouvée par son contenu, jamais par une position supposée. Le défilement
     doit être conservé : sur la fiche plein écran, le perdre ramène sur la photo d'en-tête. */
  const iFiche = await page.evaluate(() => [...document.querySelectorAll('#overlay #pager .page')].findIndex(p => p.querySelector('.detail-shell')));
  const position = () => page.evaluate(() => {
    const p = document.querySelector('#overlay #pager'), s = document.querySelector('#overlay [data-moto-actif]');
    return { page: p && p.clientWidth ? Math.round(p.scrollLeft / p.clientWidth) : -1,
             haut: s ? Math.round(s.getBoundingClientRect().top) : null,
             actif: s ? s.getAttribute('data-moto-actif') : null,
             defile: document.querySelector('#overlay .sh-body')?.scrollTop || 0,
             pointActif: [...document.querySelectorAll('#overlay #dots .dot')].findIndex(d => d.classList.contains('on')) };
  });
  await page.evaluate(i => { const p = document.querySelector('#overlay #pager'); p.scrollLeft = i * p.clientWidth; }, iFiche);
  await page.waitForTimeout(400);
  /* Sélecteur au MILIEU de l'écran, là où le doigt le touche : en haut, il passe sous la barre
     d'onglets collée (position:sticky), et Playwright remettait la fiche en haut avant de
     cliquer — le test mesurait alors son propre défilement, pas celui de l'app. */
  await page.evaluate(() => document.querySelector('#overlay [data-moto-actif]').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(400);
  const p0 = await position();
  const autreType = await page.evaluate((actif) => {
    const t = (actif || '').split('|')[0];
    const b = [...document.querySelectorAll('#overlay [data-moto-type]')].find(x => x.getAttribute('data-moto-type').split('|')[1] !== t);
    return b ? b.getAttribute('data-moto-type') : null;
  }, p0.actif);
  await page.click(`#overlay [data-moto-type="${autreType}"]`);
  await page.waitForTimeout(600);
  const p1 = await position();
  verifier('choisir un autre TYPE (Essence / Diesel…) : on reste sur la page fiche, sélecteur au même endroit',
    iFiche >= 0 && p0.page === iFiche && p0.defile > 60 && p1.page === iFiche && p1.pointActif === iFiche && p1.actif !== p0.actif
    && Math.abs(p1.haut - p0.haut) <= 8 && Math.abs(p1.defile - p0.defile) <= 8,
    JSON.stringify({ avant: p0, apres: p1 }));
  // Retour sur le type Diesel (plusieurs variantes ; Essence n'en a qu'une), puis une autre variante.
  await page.click('#overlay [data-moto-type$="|diesel"]');
  await page.waitForTimeout(600);
  const p1b = await position();
  verifier('… et revenir à Diesel : toujours la page fiche, même défilement', p1b.page === iFiche && /^diesel\|/.test(p1b.actif || '') && Math.abs(p1b.defile - p1.defile) <= 8, JSON.stringify(p1b));
  const autreVariante = await page.evaluate(() => document.querySelector('#overlay button[data-moto-variant]')?.getAttribute('data-moto-variant') || null);
  if (autreVariante) {
    await page.click(`#overlay button[data-moto-variant="${autreVariante}"]`);
    await page.waitForTimeout(600);
    const p2 = await position();
    verifier('choisir une autre VARIANTE : on reste sur la page fiche, sélecteur au même endroit',
      p2.page === iFiche && p2.actif !== p1b.actif && Math.abs(p2.haut - p1b.haut) <= 8 && Math.abs(p2.defile - p1b.defile) <= 8, JSON.stringify({ avant: p1b, apres: p2 }));
  } else verifier('choisir une autre VARIANTE : (préparation) le type choisi propose une autre variante', false, autreType);
  /* Une AUTRE voiture ouverte depuis la fiche (futur lien « voitures similaires ») repart du
     haut : la mémoire de position ne vaut que pour la même voiture. */
  await page.evaluate(() => { const b = document.createElement('button'); b.setAttribute('data-car', 'ferrari-f40'); b.id = 'lien-autre';
    document.querySelector('#overlay .page:last-child').appendChild(b); b.click(); });
  await page.waitForTimeout(600);
  const pAutre = await page.evaluate(() => { const p = document.querySelector('#overlay #pager');
    return { id: document.querySelector('#overlay .detail-shell')?.getAttribute('data-car-id'),
      page: p && p.clientWidth ? Math.round(p.scrollLeft / p.clientWidth) : -1, defile: document.querySelector('#overlay .sh-body')?.scrollTop || 0 }; });
  verifier('une autre voiture ouverte depuis la fiche s\'ouvre en haut, sur SA photo et l\'onglet Fiche (pas de position héritée)', pAutre.id === 'ferrari-f40' && pAutre.page === 0 && pAutre.defile === 0, JSON.stringify(pAutre));
  /* Tuile « Position » (un lien) : même couleur que les tuiles voisines, pas le bleu par défaut
     des liens, illisible sur fond sombre (capture du propriétaire, 21/11). */
  const couleurs = await page.evaluate(() => {
    const c = s => { const e = document.querySelector(s); return e ? getComputedStyle(e).color : null; };
    return { lien: c('#overlay a.spec dd'), voisine: c('#overlay div.spec dd, #overlay .spec:not(a) dd') };
  });
  verifier('tuile « Position » lisible : couleur des tuiles voisines, pas le bleu des liens',
    !!couleurs.lien && couleurs.lien === couleurs.voisine, JSON.stringify(couleurs));
  // Rouvrir la fiche depuis la collection repart bien de la photo (la mémoire ne vaut que pour la fiche ouverte).
  await page.evaluate(() => document.querySelector('#overlay [data-close]')?.click());
  await page.waitForTimeout(400);
  await page.evaluate(() => { document.querySelector('[data-car="alfa-giulia"]')?.click(); });
  await page.waitForTimeout(800);
  const pRouverte = await position();
  verifier('fiche fermée puis rouverte : elle repart du haut (photo, onglet Fiche)', pRouverte.page === 0 && pRouverte.defile === 0, JSON.stringify(pRouverte));

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
