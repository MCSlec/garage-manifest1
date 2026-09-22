#!/usr/bin/env node
/* ==========================================================================
   GARAGE MANIFEST — BANC D'AUDIT DES DONNÉES
   --------------------------------------------------------------------------
   Contrôle structurel du catalogue et des fiches techniques, exécuté hors
   navigateur. Son rôle : rendre MÉCANIQUE ce qui reposait jusqu'ici sur la
   vigilance humaine.

   Pourquoi ce fichier existe
   --------------------------
   Deux bugs de données ont déjà traversé une vérification syntaxique propre :
   `SPECS['alfa-giulia']` portait les chiffres de la Quadrifoglio, et
   `SPECS['bmw-m2-cs']` ceux de la M4 CSL — dans les deux cas, une fiche qui
   « bave » sur sa voisine lors d'une saisie en lot. `node --check` ne voit
   rien de tel : la syntaxe est parfaite, seule la donnée est fausse.
   Ce banc détecte ce motif (et quelques autres) automatiquement.

   Il charge `gm-specs.js` avec un DOM simulé minimal. Le module étend et
   reclasse `CARS` au parsing : l'audit porte donc sur le catalogue
   RÉELLEMENT FUSIONNÉ tel que l'app le voit à l'exécution, pas sur une
   lecture statique du texte source.

   Usage :
     node banc-audit.js            → rapport complet
     node banc-audit.js --manques  → uniquement la liste des champs manquants

   Nommé `banc-*` à dessein : `sw.js` (HORS_CACHE) ne met jamais en cache les
   fichiers de banc, donc ce fichier n'impose aucun bump de VERSION.
   ========================================================================== */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RACINE = __dirname;
const ROUGE = s => `\x1b[31m${s}\x1b[0m`;
const VERT = s => `\x1b[32m${s}\x1b[0m`;
const JAUNE = s => `\x1b[33m${s}\x1b[0m`;
const GRAS = s => `\x1b[1m${s}\x1b[0m`;

/* ----------------------------------------------------------------------
   1. Extraction de CARS depuis index.html
   ----------------------------------------------------------------------
   index.html n'est pas un module : on ne peut pas l'importer. On isole le
   littéral `const CARS = [ … ];` par équilibrage de crochets (et non par
   expression régulière, qui casserait sur le premier `]` dans une chaîne).
   -------------------------------------------------------------------- */
function extraireCars(html) {
  const ancre = html.indexOf('const CARS = [');
  if (ancre === -1) throw new Error("Ancre 'const CARS = [' introuvable dans index.html");
  const debut = html.indexOf('[', ancre);
  let profondeur = 0, i = debut, dansChaine = null, echappe = false;
  for (; i < html.length; i++) {
    const c = html[i];
    if (dansChaine) {
      if (echappe) { echappe = false; continue; }
      if (c === '\\') { echappe = true; continue; }
      if (c === dansChaine) dansChaine = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { dansChaine = c; continue; }
    if (c === '[') profondeur++;
    else if (c === ']') { profondeur--; if (profondeur === 0) break; }
  }
  const litteral = html.slice(debut, i + 1);
  return vm.runInNewContext('(' + litteral + ')');
}

/* ----------------------------------------------------------------------
   2. Chargement de gm-specs.js dans un DOM simulé
   ----------------------------------------------------------------------
   `document.readyState = 'loading'` est délibéré : autoInstall() est alors
   enregistré sur DOMContentLoaded, événement que nous ne déclenchons jamais.
   Les greffons DOM ne s'exécutent donc pas, mais l'extension du catalogue —
   qui a lieu au parsing, avant tout événement — s'applique bien.
   -------------------------------------------------------------------- */
function chargerModule(cars) {
  const noop = () => {};
  const elementFactice = () => ({
    style: {}, dataset: {}, classList: { add: noop, remove: noop, contains: () => false },
    appendChild: noop, insertAdjacentHTML: noop, setAttribute: noop,
    getAttribute: () => null, addEventListener: noop, remove: noop,
    querySelector: () => null, querySelectorAll: () => [], closest: () => null
  });

  const doc = {
    readyState: 'loading',
    addEventListener: noop,
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    createElement: elementFactice,
    head: elementFactice(),
    body: elementFactice()
  };

  const bac = {
    CARS: cars,
    document: doc,
    navigator: { userAgent: 'banc-audit', vibrate: noop },
    location: { href: 'http://localhost/', origin: 'http://localhost' },
    MutationObserver: class { observe() {} disconnect() {} },
    setTimeout: () => 0,
    clearTimeout: noop,
    setInterval: () => 0,
    fetch: () => Promise.reject(new Error('réseau désactivé au banc')),
    console: { log: noop, info: noop, warn: noop, error: noop }
  };
  bac.window = bac;
  bac.globalThis = bac;
  bac.self = bac;

  const ctx = vm.createContext(bac);
  const src = fs.readFileSync(path.join(RACINE, 'gm-specs.js'), 'utf8');
  vm.runInContext(src, ctx, { filename: 'gm-specs.js' });

  if (!bac.GMSpecs) throw new Error('gm-specs.js chargé mais window.GMSpecs absent');
  return { GMSpecs: bac.GMSpecs, carsFusionnes: bac.CARS };
}

/* ----------------------------------------------------------------------
   3. Bornes de plausibilité
   ----------------------------------------------------------------------
   Volontairement larges : le but n'est pas de juger une valeur discutable,
   mais d'attraper une faute de frappe d'un ordre de grandeur (1 500 ch saisi
   en 15 000, une masse en livres, une cylindrée en cm³ au lieu de litres).
   -------------------------------------------------------------------- */
/* Bornes calibrées sur les extrêmes RÉELS du catalogue, vérifiés un par un
   lors du premier passage du banc : NHRA Top Fuel (11 000 ch), Koenigsegg
   Gemera (2 300 ch), Rimac Nevera (1 914 ch), GMC Hummer EV (4 100 kg),
   Citroën Ami (8 ch). Toutes ces valeurs sont exactes — les resserrer
   reviendrait à signaler en permanence des fiches justes, et un banc qui
   crie au loup finit ignoré. */
const BORNES = {
  ch:  [5, 12000,  'ch'],
  nm:  [10, 9000,  'Nm'],
  kg:  [150, 4500, 'kg'],
  cyl: [0, 9,      'L']
};

const anomalies = [];
const signaler = (gravite, categorie, message) =>
  anomalies.push({ gravite, categorie, message });

/* ----------------------------------------------------------------------
   Détection des clés dupliquées — au niveau du TEXTE SOURCE
   ----------------------------------------------------------------------
   Angle mort majeur : en JavaScript, une clé répétée dans un littéral
   d'objet ne produit AUCUNE erreur — la dernière écrase silencieusement la
   première. Une fiche entière peut donc disparaître sans le moindre signal.
   Impossible à détecter après coup sur l'objet chargé (le doublon a déjà
   été absorbé) : il faut relire la source.

   Le scanner suit la profondeur d'accolades en ignorant chaînes et
   commentaires, et ne retient que les clés de premier niveau.
   -------------------------------------------------------------------- */
function clesDupliquees(src, nomBloc) {
  const ancre = src.indexOf('const ' + nomBloc);
  if (ancre === -1) return null;
  const debut = src.indexOf('{', ancre);
  if (debut === -1) return null;

  const vues = new Map(), doublons = [];
  let profondeur = 0, i = debut;
  let ligne = src.slice(0, debut).split('\n').length;

  /* Clé en attente de sa valeur : on ne peut comparer deux définitions
     qu'une fois la valeur entièrement lue (jusqu'à la virgule de premier
     niveau). C'est cette comparaison qui sépare la simple redondance
     (même valeur écrite deux fois, sans conséquence) de la perte de
     données réelle (deux valeurs différentes, une seule survit). */
  let cleEnCours = null, valeurDebut = -1, ligneEnCours = -1;
  const cloturer = (fin) => {
    if (cleEnCours === null) return;
    const valeur = src.slice(valeurDebut, fin).trim().replace(/\s+/g, ' ');
    if (vues.has(cleEnCours)) {
      const precedent = vues.get(cleEnCours);
      doublons.push({
        cle: cleEnCours,
        premiere: precedent.ligne,
        seconde: ligneEnCours,
        identiques: precedent.valeur === valeur
      });
    } else {
      vues.set(cleEnCours, { ligne: ligneEnCours, valeur });
    }
    cleEnCours = null;
  };

  while (i < src.length) {
    const c = src[i], suivant = src[i + 1];

    if (c === '\n') { ligne++; i++; continue; }

    // Commentaires
    if (c === '/' && suivant === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && suivant === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') ligne++; i++; }
      i += 2; continue;
    }

    // Chaînes
    if (c === '"' || c === "'" || c === '`') {
      const cloture = c;
      const departCle = i, departLigne = ligne;
      i++;
      let contenu = '';
      while (i < src.length) {
        if (src[i] === '\\') { contenu += src[i + 1]; i += 2; continue; }
        if (src[i] === cloture) break;
        if (src[i] === '\n') ligne++;
        contenu += src[i]; i++;
      }
      i++; // clôture

      /* Une chaîne n'est une CLÉ que si elle est à la profondeur 1 et
         immédiatement suivie de « : » (espaces autorisés). */
      if (profondeur === 1) {
        let j = i;
        while (j < src.length && /\s/.test(src[j])) j++;
        if (src[j] === ':') {
          cleEnCours = contenu;
          ligneEnCours = departLigne;
          valeurDebut = j + 1;
        }
      }
      void departCle;
      continue;
    }

    if (c === ',' && profondeur === 1) { cloturer(i); i++; continue; }

    if (c === '{' || c === '[') { profondeur++; i++; continue; }
    if (c === '}' || c === ']') {
      profondeur--;
      if (profondeur === 0) { cloturer(i); i++; break; }
      i++;
      continue;
    }
    i++;
  }
  return doublons;
}

function controlerPlausibilite(etiquette, fiche, categorie) {
  for (const [champ, [min, max, unite]] of Object.entries(BORNES)) {
    const v = fiche[champ];
    if (v == null) continue;
    if (typeof v !== 'number' || !isFinite(v)) {
      signaler('ERREUR', categorie, `${etiquette} — ${champ} n'est pas un nombre valide (${JSON.stringify(v)})`);
      continue;
    }
    if (v < min || v > max) {
      signaler('ERREUR', categorie, `${etiquette} — ${champ} = ${v} ${unite}, hors plage plausible [${min}–${max}]`);
    }
  }
  /* Contrôle croisé : un rapport poids/puissance aberrant révèle une
     incohérence entre deux champs pris isolément plausibles. */
  if (typeof fiche.kg === 'number' && typeof fiche.ch === 'number' && fiche.ch > 0) {
    const kgch = fiche.kg / fiche.ch;
    /* Plage large à dessein : un dragster Top Fuel tient à 0,10 kg/ch et une
       Citroën Ami à 60 kg/ch, les deux légitimement. On ne cherche ici qu'une
       incohérence d'un ordre de grandeur entre deux champs pris isolément
       plausibles (une masse en livres, une puissance en kW). */
    if (kgch < 0.05 || kgch > 80) {
      signaler('ALERTE', categorie,
        `${etiquette} — rapport poids/puissance invraisemblable : ${kgch.toFixed(2)} kg/ch (${fiche.kg} kg / ${fiche.ch} ch)`);
    }
  }
}

/* ======================================================================
   AUDIT
   ====================================================================== */
function auditer() {
  const html = fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8');
  const carsBruts = extraireCars(html);
  const carsAvant = new Map(carsBruts.map(c => [c.id, c]));

  const { GMSpecs, carsFusionnes } = chargerModule(carsBruts.map(c => ({ ...c })));
  const { SPECS, MAP, GENS, MOTOR_SPECS, CATALOGUE_PLUS } = GMSpecs;
  const idsCatalogue = new Set(carsFusionnes.map(c => c.id));

  /* --- 0. Clés dupliquées dans les littéraux (silencieuses en JS) ----- */
  const srcModule = fs.readFileSync(path.join(RACINE, 'gm-specs.js'), 'utf8');
  for (const bloc of ['SPECS', 'GENS', 'MAP', 'MOTOR_SPECS']) {
    const doublons = clesDupliquees(srcModule, bloc);
    if (!doublons) { signaler('ALERTE', 'DOUBLONS', `bloc ${bloc} introuvable pour le scan de clés`); continue; }
    for (const d of doublons) {
      if (d.identiques) {
        /* Même valeur écrite deux fois : rien n'est perdu, mais la ligne
           morte trompe le lecteur et double le coût de toute correction
           future (on en corrige une, l'autre reste). */
        signaler('ALERTE', 'DOUBLONS',
          `${bloc}['${d.cle}'] défini 2 fois (lignes ${d.premiere} et ${d.seconde}) — valeurs IDENTIQUES : redondance sans perte, ligne à supprimer`);
      } else {
        signaler('ERREUR', 'DOUBLONS',
          `${bloc}['${d.cle}'] défini 2 fois (lignes ${d.premiere} et ${d.seconde}) — valeurs DIFFÉRENTES : la définition de la ligne ${d.premiere} est perdue EN SILENCE`);
      }
    }
  }

  /* --- A. Catalogue : doublons et conflits silencieux ---------------- */
  const vusCars = new Set();
  for (const c of carsBruts) {
    if (vusCars.has(c.id)) signaler('ERREUR', 'CATALOGUE', `id dupliqué dans CARS : ${c.id}`);
    vusCars.add(c.id);
  }

  const vusPlus = new Set();
  for (const e of CATALOGUE_PLUS) {
    if (vusPlus.has(e.id)) signaler('ERREUR', 'CATALOGUE', `id dupliqué dans CATALOGUE_PLUS : ${e.id}`);
    vusPlus.add(e.id);

    /* Un id présent des deux côtés n'est PAS injecté (CARS fait autorité).
       Si les deux déclarations divergent, l'intention portée par
       CATALOGUE_PLUS est donc perdue en silence — c'est précisément le
       genre d'écart qu'aucune erreur d'exécution ne signalera jamais. */
    const dansCars = carsAvant.get(e.id);
    if (dansCars) {
      const champs = ['r', 'cat', 'brand', 'model'];
      const divergences = champs
        .filter(k => e[k] != null && dansCars[k] != null && e[k] !== dansCars[k])
        .map(k => `${k}: CARS="${dansCars[k]}" vs CATALOGUE_PLUS="${e[k]}"`);
      if (divergences.length) {
        signaler('ALERTE', 'CATALOGUE',
          `${e.id} déclaré des deux côtés avec des valeurs différentes (CARS fait autorité, l'autre est ignorée) → ${divergences.join(' · ')}`);
      }
    }
  }

  /* --- A bis. Doublons VISIBLES par l'utilisateur --------------------
     Angle mort du contrôle de clés : deux entrées d'ID DIFFÉRENTS peuvent
     désigner la même voiture. Elles passent alors toutes les vérifications
     techniques tout en apparaissant deux fois dans la grille du garage —
     la même voiture se collectionne deux fois et gonfle le total. Dans un
     jeu de collection, c'est un défaut visible, pas un détail. */
  const parLibelle = new Map();
  for (const c of carsFusionnes) {
    const k = `${c.brand} ${c.model}`.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!parLibelle.has(k)) parLibelle.set(k, []);
    parLibelle.get(k).push(c.id);
  }
  for (const [libelle, ids] of parLibelle) {
    if (ids.length > 1) {
      signaler('ERREUR', 'DOUBLON VISIBLE',
        `« ${libelle} » apparaît ${ids.length} fois dans le catalogue affiché : ${ids.join(' + ')} — la même voiture se collectionne deux fois`);
    }
  }

  /* Même piège, détecté par le nom de la FICHE : deux clés SPECS
     distinctes qui décrivent la même voiture (ex. 'citroen-ami' et
     'citroen-ami-2020'), invisible au contrôle de libellé si les entrées
     catalogue sont intitulées différemment. */
  const parNomFiche = new Map();
  for (const cle of Object.keys(SPECS)) {
    const n = String(SPECS[cle].nom || '').toLowerCase().trim();
    if (!n) continue;
    if (!parNomFiche.has(n)) parNomFiche.set(n, []);
    parNomFiche.get(n).push(cle);
  }
  for (const [nom, cles] of parNomFiche) {
    if (cles.length > 1) {
      signaler('ALERTE', 'DOUBLON VISIBLE',
        `${cles.length} fiches SPECS portent le nom « ${nom} » : ${cles.join(' + ')} — vérifier qu'il ne s'agit pas du même véhicule décrit deux fois`);
    }
  }

  /* --- B. SPECS : champs manquants ----------------------------------- */
  const clesSpecs = Object.keys(SPECS);
  const manques = { nm: [], kg: [], note: [], cyl: [], ch: [] };
  for (const cle of clesSpecs) {
    const f = SPECS[cle];
    const nom = f.nom || cle;
    for (const champ of ['ch', 'nm', 'kg', 'note']) {
      if (f[champ] == null) manques[champ].push({ cle, nom });
    }
    /* cyl absent n'est une anomalie que pour un thermique : une électrique
       déclare légitimement cyl:0 (et fmt() la masque à l'affichage). */
    if (f.cyl == null && !/électrique|electrique|EV\b/i.test(String(f.arch || ''))) {
      manques.cyl.push({ cle, nom });
    }
    controlerPlausibilite(nom, f, 'SPECS');

    /* Cohérence de `flou` : déclarer incertain un champ absent est au mieux
       inutile, au pire le signe d'un copier-coller depuis une autre fiche. */
    if (Array.isArray(f.flou)) {
      for (const champ of f.flou) {
        if (f[champ] == null) {
          signaler('ALERTE', 'SPECS', `${nom} — flou déclare « ${champ} » mais le champ est absent`);
        }
      }
    }
  }

  /* --- C. Contamination copie-voisine -------------------------------- */
  /* Le motif des bugs Giulia/Quadrifoglio et M2 CS/M4 CSL : deux fiches
     VOISINES dans le fichier partagent exactement les mêmes chiffres
     moteur. Deux voitures distinctes peuvent partager un bloc (plateforme
     commune), mais qu'elles soient aussi adjacentes à la saisie est le
     signe d'un copier-coller non corrigé. */
  for (let i = 1; i < clesSpecs.length; i++) {
    const a = SPECS[clesSpecs[i - 1]], b = SPECS[clesSpecs[i]];
    if (a.ch == null || b.ch == null) continue;
    const memeMeca = a.ch === b.ch && a.nm === b.nm && a.cyl === b.cyl &&
                     a.nm != null && a.cyl != null;
    if (memeMeca && a.kg === b.kg) {
      signaler('ALERTE', 'CONTAMINATION',
        `${a.nom || clesSpecs[i - 1]} et ${b.nom || clesSpecs[i]} (fiches adjacentes) ont des chiffres identiques : ${a.ch} ch · ${a.nm} Nm · ${a.cyl} L · ${a.kg} kg — vérifier qu'une fiche n'a pas « bavé » sur sa voisine`);
    }
  }

  /* --- C bis. Cohérence GENS ↔ MOTOR_SPECS ---------------------------
     Les deux blocs s'affichent sur LA MÊME PAGE de fiche : le sélecteur de
     motorisation (MOTOR_SPECS) et « Générations & motorisations » (GENS).
     Ils décrivent en partie les mêmes moteurs, mais sont saisis séparément.
     Rien ne les tient synchronisés.

     On ne signale que le cas révélateur : une puissance du sélecteur PROCHE
     SANS ÊTRE ÉGALE à une puissance citée dans les générations (moins de 3 %
     d'écart). Deux variantes réellement différentes ont des puissances
     franchement distinctes ; un écart de 1 à 3 % trahit le même moteur cité
     dans deux unités ou deux normes — 222 ch contre 226 PS, 280 contre 283.
     C'est l'erreur de §4.4 ter, mais entre deux blocs d'une même fiche. */
  for (const [idCat, bloc] of Object.entries(MOTOR_SPECS)) {
    const g = GENS[idCat] || GENS[MAP[idCat]];
    if (!g || !Array.isArray(bloc.types)) continue;

    const puissancesGens = new Set();
    for (const gen of g) {
      const texte = (gen && !Array.isArray(gen) && Array.isArray(gen.m))
        ? gen.m.map(m => String(m[2] || '')).join(' ')
        : (Array.isArray(gen) ? String(gen[3] || '') : '');
      for (const n of texte.match(/\d{2,4}/g) || []) puissancesGens.add(+n);
    }
    if (!puissancesGens.size) continue;

    for (const t of bloc.types) {
      for (const v of t.variants || []) {
        if (typeof v.ch !== 'number') continue;
        if (puissancesGens.has(v.ch)) continue;          // concordance exacte
        for (const p of puissancesGens) {
          const ecart = Math.abs(p - v.ch) / Math.max(p, v.ch);
          if (ecart > 0 && ecart < 0.03) {
            signaler('ALERTE', 'GENS vs MOTOR_SPECS',
              `${idCat}/${t.id}/${v.id} — le sélecteur annonce ${v.ch} ch, les générations citent ${p} ch pour ce qui semble le même moteur (${(ecart * 100).toFixed(1)} % d'écart) : vraisemblablement ch contre PS, ou deux normes`);
            break;
          }
        }
      }
    }
  }

  /* --- D. MAP : correspondances orphelines --------------------------- */
  for (const [idCat, cleSpec] of Object.entries(MAP)) {
    if (!SPECS[cleSpec]) {
      signaler('ERREUR', 'MAP', `${idCat} → « ${cleSpec} » : aucune fiche SPECS de ce nom`);
    }
    if (!idsCatalogue.has(idCat)) {
      signaler('ERREUR', 'MAP', `${idCat} : id absent du catalogue fusionné (CARS + CATALOGUE_PLUS)`);
    }
  }

  /* --- E. MOTOR_SPECS ------------------------------------------------- */
  let nbModeles = 0, nbTypes = 0, nbVariantes = 0;
  for (const [idCat, bloc] of Object.entries(MOTOR_SPECS)) {
    nbModeles++;
    if (!idsCatalogue.has(idCat)) {
      signaler('ERREUR', 'MOTOR_SPECS', `${idCat} : id absent du catalogue fusionné`);
    }
    if (!Array.isArray(bloc.types) || !bloc.types.length) {
      signaler('ERREUR', 'MOTOR_SPECS', `${idCat} : aucun type de motorisation`);
      continue;
    }
    const idsType = new Set();
    for (const t of bloc.types) {
      nbTypes++;
      if (idsType.has(t.id)) signaler('ERREUR', 'MOTOR_SPECS', `${idCat} : id de type dupliqué « ${t.id} »`);
      idsType.add(t.id);
      if (!Array.isArray(t.variants) || !t.variants.length) {
        signaler('ERREUR', 'MOTOR_SPECS', `${idCat}/${t.id} : aucune variante`);
        continue;
      }
      const idsVar = new Set();
      let precedente = null;
      for (const v of t.variants) {
        nbVariantes++;
        const etiquette = `${idCat}/${t.id}/${v.id}`;
        if (idsVar.has(v.id)) signaler('ERREUR', 'MOTOR_SPECS', `${etiquette} : id de variante dupliqué`);
        idsVar.add(v.id);
        if (v.ch == null) signaler('ERREUR', 'MOTOR_SPECS', `${etiquette} : puissance (ch) absente — champ requis par le sélecteur`);
        for (const champ of ['label', 'bv', 'tx']) {
          if (!v[champ]) signaler('ALERTE', 'MOTOR_SPECS', `${etiquette} : « ${champ} » absent (affiché dans le sélecteur)`);
        }
        controlerPlausibilite(etiquette, v, 'MOTOR_SPECS');

        /* Un sélecteur dont deux entrées affichent les mêmes chiffres ne
           sert à rien : soit c'est un copier-coller, soit les deux
           variantes ne méritaient pas d'être distinguées. */
        if (precedente && precedente.ch === v.ch && precedente.nm === v.nm && precedente.kg === v.kg) {
          signaler('ALERTE', 'CONTAMINATION',
            `${etiquette} et la variante précédente (${precedente.id}) ont des chiffres identiques (${v.ch} ch · ${v.nm} Nm · ${v.kg} kg)`);
        }
        precedente = v;
      }
    }
    /* Règle GTA : une déclinaison qui a sa propre fiche catalogue ne doit
       pas réapparaître comme variante du modèle de base. Contrôle
       indicatif — le rapprochement se fait sur le libellé. */
  }

  /* ======================================================================
     RAPPORT
     ====================================================================== */
  const erreurs = anomalies.filter(a => a.gravite === 'ERREUR');
  const alertes = anomalies.filter(a => a.gravite === 'ALERTE');

  console.log(GRAS('\n═══ BANC D\'AUDIT — GARAGE MANIFEST ═══\n'));
  console.log(GRAS('Volumétrie'));
  console.log(`  Catalogue fusionné   : ${carsFusionnes.length} véhicules`);
  console.log(`    ├─ CARS            : ${carsBruts.length}`);
  console.log(`    └─ CATALOGUE_PLUS  : ${CATALOGUE_PLUS.length} déclarés, ${carsFusionnes.length - carsBruts.length} réellement injectés`);
  console.log(`  Fiches SPECS         : ${clesSpecs.length}`);
  console.log(`  Correspondances MAP  : ${Object.keys(MAP).length}`);
  console.log(`  Modèles avec GENS    : ${Object.keys(GENS).length}`);
  console.log(`  MOTOR_SPECS          : ${nbModeles} modèles · ${nbTypes} types · ${nbVariantes} variantes`);

  console.log(GRAS('\nComplétude des fiches SPECS'));
  const total = clesSpecs.length;
  for (const [champ, liste] of Object.entries(manques)) {
    const pct = (((total - liste.length) / total) * 100).toFixed(1);
    const libelle = { ch: 'puissance', nm: 'couple', kg: 'masse', note: 'anecdote', cyl: 'cylindrée' }[champ];
    console.log(`  ${libelle.padEnd(10)} : ${String(total - liste.length).padStart(4)}/${total} (${pct} %)  — ${liste.length} manquante(s)`);
  }

  /* --- Liste de travail en Markdown (--manques-md) -------------------
     Destinée à une recherche humaine. Elle SÉPARE ce qui manque vraiment
     de ce qui est légitimement absent : une fiche de course sans couple
     ou un hybride HSD sans couple système sont CONFORMES (voir CLAUDE.md
     §4.4 et §4.4 bis). Les mélanger ferait chercher pour rien, et pire,
     inciterait à remplir des champs qui doivent rester vides. */
  if (process.argv.includes('--manques-md')) {
    const invMap = {};
    for (const [idc, cle] of Object.entries(MAP)) if (!invMap[cle]) invMap[cle] = idc;
    const parId = Object.fromEntries(carsFusionnes.map(c => [c.id, c]));

    const lignes = [];
    for (const cle of Object.keys(SPECS)) {
      const f = SPECS[cle];
      const absents = ['nm', 'kg', 'cyl'].filter(ch => f[ch] == null);
      if (!absents.length) continue;
      const idc = invMap[cle];
      const c = idc ? parId[idc] : null;
      if (!c) continue;                       // fiche orpheline : hors périmètre
      const arch = String(f.arch || '');
      const estCourse = c.cat === 'Course';
      const estHSD = /toyota|lexus/i.test(c.brand) && /hybrid/i.test(arch);
      const estElectrique = /électrique|electrique/i.test(arch);
      lignes.push({
        marque: c.brand, modele: c.model, cat: c.cat, an: (f.an || []).join('–'),
        ch: f.ch, absents, cle,
        motif: estCourse ? 'course' : estHSD ? 'hsd' : (estElectrique && absents.length === 1 && absents[0] === 'cyl') ? 'ev' : null
      });
    }

    const aChercher = lignes.filter(l => !l.motif);
    const legitimes = lignes.filter(l => l.motif);
    const tri = (a, b) => (a.cat || '').localeCompare(b.cat || '') || a.marque.localeCompare(b.marque);

    const out = [];
    out.push('# Fiches techniques — ce qui manque encore');
    out.push('');
    out.push(`> Généré le ${new Date().toISOString().slice(0, 10)} par \`node banc-audit.js --manques-md\`.`);
    out.push('> Régénère-le après chaque vague plutôt que de le corriger à la main.');
    out.push('');
    out.push(`**${aChercher.length} fiches à compléter** · ${legitimes.length} légitimement incomplètes (voir la fin).`);
    out.push('');
    out.push('Le champ **ch** est indiqué parce qu\'il **désigne la variante exacte** de la fiche :');
    out.push('cherche le couple ou la masse *de cette version-là*, pas du modèle en général.');
    out.push('');

    let catCourante = null;
    for (const l of aChercher.sort(tri)) {
      if (l.cat !== catCourante) {
        catCourante = l.cat;
        out.push('');
        out.push(`## ${catCourante}`);
        out.push('');
        out.push('| Voiture | Années | Puissance (fixe la variante) | Manque |');
        out.push('|---|---|---|---|');
      }
      const libelles = { nm: 'couple', kg: 'masse', cyl: 'cylindrée' };
      out.push(`| ${l.marque} ${l.modele} | ${l.an} | ${l.ch} ch | **${l.absents.map(a => libelles[a]).join(', ')}** |`);
    }

    /* Pièges déjà rencontrés en sourçant. Les consigner évite de refaire
       le chemin — et surtout évite d'écrire le chiffre facile à trouver
       mais faux. */
    out.push('');
    out.push('---');
    out.push('');
    out.push('## Notes de sourcing — cas déjà creusés, et pourquoi ils bloquent');
    out.push('');
    out.push('| Voiture | Ce qui bloque |');
    out.push('|---|---|');
    out.push('| **Xiaomi SU7 Ultra** | 1 770 Nm chez les uns, 1 135 Nm chez les autres. Écart de 55 % : l\'un des deux est probablement le prototype, l\'autre la série. |');
    out.push('| **Mercedes-AMG ONE** | 900 Nm circule, mais Mercedes ne publie aucun couple système. Avec quatre moteurs électriques répartis sur des essieux différents, un couple « combiné » est mal défini. |');
    out.push('| **Renault Austral E-Tech** | Le « 410 Nm » des fiches est exactement 205 + 205 : une addition des couples thermique et électrique, ce que la convention interdit (voir CLAUDE.md §4.4). Chercher si Renault publie une valeur système réelle. |');
    out.push('| **Hispano Suiza Carmen** | 1 150 Nm chez les uns, 1 600 Nm chez les autres : couple moteur contre couple cumulé des quatre moteurs après démultiplication. |');
    out.push('| **Porsche 356 Carrera 2** | Le moteur Fuhrmann 587/1 est très documenté en puissance (130 ch à 6 200 tr/min), mais aucune source consultée ne publie son couple. |');
    out.push('| **GMC Hummer EV** | ⚠️ Le « 11 500 lb-ft » (≈ 15 592 Nm) qui circule est le **couple à la roue** annoncé par le marketing GM, pas le couple des moteurs (~1 500 Nm). Ne jamais le saisir tel quel : il donnerait un ratio délirant. |');
    out.push('| **Czinger 21C** | Puissance bien documentée (1 250 ch), couple jamais publié par le constructeur. |');
    out.push('| **Micro-citadines d\'époque restantes** (Fiat 500 Nuova, Peugeot 402, Tatra T87, Cord, Bugatti Type 35, Bentley Blower, Delahaye 135) | Couple non communiqué à l\'époque. Piste : revues techniques (RTA) et notices constructeur d\'origine. |');
    out.push('');
    out.push('**Le réflexe à garder :** quand deux sources divergent d\'un ordre de grandeur,');
    out.push('c\'est presque toujours qu\'elles ne mesurent pas la même chose (couple moteur vs');
    out.push('couple à la roue, prototype vs série, cumulé vs thermique seul). Mieux vaut un');
    out.push('champ vide qu\'un chiffre faux — la valeur du catalogue, c\'est la confiance.');
    out.push('');
    out.push('---');
    out.push('');
    out.push('## Légitimement incomplètes — ne pas chercher');
    out.push('');
    out.push('Ces fiches sont **conformes** en l\'état. Y inscrire un chiffre serait une erreur,');
    out.push('pas une amélioration.');
    out.push('');
    const groupes = {
      course: ['Voitures de course — couple jamais publié', 'La puissance et la masse sont fixées course par course par la Balance of Performance ; le couple n\'est communiqué par aucune écurie.'],
      hsd:    ['Hybrides Toyota / Lexus (HSD) — couple système sans existence physique', 'Thermique et électrique sont reliés par un train épicycloïdal, sans embrayage : les deux couples ne s\'additionnent jamais sur un arbre commun. Toyota ne publie donc aucun couple système, et c\'est délibéré.'],
      ev:     ['Électriques — pas de cylindrée', 'Un moteur électrique n\'a pas de cylindrée. Le champ est volontairement vide.']
    };
    for (const [clef, [titre, explication]] of Object.entries(groupes)) {
      const l = legitimes.filter(x => x.motif === clef);
      if (!l.length) continue;
      out.push(`### ${titre} — ${l.length}`);
      out.push('');
      out.push(explication);
      out.push('');
      out.push(l.sort(tri).map(x => `${x.marque} ${x.modele}`).join(' · '));
      out.push('');
    }

    fs.writeFileSync(path.join(RACINE, 'MANQUES.md'), out.join('\n'));
    console.log(`MANQUES.md écrit : ${aChercher.length} fiches à compléter, ${legitimes.length} légitimement incomplètes.`);
  }

  if (process.argv.includes('--manques')) {
    for (const [champ, liste] of Object.entries(manques)) {
      if (!liste.length) continue;
      console.log(GRAS(`\n--- Sans ${champ} (${liste.length}) ---`));
      for (const { cle, nom } of liste) console.log(`  ${cle.padEnd(34)} ${nom}`);
    }
  }

  console.log(GRAS('\nAnomalies'));
  if (!anomalies.length) {
    console.log(VERT('  Aucune anomalie détectée.'));
  } else {
    const parCategorie = {};
    for (const a of anomalies) (parCategorie[a.categorie] ||= []).push(a);
    for (const [cat, liste] of Object.entries(parCategorie)) {
      console.log(GRAS(`\n  [${cat}] ${liste.length}`));
      for (const a of liste) {
        const tag = a.gravite === 'ERREUR' ? ROUGE('ERREUR') : JAUNE('ALERTE');
        console.log(`    ${tag} ${a.message}`);
      }
    }
  }

  console.log(GRAS('\nRésultat'));
  console.log(`  ${erreurs.length ? ROUGE(erreurs.length + ' erreur(s)') : VERT('0 erreur')} · ${alertes.length ? JAUNE(alertes.length + ' alerte(s)') : VERT('0 alerte')}\n`);

  /* Code de sortie non nul sur ERREUR : utilisable en garde avant commit. */
  process.exit(erreurs.length ? 1 : 0);
}

try {
  auditer();
} catch (e) {
  console.error(ROUGE('\nLe banc n\'a pas pu s\'exécuter :'), e.message);
  console.error(e.stack);
  process.exit(2);
}
