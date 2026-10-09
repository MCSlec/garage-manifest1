/* ======================================================================
   gm-matcher.js — rapprochement « identification IA » → « entrée catalogue »
   ----------------------------------------------------------------------
   POURQUOI CE MODULE EXISTE

   `matchCatalog()` vivait dans index.html et confondait trois grandeurs
   dans un seul nombre :

     · ce que l'IA croit avoir vu           (aiConfidence)
     · à quel point ce texte ressemble à
       une entrée du catalogue              (catalogScore)
     · la confiance qu'on affiche à
       l'utilisateur                        (finalConfidence)

   Les mélanger empêche de répondre à la seule question qui compte au
   moment de la capture : « est-ce que je propose cette voiture, ou est-ce
   que je demande à l'utilisateur de choisir ? » Une IA très sûre d'un
   modèle absent du catalogue produisait le même score qu'une IA hésitante
   sur un modèle parfaitement reconnu — deux situations qui appellent des
   réponses opposées.

   Le module sépare donc les trois, et y ajoute la grandeur qui manquait :
   la MARGE entre le premier et le deuxième candidat. C'est elle, et non la
   confiance absolue, qui dit si le choix est tranché. Deux candidats à 0,70
   et 0,69 sont un cas AMBIGU même si les deux scores sont élevés.

   PRINCIPE CARDINAL : on ne force jamais une correspondance.
   Le statut AUCUNE_CORRESPONDANCE_SURE est un résultat normal, pas un
   échec — une voiture hors catalogue DOIT le produire. Un matcher qui
   renvoie toujours quelque chose transforme chaque voiture inconnue en
   faux positif silencieux, et l'utilisateur collectionne une voiture qu'il
   n'a pas vue.

   AUCUNE DÉPENDANCE, AUCUN ÉTAT GLOBAL
   Le catalogue est INJECTÉ en paramètre, jamais lu depuis une variable
   globale. C'est ce qui rend le module testable hors navigateur
   (`node banc-matcher.js`) et indépendant de l'ordre de chargement.
   ====================================================================== */
(function (global) {
  'use strict';

  const VERSION_MATCHER = '1.0.0';

  /* --------------------------------------------------------------------
     SEUILS — réglables, mais chacun a une raison d'être
     --------------------------------------------------------------------
     Tout changement ici doit être passé au banc (`node banc-matcher.js`) :
     resserrer améliore toujours un cas et en casse silencieusement un autre. */
  const SEUILS = {
    /* En deçà, la ressemblance textuelle est du bruit. Valeur reprise du
       seuil historique de matchCatalog() pour ne pas changer la sensibilité
       du jour au lendemain. */
    retenu: 0.32,
    /* Confiance finale minimale pour oser proposer une voiture d'office. */
    sur: 0.55,
    /* En dessous de cette marge, le premier candidat ne se distingue pas
       assez du deuxième : on montre les deux plutôt que de trancher à la
       place de l'utilisateur. */
    marge: 0.08,
    /* Nombre de candidats renvoyés au maximum. */
    limite: 3
  };

  /* --------------------------------------------------------------------
     ALIAS DE MARQUE
     --------------------------------------------------------------------
     L'IA rend du texte libre : elle écrit « VW », « Mercedes », « Chevy »
     là où le catalogue dit « Volkswagen », « Mercedes-Benz », « Chevrolet ».
     Sans normalisation, la similarité de marque s'effondre et entraîne tout
     le score avec elle.

     Liste volontairement COURTE et vérifiable : on ne met ici que des
     équivalences qu'un humain confirmerait sans hésiter. Un alias douteux
     fabrique des faux positifs, ce que ce module existe justement pour
     éviter. */
  const ALIAS_MARQUE = {
    'vw': 'volkswagen',
    'merc': 'mercedes benz',
    'mercedes': 'mercedes benz',
    'mercedes amg': 'mercedes benz',
    'amg': 'mercedes benz',
    'chevy': 'chevrolet',
    'bimmer': 'bmw',
    'beemer': 'bmw',
    'alfa': 'alfa romeo',
    'landrover': 'land rover',
    'range rover': 'land rover',
    'rolls royce': 'rolls royce',
    'vauxhall': 'opel',
    'lambo': 'lamborghini',
    'porshe': 'porsche',
    'porsch': 'porsche',
    'citroen': 'citroen',
    'ds automobiles': 'ds',
    'gm': 'general motors',
    'seat cupra': 'cupra',
    'mini cooper': 'mini'
  };

  /* --------------------------------------------------------------------
     OUTILS TEXTE
     -------------------------------------------------------------------- */

  /* Identique à normalizeText() d'index.html : accents retirés, minuscules,
     tout ce qui n'est pas alphanumérique devient une espace. Dupliqué ici
     À DESSEIN — le module doit rester autonome et testable sans index.html.
     Si l'un des deux change, le banc le verra. */
  function normaliser(s) {
    return (s == null ? '' : String(s))
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function bigrammes(s) {
    const out = [];
    for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
    return out;
  }

  /* Coefficient de Dice sur bigrammes : tolérant aux fautes de frappe et aux
     variations de format (« 911 GT3 » / « 911GT3 »), ce qu'une égalité
     stricte ne serait pas. */
  function dice(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1;
    const ba = bigrammes(a), bb = bigrammes(b);
    if (!ba.length || !bb.length) return 0;
    const compte = new Map();
    for (const g of ba) compte.set(g, (compte.get(g) || 0) + 1);
    let communs = 0;
    for (const g of bb) { const n = compte.get(g); if (n > 0) { communs++; compte.set(g, n - 1); } }
    return (2 * communs) / (ba.length + bb.length);
  }

  /* Recouvrement au niveau des MOTS, mesuré DANS LES DEUX SENS.

     Dice seul ne suffit pas sur les noms automobiles, parce qu'il compare
     des suites de deux caractères : « 911 GT3 » et « 911 GT3 RS » se
     ressemblent énormément en bigrammes alors que ce sont deux voitures
     distinctes avec des raretés différentes.

     Mais un rappel mesuré dans un seul sens ne suffit pas non plus, et
     c'est l'erreur du premier jet — le banc l'a montrée sur deux cas
     opposés :

       · « 911 Carrera » se retrouve INTÉGRALEMENT dans « 911 Carrera S ».
         Mesurer seulement « quelle part de la requête est dans la cible »
         donne 1,0 aux deux, et les deux voitures deviennent
         indiscernables (marge 0,047 au banc).

       · « Giulia 2.2 JTDm 190 » contient l'entrée « Giulia » plus trois
         mots de motorisation. Mesurer seulement dans ce sens-là donne
         0,25, et la Giulia — pourtant la bonne réponse — tombe sous le
         seuil. Une IA bavarde était punie d'être précise.

     Les deux directions répondent donc à deux questions différentes :
       couverture  : quelle part du LIBELLÉ CATALOGUE est retrouvée dans la
                     devinette. Élevée quand la devinette contient bien
                     cette voiture-là.
       specificite : quelle part de la DEVINETTE est expliquée par le
                     libellé. Basse quand la devinette dit des choses que
                     l'entrée ne couvre pas.

     La couverture pèse plus lourd : le libellé catalogue est la forme
     canonique courte, la devinette est du texte libre qui déborde. */
  function recouvrementMots(requete, cible) {
    const mr = requete.split(' ').filter(Boolean);
    const mc = cible.split(' ').filter(Boolean);
    if (!mr.length || !mc.length) return 0;
    const ensR = new Set(mr), ensC = new Set(mc);
    let dansCible = 0;
    for (const m of ensR) if (ensC.has(m)) dansCible++;
    const couverture  = [...ensC].filter(m => ensR.has(m)).length / ensC.size;
    const specificite = dansCible / ensR.size;
    return 0.65 * couverture + 0.35 * specificite;
  }

  function marqueNormalisee(brut) {
    const n = normaliser(brut);
    return ALIAS_MARQUE[n] || n;
  }

  /* --------------------------------------------------------------------
     SCORE CATALOGUE — ressemblance PURE, sans la confiance de l'IA
     --------------------------------------------------------------------
     C'est la séparation demandée : ce nombre ne dit QUE « ce texte
     ressemble-t-il à cette entrée du catalogue ». Il reste valable même si
     la devinette vient d'ailleurs que de l'IA (saisie manuelle, import).

     La marque MODULE le score au lieu de s'y ajouter. Un bonus additif
     (l'ancienne mécanique) permettait à une bonne marque de rattraper un
     modèle qui ne correspondait pas ; une modulation garde la marque
     décisive sans jamais lui laisser inventer une correspondance. */
  function scoreCatalogue(marque, modele, entree) {
    const qMarque = marqueNormalisee(marque);
    const qModele = normaliser(modele);
    const eMarque = marqueNormalisee(entree.brand);
    const eModele = normaliser(entree.model);

    if (!qModele && !qMarque) return 0;

    /* Sans modèle deviné, on ne peut pas trancher entre les dizaines
       d'entrées d'une même marque : on plafonne bas plutôt que de désigner
       arbitrairement l'une d'elles. */
    if (!qModele) return dice(qMarque, eMarque) * 0.30;

    /* Dice pèse moins que le recouvrement par mots : il est biaisé par la
       longueur des chaînes, ce qui rapproche artificiellement une entrée
       courte d'une devinette longue. Il reste utile pour absorber les
       fautes de frappe, pas pour décider. */
    const base = 0.30 * dice(qModele, eModele) + 0.70 * recouvrementMots(qModele, eModele);
    if (!qMarque) return base * 0.85;   // marque inconnue : légère décote, pas une exclusion

    const simMarque = qMarque === eMarque ? 1 : dice(qMarque, eMarque);
    return base * (0.55 + 0.45 * simMarque);
  }

  /* --------------------------------------------------------------------
     CONFIANCE FINALE
     --------------------------------------------------------------------
     Combinaison explicite des deux grandeurs : l'IA module, elle ne décide
     pas. Une IA à 100 % sur un modèle absent du catalogue reste plafonnée
     par son score catalogue.

     Le plancher était de 0,55 dans la mécanique historique, ce qui rendait
     la confiance de l'IA presque inopérante : au banc, une IA sûre à 5 %
     sur une Giulia parfaitement reconnue sortait encore à 0,573 et passait
     en CONFIRME. Autrement dit le doute de l'IA n'était pas transmis.
     Le plancher descend à 0,35 pour que l'intervalle utile de l'IA compte
     réellement — c'est un changement VOLONTAIRE de calibration, pas un
     réglage cosmétique : les pourcentages affichés baissent sur les
     identifications peu sûres, ce qui est précisément le but. */
  function confianceFinale(scoreCat, aiConfidence) {
    const ai = Math.max(0, Math.min(1, typeof aiConfidence === 'number' ? aiConfidence : 0.6));
    return Math.round(scoreCat * (0.35 + 0.65 * ai) * 1000) / 1000;
  }

  /* --------------------------------------------------------------------
     API PRINCIPALE
     --------------------------------------------------------------------
     devinettes : [{ brand, model, confidence }]  — sortie brute du relais IA
     options    : { catalogue, limite, seuils }

     Retour :
     {
       statut     : 'CONFIRME' | 'AMBIGU' | 'AUCUNE_CORRESPONDANCE_SURE',
       candidats  : [{ id, brand, model, aiConfidence, catalogScore,
                       finalConfidence, source }],
       marge      : number|null,   // écart entre le 1er et le 2e
       raison     : string         // pourquoi ce statut, en clair
     }

     Les candidats sont TOUJOURS renvoyés quand il y en a, même en statut
     AUCUNE_CORRESPONDANCE_SURE : l'interface peut ainsi proposer des pistes
     à l'utilisateur sans que l'application, elle, ait rien décidé. */
  function rapprocher(devinettes, options) {
    const opt = options || {};
    const seuils = Object.assign({}, SEUILS, opt.seuils || {});
    const limite = opt.limite || seuils.limite;
    const catalogue = Array.isArray(opt.catalogue) ? opt.catalogue : [];

    if (!Array.isArray(devinettes) || !devinettes.length) {
      return { statut: 'AUCUNE_CORRESPONDANCE_SURE', candidats: [], marge: null,
               raison: "aucune identification fournie par l'IA" };
    }
    if (!catalogue.length) {
      return { statut: 'AUCUNE_CORRESPONDANCE_SURE', candidats: [], marge: null,
               raison: 'catalogue vide' };
    }

    /* Une même voiture peut être atteinte par plusieurs devinettes
       (« Alfa Giulia » et « Alfa Romeo Giulia Quadrifoglio »). On garde la
       MEILLEURE confiance finale par id, jamais la somme : additionner
       récompenserait une IA bavarde plutôt qu'une IA juste. */
    const parId = new Map();

    for (const d of devinettes) {
      if (!d || (!d.brand && !d.model)) continue;
      for (const entree of catalogue) {
        if (!entree || !entree.id) continue;
        const scoreCat = scoreCatalogue(d.brand, d.model, entree);
        if (scoreCat < seuils.retenu) continue;
        const finale = confianceFinale(scoreCat, d.confidence);
        const actuel = parId.get(entree.id);
        if (actuel && actuel.finalConfidence >= finale) continue;
        parId.set(entree.id, {
          id: entree.id,
          brand: entree.brand,
          model: entree.model,
          aiConfidence: typeof d.confidence === 'number' ? d.confidence : null,
          catalogScore: Math.round(scoreCat * 1000) / 1000,
          finalConfidence: finale,
          source: { brand: d.brand || null, model: d.model || null }
        });
      }
    }

    const candidats = [...parId.values()]
      .sort((a, b) => b.finalConfidence - a.finalConfidence)
      .slice(0, limite);

    if (!candidats.length) {
      return { statut: 'AUCUNE_CORRESPONDANCE_SURE', candidats: [], marge: null,
               raison: `aucune entrée du catalogue ne dépasse le seuil de ressemblance (${seuils.retenu})` };
    }

    const marge = candidats.length > 1
      ? Math.round((candidats[0].finalConfidence - candidats[1].finalConfidence) * 1000) / 1000
      : null;

    if (candidats[0].finalConfidence < seuils.sur) {
      return { statut: 'AUCUNE_CORRESPONDANCE_SURE', candidats, marge,
               raison: `meilleure confiance ${candidats[0].finalConfidence} sous le seuil de sûreté ${seuils.sur}` };
    }
    if (marge !== null && marge < seuils.marge) {
      return { statut: 'AMBIGU', candidats, marge,
               raison: `marge ${marge} entre « ${candidats[0].model} » et « ${candidats[1].model} » sous le seuil ${seuils.marge}` };
    }
    return { statut: 'CONFIRME', candidats, marge,
             raison: marge === null
               ? `candidat unique à ${candidats[0].finalConfidence}`
               : `confiance ${candidats[0].finalConfidence}, marge ${marge} sur le suivant` };
  }

  /* --------------------------------------------------------------------
     EXPOSITION — une seule fuite globale, comme gm-specs.js
     --------------------------------------------------------------------
     Même patron que window.GMSpecs (CLAUDE.md §2.1) : tout est privé à la
     clôture, seul le contrat est publié. Les fonctions internes sont
     exposées parce que le banc en a besoin et qu'elles sont pures — pas
     parce que l'application doit s'en servir. */
  const API = {
    VERSION_MATCHER,
    rapprocher,
    scoreCatalogue,
    confianceFinale,
    normaliser,
    marqueNormalisee,
    SEUILS,
    ALIAS_MARQUE,
    STATUTS: ['CONFIRME', 'AMBIGU', 'AUCUNE_CORRESPONDANCE_SURE']
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.GMMatcher = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
