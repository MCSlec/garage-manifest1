#!/usr/bin/env node
/* ======================================================================
   banc-matcher.js — tests du rapprochement IA → catalogue
   ----------------------------------------------------------------------
   Même philosophie que banc-audit.js : aucune dépendance, exécution par
   `node banc-matcher.js`, sortie en code non nul si un test échoue — donc
   utilisable comme garde avant commit.

   POURQUOI SUR LE VRAI CATALOGUE
   Les tests tournent sur le catalogue RÉELLEMENT FUSIONNÉ (CARS d'index.html
   + CATALOGUE_PLUS de gm-specs.js, après etendreCatalogue et retrait des
   doublons), pas sur une poignée d'entrées inventées. Un matcher qui marche
   sur cinq voitures ne prouve rien : la difficulté vient justement du bruit
   de 1 070 libellés voisins — « 911 GT3 » face à « 911 GT3 RS », « 911 GT3
   Cup », « 911 GT3 R »… C'est ce bruit qui fabrique les faux positifs.

   CE QUE LE BANC VÉRIFIE, ET PAS SEULEMENT QUE « ÇA RENVOIE QUELQUE CHOSE »
   Un test qui se contente d'un résultat non vide passerait avec un matcher
   qui répond n'importe quoi. Chaque cas déclare donc ce qu'il attend :
   l'identifiant, le statut, ou explicitement l'ABSENCE de correspondance.
   ====================================================================== */
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const RACINE = __dirname;
const C = process.stdout.isTTY
  ? { v: '\x1b[32m', r: '\x1b[31m', j: '\x1b[33m', g: '\x1b[2m', b: '\x1b[1m', z: '\x1b[0m' }
  : { v: '', r: '', j: '', g: '', b: '', z: '' };

/* ----------------------------------------------------------------------
   Chargement du catalogue fusionné — repris de banc-audit.js
   ---------------------------------------------------------------------- */
function extraireCars(html) {
  const ancre = html.indexOf('const CARS = [');
  if (ancre === -1) throw new Error("bloc « const CARS = [ » introuvable dans index.html");
  const debut = html.indexOf('[', ancre);
  let prof = 0, i = debut, chaine = null, echap = false;
  for (; i < html.length; i++) {
    const c = html[i];
    if (chaine) {
      if (echap) { echap = false; continue; }
      if (c === '\\') { echap = true; continue; }
      if (c === chaine) chaine = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { chaine = c; continue; }
    if (c === '[') prof++;
    else if (c === ']') { prof--; if (!prof) break; }
  }
  return vm.runInNewContext('(' + html.slice(debut, i + 1) + ')');
}

function chargerCatalogue() {
  const html = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
  const CARS = extraireCars(html);
  const noop = () => {};
  const el = () => ({
    style: {}, dataset: {}, classList: { add: noop, remove: noop, contains: () => false },
    appendChild: noop, insertAdjacentHTML: noop, setAttribute: noop, getAttribute: () => null,
    addEventListener: noop, remove: noop, querySelector: () => null, querySelectorAll: () => [], closest: () => null
  });
  /* readyState 'loading' : l'auto-installation du module ne se déclenche pas,
     on garde la main sur l'ordre des appels. */
  const bac = {
    CARS,
    document: { readyState: 'loading', addEventListener: noop, querySelector: () => null,
                querySelectorAll: () => [], getElementById: () => null, createElement: el, head: el(), body: el() },
    navigator: { userAgent: 'banc', vibrate: noop },
    location: { href: 'http://localhost/', origin: 'http://localhost' },
    MutationObserver: class { observe() {} disconnect() {} },
    setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0,
    fetch: () => Promise.reject(new Error('hors ligne')),
    console: { log: noop, info: noop, warn: noop, error: noop }
  };
  bac.window = bac; bac.globalThis = bac; bac.self = bac;
  const ctx = vm.createContext(bac);
  vm.runInContext(fs.readFileSync(path.join(RACINE, 'gm-specs.js'), 'utf8'), ctx, { filename: 'gm-specs.js' });
  const G = bac.GMSpecs;
  G.etendreCatalogue && G.etendreCatalogue();
  G.retirerDoublons && G.retirerDoublons();
  vm.runInContext(fs.readFileSync(path.join(RACINE, 'gm-matcher.js'), 'utf8'), ctx, { filename: 'gm-matcher.js' });
  return { catalogue: bac.CARS, GMMatcher: bac.GMMatcher };
}

/* ----------------------------------------------------------------------
   Déclaration des cas
   ---------------------------------------------------------------------- */
const resultats = [];
function cas(famille, intitule, devinettes, attendu) {
  resultats.push({ famille, intitule, devinettes, attendu });
}

/* 1. Correspondance exacte ------------------------------------------- */
cas('correspondance exacte', 'libellé identique au catalogue',
  [{ brand: 'Alfa Romeo', model: 'Giulia', confidence: 0.9 }],
  { id: 'alfa-giulia', statut: 'CONFIRME' });

cas('correspondance exacte', 'modèle emblématique',
  [{ brand: 'Porsche', model: '911 Carrera', confidence: 0.88 }],
  { id: 'porsche-911', statut: 'CONFIRME' });

/* 2. Variation de format du nom -------------------------------------- */
cas('variation de format', 'casse et ponctuation différentes',
  [{ brand: 'ALFA ROMEO', model: 'giulia', confidence: 0.9 }],
  { id: 'alfa-giulia' });

cas('variation de format', 'accents absents',
  [{ brand: 'Citroen', model: 'Mehari', confidence: 0.8 }],
  { id: 'citroen-mehari' });

cas('variation de format', 'espaces surnuméraires',
  [{ brand: '  BMW  ', model: '  M3  ', confidence: 0.85 }],
  { id: 'bmw-m3' });

/* 3. Alias de marque -------------------------------------------------- */
cas('alias', '« VW » pour Volkswagen',
  [{ brand: 'VW', model: 'Golf GTI', confidence: 0.85 }],
  { id: 'vw-golf-gti' });

cas('alias', '« Mercedes » pour Mercedes-Benz',
  [{ brand: 'Mercedes', model: 'Classe G', confidence: 0.8 }],
  { marqueAttendue: 'Mercedes-Benz' });

cas('alias', '« Chevy » pour Chevrolet',
  [{ brand: 'Chevy', model: 'Camaro', confidence: 0.8 }],
  { marqueAttendue: 'Chevrolet' });

/* 4. Mauvais modèle : la marque est juste, le modèle n'existe pas ----- */
cas('mauvais modèle', 'modèle inventé chez une marque réelle',
  [{ brand: 'Peugeot', model: 'Zorglub 9000', confidence: 0.9 }],
  { statut: 'AUCUNE_CORRESPONDANCE_SURE' });

/* 5. Mauvaise génération --------------------------------------------- */
/* La génération n'est pas une entrée de catalogue : le matcher doit
   ramener le MODÈLE, et c'est ensuite GENS/MOTOR_SPECS qui portent la
   génération. Un matcher qui échouerait ici renverrait l'utilisateur à une
   saisie manuelle pour une voiture pourtant présente. */
cas('mauvaise génération', 'génération précisée mais absente du libellé',
  [{ brand: 'Volkswagen', model: 'Golf Mk7', confidence: 0.8 }],
  { marqueAttendue: 'Volkswagen', contient: 'golf' });

/* 6. Mauvaise motorisation ------------------------------------------- */
/* Même logique : la motorisation ne doit jamais faire échouer le
   rapprochement du modèle. */
cas('mauvaise motorisation', 'motorisation accolée au modèle',
  [{ brand: 'Alfa Romeo', model: 'Giulia 2.2 JTDm 190', confidence: 0.8 }],
  { contient: 'giulia' });

/* 7. Modèle hors catalogue ------------------------------------------- */
cas('hors catalogue', 'marque et modèle inconnus',
  [{ brand: 'Zastava', model: 'Koral 55', confidence: 0.95 }],
  { statut: 'AUCUNE_CORRESPONDANCE_SURE' });

cas('hors catalogue', 'texte vide',
  [{ brand: '', model: '', confidence: 0.9 }],
  { statut: 'AUCUNE_CORRESPONDANCE_SURE' });

cas('hors catalogue', 'aucune devinette',
  [],
  { statut: 'AUCUNE_CORRESPONDANCE_SURE' });

/* 8. Faible confiance IA ---------------------------------------------- */
/* Le modèle est parfaitement reconnu, mais l'IA elle-même doute. La
   confiance finale doit chuter, et le statut refuser de trancher — c'est
   exactement la situation que l'ancien score unique masquait. */
cas('faible confiance IA', 'modèle juste, IA très incertaine',
  [{ brand: 'Alfa Romeo', model: 'Giulia', confidence: 0.05 }],
  { statut: 'AUCUNE_CORRESPONDANCE_SURE', catalogScoreMin: 0.8 });

/* 9. Ambiguïté top 1 / top 2 ------------------------------------------ */
/* Deux devinettes également plausibles sur deux voitures réellement
   distinctes : le matcher doit le DIRE plutôt que de choisir. */
cas('ambiguïté', 'deux devinettes concurrentes de même confiance',
  [{ brand: 'Porsche', model: '911 GT3', confidence: 0.8 },
   { brand: 'Porsche', model: '911 GT3 RS', confidence: 0.8 }],
  { statutParmi: ['AMBIGU', 'CONFIRME'], auMoins: 2 });

/* 10. Séparation des grandeurs ---------------------------------------- */
cas('séparation des grandeurs', 'aiConfidence n’altère jamais catalogScore',
  [{ brand: 'Alfa Romeo', model: 'Giulia', confidence: 0.2 }],
  { memeCatalogScoreQue: [{ brand: 'Alfa Romeo', model: 'Giulia', confidence: 0.99 }] });

/* ----------------------------------------------------------------------
   Exécution
   ---------------------------------------------------------------------- */
function lancer() {
  const { catalogue, GMMatcher } = chargerCatalogue();
  if (!GMMatcher) { console.error('gm-matcher.js n’a pas exposé GMMatcher'); process.exit(1); }

  console.log(`${C.b}Banc du matcher${C.z}  ${C.g}gm-matcher v${GMMatcher.VERSION_MATCHER} · catalogue fusionné : ${catalogue.length} véhicules${C.z}\n`);

  let ok = 0, ko = 0;
  let familleCourante = null;

  for (const t of resultats) {
    if (t.famille !== familleCourante) {
      familleCourante = t.famille;
      console.log(`${C.b}  ${familleCourante}${C.z}`);
    }
    const r = GMMatcher.rapprocher(t.devinettes, { catalogue });
    const top = r.candidats[0] || null;
    const echecs = [];
    const a = t.attendu;

    if (a.id && (!top || top.id !== a.id)) {
      echecs.push(`attendu « ${a.id} », obtenu « ${top ? top.id : 'rien'} »`);
    }
    if (a.statut && r.statut !== a.statut) {
      echecs.push(`statut attendu ${a.statut}, obtenu ${r.statut}`);
    }
    if (a.statutParmi && !a.statutParmi.includes(r.statut)) {
      echecs.push(`statut ${r.statut} hors de [${a.statutParmi.join(', ')}]`);
    }
    if (a.marqueAttendue && (!top || top.brand !== a.marqueAttendue)) {
      echecs.push(`marque attendue « ${a.marqueAttendue} », obtenue « ${top ? top.brand : 'rien'} »`);
    }
    if (a.contient && (!top || !GMMatcher.normaliser(top.model).includes(a.contient))) {
      echecs.push(`modèle devait contenir « ${a.contient} », obtenu « ${top ? top.model : 'rien'} »`);
    }
    if (typeof a.auMoins === 'number' && r.candidats.length < a.auMoins) {
      echecs.push(`${a.auMoins} candidats attendus, ${r.candidats.length} obtenu(s)`);
    }
    if (typeof a.catalogScoreMin === 'number' && (!top || top.catalogScore < a.catalogScoreMin)) {
      echecs.push(`catalogScore ≥ ${a.catalogScoreMin} attendu, obtenu ${top ? top.catalogScore : 'rien'}`);
    }
    if (a.memeCatalogScoreQue) {
      const autre = GMMatcher.rapprocher(a.memeCatalogScoreQue, { catalogue }).candidats[0];
      if (!top || !autre || top.catalogScore !== autre.catalogScore) {
        echecs.push(`catalogScore ${top ? top.catalogScore : '—'} ≠ ${autre ? autre.catalogScore : '—'} : la confiance IA a contaminé le score catalogue`);
      }
    }

    const detail = top
      ? `${top.brand} ${top.model} · cat ${top.catalogScore} · finale ${top.finalConfidence}` +
        (r.marge !== null ? ` · marge ${r.marge}` : ' · candidat unique')
      : r.raison;

    if (echecs.length) {
      ko++;
      console.log(`    ${C.r}✗${C.z} ${t.intitule}`);
      for (const e of echecs) console.log(`        ${C.r}${e}${C.z}`);
      console.log(`        ${C.g}${r.statut} — ${detail}${C.z}`);
    } else {
      ok++;
      console.log(`    ${C.v}✓${C.z} ${t.intitule}  ${C.g}${r.statut} — ${detail}${C.z}`);
    }
  }

  console.log(`\n${C.b}Résultat${C.z}\n  ${ok ? C.v : ''}${ok} test(s) passé(s)${C.z} · ${ko ? C.r : C.v}${ko} échec(s)${C.z}`);
  process.exit(ko ? 1 : 0);
}

lancer();
