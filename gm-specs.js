/* ==========================================================================
   GARAGE MANIFEST — MODULE « FICHE TECHNIQUE »          v1.0.0
   --------------------------------------------------------------------------
   Couche de spécifications ADDITIVE. Ne réécrit pas le catalogue : elle s'y
   greffe par clé. Ton catalogue reste la source de vérité de l'identité
   (marque, modèle, pays) ; cette couche porte la mécanique.

   Trois principes :
   1. Rien n'est stocké s'il peut être calculé. Le rapport poids/puissance
      n'est PAS une donnée : c'est une fonction de deux données. Le stocker,
      c'est se garantir une incohérence le jour où l'une des deux change.
   2. Chaque fiche déclare ses valeurs incertaines dans `flou`. Elles sont
      affichées préfixées de « ≈ ». Aucun chiffre inventé, jamais.
   3. La rareté est DÉRIVÉE du volume de production, pas rédigée à la main.
      Une constante écrite au jugé est une opinion ; log10(production) est un
      fait vérifiable.
   ========================================================================== */

(function (global) {
  'use strict';

  /* ======================================================================
     1. DICTIONNAIRE DES CHAMPS
     ----------------------------------------------------------------------
     clé courte → libellé, unité, sens (haut = mieux ou non). Ce dictionnaire
     pilote l'affichage ET les classements : ajouter un champ ici suffit à le
     faire apparaître partout, sans toucher au rendu.
     ====================================================================== */

  const CHAMPS = {
    ch      : { lib: 'Puissance',        u: 'ch',      sens:  1 },
    tr      : { lib: 'à',                u: 'tr/min',  sens:  0 },
    nm      : { lib: 'Couple',           u: 'Nm',      sens:  1 },
    nmTr    : { lib: 'à',                u: 'tr/min',  sens:  0 },
    kg      : { lib: 'Masse',            u: 'kg',      sens: -1 },
    cyl     : { lib: 'Cylindrée',        u: 'L',       sens:  0 },
    rupteur : { lib: 'Zone rouge',       u: 'tr/min',  sens:  1 },
    v       : { lib: 'Vitesse max',      u: 'km/h',    sens:  1 },
    acc     : { lib: '0 à 100 km/h',     u: 's',       sens: -1 },
    prod    : { lib: 'Production',       u: 'ex.',     sens: -1 }
  };

  /* Indicateurs dérivés — calculés, jamais stockés. */
  const DERIVES = {
    kgch : { lib: 'Poids / puissance',   u: 'kg/ch',   sens: -1, dec: 2,
             calc: f => f.kg && f.ch ? f.kg / f.ch : null },
    chT  : { lib: 'Puissance / tonne',   u: 'ch/t',    sens:  1, dec: 0,
             calc: f => f.kg && f.ch ? f.ch / f.kg * 1000 : null },
    chL  : { lib: 'Puissance spécifique',u: 'ch/L',    sens:  1, dec: 0,
             calc: f => f.cyl && f.ch ? f.ch / f.cyl : null },
    nmL  : { lib: 'Couple spécifique',   u: 'Nm/L',    sens:  1, dec: 0,
             calc: f => f.cyl && f.nm ? f.nm / f.cyl : null },
    kgnm : { lib: 'Poids / couple',      u: 'kg/Nm',   sens: -1, dec: 2,
             calc: f => f.kg && f.nm ? f.kg / f.nm : null }
  };

  /* Rareté dérivée du volume de production, échelle logarithmique.
     Les paliers suivent tes cinq niveaux existants. */
  const PALIERS_RARETE = [
    { max: 150,      cle: 'legendaire', lib: 'Légendaire' },
    { max: 1500,     cle: 'epique',     lib: 'Épique'     },
    { max: 15000,    cle: 'rare',       lib: 'Rare'       },
    { max: 250000,   cle: 'peucommun',  lib: 'Peu commun' },
    { max: Infinity, cle: 'commun',     lib: 'Commun'     }
  ];

  /* ======================================================================
     2. LOT D'AMORÇAGE
     ----------------------------------------------------------------------
     Format compact volontaire : une fiche tient sur trois lignes, donc elle
     se relit et se corrige. `flou` liste les champs dont je ne garantis pas
     la valeur exacte — ils s'affichent avec « ≈ ».

     arch : architecture moteur · adm : admission · pos : position moteur
     tx   : transmission · bv : boîte
     ====================================================================== */

  const SPECS = {

    /* ---- Groupe B et rallye ------------------------------------------ */
    'audi-sport-quattro-s1': { nom:'Audi Sport quattro S1 E2', an:[1985,1986], pays:'Allemagne',
      ch:500, nm:480, kg:1090, cyl:2.1, arch:'5 en ligne', adm:'turbo', pos:'avant', tx:'intégrale', bv:'M5',
      prod:20, son:'cinq-cylindres turbo, décalage caractéristique', surnom:'La Bête',
      flou:['ch','nm','prod'], note:"Puissance officiellement 'non communiquée' par Audi. 500 ch est l'estimation courante." },
    'peugeot-205-t16-e2': { nom:'Peugeot 205 Turbo 16 Evolution 2', an:[1985,1986], pays:'France',
      ch:500, kg:910, cyl:1.8, arch:'4 en ligne', adm:'turbo', pos:'central', tx:'intégrale', bv:'M5',
      prod:20, son:'quatre-cylindres turbo aigu', flou:['ch','prod'] },
    'lancia-delta-s4': { nom:'Lancia Delta S4', an:[1985,1986], pays:'Italie',
      ch:480, kg:890, cyl:1.8, arch:'4 en ligne', adm:'turbo + compresseur', pos:'central', tx:'intégrale', bv:'M5',
      prod:65, son:'suralimentation double, montée en régime sans creux', flou:['ch','prod'],
      note:'Suralimentation combinée : compresseur volumétrique à bas régime, turbo au-delà. Rarissime.' },
    'lancia-037': { nom:'Lancia Rally 037', an:[1982,1983], pays:'Italie',
      ch:205, kg:960, cyl:2.0, arch:'4 en ligne', adm:'compresseur', pos:'central', tx:'propulsion', bv:'M5',
      prod:207, son:'compresseur volumétrique, sifflement continu',
      note:'Dernière propulsion titrée en championnat du monde des rallyes (1983).' },
    'ford-rs200': { nom:'Ford RS200', an:[1984,1986], pays:'Royaume-Uni',
      ch:250, kg:1180, cyl:1.8, arch:'4 en ligne', adm:'turbo', pos:'central', tx:'intégrale', bv:'M5',
      prod:200, flou:['prod'], note:'Version route. La version course dépassait 450 ch.' },
    'mg-metro-6r4': { nom:'MG Metro 6R4', an:[1985,1986], pays:'Royaume-Uni',
      ch:250, kg:1000, cyl:3.0, arch:'V6', adm:'atmosphérique', pos:'central', tx:'intégrale', bv:'M5',
      prod:200, son:'V6 atmosphérique — l\'exception du Groupe B', flou:['kg','prod'],
      note:'Seule Groupe B atmosphérique. Son V6 a donné naissance au moteur de la Jaguar XJ220.' },
    'renault-5-turbo-2': { nom:'Renault 5 Turbo 2', an:[1983,1986], pays:'France',
      ch:160, nm:221, kg:1100, cyl:1.4, arch:'4 en ligne', adm:'turbo', pos:'central', tx:'propulsion', bv:'M5',
      prod:3167, flou:['prod'], note:'Moteur central arrière dans une carrosserie de citadine.' },
    'lancia-stratos-hf': { nom:'Lancia Stratos HF Stradale', an:[1973,1978], pays:'Italie',
      ch:190, nm:225, kg:980, cyl:2.4, arch:'V6', adm:'atmosphérique', pos:'central', tx:'propulsion', bv:'M5',
      prod:492, son:'V6 Dino', flou:['nm','prod'] },

    /* ---- Flat-six ------------------------------------------------------ */
    'porsche-911-carrera-rs-27': { nom:'Porsche 911 Carrera RS 2.7', an:[1972,1973], pays:'Allemagne',
      ch:210, nm:255, kg:960, cyl:2.7, arch:'flat-6', adm:'atmosphérique', pos:'arrière', tx:'propulsion', bv:'M5',
      prod:1580, son:'flat-6 atmosphérique refroidi par air', surnom:'Ducktail', flou:['nm'] },
    'porsche-959': { nom:'Porsche 959', an:[1986,1993], pays:'Allemagne',
      ch:450, nm:500, kg:1450, cyl:2.85, arch:'flat-6', adm:'biturbo séquentiel', pos:'arrière', tx:'intégrale', bv:'M6',
      v:317, prod:337, note:'Turbos séquentiels et transmission intégrale pilotée : vingt ans d\'avance.' },
    'porsche-911-gt1-strassen': { nom:'Porsche 911 GT1 Straßenversion', an:[1996,1998], pays:'Allemagne',
      ch:544, kg:1150, cyl:3.2, arch:'flat-6', adm:'biturbo', pos:'central', tx:'propulsion', bv:'M6',
      prod:25, flou:['kg','prod'], note:'Homologation route d\'une voiture de Le Mans. Moteur central, pas arrière.' },
    'porsche-carrera-gt': { nom:'Porsche Carrera GT', an:[2004,2006], pays:'Allemagne',
      ch:612, nm:590, kg:1380, cyl:5.7, arch:'V10', adm:'atmosphérique', pos:'central', tx:'propulsion', bv:'M6',
      rupteur:8400, v:330, acc:3.9, prod:1270, son:'V10 atmosphérique issu du programme Le Mans',
      note:'Embrayage céramique, châssis carbone, aucune assistance électronique de stabilité.' },
    'porsche-911-gt3-rs-40': { nom:'Porsche 911 GT3 RS 4.0 (997)', an:[2011,2012], pays:'Allemagne',
      ch:500, nm:460, kg:1360, cyl:4.0, arch:'flat-6', adm:'atmosphérique', pos:'arrière', tx:'propulsion', bv:'M6',
      rupteur:8500, prod:600, son:'flat-6 atmosphérique, vilebrequin de la RSR' },
    'porsche-911-gt3-rs-992': { nom:'Porsche 911 GT3 RS (992)', an:[2022,null], pays:'Allemagne',
      ch:525, nm:465, kg:1450, cyl:4.0, arch:'flat-6', adm:'atmosphérique', pos:'arrière', tx:'propulsion', bv:'PDK7',
      rupteur:9000, acc:3.2, son:'flat-6 atmosphérique à 9 000 tr/min',
      note:'Aérodynamique active. Appui aérodynamique supérieur à celui de certaines voitures de course.' },
    'subaru-impreza-22b': { nom:'Subaru Impreza 22B STi', an:[1998,1998], pays:'Japon',
      ch:280, nm:363, kg:1270, cyl:2.2, arch:'flat-4', adm:'turbo', pos:'avant', tx:'intégrale', bv:'M5',
      prod:424, son:'flat-4 à collecteur inégal — le battement Subaru',
      note:'280 ch annoncés : plafond de l\'accord entre constructeurs japonais. La valeur réelle était supérieure.' },

    /* ---- V12, V10, hypersportives -------------------------------------- */
    'ferrari-250-gto': { nom:'Ferrari 250 GTO', an:[1962,1964], pays:'Italie',
      ch:300, kg:880, cyl:3.0, arch:'V12', adm:'atmosphérique', pos:'avant', tx:'propulsion', bv:'M5',
      prod:36, son:'V12 Colombo, six carburateurs Weber',
      note:'Trente-six exemplaires. L\'automobile la plus chère du monde aux enchères.' },
    'ferrari-f40': { nom:'Ferrari F40', an:[1987,1992], pays:'Italie',
      ch:478, nm:577, kg:1100, cyl:2.9, arch:'V8', adm:'biturbo', pos:'central', tx:'propulsion', bv:'M5',
      v:324, prod:1315, son:'V8 biturbo, sifflement de wastegate',
      note:'Dernière Ferrari validée par Enzo Ferrari. Aucune assistance : ni ABS, ni direction assistée.' },
    'ferrari-f50': { nom:'Ferrari F50', an:[1995,1997], pays:'Italie',
      ch:520, nm:471, kg:1230, cyl:4.7, arch:'V12', adm:'atmosphérique', pos:'central', tx:'propulsion', bv:'M6',
      rupteur:8500, prod:349, son:'V12 dérivé de la Formule 1 de 1990',
      note:'Moteur boulonné directement au châssis carbone : pas de silentbloc, toutes les vibrations passent.' },
    'ferrari-enzo': { nom:'Ferrari Enzo', an:[2002,2004], pays:'Italie',
      ch:660, nm:657, kg:1365, cyl:6.0, arch:'V12', adm:'atmosphérique', pos:'central', tx:'propulsion', bv:'F1 6',
      rupteur:8200, v:350, acc:3.4, prod:400, son:'V12 atmosphérique' },
    'lamborghini-miura-sv': { nom:'Lamborghini Miura P400 SV', an:[1971,1973], pays:'Italie',
      ch:385, nm:400, kg:1245, cyl:3.9, arch:'V12 transversal', adm:'atmosphérique', pos:'central', tx:'propulsion', bv:'M5',
      prod:150, son:'V12 transversal, chaîne de distribution audible', flou:['nm','kg'],
      note:'Premier V12 en position centrale transversale : l\'acte de naissance de la supercar moderne.' },
    'lamborghini-countach-lp400': { nom:'Lamborghini Countach LP400', an:[1974,1978], pays:'Italie',
      ch:375, nm:361, kg:1065, cyl:4.0, arch:'V12', adm:'atmosphérique', pos:'central', tx:'propulsion', bv:'M5',
      prod:157, surnom:'Periscopio', flou:['nm'] },
    'mclaren-f1': { nom:'McLaren F1', an:[1992,1998], pays:'Royaume-Uni',
      ch:627, nm:651, kg:1138, cyl:6.1, arch:'V12', adm:'atmosphérique', pos:'central', tx:'propulsion', bv:'M6',
      rupteur:7500, v:386, acc:3.2, prod:106, son:'V12 BMW atmosphérique',
      note:'Trois places, conducteur au centre. Compartiment moteur doublé d\'or pour dissiper la chaleur.' },
    'jaguar-xj220': { nom:'Jaguar XJ220', an:[1992,1994], pays:'Royaume-Uni',
      ch:542, nm:644, kg:1470, cyl:3.5, arch:'V6', adm:'biturbo', pos:'central', tx:'propulsion', bv:'M5',
      v:349, prod:275, note:'Annoncée en V12 intégral, produite en V6 biturbo propulsion. Procès à la clé.' },
    'bugatti-eb110-ss': { nom:'Bugatti EB110 Super Sport', an:[1992,1995], pays:'Italie',
      ch:611, nm:650, kg:1418, cyl:3.5, arch:'V12', adm:'quadriturbo', pos:'central', tx:'intégrale', bv:'M6',
      prod:33, flou:['kg','prod'], note:'Quatre turbos, soixante soupapes, châssis carbone. Bugatti époque Campogalliano.' },
    'lexus-lfa': { nom:'Lexus LFA', an:[2010,2012], pays:'Japon',
      ch:560, nm:480, kg:1480, cyl:4.8, arch:'V10', adm:'atmosphérique', pos:'avant', tx:'propulsion', bv:'ASG6',
      rupteur:9000, v:325, prod:500, son:'V10 à 9 000 tr/min, échappement accordé par Yamaha Music',
      note:'Compte-tours analogique impossible : l\'aiguille ne pouvait pas suivre la montée en régime.' },
    'pagani-zonda-c12s': { nom:'Pagani Zonda C12 S 7.3', an:[2002,2005], pays:'Italie',
      ch:555, nm:750, kg:1280, cyl:7.3, arch:'V12', adm:'atmosphérique', pos:'central', tx:'propulsion', bv:'M6',
      prod:15, flou:['prod'], son:'V12 AMG atmosphérique, quatre sorties centrales' },
    'gma-t50': { nom:'Gordon Murray Automotive T.50', an:[2022,null], pays:'Royaume-Uni',
      ch:663, nm:467, kg:986, cyl:3.9, arch:'V12', adm:'atmosphérique', pos:'central', tx:'propulsion', bv:'M6',
      rupteur:12100, prod:100, son:'V12 Cosworth à 12 100 tr/min — le plus haut régime d\'un moteur de route',
      note:'Ventilateur aérodynamique de 400 mm. Conception de l\'auteur de la McLaren F1.' },
    'bugatti-chiron': { nom:'Bugatti Chiron', an:[2016,2022], pays:'France',
      ch:1500, nm:1600, kg:1995, cyl:8.0, arch:'W16', adm:'quadriturbo', pos:'central', tx:'intégrale', bv:'DSG7',
      v:420, acc:2.4, prod:500, note:'Le radiateur consomme 800 litres d\'eau par minute à pleine charge.' },

    /* ---- Youngtimers et japonaises ------------------------------------- */
    'honda-nsx-na1': { nom:'Honda NSX (NA1)', an:[1990,1997], pays:'Japon',
      ch:274, nm:285, kg:1350, cyl:3.0, arch:'V6', adm:'atmosphérique', pos:'central', tx:'propulsion', bv:'M5',
      rupteur:8000, son:'V6 VTEC', note:'Châssis tout aluminium. Mise au point avec la contribution d\'Ayrton Senna.' },
    'honda-s2000-ap1': { nom:'Honda S2000 (AP1)', an:[1999,2003], pays:'Japon',
      ch:240, nm:208, kg:1250, cyl:2.0, arch:'4 en ligne', adm:'atmosphérique', pos:'avant', tx:'propulsion', bv:'M6',
      rupteur:9000, son:'F20C — bascule VTEC à 6 000 tr/min',
      note:'120 ch/L : record de puissance spécifique pour un moteur atmosphérique de série à sa sortie.' },
    'nissan-skyline-gtr-r34': { nom:'Nissan Skyline GT-R R34 V-Spec', an:[1999,2002], pays:'Japon',
      ch:280, nm:392, kg:1560, cyl:2.6, arch:'6 en ligne', adm:'biturbo', pos:'avant', tx:'intégrale', bv:'M6',
      son:'RB26DETT', surnom:'Godzilla',
      note:'280 ch annoncés au titre de l\'accord japonais ; la puissance réelle dépassait 320 ch.' },
    'toyota-supra-rz-a80': { nom:'Toyota Supra RZ (A80)', an:[1993,2002], pays:'Japon',
      ch:280, nm:441, kg:1570, cyl:3.0, arch:'6 en ligne', adm:'biturbo séquentiel', pos:'avant', tx:'propulsion', bv:'M6',
      son:'2JZ-GTE', note:'Bloc fonte réputé pour encaisser le double de sa puissance d\'origine sans ouverture.' },
    'mazda-rx7-fd': { nom:'Mazda RX-7 (FD)', an:[1992,2002], pays:'Japon',
      ch:280, nm:314, kg:1270, cyl:1.3, arch:'rotatif bi-rotor', adm:'biturbo séquentiel', pos:'avant', tx:'propulsion', bv:'M5',
      son:'13B-REW rotatif — aucune autre voiture ne fait ce bruit',
      note:'Cylindrée de 1,3 L au sens du rotatif : la comparaison en ch/L n\'a pas de sens ici.' },
    'mitsubishi-evo-vi-tme': { nom:'Mitsubishi Lancer Evo VI Tommi Mäkinen', an:[1999,2001], pays:'Japon',
      ch:280, nm:373, kg:1360, cyl:2.0, arch:'4 en ligne', adm:'turbo', pos:'avant', tx:'intégrale', bv:'M5',
      flou:['kg'], prod:2500, note:'Turbo à roue titane, différentiel actif arrière.' },
    'nissan-gtr-r35': { nom:'Nissan GT-R (R35)', an:[2007,null], pays:'Japon',
      ch:570, nm:637, kg:1752, cyl:3.8, arch:'V6', adm:'biturbo', pos:'avant', tx:'intégrale', bv:'DCT6',
      acc:2.8, flou:['ch','nm'], note:'Valeurs de la phase 2017. Moteur assemblé à la main par un takumi.' },
    'toyota-gr-yaris': { nom:'Toyota GR Yaris', an:[2020,null], pays:'Japon',
      ch:261, nm:360, kg:1280, cyl:1.6, arch:'3 en ligne', adm:'turbo', pos:'avant', tx:'intégrale', bv:'M6',
      son:'trois-cylindres turbo', note:'Homologation rallye. Trois-cylindres turbo le plus puissant du marché à sa sortie.' },

    /* ---- Allemandes ---------------------------------------------------- */
    'bmw-m3-e30-evo3': { nom:'BMW M3 E30 Sport Evolution', an:[1990,1990], pays:'Allemagne',
      ch:238, nm:240, kg:1200, cyl:2.5, arch:'4 en ligne', adm:'atmosphérique', pos:'avant', tx:'propulsion', bv:'M5',
      rupteur:7000, prod:600, son:'S14 atmosphérique',
      note:'Homologation groupe A. Culasse dérivée du quatre-cylindres de Formule 1 M12.' },
    'bmw-m5-e60': { nom:'BMW M5 (E60)', an:[2005,2010], pays:'Allemagne',
      ch:507, nm:520, kg:1830, cyl:5.0, arch:'V10', adm:'atmosphérique', pos:'avant', tx:'propulsion', bv:'SMG7',
      rupteur:8250, son:'V10 atmosphérique à 8 250 tr/min',
      note:'Seule berline de série à V10 atmosphérique. Architecture issue du programme Formule 1 de l\'époque.' },
    'mercedes-190e-evo2': { nom:'Mercedes-Benz 190E 2.5-16 Evolution II', an:[1990,1990], pays:'Allemagne',
      ch:235, nm:245, kg:1340, cyl:2.5, arch:'4 en ligne', adm:'atmosphérique', pos:'avant', tx:'propulsion', bv:'M5',
      prod:502, note:'Culasse Cosworth. Aérodynamique dessinée en soufflerie pour le championnat DTM.' },
    'audi-rs2-avant': { nom:'Audi RS2 Avant', an:[1994,1996], pays:'Allemagne',
      ch:315, nm:410, kg:1595, cyl:2.2, arch:'5 en ligne', adm:'turbo', pos:'avant', tx:'intégrale', bv:'M6',
      prod:2891, son:'cinq-cylindres turbo',
      note:'Développée avec Porsche, assemblée à Zuffenhausen. Freins et jantes de 911 Turbo.' },
    'ruf-ctr-yellowbird': { nom:'RUF CTR', an:[1987,1989], pays:'Allemagne',
      ch:469, nm:553, kg:1150, cyl:3.4, arch:'flat-6', adm:'biturbo', pos:'arrière', tx:'propulsion', bv:'M5',
      v:342, prod:29, surnom:'Yellowbird',
      note:'Voiture de série la plus rapide du monde en 1987. RUF est constructeur, pas préparateur.' },
    'vw-golf-gti-mk1': { nom:'Volkswagen Golf GTI (Mk1)', an:[1976,1983], pays:'Allemagne',
      ch:110, nm:140, kg:810, cyl:1.6, arch:'4 en ligne', adm:'atmosphérique', pos:'avant', tx:'traction', bv:'M4',
      prod:462000, flou:['prod'], note:'L\'acte fondateur de la compacte sportive.' },
    'porsche-718-cayman-gt4-rs': { nom:'Porsche 718 Cayman GT4 RS', an:[2021,null], pays:'Allemagne',
      ch:500, nm:450, kg:1415, cyl:4.0, arch:'flat-6', adm:'atmosphérique', pos:'central', tx:'propulsion', bv:'PDK7',
      rupteur:9000, acc:3.4, son:'admission située derrière les oreilles du conducteur' },

    /* ---- Françaises ----------------------------------------------------- */
    'alpine-a110-1600s': { nom:'Alpine A110 1600 S', an:[1970,1973], pays:'France',
      ch:138, nm:144, kg:730, cyl:1.6, arch:'4 en ligne', adm:'atmosphérique', pos:'arrière', tx:'propulsion', bv:'M5',
      flou:['nm'], note:'Championne du monde des rallyes 1973. Coque polyester sur poutre centrale.' },
    'alpine-a110-2017': { nom:'Alpine A110 (2017)', an:[2017,null], pays:'France',
      ch:252, nm:320, kg:1103, cyl:1.8, arch:'4 en ligne', adm:'turbo', pos:'central', tx:'propulsion', bv:'DCT7',
      acc:4.5, note:'Structure aluminium. Le poids contenu comme cahier des charges principal.' },
    'renault-clio-williams': { nom:'Renault Clio Williams', an:[1993,1995], pays:'France',
      ch:150, nm:175, kg:981, cyl:2.0, arch:'4 en ligne', adm:'atmosphérique', pos:'avant', tx:'traction', bv:'M5',
      prod:3800, flou:['prod'], note:'Voies élargies, triangles renforcés, boîte à rapports courts.' },
    'renault-clio-v6-ph2': { nom:'Renault Clio V6 (phase 2)', an:[2003,2005], pays:'France',
      ch:255, nm:300, kg:1400, cyl:3.0, arch:'V6', adm:'atmosphérique', pos:'central', tx:'propulsion', bv:'M6',
      prod:1309, flou:['prod'], note:'Moteur central dans une citadine. Deux places, zéro coffre.' },
    'renault-megane-rs-trophy-r': { nom:'Renault Mégane R.S. Trophy-R', an:[2019,2019], pays:'France',
      ch:300, nm:400, kg:1306, cyl:1.8, arch:'4 en ligne', adm:'turbo', pos:'avant', tx:'traction', bv:'M6',
      prod:500, flou:['prod'], note:'Record du tour au Nürburgring pour une traction en 2019.' },
    'peugeot-205-gti-19': { nom:'Peugeot 205 GTI 1.9', an:[1986,1994], pays:'France',
      ch:130, nm:161, kg:880, cyl:1.9, arch:'4 en ligne', adm:'atmosphérique', pos:'avant', tx:'traction', bv:'M5',
      note:'Train arrière à bras tirés, réputé pour son comportement en levé de pied.' },
    'citroen-sm': { nom:'Citroën SM', an:[1970,1975], pays:'France',
      ch:170, nm:231, kg:1450, cyl:2.7, arch:'V6', adm:'atmosphérique', pos:'avant', tx:'traction', bv:'M5',
      prod:12920, flou:['nm'], note:'V6 Maserati, suspension hydropneumatique, direction à rappel asservi.' },
    'venturi-400-gt': { nom:'Venturi 400 GT', an:[1994,1998], pays:'France',
      ch:408, nm:520, kg:1150, cyl:3.0, arch:'V6', adm:'biturbo', pos:'central', tx:'propulsion', bv:'M5',
      prod:15, flou:['prod','kg'], note:'Première voiture de route française à freins carbone.' },

    /* ---- Italiennes et britanniques ------------------------------------- */
    'alfa-romeo-giulia-gta': { nom:'Alfa Romeo Giulia GTA (2020)', an:[2020,null], pays:'Italie',
      ch:540, nm:600, kg:1580, cyl:2.9, arch:'V6', adm:'biturbo', pos:'avant', tx:'propulsion', bv:'AT8',
      prod:500, note:'Allègement de 100 kg par rapport à la Quadrifoglio. Carbone et titane.' },
    'lotus-elise-s1': { nom:'Lotus Elise (S1)', an:[1996,2001], pays:'Royaume-Uni',
      ch:118, nm:165, kg:725, cyl:1.8, arch:'4 en ligne', adm:'atmosphérique', pos:'central', tx:'propulsion', bv:'M5',
      note:'Châssis en profilés d\'aluminium collés. Sept cent vingt-cinq kilos.' },
    'caterham-seven-620r': { nom:'Caterham Seven 620R', an:[2013,null], pays:'Royaume-Uni',
      ch:310, nm:298, kg:610, cyl:2.0, arch:'4 en ligne', adm:'compresseur', pos:'avant', tx:'propulsion', bv:'ASG6',
      acc:2.8, note:'Le meilleur rapport poids/puissance de ce lot. Sans portes, ni toit, ni assistance.' },
    'tvr-sagaris': { nom:'TVR Sagaris', an:[2005,2006], pays:'Royaume-Uni',
      ch:406, nm:475, kg:1078, cyl:4.0, arch:'6 en ligne', adm:'atmosphérique', pos:'avant', tx:'propulsion', bv:'M5',
      prod:211, flou:['prod'], note:'Ni ABS, ni contrôle de traction, ni airbag. Décision assumée du constructeur.' },
    'de-tomaso-pantera-gt5': { nom:'De Tomaso Pantera GT5', an:[1980,1985], pays:'Italie',
      ch:350, nm:459, kg:1420, cyl:5.8, arch:'V8', adm:'atmosphérique', pos:'central', tx:'propulsion', bv:'M5',
      flou:['ch','nm','kg'], son:'V8 Ford Cleveland' },

    /* ---- Orphelines et curiosités --------------------------------------- */
    'saab-900-turbo-16s': { nom:'Saab 900 Turbo 16S', an:[1984,1993], pays:'Suède',
      ch:175, nm:273, kg:1280, cyl:2.0, arch:'4 en ligne', adm:'turbo', pos:'avant', tx:'traction', bv:'M5',
      flou:['kg'], note:'Marque disparue en 2012. Pare-brise incurvé issu de la culture aéronautique.' },
    'volvo-850-t5r': { nom:'Volvo 850 T-5R', an:[1995,1995], pays:'Suède',
      ch:243, nm:350, kg:1450, cyl:2.3, arch:'5 en ligne', adm:'turbo', pos:'avant', tx:'traction', bv:'M5',
      flou:['kg'], son:'cinq-cylindres turbo', note:'Break familial engagé en championnat britannique des voitures de tourisme.' },
    'lancia-delta-integrale-evo2': { nom:'Lancia Delta HF Integrale Evoluzione II', an:[1993,1994], pays:'Italie',
      ch:215, nm:308, kg:1340, cyl:2.0, arch:'4 en ligne', adm:'turbo', pos:'avant', tx:'intégrale', bv:'M5',
      prod:2480, flou:['prod'], note:'Six titres constructeurs consécutifs en rallye pour la lignée Delta.' },
    'ford-escort-rs-cosworth': { nom:'Ford Escort RS Cosworth', an:[1992,1996], pays:'Royaume-Uni',
      ch:227, nm:304, kg:1275, cyl:2.0, arch:'4 en ligne', adm:'turbo', pos:'avant', tx:'intégrale', bv:'M5',
      prod:7145, flou:['prod'], note:'Aileron biplan homologué à contrecœur par le service marketing.' },
    'audi-quattro-ur': { nom:'Audi quattro (Ur-quattro)', an:[1980,1991], pays:'Allemagne',
      ch:200, nm:285, kg:1290, cyl:2.1, arch:'5 en ligne', adm:'turbo', pos:'avant', tx:'intégrale', bv:'M5',
      prod:11452, son:'cinq-cylindres turbo', note:'A rendu la transmission intégrale obligatoire en rallye.' }
  };

  /* ======================================================================
     3. MOTEUR
     ====================================================================== */

  const norm = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                     .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  /** Rareté dérivée du volume de production. */
  function rarete(prod) {
    if (prod == null) return null;
    return PALIERS_RARETE.find(p => prod <= p.max);
  }

  /** Toutes les valeurs dérivées d'une fiche. */
  function deriver(f) {
    const out = {};
    for (const k in DERIVES) {
      const v = DERIVES[k].calc(f);
      if (v != null && isFinite(v)) out[k] = v;
    }
    return out;
  }

  /* Percentiles calculés une fois sur l'ensemble du lot. Permet de dire
     « dans les 5 % les plus légers » plutôt que « 890 kg », qui ne parle
     qu'à quelqu'un qui a déjà les ordres de grandeur en tête. */
  let _distributions = null;
  function distributions() {
    if (_distributions) return _distributions;
    const acc = {};
    const champs = [...Object.keys(CHAMPS), ...Object.keys(DERIVES)];
    for (const c of champs) acc[c] = [];
    for (const cle in SPECS) {
      const f = SPECS[cle], d = deriver(f);
      for (const c of champs) {
        const v = f[c] ?? d[c];
        if (typeof v === 'number' && isFinite(v)) acc[c].push(v);
      }
    }
    for (const c of champs) acc[c].sort((a, b) => a - b);
    return (_distributions = acc);
  }

  /** Rang percentile d'une valeur, orienté par le sens du champ. */
  function percentile(champ, valeur) {
    const serie = distributions()[champ];
    if (!serie || serie.length < 5 || valeur == null) return null;
    const rang = serie.filter(v => v < valeur).length / serie.length;
    const sens = (CHAMPS[champ] || DERIVES[champ] || {}).sens ?? 0;
    return sens < 0 ? 1 - rang : rang;
  }

  const estFlou = (f, champ) => Array.isArray(f.flou) && f.flou.includes(champ);

  function fmtNombre(v, dec = 0) {
    return v.toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }

  /** Valeur formatée, préfixée de « ≈ » si la fiche la déclare incertaine. */
  function fmt(f, champ) {
    const def = CHAMPS[champ] || DERIVES[champ];
    const v = f[champ] ?? deriver(f)[champ];
    if (v == null) return null;
    const dec = def.dec ?? (champ === 'cyl' || champ === 'acc' ? 1 : 0);
    return (estFlou(f, champ) ? '≈ ' : '') + fmtNombre(v, dec) + ' ' + def.u;
  }

  /** Phrase de signature mécanique — construite, pas stockée. */
  function signature(f) {
    const bouts = [];
    if (f.arch) bouts.push(f.arch);
    if (f.adm) bouts.push(f.adm);
    let s = bouts.join(' ');
    if (f.rupteur) s += `, rupteur à ${fmtNombre(f.rupteur)} tr/min`;
    if (f.pos) s += ` · moteur ${f.pos}`;
    if (f.tx) s += ` · ${f.tx}`;
    return s || null;
  }

  /* ======================================================================
     4. RENDU
     ====================================================================== */

  const CSS = `
  .gsp{--a:var(--accent,#e8b13a);--b:var(--border,#2a2f3a);--c:var(--card,#15171c);
    display:flex;flex-direction:column;gap:12px;font-variant-numeric:tabular-nums}
  .gsp-tete{display:flex;flex-direction:column;gap:3px}
  .gsp-tete h3{margin:0;font-size:1.05rem;line-height:1.2}
  .gsp-sur{font-size:.78rem;color:var(--a);letter-spacing:.05em;text-transform:uppercase}
  .gsp-sig{font-size:.78rem;opacity:.6;line-height:1.4}
  .gsp-vedettes{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
  .gsp-v{background:var(--c);border:1px solid var(--b);border-radius:10px;padding:10px 8px;text-align:center}
  .gsp-v b{display:block;font-size:1.22rem;line-height:1.1;color:var(--a)}
  .gsp-v small{display:block;font-size:.62rem;opacity:.55;margin-top:3px;line-height:1.25}
  .gsp-jauge{height:3px;border-radius:2px;background:var(--b);margin-top:7px;overflow:hidden}
  .gsp-jauge i{display:block;height:100%;background:var(--a);border-radius:2px}
  .gsp-grille{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--b);
    border:1px solid var(--b);border-radius:10px;overflow:hidden}
  .gsp-l{background:var(--c);padding:8px 10px;display:flex;justify-content:space-between;
    align-items:baseline;gap:8px;font-size:.8rem}
  .gsp-l span{opacity:.55;font-size:.72rem}
  .gsp-l b{font-weight:600}
  .gsp-rar{display:inline-flex;align-items:center;gap:6px;font-size:.75rem;
    padding:3px 9px;border-radius:99px;border:1px solid var(--b);width:fit-content}
  .gsp-rar[data-r="legendaire"]{color:#7fe3d0;border-color:#7fe3d055}
  .gsp-rar[data-r="epique"]{color:#c58aff;border-color:#c58aff55}
  .gsp-rar[data-r="rare"]{color:#e8b13a;border-color:#e8b13a55}
  .gsp-rar[data-r="peucommun"]{color:#8fb8e8;border-color:#8fb8e855}
  .gsp-rar[data-r="commun"]{opacity:.6}
  .gsp-note{font-size:.78rem;line-height:1.5;opacity:.75;border-left:2px solid var(--a);padding-left:10px}
  .gsp-flou{font-size:.68rem;opacity:.42;line-height:1.4}
  `;

  function injecterCSS() {
    if (document.getElementById('gsp-css')) return;
    const st = document.createElement('style');
    st.id = 'gsp-css'; st.textContent = CSS;
    document.head.appendChild(st);
  }

  const esc = s => String(s ?? '').replace(/[&<>"]/g, m =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));

  function vedette(f, champ) {
    const val = fmt(f, champ);
    if (!val) return '';
    const def = CHAMPS[champ] || DERIVES[champ];
    const p = percentile(champ, f[champ] ?? deriver(f)[champ]);
    return `<div class="gsp-v"><b>${esc(val.replace(/ [a-zA-Z/]+$/, ''))}</b>
      <small>${esc(def.lib)}<br>${esc(def.u)}</small>
      ${p != null ? `<div class="gsp-jauge"><i style="width:${Math.round(p * 100)}%"></i></div>` : ''}
    </div>`;
  }

  function ligne(f, champ) {
    const val = fmt(f, champ);
    if (!val) return '';
    return `<div class="gsp-l"><span>${esc((CHAMPS[champ] || DERIVES[champ]).lib)}</span><b>${esc(val)}</b></div>`;
  }

  function ficheHTML(cle) {
    const f = SPECS[cle];
    if (!f) return `<p>Fiche technique non renseignée.</p>`;
    const r = rarete(f.prod);
    const periode = f.an ? `${f.an[0]}${f.an[1] ? '–' + f.an[1] : '–'}` : '';

    const flous = (f.flou || []).map(c => (CHAMPS[c] || DERIVES[c] || {}).lib).filter(Boolean);

    return `<div class="gsp">
      <div class="gsp-tete">
        ${f.surnom ? `<div class="gsp-sur">« ${esc(f.surnom)} »</div>` : ''}
        <h3>${esc(f.nom)}</h3>
        <div class="gsp-sig">${esc([periode, f.pays].filter(Boolean).join(' · '))}</div>
        ${signature(f) ? `<div class="gsp-sig">${esc(signature(f))}</div>` : ''}
      </div>

      ${r ? `<div class="gsp-rar" data-r="${r.cle}">${esc(r.lib)} · ${fmtNombre(f.prod)} exemplaires</div>` : ''}

      <div class="gsp-vedettes">
        ${vedette(f, 'kgch')}${vedette(f, 'chT')}${vedette(f, 'chL')}
      </div>

      <div class="gsp-grille">
        ${ligne(f, 'ch')}${ligne(f, 'nm')}${ligne(f, 'kg')}${ligne(f, 'cyl')}
        ${ligne(f, 'rupteur')}${ligne(f, 'nmL')}${ligne(f, 'kgnm')}
        ${ligne(f, 'acc')}${ligne(f, 'v')}
        ${f.bv ? `<div class="gsp-l"><span>Boîte</span><b>${esc(f.bv)}</b></div>` : ''}
      </div>

      ${f.son ? `<div class="gsp-sig">🔊 ${esc(f.son)}</div>` : ''}
      ${f.note ? `<div class="gsp-note">${esc(f.note)}</div>` : ''}
      ${flous.length ? `<div class="gsp-flou">Valeurs approximatives : ${esc(flous.join(', '))}.</div>` : ''}
    </div>`;
  }

  /* ======================================================================
     5. API
     ====================================================================== */

  const API = {
    CHAMPS, DERIVES, SPECS,

    /** Fiche brute. */
    get: cle => SPECS[cle] || null,

    /** Fiche enrichie : données + dérivés + rareté + signature. */
    complet(cle) {
      const f = SPECS[cle];
      if (!f) return null;
      return { cle, ...f, ...deriver(f), rarete: rarete(f.prod), signature: signature(f) };
    },

    /** Rattache une entrée de ton catalogue à une fiche, par similarité de nom. */
    rattacher(entree, nomComplet) {
      const cible = norm(nomComplet ?? [entree.marque, entree.modele].filter(Boolean).join(' '));
      if (!cible) return null;
      let best = null, score = 0;
      for (const cle in SPECS) {
        const s = dice(cible, norm(SPECS[cle].nom));
        if (s > score) { score = s; best = cle; }
      }
      return score >= 0.62 ? { cle: best, score } : null;
    },

    /** Classement du lot sur un champ ou un dérivé. */
    classement(champ, n = 10) {
      const def = CHAMPS[champ] || DERIVES[champ];
      if (!def) return [];
      const sens = def.sens || 1;
      return Object.keys(SPECS)
        .map(cle => ({ cle, nom: SPECS[cle].nom, v: SPECS[cle][champ] ?? deriver(SPECS[cle])[champ] }))
        .filter(x => typeof x.v === 'number' && isFinite(x.v))
        .sort((a, b) => (b.v - a.v) * sens)
        .slice(0, n);
    },

    rarete, deriver, percentile, signature, ficheHTML,

    render(cible, cle) {
      injecterCSS();
      const el = typeof cible === 'string' ? document.querySelector(cible) : cible;
      if (el) el.innerHTML = ficheHTML(cle);
    },

    stats() {
      const cles = Object.keys(SPECS);
      const rempli = champ => cles.filter(c => SPECS[c][champ] != null).length;
      const couverture = {};
      for (const c in CHAMPS) couverture[c] = Math.round(rempli(c) / cles.length * 100);
      return { fiches: cles.length, couverture };
    }
  };

  /* Coefficient de Dice sur bigrammes — même méthode que ton matchCatalog,
     pour que le rattachement se comporte comme le reste de l'app. */
  function bigrammes(s) {
    const out = new Set();
    for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
    return out;
  }
  function dice(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1;
    const A = bigrammes(a), B = bigrammes(b);
    let inter = 0;
    for (const g of A) if (B.has(g)) inter++;
    return (2 * inter) / (A.size + B.size);
  }

  global.GMSpecs = API;
})(window);
