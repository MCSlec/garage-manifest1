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
  /* Accueil du Garage (maquette v2, 21/11) : il ne s'affiche qu'avec au moins une prise. Un
     garage vide garde l'ancien écran (catalogue seul) : pas de « Dernière prise » sans prise. */
  verifier('garage vide : pas d\'accueil (ni « Dernière prise », ni « Mes marques »)',
    await page.evaluate(() => !document.querySelector('.gx-une, .gx-marques')));

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
  /* La F40 ouverte DEPUIS la Giulia a empilé la Giulia : on ferme jusqu'à ce que plus rien ne
     reste (au plus 4 fois), pour partir d'un état propre. */
  for (let i = 0; i < 4 && await page.evaluate(() => document.querySelector('#overlay').childElementCount > 0); i++) {
    await page.evaluate(() => document.querySelector('#overlay [data-close]')?.click());
    await page.waitForTimeout(400);
  }

  /* --- Accueil du Garage et pages marque (maquette v2, lot 2, 21/11) ----------------------
     Deux prises (Giulia, F40). Les écrans s'empilent dans #overlay : une fiche ouverte depuis
     une page marque se referme SUR la page marque (`pileRetour`), au doigt comme au bouton
     retour du téléphone (`#overlay` reste UNE couche : chaque retour dépile un écran). */
  const ecran = () => page.evaluate(() => {
    const o = document.querySelector('#overlay');
    if (!o.childElementCount) return 'aucun';
    const m = o.querySelector('[data-marque-page]'); if (m) return 'marque:' + m.getAttribute('data-marque-page');
    if (o.querySelector('.mq-marques')) return 'liste';
    const f = o.querySelector('.detail-shell[data-car-id]'); if (f) return 'fiche:' + f.getAttribute('data-car-id');
    return 'autre';
  });
  const toucher = async sel => { await page.evaluate(s => document.querySelector(s)?.click(), sel); await page.waitForTimeout(500); };
  const accueil = await page.evaluate(() => ({
    une: document.querySelector('.gx-une[data-car]')?.getAttribute('data-car') || null,
    marques: [...document.querySelectorAll('.gx-marques [data-marque]')].map(b => b.getAttribute('data-marque')),
    strip: document.querySelectorAll('.gx-strip [data-car]').length,
  }));
  verifier('accueil : « Dernière prise » = une voiture capturée, « Mes marques » = les marques capturées, « Mon garage » = 2',
    ['alfa-giulia', 'ferrari-f40'].includes(accueil.une) && accueil.marques.includes('Ferrari') && accueil.marques.includes('Alfa Romeo') && accueil.strip === 2,
    JSON.stringify(accueil));
  await toucher('.gx-marques [data-marque="Ferrari"]');
  const pageFerrari = await page.evaluate(() => {
    const o = document.querySelector('#overlay');
    return {
      marque: o.querySelector('[data-marque-page]')?.getAttribute('data-marque-page') || null,
      coll: o.querySelector('.mq-coll')?.textContent.replace(/\s+/g, ' ').trim().slice(0, 60) || null,
      mes: [...o.querySelectorAll('.mq-corps .gx-vg[data-car], .mq-corps .gx-strip [data-car]')].map(b => b.getAttribute('data-car')),
      gto: !!o.querySelector('[data-car="ferrari-599-gto"]'),
      logo: !!o.querySelector('img[src*="logo"], svg[aria-label*="logo" i]'),
    };
  });
  verifier('page marque (Ferrari) : progression 1 / N, la F40 dans « Mes Ferrari », la 599 GTO dans les séries à découvrir, aucun logo',
    pageFerrari.marque === 'Ferrari' && /^Ma collection\s*1 \/ \d+/i.test(pageFerrari.coll || '') && pageFerrari.mes.includes('ferrari-f40')
    && !pageFerrari.mes.includes('alfa-giulia') && pageFerrari.gto && !pageFerrari.logo, JSON.stringify(pageFerrari));
  // Pile : page marque → fiche → [fermer] → page marque → [fermer] → rien.
  await toucher('#overlay [data-car="ferrari-f40"]');
  const e1 = await ecran();
  await toucher('#overlay [data-close]');
  const e2 = await ecran();
  await toucher('#overlay [data-close]');
  const e3 = await ecran();
  verifier('pile de retour au doigt : page marque → fiche F40 → fermer = page marque → fermer = garage',
    e1 === 'fiche:ferrari-f40' && e2 === 'marque:Ferrari' && e3 === 'aucun', [e1, e2, e3].join(' → '));
  // Même parcours au bouton retour du téléphone (history.back(), comme Android).
  await toucher('.gx-marques [data-marque="Ferrari"]');
  await toucher('#overlay [data-car="ferrari-f40"]');
  const r0 = await ecran();
  await page.evaluate(() => history.back()); await page.waitForTimeout(600);
  const r1 = await ecran();
  await page.evaluate(() => history.back()); await page.waitForTimeout(600);
  const r2 = await ecran();
  verifier('bouton retour du téléphone : fiche → page marque → garage, un écran par appui',
    r0 === 'fiche:ferrari-f40' && r1 === 'marque:Ferrari' && r2 === 'aucun', [r0, r1, r2].join(' → '));
  // Rouvrir l'écran DÉJÀ affiché ne l'empile pas : une seule fermeture suffit.
  await toucher('.gx-marques [data-marque="Ferrari"]');
  await toucher('.gx-marques [data-marque="Ferrari"]');   // même marque, par-dessus elle-même
  await toucher('#overlay [data-close]');
  const d1 = await ecran();
  verifier('rouvrir l\'écran déjà affiché ne l\'empile pas (une seule fermeture)', d1 === 'aucun', d1);
  for (let i = 0; i < 3 && await page.evaluate(() => document.querySelector('#overlay').childElementCount > 0); i++) await toucher('#overlay [data-close]');
  // Fiche → sa marque (nom de marque cliquable dans l'en-tête) → fermer = la fiche.
  await toucher('.card[data-car="alfa-giulia"]');
  await toucher('#overlay .fx-marque[data-marque]');
  const f1 = await ecran();
  /* Toutes les séries spéciales de la table sont des Ferrari (21/11) : c'est donc sur une AUTRE
     marque qu'on vérifie que la page ne liste que les siennes (mutation non détectée sans ce test). */
  const etrangeres = await page.evaluate(() => [...document.querySelectorAll('#overlay [data-marque-page] [data-car]')]
    .map(b => b.getAttribute('data-car')).filter(id => !id.startsWith('alfa-')));
  verifier('page Alfa Romeo : aucune voiture d\'une autre marque (séries spéciales Ferrari comprises)', etrangeres.length === 0, etrangeres.slice(0, 4).join(', '));
  await toucher('#overlay [data-close]');
  const f2 = await ecran();
  await toucher('#overlay [data-close]');
  const f3 = await ecran();
  verifier('fiche Giulia → « Alfa Romeo › » ouvre sa page marque, et fermer y ramène',
    f1 === 'marque:Alfa Romeo' && f2 === 'fiche:alfa-giulia' && f3 === 'aucun', [f1, f2, f3].join(' → '));
  // Liste des marques → une marque → fermer = la liste.
  await toucher('[data-marques]');
  const l0 = await page.evaluate(() => document.querySelectorAll('#overlay .mq-ligne[data-marque]').length);
  await toucher('#overlay .mq-ligne[data-marque="Ferrari"]');
  const l1 = await ecran();
  await toucher('#overlay [data-close]');
  const l2 = await ecran();
  verifier('liste des marques (une ligne par marque) → Ferrari → fermer = la liste',
    l0 > 100 && l1 === 'marque:Ferrari' && l2 === 'liste', `${l0} lignes · ${l1} → ${l2}`);
  await toucher('#overlay [data-close]');
  /* « Voir les manquantes » d'une page marque : filtre du catalogue sur la marque, voitures non
     capturées. Ouverte depuis la LISTE, la page marque a la liste sous elle : la fermeture
     complète doit vider la pile, sinon la prochaine fiche refermée rouvrirait cette liste. */
  await toucher('[data-marques]');
  await toucher('#overlay .mq-ligne[data-marque="Ferrari"]');
  await toucher('#overlay [data-voir="marque"]');
  const filtre = await page.evaluate(() => ({
    overlay: document.querySelector('#overlay').childElementCount,
    marque: document.querySelector('#brandSel')?.value || null,
    f40: !!document.querySelector('.card[data-car="ferrari-f40"]'),
    tuiles: document.querySelectorAll('.card[data-car]').length,
    autres: [...document.querySelectorAll('.card[data-car]')].filter(b => !b.getAttribute('data-car').startsWith('ferrari-')).length,
  }));
  verifier('« Voir les manquantes » : écran fermé, catalogue filtré sur Ferrari, la F40 capturée absente',
    filtre.overlay === 0 && filtre.marque === 'Ferrari' && !filtre.f40 && filtre.tuiles > 10 && filtre.autres === 0, JSON.stringify(filtre));
  await toucher('.card[data-car]');
  const v1 = await ecran();
  await toucher('#overlay [data-close]');
  const v2 = await ecran();
  verifier('après une fermeture complète, la pile est vide : une fiche refermée ne rouvre pas la liste d\'avant',
    v1.startsWith('fiche:') && v2 === 'aucun', `${v1} → ${v2}`);

  /* --- Barre de défilement (21/11, capture du propriétaire) ----------------------------------
     Sur téléphone, aucune barre : elle était PERMANENTE sur Chrome Android (8 px, contenu décalé).
     Mesure : largeur réservée = offsetWidth − clientWidth du conteneur qui défile. Avec une
     souris, la barre reste (elle y sert).
     ⚠️ Playwright lance Chromium avec `--hide-scrollbars` : TOUTES les barres y sont masquées,
     et ce test passerait sans la correction. Il tourne donc dans un navigateur à part, lancé
     sans cette option (vérifié par mutation : sans la règle `pointer:coarse`, il échoue). */
  const navBarres = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium',
                                           args: ['--no-sandbox'], ignoreDefaultArgs: ['--hide-scrollbars'] });
  const barre = async (tactile) => {
    // Écran court : même une fiche non capturée y défile (sinon il n'y aurait rien à mesurer).
    const c = await navBarres.newContext({ viewport: { width: 390, height: 420 }, isMobile: tactile, hasTouch: tactile });
    const pb = await c.newPage();
    pb.on('pageerror', e => erreursJS.push(String(e)));
    await pb.goto('http://localhost:8099/index.html', { waitUntil: 'networkidle' });
    await pb.waitForFunction(() => window.GMSpecs && window.GMSpecs.fichePourInterface, { timeout: 15000 });
    await pb.evaluate(() => document.querySelector('.card[data-car]')?.click());
    await pb.waitForTimeout(700);
    const m = await pb.evaluate(() => { const b = document.querySelector('#overlay .sh-body');
      return { tactile: matchMedia('(pointer:coarse)').matches, defile: b ? b.scrollHeight > b.clientHeight : false,
               fiche: b ? b.offsetWidth - b.clientWidth : null }; });
    await c.close();
    return m;
  };
  const barreTel = await barre(true), barreSouris = await barre(false);
  await navBarres.close();
  verifier('téléphone : aucune barre de défilement sur la fiche (rien de réservé à droite)',
    barreTel.tactile && barreTel.defile && barreTel.fiche === 0, JSON.stringify(barreTel));
  verifier('souris : la barre de défilement reste (8 px)',
    !barreSouris.tactile && barreSouris.defile && barreSouris.fiche === 8, JSON.stringify(barreSouris));

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
