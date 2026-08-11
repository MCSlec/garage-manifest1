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
    'audi-r8-v12-tdi': { nom:'Audi R8 V12 TDI (concept)', an:[2008,2008], pays:'Allemagne',
      ch:500, nm:1000, cyl:6.0, arch:'V12', adm:'biturbodiesel', pos:'central', tx:'quattro', bv:'M6',
      prod:2, acc:4.2, v:300, flou:['prod','acc','v'],
      son:'V12 diesel — un couple de camion dans une carrosserie de supercar',
      note:"Le seul V12 diesel jamais monté dans une voiture de sport. 1 000 Nm dès 1 750 tr/min, soit davantage qu'une Bugatti Veyron de l'époque. Restée à l'état de prototype : deux exemplaires, dont un exposé au musée Audi d'Ingolstadt." },
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
     3bis. GÉNÉRATIONS ET DÉCLINAISONS
     ----------------------------------------------------------------------
     Format positionnel volontaire, décrit une fois ci-dessous : une
     génération tient sur une ligne, donc la table se relit d'un coup d'œil
     et se corrige sans effort. Un objet à cinq clés répétées 250 fois
     n'apporterait rien qu'un fichier trois fois plus long.

         [ code, années, mécanique, puissance, note ]

     Le CODE est ce qui compte pour un passionné : E30, 964, B7, NA, Fox.
     C'est le vocabulaire réel — personne ne dit « la M3 de 1990 ».
     ====================================================================== */

  const GENS = {

    /* ---- Concepts restés sans suite ------------------------------------
       Jamais commercialisés, mais construits, roulants et présentés. Les
       ignorer reviendrait à effacer une partie de l'histoire technique — le
       seul V12 TDI jamais monté dans une sportive, par exemple. Ils sont
       identifiés comme concepts, pas glissés parmi les modèles de série. */

    'audi-r8-v12-tdi': [
      { c:'Concept', a:'2008–2009', m:[
        ['R8 V12 TDI','V12 6.0 TDI biturbo, dérivé du bloc de la R10 du Mans','500 ch, 1 000 Nm','quattro · manuelle 6','Présentée à Detroit en janvier 2008, puis en version Le Mans à Genève. Le seul V12 diesel jamais installé dans une sportive. Le couple imposait un carter de boîte spécifique. Projet abandonné en 2009 : deux à trois exemplaires roulants existent.'],
      ]},
    ],
    'renault-clio-rs16': [
      { c:'Concept', a:'2016', m:[
        ['Clio R.S. 16','4 cyl. 2.0 turbo de Mégane R.S. 275 Trophy-R','275 ch','traction · manuelle 6','Construite en six semaines par Renault Sport pour les quarante ans de l\'écurie de Formule 1. Voies élargies de 60 mm. Restée sans suite malgré un accueil enthousiaste.'],
      ]},
    ],


    /* ================= VAGUE 10b — SUV, Japon grand public, utilitaires ===== */

    'toyota-landcruiser': [
      ['40 / 60','1960–1990','6 en ligne essence et diesel','93–135 ch','Ponts rigides, châssis échelle. Le 4x4 de référence dans les zones les plus hostiles du monde.'],
      ['80 / 100','1990–2007','6 en ligne et V8','129–235 ch','Le 80 à trois blocages de différentiels reste la référence de l\'expédition.'],
      ['200 / 300','2007–','V8 puis V6 biturbo, diesel','272–415 ch','Le 300 abandonne le V8 pour un V6 biturbo, au grand dam des habitués.'],
    ],
    'toyota-hilux': [
      ['1re à 5e gén.','1968–1997','4 cyl. essence et diesel','60–115 ch','Le pick-up réputé indestructible, testé jusqu\'à l\'absurde par Top Gear.'],
      ['6e à 8e gén.','1997–','4 cyl. D-4D turbodiesel','102–204 ch','La version Arctic Trucks a atteint le pôle Sud en 2007.'],
    ],
    'toyota-corolla': [
      ['E20 – E90','1970–1991','4 cyl. essence','55–130 ch','La E80 et la E90 comptent parmi les dernières propulsions de la lignée.'],
      ['E100 – E150','1991–2013','essence et diesel','75–192 ch','Le modèle le plus vendu de l\'histoire de l\'automobile, toutes générations confondues.'],
      ['E210','2018–','hybride 1.8 et 2.0','122–196 ch','Plateforme TNGA. La GR Corolla à 300 ch en est la déclinaison sportive.'],
    ],
    'toyota-prius': [
      ['XW10 / XW20','1997–2009','1.5 hybride','72–113 ch cumulés','Première hybride de grande série au monde. Le nom vient du latin « avant ».'],
      ['XW30 / XW50','2009–2022','1.8 hybride, rechargeable','122–136 ch','La version rechargeable arrive en 2012.'],
      ['XW60','2022–','2.0 hybride rechargeable','196–223 ch','Rupture stylistique complète après vingt-cinq ans de design utilitaire.'],
    ],
    'toyota-yaris': [
      ['XP10 / XP90','1999–2011','1.0–1.5 essence, D-4D','65–133 ch','Voiture de l\'Année 2000.'],
      ['XP130 / XP150','2011–2020','essence et hybride','69–111 ch','Première citadine hybride de grande diffusion en Europe.'],
      ['XP210','2020–','1.5 hybride','116–130 ch','Voiture de l\'Année 2021. Base technique de la GR Yaris, mais plateforme différente.'],
    ],
    'toyota-rav4': [
      ['XA10 – XA30','1994–2012','4 cyl. essence et diesel','120–177 ch','L\'inventeur du crossover compact, en 1994.'],
      ['XA40 / XA50','2012–','essence, hybride, hybride rechargeable','150–306 ch','Le RAV4 devient le SUV le plus vendu au monde.'],
    ],
    'honda-civic': [
      ['1re à 5e gén.','1972–1995','4 cyl., VTEC à partir de 1991','50–170 ch','La VTi 1.6 VTEC de la 5e génération est la plus recherchée.'],
      ['6e à 9e gén.','1995–2015','essence et i-CTDi','75–201 ch','La 8e génération et son style de vaisseau spatial.'],
      ['10e / 11e gén.','2015–','VTEC Turbo, e:HEV hybride','126–329 ch','Retour à des lignes plus sobres sur la 11e.'],
    ],
    'honda-crv': [
      ['RD / RE','1995–2012','2.0–2.4 essence, i-CTDi','128–190 ch',''],
      ['RM / RW / RS','2012–','essence, hybride e:HEV','120–184 ch','Le CR-V hybride devient la version principale en Europe.'],
    ],
    'nissan-qashqai': [
      ['J10','2006–2013','essence et dCi','106–150 ch','L\'inventeur du crossover compact européen : Nissan a remplacé ses berlines par ce modèle.'],
      ['J11','2013–2021','DIG-T et dCi','115–163 ch','Voiture la plus produite au Royaume-Uni pendant plusieurs années.'],
      ['J12','2021–','mild hybrid, e-Power','140–190 ch','L\'e-Power : le thermique ne fait que produire de l\'électricité, sans jamais entraîner les roues.'],
    ],
    'nissan-micra': [
      ['K10 / K11','1982–2002','1.0–1.4','54–82 ch','La K11 est Voiture de l\'Année 1993.'],
      ['K12 – K14','2002–','1.0–1.6, DIG-S compressé','65–117 ch','La K14 de 2017 passe sur plateforme Renault Clio.'],
    ],
    'nissan-leaf': [
      ['ZE0','2010–2017','électrique 80 kW, batterie 24–30 kWh','109 ch','Première électrique de grande série au monde. Plus de 500 000 exemplaires.'],
      ['ZE1','2017–','électrique, batterie 40–62 kWh','150–217 ch','Pédale e-Pedal permettant de conduire d\'un seul pied.'],
    ],
    'mazda-3': [
      ['BK / BL','2003–2013','1.6–2.3, MZR-CD','105–260 ch','La MPS à 260 ch est la version chaude, aujourd\'hui rare.'],
      ['BM / BP','2013–','SkyActiv-G, SkyActiv-X','100–186 ch','Le SkyActiv-X : allumage par compression sur un moteur essence, une première mondiale en série.'],
    ],
    'hyundai-tucson': [
      ['JM / LM','2004–2015','essence et CRDi','114–184 ch','Vendu un temps sous le nom ix35 en Europe.'],
      ['TL / NX4','2015–','essence, diesel, hybrides','115–265 ch','La NX4 de 2020 et ses feux diurnes intégrés à la calandre.'],
    ],
    'kia-sportage': [
      ['1re / 2e gén.','1993–2010','essence et CRDi','83–175 ch','Le premier était un vrai 4x4 à châssis séparé.'],
      ['3e / 4e gén.','2010–2021','essence, diesel, hybride léger','114–240 ch','Design signé Peter Schreyer, ancien styliste d\'Audi.'],
      ['5e gén.','2021–','essence, hybride, hybride rechargeable','132–265 ch',''],
    ],
    'volvo-xc90': [
      ['I','2002–2014','5 et 6 cyl., V8 Yamaha','163–315 ch','Premier SUV Volvo. Le V8 4.4 est fourni par Yamaha.'],
      ['II','2014–','4 cyl. suralimentés, T8 hybride rechargeable','190–455 ch','Tous les moteurs sont des 4 cylindres de 2,0 L, une décision radicale pour un SUV de cette taille.'],
    ],
    'volvo-v60': [
      ['I','2010–2018','4 et 5 cyl., D-drive','115–367 ch','La Polestar à 367 ch est développée avec l\'écurie de course maison.'],
      ['II','2018–','4 cyl., T6 et T8 hybrides','150–405 ch','La V60 Cross Country est la version surélevée.'],
    ],
    'landrover-discovery': [
      ['1 / 2','1989–2004','V8 3.5–4.0, Tdi et Td5','111–188 ch','Conçue sur la base du Range Rover pour un positionnement plus accessible.'],
      ['3 / 4','2004–2017','V6 TDV6, V8 essence','190–375 ch','Le système Terrain Response, réglant la transmission selon le type de sol.'],
      ['5','2017–','Ingenium 4 et 6 cyl.','240–360 ch','Passage à la structure monocoque aluminium.'],
    ],
    'landrover-evoque': [
      ['L538','2011–2018','Si4 essence, eD4/TD4 diesel','150–300 ch','Dessiné d\'après le concept LRX. Le cabriolet reste une curiosité.'],
      ['L551','2018–','Ingenium, hybride rechargeable','150–309 ch',''],
    ],
    'jeep-cherokee-xj': [
      ['XJ','1984–2001','4 cyl. et 6 en ligne 4.0','86–193 ch','Première structure monocoque sur un 4x4 : l\'acte de naissance du SUV moderne. Le 4.0 est réputé inusable.'],
    ],
    'lexus-ls400': [
      ['XF10','1989–1994','1UZ-FE 4.0 V8 atmo','245–265 ch','Projet F1 : un milliard de dollars investis pour battre Mercedes. La légendaire publicité aux coupes de champagne empilées sur le capot.'],
    ],
    'lexus-lc500': [
      ['LC','2017–','V8 5.0 atmo / V6 3.5 hybride','359–477 ch','Le concept LF-LC produit quasiment sans modification. L\'un des derniers grands coupés V8 atmosphériques.'],
    ],
    'porsche-macan': [
      ['95B','2014–','4 cyl., V6 biturbo','245–440 ch','Le modèle le plus vendu de Porsche. Le Macan GTS et ses 440 ch.'],
      ['Électrique','2024–','deux moteurs, 800 V','340–639 ch','Plateforme PPE partagée avec Audi.'],
    ],
    'porsche-panamera': [
      ['970','2009–2016','V6, V8, V8 biturbo, hybride, diesel','250–570 ch','Première berline Porsche depuis la 989 abandonnée.'],
      ['971','2016–2023','V6, V8, hybrides rechargeables','330–700 ch','La Turbo S E-Hybrid à 700 ch.'],
      ['972','2023–','V6, V8, hybrides','353–782 ch','La Turbo S E-Hybrid à 782 ch : la Porsche de série la plus puissante après la 918.'],
    ],
    'porsche-taycan': [
      ['J1','2019–','deux moteurs, réseau 800 V','408–761 ch','Première électrique Porsche. Boîte à deux rapports sur l\'essieu arrière, unique dans l\'électrique.'],
      ['J1 restylée','2024–','deux moteurs, 800 V','408–1 108 ch','La Turbo GT à 1 108 ch a repris le record du Nürburgring pour une électrique.'],
    ],
    'tesla-model3': [
      ['Model 3','2017–','un ou deux moteurs','283–513 ch','La voiture électrique la plus vendue au monde pendant plusieurs années.'],
      ['Highland','2023–','un ou deux moteurs','283–460 ch','Restylage : disparition des commodos, tout passe par l\'écran.'],
    ],
    'smart-fortwo': [
      ['W450 / W451','1998–2014','3 cyl. 0.6–1.0 turbo, cdi, électrique','41–102 ch','2,5 m de long. Cellule de sécurité Tridion apparente. La Brabus atteint 102 ch.'],
      ['W453','2014–','3 cyl. 0.9 turbo, EQ électrique','60–109 ch','Développée avec Renault, plateforme partagée avec la Twingo III.'],
    ],
    'dacia-sandero': [
      ['I / II','2007–2020','essence, dCi, GPL','75–110 ch','Régulièrement la voiture la plus vendue aux particuliers en France.'],
      ['III','2020–','TCe, ECO-G GPL','65–110 ch','Plateforme CMF-B, la même que la Clio V.'],
    ],
    'suzuki-vitara': [
      ['1re / 2e gén.','1988–2005','1.6–2.5 essence, V6','75–144 ch','Vrai 4x4 à châssis séparé et boîte de transfert.'],
      ['3e / 4e gén.','2005–','essence, diesel, hybride AllGrip','106–140 ch','Passage au format crossover, transmission AllGrip à quatre modes.'],
    ],
    'mini-classic': [
      ['Mk1 – Mk3','1959–1976','4 cyl. 848–1275 cm³','34–76 ch','Moteur transversal et boîte dans le carter d\'huile : l\'invention d\'Alec Issigonis qui a défini la citadine moderne.'],
      ['Cooper / Cooper S','1961–2000','1.0–1.3','55–78 ch','Trois victoires au rallye de Monte-Carlo, 1964, 1965 et 1967.'],
    ],
    'vw-up': [
      ['up!','2011–2023','3 cyl. 1.0, TSI, e-up!','60–115 ch','La GTI de 2018 reprend délibérément le rapport poids/puissance de la Golf GTI Mk1.'],
    ],
    'citroen-c4': [
      ['I','2004–2010','essence et HDi','75–180 ch','La VTS 2.0 à 180 ch est la version sportive.'],
      ['II / Cactus','2010–2020','THP, BlueHDi','90–165 ch','Le C4 Cactus et ses Airbumps.'],
      ['III / ë-C4','2020–','PureTech, BlueHDi, électrique','100–156 ch','Silhouette de berline surélevée, entre compacte et SUV.'],
    ],
    'seat-ibiza': [
      ['021A / 6K','1984–2002','essence et diesel','45–156 ch','Les premières générations sont dessinées par Giugiaro, avec une mécanique System Porsche.'],
      ['6L / 6J','2002–2017','TSI et TDI','60–192 ch','La Cupra 1.8T à 180 ch, puis la Bocanegra.'],
      ['6F','2017–','TSI et TDI','75–150 ch','Première du groupe sur plateforme MQB A0.'],
    ],


    /* ================= VAGUE 10a — Généralistes européens ==================
       Ici le niveau « génération » suffit. Sur une Qashqai ou une C3, les
       motorisations n'ont pas d'identité propre : personne ne dit « une C3
       1.4 HDi » comme on dit « une S5 V8 ». Détailler serait du bruit.
       Le format court n'est pas un raccourci, c'est le bon niveau de détail.
       ====================================================================== */

    'vw-passat': [
      ['B1 – B4','1973–1996','4 et 5 cyl. essence et diesel','54–174 ch','Dérivée de l\'Audi 80 sur les deux premières générations.'],
      ['B5','1996–2005','4 cyl. 1.8T, V5, V6, TDI','90–275 ch','Plateforme partagée avec l\'A4 B5, moteurs longitudinaux. La W8 de 2001 reste une curiosité.'],
      ['B6 / B7','2005–2015','TSI et TDI','102–300 ch','Retour aux moteurs transversaux. Le CC est la déclinaison coupé 4 portes.'],
      ['B8 / B9','2014–','TSI, TDI, GTE hybride','120–272 ch','La B9 de 2024 n\'existe plus qu\'en break.'],
    ],
    'vw-tiguan': [
      ['I','2007–2016','TSI et TDI','110–210 ch','Le premier SUV compact du groupe sur plateforme Golf.'],
      ['II','2016–2023','TSI, TDI, eHybrid','115–320 ch','La version R à 320 ch reprend le moteur de la Golf R.'],
      ['III','2023–','TSI, eHybrid','130–272 ch',''],
    ],
    'vw-scirocco': [
      ['I','1974–1981','4 cyl. 1.1–1.7','50–110 ch','Dessinée par Giugiaro, sortie avant la Golf dont elle partage la base.'],
      ['II','1981–1992','4 cyl. 1.3–1.8 16v','60–139 ch','La 16S de 1985 est la version recherchée.'],
      ['III','2008–2017','TSI et TDI','122–280 ch','La R à 265–280 ch reprend la mécanique de la Golf R.'],
    ],
    'vw-corrado': [
      ['Corrado','1988–1995','4 cyl. 1.8 G60 compressé, VR6 2.9','136–190 ch','Aileron arrière qui se déploie automatiquement à 120 km/h. Le VR6 est aujourd\'hui le plus coté.'],
    ],
    'audi-a4': [
      ['B5','1994–2001','4 et 6 cyl., TDI','90–265 ch','Première Audi à s\'appeler A4. La S4 B5 et son V6 biturbo lance la lignée sportive.'],
      ['B6 / B7','2000–2008','4, 6 et 8 cyl.','101–420 ch','Le cabriolet remplace le coupé.'],
      ['B8','2007–2015','TFSI et TDI','120–450 ch',''],
      ['B9','2015–','TFSI, TDI, hybridation légère','122–450 ch',''],
    ],
    'audi-a6': [
      ['C4','1994–1997','4, 5 et 6 cyl.','90–290 ch','Anciennement Audi 100. Le S6 Plus à V8 4.2 clôt la génération.'],
      ['C5','1997–2004','4, 6 et 8 cyl., TDI','110–450 ch','Ligne fastback très remarquée à sa sortie.'],
      ['C6 / C7','2004–2018','TFSI, TDI, V10','136–605 ch',''],
      ['C8','2018–','TFSI, TDI, hybridation 48 V','204–630 ch',''],
    ],
    'audi-q5': [
      ['8R','2008–2017','TFSI et TDI','143–354 ch','Le SUV le plus vendu de la marque.'],
      ['FY','2017–','TFSI, TDI, hybride rechargeable','163–367 ch',''],
    ],
    'audi-q7': [
      ['4L','2005–2015','V6 et V8, TDI jusqu\'au V12','233–500 ch','Le V12 TDI de 500 ch et 1 000 Nm : un cas unique dans l\'automobile de série.'],
      ['4M','2015–','V6 TFSI et TDI, hybride','231–507 ch','Structure allégée de plus de 300 kg.'],
    ],
    'audi-a1': [
      ['8X','2010–2018','TFSI et TDI','86–231 ch','La S1 quattro clôt la génération.'],
      ['GB','2018–','TFSI','95–207 ch','Les fentes sur le capot rendent hommage à la Sport quattro.'],
    ],
    'bmw-x3': [
      ['E83','2003–2010','6 cyl. essence et diesel','150–286 ch','Produit par Magna Steyr en Autriche.'],
      ['F25','2010–2017','4 et 6 cyl. turbo','143–381 ch',''],
      ['G01','2017–','4 et 6 cyl., hybride','150–510 ch','La X3 M Competition à 510 ch.'],
    ],
    'bmw-z3': [
      ['E36/7 – E36/8','1995–2002','4 et 6 cyl. atmo','115–325 ch','Première BMW produite aux États-Unis. Le M Coupé, surnommé la « clown shoe », est devenu collector.'],
    ],
    'mercedes-classe-s': [
      ['W126','1979–1991','6 cyl. et V8','156–300 ch','Premier airbag conducteur de série en Europe, en 1981.'],
      ['W140','1991–1998','6 cyl., V8, V12 6.0','204–408 ch','Le V12 M120 : la démesure des années 90. Vitres arrière à fermeture assistée.'],
      ['W220 / W221','1998–2013','V6, V8, V12 biturbo','204–630 ch','Suspension Airmatic puis Active Body Control.'],
      ['W222 / W223','2013–','6 en ligne, V8, V12, hybrides','286–630 ch','La W223 introduit les roues arrière directrices et les airbags arrière.'],
    ],
    'opel-corsa': [
      ['A','1982–1993','4 cyl. 1.0–1.6','45–100 ch','La GSi 1.6 est la version sportive.'],
      ['B','1993–2000','4 cyl.','45–109 ch',''],
      ['C / D','2000–2014','essence et CDTi','60–210 ch','La OPC de la génération D atteint 192 ch, puis 210 ch en Nürburgring Edition.'],
      ['E / F','2014–','essence, diesel, électrique','75–156 ch','La génération F passe sur plateforme Stellantis, jumelle de la Peugeot 208.'],
    ],
    'opel-kadett-gsi': [
      ['E GSi','1984–1991','4 cyl. 1.8–2.0, 8v et 16v','115–156 ch','La 2.0 16v de 1988 : 156 ch et 220 km/h, une des compactes les plus rapides de son temps.'],
    ],
    'opel-manta': [
      ['A','1970–1975','4 cyl. 1.2–1.9','60–105 ch','Coupé dérivé de l\'Ascona.'],
      ['B / 400','1975–1988','4 cyl. 1.3–2.4','60–144 ch','La Manta 400, homologuée Groupe B, développait plus de 275 ch en configuration rallye.'],
    ],
    'ford-focus': [
      ['Mk1','1998–2004','4 cyl. Zetec et TDdi','75–215 ch','Design « New Edge » et suspension arrière Control Blade : le meilleur châssis du segment.'],
      ['Mk2','2004–2011','4 cyl., 5 cyl. sur ST/RS','80–305 ch','Le 5 cylindres d\'origine Volvo pour les ST et RS.'],
      ['Mk3','2011–2018','EcoBoost et TDCi','85–350 ch',''],
      ['Mk4','2018–','EcoBoost 3 cyl., EcoBlue','100–280 ch','La ST reçoit un 2.3 EcoBoost de 280 ch.'],
    ],
    'ford-fiesta': [
      ['Mk1 – Mk3','1976–1995','4 cyl. 0.9–1.8','40–133 ch','La XR2i et la RS Turbo sont les versions chaudes de l\'époque.'],
      ['Mk4 – Mk6','1995–2008','Zetec et TDCi','50–150 ch',''],
      ['Mk7 / Mk8','2008–2023','EcoBoost 1.0–1.6','60–200 ch','Le 1.0 EcoBoost a été élu moteur international de l\'année trois fois de suite.'],
    ],
    'fiat-punto': [
      ['I','1993–1999','4 cyl. 1.1–1.6, TD','54–136 ch','Voiture de l\'Année 1995. La GT Turbo à 136 ch est la version recherchée.'],
      ['II','1999–2010','4 cyl., JTD','60–130 ch','La HGT 1.8 16v et ses 130 ch.'],
      ['Grande Punto / Evo','2005–2018','essence et MultiJet','65–180 ch','La Abarth Grande Punto SuperSport monte à 180 ch.'],
    ],
    'fiat-500': [
      ['500 (2007)','2007–','1.2, TwinAir 0.9, MultiJet','69–105 ch','Voiture de l\'Année 2008. Le bicylindre TwinAir est un clin d\'œil direct à la 500 d\'origine.'],
      ['500e','2020–','électrique','95–118 ch','Plateforme entièrement nouvelle, sans version thermique.'],
    ],
    'citroen-c3': [
      ['I','2002–2009','essence et HDi','60–110 ch','La Pluriel et ses cinq configurations de toit.'],
      ['II / III','2009–2024','VTi, PureTech, BlueHDi','68–110 ch','La III inaugure les Airbumps latéraux.'],
      ['IV','2024–','PureTech, hybride, ë-C3','83–113 ch','Conçue pour concurrencer les citadines électriques chinoises sur le prix.'],
    ],
    'citroen-c5': [
      ['I / II','2001–2017','essence, HDi, V6','110–240 ch','Dernières Citroën à suspension hydropneumatique Hydractive III+.'],
      ['C5 X','2021–','PureTech, hybride rechargeable','130–225 ch','Suspension à butées hydrauliques progressives, héritière assumée de l\'hydropneumatique.'],
    ],
    'peugeot-307': [
      ['307','2001–2008','essence et HDi','75–180 ch','Voiture de l\'Année 2002. Le CC à toit rigide escamotable a été un grand succès.'],
    ],
    'peugeot-3008': [
      ['I','2008–2016','THP et HDi, HYbrid4','110–200 ch','Le HYbrid4 de 2011 : premier diesel hybride rechargeable au monde.'],
      ['II','2016–2023','PureTech, BlueHDi, hybride','110–300 ch','Voiture de l\'Année 2017. i-Cockpit avec instrumentation surélevée.'],
      ['III','2023–','hybride, e-3008','136–320 ch','Silhouette de SUV coupé, plateforme STLA Medium.'],
    ],
    'renault-laguna': [
      ['I','1993–2000','essence et dCi, V6','75–190 ch',''],
      ['II','2000–2007','essence, dCi, V6 3.0','100–210 ch','Première voiture à obtenir cinq étoiles EuroNCAP, en 2001. Carte mains libres, une nouveauté.'],
      ['III','2007–2015','TCe et dCi','110–240 ch','Le coupé GT et ses roues arrière directrices 4Control.'],
    ],
    'renault-scenic': [
      ['I','1996–2003','essence et dCi','75–140 ch','Voiture de l\'Année 1997. Invente le monospace compact.'],
      ['II / III','2003–2016','essence, dCi','100–180 ch','La version RX4 à quatre roues motrices est aujourd\'hui rare.'],
      ['IV / E-Tech','2016–','TCe, dCi, électrique','115–220 ch','Le Scénic E-Tech de 2024 est Voiture de l\'Année 2024.'],
    ],


    /* ================= VAGUE 9b — Rallye, GT et disciplines à part ========== */

    'audi-s1-e2': [
      { c:'Groupe B', a:'1985–1986', m:[
        ['Sport quattro S1 E2','5 en ligne 2.1 turbo','environ 500 ch','intégrale · manuelle 6','Audi n\'a jamais communiqué la puissance réelle. Ailerons démesurés à l\'avant comme à l\'arrière.'],
        ['Pikes Peak (1987)','5 en ligne 2.1 turbo','environ 600 ch','intégrale · manuelle 6','Victoire de Walter Röhrl à Pikes Peak en 1987, sur une route encore en terre.'],
      ]},
    ],
    'peugeot-205-t16': [
      { c:'Evolution 1', a:'1984–1985', m:[
        ['205 T16 E1','4 cyl. 1.8 turbo, moteur central transversal','environ 350 ch','intégrale · manuelle 5','Titre mondial 1985 avec Timo Salonen.'],
      ]},
      { c:'Evolution 2', a:'1985–1986', m:[
        ['205 T16 E2','4 cyl. 1.8 turbo','environ 500 ch','intégrale · manuelle 5','Aileron biplan géant. Second titre en 1986 avec Juha Kankkunen, avant l\'interdiction du Groupe B.'],
        ['Grand Raid / Pikes Peak','4 cyl. 1.8 turbo','environ 600 ch','intégrale · manuelle 5','Victoires au Paris-Dakar 1987 et 1988, puis à Pikes Peak 1988 avec Ari Vatanen.'],
      ]},
    ],
    'lancia-delta-s4': [
      { c:'Groupe B', a:'1985–1986', m:[
        ['Delta S4 Corsa','4 cyl. 1.8 turbo ET compresseur volumétrique','environ 480 ch','intégrale · manuelle 5','Suralimentation combinée : le compresseur agit à bas régime, le turbo prend le relais. Aucun temps de réponse, à une époque où c\'était le défaut majeur.'],
      ]},
    ],
    'ford-rs200': [
      { c:'Groupe B', a:'1984–1986', m:[
        ['RS200 Evolution','BDT-E 2.1 turbo, moteur central','environ 600 ch','intégrale · manuelle 5','Carrosserie composite dessinée par Ghia. Le programme s\'arrête après l\'accident du Portugal 1986.'],
      ]},
    ],
    'mg-metro-6r4': [
      { c:'Groupe B', a:'1985–1986', m:[
        ['Metro 6R4 International','V6 3.0 atmosphérique, moteur central','environ 410 ch','intégrale · manuelle 5','La seule Groupe B atmosphérique : réponse instantanée, mais moins de puissance de pointe. Son V6 a ensuite donné naissance au moteur de la Jaguar XJ220.'],
      ]},
    ],
    'peugeot-405-t16-pp': [
      { c:'Pikes Peak', a:'1988–1989', m:[
        ['405 T16 Pikes Peak','4 cyl. 1.9 turbo','environ 600 ch','intégrale, quatre roues directrices · manuelle 6','Victoire d\'Ari Vatanen en 1988, immortalisée par le film Climb Dance. Record de la montée en 1989 avec Robby Unser.'],
      ]},
    ],
    'citroen-xsara-wrc': [
      { c:'WRC', a:'2001–2006', m:[
        ['Xsara WRC','4 cyl. 2.0 turbo à bride','300 ch','intégrale, trois différentiels actifs · séquentielle 6','Trois titres constructeurs et les trois premiers titres pilotes de Sébastien Loeb.'],
      ]},
    ],
    'peugeot-206-wrc': [
      { c:'WRC', a:'1999–2003', m:[
        ['206 WRC','4 cyl. 2.0 turbo à bride','300 ch','intégrale · séquentielle 6','Empattement allongé par rapport à la 206 de série. Trois titres constructeurs consécutifs, de 2000 à 2002.'],
      ]},
    ],
    'subaru-impreza-wrc': [
      { c:'GC8 WRC', a:'1997–2000', m:[
        ['Impreza WRC97 – WRC99','EJ20 flat-4 2.0 turbo à bride','300 ch','intégrale · séquentielle 6','Livrée bleue et or 555. Titre pilotes de Colin McRae en 1995, puis de Richard Burns en 2001.'],
      ]},
      { c:'S9 – S14 WRC', a:'2001–2008', m:[
        ['Impreza WRC (berline puis hayon)','EJ20 flat-4 2.0 turbo','300 ch','intégrale · séquentielle 6','Petter Solberg champion du monde 2003. Subaru se retire fin 2008.'],
      ]},
    ],
    'toyota-gr-yaris-rally1': [
      { c:'Rally1', a:'2022–', m:[
        ['GR Yaris Rally1 Hybrid','3 cyl. 1.6 turbo + moteur électrique 100 kW','environ 500 ch cumulés','intégrale · séquentielle 5','Structure tubulaire, plus de différentiel central actif. Titres constructeurs et pilotes dès la première saison hybride.'],
      ]},
    ],
    'porsche-911-cup': [
      { c:'996 / 997 Cup', a:'1998–2012', m:[
        ['911 GT3 Cup','flat-6 3.6–3.8 atmo','380–450 ch','propulsion · séquentielle 6','Monotype de la Carrera Cup et de la Supercup.'],
      ]},
      { c:'991 / 992 Cup', a:'2013–', m:[
        ['911 GT3 Cup','flat-6 3.8–4.0 atmo','460–510 ch','propulsion · séquentielle 6','La 992 Cup fonctionne aux carburants de synthèse. La voiture de course la plus produite au monde : plus de 5 000 exemplaires.'],
      ]},
    ],
    'porsche-911-rsr': [
      { c:'991 RSR', a:'2017–2022', m:[
        ['911 RSR','flat-6 4.0–4.2 atmo, en position CENTRALE','510–515 ch','propulsion · séquentielle 6','La seule 911 de l\'histoire à moteur central-arrière : la boîte est passée derrière l\'essieu pour libérer de la place au diffuseur.'],
      ]},
    ],
    'ferrari-488-challenge': [
      { c:'Challenge', a:'2017–2022', m:[
        ['488 Challenge','V8 3.9 biturbo','670 ch','propulsion · DCT 7','Monotype du Ferrari Challenge. 130 kg de moins que la GTB de route, aéro et slicks dédiés.'],
        ['488 Challenge Evo','V8 3.9 biturbo','670 ch','propulsion · DCT 7','Aérodynamique revue, appui en forte hausse.'],
      ]},
    ],
    'ferrari-296-gt3': [
      { c:'GT3', a:'2023–', m:[
        ['296 GT3','V6 3.0 biturbo, sans hybridation','environ 600 ch (selon Balance of Performance)','propulsion · séquentielle 6','Développée avec Oreca. Victoire aux 24 Heures de Spa dès sa première année.'],
      ]},
    ],
    'lambo-huracan-gt3': [
      { c:'GT3 / Evo / Evo2', a:'2015–', m:[
        ['Huracán GT3','V10 5.2 atmo','environ 550 ch (BoP)','propulsion · séquentielle 6','Trois victoires aux 24 Heures de Daytona. Le V10 atmosphérique est réputé pour sa fiabilité en endurance.'],
      ]},
    ],
    'mercedes-amg-gt3': [
      { c:'GT3 / Evo', a:'2015–', m:[
        ['AMG GT3','V8 6.3 atmosphérique (M159)','environ 550 ch (BoP)','propulsion transaxle · séquentielle 6','AMG conserve le gros V8 atmo en course alors que la route est passée au 4.0 biturbo. Le chouchou des écuries clientes.'],
      ]},
    ],
    'bmw-m4-gt3': [
      { c:'GT3', a:'2022–', m:[
        ['M4 GT3','P58 3.0 · 6 en ligne biturbo','environ 590 ch (BoP)','propulsion · séquentielle 6','Remplace la M6 GT3. Victoire aux 24 Heures de Daytona et au Nürburgring.'],
      ]},
    ],
    'aston-vantage-gt3': [
      { c:'GT3', a:'2018–', m:[
        ['Vantage GT3 / GT3 Evo','V8 4.0 biturbo AMG','environ 550 ch (BoP)','propulsion · séquentielle 6','Engagée en GT World Challenge et en endurance. La version GT4 partage la même base.'],
      ]},
    ],
    'corvette-c8r': [
      { c:'C8.R', a:'2020–', m:[
        ['Corvette C8.R','V8 5.5 atmo à vilebrequin plat','environ 500 ch (BoP)','moteur central · séquentielle 6','Première Corvette d\'usine à moteur central en course. Titres IMSA GTLM et GTD Pro.'],
      ]},
    ],
    'alpine-a110-cup': [
      { c:'Cup / GT4', a:'2018–', m:[
        ['A110 Cup','4 cyl. 1.8 turbo','270 ch','propulsion · DCT 7','Monotype de l\'Alpine Elf Cup. Environ 1 050 kg.'],
        ['A110 GT4','4 cyl. 1.8 turbo','300 ch','propulsion · DCT 7','Homologuée pour le championnat GT4 européen.'],
      ]},
    ],
    'alpine-a424': [
      { c:'Hypercar', a:'2024–', m:[
        ['A424','V6 3.4 turbo (base Mecachrome) + hybride','680 ch (régulés)','intégrale hybride · séquentielle 7','Châssis Oreca. Le retour d\'Alpine au sommet de l\'endurance mondiale.'],
      ]},
    ],
    'cadillac-vseries-r': [
      { c:'LMDh', a:'2023–', m:[
        ['V-Series.R','V8 5.5 atmo + hybride','680 ch (régulés)','propulsion · séquentielle 7','Le seul V8 atmosphérique de la catégorie Hypercar : elle s\'entend arriver de plusieurs virages.'],
      ]},
    ],
    'toyota-gr010': [
      { c:'Hypercar', a:'2021–', m:[
        ['GR010 Hybrid','V6 3.5 biturbo + hybride avant','680 ch (régulés)','intégrale hybride · séquentielle 7','Victoires au Mans 2021 et 2022, prolongeant la série entamée avec la TS050.'],
      ]},
    ],
    'dallara-ir18': [
      { c:'IR-18', a:'2018–', m:[
        ['IndyCar','V6 2.2 biturbo (Honda ou Chevrolet)','environ 700 ch','propulsion · séquentielle 6','Châssis unique pour tout le plateau. Halo Aeroscreen depuis 2020. Plus de 380 km/h sur ovale.'],
      ]},
    ],
    'nhra-topfuel': [
      { c:'Top Fuel', a:'1960s–', m:[
        ['Dragster','V8 8.2 à compresseur, nitrométhane','environ 11 000 ch','propulsion · transmission directe à embrayage progressif','0 à 160 km/h en moins d\'une seconde. Plus de 530 km/h sur 300 mètres. Le moteur est intégralement reconstruit entre chaque passage.'],
      ]},
    ],
    'woo-sprintcar': [
      { c:'Sprint Car 410', a:'1978–', m:[
        ['410 ci','V8 6.7 atmo, méthanol','environ 900 ch','propulsion · prise directe, sans boîte ni démarreur','Environ 640 kg avec le pilote. Ailerons géants réglables en course, sur ovale en terre.'],
      ]},
    ],
    'usac-midget': [
      { c:'Midget', a:'1935–', m:[
        ['Midget','4 cyl. 2.4 atmo de course','environ 350–400 ch','propulsion · prise directe','Environ 450 kg. L\'école de tous les grands pilotes américains, de Foyt à Larson.'],
      ]},
    ],
    'radical-sr3': [
      { c:'SR3', a:'2001–', m:[
        ['SR3 RS / XX','4 cyl. d\'origine motocycliste, 1.3–1.5','226–232 ch','propulsion · séquentielle 6','Moins de 600 kg, rupteur au-delà de 10 000 tr/min. Détentrice pendant des années du record du Nürburgring pour une voiture homologuée route.'],
      ]},
    ],
    'renault-espace-f1': [
      { c:'Prototype unique', a:'1994', m:[
        ['Espace F1','RS5 3.5 V10 de Formule 1','800 ch','propulsion · séquentielle 6','Concept resté unique, jamais commercialisé. Monospace à châssis carbone et V10 de Williams-Renault : 0 à 100 km/h en 2,8 s, 312 km/h.'],
      ]},
    ],


    /* ================= VAGUE 9a — Formule 1 et endurance ===================
       Pour la course, le niveau « motorisation » n'a pas de sens commercial :
       une monoplace n'a pas de finitions. Le même format sert donc à décrire
       les ÉVOLUTIONS et les SAISONS, avec le palmarès en note. Le schéma de
       données ne change pas — seule sa lecture s'adapte au domaine.
       ====================================================================== */

    'mclaren-mp44': [
      { c:'MP4/4', a:'1988', m:[
        ['Châssis 1988','Honda RA168E 1.5 V6 turbo','650 ch en course, plus de 900 en qualification','propulsion · manuelle 6','15 victoires en 16 Grands Prix avec Senna et Prost. Le taux de réussite le plus élevé de l\'histoire de la F1.'],
      ]},
    ],
    'ferrari-f2004': [
      { c:'F2004', a:'2004', m:[
        ['Châssis 655','Ferrari 053 3.0 V10 atmo','865 ch à 18 300 tr/min','propulsion · séquentielle 7','15 victoires sur 18 courses. Michael Schumacher, septième titre. Plusieurs de ses records de piste ont tenu plus de quinze ans.'],
      ]},
    ],
    'ferrari-312t': [
      { c:'312T – 312T5', a:'1975–1980', m:[
        ['312T / T2','Ferrari 015 3.0 flat-12 atmo','500 ch','propulsion · boîte transversale 5','La boîte transversale, d\'où le T. Titres pilotes Lauda 1975 et 1977, Scheckter 1979.'],
      ]},
    ],
    'williams-fw14b': [
      { c:'FW14B', a:'1992', m:[
        ['Châssis 1992','Renault RS3C/RS4 3.5 V10 atmo','760 ch','propulsion · semi-automatique 6','Suspension active, antipatinage, contrôle de la garde au sol. Nigel Mansell : 9 victoires, titre acquis en août.'],
      ]},
    ],
    'lotus-72': [
      { c:'72 – 72E', a:'1970–1975', m:[
        ['Châssis 72','Ford Cosworth DFV 3.0 V8 atmo','440–465 ch','propulsion · manuelle 5','Radiateurs latéraux, freins inboard, forme en coin : elle a défini l\'architecture de la F1 moderne. Titres Rindt 1970 et Fittipaldi 1972.'],
      ]},
    ],
    'lotus-79': [
      { c:'79', a:'1978–1979', m:[
        ['Châssis 79','Ford Cosworth DFV 3.0 V8','480 ch','propulsion · manuelle 5','Première F1 à exploiter pleinement l\'effet de sol. Mario Andretti champion 1978 : la voiture semblait aspirée par la piste.'],
      ]},
    ],
    'tyrrell-p34': [
      { c:'P34', a:'1976–1977', m:[
        ['Six roues','Ford Cosworth DFV 3.0 V8','465 ch','propulsion · manuelle 5','Quatre petites roues à l\'avant pour réduire la traînée. Doublé au Grand Prix de Suède 1976 : la seule F1 à six roues victorieuse.'],
      ]},
    ],
    'brabham-bt46b': [
      { c:'BT46B', a:'1978', m:[
        ['« Fan car »','Alfa Romeo 115-12 3.0 flat-12','520 ch','propulsion · manuelle 6','Un ventilateur aspirait l\'air sous la voiture, officiellement pour le refroidissement. Victoire écrasante en Suède, puis retrait volontaire par Bernie Ecclestone avant interdiction.'],
      ]},
    ],
    'redbull-rb19': [
      { c:'RB19', a:'2023', m:[
        ['Châssis 2023','Honda RBPT 1.6 V6 turbo hybride','environ 1 000 ch cumulés','propulsion · séquentielle 8','21 victoires en 22 Grands Prix. Verstappen en remporte 19 : la saison la plus dominée de l\'histoire.'],
      ]},
    ],
    'mercedes-w11': [
      { c:'W11', a:'2020', m:[
        ['Châssis 2020','Mercedes M11 EQ Performance 1.6 V6 turbo hybride','environ 1 000 ch','propulsion · séquentielle 8','Direction à géométrie variable DAS, interdite dès l\'année suivante. Pole de Monza 2020 à 264,362 km/h de moyenne : la plus rapide de l\'histoire.'],
      ]},
    ],
    'renault-r25': [
      { c:'R25', a:'2005', m:[
        ['Châssis 2005','Renault RS25 3.0 V10 atmo','900 ch','propulsion · séquentielle 7','Premier titre mondial de Fernando Alonso, et premier doublé pilotes-constructeurs pour Renault.'],
      ]},
    ],
    'brawn-bgp001': [
      { c:'BGP 001', a:'2009', m:[
        ['Châssis 2009','Mercedes FO 108W 2.4 V8 atmo','750 ch','propulsion · séquentielle 7','Écurie rachetée pour une livre symbolique après le retrait de Honda. Double diffuseur controversé. Championne du monde la même année avec Jenson Button.'],
      ]},
    ],

    'porsche-917': [
      { c:'917 K / LH', a:'1969–1971', m:[
        ['917 K','flat-12 4.5–5.0 atmo','580–630 ch','propulsion · manuelle 5','Première victoire Porsche au général au Mans, en 1970. Châssis tubulaire de 42 kg.'],
        ['917 LH','flat-12 4.9 atmo','600 ch','propulsion · manuelle 5','Version longue queue : 386 km/h dans les Hunaudières en 1971, un record resté vingt-sept ans.'],
      ]},
      { c:'917/30 Can-Am', a:'1972–1973', m:[
        ['917/30','flat-12 5.4 biturbo','1 100–1 580 ch','propulsion · manuelle 4','La voiture de course en circuit la plus puissante jamais construite. Elle a tué le championnat Can-Am par sa domination.'],
      ]},
    ],
    'porsche-956-962': [
      { c:'956', a:'1982–1985', m:[
        ['956','flat-6 2.65 biturbo','620–650 ch','propulsion · manuelle 5','Premier châssis monocoque aluminium et à effet de sol de Porsche. Podium intégral au Mans 1982. Record du Nürburgring de Bellof en 6:11, resté trente-cinq ans.'],
      ]},
      { c:'962 / 962C', a:'1984–1991', m:[
        ['962C','flat-6 2.8–3.0 biturbo','630–700 ch','propulsion · manuelle 5','Pédalier reculé derrière l\'axe des roues avant pour la sécurité. Victoires au Mans 1986 et 1987.'],
      ]},
    ],
    'porsche-919': [
      { c:'919 Hybrid', a:'2014–2017', m:[
        ['919 Hybrid','V4 2.0 turbo + récupération cinétique et thermique','environ 900 ch cumulés','intégrale hybride · séquentielle 7','Trois victoires consécutives au Mans, 2015 à 2017. Réseau 800 V, une première en compétition.'],
        ['919 Evo','V4 2.0 turbo hybride','1 160 ch','intégrale · séquentielle 7','Libérée des règlements : 5:19 au Nürburgring en 2018, record absolu toutes catégories.'],
      ]},
    ],
    'porsche-963': [
      { c:'963 LMDh', a:'2023–', m:[
        ['963','V8 4.6 biturbo (base 918) + hybride','680 ch (régulés)','propulsion · séquentielle 7','Châssis Multimatic commun à la catégorie LMDh. Éligible simultanément au Mans et en IMSA.'],
      ]},
    ],
    'porsche-935': [
      { c:'935 / 935-78', a:'1976–1981', m:[
        ['935','flat-6 2.85–3.2 biturbo','590–750 ch','propulsion · manuelle 4','Championne du monde des marques quatre années de suite. Victoire au général au Mans 1979 — pour une voiture de catégorie GT.'],
        ['935/78 « Moby Dick »','flat-6 3.2 biturbo refroidi par eau','845 ch','propulsion · manuelle 4','Longue queue et plancher abaissé, exploitant chaque faille du règlement. 366 km/h aux Hunaudières.'],
      ]},
    ],
    'audi-r18': [
      { c:'R18', a:'2011–2016', m:[
        ['R18 TDI / ultra','V6 3.7 turbodiesel','490–540 ch','propulsion · séquentielle 6','Premier prototype fermé d\'Audi depuis 1999.'],
        ['R18 e-tron quattro','V6 4.0 puis 3.7 TDI + volant d\'inertie','environ 510 ch + 170 kW','intégrale hybride par l\'avant · séquentielle 6','Stockage d\'énergie par volant d\'inertie, et non par batterie. Victoires au Mans 2012, 2013 et 2014.'],
      ]},
    ],
    'audi-r10-tdi': [
      { c:'R10 TDI', a:'2006–2008', m:[
        ['R10 TDI','V12 5.5 biturbodiesel','650 ch, plus de 1 100 Nm','propulsion · séquentielle 5','Premier diesel vainqueur des 24 Heures du Mans, en 2006. Si silencieuse que les commissaires ne l\'entendaient pas arriver.'],
      ]},
    ],
    'toyota-ts050': [
      { c:'TS050 Hybrid', a:'2016–2020', m:[
        ['TS050','V6 2.4 biturbo + deux moteurs électriques','environ 1 000 ch cumulés','intégrale hybride · séquentielle 7','Première victoire de Toyota au Mans en 2018, après dix-neuf tentatives. Le passage du atmosphérique au turbo date de 2016.'],
      ]},
    ],
    'toyota-gt-one': [
      { c:'TS020', a:'1998–1999', m:[
        ['GT-One','V8 3.6 biturbo','600 ch','propulsion · séquentielle 6','Homologuée en GT1 grâce à un « coffre » réglementaire qui était en réalité le réservoir. Pole position au Mans 1999.'],
      ]},
    ],
    'ferrari-330p4': [
      { c:'330 P4', a:'1967', m:[
        ['330 P4','V12 4.0 atmo, trois soupapes par cylindre','450 ch','propulsion · manuelle 5','Triplé aux 24 Heures de Daytona 1967, en réponse au triplé Ford du Mans 1966. Quatre exemplaires construits.'],
      ]},
    ],
    'ferrari-499p': [
      { c:'499P', a:'2023–', m:[
        ['499P','V6 3.0 biturbo (base 296) + hybride','680 ch (régulés)','intégrale hybride par l\'avant · séquentielle 7','Victoire au Mans dès son retour en 2023, cinquante ans après le dernier prototype d\'usine Ferrari. Doublé en 2024.'],
      ]},
    ],
    'mazda-787b': [
      { c:'787B', a:'1990–1991', m:[
        ['787B','R26B quadrirotor 2.6 atmo','700 ch','propulsion · manuelle 5','9 000 tr/min. Seule victoire d\'un moteur rotatif et seule victoire japonaise au Mans avant 2018. Le rotatif fut interdit dès l\'année suivante.'],
      ]},
    ],
    'peugeot-905': [
      { c:'905 / 905 Evo 1 Bis', a:'1990–1993', m:[
        ['905','SA35 3.5 V10 atmo','650 ch','propulsion · manuelle 6','Moteur dérivé de la F1. Doublé au Mans 1992, triplé en 1993.'],
      ]},
    ],
    'peugeot-908': [
      { c:'908 HDi FAP', a:'2007–2011', m:[
        ['908 HDi FAP','V12 5.5 biturbodiesel','700 ch, 1 200 Nm','propulsion · séquentielle 6','Victoire au Mans 2009, mettant fin à la série d\'Audi. Filtre à particules imposé par le règlement.'],
      ]},
    ],
    'peugeot-9x8': [
      { c:'9X8', a:'2022–', m:[
        ['9X8 (sans aileron)','V6 2.6 biturbo + hybride avant','680 ch (régulés)','intégrale hybride · séquentielle 7','Pari aérodynamique radical : aucun aileron arrière, l\'appui venant du fond plat. Un aileron a finalement été ajouté en 2024.'],
      ]},
    ],
    'jaguar-xjr9': [
      { c:'XJR-9', a:'1988', m:[
        ['XJR-9LM','V12 7.0 atmo','750 ch','propulsion · manuelle 5','Préparée par Tom Walkinshaw Racing. Victoire au Mans 1988, brisant sept ans de règne Porsche.'],
      ]},
    ],
    'matra-ms670': [
      { c:'MS670 – MS670C', a:'1972–1974', m:[
        ['MS670','MS12 3.0 V12 atmo','450–500 ch','propulsion · manuelle 5','Trois victoires consécutives au Mans, 1972 à 1974. Le hurlement de V12 le plus célèbre de l\'automobile française.'],
      ]},
    ],
    'alpine-a442': [
      { c:'A442B', a:'1976–1978', m:[
        ['A442B','V6 PRV 2.0 turbo','500 ch','propulsion · manuelle 5','Victoire au Mans 1978, objectif national fixé par Renault. Bulle en polycarbonate ajoutée pour la vitesse de pointe.'],
      ]},
    ],
    'bentley-speed8': [
      { c:'Speed 8', a:'2001–2003', m:[
        ['Speed 8','V8 4.0 biturbo (base Audi)','615 ch','propulsion · séquentielle 6','Victoire au Mans 2003, soixante-treize ans après la dernière. Développée avec les ingénieurs d\'Audi Sport.'],
      ]},
    ],
    'mclaren-f1-gtr': [
      { c:'F1 GTR', a:'1995–1997', m:[
        ['F1 GTR (1995)','V12 BMW 6.1 atmo, bridé','600 ch','propulsion · manuelle 6','Victoire au Mans 1995 dès sa première participation, sous la pluie, face aux prototypes. Quatre F1 GTR dans les cinq premiers.'],
        ['F1 GTR Longtail','V12 BMW 6.0 atmo','600 ch','propulsion · séquentielle 6','Carrosserie allongée et allégée pour 1997. Dix exemplaires.'],
      ]},
    ],
    'nissan-r390': [
      { c:'R390 GT1', a:'1997–1998', m:[
        ['R390 GT1','VRH35L 3.5 V8 biturbo','650 ch','propulsion · séquentielle 6','Troisième au Mans 1998. Un seul exemplaire route construit pour l\'homologation ; il n\'a jamais été vendu.'],
      ]},
    ],
    'shelby-daytona-coupe': [
      { c:'Daytona Coupé', a:'1964–1965', m:[
        ['Daytona','V8 4.7 atmo','385–390 ch','propulsion · manuelle 4','Six exemplaires. Premier titre mondial GT remporté par un constructeur américain, en 1965, face à Ferrari.'],
      ]},
    ],


    /* ================= VAGUE 8 — Hypercars et préparateurs ================= */

    'bugatti-chiron': [
      { c:'Chiron', a:'2016–2022', m:[
        ['Chiron','W16 8.0 quadriturbo','1 500 ch','intégrale · DSG 7','Turbos séquentiels par paires. Le radiateur fait circuler 800 litres d\'eau par minute à pleine charge.'],
        ['Super Sport 300+','W16 8.0 quadriturbo','1 600 ch','intégrale · DSG 7','490,484 km/h en 2019 à Ehra-Lessien : première voiture à dépasser 300 mph.'],
        ['Pur Sport','W16 8.0 quadriturbo','1 500 ch','intégrale · DSG 7','Rapports raccourcis, 50 kg de moins, aileron fixe. Orientée agilité plutôt que vitesse de pointe.'],
      ]},
    ],
    'koenigsegg-agera-rs': [
      { c:'Agera', a:'2011–2018', m:[
        ['Agera / S / R','V8 5.0 biturbo','940–1 140 ch','propulsion · boîte robotisée 7','Toit amovible rangeable sous le capot avant. Jantes creuses en carbone monobloc.'],
        ['Agera RS','V8 5.0 biturbo (E85)','1 160–1 360 ch','propulsion · robotisée 7','447,19 km/h de moyenne sur route fermée dans le Nevada en 2017 : record du monde pour une voiture de série.'],
        ['One:1','V8 5.0 biturbo','1 360 ch','propulsion · robotisée 7','1 360 ch pour 1 360 kg : la première « megacar » à un cheval par kilo. 6 exemplaires.'],
      ]},
    ],
    'koenigsegg-jesko': [
      { c:'Jesko', a:'2019–', m:[
        ['Jesko Attack','V8 5.0 biturbo','1 280 ch (essence) / 1 600 ch (E85)','propulsion · LST 9 à embrayages multiples','Boîte Light Speed Transmission : neuf rapports, passage direct vers n\'importe quel rapport sans transiter par les autres.'],
        ['Jesko Absolut','V8 5.0 biturbo','1 600 ch (E85)','propulsion · LST 9','Aileron supprimé, Cx de 0,278. Conçue pour la vitesse pure.'],
      ]},
    ],
    'koenigsegg-regera': [
      { c:'Regera', a:'2016–2022', m:[
        ['Regera','V8 5.0 biturbo + trois moteurs électriques','1 500 ch cumulés','propulsion · Direct Drive, sans boîte','Transmission directe sans boîte de vitesses : un seul rapport, du démarrage à 400 km/h. 80 exemplaires.'],
      ]},
    ],
    'pagani-zonda': [
      { c:'C12', a:'1999–2005', m:[
        ['C12 / C12-S','V12 AMG 6.0–7.0 atmo','394–555 ch','moteur central · manuelle 6','Chaque pièce visible est signée et numérotée. Horacio Pagani vient de la fibre de carbone chez Lamborghini.'],
      ]},
      { c:'F / R / Cinque', a:'2005–2019', m:[
        ['Zonda F','V12 AMG 7.3 atmo','602–650 ch','moteur central · manuelle 6','Hommage à Juan Manuel Fangio. Quatre sorties d\'échappement centrales en titane.'],
        ['Cinque / Tricolore','V12 AMG 7.3 atmo','678 ch','moteur central · robotisée 6','Carbo-titane : fibre de carbone tissée avec du titane, un matériau développé par Pagani.'],
        ['Zonda R','V12 AMG 6.0 atmo','750 ch','moteur central · boîte à crabots 6','Réservée à la piste. A tourné au Nürburgring en 6:47 en 2010.'],
      ]},
    ],
    'pagani-huayra': [
      { c:'Huayra', a:'2011–2018', m:[
        ['Huayra','V12 AMG 6.0 biturbo','730 ch','moteur central · robotisée 7','Quatre volets aérodynamiques indépendants aux quatre coins, pilotés en permanence.'],
        ['BC','V12 AMG 6.0 biturbo','750–802 ch','moteur central · robotisée 7','132 kg de moins. Nommée d\'après Benny Caiola, premier client de Pagani.'],
      ]},
      { c:'Roadster / R', a:'2017–', m:[
        ['Roadster BC','V12 AMG 6.0 biturbo','802 ch','moteur central · robotisée 7','Plus rigide que le coupé, un exploit rarement atteint.'],
        ['Huayra R','V12 6.0 atmo maison','850 ch','moteur central · boîte à crabots 6','9 000 tr/min, moteur conçu par Pagani et HWA. Réservée à la piste.'],
      ]},
    ],
    'rimac-nevera': [
      { c:'Nevera', a:'2021–', m:[
        ['Nevera','quatre moteurs électriques, un par roue','1 914 ch','intégrale à vectorisation intégrale','0 à 100 km/h en 1,81 s. Détient plus de vingt records d\'accélération, dont le 400 m en 8,25 s.'],
        ['Nevera R','quatre moteurs électriques','2 107 ch','intégrale','431,45 km/h en 2025 : record de vitesse pour une voiture électrique.'],
      ]},
    ],
    'mclaren-p1': [
      { c:'P1', a:'2013–2015', m:[
        ['P1','V8 3.8 biturbo + moteur électrique','916 ch cumulés','propulsion · DCT 7','375 exemplaires. Aileron mobile de 300 mm de débattement, mode DRS emprunté à la F1.'],
        ['P1 GTR','V8 3.8 biturbo hybride','1 000 ch','propulsion · DCT 7','58 exemplaires, réservés à la piste, avec programme de pilotage inclus.'],
      ]},
    ],
    'ferrari-laferrari': [
      { c:'LaFerrari', a:'2013–2018', m:[
        ['LaFerrari','V12 6.3 atmo + HY-KERS','963 ch cumulés','moteur central · DCT 7','499 exemplaires, vendus sur invitation uniquement. Le V12 monte à 9 250 tr/min.'],
        ['Aperta','V12 6.3 atmo hybride','963 ch','moteur central · DCT 7','210 exemplaires. Châssis renforcé pour compenser l\'absence de toit.'],
      ]},
    ],
    'ferrari-sf90': [
      { c:'SF90', a:'2019–', m:[
        ['Stradale / Spider','V8 4.0 biturbo + trois moteurs électriques','1 000 ch cumulés','intégrale par l\'essieu avant électrique · DCT 8','Première Ferrari de série hybride rechargeable et à quatre roues motrices.'],
        ['XX Stradale','V8 4.0 biturbo hybride','1 030 ch','intégrale · DCT 8','799 exemplaires. Aileron fixe, aéro dérivée du programme XX.'],
      ]},
    ],
    'porsche-918': [
      { c:'918 Spyder', a:'2013–2015', m:[
        ['918 Spyder','V8 4.6 atmo issu de la RS Spyder + deux moteurs électriques','887 ch cumulés','intégrale · PDK 7','918 exemplaires. Première voiture de série sous les 7 minutes au Nürburgring, avec le pack Weissach.'],
      ]},
    ],
    'aston-valkyrie': [
      { c:'Valkyrie', a:'2021–', m:[
        ['Valkyrie','V12 6.5 atmo Cosworth + hybride','1 160 ch cumulés','propulsion · robotisée 7','11 100 tr/min : le V12 de route au plus haut régime jamais homologué. Aéro conçue par Adrian Newey.'],
        ['AMR Pro','V12 6.5 atmo','1 000 ch','propulsion · robotisée','Réservée à la piste, sans hybridation, empattement allongé. 40 exemplaires.'],
      ]},
    ],
    'alpina-b5': [
      { c:'E60 / F10', a:'2005–2017', m:[
        ['B5 (E60)','V8 4.4 à compresseur','500–530 ch','propulsion · auto 6','Alpina choisit le compresseur là où BMW M privilégie le régime.'],
        ['B5 Biturbo (F10)','V8 4.4 biturbo','540–600 ch','propulsion ou intégrale · auto 8','Touring disponible, contrairement à la M5 F10.'],
      ]},
      { c:'G30 / G60', a:'2017–', m:[
        ['B5 Biturbo','V8 4.4 biturbo','608–621 ch','intégrale · auto 8','330 km/h. Alpina est immatriculé constructeur, pas préparateur : ses voitures sortent des chaînes BMW.'],
      ]},
    ],
    'alpina-b3': [
      { c:'E36 – F30', a:'1993–2018', m:[
        ['B3 / B3 Biturbo','6 en ligne 3.0–3.4','250–410 ch','propulsion ou intégrale · manuelle / auto 8','Roues à vingt branches et bandes latérales : la signature Alpina.'],
      ]},
      { c:'G20 / G21', a:'2019–', m:[
        ['B3 Touring','6 en ligne 3.0 biturbo','462–495 ch','intégrale · auto 8','L\'anti-M3 : même performance, réglage orienté grand tourisme. Le Touring a précédé la M3 Touring de trois ans.'],
      ]},
    ],
    'brabus-rocket': [
      { c:'Rocket', a:'2006–', m:[
        ['Rocket (CLS)','V12 6.3 biturbo','730 ch','propulsion · auto 5','362,4 km/h en 2006 : la berline la plus rapide du monde.'],
        ['Rocket 900','V12 6.3 biturbo','900 ch','propulsion · auto','Bloc réalésé, vilebrequin et bielles spécifiques.'],
      ]},
    ],
    'singer-911': [
      { c:'Réimaginée', a:'2009–', m:[
        ['Classic','flat-6 3.6–4.0 atmo (préparé par Ed Pink)','360–390 ch','propulsion · manuelle 6','Chaque voiture part d\'une 964 fournie par le client, entièrement démontée. Facture à sept chiffres et plusieurs années d\'attente.'],
        ['DLS (Dynamics and Lightweighting Study)','flat-6 4.0 atmo, développé avec Williams','500 ch','propulsion · manuelle 6','9 000 tr/min, distribution à quatre arbres à cames. 75 exemplaires.'],
      ]},
    ],
    'ruf-ctr': [
      { c:'CTR « Yellowbird »', a:'1987–1996', m:[
        ['CTR','flat-6 3.4 biturbo','469 ch','propulsion · manuelle 5 maison','342 km/h : voiture de série la plus rapide du monde en 1987, devant la Testarossa et la Countach. 29 exemplaires.'],
      ]},
      { c:'CTR 2020', a:'2017–', m:[
        ['CTR Anniversary','flat-6 3.6 biturbo','710 ch','propulsion · manuelle 6','Monocoque carbone conçue par RUF : ce n\'est plus une Porsche modifiée, mais une voiture entièrement maison.'],
      ]},
    ],
    'techart-gtstreet-r': [
      { c:'GTstreet R', a:'2016–', m:[
        ['GTstreet R','flat-6 3.8 biturbo','800 ch','intégrale · PDK','Base 911 Turbo S. Kit carrosserie carbone intégral et aéro fonctionnelle.'],
      ]},
    ],
    'mclaren-senna': [
      { c:'Senna', a:'2018–2020', m:[
        ['Senna','M840TR 4.0 V8 biturbo','800 ch','propulsion · DCT 7','1 198 kg. Aileron actif de 1 219 mm générant 800 kg d\'appui. 500 exemplaires.'],
        ['Senna GTR','V8 4.0 biturbo','825 ch','propulsion · DCT 7','Réservée à la piste, sans contrainte d\'homologation : plus de 1 000 kg d\'appui. 75 exemplaires.'],
      ]},
    ],
    'lotus-evija': [
      { c:'Evija', a:'2020–', m:[
        ['Evija','quatre moteurs électriques, un par roue','2 011 ch','intégrale à vectorisation','Conduits Venturi traversant la carrosserie de part en part. 130 exemplaires.'],
      ]},
    ],


    /* ================= VAGUE 7 — Reste du monde ============================ */

    'volvo-240': [
      { c:'240 / 260', a:'1974–1993', m:[
        ['B21 / B23 essence','4 cyl. 2.1–2.3 atmo','82–140 ch','propulsion · manuelle 4/5 / auto','Structure à zones de déformation programmée : elle a servi de référence de sécurité aux États-Unis pendant vingt ans.'],
        ['Turbo','4 cyl. 2.1 turbo','155 ch','propulsion · manuelle 4/5','Engagée en championnat européen des voitures de tourisme, surnommée « la brique volante ».'],
      ]},
    ],
    'volvo-850r': [
      { c:'850 T-5R / R', a:'1994–1997', m:[
        ['T-5R','5 en ligne 2.3 turbo','225–243 ch','traction · manuelle 5 / auto 4','Jaune Crème ou noire, préparée avec Porsche. Le break familial engagé en championnat britannique des voitures de tourisme.'],
        ['850 R','5 en ligne 2.3 turbo','250 ch','traction · manuelle 5','Version définitive, châssis raffermi.'],
      ]},
    ],
    'volvo-v70r': [
      { c:'P2', a:'2003–2007', m:[
        ['V70 R','5 en ligne 2.5 turbo','300 ch','intégrale Haldex · manuelle 6 / auto 5','Amortisseurs Four-C à trois modes. Le break suédois qui suivait les M3 sur autoroute.'],
      ]},
    ],
    'volvo-p1800': [
      { c:'P1800', a:'1961–1973', m:[
        ['B18 / B20','4 cyl. 1.8–2.0 atmo','100–130 ch','propulsion · manuelle 4','La voiture du Saint à la télévision. Un exemplaire américain a dépassé cinq millions de kilomètres.'],
      ]},
    ],
    'saab-900turbo': [
      { c:'900 classique', a:'1978–1993', m:[
        ['900 Turbo 8v','4 cyl. 2.0 turbo','145–175 ch','traction · manuelle 5','Le système APC adapte la pression de suralimentation à la qualité du carburant — une avance considérable en 1982.'],
        ['900 Turbo 16S','4 cyl. 2.0 turbo 16v','160–175 ch','traction · manuelle 5','Pare-brise incurvé issu de la culture aéronautique de la marque.'],
        ['900 Turbo S / Aero','4 cyl. 2.0 turbo 16v','175–185 ch','traction · manuelle 5','Le cabriolet, dessiné pour le marché américain, a sauvé le modèle en fin de carrière.'],
      ]},
    ],
    'skoda-octavia-rs': [
      { c:'1U', a:'2000–2006', m:[
        ['RS 1.8T','4 cyl. 1.8 turbo 20v','180 ch','traction · manuelle 5','La Golf GTI IV en version break, à moitié prix.'],
      ]},
      { c:'1Z / 5E / NX', a:'2005–', m:[
        ['RS TSI','4 cyl. 2.0 turbo','200–265 ch','traction · manuelle 6 / DSG',''],
        ['RS TDI','4 cyl. 2.0 turbodiesel','170–184 ch','traction ou intégrale · manuelle 6 / DSG','Le break rapide et sobre : une spécialité tchèque sans vrai équivalent.'],
      ]},
    ],
    'cupra-formentor': [
      { c:'KM', a:'2020–', m:[
        ['1.5 / 2.0 TSI','4 cyl. turbo','150–310 ch','traction ou intégrale · DSG 7','Premier modèle conçu spécifiquement pour Cupra, sans équivalent SEAT.'],
        ['VZ5','5 en ligne 2.5 turbo (bloc Audi RS3)','390 ch','intégrale, répartition active arrière · DSG 7','7 000 exemplaires. Le cinq-cylindres Audi dans un crossover espagnol.'],
      ]},
    ],
    'hyundai-i30n': [
      { c:'PD', a:'2017–', m:[
        ['i30 N','4 cyl. 2.0 turbo','250–275 ch','traction, différentiel autobloquant électronique · manuelle 6 / DCT 8','Développée par Albert Biermann, ancien patron de BMW M. Échappement à valves et système de double débrayage.'],
        ['i30 N Fastback','4 cyl. 2.0 turbo','275 ch','traction · manuelle 6 / DCT 8',''],
      ]},
    ],
    'hyundai-i20n': [
      { c:'BC3', a:'2020–', m:[
        ['i20 N','4 cyl. 1.6 turbo','204 ch','traction, autobloquant mécanique · manuelle 6','1 190 kg. Sœur de route de la i20 N Rally1 engagée en championnat du monde.'],
      ]},
    ],
    'hyundai-ioniq5n': [
      { c:'NE', a:'2023–', m:[
        ['Ioniq 5 N','deux moteurs électriques, 800 V','650 ch (surpuissance)','intégrale','Simule une boîte à 8 rapports et un son de moteur thermique — un pari assumé pour rendre l\'électrique ludique.'],
      ]},
    ],
    'kia-stinger': [
      { c:'CK', a:'2017–2023', m:[
        ['2.0 T-GDi','4 cyl. 2.0 turbo','247 ch','propulsion ou intégrale · auto 8',''],
        ['GT 3.3 T-GDi','V6 3.3 biturbo','370 ch','propulsion ou intégrale · auto 8','Châssis mis au point au Nürburgring par l\'équipe d\'Albert Biermann. Une berline coréenne à propulsion : une anomalie assumée.'],
      ]},
    ],
    'kia-ev6-gt': [
      { c:'CV', a:'2021–', m:[
        ['EV6 GT','deux moteurs électriques, 800 V','585 ch','intégrale','Mode drift, différentiel arrière piloté. Charge de 10 à 80 % en environ 18 minutes.'],
      ]},
    ],
    'genesis-g70': [
      { c:'IK', a:'2017–', m:[
        ['2.0T / 2.2D','4 cyl. turbo essence et diesel','197–252 ch','propulsion ou intégrale · auto 8',''],
        ['3.3T','V6 3.3 biturbo','370 ch','propulsion ou intégrale · auto 8','Plateforme partagée avec la Kia Stinger. Le G70 Shooting Brake est conçu spécifiquement pour l\'Europe.'],
      ]},
    ],
    'dacia-duster': [
      { c:'I / II', a:'2010–2023', m:[
        ['Essence / dCi','4 cyl.','84–150 ch','traction ou 4x4 enclenchable · manuelle 5/6','Le SUV qui a démontré qu\'on pouvait vendre du 4x4 simple et bon marché en Europe.'],
      ]},
      { c:'III', a:'2024–', m:[
        ['TCe / Hybrid 140','3 et 4 cyl., hybride','100–140 ch','traction ou 4x4 · manuelle 6 / auto','Plateforme CMF-B, calandre à motif en Y.'],
      ]},
    ],
    'lada-niva': [
      { c:'2121 / 4x4', a:'1977–', m:[
        ['1.6 / 1.7','4 cyl. atmo','75–83 ch','4x4 permanent, boîte de transfert, blocage central · manuelle 5','Premier 4x4 à carrosserie monocoque et suspension avant indépendante. Quasi inchangée depuis quarante-cinq ans.'],
      ]},
    ],
    'tatra-t87': [
      { c:'T87', a:'1936–1950', m:[
        ['3.0 V8','V8 3.0 refroidi par air, en porte-à-faux arrière','85 ch','propulsion · manuelle 4','Cx de 0,36 en 1936. Aileron dorsal pour la stabilité. Sa tenue de cap piégeuse a tué tant d\'officiers allemands qu\'elle fut surnommée l\'arme secrète tchèque.'],
      ]},
    ],
    'holden-commodore': [
      { c:'VN – VZ', a:'1988–2006', m:[
        ['5.0 / 5.7 V8','V8 5.0 puis LS1 5.7 atmo','165–329 ch','propulsion · manuelle 5/6 / auto','La base des V8 Supercars australiens face à la Ford Falcon.'],
      ]},
      { c:'VE / VF', a:'2006–2017', m:[
        ['SS / SS-V (LS2/LS3)','V8 6.0–6.2 atmo','362–408 ch','propulsion · manuelle 6 / auto 6','Exportée aux États-Unis en Chevrolet SS et Pontiac G8.'],
        ['HSV GTS (LSA)','V8 6.2 à compresseur','585 ch','propulsion · manuelle 6 / auto 6','La berline australienne la plus puissante. La production automobile australienne s\'arrête en 2017.'],
      ]},
    ],
    'byd-seal': [
      { c:'Seal', a:'2022–', m:[
        ['Design / Excellence','un ou deux moteurs, Blade Battery LFP','313–530 ch','propulsion ou intégrale','Batterie à cellules lames intégrées à la structure : gain de place et résistance à la perforation.'],
      ]},
    ],
    'xiaomi-su7': [
      { c:'SU7', a:'2024–', m:[
        ['SU7 / Pro / Max','un ou deux moteurs, 800 V','299–673 ch','propulsion ou intégrale','Premier véhicule du fabricant de smartphones, développé en trois ans.'],
        ['SU7 Ultra','trois moteurs électriques','1 548 ch','intégrale','0 à 100 km/h en environ 1,98 s. Recordwoman du Nürburgring parmi les berlines électriques.'],
      ]},
    ],
    'nio-et5': [
      { c:'ET5', a:'2022–', m:[
        ['ET5 / Touring','deux moteurs électriques','490 ch','intégrale','Batterie échangeable en trois minutes dans des stations robotisées : une alternative à la recharge rapide.'],
      ]},
    ],
    'skoda-fabia': [
      { c:'6Y / 5J / NJ / PJ', a:'1999–', m:[
        ['Essence / TDI','3 et 4 cyl.','60–150 ch','traction · manuelle 5/6 / DSG','Sa version rallye R5 puis Rally2 domine le championnat WRC2 depuis dix ans.'],
        ['RS','1.9 TDI puis 1.4 TSI double suralimentation','130–180 ch','traction · manuelle 5 / DSG 7','La RS 2010 combine turbo et compresseur sur 1,4 L.'],
      ]},
    ],
    'seat-leon': [
      { c:'1M / 1P', a:'1999–2012', m:[
        ['Cupra R (1M)','4 cyl. 1.8 turbo 20v','210–225 ch','traction · manuelle 6','Freins Brembo 4 pistons. La première vraie sportive SEAT.'],
        ['Cupra R (1P)','4 cyl. 2.0 TFSI','240–265 ch','traction · manuelle 6','Elle a détenu le record des tractions au Nürburgring en 2009.'],
      ]},
      { c:'5F / KL', a:'2012–', m:[
        ['Cupra 280 / 290 / 300','4 cyl. 2.0 TSI','280–300 ch','traction, différentiel VAQ · manuelle 6 / DSG','La ST 300 4Drive : le break sportif à transmission intégrale de la maison.'],
      ]},
    ],


    /* ================= VAGUE 6 — États-Unis ================================ */

    'chevrolet-corvette-c2': [
      { c:'C2 Sting Ray', a:'1963–1967', m:[
        ['327 small-block','V8 5.4 atmo','250–375 ch','propulsion · manuelle 4 / auto','Première Corvette à suspension arrière indépendante. La 1963 à lunette fendue est la plus cotée.'],
        ['427 big-block','V8 7.0 atmo','390–435 ch','propulsion · manuelle 4','La L88 de 1967, officiellement 430 ch, en développait en réalité plus de 550. 20 exemplaires.'],
      ]},
    ],
    'chevrolet-corvette-c3': [
      { c:'C3', a:'1968–1982', m:[
        ['350 small-block','V8 5.7 atmo','165–370 ch','propulsion · manuelle 4 / auto 3','Carrosserie « coke bottle ». La chute de puissance après 1972 traduit le passage aux normes antipollution.'],
        ['454 big-block','V8 7.4 atmo','270–465 ch','propulsion · manuelle 4','La LS6 de 1971 clôt l\'ère des gros blocs.'],
      ]},
    ],
    'chevrolet-corvette-c5': [
      { c:'C5', a:'1997–2004', m:[
        ['LS1','V8 5.7 atmo','345–350 ch','propulsion transaxle · manuelle 6 / auto 4','Boîte accolée au pont arrière : répartition des masses proche de 50/50, une première sur Corvette.'],
        ['Z06 (LS6)','V8 5.7 atmo','385–405 ch','propulsion · manuelle 6','Carter sec, admission revue, 1 415 kg.'],
      ]},
    ],
    'chevrolet-corvette-c6': [
      { c:'C6', a:'2005–2013', m:[
        ['LS2 / LS3','V8 6.0–6.2 atmo','400–436 ch','propulsion transaxle · manuelle 6 / auto','Retour des phares fixes, une première depuis 1962.'],
        ['Z06 (LS7)','V8 7.0 atmo','512 ch','propulsion · manuelle 6','Carter sec, bielles titane, châssis aluminium. 7 000 tr/min pour un big-block.'],
        ['ZR1 (LS9)','V8 6.2 à compresseur','647 ch','propulsion · manuelle 6','Capot à fenêtre laissant voir le compresseur. 330 km/h.'],
      ]},
    ],
    'chevrolet-corvette-c7': [
      { c:'C7', a:'2014–2019', m:[
        ['Stingray (LT1)','V8 6.2 atmo à injection directe','466–470 ch','propulsion transaxle · manuelle 7 / auto 8','Boîte manuelle à 7 rapports avec double débrayage automatique.'],
        ['Z06 (LT4)','V8 6.2 à compresseur','659 ch','propulsion · manuelle 7 / auto 8',''],
        ['ZR1 (LT5)','V8 6.2 à compresseur','765 ch','propulsion · manuelle 7 / auto 8','La Corvette à moteur avant la plus puissante de l\'histoire.'],
      ]},
    ],
    'chevrolet-corvette-c8': [
      { c:'C8', a:'2020–', m:[
        ['Stingray (LT2)','V8 6.2 atmo','495 ch','moteur central · DCT 8','Première Corvette à moteur central en soixante-sept ans d\'histoire.'],
        ['Z06 (LT6)','V8 5.5 atmo à vilebrequin plat','679 ch','moteur central · DCT 8','8 600 tr/min. Le V8 atmosphérique de série le plus puissant du monde.'],
        ['E-Ray','V8 6.2 atmo + moteur électrique avant','655 ch cumulés','intégrale hybride · DCT 8','Première Corvette hybride et à quatre roues motrices.'],
        ['ZR1','V8 5.5 biturbo à vilebrequin plat','1 079 ch','moteur central · DCT 8','La voiture américaine de série la plus puissante jamais produite.'],
      ]},
    ],
    'chevrolet-camaro': [
      { c:'1re gén.', a:'1966–1969', m:[
        ['327 / 350','V8 5.4–5.7 atmo','210–300 ch','propulsion · manuelle 3/4 / auto',''],
        ['Z/28 302','V8 4.9 atmo','290 ch (sous-évalués)','propulsion · manuelle 4','Homologation Trans-Am : cylindrée bridée à 5,0 L par le règlement.'],
        ['SS 396 / COPO 427','V8 6.5–7.0 atmo','325–430 ch','propulsion · manuelle 4','Les COPO, commandées hors catalogue par des concessionnaires, sont les plus recherchées.'],
      ]},
      { c:'3e / 4e gén.', a:'1982–2002', m:[
        ['IROC-Z / Z28','V8 5.0–5.7 atmo','190–275 ch','propulsion · manuelle 5 / auto','Le LT1 de 1993, dérivé de la Corvette, relance le modèle.'],
        ['SS (LS1)','V8 5.7 atmo','320–330 ch','propulsion · manuelle 6','Moteur de Corvette C5 dans une pony car.'],
      ]},
      { c:'5e / 6e gén.', a:'2010–2024', m:[
        ['SS','V8 6.2 atmo','426–461 ch','propulsion · manuelle 6 / auto','Relancée par la popularité du film Transformers.'],
        ['ZL1','V8 6.2 à compresseur','580–650 ch','propulsion · manuelle 6 / auto 10','La ZL1 1LE, aileron carbone et amortisseurs DSSV Multimatic.'],
        ['Z/28 (2014)','V8 7.0 atmo (LS7)','505 ch','propulsion · manuelle 6','Sans climatisation ni autoradio de série, freins carbone-céramique. Orientée circuit sans compromis.'],
      ]},
    ],
    'dodge-viper': [
      { c:'SR I / SR II', a:'1991–2002', m:[
        ['RT/10','V10 8.0 atmo','400–450 ch','propulsion · manuelle 6','Ni vitres électriques, ni poignées extérieures, ni ABS. Un roadster volontairement primitif.'],
        ['GTS','V8… non : V10 8.0 atmo','450 ch','propulsion · manuelle 6','Coupé à double bossage de toit. Sa version GTS-R gagne aux 24 Heures du Mans en catégorie GT.'],
      ]},
      { c:'ZB / VX', a:'2003–2017', m:[
        ['SRT-10','V10 8.3 atmo','500–510 ch','propulsion · manuelle 6',''],
        ['ACR','V10 8.4 atmo','600–645 ch','propulsion · manuelle 6','Aéro extrême : plus de 800 kg d\'appui. A détenu treize records de circuits américains.'],
      ]},
    ],
    'dodge-challenger': [
      { c:'LC / LA', a:'2008–2023', m:[
        ['R/T','V8 5.7 HEMI atmo','372–375 ch','propulsion · manuelle 6 / auto 8',''],
        ['SRT 392 / Scat Pack','V8 6.4 HEMI atmo','485 ch','propulsion · manuelle 6 / auto 8','Le dernier grand V8 atmosphérique américain de grande diffusion.'],
        ['SRT Hellcat','V8 6.2 HEMI à compresseur','717–807 ch','propulsion · manuelle 6 / auto 8','Livrée avec deux clés : la rouge débloque la pleine puissance, la noire la limite à 500 ch.'],
        ['SRT Demon 170','V8 6.2 compressé, E85','1 025 ch','propulsion · auto 8','Conçue pour lever les roues avant au départ. Interdite de compétition NHRA sans arceau.'],
      ]},
    ],
    'ford-gt': [
      { c:'1re gén.', a:'2004–2006', m:[
        ['Ford GT','V8 5.4 à compresseur','550 ch','moteur central · manuelle 6','Hommage à la GT40 pour le centenaire de Ford. 4 038 exemplaires.'],
      ]},
      { c:'2e gén.', a:'2016–2022', m:[
        ['Ford GT','V6 3.5 EcoBoost biturbo','656 ch','moteur central · DCT 7','Monocoque carbone, arceaux d\'échappement en titane. Victoire au Mans en catégorie GTE dès 2016, cinquante ans après la GT40.'],
      ]},
    ],
    'ford-gt40': [
      { c:'Mk I – Mk IV', a:'1964–1969', m:[
        ['Mk I (4.7)','V8 4.7 atmo','380–390 ch','propulsion · manuelle 5 ZF','Victoires au Mans en 1968 et 1969 avec le châssis 1075, engagé deux fois.'],
        ['Mk II (7.0)','V8 7.0 atmo','485 ch','propulsion · manuelle 4','Triplé au Mans 1966, l\'objectif fixé par Henry Ford II après l\'échec du rachat de Ferrari.'],
        ['Mk IV','V8 7.0 atmo','500 ch','propulsion · manuelle 4','Châssis américain en nid d\'abeille. Victoire 1967 avec Gurney et Foyt.'],
      ]},
    ],
    'shelby-cobra': [
      { c:'AC Cobra', a:'1962–1967', m:[
        ['289','V8 4.7 atmo','271–306 ch','propulsion · manuelle 4','Châssis AC Ace anglais, moteur Ford américain : la recette de Carroll Shelby.'],
        ['427 S/C','V8 7.0 atmo','425–485 ch','propulsion · manuelle 4','Environ 1 070 kg pour 425 ch. Les exemplaires « Semi-Competition » sont les plus cotés.'],
      ]},
    ],
    'pontiac-firebird': [
      { c:'1re / 2e gén.', a:'1967–1981', m:[
        ['Trans Am 400 / 455','V8 6.6–7.5 atmo','290–370 ch','propulsion · manuelle 4 / auto','L\'oiseau de feu sur le capot, popularisé par Smokey and the Bandit.'],
      ]},
      { c:'3e / 4e gén.', a:'1982–2002', m:[
        ['Trans Am / Formula','V8 5.0–5.7','190–325 ch','propulsion · manuelle 5/6 / auto','La 3e génération est la K2000 de la série télévisée.'],
        ['Trans Am WS6 (LS1)','V8 5.7 atmo','320–325 ch','propulsion · manuelle 6','Prises d\'air fonctionnelles sur le capot. Dernier chapitre avant la fin de Pontiac.'],
      ]},
    ],
    'dodge-charger-classic': [
      { c:'2e gén.', a:'1968–1970', m:[
        ['383 / 440 Magnum','V8 6.3–7.2 atmo','335–375 ch','propulsion · manuelle 4 / auto 3','La silhouette de Bullitt et de Fast & Furious.'],
        ['426 HEMI','V8 7.0 hémisphérique','425 ch (sous-évalués)','propulsion · manuelle 4 / auto 3','Environ 1 % des Charger de 1968 en ont reçu un. Aujourd\'hui les plus chères.'],
      ]},
    ],
    'plymouth-barracuda': [
      { c:'E-body', a:'1970–1974', m:[
        ['340 / 383 Cuda','V8 5.6–6.3 atmo','275–335 ch','propulsion · manuelle 4 / auto',''],
        ['426 HEMI Cuda','V8 7.0 hémisphérique','425 ch','propulsion · manuelle 4 / auto','Le cabriolet HEMI 1971 : quelques exemplaires seulement, parmi les voitures américaines les plus chères aux enchères.'],
      ]},
    ],
    'cadillac-cts-v': [
      { c:'1re gén.', a:'2004–2007', m:[
        ['CTS-V','V8 5.7–6.0 atmo (LS6/LS2)','400–405 ch','propulsion · manuelle 6','Mise au point au Nürburgring : Cadillac s\'attaque frontalement à la M5.'],
      ]},
      { c:'2e / 3e gén.', a:'2009–2019', m:[
        ['CTS-V (LSA)','V8 6.2 à compresseur','564 ch','propulsion · manuelle 6 / auto 6','Déclinée en berline, coupé et break — le break V est resté culte.'],
        ['CTS-V (LT4)','V8 6.2 à compresseur','649 ch','propulsion · auto 8','322 km/h.'],
      ]},
    ],
    'tesla-models-plaid': [
      { c:'Model S', a:'2012–', m:[
        ['P85 / P90D / P100D','deux moteurs électriques','422–773 ch','intégrale','Le mode Ludicrous de 2015 fait entrer une berline familiale sous les 3 secondes.'],
        ['Plaid','trois moteurs à rotor bobiné','1 020 ch','intégrale · réducteur','0 à 100 km/h en environ 2,1 s. Volant en forme de manche, très critiqué.'],
      ]},
    ],
    'ford-f150-raptor': [
      { c:'1re / 2e gén.', a:'2010–2020', m:[
        ['6.2 V8 / 3.5 EcoBoost','V8 6.2 atmo / V6 3.5 biturbo','411–456 ch','4x4 · auto 6/10','Suspensions Fox à grand débattement, conçues pour absorber les sauts en désert.'],
      ]},
      { c:'3e gén.', a:'2021–', m:[
        ['Raptor 3.5 EcoBoost','V6 3.5 biturbo','456 ch','4x4 · auto 10','Essieu arrière à cinq bras et ressorts hélicoïdaux.'],
        ['Raptor R','V8 5.2 à compresseur','700–720 ch','4x4 · auto 10','Le V8 de la Shelby GT500 dans un pick-up.'],
      ]},
    ],
    'jeep-trackhawk': [
      { c:'WK2', a:'2018–2021', m:[
        ['Grand Cherokee Trackhawk','V8 6.2 HEMI à compresseur','710 ch','4x4 permanent · auto 8','0 à 100 km/h en 3,5 s pour 2,4 tonnes. Le SUV le plus rapide du monde à sa sortie.'],
      ]},
    ],
    'buick-gnx': [
      { c:'G-body', a:'1984–1987', m:[
        ['Grand National','V6 3.8 turbo','200–245 ch','propulsion · auto 4','Toute noire, dans une époque où la performance américaine était moribonde.'],
        ['GNX','V6 3.8 turbo à intercooler, préparé par ASC/McLaren','276 ch (annoncés)','propulsion · auto 4','547 exemplaires. Elle humiliait des Corvette et des Ferrari sur 400 m. La puissance réelle dépassait 300 ch.'],
      ]},
    ],
    'gmc-syclone': [
      { c:'GMT400', a:'1991', m:[
        ['Syclone','V6 4.3 turbo','280 ch','intégrale permanente · auto 4','Un pick-up qui battait une Ferrari 348 sur 400 m départ arrêté. 2 995 exemplaires.'],
      ]},
    ],
    'delorean-dmc12': [
      { c:'DMC-12', a:'1981–1983', m:[
        ['2.85 V6 PRV','V6 PRV 2.85 atmo','132 ch','propulsion, moteur arrière · manuelle 5 / auto 3','Carrosserie inox brossé non peinte, portes papillon, châssis Lotus. Environ 9 000 exemplaires avant la faillite.'],
      ]},
    ],
    'hummer-h1': [
      { c:'H1', a:'1992–2006', m:[
        ['6.5 diesel / 6.6 Duramax','V8 6.5–6.6 turbodiesel','160–300 ch','4x4 permanent, ponts portiques · auto 4','Dérivé civil du Humvee militaire. Gonflage centralisé des pneus depuis l\'habitacle.'],
      ]},
    ],


    /* ================= VAGUE 5 — France ==================================== */

    'peugeot-205': [
      { c:'Phase 1', a:'1983–1987', m:[
        ['Essence 1.0 – 1.6','4 cyl. 954 – 1580 cm³','45–90 ch','traction · manuelle 4/5','Dessinée en interne, pas par Pininfarina contrairement à la légende tenace.'],
        ['Diesel 1.8 / 1.9','4 cyl. XUD turbodiesel ou atmo','60–78 ch','traction · manuelle 5','Le XUD, l\'un des diesels les plus increvables jamais produits.'],
        ['GTI 1.6','4 cyl. 1.6 injection','105–115 ch','traction · manuelle 5','850 kg. Train arrière à bras tirés, célèbre pour son comportement en levé de pied.'],
      ]},
      { c:'Phase 2', a:'1987–1998', m:[
        ['GTI 1.9','4 cyl. 1.9 injection','122–130 ch','traction · manuelle 5, freins à disques arrière','La version catalysée de 1992 retombe à 122 ch — critère de prix décisif à l\'achat.'],
        ['Rallye','4 cyl. 1.3 carburateurs double corps','103 ch','traction · manuelle 5','795 kg, sans insonorisant ni équipement. Aujourd\'hui plus cotée que la GTI.'],
        ['CTI','4 cyl. 1.6–1.9 injection','105–122 ch','traction · manuelle 5','Version cabriolet, carrossée par Pininfarina.'],
      ]},
    ],
    'peugeot-206': [
      { c:'206', a:'1998–2012', m:[
        ['Essence 1.1 – 1.6','4 cyl. TU et EW','60–110 ch','traction · manuelle 5','Près de dix millions d\'exemplaires : la Peugeot la plus vendue de l\'histoire.'],
        ['HDi','4 cyl. 1.4–2.0 turbodiesel à rampe commune','68–110 ch','traction · manuelle 5','L\'injection à rampe commune arrive sur le segment.'],
        ['S16','4 cyl. 2.0 16v atmo','136 ch','traction · manuelle 5','Héritière directe de la 306 S16 en format réduit.'],
        ['RC / GT','4 cyl. 2.0 16v atmo','177 ch','traction · manuelle 5','Le 2.0 le plus poussé de PSA. Freins et châssis spécifiques.'],
      ]},
    ],
    'peugeot-306-gti6': [
      { c:'306 GTI-6', a:'1996–2001', m:[
        ['GTI-6','4 cyl. XU10J4RS 2.0 16v atmo','167 ch','traction · manuelle 6','Boîte à 6 rapports sur une compacte en 1996 : une première en Europe. Train arrière autodirectionnel.'],
      ]},
    ],
    'peugeot-306-rallye': [
      { c:'306 Rallye', a:'1998–2001', m:[
        ['Rallye','4 cyl. 2.0 16v atmo','167 ch','traction · manuelle 6','Même mécanique que la GTI-6, allégée de tout le superflu : ni clim, ni cuir, jantes acier peintes. La plus recherchée des 306.'],
      ]},
    ],
    'peugeot-405': [
      { c:'405', a:'1987–1997', m:[
        ['Essence 1.4 – 2.0','4 cyl. XU','65–125 ch','traction · manuelle 5','Voiture de l\'Année 1988.'],
        ['Mi16','4 cyl. XU9J4 1.9 16v atmo','160 ch','traction · manuelle 5','La berline sportive du lion, châssis salué par toute la presse de l\'époque.'],
        ['T16','4 cyl. 2.0 16v turbo','200 ch','intégrale · manuelle 5','1 061 exemplaires. Sa cousine de course a gagné Pikes Peak avec Ari Vatanen.'],
      ]},
    ],
    'peugeot-406-coupe': [
      { c:'Coupé', a:'1997–2004', m:[
        ['2.0 16v','4 cyl. 2.0 16v atmo','135 ch','traction · manuelle 5','Dessinée et assemblée chez Pininfarina, à Turin.'],
        ['2.2 16v','4 cyl. 2.2 16v atmo','158 ch','traction · manuelle 5',''],
        ['3.0 V6','V6 PRV / ES9 3.0 24v atmo','194–210 ch','traction · manuelle 6 / auto 4','Le V6 24 soupapes : la version que les collectionneurs recherchent.'],
      ]},
    ],
    'peugeot-106': [
      { c:'Phase 1', a:'1991–1996', m:[
        ['1.0 – 1.4','4 cyl. TU','45–75 ch','traction · manuelle 5',''],
        ['XSi 1.4 / 1.6','4 cyl. TU 1.4–1.6','95–103 ch','traction · manuelle 5',''],
        ['Rallye 1.3','4 cyl. 1.3 carburateurs','100 ch','traction · manuelle 5','825 kg, sans équipement. L\'héritière directe de la 205 Rallye.'],
      ]},
      { c:'Phase 2', a:'1996–2003', m:[
        ['GTI 1.6 16v','4 cyl. TU5J4 1.6 16v atmo','118–120 ch','traction · manuelle 5','865 kg. Duelliste éternelle de la Saxo VTS, avec laquelle elle partage tout.'],
        ['Rallye 1.6 16v','4 cyl. 1.6 16v atmo','103 ch','traction · manuelle 5','Version dépouillée de la GTI.'],
      ]},
    ],
    'peugeot-504': [
      { c:'Berline / Break', a:'1968–1983', m:[
        ['1.8 / 2.0 essence','4 cyl. XC/XN','82–106 ch','propulsion · manuelle 4','Voiture de l\'Année 1969. Produite en Afrique jusqu\'en 2005.'],
        ['2.0 / 2.3 diesel','4 cyl. XD turbodiesel ou atmo','56–80 ch','propulsion · manuelle 4','Le diesel qui a bâti la réputation de robustesse de Peugeot.'],
      ]},
      { c:'Coupé / Cabriolet', a:'1969–1983', m:[
        ['2.0 injection','4 cyl. 2.0','104 ch','propulsion · manuelle 4','Carrosserie Pininfarina.'],
        ['2.7 V6','V6 PRV 2.7 atmo','136–144 ch','propulsion · manuelle 5','Le premier V6 PRV, développé avec Renault et Volvo.'],
      ]},
    ],
    'peugeot-508': [
      { c:'I', a:'2010–2018', m:[
        ['THP / HDi','4 cyl. essence turbo et diesel','115–204 ch','traction · manuelle 6 / auto',''],
        ['RXH / GT HYbrid4','2.0 HDi + moteur électrique arrière','200 ch cumulés','intégrale par l\'essieu arrière électrique · robotisée 6','Premier diesel hybride rechargeable au monde. Le pont arrière n\'est relié qu\'électriquement.'],
      ]},
      { c:'II', a:'2018–', m:[
        ['PureTech / BlueHDi','3 et 4 cyl.','130–225 ch','traction · auto 8','Carrosserie sans encadrement de vitres, silhouette de fastback.'],
        ['PSE','1.6 turbo + deux moteurs électriques','360 ch cumulés','intégrale · auto 8','La Peugeot de série la plus puissante jamais produite. Amortisseurs à contrôle continu.'],
      ]},
    ],

    'citroen-cx': [
      { c:'Série 1', a:'1974–1985', m:[
        ['2.0 – 2.5 essence','4 cyl.','102–138 ch','traction · manuelle 5','Direction DIRAVI à rappel asservi : le volant revient seul au point milieu.'],
        ['GTi Turbo','4 cyl. 2.5 turbo','168 ch','traction · manuelle 5','220 km/h. Une des berlines les plus rapides de son temps.'],
      ]},
      { c:'Série 2', a:'1985–1991', m:[
        ['2.5 GTi Turbo 2','4 cyl. 2.5 turbo à intercooler','168 ch','traction · manuelle 5','Pare-chocs plastique et intérieur revu.'],
      ]},
    ],
    'citroen-xantia': [
      { c:'Xantia', a:'1992–2003', m:[
        ['Essence 1.6 – 2.0','4 cyl.','88–150 ch','traction hydractive · manuelle 5','Suspension Hydractive II à gestion électronique.'],
        ['3.0 V6','V6 3.0 24v atmo','190–194 ch','traction · manuelle 5 / auto',''],
        ['Activa','4 cyl. 2.0 turbo / V6 3.0','150–190 ch','traction, anti-roulis actif SC.CAR · manuelle 5','Son record au test de l\'élan a tenu tête aux supercars pendant vingt ans. Aucune voiture de série ne l\'a battue avant 2019.'],
      ]},
    ],
    'citroen-ax': [
      { c:'AX', a:'1986–1998', m:[
        ['1.0 – 1.4','4 cyl. TU','45–75 ch','traction · manuelle 4/5','640 kg dans les versions de base : un record de légèreté pour l\'époque.'],
        ['GT / GTi','4 cyl. 1.4 carburateur puis injection','85–100 ch','traction · manuelle 5','Environ 720 kg : elle consommait moins qu\'elle ne pesait, disaient les essayeurs.'],
        ['Sport','4 cyl. 1.4 double carburateur','95 ch','traction · manuelle 5','Homologation rallye, 3 000 exemplaires. La plus rare des AX.'],
      ]},
    ],
    'citroen-zx': [
      { c:'ZX', a:'1991–1998', m:[
        ['Essence 1.1 – 2.0','4 cyl. TU et XU','60–155 ch','traction, train arrière autodirectionnel · manuelle 5','Le train arrière autodirectionnel, hérité de la 306 : le meilleur châssis du segment à sa sortie.'],
        ['16V / Volcane','4 cyl. 2.0 16v atmo','155 ch','traction · manuelle 5',''],
      ]},
    ],

    'renault-5': [
      { c:'R5 (1re gén.)', a:'1972–1985', m:[
        ['0.85 – 1.4','4 cyl. Cléon-Fonte','36–64 ch','traction · manuelle 4/5','Pare-chocs en polyester, une première. Cinq millions et demi d\'exemplaires.'],
        ['Alpine / Gordini','4 cyl. 1.4 carburateur double corps','93 ch','traction · manuelle 5','Nommée Gordini au Royaume-Uni, Alpine appartenant déjà à Chrysler là-bas.'],
        ['Alpine Turbo','4 cyl. 1.4 turbo','110 ch','traction · manuelle 5','L\'une des premières petites turbo de série en Europe.'],
      ]},
      { c:'Super 5', a:'1984–1996', m:[
        ['1.0 – 1.7','4 cyl. Cléon et Energy','42–95 ch','traction · manuelle 4/5','Dessinée par Marcello Gandini.'],
        ['GT Turbo phase 1','4 cyl. 1.4 turbo à carburateur','115 ch','traction · manuelle 5','850 kg. Réputée capricieuse : chaleur moteur et carburateur font mauvais ménage.'],
        ['GT Turbo phase 2','4 cyl. 1.4 turbo à intercooler','120 ch','traction · manuelle 5','Refroidissement revu. La phase 2 est nettement plus utilisable — et plus cotée.'],
      ]},
    ],
    'renault-19': [
      { c:'Phase 1', a:'1988–1992', m:[
        ['1.2 – 1.8 / diesel','4 cyl. Energy et F8Q','54–95 ch','traction · manuelle 5','Le premier vrai succès qualitatif de Renault, aérodynamique travaillée avec Giugiaro.'],
        ['16S','4 cyl. F7P 1.8 16v atmo','137 ch','traction · manuelle 5','Le F7P : le bloc qui donnera naissance à la Clio Williams.'],
      ]},
      { c:'Phase 2', a:'1992–1996', m:[
        ['16S / Cabriolet','4 cyl. F7P 1.8 16v atmo','137 ch','traction · manuelle 5','Cabriolet carrossé par Karmann.'],
      ]},
    ],
    'renault-21-turbo': [
      { c:'21 Turbo', a:'1987–1993', m:[
        ['2.0 Turbo','4 cyl. 2.0 turbo','175 ch','traction · manuelle 5','227 km/h : elle chassait les BMW sur autoroute allemande.'],
        ['2.0 Turbo Quadra','4 cyl. 2.0 turbo','175 ch','intégrale permanente · manuelle 5','Rarissime, et la seule vraiment exploitable sur route mouillée.'],
      ]},
    ],
    'renault-8-gordini': [
      { c:'R8 Gordini', a:'1964–1970', m:[
        ['1100','4 cyl. 1.1 double carburateur','95 ch','propulsion, moteur arrière · manuelle 4','Bleu de France et deux bandes blanches : la livrée la plus reconnaissable de l\'automobile française.'],
        ['1300','4 cyl. 1.3 double carburateur','103 ch','propulsion, moteur arrière · manuelle 5','La Coupe Gordini a formé une génération entière de pilotes français.'],
      ]},
    ],
    'renault-megane': [
      { c:'I', a:'1995–2002', m:[
        ['1.4 – 2.0','4 cyl.','70–150 ch','traction · manuelle 5','Déclinée en berline, coupé, cabriolet, break et monospace Scénic.'],
        ['Coupé 2.0 16v','4 cyl. F7R 2.0 16v atmo','147–150 ch','traction · manuelle 5',''],
      ]},
      { c:'II', a:'2002–2009', m:[
        ['1.4 – 2.0 / dCi','4 cyl.','82–165 ch','traction · manuelle 5/6','Voiture de l\'Année 2003. Poupe très clivante.'],
      ]},
      { c:'III / IV', a:'2008–2022', m:[
        ['TCe / dCi','4 cyl. turbo essence et diesel','90–205 ch','traction · manuelle 6 / EDC',''],
      ]},
    ],
    'matra-murena': [
      { c:'Murena', a:'1980–1983', m:[
        ['1.6','4 cyl. 1.6 atmo','92 ch','moteur central · manuelle 5','Trois places de front, comme la Bagheera. Première voiture de série à caisse entièrement galvanisée.'],
        ['2.2','4 cyl. 2.2 atmo','118 ch','moteur central · manuelle 5',''],
        ['2.2 Préparation 142','4 cyl. 2.2 triple carburateur','142 ch','moteur central · manuelle 5','480 kits vendus. La plus rapide et la plus rare des Murena.'],
      ]},
    ],
    'simca-1000': [
      { c:'Rallye', a:'1970–1978', m:[
        ['Rallye 1','4 cyl. 1.3 carburateur double corps','82 ch','propulsion, moteur arrière · manuelle 4',''],
        ['Rallye 2','4 cyl. 1.3 double carburateur','103 ch','propulsion, moteur arrière · manuelle 4','La propulsion populaire française, reine des courses de côte amateurs.'],
        ['Rallye 3','4 cyl. 1.3 préparé','103 ch','propulsion · manuelle 4','1 000 exemplaires d\'homologation. Compte-tours central et jantes spécifiques.'],
      ]},
    ],


    /* ================= VAGUE 5 — France ==================================== */

    'peugeot-306': [
      { c:'Phase 1', a:'1993–1997', m:[
        ['1.4 – 1.8','4 cyl. essence et diesel','75–110 ch','traction · manuelle 5','Le châssis, dérivé de la 405, est resté une référence de sa décennie.'],
        ['S16','XU10J4 2.0 16v atmo','155 ch','traction · manuelle 5','Freins à disques aux quatre roues, voies élargies.'],
      ]},
      { c:'Phase 2 / 3', a:'1997–2002', m:[
        ['GTI-6','XU10J4RS 2.0 16v atmo','167 ch','traction · manuelle 6','Première compacte française à boîte 6 rapports. Différentiel avant à glissement limité en option.'],
        ['Rallye','XU10J4RS 2.0 16v atmo','167 ch','traction · manuelle 6','Version allégée et dépouillée de la GTI-6, jantes acier. La plus recherchée de toutes les 306.'],
      ]},
    ],
    'peugeot-309': [
      { c:'309', a:'1985–1993', m:[
        ['GTI 1.9','4 cyl. 1.9 injection','130 ch','traction · manuelle 5','Mécanique de 205 GTI dans une carrosserie plus longue : plus stable, moins vive.'],
        ['GTI 16','XU9J4 1.9 16v atmo','160 ch','traction · manuelle 5','La sportive oubliée du lion, plus efficace qu\'une 205 GTI sur circuit.'],
      ]},
    ],
    'peugeot-rcz': [
      { c:'RCZ', a:'2010–2015', m:[
        ['1.6 THP','EP6 1.6 turbo','156–200 ch','traction · manuelle 6 / auto',''],
        ['RCZ R','EP6 1.6 turbo, vilebrequin et bielles renforcés','270 ch','traction · manuelle 6, différentiel Torsen','170 ch/L : record de puissance spécifique pour un moteur de série à sa sortie. Signée Peugeot Sport.'],
      ]},
    ],
    'peugeot-208': [
      { c:'A9 (I)', a:'2012–2019', m:[
        ['1.0 – 1.6','3 et 4 cyl. essence et BlueHDi','68–120 ch','traction · manuelle 5/6',''],
        ['GTi','EP6 1.6 THP','200 ch','traction · manuelle 6','Retour du sigle GTI, trente ans après la 205.'],
        ['GTi by Peugeot Sport','EP6 1.6 THP','208 ch','traction · manuelle 6, différentiel Torsen','Voies élargies de 22 mm, freins de RCZ R. Livrée bicolore Coupe Franche.'],
      ]},
      { c:'P21 (II)', a:'2019–', m:[
        ['PureTech / e-208','3 cyl. turbo / électrique','75–156 ch','traction · manuelle 6 / auto 8','Première Peugeot déclinée en électrique dès le lancement.'],
      ]},
    ],
    'peugeot-308': [
      { c:'T7', a:'2007–2013', m:[
        ['1.6 THP / HDi','4 cyl. turbo essence et diesel','95–200 ch','traction · manuelle 5/6 / auto',''],
        ['GTi 200','EP6DTS 1.6 THP','200 ch','traction · manuelle 6',''],
      ]},
      { c:'T9', a:'2013–2021', m:[
        ['PureTech / BlueHDi','3 et 4 cyl. turbo','82–180 ch','traction · manuelle 6 / EAT8','Voiture de l\'Année 2014.'],
        ['GTi 250 / 270 by Peugeot Sport','EP6FDT 1.6 THP','250–270 ch','traction · manuelle 6, différentiel Torsen sur la 270','Freins Alcon 380 mm sur la 270.'],
      ]},
      { c:'P5', a:'2021–', m:[
        ['PureTech / Hybrid','3 cyl. turbo, hybrides rechargeables','110–225 ch','traction · EAT8','Le nouveau logo Peugeot y fait ses débuts.'],
      ]},
    ],

    'citroen-2cv': [
      { c:'A / AZ', a:'1948–1970', m:[
        ['375 – 425 cm³','bicylindre à plat refroidi par air','9–21 ch','traction · manuelle 4 à commande au tableau de bord','Cahier des charges d\'origine : transporter deux paysans et cinquante kilos de pommes de terre à travers un champ labouré sans casser un œuf.'],
      ]},
      { c:'AZAM / Spécial', a:'1970–1990', m:[
        ['2CV4 / 2CV6','bicylindre 435–602 cm³ air','24–29 ch','traction · manuelle 4','Suspension à bras oscillants interconnectés avant-arrière.'],
        ['Charleston','bicylindre 602 cm³ air','29 ch','traction · manuelle 4','Série spéciale bicolore de 1980, si populaire qu\'elle est entrée au catalogue.'],
      ]},
    ],
    'citroen-ds-classic': [
      { c:'DS 19', a:'1955–1966', m:[
        ['DS 19','4 cyl. 1.9 atmo','75–83 ch','traction · boîte hydraulique semi-automatique','Suspension hydropneumatique, freins à disques avant, direction assistée : une décennie d\'avance en 1955.'],
      ]},
      { c:'DS 21 / 23', a:'1965–1975', m:[
        ['DS 21','4 cyl. 2.2 carburateur ou injection','109–125 ch','traction · manuelle 4/5 ou hydraulique','Phares directionnels orientables dès 1967, une première mondiale.'],
        ['DS 23 Injection','4 cyl. 2.3 injection électronique','141 ch','traction · manuelle 5','La plus puissante et la plus recherchée.'],
      ]},
    ],
    'citroen-bx': [
      { c:'BX', a:'1982–1994', m:[
        ['1.1 – 1.9','4 cyl. essence et diesel','55–125 ch','traction, hydropneumatique · manuelle 4/5','Carrosserie dessinée par Bertone, capot et hayon en matériaux composites.'],
        ['GTI 16 soupapes','XU9J4 1.9 16v atmo','155–160 ch','traction · manuelle 5','Le châssis hydropneumatique associé à un 16 soupapes : une combinaison unique.'],
        ['4TC','4 cyl. 2.1 turbo','200 ch','intégrale · manuelle 5','Homologation Groupe B. Un échec sportif complet : 86 exemplaires, dont beaucoup rachetés et détruits par Citroën.'],
      ]},
    ],
    'citroen-saxo-vts': [
      { c:'Phase 1 / 2', a:'1996–2003', m:[
        ['VTR','TU5JP 1.6 8v atmo','90 ch','traction · manuelle 5','La version accessible, très présente en rallye amateur.'],
        ['VTS','TU5J4 1.6 16v atmo','120 ch','traction · manuelle 5','935 kg. Avec la 106 GTI, elle a formé une génération entière de pilotes.'],
      ]},
    ],
    'citroen-xsara': [
      { c:'Phase 1 / 2 / 3', a:'1997–2006', m:[
        ['VTR','1.8 16v atmo','110 ch','traction · manuelle 5',''],
        ['VTS','XU10J4RS 2.0 16v atmo','163–167 ch','traction · manuelle 5','Mécanique de 306 GTI-6, sans la boîte 6 rapports.'],
      ]},
    ],
    'citroen-c6': [
      { c:'C6', a:'2005–2012', m:[
        ['3.0 V6 essence','ES9A 3.0 V6 24v atmo','215 ch','traction, hydractive III+ · auto 6','Lunette arrière concave, affichage tête haute, capot actif pour les piétons.'],
        ['2.7 / 3.0 V6 HDi','V6 turbodiesel biturbo','204–241 ch','traction · auto 6','La dernière grande routière française. 23 000 exemplaires en sept ans.'],
      ]},
    ],

    'renault-clio': [
      { c:'Clio I', a:'1990–1998', m:[
        ['1.1 – 1.9 D','4 cyl. essence et diesel','48–95 ch','traction · manuelle 5','Voiture de l\'Année 1991.'],
        ['16S','F7P 1.8 16v atmo','137–140 ch','traction · manuelle 5','Voies élargies, châssis abaissé. La sportive accessible des années 90.'],
        ['Williams','F7R 2.0 16v atmo','150 ch','traction · manuelle 5','Voies encore élargies, triangles renforcés, boîte à rapports courts. Trois séries, environ 12 100 exemplaires au total.'],
      ]},
      { c:'Clio II', a:'1998–2012', m:[
        ['1.2 – 1.6','4 cyl. essence et dCi','58–110 ch','traction · manuelle 5','La Clio la plus vendue : produite jusqu\'en 2012 sous le nom Clio Campus.'],
        ['V6','L7X 3.0 V6 24v atmo','230–255 ch','moteur central arrière · manuelle 6','Deux places, zéro coffre. Phase 1 assemblée par TWR, phase 2 par Renault Sport à Dieppe.'],
      ]},
      { c:'Clio III / IV / V', a:'2005–', m:[
        ['essence, dCi, E-Tech','3 et 4 cyl., hybride','65–145 ch','traction · manuelle 5/6 / EDC / multimode','La Clio III est la première Clio 5 étoiles EuroNCAP.'],
      ]},
    ],
    'renault-25': [
      { c:'Phase 1 / 2', a:'1984–1992', m:[
        ['essence et diesel','4 cyl. et V6 PRV','75–160 ch','traction · manuelle 5 / auto','Tableau de bord à synthèse vocale. La berline présidentielle de François Mitterrand.'],
        ['V6 Turbo','PRV 2.5 V6 turbo','182–205 ch','traction · manuelle 5','La plus puissante des grandes Renault de l\'époque.'],
      ]},
    ],
    'renault-twingo': [
      { c:'I', a:'1993–2007', m:[
        ['1.2','4 cyl. 1.2 atmo','55–75 ch','traction · manuelle 5 / Easy','Une seule carrosserie, une seule motorisation au lancement : un pari commercial total. Banquette arrière coulissante.'],
      ]},
      { c:'II', a:'2007–2014', m:[
        ['1.2 / 1.6','4 cyl. essence et dCi','60–133 ch','traction · manuelle 5',''],
        ['R.S. 133','F4R 1.6 16v atmo','133 ch','traction · manuelle 5, châssis Cup','Signée Renault Sport : châssis affûté comme un kart. Version R.S. Gordini.'],
      ]},
      { c:'III', a:'2014–2024', m:[
        ['SCe / TCe','3 cyl. atmo et turbo','70–110 ch','moteur arrière, propulsion · manuelle 5 / EDC','Retour au moteur arrière et à la propulsion, quarante ans après la R8. Développée avec Smart.'],
      ]},
    ],
    'renault-espace': [
      { c:'I / II', a:'1984–1996', m:[
        ['2.0 – 2.8 V6','4 cyl. et V6 PRV','103–150 ch','traction · manuelle 5','Carrosserie polyester sur châssis galvanisé, assemblée par Matra. Le monospace européen est né ici.'],
      ]},
      { c:'III / IV', a:'1996–2015', m:[
        ['2.0 – 3.5 V6','4 cyl. et V6, essence et dCi','115–245 ch','traction · manuelle 6 / auto','La production passe de Matra à Renault en 2002.'],
      ]},
      { c:'V / VI', a:'2015–', m:[
        ['TCe / Blue dCi / E-Tech','4 cyl. turbo, hybride','131–200 ch','traction, roues arrière directrices · EDC','Abandon du monospace au profit d\'une silhouette de grand SUV en 2023.'],
      ]},
    ],
    'alpine-a310': [
      { c:'4 cylindres', a:'1971–1976', m:[
        ['1600 VE','4 cyl. 1.6 atmo','127 ch','moteur arrière, propulsion · manuelle 5','Six phares en façade sous une glace unique. Coque polyester sur poutre centrale.'],
      ]},
      { c:'V6', a:'1976–1984', m:[
        ['V6 2.7','PRV 2.7 V6 atmo','150 ch','moteur arrière, propulsion · manuelle 5','L\'arrivée du V6 PRV transforme le caractère de la voiture.'],
        ['V6 GT / Pack GT','PRV 2.7 V6 atmo','193 ch','moteur arrière · manuelle 5','Voies élargies, ailes évasées.'],
      ]},
    ],
    'alpine-gta': [
      { c:'GTA', a:'1985–1991', m:[
        ['V6 atmo','PRV 2.8 V6 atmo','160 ch','moteur arrière, propulsion · manuelle 5','Cx de 0,28 : l\'une des meilleures aérodynamiques de son époque.'],
        ['V6 Turbo','PRV 2.5 V6 turbo','200 ch','moteur arrière · manuelle 5','La série Mille Miles, 100 exemplaires, est la plus recherchée.'],
      ]},
      { c:'A610', a:'1991–1995', m:[
        ['A610 Turbo','PRV 3.0 V6 turbo','250 ch','moteur arrière, propulsion · manuelle 5','Phares escamotables, châssis entièrement revu. 818 exemplaires seulement : un échec commercial devenu une rareté.'],
      ]},
    ],
    'bugatti-veyron': [
      { c:'16.4', a:'2005–2011', m:[
        ['Veyron 16.4','W16 8.0 quadriturbo','1 001 ch','intégrale · DSG 7 à double embrayage','Première voiture de série à franchir les 400 km/h. Dix radiateurs, quatre turbos.'],
        ['Grand Sport','W16 8.0 quadriturbo','1 001 ch','intégrale · DSG 7','Version targa, 150 exemplaires.'],
      ]},
      { c:'Super Sport', a:'2010–2015', m:[
        ['Super Sport','W16 8.0 quadriturbo','1 200 ch','intégrale · DSG 7','431,072 km/h en 2010 : record du monde pour une voiture de série homologuée.'],
        ['Grand Sport Vitesse','W16 8.0 quadriturbo','1 200 ch','intégrale · DSG 7','408,84 km/h cheveux au vent : record pour un cabriolet.'],
      ]},
    ],


    /* ================= VAGUE 4 — Royaume-Uni et Italie exotique ============ */

    'jaguar-etype': [
      { c:'Série 1', a:'1961–1968', m:[
        ['3.8 / 4.2','6 en ligne XK 3.8–4.2 atmo','265 ch','propulsion · manuelle 4','Phares carénés, freins à disques aux quatre roues. Enzo Ferrari l\'aurait qualifiée de plus belle voiture du monde.'],
      ]},
      { c:'Série 2', a:'1968–1971', m:[
        ['4.2','6 en ligne XK 4.2 atmo','245 ch','propulsion · manuelle 4','Phares découverts et pare-chocs élargis, imposés par la réglementation américaine.'],
      ]},
      { c:'Série 3', a:'1971–1975', m:[
        ['5.3 V12','V12 5.3 atmo','272 ch','propulsion · manuelle 4 / auto 3','Empattement long uniquement. Le premier V12 de grande série de l\'après-guerre.'],
      ]},
    ],
    'jaguar-ftype': [
      { c:'X152', a:'2013–2024', m:[
        ['4 cyl. / V6','2.0 turbo / V6 3.0 compressé','300–400 ch','propulsion ou intégrale · auto 8','Le V6 compressé et son échappement à valves : l\'une des sonorités les plus démonstratives du marché.'],
        ['R / R-Dynamic','V8 5.0 compressé','550–575 ch','propulsion ou intégrale · auto 8',''],
        ['SVR','V8 5.0 compressé','575 ch','intégrale · auto 8','Échappement titane, 322 km/h.'],
        ['Project 7 / Project 8','V8 5.0 compressé','575–600 ch','propulsion ou intégrale · auto 8','La Project 8, 300 exemplaires, a détenu le record des berlines au Nürburgring.'],
      ]},
    ],
    'jaguar-xk': [
      { c:'X100 (XK8)', a:'1996–2005', m:[
        ['XK8','AJ-V8 4.0–4.2 atmo','294–304 ch','propulsion · auto 5/6','Premier V8 de l\'histoire de Jaguar.'],
        ['XKR','AJ-V8 4.0–4.2 compressé','370–406 ch','propulsion · auto 5/6',''],
      ]},
      { c:'X150', a:'2006–2014', m:[
        ['XK','AJ-V8 4.2–5.0 atmo','298–385 ch','propulsion · auto 6','Structure tout aluminium rivetée-collée.'],
        ['XKR / XKR-S','AJ-V8 4.2–5.0 compressé','416–550 ch','propulsion · auto 6','La XKR-S de 2011, 550 ch, est la Jaguar de série la plus rapide de son époque.'],
      ]},
    ],
    'jaguar-xjs': [
      { c:'Pre-HE / HE', a:'1975–1991', m:[
        ['5.3 V12','V12 5.3 atmo','285–295 ch','propulsion · manuelle 4 / auto 3','La culasse May Fireball de 1981 divise la consommation par deux — ce qui a sauvé le modèle.'],
        ['3.6 / 4.0 six cylindres','AJ6 3.6–4.0 atmo','223–241 ch','propulsion · manuelle 5 / auto','L\'option raisonnable, aujourd\'hui la plus facile à entretenir.'],
      ]},
      { c:'Facelift', a:'1991–1996', m:[
        ['6.0 V12','V12 6.0 atmo','308 ch','propulsion · auto 4',''],
        ['XJR-S (TWR)','V12 6.0 préparé par TWR','333 ch','propulsion · auto 3','Préparée par Tom Walkinshaw Racing, l\'écurie victorieuse au Mans en 1988.'],
      ]},
    ],
    'landrover-defender': [
      { c:'Série / 90-110 d\'origine', a:'1948–2016', m:[
        ['Essence et diesel atmo','4 cyl. 2.25–2.5, V8 3.5–3.9','60–134 ch','4x4 permanent, ponts rigides · manuelle 4/5','Châssis échelle et carrosserie aluminium — le même principe pendant soixante-huit ans.'],
        ['Td5','5 en ligne 2.5 turbodiesel','122 ch','4x4 permanent · manuelle 5','Le dernier bloc conçu spécifiquement pour le Defender.'],
        ['Puma 2.2 / 2.4 TDCi','4 cyl. turbodiesel Ford','122 ch','4x4 permanent · manuelle 6','Fin de production en janvier 2016, après plus de deux millions d\'exemplaires.'],
      ]},
      { c:'L663', a:'2020–', m:[
        ['D250 / D300','6 en ligne 3.0 diesel hybridé','249–300 ch','4x4 permanent · auto 8','Rupture totale : monocoque aluminium, plus de châssis séparé. Décision très clivante chez les puristes.'],
        ['P400 / P525 / P635','6 en ligne 3.0 essence / V8 5.0 compressé','400–635 ch','4x4 permanent · auto 8','Le V8 est fourni par Jaguar ; la Defender OCTA de 2024 reçoit le V8 BMW de 635 ch.'],
      ]},
    ],
    'landrover-rangerover': [
      { c:'Classic', a:'1970–1996', m:[
        ['3.5 / 3.9 V8','V8 Rover 3.5–3.9 atmo','132–182 ch','4x4 permanent · manuelle 4/5 / auto','Le premier 4x4 à combiner franchissement et confort routier. Exposé au Louvre en 1971 comme œuvre de design industriel.'],
      ]},
      { c:'P38A', a:'1994–2002', m:[
        ['4.0 / 4.6 V8','V8 4.0–4.6 atmo','185–225 ch','4x4 permanent · auto 4','Suspension pneumatique, réputée fragile mais révolutionnaire à l\'époque.'],
      ]},
      { c:'L322', a:'2002–2012', m:[
        ['V8 essence et diesel','V8 4.2 compressé / V8 TDV8 4.4','272–510 ch','4x4 permanent · auto 6','Développée sous l\'ère BMW : électronique et châssis d\'origine allemande.'],
      ]},
      { c:'L405 / L460', a:'2012–', m:[
        ['SDV6 / P400 / P530','V6, 6 en ligne, V8 4.4 biturbo BMW','249–615 ch','4x4 permanent · auto 8','Première structure monocoque tout aluminium du segment : 420 kg de moins que la L322.'],
      ]},
    ],
    'aston-vantage': [
      { c:'VH (V8 Vantage)', a:'2005–2017', m:[
        ['V8 4.3','V8 4.3 atmo','385 ch','propulsion transaxle · manuelle 6 / Sportshift','Boîte accolée au pont arrière, répartition proche de 50/50.'],
        ['V8 4.7 / S / GT','V8 4.7 atmo','420–436 ch','propulsion · manuelle 6 / Sportshift II',''],
        ['V12 Vantage','V12 5.9 atmo','517 ch','propulsion · manuelle 6','Le plus gros moteur maison dans la plus petite carrosserie : un exercice assumé de démesure.'],
        ['V12 Vantage S','V12 5.9 atmo','573 ch','propulsion · Sportshift III / manuelle 7',''],
      ]},
      { c:'AM6 (2018+)', a:'2018–', m:[
        ['V8','V8 4.0 biturbo (AMG)','510–535 ch','propulsion · auto 8 / manuelle 7','Moteur fourni par Mercedes-AMG, différentiel électronique arrière.'],
        ['F1 Edition / 2024','V8 4.0 biturbo','535–665 ch','propulsion · auto 8','La version 2024, 665 ch, est la Vantage la plus puissante jamais produite.'],
      ]},
    ],
    'aston-db9': [
      { c:'VH', a:'2004–2016', m:[
        ['DB9','V12 5.9 atmo','456–477 ch','propulsion transaxle · manuelle 6 / auto 6','Première Aston sur plateforme VH. Dessinée par Henrik Fisker.'],
        ['DB9 GT','V12 5.9 atmo','547 ch','propulsion · auto 8','Ultime évolution, 2015.'],
      ]},
    ],
    'aston-db11': [
      { c:'DB11', a:'2016–2023', m:[
        ['V12','V12 5.2 biturbo','608–639 ch','propulsion · auto 8','Premier V12 turbo d\'Aston Martin. Aéro AeroBlade sans aileron visible.'],
        ['V8','V8 4.0 biturbo (AMG)','510–535 ch','propulsion · auto 8','115 kg de moins sur l\'avant : plus agile que la V12 selon la plupart des essayeurs.'],
      ]},
    ],
    'mclaren-720s': [
      { c:'720S', a:'2017–2022', m:[
        ['720S','M840T 4.0 V8 biturbo','720 ch','propulsion · DCT 7','Monocage II carbone, portes en dièdre, suspension hydraulique interconnectée sans barres anti-roulis.'],
        ['765LT','M840T 4.0 V8 biturbo','765 ch','propulsion · DCT 7','80 kg de moins, voie élargie, échappement titane. 765 exemplaires.'],
      ]},
      { c:'750S', a:'2023–', m:[
        ['750S','M840T 4.0 V8 biturbo','750 ch','propulsion · DCT 7','30 kg de moins que la 720S, rapports raccourcis.'],
      ]},
    ],
    'mclaren-570s': [
      { c:'Sports Series', a:'2015–2021', m:[
        ['540C / 570S','M838TE 3.8 V8 biturbo','540–570 ch','propulsion · DCT 7','La McLaren d\'accès, mais avec le même châssis carbone que les modèles supérieurs.'],
        ['600LT','M838TE 3.8 V8 biturbo','600 ch','propulsion · DCT 7','Échappements sortant par le capot moteur. 100 kg de moins.'],
      ]},
    ],
    'bentley-continental': [
      { c:'1re gén.', a:'2003–2011', m:[
        ['GT W12','W12 6.0 biturbo','560–610 ch','intégrale · auto 6','La Bentley qui a sauvé la marque : plus de 20 000 exemplaires.'],
        ['Supersports','W12 6.0 biturbo','630 ch','intégrale · auto 6','110 kg de moins, 2 places.'],
      ]},
      { c:'2e gén.', a:'2011–2018', m:[
        ['GT V8 / V8 S','V8 4.0 biturbo (Audi)','507–528 ch','intégrale · auto 8','Désactivation de cylindres : consommation en nette baisse par rapport au W12.'],
        ['GT Speed','W12 6.0 biturbo','626–642 ch','intégrale · auto 8','331 km/h.'],
      ]},
      { c:'3e gén.', a:'2018–', m:[
        ['GT V8 / W12 / Speed','V8 4.0 biturbo / W12 6.0 biturbo','550–659 ch','intégrale, roues arrière directrices · DCT 8','Le W12 est arrêté en 2024, après vingt-et-un ans de service.'],
      ]},
    ],
    'lotus-exige': [
      { c:'S1', a:'2000–2001', m:[
        ['Exige','Rover K-Series 1.8 atmo','177–192 ch','propulsion · manuelle 5','Version fermée de l\'Elise, à aileron fixe. 604 exemplaires.'],
      ]},
      { c:'S2', a:'2004–2011', m:[
        ['Exige S','Toyota 2ZZ 1.8 à compresseur','218–260 ch','propulsion · manuelle 6',''],
      ]},
      { c:'S3', a:'2012–2021', m:[
        ['Exige S / Sport 350','Toyota 2GR 3.5 V6 compressé','345–350 ch','propulsion · manuelle 6','Le V6 compressé dans moins de 1 200 kg.'],
        ['Sport 410 / Cup 430','Toyota 3.5 V6 compressé','416–436 ch','propulsion · manuelle 6','La Cup 430 : 430 ch pour 1 056 kg. La Lotus de route la plus rapide sur circuit.'],
      ]},
    ],
    'lotus-esprit': [
      { c:'S1 – S3', a:'1976–1987', m:[
        ['2.0 / 2.2','4 cyl. 2.0–2.2 atmo','160–172 ch','propulsion · manuelle 5','Dessinée par Giugiaro. La sous-marine de James Bond.'],
        ['Turbo','4 cyl. 2.2 turbo','210 ch','propulsion · manuelle 5',''],
      ]},
      { c:'X180 / S4', a:'1987–1996', m:[
        ['Turbo SE','4 cyl. 2.2 turbo','264 ch','propulsion · manuelle 5','Carrosserie redessinée par Peter Stevens, futur styliste de la McLaren F1.'],
      ]},
      { c:'V8', a:'1996–2004', m:[
        ['V8 / V8 GT','V8 3.5 biturbo maison','350 ch','propulsion · manuelle 5','Le seul V8 jamais conçu par Lotus. Boîte volontairement limitée en couple pour survivre.'],
      ]},
    ],
    'tvr-griffith': [
      { c:'Griffith', a:'1991–2002', m:[
        ['4.0 / 4.3','V8 Rover 4.0–4.3 atmo','240–280 ch','propulsion · manuelle 5','Environ 1 060 kg. Ni ABS, ni airbags, ni contrôle de traction : doctrine TVR.'],
        ['500','V8 Rover 5.0 atmo','320–340 ch','propulsion · manuelle 5','Poignées de portes invisibles, ouverture par bouton caché sous le rétroviseur.'],
      ]},
    ],
    'tvr-cerbera': [
      { c:'Cerbera', a:'1996–2006', m:[
        ['4.2 / 4.5 AJP V8','V8 AJP 4.2–4.5 atmo maison','350–420 ch','propulsion · manuelle 5','Premier moteur conçu par TVR. Vilebrequin plat, son inimitable.'],
        ['Speed Six 4.0','6 en ligne 4.0 atmo maison','350–360 ch','propulsion · manuelle 5',''],
        ['Speed 12','V12 7.7 atmo','800 ch (estimé)','propulsion · manuelle 6','Projet abandonné : le patron de TVR l\'a jugée trop dangereuse pour la route. Un seul exemplaire vendu.'],
      ]},
    ],

    'ferrari-360': [
      { c:'360', a:'1999–2005', m:[
        ['Modena / Spider','F131 3.6 V8 atmo','400 ch','moteur central · manuelle 6 à grille / F1','Premier châssis tout aluminium de Ferrari. La boîte manuelle à grille est aujourd\'hui très recherchée.'],
        ['Challenge Stradale','F131 3.6 V8 atmo','425 ch','moteur central · F1 6','110 kg de moins, freins carbone-céramique. 1 288 exemplaires.'],
      ]},
    ],
    'ferrari-f430': [
      { c:'F430', a:'2004–2009', m:[
        ['F430 / Spider','F136 4.3 V8 atmo','490 ch','moteur central · manuelle 6 / F1','Premier différentiel électronique E-Diff et molette manettino au volant.'],
        ['430 Scuderia','F136 4.3 V8 atmo','510 ch','moteur central · F1 superfast','100 kg de moins, mise au point avec Michael Schumacher.'],
        ['Scuderia Spider 16M','F136 4.3 V8 atmo','510 ch','moteur central · F1','499 exemplaires, célébrant le 16e titre constructeurs.'],
      ]},
    ],
    'ferrari-458': [
      { c:'458', a:'2009–2015', m:[
        ['Italia / Spider','F136 4.5 V8 atmo','570 ch','moteur central · DCT 7','9 000 tr/min. La dernière Ferrari V8 atmosphérique à moteur central.'],
        ['Speciale / Speciale A','F136 4.5 V8 atmo','605 ch','moteur central · DCT 7','133 ch/L : record de puissance spécifique pour un atmosphérique de série.'],
      ]},
    ],
    'ferrari-488': [
      { c:'488', a:'2015–2019', m:[
        ['GTB / Spider','F154 3.9 V8 biturbo','670 ch','moteur central · DCT 7','Retour du turbo sur une Ferrari V8, trente ans après la F40.'],
        ['Pista / Pista Spider','F154 3.9 V8 biturbo','720 ch','moteur central · DCT 7','90 kg de moins, technologie issue des 488 Challenge et GTE.'],
      ]},
    ],
    'ferrari-f8': [
      { c:'F8', a:'2019–2023', m:[
        ['Tributo / Spider','F154 3.9 V8 biturbo','720 ch','moteur central · DCT 7','Lunette arrière à persiennes, en hommage à la F40.'],
      ]},
    ],
    'ferrari-296': [
      { c:'296', a:'2021–', m:[
        ['GTB / GTS','V6 3.0 biturbo + électrique','830 ch cumulés','moteur central · DCT 8','Premier V6 de route de Ferrari depuis la Dino. Turbos logés dans le V à 120°.'],
        ['Assetto Fiorano','V6 3.0 biturbo hybride','830 ch','moteur central · DCT 8','Amortisseurs Multimatic, portes carbone, pneus semi-slicks.'],
      ]},
    ],
    'ferrari-812': [
      { c:'812', a:'2017–', m:[
        ['Superfast / GTS','F140 6.5 V12 atmo','800 ch','moteur avant · DCT 7','8 900 tr/min. Le V12 atmosphérique le plus puissant jamais monté en position avant.'],
        ['Competizione','F140 6.5 V12 atmo','830 ch','moteur avant · DCT 7','9 500 tr/min. Bielles titane, distribution à poussoirs traités DLC. 999 exemplaires.'],
      ]},
    ],
    'ferrari-599': [
      { c:'599', a:'2006–2012', m:[
        ['GTB Fiorano','F140 6.0 V12 atmo','620 ch','moteur avant transaxle · manuelle 6 / F1','Suspension magnétorhéologique, une première chez Ferrari.'],
        ['GTO','F140 6.0 V12 atmo','670 ch','moteur avant · F1 6','599 exemplaires. La Ferrari de route la plus rapide de son époque.'],
      ]},
    ],
    'lambo-gallardo': [
      { c:'Pré-LP', a:'2003–2008', m:[
        ['Gallardo','V10 5.0 atmo','500–520 ch','intégrale · manuelle 6 à grille / e-gear','Le modèle le plus vendu de l\'histoire de Lamborghini.'],
        ['Superleggera','V10 5.0 atmo','530 ch','intégrale · e-gear','70 kg de moins grâce au carbone.'],
      ]},
      { c:'LP560', a:'2008–2013', m:[
        ['LP560-4','V10 5.2 atmo à injection directe','560 ch','intégrale · manuelle 6 / e-gear',''],
        ['LP570-4 Superleggera / Performante','V10 5.2 atmo','570 ch','intégrale · e-gear','1 340 kg à sec.'],
        ['LP550-2','V10 5.2 atmo','550 ch','propulsion · manuelle 6 / e-gear','Version propulsion, aujourd\'hui la plus recherchée par les puristes.'],
      ]},
    ],
    'lambo-murcielago': [
      { c:'Murciélago', a:'2001–2010', m:[
        ['6.2 / 6.5 LP640','V12 6.2–6.5 atmo','580–640 ch','intégrale · manuelle 6 à grille / e-gear','Prises d\'air latérales mobiles, pilotées par la température moteur.'],
        ['LP670-4 SV','V12 6.5 atmo','670 ch','intégrale · e-gear','100 kg de moins, aileron Aeropack. 186 exemplaires. Le dernier V12 à boîte manuelle disponible.'],
      ]},
    ],
    'lambo-aventador': [
      { c:'LP700', a:'2011–2016', m:[
        ['LP700-4','V12 6.5 atmo','700 ch','intégrale · ISR 7 monodisque','Monocoque carbone de 147 kg. Suspension à poussoirs, dérivée de la F1.'],
        ['LP750-4 SV','V12 6.5 atmo','750 ch','intégrale · ISR 7','50 kg de moins, aéro active. 600 exemplaires.'],
      ]},
      { c:'S / SVJ / Ultimae', a:'2017–2022', m:[
        ['S','V12 6.5 atmo','740 ch','intégrale, roues arrière directrices · ISR 7',''],
        ['SVJ','V12 6.5 atmo','770 ch','intégrale · ISR 7','Aéro active ALA 2.0. Record du tour au Nürburgring pour une voiture de série en 2018.'],
        ['Ultimae','V12 6.5 atmo','780 ch','intégrale · ISR 7','600 exemplaires. Fin d\'un V12 atmosphérique sans hybridation, après onze ans.'],
      ]},
    ],
    'lambo-urus': [
      { c:'Urus', a:'2018–', m:[
        ['Urus','V8 4.0 biturbo','650 ch','intégrale · auto 8','Le SUV qui a doublé le volume de production de Lamborghini.'],
        ['Performante','V8 4.0 biturbo','666 ch','intégrale · auto 8','47 kg de moins, garde au sol abaissée, mode Rally sur gravier.'],
        ['SE','V8 4.0 biturbo hybride rechargeable','800 ch','intégrale · auto 8','Premier Lamborghini hybride rechargeable de série.'],
      ]},
    ],
    'maserati-granturismo': [
      { c:'M145', a:'2007–2019', m:[
        ['4.2 / 4.7 S','V8 4.2–4.7 atmo (bloc Ferrari)','405–460 ch','propulsion · auto 6 / MC Shift','Moteur assemblé à Maranello. L\'une des sonorités les plus célébrées des années 2000.'],
        ['MC Stradale','V8 4.7 atmo','460 ch','propulsion · MC Shift 6','110 kg de moins, 2 puis 4 places.'],
      ]},
      { c:'M189', a:'2023–', m:[
        ['Modena / Trofeo','V6 3.0 biturbo Nettuno','490–550 ch','intégrale · auto 8','Préchambre d\'allumage dérivée de la F1.'],
        ['Folgore','trois moteurs électriques, 800 V','761 ch','intégrale','Première Maserati de série 100 % électrique.'],
      ]},
    ],
    'maserati-mc20': [
      { c:'MC20', a:'2020–', m:[
        ['MC20 / Cielo','V6 3.0 biturbo Nettuno','630 ch','moteur central · DCT 8','Monocoque carbone Dallara. Le Nettuno est le premier moteur conçu par Maserati depuis vingt ans.'],
      ]},
    ],


    /* ================= VAGUE 3 — Japon ===================================== */

    'toyota-supra-mk4': [
      { c:'A80', a:'1993–2002', m:[
        ['SZ / SZ-R','2JZ-GE 3.0 · 6 en ligne atmo','220–225 ch','propulsion · manuelle 5 / auto 4','La version atmosphérique, souvent oubliée, mais base de préparation valable.'],
        ['RZ / Turbo (Japon)','2JZ-GTE 3.0 biturbo séquentiel','280 ch','propulsion · manuelle 6 Getrag V160 / auto 4','Bridée à 280 ch par l\'accord entre constructeurs japonais.'],
        ['Turbo (export)','2JZ-GTE 3.0 biturbo séquentiel','326 ch','propulsion · manuelle 6 Getrag V161','Bloc fonte réputé encaisser le double de sa puissance sans ouverture — l\'origine du mythe.'],
      ]},
    ],
    'toyota-supra-mk3': [
      { c:'A70', a:'1986–1993', m:[
        ['3.0 Turbo','7M-GTE 3.0 turbo','232 ch','propulsion · manuelle 5 / auto 4','Première Supra détachée de la Celica.'],
        ['2.5 Twin Turbo R (Japon)','1JZ-GTE 2.5 biturbo','280 ch','propulsion · manuelle 5','Le premier 2JZ n\'existe pas encore : c\'est le 1JZ qui inaugure la lignée biturbo.'],
      ]},
    ],
    'toyota-gr-supra': [
      { c:'A90 / A91', a:'2019–', m:[
        ['GR Supra 2.0','B48 2.0 turbo (BMW)','258 ch','propulsion · auto 8','Environ 100 kg de moins que la 3.0 : la préférée de certains essayeurs sur route sinueuse.'],
        ['GR Supra 3.0','B58 3.0 · 6 en ligne turbo (BMW)','340 ch','propulsion · auto 8','Développée avec BMW, plateforme partagée avec la Z4 G29.'],
        ['GR Supra 3.0 (2021+)','B58 3.0 turbo révisé','387 ch','propulsion · auto 8 / manuelle 6 (dès 2022)','L\'arrivée de la boîte manuelle en 2022 répond à une demande insistante des clients.'],
      ]},
    ],
    'toyota-ae86': [
      { c:'AE86', a:'1983–1987', m:[
        ['Levin (phares fixes)','4A-GE 1.6 16v atmo','124–130 ch','propulsion · manuelle 5, autobloquant en option','Environ 950 kg. La dernière Corolla à propulsion.'],
        ['Trueno (phares escamotables)','4A-GE 1.6 16v atmo','124–130 ch','propulsion · manuelle 5','La silhouette d\'Initial D. Devenue le symbole mondial du drift.'],
      ]},
    ],
    'toyota-mr2': [
      { c:'AW11', a:'1984–1989', m:[
        ['1.6 atmo','4A-GE 1.6 16v atmo','116–130 ch','moteur central · manuelle 5','Première japonaise à moteur central produite en grande série.'],
        ['1.6 Supercharger','4A-GZE 1.6 à compresseur','145–150 ch','moteur central · manuelle 5','Japon et États-Unis principalement.'],
      ]},
      { c:'SW20', a:'1989–1999', m:[
        ['2.0 atmo','3S-GE 2.0 16v','156–180 ch','moteur central · manuelle 5',''],
        ['2.0 Turbo (GT / Turbo)','3S-GTE 2.0 turbo','225–245 ch','moteur central · manuelle 5','Comportement réputé piégeux sur les premières séries, corrigé au fil des révisions.'],
      ]},
      { c:'W30 (MR-S)', a:'1999–2007', m:[
        ['1.8 VVT-i','1ZZ-FE 1.8 atmo','140 ch','moteur central · manuelle 5/6 / SMT','Moins de 1 000 kg, roadster pur, sans coffre.'],
      ]},
    ],
    'toyota-celica': [
      { c:'T160 / T180', a:'1985–1993', m:[
        ['GT-Four ST165','3S-GTE 2.0 turbo','190 ch','intégrale · manuelle 5','La première GT-Four : née pour homologuer Toyota en rallye mondial.'],
        ['GT-Four ST185','3S-GTE 2.0 turbo','204–225 ch','intégrale · manuelle 5','Championne du monde des rallyes 1992, 1993 et 1994.'],
      ]},
      { c:'T200 / T230', a:'1993–2006', m:[
        ['GT-Four ST205','3S-GTE 2.0 turbo','239–255 ch','intégrale · manuelle 5','2 500 exemplaires d\'homologation. Aileron surélevé et refroidissement par eau du turbo.'],
        ['T230 (1.8 VVTL-i)','2ZZ-GE 1.8 atmo','143–192 ch','traction · manuelle 6','Dernière Celica, culasse co-développée avec Yamaha, rupteur à 8 200 tr/min.'],
      ]},
    ],
    'toyota-gr86': [
      { c:'ZN6 (GT86)', a:'2012–2020', m:[
        ['GT86 / FR-S','FA20 2.0 flat-4 atmo','200 ch','propulsion · manuelle 6 / auto 6','Co-développée avec Subaru. Centre de gravité parmi les plus bas du marché.'],
      ]},
      { c:'ZN8 (GR86)', a:'2021–', m:[
        ['GR86','FA24 2.4 flat-4 atmo','234 ch','propulsion · manuelle 6 / auto 6','Cylindrée augmentée pour combler le creux de couple, principal reproche fait à la ZN6.'],
      ]},
    ],
    'toyota-gr-yaris': [
      { c:'GXPA16', a:'2020–2023', m:[
        ['GR Yaris','G16E-GTS 1.6 · 3 cyl. turbo','261 ch','intégrale GR-Four · manuelle 6','Le trois-cylindres turbo le plus puissant du marché à sa sortie. Toit carbone, portes et hayon aluminium.'],
        ['Circuit / Track Pack','G16E-GTS 1.6 turbo','261 ch','intégrale, différentiels Torsen · manuelle 6','Amortisseurs et jantes forgées BBS.'],
      ]},
      { c:'Restylée', a:'2024–', m:[
        ['GR Yaris','G16E-GTS 1.6 turbo','280 ch','intégrale GR-Four · manuelle 6 / auto 8','Poste de conduite rabaissé et boîte automatique développée pour le rallye.'],
      ]},
    ],
    'toyota-chaser': [
      { c:'JZX100', a:'1996–2001', m:[
        ['Tourer V','1JZ-GTE 2.5 turbo','280 ch','propulsion · manuelle 5 / auto 4','Berline discrète à propulsion et gros turbo : la définition japonaise du loup déguisé.'],
      ]},
    ],
    'lexus-is': [
      { c:'XE10', a:'1998–2005', m:[
        ['IS200','1G-FE 2.0 · 6 en ligne atmo','155 ch','propulsion · manuelle 6 / auto','Vendue en Europe comme alternative à la Série 3.'],
        ['IS300','2JZ-GE 3.0 · 6 en ligne atmo','215 ch','propulsion · manuelle 5 / auto','Le bloc de la Supra en version atmosphérique.'],
      ]},
      { c:'XE20', a:'2005–2013', m:[
        ['IS250 / IS350','V6 2.5–3.5 atmo','208–306 ch','propulsion · auto 6',''],
        ['IS-F','2UR-GSE 5.0 · V8 atmo','423 ch','propulsion · auto 8','Le premier modèle « F » de Lexus. Échappement à quatre sorties superposées.'],
      ]},
      { c:'XE30', a:'2013–', m:[
        ['IS300h / IS350','4 cyl. hybride / V6 3.5 atmo','223–318 ch','propulsion · CVT ou auto 8',''],
      ]},
    ],
    'lexus-rcf': [
      { c:'XC10', a:'2014–', m:[
        ['RC F','2UR-GSE 5.0 · V8 atmo','477 ch','propulsion · auto 8, différentiel vectoriel','L\'un des derniers V8 atmosphériques de grande série.'],
        ['RC F Track Edition','2UR-GSE 5.0 · V8 atmo','477 ch','propulsion · auto 8','Allégée de 80 kg : carbone, freins Brembo carbone-céramique, échappement titane.'],
      ]},
    ],

    'nissan-skyline-r32': [
      { c:'BNR32', a:'1989–1994', m:[
        ['GT-R','RB26DETT 2.6 biturbo','280 ch (officiel)','intégrale ATTESA E-TS · manuelle 5','Bridée à 280 ch par l\'accord japonais ; la valeur réelle était supérieure. Invaincue en Groupe A australien, d\'où le surnom Godzilla.'],
        ['GT-R V-Spec / V-Spec II','RB26DETT 2.6 biturbo','280 ch','intégrale ATTESA E-TS Pro · manuelle 5','Différentiel arrière actif et freins Brembo.'],
        ['GT-R Nismo','RB26DETT 2.6 biturbo','280 ch','intégrale · manuelle 5','560 exemplaires d\'homologation Groupe A, sans ABS ni climatisation.'],
      ]},
    ],
    'nissan-skyline-r33': [
      { c:'BCNR33', a:'1995–1998', m:[
        ['GT-R','RB26DETT 2.6 biturbo','280 ch','intégrale ATTESA E-TS Pro · manuelle 5','Première voiture de série sous les 8 minutes au Nürburgring (1996).'],
        ['GT-R V-Spec','RB26DETT 2.6 biturbo','280 ch','intégrale ATTESA E-TS Pro · manuelle 5',''],
        ['400R (Nismo)','RBX-GT2 2.8 biturbo','400 ch','intégrale · manuelle 5','44 exemplaires. La plus rare et la plus chère de toutes les Skyline.'],
      ]},
    ],
    'nissan-skyline-r34': [
      { c:'BNR34', a:'1999–2002', m:[
        ['GT-R','RB26DETT 2.6 biturbo','280 ch (officiel)','intégrale ATTESA E-TS Pro · manuelle 6 Getrag','Écran multifonction embarqué : une première en 1999.'],
        ['V-Spec / V-Spec II','RB26DETT 2.6 biturbo','280 ch','intégrale · manuelle 6','Diffuseur arrière carbone, châssis raffermi.'],
        ['V-Spec II Nür','RB26DETT bloc N1','280 ch','intégrale · manuelle 6','Bloc renforcé issu de la compétition. 750 exemplaires.'],
        ['Z-Tune (Nismo)','RB28DETT 2.8','500 ch','intégrale · manuelle 6','19 exemplaires construits sur des R34 d\'occasion sélectionnées. La GT-R ultime.'],
      ]},
    ],
    'nissan-gtr': [
      { c:'R35 phase 1', a:'2007–2010', m:[
        ['GT-R','VR38DETT 3.8 V6 biturbo','480–485 ch','intégrale ATTESA E-TS · DCT 6 transaxle','Chaque moteur est assemblé à la main par un seul takumi, dont le nom est apposé sur une plaque.'],
      ]},
      { c:'R35 phase 2', a:'2011–2016', m:[
        ['GT-R','VR38DETT 3.8 biturbo','530–550 ch','intégrale · DCT 6',''],
        ['GT-R Nismo','VR38DETT 3.8 biturbo','600 ch','intégrale · DCT 6','Turbos issus du GT3, aérodynamique carbone.'],
      ]},
      { c:'R35 phase 3', a:'2017–', m:[
        ['GT-R','VR38DETT 3.8 biturbo','570 ch','intégrale · DCT 6','Intérieur entièrement revu après dix ans de carrière.'],
        ['GT-R Nismo','VR38DETT 3.8 biturbo','600 ch','intégrale · DCT 6','Capot, ailes et toit carbone.'],
      ]},
    ],
    'nissan-300zx': [
      { c:'Z32', a:'1989–2000', m:[
        ['3.0 atmo','VG30DE 3.0 V6 atmo','222 ch','propulsion · manuelle 5 / auto',''],
        ['3.0 Twin Turbo','VG30DETT 3.0 V6 biturbo','280 ch (Japon) / 300 ch (export)','propulsion · manuelle 5','Roues arrière directrices Super HICAS. Design resté remarquablement moderne.'],
      ]},
    ],
    'nissan-350z': [
      { c:'Z33', a:'2002–2009', m:[
        ['350Z','VQ35DE 3.5 V6 atmo','280–313 ch','propulsion · manuelle 6 / auto 5','Le retour de la Z après cinq ans d\'absence. Barre anti-rapprochement visible dans le coffre.'],
        ['350Z HR','VQ35HR 3.5 V6 atmo','313 ch','propulsion · manuelle 6','Bloc à haut régime, capot rehaussé pour le loger.'],
      ]},
    ],
    'nissan-370z': [
      { c:'Z34', a:'2009–2020', m:[
        ['370Z','VQ37VHR 3.7 V6 atmo','331 ch','propulsion · manuelle 6 / auto 7','Première au monde à proposer le double débrayage automatique à la rétrogradation (SynchroRev Match).'],
        ['370Z Nismo','VQ37VHR 3.7 V6 atmo','344 ch','propulsion · manuelle 6','Échappement et aéro spécifiques, châssis raffermi.'],
      ]},
    ],
    'nissan-silvia-s15': [
      { c:'S15', a:'1999–2002', m:[
        ['Spec-S','SR20DE 2.0 atmo','165 ch','propulsion · manuelle 5/6',''],
        ['Spec-R','SR20DET 2.0 turbo','250 ch','propulsion · manuelle 6, autobloquant hélicoïdal','La dernière Silvia. Icône absolue du drift japonais.'],
      ]},
    ],

    'honda-nsx-na1': [
      { c:'NA1', a:'1990–1997', m:[
        ['NSX 3.0','C30A 3.0 V6 VTEC atmo','274 ch','moteur central · manuelle 5 / auto 4','Châssis tout aluminium, une première mondiale en grande série. Mise au point avec la contribution d\'Ayrton Senna.'],
        ['NSX-R (Japon)','C30A 3.0 V6 atmo','274 ch','moteur central · manuelle 5','Allégée de 120 kg, moteur équilibré à la main. 483 exemplaires.'],
      ]},
      { c:'NA2', a:'1997–2005', m:[
        ['NSX 3.2','C32B 3.2 V6 VTEC atmo','280 ch','moteur central · manuelle 6','Boîte à 6 rapports et embrayage renforcé.'],
        ['NSX-R (2002)','C32B 3.2 V6 atmo','280 ch','moteur central · manuelle 6','140 kg de moins, aéro revue. 140 exemplaires. L\'une des japonaises les plus cotées.'],
      ]},
    ],
    'honda-s2000': [
      { c:'AP1', a:'1999–2003', m:[
        ['S2000','F20C 2.0 atmo','240 ch','propulsion · manuelle 6','9 000 tr/min et 120 ch/L : record de puissance spécifique pour un atmosphérique de série. Train arrière réputé exigeant.'],
      ]},
      { c:'AP2', a:'2004–2009', m:[
        ['S2000 2.2','F22C1 2.2 atmo','242 ch','propulsion · manuelle 6','Cylindrée augmentée et rupteur abaissé à 8 200 tr/min pour gagner en couple et en motricité.'],
        ['Club Racer (USA)','F22C1 2.2 atmo','242 ch','propulsion · manuelle 6','Aéro spécifique, sans capote. 699 exemplaires.'],
      ]},
    ],
    'honda-integra-type-r': [
      { c:'DC2', a:'1995–2001', m:[
        ['Type R','B18C 1.8 VTEC atmo','190 ch (Japon) / 187 ch (Europe)','traction · manuelle 5, autobloquant hélicoïdal','Culasse polie à la main, vilebrequin équilibré. Souvent citée comme la meilleure traction jamais produite.'],
      ]},
      { c:'DC5', a:'2001–2006', m:[
        ['Type R (Japon)','K20A 2.0 VTEC atmo','220 ch','traction · manuelle 6, autobloquant','Freins Brembo, sièges Recaro.'],
        ['Type R (Europe)','K20A2 2.0 atmo','200 ch','traction · manuelle 6','Version européenne sans autobloquant ni Brembo.'],
      ]},
    ],
    'mazda-rx7-fc': [
      { c:'FC3S', a:'1986–1992', m:[
        ['13B atmo','13B birotor 1.3 atmo','146–160 ch','propulsion · manuelle 5',''],
        ['Turbo II','13B-T birotor turbo','185–205 ch','propulsion · manuelle 5','Suspension arrière multibras et système de correction de train.'],
      ]},
    ],
    'mazda-rx7': [
      { c:'FD3S série 6', a:'1991–1995', m:[
        ['Type R / RZ','13B-REW birotor biturbo séquentiel','255 ch','propulsion · manuelle 5','Première application de la suralimentation séquentielle sur un rotatif. Environ 1 250 kg.'],
      ]},
      { c:'FD3S série 7', a:'1996–1998', m:[
        ['Type RS / RB','13B-REW biturbo séquentiel','265 ch','propulsion · manuelle 5','Freins agrandis, suspensions Bilstein sur la RS.'],
      ]},
      { c:'FD3S série 8', a:'1999–2002', m:[
        ['Type R Bathurst / Spirit R','13B-REW biturbo séquentiel','280 ch','propulsion · manuelle 5','La Spirit R, 1 500 exemplaires, clôt la lignée en 2002. La plus cotée des FD.'],
      ]},
    ],
    'mazda-rx8': [
      { c:'SE3P', a:'2003–2012', m:[
        ['Renesis 192','13B-MSP birotor atmo','192 ch','propulsion · manuelle 5 / auto',''],
        ['Renesis 231','13B-MSP birotor atmo','231 ch','propulsion · manuelle 6','9 000 tr/min. Portes arrière antagonistes et quatre vraies places : un rotatif familial.'],
      ]},
    ],
    'subaru-brz': [
      { c:'ZC6', a:'2012–2020', m:[
        ['BRZ','FA20 2.0 flat-4 atmo','200 ch','propulsion · manuelle 6 / auto 6','Jumelle de la GT86, avec un réglage de châssis légèrement plus neutre.'],
      ]},
      { c:'ZD8', a:'2021–', m:[
        ['BRZ','FA24 2.4 flat-4 atmo','234 ch','propulsion · manuelle 6 / auto 6',''],
      ]},
    ],
    'mitsubishi-3000gt': [
      { c:'Z16A', a:'1990–2001', m:[
        ['3000GT / GTO','6G72 3.0 V6 24v atmo','222 ch','traction ou intégrale · manuelle 5',''],
        ['Twin Turbo (VR-4)','6G72 3.0 V6 biturbo','286 ch','intégrale, 4 roues directrices · manuelle 5/6','Aérodynamique active avant et arrière, échappement à géométrie variable : une vitrine technologique de 1990.'],
      ]},
    ],
    'mitsubishi-fto': [
      { c:'DE3A', a:'1994–2000', m:[
        ['GPX / GP Version R','6A12 2.0 V6 MIVEC atmo','200 ch','traction · manuelle 5 / auto 4','Voiture de l\'Année au Japon 1994. Le V6 MIVEC monte à 7 500 tr/min.'],
      ]},
    ],
    'suzuki-swift-sport': [
      { c:'ZC31S', a:'2005–2010', m:[
        ['Swift Sport','M16A 1.6 atmo','125 ch','traction · manuelle 5','Environ 1 050 kg. Châssis salué bien au-delà de son prix.'],
      ]},
      { c:'ZC32S', a:'2011–2016', m:[
        ['Swift Sport','M16A 1.6 atmo','136 ch','traction · manuelle 6',''],
      ]},
      { c:'ZC33S', a:'2017–', m:[
        ['Swift Sport','K14C 1.4 Boosterjet turbo','140 ch','traction · manuelle 6','970 kg : la plus légère de sa catégorie, le couple en hausse compense la puissance modeste.'],
      ]},
    ],
    'suzuki-cappuccino': [
      { c:'EA11R / EA21R', a:'1991–1998', m:[
        ['Cappuccino','F6A puis K6A 657 cm³ · 3 cyl. turbo','64 ch','propulsion · manuelle 5','725 kg, répartition 50/50, toit en trois éléments amovibles. Kei car bridée à 64 ch par la loi japonaise.'],
      ]},
    ],
    'suzuki-jimny': [
      { c:'LJ / SJ', a:'1970–1998', m:[
        ['LJ / SJ 410 / Samurai','2 et 4 cyl. 0.5–1.3','25–70 ch','4x4 enclenchable, châssis échelle · manuelle 4/5','Le 4x4 miniature qui passe là où les gros restent bloqués.'],
      ]},
      { c:'JB23 / JB43', a:'1998–2018', m:[
        ['Jimny','1.3 atmo / 0.66 turbo (Japon)','64–85 ch','4x4 enclenchable · manuelle 5 / auto 4',''],
      ]},
      { c:'JB64 / JB74', a:'2018–', m:[
        ['Jimny','K15B 1.5 atmo','102 ch','4x4 enclenchable, réducteur, ponts rigides · manuelle 5 / auto 4','Retour au style anguleux. Retiré du marché européen en 2020 pour cause de normes CO2, puis revenu en version utilitaire.'],
      ]},
    ],
    'honda-crx': [
      { c:'AF / AS', a:'1983–1987', m:[
        ['1.5i / 1.6i-16','4 cyl. 1.5–1.6 atmo','85–125 ch','traction · manuelle 5','Moins de 850 kg. Le coupé économique devenu culte.'],
      ]},
      { c:'EF (2e gén.)', a:'1987–1991', m:[
        ['1.6i-16 VTEC','B16A 1.6 VTEC atmo','150 ch','traction · manuelle 5','Premier VTEC de série vendu en Europe. 7 800 tr/min pour 850 kg.'],
      ]},
      { c:'EG (del Sol)', a:'1992–1998', m:[
        ['del Sol VTi','B16A2 1.6 VTEC atmo','160 ch','traction · manuelle 5','Toit targa amovible, rangeable dans le coffre.'],
      ]},
    ],
    'honda-prelude': [
      { c:'BA (3e gén.)', a:'1987–1991', m:[
        ['2.0i-16 4WS','4 cyl. 2.0 16v atmo','137–150 ch','traction, 4 roues directrices mécaniques · manuelle 5','Premier système de quatre roues directrices purement mécanique au monde.'],
      ]},
      { c:'BB (4e gén.)', a:'1991–1996', m:[
        ['2.2 VTEC','H22A 2.2 VTEC atmo','185–200 ch','traction · manuelle 5','Le H22A, l\'un des quatre cylindres atmosphériques les plus réputés de Honda.'],
      ]},
      { c:'BB6 (5e gén.)', a:'1996–2001', m:[
        ['2.2 VTi / Type S (Japon)','H22A 2.2 VTEC atmo','185–220 ch','traction · manuelle 5, ATTS sur Type S','L\'ATTS répartit activement le couple entre les roues avant : rarissime sur une traction.'],
      ]},
    ],


    /* ================= VAGUE 2 — Ford Europe, Alfa, Lancia, Fiat, Opel, Mercedes ============ */

    'ford-focus-rs': [
      { c:'Mk1', a:'2002–2003', m:[
        ['Focus RS','Duratec-RE 2.0 turbo','215 ch','traction · manuelle 5, autobloquant Quaife','4 501 exemplaires, tous en bleu Imperial. Voies élargies, 70 % de pièces spécifiques.'],
      ]},
      { c:'Mk2', a:'2009–2011', m:[
        ['Focus RS','Duratec 2.5 · 5 en ligne turbo (base Volvo)','305 ch','traction · manuelle 6, RevoKnuckle','Train avant RevoKnuckle conçu pour contenir le couple. Le cinq-cylindres lui donne son timbre si particulier.'],
        ['Focus RS500','Duratec 2.5 · 5 en ligne turbo','350 ch','traction · manuelle 6','500 exemplaires, tous en noir mat.'],
      ]},
      { c:'Mk3', a:'2016–2018', m:[
        ['Focus RS','EcoBoost 2.3 turbo','350 ch','intégrale GKN Twinster · manuelle 6','Transmission à double embrayage arrière et mode Drift assumé — une première sur une compacte de série.'],
      ]},
    ],
    'ford-fiesta-st': [
      { c:'Mk6', a:'2005–2008', m:[
        ['Fiesta ST150','Duratec 2.0 atmo','150 ch','traction · manuelle 5',''],
      ]},
      { c:'Mk7', a:'2013–2017', m:[
        ['Fiesta ST','EcoBoost 1.6 turbo','182 ch (200 en surpression)','traction · manuelle 6','Châssis unanimement salué : l\'essieu arrière volontairement peu rigide autorise le lever de roue.'],
        ['ST200','EcoBoost 1.6 turbo','200 ch (215 en surpression)','traction · manuelle 6','Série limitée, gris mat Storm.'],
      ]},
      { c:'Mk8', a:'2018–2023', m:[
        ['Fiesta ST','EcoBoost 1.5 · 3 cyl. turbo','200 ch','traction · manuelle 6, autobloquant Quaife en option','Désactivation d\'un cylindre en charge partielle. Dernière Fiesta : la production s\'arrête en 2023.'],
      ]},
    ],
    'ford-sierra-cosworth': [
      { c:'3 portes', a:'1986–1987', m:[
        ['RS Cosworth','YBB 2.0 turbo 16v','204 ch','propulsion · manuelle 5','Aileron « queue de baleine » imposé par l\'homologation Groupe A. 5 545 exemplaires.'],
        ['RS500','YBD 2.0 turbo','224 ch (route)','propulsion · manuelle 5','500 exemplaires, préparés par Aston Martin Tickford. En course, elle dépassait 500 ch et a dominé le Groupe A.'],
      ]},
      { c:'Sapphire', a:'1988–1992', m:[
        ['Sapphire RS Cosworth','YBB 2.0 turbo','204 ch','propulsion · manuelle 5','Carrosserie 4 portes, plus discrète.'],
        ['Sapphire 4x4','YBG/YBJ 2.0 turbo','220 ch','intégrale · manuelle 5','La transmission intégrale prépare le terrain à l\'Escort Cosworth.'],
      ]},
    ],
    'ford-escort-cosworth': [
      { c:'Grand turbo', a:'1992–1994', m:[
        ['RS Cosworth','YBT 2.0 turbo (Garrett T3/T04B)','227 ch','intégrale · manuelle 5','Sous la carrosserie d\'Escort se cache un châssis de Sierra Cosworth 4x4 raccourci.'],
      ]},
      { c:'Petit turbo', a:'1994–1996', m:[
        ['RS Cosworth','YBP 2.0 turbo (Garrett T25)','227 ch','intégrale · manuelle 5','Turbo plus petit : moins de temps de réponse, plus utilisable sur route. 7 145 exemplaires au total.'],
      ]},
    ],
    'ford-mustang-classic': [
      { c:'1964½ – 1966', a:'1964–1966', m:[
        ['260 / 289 V8','V8 4.3–4.7','164–271 ch','propulsion · manuelle 3/4 · auto 3','La GT 289 « K-Code » à 271 ch est la plus recherchée.'],
        ['Shelby GT350','V8 4.7 préparé','306 ch','propulsion · manuelle 4','562 exemplaires en 1965. Homologuée en catégorie B-Production.'],
      ]},
      { c:'1967 – 1970', a:'1967–1970', m:[
        ['390 / 428 Cobra Jet','V8 6.4–7.0','325–335 ch (sous-évalués)','propulsion · manuelle 4 · auto 3','La 428 Cobra Jet était officiellement annoncée à 335 ch, largement en dessous de la réalité, pour raisons d\'assurance.'],
        ['Boss 302','V8 4.9 atmo','290 ch','propulsion · manuelle 4','Homologation Trans-Am.'],
        ['Boss 429','V8 7.0 hémisphérique','375 ch','propulsion · manuelle 4','Construite pour homologuer le moteur en NASCAR. 859 exemplaires.'],
      ]},
    ],

    'alfa-giulia-qv': [
      { c:'952', a:'2016–2020', m:[
        ['Quadrifoglio','V6 2.9 biturbo (690T)','510 ch','propulsion · ZF 8 / manuelle 6 (USA)','Architecture d\'inspiration Ferrari. Arbre de transmission carbone, capot et toit carbone.'],
      ]},
      { c:'952 restylée', a:'2020–', m:[
        ['Quadrifoglio','V6 2.9 biturbo','510 ch','propulsion · ZF 8','Différentiel arrière piloté et électronique revue.'],
        ['GTA / GTAm','V6 2.9 biturbo','540 ch','propulsion · ZF 8','Allégée de 100 kg, voies élargies de 50 mm. La GTAm est une 2 places à arceau. 500 exemplaires.'],
      ]},
    ],
    'alfa-147-gta': [
      { c:'937', a:'2002–2005', m:[
        ['147 GTA','V6 Busso 3.2 24v atmo','250 ch','traction · manuelle 6 / Selespeed','Le V6 Busso, souvent cité comme le plus mélodieux jamais produit, dans une compacte. Motricité difficile de série : les préparations Q2 sont recherchées.'],
      ]},
    ],
    'alfa-156-gta': [
      { c:'932', a:'2001–2005', m:[
        ['156 GTA','V6 Busso 3.2 24v atmo','250 ch','traction · manuelle 6 / Selespeed','Berline et Sportwagon. Le dernier grand chapitre du V6 Busso.'],
      ]},
    ],
    'alfa-4c': [
      { c:'960', a:'2013–2020', m:[
        ['4C','1750 TBi 1.75 turbo, bloc alu','240 ch','propulsion · TCT 6 à double embrayage','Coque en fibre de carbone de 65 kg, 895 kg à sec. Direction sans assistance — un choix radical assumé.'],
        ['4C Spider','1750 TBi 1.75 turbo','240 ch','propulsion · TCT 6','Toit amovible en toile ou carbone.'],
      ]},
    ],
    'alfa-gtv-916': [
      { c:'916', a:'1995–2005', m:[
        ['2.0 Twin Spark','4 cyl. 2.0 16v atmo','150–165 ch','traction · manuelle 5',''],
        ['2.0 V6 Turbo','V6 2.0 turbo','200–202 ch','traction · manuelle 5','Version fiscalement optimisée pour l\'Italie, aujourd\'hui rarissime.'],
        ['3.0 / 3.2 V6 Busso','V6 3.0–3.2 24v atmo','218–240 ch','traction · manuelle 6','Le coin de style Pininfarina et le chant du Busso : la combinaison la plus recherchée.'],
      ]},
    ],
    'alfa-75': [
      { c:'162B', a:'1985–1992', m:[
        ['1.8 Turbo','4 cyl. 1.8 turbo','155 ch','propulsion transaxle · manuelle 5','Boîte accolée au pont arrière : répartition des masses proche de 50/50.'],
        ['3.0 V6 America / QV','V6 Busso 3.0 12v','188–192 ch','propulsion transaxle · manuelle 5','La dernière Alfa à propulsion avant la Giulia de 2016.'],
        ['1.8 Turbo Evoluzione','4 cyl. 1.8 turbo','155 ch','propulsion transaxle · manuelle 5','500 exemplaires d\'homologation pour le championnat du monde des voitures de tourisme.'],
      ]},
    ],
    'alfa-giulietta-qv': [
      { c:'940', a:'2010–2019', m:[
        ['Quadrifoglio Verde','1750 TBi 1.75 turbo','235 ch','traction · manuelle 6 / TCT 6','Le 1750 turbo en hommage aux Alfa historiques.'],
        ['Veloce','1750 TBi 1.75 turbo','240 ch','traction · TCT 6','Dernière évolution, différentiel autobloquant mécanique en option.'],
      ]},
    ],

    'lancia-delta': [
      { c:'HF Turbo / 4WD', a:'1983–1987', m:[
        ['HF Turbo','4 cyl. 1.6 turbo','130–140 ch','traction · manuelle 5',''],
        ['HF 4WD','4 cyl. 2.0 turbo 8v','165 ch','intégrale, différentiel central Ferguson · manuelle 5','Le point de départ : elle remporte le championnat du monde des rallyes dès 1987.'],
      ]},
      { c:'Integrale 8v / 16v', a:'1987–1991', m:[
        ['Integrale 8v','4 cyl. 2.0 turbo 8v','185 ch','intégrale · manuelle 5','Ailes élargies, voies agrandies.'],
        ['Integrale 16v','4 cyl. 2.0 turbo 16v','200 ch','intégrale · manuelle 5','Bosse sur le capot pour loger la culasse 16 soupapes.'],
      ]},
      { c:'Evoluzione', a:'1991–1994', m:[
        ['Evo I','4 cyl. 2.0 turbo 16v','210 ch','intégrale · manuelle 5','Ailes encore élargies, aileron réglable. La silhouette définitive.'],
        ['Evo II','4 cyl. 2.0 turbo 16v, catalysé','215 ch','intégrale · manuelle 5','Séries spéciales Blu Lagos, Giallo Ginestra, Dealers Collection : les plus cotées aujourd\'hui.'],
      ]},
    ],

    'abarth-595': [
      { c:'312', a:'2008–', m:[
        ['595 / Turismo','T-Jet 1.4 turbo','145–165 ch','traction · manuelle 5 / robotisée','Échappement Record Monza sur la Turismo.'],
        ['595 Competizione','T-Jet 1.4 turbo','180 ch','traction · manuelle 5','Freins Brembo, sièges Sabelt, différentiel mécanique en option.'],
        ['695 Biposto','T-Jet 1.4 turbo','190 ch','traction · manuelle 5 ou boîte à crabots','2 places, arceau, vitres plexi. La plus radicale des Abarth modernes.'],
      ]},
    ],
    'fiat-coupe': [
      { c:'175', a:'1993–2000', m:[
        ['2.0 16v','4 cyl. 2.0 16v atmo','139 ch','traction · manuelle 5','Carrosserie dessinée par Chris Bangle, intérieur par Pininfarina.'],
        ['2.0 16v Turbo','4 cyl. 2.0 16v turbo','190 ch','traction · manuelle 5',''],
        ['2.0 20v Turbo','5 en ligne 2.0 20v turbo','220 ch','traction · manuelle 5/6, autobloquant Viscodrive','Le coupé le plus rapide de sa catégorie à sa sortie. La série limitée Plus est la plus recherchée.'],
      ]},
    ],

    'opel-lotus-omega': [
      { c:'A', a:'1990–1992', m:[
        ['Lotus Omega / Carlton','6 en ligne 3.6 biturbo, préparé par Lotus','377 ch','propulsion · ZF manuelle 6 (de la Corvette ZR-1)','283 km/h : la berline de série la plus rapide du monde en 1990. Son existence a été débattue au Parlement britannique, la police ne pouvant pas la rattraper. 950 exemplaires.'],
      ]},
    ],
    'opel-astra-opc': [
      { c:'G', a:'2002–2004', m:[
        ['Astra OPC','2.0 turbo','200 ch','traction · manuelle 5',''],
      ]},
      { c:'H', a:'2005–2010', m:[
        ['Astra OPC','2.0 turbo','240 ch','traction · manuelle 6','Nürburgring Edition à châssis renforcé.'],
      ]},
      { c:'J', a:'2012–2018', m:[
        ['Astra OPC','2.0 turbo','280 ch','traction · manuelle 6, différentiel mécanique','Châssis HiPerStrut, amortisseurs FlexRide. Le train avant le plus abouti d\'Opel.'],
      ]},
    ],
    'opel-calibra': [
      { c:'A', a:'1989–1997', m:[
        ['2.0 8v / 16v','4 cyl. 2.0 atmo','115–150 ch','traction · manuelle 5','Cx de 0,26 : le coefficient de traînée le plus bas d\'une voiture de série à sa sortie.'],
        ['Turbo 4x4','4 cyl. 2.0 16v turbo','204 ch','intégrale · manuelle 6','Boîte à 6 rapports, une rareté pour l\'époque.'],
        ['2.5 V6','V6 2.5 24v atmo','170 ch','traction · manuelle 5',''],
      ]},
    ],

    'mercedes-190e': [
      { c:'W201 16 soupapes', a:'1983–1993', m:[
        ['2.3-16','4 cyl. 2.3 16v, culasse Cosworth','185 ch','propulsion · manuelle 5 (dogleg)','Culasse développée par Cosworth. Records d\'endurance à Nardò en 1983.'],
        ['2.5-16','4 cyl. 2.5 16v Cosworth','195 ch','propulsion · manuelle 5 / auto',''],
        ['2.5-16 Evolution I','4 cyl. 2.5 16v','195 ch','propulsion · manuelle 5','502 exemplaires d\'homologation DTM.'],
        ['2.5-16 Evolution II','4 cyl. 2.5 16v','235 ch','propulsion · manuelle 5','Aileron géant dessiné en soufflerie. 502 exemplaires. L\'une des Mercedes modernes les plus cotées.'],
      ]},
    ],
    'mercedes-amg-gt': [
      { c:'C190', a:'2014–2021', m:[
        ['GT / GT S','M178 4.0 · V8 biturbo','476–522 ch','propulsion transaxle · DCT 7','Moteur en position avant-centrale, boîte accolée au pont arrière.'],
        ['GT C','M178 4.0 · V8 biturbo','557 ch','propulsion · DCT 7','Voies arrière élargies et roues arrière directrices.'],
        ['GT R','M178 4.0 · V8 biturbo','585 ch','propulsion · DCT 7','Aérodynamique active sous caisse. Surnommée « la bête du Vert-Enfer ».'],
        ['GT Black Series','M178 4.0 · V8 à vilebrequin plat','730 ch','propulsion · DCT 7','Vilebrequin plat, une première chez AMG. Record du Nürburgring pour une voiture de série en 2020.'],
      ]},
      { c:'C192', a:'2023–', m:[
        ['GT 55 / GT 63','M177 4.0 · V8 biturbo','476–585 ch','intégrale 4Matic+ · MCT 9','Première AMG GT à transmission intégrale et à quatre places.'],
      ]},
    ],
    'mercedes-slk': [
      { c:'R170', a:'1996–2004', m:[
        ['200 / 230 Kompressor','4 cyl. à compresseur','163–197 ch','propulsion · manuelle 5/6 / auto','Premier toit rigide escamotable de série sur un roadster moderne.'],
        ['SLK 32 AMG','V6 3.2 à compresseur','354 ch','propulsion · auto 5','Assemblée à la main par AMG, 263 km/h.'],
      ]},
      { c:'R171', a:'2004–2011', m:[
        ['200 K / 350','4 cyl. compressé / V6 3.5 atmo','163–305 ch','propulsion · manuelle 6 / 7G-Tronic',''],
        ['SLK 55 AMG','V8 5.4 atmo','360 ch','propulsion · 7G-Tronic',''],
      ]},
      { c:'R172', a:'2011–2020', m:[
        ['200 / 250 / 350','4 cyl. turbo / V6 3.5','184–306 ch','propulsion · manuelle 6 / 7G-Tronic','Renommée SLC en 2016.'],
        ['SLK 55 AMG','V8 5.5 atmo','422 ch','propulsion · 7G-Tronic','Le dernier V8 atmosphérique de la lignée.'],
      ]},
    ],


    /* ================= LOT 3 — Mercedes-Benz / AMG ===================== */
    'mercedes-classe-g': [
      { c:'W460 / W461', a:'1979–2001', m:[
        ['240 GD / 300 GD','4 et 5 cyl. diesel atmo','72–113 ch','4x4 avec trois blocages · manuelle 4/5','Conçu à l\'origine comme véhicule militaire à la demande du Shah d\'Iran.'],
        ['230 GE / 280 GE','4 et 6 cyl. essence','102–156 ch','4x4 · manuelle 4/5','Le 280 GE remporte le Paris-Dakar 1983.'],
      ]},
      { c:'W463', a:'1990–2018', m:[
        ['G 300 / G 350 CDI','6 cyl. diesel, puis V6 3.0 CDI','177–245 ch','4x4 permanent, trois blocages · auto 5/7',''],
        ['G 500','V8 5.0 puis 5.5 atmo','296–388 ch','4x4 · auto 5/7',''],
        ['G 55 AMG','V8 5.4 à compresseur','354–507 ch','4x4 · auto 5/7','Le compresseur dans un châssis à essieux rigides de 1979 : une aberration mécanique assumée.'],
        ['G 63 AMG','V8 5.5 biturbo','544–571 ch','4x4 · auto 7','La version 463 Edition et ses sorties latérales.'],
        ['G 65 AMG','V12 6.0 biturbo','630 ch','4x4 · auto 7','Seul G à V12. Production confidentielle.'],
      ]},
      { c:'W463A', a:'2018–', m:[
        ['G 400 d','6 en ligne 3.0 diesel','330 ch','4x4 · auto 9','Passage à la suspension avant indépendante — l\'arrière reste à essieu rigide.'],
        ['G 500','V8 4.0 biturbo','422 ch','4x4 · auto 9',''],
        ['G 63 AMG','V8 4.0 biturbo','585–635 ch','4x4 · auto 9','La 4x4² surélevée à portiques et amortisseurs doubles.'],
      ]},
    ],
    'mercedes-sl': [
      { c:'W198 / W121', a:'1954–1963', m:[
        ['300 SL','6 en ligne 3.0 à injection directe','215 ch','propulsion · manuelle 4','Portes papillon. Première voiture de série à injection directe d\'essence.'],
        ['190 SL','4 cyl. 1.9 atmo','105 ch','propulsion · manuelle 4','La version accessible, deux fois moins chère.'],
      ]},
      { c:'W113 « Pagode »', a:'1963–1971', m:[
        ['230 / 250 / 280 SL','6 en ligne 2.3–2.8 injection','150–170 ch','propulsion · manuelle 4 / auto','Le toit rigide concave, dit « pagode », donne son surnom au modèle.'],
      ]},
      { c:'R107', a:'1971–1989', m:[
        ['280 – 560 SL','6 en ligne et V8 2.8–5.6','185–245 ch','propulsion · manuelle / auto','Dix-huit ans de carrière : la plus longue de la lignée.'],
      ]},
      { c:'R129', a:'1989–2001', m:[
        ['SL 280 – SL 600','6 en ligne, V8, V12 2.8–6.0','193–394 ch','propulsion · auto','Arceau de sécurité escamotable automatiquement en cas de retournement.'],
        ['SL 73 AMG','V12 7.3 atmo','525 ch','propulsion · auto 5','Le V12 qui équipera la Pagani Zonda.'],
      ]},
      { c:'R230 / R231', a:'2001–2020', m:[
        ['SL 350 – SL 600','V6, V8, V12','245–517 ch','propulsion · auto 5/7','Toit rigide escamotable de série.'],
        ['SL 63 / SL 65 AMG','V8 6.2 atmo puis 5.5 biturbo / V12 6.0 biturbo','518–670 ch','propulsion · MCT 7',''],
      ]},
      { c:'R232', a:'2021–', m:[
        ['SL 43 / SL 55 / SL 63','4 cyl. 2.0 turbo à assistance électrique / V8 4.0 biturbo','381–585 ch','propulsion ou 4Matic+ · MCT 9','Retour de la capote en toile et des places arrière d\'appoint. Développée par AMG.'],
      ]},
    ],
    'mercedes-sls': [
      { c:'C197', a:'2010–2014', m:[
        ['SLS AMG','M159 6.2 · V8 atmo','571 ch','propulsion · DCT 7 en transaxle','Portes papillon en hommage à la 300 SL. Premier modèle intégralement conçu par AMG.'],
        ['SLS GT','M159 6.2 · V8 atmo','591 ch','propulsion · DCT 7',''],
        ['SLS Black Series','M159 6.2 · V8 atmo','631 ch','propulsion · DCT 7','8 000 tr/min, allégée de 70 kg.'],
        ['SLS Electric Drive','4 moteurs électriques','751 ch','intégrale','Une roue, un moteur. 1 000 Nm. La plus rare des SLS.'],
      ]},
    ],
    'mercedes-c63': [
      { c:'W204', a:'2008–2014', m:[
        ['C 63 AMG','M156 6.2 · V8 atmo','457 ch','propulsion · MCT 7','Le dernier grand V8 atmosphérique conçu par AMG.'],
        ['Performance Package','M156 6.2 · V8 atmo','487 ch','propulsion · MCT 7','Vilebrequin forgé et bielles de la SLS.'],
        ['Black Series','M156 6.2 · V8 atmo','517 ch','propulsion · MCT 7','Voies élargies, blocage de différentiel, 2 places.'],
      ]},
      { c:'W205', a:'2015–2021', m:[
        ['C 63','M177 4.0 · V8 biturbo','476 ch','propulsion · MCT 7/9','Passage au biturbo logé dans le V.'],
        ['C 63 S','M177 4.0 · V8 biturbo','510 ch','propulsion · MCT 9','Différentiel arrière piloté électroniquement.'],
      ]},
      { c:'W206', a:'2023–', m:[
        ['C 63 S E Performance','4 cyl. 2.0 turbo + moteur électrique arrière','680 ch','4Matic+ · MCT 9','Turbo à assistance électrique issu de la F1. L\'abandon du V8 a provoqué une fronde des clients historiques.'],
      ]},
    ],
    'mercedes-classe-a': [
      { c:'W168 / W169', a:'1997–2012', m:[
        ['A 140 – A 200 Turbo','4 cyl. essence et CDI','60–193 ch','traction · manuelle / Autotronic','Le « test de l\'élan » de 1997 provoque le rappel de toute la production et l\'ajout de l\'ESP de série.'],
      ]},
      { c:'W176', a:'2012–2018', m:[
        ['A 180 – A 250','4 cyl. turbo et CDI','109–218 ch','traction ou 4Matic · manuelle 6 / DCT 7','Abandon du monospace surélevé pour une compacte classique.'],
        ['A 45 AMG','M133 2.0 turbo','360–381 ch','4Matic · DCT 7',''],
      ]},
      { c:'W177', a:'2018–', m:[
        ['A 180 – A 250','4 cyl. turbo, hybride rechargeable','116–224 ch','traction ou 4Matic · DCT 7/8','Système MBUX à commande vocale.'],
        ['A 35 / A 45 S','2.0 turbo','306–421 ch','4Matic / 4Matic+ · DCT 7/8',''],
      ]},
    ],

    /* ================= LOT 3 — Alfa Romeo ============================== */
    'alfa-giulia': [
      { c:'Type 952', a:'2015–', m:[
        ['2.0 Turbo','4 cyl. 2.0 turbo','200–280 ch','propulsion ou Q4 · auto 8 ZF',''],
        ['2.2 JTDm','4 cyl. 2.2 diesel','136–210 ch','propulsion ou Q4 · auto 8',''],
        ['Veloce','4 cyl. 2.0 turbo','280 ch','Q4 · auto 8','Différentiel arrière autobloquant.'],
      ]},
    ],
    'alfa-giulietta': [
      { c:'Type 940', a:'2010–2020', m:[
        ['1.4 MultiAir','4 cyl. 1.4 turbo','120–170 ch','traction · manuelle 6 / TCT 6',''],
        ['JTDm','4 cyl. 1.6–2.0 diesel','105–175 ch','traction · manuelle 6 / TCT 6',''],
        ['Quadrifoglio Verde','1750 TBi 1.75 turbo','235–240 ch','traction, différentiel électronique Q2 · manuelle 6 / TCT 6','Le 1750 en hommage aux Alfa historiques. Launch Edition devenue collector.'],
      ]},
    ],
    'alfa-147': [
      { c:'Type 937', a:'2000–2010', m:[
        ['1.6 / 2.0 Twin Spark','4 cyl. atmo à double allumage','105–150 ch','traction · manuelle 5','Voiture de l\'Année 2001.'],
        ['JTD','4 cyl. 1.9 diesel','100–170 ch','traction · manuelle 5/6','Le JTD : Alfa a inventé le diesel à rampe commune avant de le céder à Bosch.'],
        ['GTA','V6 Busso 3.2 atmo','250 ch','traction, différentiel autobloquant · manuelle 6','Le chant du V6 Busso dans une compacte. Voies élargies de 30 mm.'],
      ]},
    ],
    'alfa-156': [
      { c:'Type 932', a:'1997–2007', m:[
        ['Twin Spark 1.6 – 2.0','4 cyl. atmo double allumage','120–165 ch','traction · manuelle 5 / Selespeed','Voiture de l\'Année 1998. Poignées arrière dissimulées dans le montant.'],
        ['V6 2.5','V6 Busso 2.5 atmo','190 ch','traction · manuelle 5/6',''],
        ['GTA','V6 Busso 3.2 atmo','250 ch','traction · manuelle 6 / Selespeed','La berline au six cylindres le plus mélodieux des années 2000.'],
      ]},
    ],
    'alfa-gtv6': [
      { c:'Type 116', a:'1980–1987', m:[
        ['GTV6 2.5','V6 Busso 2.5 atmo','160 ch','propulsion, boîte-pont arrière · manuelle 5','Le premier V6 Busso. Bosse de capot imposée par l\'admission.'],
        ['GTV6 3.0','V6 Busso 3.0 atmo','180–200 ch','propulsion · manuelle 5','Version sud-africaine d\'homologation, 212 exemplaires. La plus recherchée.'],
      ]},
    ],
    'alfa-stelvio': [
      { c:'Type 949', a:'2016–', m:[
        ['2.0 Turbo / 2.2 JTDm','4 cyl. essence et diesel','160–280 ch','propulsion ou Q4 · auto 8',''],
        ['Quadrifoglio','V6 2.9 biturbo','510 ch','Q4 · auto 8','Record des SUV au Nürburgring en 2017 (7:51).'],
      ]},
    ],
    'alfa-mito': [
      { c:'Type 955', a:'2008–2018', m:[
        ['1.4 MultiAir','4 cyl. 1.4 turbo','105–170 ch','traction · manuelle 6 / TCT 6','Le système MultiAir de commande hydraulique des soupapes, développé par Fiat.'],
        ['Quadrifoglio Verde','1.4 MultiAir turbo','170 ch','traction · manuelle 6 / TCT 6',''],
      ]},
    ],

    /* ================= LOT 3 — Lancia ================================== */
    'lancia-fulvia': [
      { c:'Berline / Coupé', a:'1963–1976', m:[
        ['1.2 / 1.3 Coupé','V4 étroit 1.2–1.3 atmo','80–90 ch','traction · manuelle 4/5','Un V4 à angle très fermé : une signature technique Lancia unique au monde.'],
        ['1.6 HF « Fanalone »','V4 1.6 atmo','115–132 ch','traction · manuelle 5','Gros phares intérieurs d\'où le surnom. Championne du monde des rallyes 1972.'],
      ]},
    ],
    'lancia-thema-832': [
      { c:'Type 834', a:'1986–1992', m:[
        ['8.32','V8 Ferrari 3.0 à vilebrequin plat','215 ch','traction · manuelle 5','Le V8 de la Ferrari 308 dans une berline familiale. Aileron arrière escamotable électriquement.'],
      ]},
    ],


    /* ---- Porsche en format détaillé (le modèle où les phases comptent le plus) ---- */
    'porsche-911': [
      { c:'901 / série G', a:'1963–1989', m:[
        ['2.0 – 2.4','flat-6 air, carburateurs puis injection','130–190 ch','propulsion · manuelle 5','Les 2.7 RS de 1973, 210 ch pour 960 kg, sont le sommet de la période.'],
        ['3.0 SC','flat-6 3.0 air','180–204 ch','propulsion · manuelle 5','La 911 la plus fiable de la série G.'],
        ['3.2 Carrera','flat-6 3.2 air','207–231 ch','propulsion · manuelle 5 (G50 dès 1987)','La boîte G50 de 1987 est un critère de prix décisif à l\'achat.'],
      ]},
      { c:'964', a:'1989–1994', m:[
        ['Carrera 2 / 4','flat-6 3.6 air','250 ch','propulsion ou intégrale · manuelle 5 / Tiptronic','85 % de pièces nouvelles. Première 911 à direction assistée et ABS.'],
        ['Carrera RS','flat-6 3.6 air','260 ch','propulsion · manuelle 5','Allégée de 155 kg, sans direction assistée ni insonorisant.'],
        ['Turbo 3.6','flat-6 3.6 turbo air','360 ch','propulsion · manuelle 5','Dernier turbo refroidi par air à turbo unique.'],
      ]},
      { c:'993', a:'1994–1998', m:[
        ['Carrera','flat-6 3.6–3.8 air','272–285 ch','propulsion ou intégrale · manuelle 6','Nouvel essieu arrière multibras : la fin du comportement piégeux.'],
        ['Carrera RS','flat-6 3.8 air','300 ch','propulsion · manuelle 6',''],
        ['Turbo / Turbo S','flat-6 3.6 biturbo air','408–450 ch','intégrale · manuelle 6','Première 911 Turbo biturbo et intégrale. La dernière refroidie par air.'],
        ['GT2','flat-6 3.6 biturbo air','430–450 ch','propulsion · manuelle 6','Ailes rivetées, propulsion pure : la plus recherchée de toutes les 993.'],
      ]},
      { c:'996.1', a:'1998–2001', m:[
        ['Carrera 3.4','flat-6 3.4 refroidi par eau','300 ch','propulsion ou intégrale · manuelle 6 / Tiptronic','Passage au refroidissement liquide. Phares « œufs au plat », longtemps décriés.'],
        ['Turbo 3.6','flat-6 3.6 biturbo','420 ch','intégrale · manuelle 6','Bloc Mezger dérivé de la GT1 de course, réputé indestructible.'],
        ['GT3','flat-6 3.6 Mezger atmo','360 ch','propulsion · manuelle 6','Vilebrequin issu de la 962 du Mans.'],
        ['GT2','flat-6 3.6 biturbo','462 ch','propulsion · manuelle 6',''],
      ]},
      { c:'996.2', a:'2002–2005', m:[
        ['Carrera 3.6','flat-6 3.6','320 ch','propulsion ou intégrale · manuelle 6 / Tiptronic','Restylage : phares de Turbo, moteur agrandi.'],
        ['Turbo / Turbo S','flat-6 3.6 biturbo','420–450 ch','intégrale · manuelle 6',''],
        ['GT3 / GT3 RS','flat-6 3.6 Mezger atmo','381 ch','propulsion · manuelle 6','La RS, 682 exemplaires, en blanc à bandes rouges ou bleues.'],
        ['GT2','flat-6 3.6 biturbo','483 ch','propulsion · manuelle 6',''],
      ]},
      { c:'997.1', a:'2004–2008', m:[
        ['Carrera 3.6','flat-6 3.6','325 ch','propulsion ou intégrale · manuelle 6 / Tiptronic','Retour des phares ronds.'],
        ['Carrera S 3.8','flat-6 3.8','355 ch','propulsion ou intégrale · manuelle 6','Amortissement piloté PASM de série.'],
        ['Turbo','flat-6 3.6 biturbo Mezger, géométrie variable','480 ch','intégrale · manuelle 6 / Tiptronic','Première turbine à géométrie variable sur un moteur essence de série.'],
        ['GT3 / GT3 RS','flat-6 3.6 Mezger atmo','415 ch','propulsion · manuelle 6',''],
        ['GT2','flat-6 3.6 biturbo','530 ch','propulsion · manuelle 6',''],
      ]},
      { c:'997.2', a:'2008–2012', m:[
        ['Carrera / Carrera S','flat-6 3.6–3.8 à injection directe','345–385 ch','propulsion ou intégrale · manuelle 6 / PDK 7','Nouveaux blocs DFI : les défauts d\'arbre intermédiaire de la 996 disparaissent. Arrivée de la PDK.'],
        ['Turbo / Turbo S','flat-6 3.8 biturbo','500–530 ch','intégrale · manuelle 6 / PDK 7',''],
        ['GT3 / GT3 RS','flat-6 3.8 Mezger atmo','435–450 ch','propulsion · manuelle 6',''],
        ['GT3 RS 4.0','flat-6 4.0 Mezger atmo','500 ch','propulsion · manuelle 6','600 exemplaires. Le dernier moteur Mezger. Aujourd\'hui la 997 la plus cotée.'],
        ['GT2 RS','flat-6 3.6 biturbo','620 ch','propulsion · manuelle 6','500 exemplaires, 1 370 kg. Surnommée « la veuve moderne ».'],
      ]},
      { c:'991.1', a:'2011–2015', m:[
        ['Carrera / Carrera S','flat-6 3.4–3.8 atmo','350–400 ch','propulsion ou intégrale · manuelle 7 / PDK 7','Empattement allongé de 10 cm. Première boîte manuelle à 7 rapports.'],
        ['Turbo / Turbo S','flat-6 3.8 biturbo','520–560 ch','intégrale · PDK 7','Roues arrière directrices de série.'],
        ['GT3','flat-6 3.8 atmo','475 ch','propulsion · PDK 7 uniquement','9 000 tr/min. L\'absence de boîte manuelle a provoqué une levée de boucliers.'],
        ['GT3 RS','flat-6 4.0 atmo','500 ch','propulsion · PDK 7','Toit magnésium, ailes ajourées.'],
      ]},
      { c:'991.2', a:'2015–2019', m:[
        ['Carrera / S / GTS','flat-6 3.0 biturbo','370–450 ch','propulsion ou intégrale · manuelle 7 / PDK 7','Le turbo se généralise à toute la gamme Carrera : la rupture la plus contestée de l\'histoire du modèle.'],
        ['Turbo / Turbo S','flat-6 3.8 biturbo','540–580 ch','intégrale · PDK 7',''],
        ['GT3 / GT3 Touring','flat-6 4.0 atmo','500 ch','propulsion · manuelle 6 / PDK 7','Retour de la boîte manuelle. La Touring supprime l\'aileron.'],
        ['GT3 RS','flat-6 4.0 atmo','520 ch','propulsion · PDK 7',''],
        ['911 R','flat-6 4.0 atmo','500 ch','propulsion · manuelle 6','991 exemplaires, sans aileron, boîte manuelle uniquement. Cotes devenues déraisonnables dès la première année.'],
        ['GT2 RS','flat-6 3.8 biturbo','700 ch','propulsion · PDK 7','La 911 de route la plus puissante jamais produite.'],
      ]},
      { c:'992', a:'2019–', m:[
        ['Carrera / S / GTS','flat-6 3.0 biturbo','385–480 ch','propulsion ou intégrale · manuelle 7 / PDK 8','Carrosserie large de série sur toute la gamme.'],
        ['Turbo / Turbo S','flat-6 3.7 biturbo','580–650 ch','intégrale · PDK 8','La Turbo S abat le 0 à 100 en 2,7 s.'],
        ['GT3 / GT3 Touring','flat-6 4.0 atmo','510 ch','propulsion · manuelle 6 / PDK 7','Suspension avant à double triangulation issue de la course. 9 000 tr/min.'],
        ['GT3 RS','flat-6 4.0 atmo','525 ch','propulsion · PDK 7','Aérodynamique active. Appui supérieur à certaines voitures de course.'],
        ['S/T','flat-6 4.0 atmo','525 ch','propulsion · manuelle 6','1 963 exemplaires pour les 60 ans du modèle. Volant moteur allégé.'],
      ]},
    ],
    'porsche-718-boxster': [
      { c:'986', a:'1996–2004', m:[
        ['Boxster 2.5 / 2.7','flat-6 atmo','204–228 ch','propulsion · manuelle 5/6 / Tiptronic','Le roadster qui a sauvé Porsche financièrement.'],
        ['Boxster S 3.2','flat-6 3.2 atmo','252–264 ch','propulsion · manuelle 6',''],
      ]},
      { c:'987', a:'2004–2012', m:[
        ['Boxster / Cayman 2.7 – 2.9','flat-6 atmo','240–265 ch','propulsion · manuelle 5/6 / PDK 7',''],
        ['S 3.4','flat-6 3.4 atmo','295–320 ch','propulsion · manuelle 6 / PDK 7',''],
        ['Cayman R / Boxster Spyder','flat-6 3.4 atmo','320–330 ch','propulsion · manuelle 6','Allégées de 55 kg, sans climatisation ni autoradio de série.'],
      ]},
      { c:'981', a:'2012–2016', m:[
        ['Boxster / Cayman','flat-6 2.7 atmo','265 ch','propulsion · manuelle 6 / PDK 7',''],
        ['S / GTS','flat-6 3.4 atmo','315–340 ch','propulsion · manuelle 6 / PDK 7',''],
        ['Cayman GT4 / Boxster Spyder','flat-6 3.8 atmo (de la 911 Carrera S)','375 ch','propulsion · manuelle 6','Le premier GT4 : moteur et freins de 911, boîte manuelle imposée.'],
      ]},
      { c:'718 (982)', a:'2016–', m:[
        ['718 / 718 S','flat-4 2.0–2.5 turbo','300–365 ch','propulsion · manuelle 6 / PDK 7','Le passage au flat-4 turbo a fait scandale : couple en hausse, son en effondrement.'],
        ['GTS 4.0','flat-6 4.0 atmo','400 ch','propulsion · manuelle 6 / PDK 7','Le retour du six cylindres atmosphérique après la fronde des clients.'],
        ['GT4 / Spyder','flat-6 4.0 atmo','420 ch','propulsion · manuelle 6 / PDK 7',''],
        ['GT4 RS','flat-6 4.0 atmo (de la 911 GT3)','500 ch','propulsion · PDK 7','Admissions placées derrière les oreilles du conducteur. 9 000 tr/min.'],
      ]},
    ],

    /* ---- Renault Sport ------------------------------------------------ */
    'renault-clio-rs': [
      { c:'Clio II', a:'2000–2005', m:[
        ['R.S. 172','2.0 16v atmo','172 ch','traction · manuelle 5','Châssis Cup en option : ressorts raccourcis, jantes allégées.'],
        ['R.S. 182','2.0 16v atmo','182 ch','traction · manuelle 5','Double sortie d\'échappement centrale. Version Trophy à amortisseurs Sachs, 550 exemplaires.'],
      ]},
      { c:'Clio III', a:'2006–2012', m:[
        ['R.S. 197','2.0 16v atmo','197 ch','traction · manuelle 6',''],
        ['R.S. 203 / Gordini','2.0 16v atmo','203 ch','traction · manuelle 6','La dernière Clio R.S. atmosphérique et à boîte manuelle.'],
      ]},
      { c:'Clio IV', a:'2013–2019', m:[
        ['R.S. 200 EDC','1.6 turbo','200 ch','traction · EDC 6 à double embrayage','Passage au turbo et à l\'automatique seule : décision très mal reçue par les fidèles.'],
        ['R.S. 220 Trophy','1.6 turbo','220 ch','traction · EDC 6','Amortisseurs hydrauliques Öhlins, rapports raccourcis.'],
      ]},
    ],
    'renault-megane-rs': [
      { c:'Mégane II', a:'2004–2009', m:[
        ['R.S. 225','2.0 turbo','225 ch','traction · manuelle 6','Le premier Mégane R.S. Châssis Cup en option.'],
        ['R26','2.0 turbo','230 ch','traction · manuelle 6, différentiel autobloquant','Premier différentiel à glissement limité mécanique sur une Renault de série.'],
        ['R26.R','2.0 turbo','230 ch','traction · manuelle 6','Allégée de 123 kg : sans banquette arrière, arceau, vitres polycarbonate. Record des tractions au Nürburgring en 2008.'],
      ]},
      { c:'Mégane III', a:'2009–2017', m:[
        ['R.S. 250 / 265','2.0 turbo','250–265 ch','traction · manuelle 6','Train avant à double axe PerfoHub : la référence de la traction sportive.'],
        ['R.S. 275 Trophy-R','2.0 turbo','275 ch','traction · manuelle 6','Allégée, Öhlins et Akrapovič. Record au Nürburgring en 2014. 250 exemplaires en France.'],
      ]},
      { c:'Mégane IV', a:'2018–2023', m:[
        ['R.S. 280 / 300','1.8 turbo','280–300 ch','traction · manuelle 6 / EDC 6','Roues arrière directrices 4Control.'],
        ['R.S. Trophy-R','1.8 turbo','300 ch','traction · manuelle 6','Freins carbone-céramique et jantes carbone en option. Record des tractions au Nürburgring en 2019.'],
      ]},
    ],

    /* ---- Volkswagen --------------------------------------------------- */
    'vw-golf-gti': [
      { c:'Mk1', a:'1976–1983', m:[
        ['1.6','4 cyl. 1.6 injection K-Jetronic','110 ch','traction · manuelle 4/5','810 kg. L\'acte fondateur de la compacte sportive.'],
        ['1.8','4 cyl. 1.8 injection','112 ch','traction · manuelle 5','Couple en hausse, plus utilisable au quotidien.'],
      ]},
      { c:'Mk2', a:'1984–1991', m:[
        ['8 soupapes','4 cyl. 1.8','112 ch','traction · manuelle 5',''],
        ['16 soupapes','4 cyl. 1.8 16v','139 ch','traction · manuelle 5','La 16S, la plus recherchée de la Mk2.'],
        ['G60 (Rallye / Limited)','4 cyl. 1.8 à compresseur G-Lader','160 ch','traction ou syncro · manuelle 5','La Rallye G60, 5 000 exemplaires, ailes élargies et phares carrés.'],
      ]},
      { c:'Mk3', a:'1991–1997', m:[
        ['8 et 16 soupapes','4 cyl. 2.0','115–150 ch','traction · manuelle 5','Souvent considérée comme le creux de la lignée : alourdie, moins vive.'],
      ]},
      { c:'Mk4', a:'1998–2003', m:[
        ['1.8 T','4 cyl. 1.8 turbo 20v','150–180 ch','traction · manuelle 5/6','La 25e Anniversaire de 2001, à 180 ch, relance la dynamique.'],
      ]},
      { c:'Mk5', a:'2004–2009', m:[
        ['2.0 TFSI','4 cyl. 2.0 turbo','200 ch','traction · manuelle 6 / DSG 6','Le retour en grâce, unanimement salué. Essieu arrière multibras.'],
        ['Edition 30 / Pirelli','4 cyl. 2.0 turbo','230 ch','traction · manuelle 6 / DSG 6',''],
      ]},
      { c:'Mk6', a:'2009–2013', m:[
        ['2.0 TSI','4 cyl. 2.0 turbo','210 ch','traction · manuelle 6 / DSG 6',''],
        ['Edition 35','4 cyl. 2.0 turbo','235 ch','traction · manuelle 6 / DSG 6','Différentiel à glissement limité électronique XDS.'],
      ]},
      { c:'Mk7', a:'2013–2020', m:[
        ['GTI / Performance','4 cyl. 2.0 turbo','220–245 ch','traction · manuelle 6 / DSG 6','La Performance reçoit un différentiel autobloquant mécanique VAQ.'],
        ['Clubsport / Clubsport S','4 cyl. 2.0 turbo','265–310 ch','traction · manuelle 6 / DSG 6','La Clubsport S, 2 places et 400 exemplaires, a repris le record des tractions au Nürburgring en 2016.'],
        ['TCR','4 cyl. 2.0 turbo','290 ch','traction · DSG 7',''],
      ]},
      { c:'Mk8', a:'2020–', m:[
        ['GTI','4 cyl. 2.0 turbo','245 ch','traction · manuelle 6 / DSG 7','Commandes tactiles très critiquées, partiellement corrigées en 2024.'],
        ['Clubsport','4 cyl. 2.0 turbo','300 ch','traction · DSG 7','Châssis et différentiel spécifiques, mode Nürburgring.'],
      ]},
    ],
    'vw-golf-r': [
      { c:'Mk5 (R32)', a:'2005–2008', m:[
        ['R32','VR6 3.2 atmo','250 ch','4Motion · manuelle 6 / DSG 6','Le son du VR6 : la raison pour laquelle les R32 se revendent mieux que les Golf R modernes.'],
      ]},
      { c:'Mk6', a:'2009–2013', m:[
        ['Golf R','4 cyl. 2.0 turbo','270 ch','4Motion · manuelle 6 / DSG 6','Le 4 cylindres remplace le VR6 : plus efficace, moins émouvant.'],
      ]},
      { c:'Mk7', a:'2013–2020', m:[
        ['Golf R','4 cyl. 2.0 turbo','300–310 ch','4Motion · manuelle 6 / DSG 7',''],
      ]},
      { c:'Mk8', a:'2020–', m:[
        ['Golf R','4 cyl. 2.0 turbo','320 ch','4Motion avec répartition active arrière · DSG 7','Mode drift assumé, une première chez Volkswagen.'],
        ['R 20 Years','4 cyl. 2.0 turbo','333 ch','4Motion · DSG 7','La Golf de série la plus puissante de l\'histoire.'],
      ]},
    ],

    /* ---- Japon en format détaillé ------------------------------------- */
    'honda-civic-type-r': [
      { c:'EK9', a:'1997–2000', m:[
        ['Type R','B16B 1.6 VTEC atmo','185 ch','traction · manuelle 5, autobloquant hélicoïdal','116 ch/L : un record pour un atmosphérique de série. Japon uniquement.'],
      ]},
      { c:'EP3', a:'2001–2005', m:[
        ['Type R (Europe)','K20A2 2.0 VTEC atmo','200 ch','traction · manuelle 6','Assemblée au Royaume-Uni, levier monté sur la planche de bord.'],
        ['Type R (Japon)','K20A 2.0 VTEC atmo','215 ch','traction · manuelle 6, autobloquant','Version japonaise nettement plus poussée : culasse retravaillée, autobloquant de série.'],
      ]},
      { c:'FD2 / FN2', a:'2007–2011', m:[
        ['FD2 (Japon)','K20A 2.0 atmo','225 ch','traction · manuelle 6, autobloquant','Berline 4 portes, châssis le plus rigide de la lignée.'],
        ['FN2 (Europe)','K20Z4 2.0 atmo','201 ch','traction · manuelle 6','Essieu arrière rigide : la génération la moins bien née.'],
      ]},
      { c:'FK2', a:'2015–2017', m:[
        ['Type R','K20C1 2.0 turbo','310 ch','traction · manuelle 6, autobloquant','Première Type R turbo. Suspension arrière à essieu de torsion.'],
      ]},
      { c:'FK8', a:'2017–2021', m:[
        ['Type R','K20C1 2.0 turbo','320 ch','traction · manuelle 6, autobloquant','Retour du multibras arrière. Record du tour au Nürburgring pour une traction en 2017.'],
        ['Limited Edition','K20C1 2.0 turbo','320 ch','traction · manuelle 6','Allégée de 47 kg, jantes BBS, 100 exemplaires pour l\'Europe.'],
      ]},
      { c:'FL5', a:'2022–', m:[
        ['Type R','K20C1 2.0 turbo','329 ch','traction · manuelle 6, autobloquant','Record repris au Nürburgring en 2023. Volant moteur allégé.'],
      ]},
    ],
    'mitsubishi-evo': [
      { c:'I à III', a:'1992–1996', m:[
        ['Evo I à III','4G63T 2.0 turbo','244–270 ch','intégrale · manuelle 5','Base Lancer, née pour homologuer Mitsubishi en rallye mondial.'],
      ]},
      { c:'IV à VI', a:'1996–2001', m:[
        ['Evo IV / V / VI','4G63T 2.0 turbo','280 ch','intégrale, AYC sur V et VI · manuelle 5','Le contrôle actif du lacet AYC apparaît sur la V.'],
        ['VI Tommi Mäkinen','4G63T 2.0 turbo','280 ch','intégrale AYC · manuelle 5','Turbo à roue titane, suspensions abaissées. La plus recherchée de toute la lignée.'],
      ]},
      { c:'VII à IX', a:'2001–2007', m:[
        ['Evo VII / VIII','4G63T 2.0 turbo','280 ch','intégrale, différentiel central actif ACD · manuelle 5/6',''],
        ['Evo IX','4G63T 2.0 turbo MIVEC','280–290 ch','intégrale ACD + AYC · manuelle 6','Distribution variable MIVEC : le dernier et le meilleur des 4G63.'],
      ]},
      { c:'X', a:'2007–2016', m:[
        ['Evo X GSR / MR','4B11T 2.0 turbo','295–303 ch','intégrale S-AWC · manuelle 5 / SST 6','Nouveau bloc alu. Boîte à double embrayage SST sur la MR.'],
        ['Final Edition','4B11T 2.0 turbo','303 ch','intégrale S-AWC · manuelle 5','Dernière Evo, 2015. Fin de vingt-trois ans de lignée.'],
      ]},
    ],
    'subaru-wrx-sti': [
      { c:'GC8', a:'1994–2000', m:[
        ['WRX STI','EJ20 2.0 turbo','250–280 ch','intégrale · manuelle 5','Version berline et break. Six versions successives au Japon.'],
        ['22B STI','EJ22 2.2 turbo','280 ch','intégrale · manuelle 5','424 exemplaires. Ailes élargies, coupé 2 portes. La Subaru la plus cotée.'],
      ]},
      { c:'GD', a:'2000–2007', m:[
        ['STI « bug eye »','EJ207 2.0 turbo','265 ch','intégrale DCCD · manuelle 6','Phares ronds très clivants (2000–2002).'],
        ['STI « blob eye »','EJ207 2.0 / EJ257 2.5','265–300 ch','intégrale DCCD · manuelle 6','2003–2005. Le marché américain reçoit le 2.5.'],
        ['STI « hawk eye »','EJ257 2.5 turbo','280–320 ch','intégrale DCCD · manuelle 6','2006–2007. La plus aboutie de la GD.'],
      ]},
      { c:'GR / GV', a:'2007–2014', m:[
        ['STI','EJ257 2.5 turbo','300–320 ch','intégrale DCCD · manuelle 6','Carrosserie 5 portes, puis retour de la berline en 2011.'],
      ]},
      { c:'VA', a:'2014–2021', m:[
        ['WRX STI','EJ257 2.5 turbo','300–341 ch','intégrale DCCD · manuelle 6','Dernière STI à moteur EJ. La série Final Edition clôt la lignée en 2019 au Japon.'],
      ]},
    ],
    'mazda-mx5': [
      { c:'NA', a:'1989–1997', m:[
        ['1.6','B6ZE 1.6 atmo','115 ch','propulsion · manuelle 5','940 kg, phares escamotables. Inspirée de la Lotus Elan.'],
        ['1.8','BP 1.8 atmo','131–133 ch','propulsion · manuelle 5','Renfort de châssis et freins agrandis.'],
      ]},
      { c:'NB', a:'1998–2005', m:[
        ['1.6 / 1.8','1.6 et 1.8 atmo','110–146 ch','propulsion · manuelle 5/6','Fin des phares escamotables. La 1.8 VVT de 2001 monte à 146 ch.'],
      ]},
      { c:'NC', a:'2005–2015', m:[
        ['2.0','MZR 2.0 atmo','126–170 ch','propulsion · manuelle 5/6 / automatique','La plus lourde de la lignée. Version à toit rigide rétractable.'],
      ]},
      { c:'ND', a:'2015–', m:[
        ['1.5 SkyActiv','1.5 atmo','132 ch','propulsion · manuelle 6','Version européenne et japonaise, la plus légère : environ 1 000 kg.'],
        ['2.0 SkyActiv','2.0 atmo','160–184 ch','propulsion · manuelle 6','Le bloc revu de 2018 monte à 7 500 tr/min.'],
      ]},
    ],

    /* ---- États-Unis --------------------------------------------------- */
    'ford-mustang': [
      { c:'1re gén.', a:'1964–1973', m:[
        ['6 cyl. / V8 289','6 en ligne 2.8–3.3 / V8 4.7','101–271 ch','propulsion · manuelle 3/4 / auto','Un million d\'exemplaires en dix-huit mois.'],
        ['Shelby GT350 / GT500','V8 4.7–7.0','306–360 ch','propulsion · manuelle 4','Les Shelby transforment la pony car en voiture de course homologuée.'],
        ['Boss 302 / 429','V8 4.9–7.0','290–380 ch','propulsion · manuelle 4','Homologation Trans-Am et NASCAR.'],
      ]},
      { c:'Fox', a:'1979–1993', m:[
        ['5.0 GT','V8 4.9 (302)','225–228 ch','propulsion · manuelle 5','Plateforme légère : la base historique de toute la scène drag américaine.'],
        ['SVO','4 cyl. 2.3 turbo','175–205 ch','propulsion · manuelle 5','Une Mustang à 4 cylindres turbo et freins à disques aux quatre roues. Commercialement un échec, techniquement en avance.'],
      ]},
      { c:'S197', a:'2005–2014', m:[
        ['GT 4.6 / 5.0','V8 4.6 puis Coyote 5.0','300–420 ch','propulsion · manuelle 5/6','Le Coyote 5.0 de 2011 relance la lignée.'],
        ['Shelby GT500','V8 5.4–5.8 suralimenté','500–662 ch','propulsion · manuelle 6','662 ch en 2013 : la Mustang de série la plus puissante à l\'époque.'],
        ['Boss 302','V8 5.0 atmo','444 ch','propulsion · manuelle 6','Échappement latéral à volets réglables à la clé.'],
      ]},
      { c:'S550', a:'2015–2023', m:[
        ['EcoBoost','4 cyl. 2.3 turbo','290–330 ch','propulsion · manuelle 6 / auto 10',''],
        ['GT 5.0','V8 Coyote 5.0 atmo','421–460 ch','propulsion · manuelle 6 / auto 10','Première Mustang à essieu arrière indépendant, et première vendue officiellement en Europe.'],
        ['Shelby GT350','V8 5.2 atmo à vilebrequin plat','533 ch','propulsion · manuelle 6','8 250 tr/min : un V8 américain qui hurle comme un V8 de Ferrari.'],
        ['Shelby GT500','V8 5.2 suralimenté','770 ch','propulsion · DCT 7',''],
      ]},
      { c:'S650', a:'2024–', m:[
        ['EcoBoost / GT','4 cyl. 2.3 turbo / V8 5.0','315–500 ch','propulsion · manuelle 6 / auto 10','Dark Horse à 500 ch, avec boîte manuelle Tremec.'],
        ['GTD','V8 5.2 suralimenté','815 ch','propulsion · transaxle DCT 8','Homologuée route, suspension à poussoirs, vise le record du Nürburgring.'],
      ]},
    ],

    /* ---- Royaume-Uni -------------------------------------------------- */
    'mini-cooper': [
      { c:'R50 / R53', a:'2001–2006', m:[
        ['Cooper','4 cyl. 1.6 atmo','90–116 ch','traction · manuelle 5',''],
        ['Cooper S','4 cyl. 1.6 à compresseur','163–170 ch','traction · manuelle 6','Le compresseur volumétrique : sifflement caractéristique, la préférée des amateurs.'],
        ['John Cooper Works','4 cyl. 1.6 compressé','200–210 ch','traction · manuelle 6','Kit initialement vendu en accessoire, puis intégré à la gamme.'],
      ]},
      { c:'R56', a:'2006–2013', m:[
        ['Cooper / Cooper S','4 cyl. 1.6, turbo sur la S (co-développé avec PSA)','120–184 ch','traction · manuelle 6','Passage du compresseur au turbo.'],
        ['John Cooper Works','4 cyl. 1.6 turbo','211–218 ch','traction · manuelle 6','La GP2, 2 places et 2 000 exemplaires.'],
      ]},
      { c:'F56', a:'2014–2023', m:[
        ['Cooper / Cooper S','3 et 4 cyl. turbo (blocs BMW)','136–192 ch','traction · manuelle 6 / auto',''],
        ['John Cooper Works','4 cyl. 2.0 turbo','231–306 ch','traction · manuelle 6 / auto 8','La GP3, 306 ch, 2 places, arches carbone. 3 000 exemplaires.'],
      ]},
    ],
    'lotus-elise': [
      { c:'S1', a:'1996–2001', m:[
        ['Elise 1.8','K-Series Rover 1.8 atmo','118 ch','propulsion · manuelle 5','725 kg. Châssis en profilés d\'aluminium collés, une première mondiale.'],
        ['111S / Sport 190','K-Series 1.8 VVC','143–190 ch','propulsion · manuelle 5',''],
      ]},
      { c:'S2', a:'2001–2010', m:[
        ['Elise 111R','Toyota 2ZZ 1.8 atmo','189 ch','propulsion · manuelle 6','Passage aux moteurs Toyota : gain net en fiabilité, perte de caractère selon les puristes.'],
        ['Elise SC','Toyota 2ZZ 1.8 à compresseur','218–243 ch','propulsion · manuelle 6',''],
      ]},
      { c:'S3', a:'2010–2021', m:[
        ['Elise Sport / S','Toyota 1.6 et 1.8 (compressé sur la S)','136–220 ch','propulsion · manuelle 6',''],
        ['Sprint 220 / Cup 250','Toyota 1.8 compressé','220–250 ch','propulsion · manuelle 6','La Sprint 220 descend sous les 800 kg.'],
      ]},
    ],


    /* ==================================================================
       FORMAT DÉTAILLÉ — trois niveaux : modèle > génération > motorisation
       ------------------------------------------------------------------
           { c:'code châssis', a:'années', m:[ [nom, mécanique, puissance,
                                                transmission, note] ] }

       C'est ce niveau qui distingue la S5 4.2 V8 atmosphérique de la S5
       3.0 TFSI compressée : même nom commercial, deux voitures sans rapport.
       Le format court [code, années, méca, ch, note] reste accepté pour les
       modèles dont la génération suffit — les deux cohabitent.
       ================================================================== */

    'audi-s3': [
      { c:'8L', a:'1999–2003', m:[
        ['1.8 T 210','4 cyl. 1.8 turbo 20v','210 ch','quattro · manuelle 6','Première S3. Bloc 1.8T, base de toute la préparation de l\'époque.'],
        ['1.8 T 225','4 cyl. 1.8 turbo 20v','225 ch','quattro · manuelle 6','Restylage 2001 : turbo K04 et intercooler agrandi.'],
      ]},
      { c:'8P', a:'2006–2012', m:[
        ['2.0 TFSI','4 cyl. 2.0 turbo','265 ch','quattro · manuelle 6 / S tronic 6','Apparition de la carrosserie Sportback en 2008.'],
      ]},
      { c:'8V', a:'2013–2020', m:[
        ['2.0 TFSI','4 cyl. 2.0 turbo','300 ch','quattro · S tronic 6/7',''],
        ['2.0 TFSI (2016+)','4 cyl. 2.0 turbo','310 ch','quattro · S tronic 7','Restylage : filtre à particules et puissance revue.'],
      ]},
      { c:'8Y', a:'2020–', m:[
        ['2.0 TFSI','4 cyl. 2.0 turbo','310 ch','quattro · S tronic 7',''],
        ['2.0 TFSI (2024+)','4 cyl. 2.0 turbo','333 ch','quattro · S tronic 7','Reçoit le différentiel à répartition active de la RS3.'],
      ]},
    ],
    'audi-s4': [
      { c:'B5', a:'1997–2002', m:[
        ['2.7 T biturbo','V6 2.7 biturbo','265 ch','quattro · manuelle 6 / tiptronic 5','Le bloc de la RS4 B5, en version civilisée. Berline et Avant.'],
      ]},
      { c:'B6 / B7', a:'2003–2008', m:[
        ['4.2 V8','V8 4.2 atmo','344 ch','quattro · manuelle 6 / tiptronic 6','Un V8 dans une compacte : la S4 la plus atypique de la lignée.'],
      ]},
      { c:'B8 / B8.5', a:'2008–2016', m:[
        ['3.0 TFSI','V6 3.0 à compresseur','333 ch','quattro · manuelle 6 / S tronic 7','Le compresseur volumétrique remplace le V8. Différentiel sport en option.'],
      ]},
      { c:'B9', a:'2016–', m:[
        ['3.0 TFSI','V6 3.0 turbo','354 ch','quattro · tiptronic 8','Passage du compresseur au turbo simple.'],
        ['3.0 TDI (SD4)','V6 3.0 diesel + compresseur électrique','347 ch','quattro · tiptronic 8','Version diesel réservée à l\'Europe, 700 Nm de couple.'],
      ]},
    ],
    'audi-s5': [
      { c:'B8', a:'2007–2012', m:[
        ['4.2 FSI V8','V8 4.2 atmo','354 ch','quattro · manuelle 6 / tiptronic 6','Le seul V8 atmosphérique de la lignée S5 — et la raison pour laquelle les B8 se revendent si bien. Coupé uniquement.'],
        ['3.0 TFSI (Cabriolet)','V6 3.0 à compresseur','333 ch','quattro · S tronic 7','Le cabriolet n\'a JAMAIS reçu le V8 : dès 2009 il est en V6 compressé.'],
      ]},
      { c:'B8.5', a:'2012–2016', m:[
        ['3.0 TFSI','V6 3.0 à compresseur','333 ch','quattro · manuelle 6 / S tronic 7','Le V8 disparaît aussi du coupé. Moins de son, plus de couple à bas régime.'],
      ]},
      { c:'B9', a:'2016–', m:[
        ['3.0 TFSI','V6 3.0 turbo','354 ch','quattro · tiptronic 8','Turbo simple logé dans le V. Sportback 5 portes ajouté à la gamme.'],
        ['3.0 TDI (SD5)','V6 3.0 diesel + compresseur électrique','347 ch','quattro · tiptronic 8','Réseau 48 V. 700 Nm dès 2 500 tr/min.'],
      ]},
    ],
    'audi-rs3': [
      { c:'8P', a:'2011–2012', m:[
        ['2.5 TFSI','5 en ligne 2.5 turbo','340 ch','quattro · S tronic 7','Sportback uniquement, série très courte.'],
      ]},
      { c:'8V', a:'2015–2020', m:[
        ['2.5 TFSI','5 en ligne 2.5 turbo','367 ch','quattro · S tronic 7','Bloc fonte, ordre d\'allumage 1-2-4-5-3 : la signature sonore du 5 cylindres.'],
        ['2.5 TFSI (2017+)','5 en ligne 2.5 turbo, carter alu','400 ch','quattro · S tronic 7','Nouveau bloc allégé de 26 kg. Berline ajoutée à la gamme.'],
      ]},
      { c:'8Y', a:'2021–', m:[
        ['2.5 TFSI','5 en ligne 2.5 turbo','400 ch','quattro · S tronic 7','Différentiel arrière à répartition active (torque splitter) et mode drift assumé.'],
      ]},
    ],
    'audi-rs4': [
      { c:'B5', a:'2000–2001', m:[
        ['2.7 biturbo','V6 2.7 biturbo (Cosworth)','380 ch','quattro · manuelle 6','Avant uniquement. 6 030 exemplaires.'],
      ]},
      { c:'B7', a:'2006–2008', m:[
        ['4.2 FSI','V8 4.2 atmo','420 ch','quattro · manuelle 6','8 250 tr/min. Berline, Avant et Cabriolet. Différentiel autobloquant à 40/60.'],
      ]},
      { c:'B8', a:'2012–2015', m:[
        ['4.2 FSI','V8 4.2 atmo','450 ch','quattro · S tronic 7','Dernière RS4 atmosphérique. Avant uniquement.'],
      ]},
      { c:'B9', a:'2017–', m:[
        ['2.9 TFSI','V6 2.9 biturbo','450 ch','quattro · tiptronic 8','Bloc partagé avec la Porsche Panamera. 600 Nm dès 1 900 tr/min.'],
      ]},
    ],
    'audi-rs5': [
      { c:'B8 / B8.5', a:'2010–2015', m:[
        ['4.2 FSI','V8 4.2 atmo','450 ch','quattro · S tronic 7','8 250 tr/min, différentiel sport arrière. Le dernier V8 atmo de la gamme compacte Audi.'],
      ]},
      { c:'B9', a:'2017–', m:[
        ['2.9 TFSI','V6 2.9 biturbo','450 ch','quattro · tiptronic 8','Coupé et Sportback. Plus rapide que la B8 mais unanimement jugée moins expressive.'],
      ]},
    ],
    'audi-rs6': [
      { c:'C5', a:'2002–2004', m:[
        ['4.2 biturbo','V8 4.2 biturbo (Cosworth)','450 ch','quattro · tiptronic 5','Berline et Avant. Version Plus à 480 ch, 999 exemplaires.'],
      ]},
      { c:'C6', a:'2008–2010', m:[
        ['5.0 TFSI','V10 5.0 biturbo','580 ch','quattro · tiptronic 6','V10 dérivé du bloc Lamborghini Gallardo. Le seul V10 de la lignée.'],
      ]},
      { c:'C7', a:'2013–2018', m:[
        ['4.0 TFSI','V8 4.0 biturbo','560 ch','quattro · tiptronic 8','Avant uniquement à partir d\'ici. Désactivation de cylindres.'],
        ['4.0 TFSI Performance','V8 4.0 biturbo','605 ch','quattro · tiptronic 8','Vitesse portée à 305 km/h avec le pack dynamique.'],
      ]},
      { c:'C8', a:'2019–', m:[
        ['4.0 TFSI','V8 4.0 biturbo, hybridation légère 48 V','600 ch','quattro · tiptronic 8','Seuls le toit, le hayon et les portes avant sont partagés avec l\'A6.'],
        ['Performance / GT','V8 4.0 biturbo','630 ch','quattro · tiptronic 8','La GT, 660 exemplaires, reprend des éléments de la RS6 GTO.'],
      ]},
    ],
    'audi-rs7': [
      { c:'C7', a:'2013–2018', m:[
        ['4.0 TFSI','V8 4.0 biturbo','560–605 ch','quattro · tiptronic 8','Silhouette Sportback : la RS6 en robe de coupé 4 portes.'],
      ]},
      { c:'C8', a:'2019–', m:[
        ['4.0 TFSI','V8 4.0 biturbo, 48 V','600 ch','quattro · tiptronic 8',''],
        ['Performance','V8 4.0 biturbo','630 ch','quattro · tiptronic 8','Allégée de 8 kg, échappement moins filtré.'],
      ]},
    ],
    'audi-tt': [
      { c:'8N', a:'1998–2006', m:[
        ['1.8 T','4 cyl. 1.8 turbo','150–225 ch','traction ou quattro · manuelle','Design Bauhaus. Aileron ajouté en urgence après des accidents à haute vitesse.'],
        ['3.2 V6','VR6 3.2 atmo','250 ch','quattro · DSG 6','Première voiture au monde livrée avec une boîte à double embrayage (2003).'],
      ]},
      { c:'8J', a:'2006–2014', m:[
        ['2.0 TFSI','4 cyl. 2.0 turbo','200–211 ch','traction ou quattro · S tronic 6',''],
        ['3.2 V6 / TTS','VR6 3.2 atmo / 2.0 TFSI','250 / 272 ch','quattro · S tronic 6',''],
        ['TT RS','5 en ligne 2.5 turbo','340–360 ch','quattro · manuelle 6 / S tronic 7','Le retour du 5 cylindres Audi après vingt ans d\'absence.'],
      ]},
      { c:'8S', a:'2014–2023', m:[
        ['2.0 TFSI / TTS','4 cyl. 2.0 turbo','230–306 ch','traction ou quattro · S tronic 7','Instrumentation Virtual Cockpit, une première mondiale.'],
        ['TT RS','5 en ligne 2.5 turbo','400 ch','quattro · S tronic 7','0 à 100 en 3,7 s. Dernier TT RS avant l\'arrêt du modèle.'],
      ]},
    ],
    'audi-r8-v12-tdi': [
      { c:'Concept', a:'2008', m:[
        ['R8 V12 TDI','V12 6.0 TDI biturbo à rampe commune','500 ch, 1 000 Nm','quattro · manuelle 6','Le V12 diesel du prototype R10 vainqueur du Mans, transposé dans le châssis d\'une R8 de série. Deux exemplaires roulants présentés à Detroit puis à Genève en 2008. Le projet a été arrêté : le bloc, trop long, imposait de revoir entièrement la structure arrière, et la crise de 2008 a achevé le dossier.'],
      ]},
    ],
    'audi-r8': [
      { c:'Type 42', a:'2006–2015', m:[
        ['4.2 FSI','V8 4.2 atmo','420–430 ch','quattro · manuelle 6 à grille / R tronic','La boîte manuelle à grille ouverte en fait la plus recherchée aujourd\'hui.'],
        ['5.2 FSI','V10 5.2 atmo','525–560 ch','quattro · manuelle 6 / S tronic 7','V10 partagé avec la Lamborghini Gallardo.'],
        ['GT','V10 5.2 atmo','560 ch','quattro · R tronic','333 exemplaires, allégée de 100 kg.'],
      ]},
      { c:'Type 4S', a:'2015–2024', m:[
        ['V10','V10 5.2 atmo','540–570 ch','quattro · S tronic 7','Le V8 disparaît : la R8 devient exclusivement V10.'],
        ['V10 Plus / Performance','V10 5.2 atmo','610–620 ch','quattro · S tronic 7',''],
        ['V10 RWD','V10 5.2 atmo','540–570 ch','propulsion · S tronic 7','Version propulsion, produite en série limitée puis intégrée à la gamme.'],
      ]},
    ],

    /* ---- BMW en format détaillé --------------------------------------- */
    'bmw-m2': [
      { c:'F87', a:'2016–2021', m:[
        ['M2','N55 3.0 turbo simple','370 ch','propulsion · manuelle 6 / DKG 7','Bloc N55 de la M235i renforcé, pas encore le S55 de la M4.'],
        ['M2 Competition','S55 3.0 biturbo','410 ch','propulsion · manuelle 6 / DKG 7','Reçoit le vrai moteur de la M3/M4 F80. C\'est la version qui a fait la réputation du modèle.'],
        ['M2 CS','S55 3.0 biturbo','450 ch','propulsion · manuelle 6 / DKG 7','Capot et toit carbone, amortisseurs réglables. 2 200 exemplaires.'],
      ]},
      { c:'G87', a:'2023–', m:[
        ['M2','S58 3.0 biturbo','460–480 ch','propulsion · manuelle 6 / Steptronic 8','Dernière M à proposer une boîte manuelle sur un châssis compact.'],
        ['M2 CS','S58 3.0 biturbo','530 ch','propulsion · Steptronic 8',''],
      ]},
    ],
    'bmw-m3': [
      { c:'E30', a:'1986–1991', m:[
        ['M3 2.3','S14 2.3 · 4 cyl. atmo','195–215 ch','propulsion · manuelle 5 (dogleg)','Homologation Groupe A. Culasse dérivée du 4 cylindres de F1 M12.'],
        ['Sport Evolution 2.5','S14 2.5 · 4 cyl. atmo','238 ch','propulsion · manuelle 5','600 exemplaires. La plus recherchée de toutes les M3.'],
      ]},
      { c:'E36', a:'1992–1999', m:[
        ['3.0','S50B30 · 6 en ligne atmo','286 ch','propulsion · manuelle 5','Première M3 six cylindres.'],
        ['3.2 Evo','S50B32 · 6 en ligne atmo','321 ch','propulsion · manuelle 6 / SMG','Double Vanos. La version américaine, bridée à 240 ch, n\'a rien à voir.'],
      ]},
      { c:'E46', a:'2000–2006', m:[
        ['3.2','S54 · 6 en ligne atmo','343 ch','propulsion · manuelle 6 / SMG II','8 000 tr/min, six papillons indépendants.'],
        ['CSL','S54 · 6 en ligne atmo','360 ch','propulsion · SMG II','Toit carbone, admission au son mythique, 1 383 exemplaires.'],
      ]},
      { c:'E90 / E92 / E93', a:'2007–2013', m:[
        ['4.0 V8','S65 4.0 · V8 atmo','420 ch','propulsion · manuelle 6 / DKG 7','Seule M3 à V8, dérivé du V10 de la M5 E60. Rupteur à 8 400 tr/min.'],
        ['GTS','S65 4.4 · V8 atmo','450 ch','propulsion · DKG 7','135 exemplaires, orange Fire, arceau de série.'],
      ]},
      { c:'F80', a:'2014–2018', m:[
        ['M3','S55 3.0 biturbo','431 ch','propulsion · manuelle 6 / DKG 7','Berline uniquement : le coupé devient M4.'],
        ['Competition','S55 3.0 biturbo','450 ch','propulsion · manuelle 6 / DKG 7',''],
        ['CS','S55 3.0 biturbo','460 ch','propulsion · DKG 7','1 200 exemplaires.'],
      ]},
      { c:'G80', a:'2021–', m:[
        ['M3','S58 3.0 biturbo','480 ch','propulsion · manuelle 6','La seule à conserver la boîte manuelle.'],
        ['Competition','S58 3.0 biturbo','510 ch','propulsion · Steptronic 8',''],
        ['Competition xDrive','S58 3.0 biturbo','510–530 ch','intégrale débrayable · Steptronic 8','Première M3 à transmission intégrale, et première M3 Touring de l\'histoire.'],
        ['CS','S58 3.0 biturbo','550 ch','intégrale · Steptronic 8',''],
      ]},
    ],
    'bmw-m5': [
      { c:'E28', a:'1985–1987', m:[
        ['M5','M88/S38 3.5 · 6 en ligne atmo','286 ch','propulsion · manuelle 5','Le moteur de la M1 dans une berline familiale, assemblée à la main.'],
      ]},
      { c:'E34', a:'1988–1995', m:[
        ['3.6','S38B36 · 6 en ligne atmo','315 ch','propulsion · manuelle 5',''],
        ['3.8','S38B38 · 6 en ligne atmo','340 ch','propulsion · manuelle 6','Dernière M5 montée à la main. Version Touring disponible.'],
      ]},
      { c:'E39', a:'1998–2003', m:[
        ['M5','S62 4.9 · V8 atmo','400 ch','propulsion · manuelle 6','Souvent citée comme la M5 la plus équilibrée jamais produite.'],
      ]},
      { c:'E60 / E61', a:'2005–2010', m:[
        ['M5','S85 5.0 · V10 atmo','507 ch','propulsion · SMG III 7','Seule berline de série à V10 atmosphérique. 8 250 tr/min. Version Touring en Europe.'],
      ]},
      { c:'F10', a:'2011–2016', m:[
        ['M5','S63 4.4 · V8 biturbo','560 ch','propulsion · DKG 7','Passage au turbo, boîte manuelle encore proposée aux États-Unis.'],
        ['Competition / 30 Jahre','S63 4.4 · V8 biturbo','575–600 ch','propulsion · DKG 7','La 30 Jahre, 300 exemplaires, à 600 ch.'],
      ]},
      { c:'F90', a:'2017–2023', m:[
        ['M5','S63 4.4 · V8 biturbo','600 ch','intégrale M xDrive débrayable · Steptronic 8','Première M5 intégrale — avec un mode propulsion pure.'],
        ['Competition','S63 4.4 · V8 biturbo','625 ch','intégrale débrayable · Steptronic 8',''],
        ['CS','S63 4.4 · V8 biturbo','635 ch','intégrale débrayable · Steptronic 8','Allégée de 70 kg, 4 places. La M5 la plus aboutie de la génération.'],
      ]},
      { c:'G90', a:'2024–', m:[
        ['M5','V8 4.4 biturbo hybride rechargeable','727 ch','intégrale · Steptronic 8','Plus de 2,4 tonnes : la M5 la plus puissante et la plus lourde de l\'histoire.'],
      ]},
    ],
    'bmw-m4': [
      { c:'F82 / F83', a:'2014–2020', m:[
        ['M4','S55 3.0 biturbo','431 ch','propulsion · manuelle 6 / DKG 7',''],
        ['Competition','S55 3.0 biturbo','450 ch','propulsion · manuelle 6 / DKG 7',''],
        ['GTS','S55 3.0 biturbo, injection d\'eau','500 ch','propulsion · DKG 7','700 exemplaires. Première voiture de série à injection d\'eau.'],
        ['CS','S55 3.0 biturbo','460 ch','propulsion · DKG 7',''],
      ]},
      { c:'G82 / G83', a:'2021–', m:[
        ['M4','S58 3.0 biturbo','480 ch','propulsion · manuelle 6',''],
        ['Competition','S58 3.0 biturbo','510 ch','propulsion · Steptronic 8',''],
        ['Competition xDrive','S58 3.0 biturbo','510–530 ch','intégrale débrayable · Steptronic 8',''],
        ['CSL','S58 3.0 biturbo','550 ch','propulsion · Steptronic 8','Allégée de 100 kg, 2 places, 1 000 exemplaires.'],
      ]},
    ],

    /* ---- Mercedes-AMG en format détaillé ------------------------------ */
    'mercedes-a45': [
      { c:'W176', a:'2013–2018', m:[
        ['A 45 AMG','M133 2.0 turbo','360 ch','intégrale 4Matic · DCT 7','Le 4 cylindres de série le plus puissant du monde à sa sortie.'],
        ['A 45 (2015+)','M133 2.0 turbo','381 ch','intégrale 4Matic · DCT 7',''],
      ]},
      { c:'W177', a:'2019–', m:[
        ['A 45 S','M139 2.0 turbo','421 ch','intégrale 4Matic+ · DCT 8','421 ch pour 2,0 L : record encore inégalé. Bloc monté à la main, turbo à roulement à billes.'],
      ]},
    ],
    'mercedes-e63': [
      { c:'W211', a:'2006–2009', m:[
        ['E 63 AMG','M156 6.2 · V8 atmo','514 ch','propulsion · 7G-Tronic','Berline et break.'],
      ]},
      { c:'W212', a:'2009–2016', m:[
        ['E 63 (6.2)','M156 6.2 · V8 atmo','525 ch','propulsion · MCT 7','Dernier E63 atmosphérique.'],
        ['E 63 (5.5 biturbo)','M157 5.5 · V8 biturbo','525–585 ch','propulsion puis 4Matic · MCT 7','La S 4Matic à 585 ch introduit l\'intégrale sur la lignée.'],
      ]},
      { c:'W213', a:'2017–2023', m:[
        ['E 63 S','M177 4.0 · V8 biturbo','612 ch','intégrale 4Matic+ débrayable · MCT 9','Mode Drift de série : la transmission bascule en propulsion pure.'],
      ]},
    ],


    /* ---- BMW ---------------------------------------------------------- */
            'bmw-serie3': [
      ['E21','1975–1983','4 et 6 cyl. atmo','90–143 ch','La fondatrice de la lignée.'],
      ['E30','1982–1994','4 et 6 cyl. atmo','90–238 ch','Première Série 3 en break (Touring), en cabriolet et en 4x4 (325iX).'],
      ['E36','1990–2000','4 et 6 cyl. atmo','102–321 ch','Première à passer à l\'essieu arrière multibras.'],
      ['E46','1998–2006','4 et 6 cyl. atmo','105–360 ch','Considérée comme le sommet de la Série 3 par une bonne part des amateurs.'],
      ['E90/E91/E92','2005–2013','4 et 6 cyl., turbo à partir de 2006','122–420 ch','Arrivée du 6 cylindres turbo N54, base de toute la scène préparation.'],
      ['F30','2012–2019','turbo généralisé','116–431 ch','Le 6 en ligne se raréfie au profit des 4 cylindres.'],
      ['G20','2019–','turbo, hybridation légère','150–510 ch','Retour d\'un châssis nettement plus rigide.'],
    ],
    'bmw-serie5': [
      ['E12','1972–1981','4 et 6 cyl. atmo','90–218 ch','La première Série 5.'],
      ['E28','1981–1988','6 cyl., premier diesel BMW','90–286 ch',''],
      ['E34','1988–1996','6 cyl. et V8','113–340 ch','Première Série 5 en break Touring.'],
      ['E39','1995–2003','6 cyl. et V8','136–400 ch','Souvent désignée comme la meilleure berline de sa décennie.'],
      ['E60','2003–2010','6 cyl., V8, V10','130–507 ch','Style Bangle très clivant, technologie de rupture (iDrive, direction active).'],
      ['F10','2010–2017','turbo généralisé','143–600 ch',''],
      ['G30','2017–2023','turbo, hybrides rechargeables','150–635 ch',''],
    ],
            'bmw-z4': [
      ['E85/E86','2002–2008','6 cyl. atmo','150–343 ch','La version M Coupé « clown shoe » est devenue collector.'],
      ['E89','2009–2016','4 et 6 cyl. turbo','156–340 ch','Toit rigide escamotable.'],
      ['G29','2018–','4 et 6 cyl. turbo','197–387 ch','Développée avec Toyota — plateforme partagée avec la GR Supra.'],
    ],
    'bmw-x5': [
      ['E53','1999–2006','6 cyl., V8','184–355 ch','Le premier SUV BMW, appelé « Sports Activity Vehicle ».'],
      ['E70','2006–2013','6 cyl., V8 biturbo','173–555 ch','Première version M.'],
      ['F15','2013–2018','turbo, hybride rechargeable','218–575 ch',''],
      ['G05','2018–','turbo, hybride','231–625 ch',''],
    ],

    /* ---- Porsche ------------------------------------------------------ */
                    'porsche-cayenne': [
      ['955 / 957','2002–2010','V6, V8, V8 turbo','250–550 ch','Le SUV qui a financé le retour en compétition de Porsche.'],
      ['958','2010–2017','V6, V8, hybride, diesel','245–570 ch',''],
      ['9YA','2017–','V6, V8, hybrides rechargeables','340–739 ch',''],
    ],

    /* ---- Audi --------------------------------------------------------- */
    'audi-a3': [
      ['8L','1996–2003','4 cyl. essence et TDI','90–225 ch','Première compacte premium du groupe.'],
      ['8P','2003–2012','4 cyl. TFSI et TDI','102–265 ch','Apparition de la carrosserie Sportback 5 portes.'],
      ['8V','2012–2020','4 cyl. TFSI et TDI','86–400 ch','Plateforme MQB.'],
      ['8Y','2020–','4 cyl., hybrides','110–400 ch',''],
    ],
                
    /* ---- Volkswagen --------------------------------------------------- */
    'vw-golf': [
      ['Mk1','1974–1983','4 cyl. essence et diesel','50–112 ch','Dessinée par Giugiaro. Elle remplace la Coccinelle.'],
      ['Mk2','1983–1992','4 cyl., G60 compressé','54–160 ch','Première Golf à transmission intégrale (Syncro) et à catalyseur.'],
      ['Mk3','1991–1997','4 cyl., VR6','60–190 ch','Première avec airbags et VR6.'],
      ['Mk4','1997–2003','4 cyl., VR6, V5','68–241 ch','Bond qualitatif majeur. Première boîte DSG (R32).'],
      ['Mk5','2003–2008','TSI, TDI','75–250 ch','Essieu arrière multibras.'],
      ['Mk6','2008–2012','TSI, TDI','80–270 ch',''],
      ['Mk7','2012–2019','TSI, TDI, GTE, e-Golf','85–310 ch','Plateforme MQB.'],
      ['Mk8','2019–','TSI, hybrides','110–333 ch','Commandes tactiles très critiquées, partiellement corrigées en 2024.'],
    ],
        
    /* ---- Mercedes ----------------------------------------------------- */
            
    /* ---- Renault ------------------------------------------------------ */
            
    /* ---- Peugeot ------------------------------------------------------ */
            
    /* ---- Japon -------------------------------------------------------- */
                    
    /* ---- États-Unis --------------------------------------------------- */
            'jeep-wrangler': [
      ['YJ','1986–1995','4 et 6 cyl.','121–180 ch','Phares rectangulaires — l\'exception mal-aimée de la lignée.'],
      ['TJ','1996–2006','4 cyl., 6 cyl. 4.0','120–190 ch','Retour des phares ronds et suspensions à ressorts hélicoïdaux.'],
      ['JK','2007–2018','V6 3.6','199–285 ch','Première version 4 portes Unlimited.'],
      ['JL','2018–','4 cyl. turbo, V6, hybride 4xe, V8 6.4','272–470 ch','La Rubicon 392 et son V8 de 470 ch.'],
    ],

    /* ---- Royaume-Uni et Italie ---------------------------------------- */
            'lambo-huracan': [
      ['LP 610-4','2014–2019','V10 5.2 atmo','580–640 ch','Remplace la Gallardo, modèle le plus vendu de la marque.'],
      ['Evo','2019–2023','V10 5.2 atmo','610–640 ch','Roues arrière directrices, système de contrôle prédictif LDVI.'],
      ['STO / Tecnica / Sterrato','2021–2024','V10 5.2 atmo','610–640 ch','La STO dérive de la Super Trofeo ; la Sterrato est surélevée pour la terre.'],
    ],
    'ferrari-testarossa': [
      ['Testarossa','1984–1991','flat-12 4.9 atmo','390 ch','Les ouïes latérales, imposées par les radiateurs déportés, sont devenues son emblème.'],
      ['512 TR','1991–1994','flat-12 4.9 atmo','428 ch','Refonte profonde du châssis et de la boîte.'],
      ['F512 M','1994–1996','flat-12 4.9 atmo','440 ch','Phares fixes, 501 exemplaires. La plus rare et la plus cotée.'],
    ],
  };

  /* Extension du système de collection existant.
     `VARIANTS` est déclaré en const au niveau racine d'index.html : l'objet
     est donc lisible ET modifiable depuis ce fichier. On y AJOUTE les modèles
     qui n'avaient aucune déclinaison, et on ne touche JAMAIS à une liste
     déjà présente — réécrire un libellé existant invaliderait les
     déclinaisons que l'utilisateur a déjà cochées dans son garage. */
  function etendreVariants() {
    try {
      if (typeof VARIANTS === 'undefined' || !VARIANTS) return 0;
      let n = 0;
      for (const id in GENS) {
        if (Array.isArray(VARIANTS[id]) && VARIANTS[id].length) continue;  // déjà défini : on respecte
        VARIANTS[id] = GENS[id].flatMap(g =>
          (g && !Array.isArray(g) && Array.isArray(g.m))
            ? g.m.map(mo => `${g.c} ${mo[0]}`)   // détaillé : une case par motorisation
            : [g[0]]);                            // court : une case par génération
        n++;
      }
      return n;
    } catch (_) { return 0; }
  }

  /* ======================================================================
     4. CORRESPONDANCE AVEC LE CATALOGUE
     ----------------------------------------------------------------------
     Table explicite : id du catalogue Garage Manifest -> clé de fiche.
     J'ai abandonné le rapprochement flou par coefficient de Dice une fois
     les vrais identifiants connus. Une table se relit, se corrige et ne
     produit JAMAIS de faux positif — un rapprochement flou finit toujours
     par coller la fiche d'une 911 GT3 sur une 911 Carrera un jour ou l'autre.

     Règle d'inscription : uniquement quand l'entrée du catalogue désigne UNE
     version précise. Les entrées génériques qui couvrent plusieurs
     générations (bmw-m5, vw-golf-gti, porsche-911) sont volontairement
     absentes : y afficher les chiffres d'une seule génération serait faux.
     ====================================================================== */

  const MAP = {
    // Groupe B et rallye
    'audi-s1-e2'              : 'audi-sport-quattro-s1',
    'audi-quattro'            : 'audi-quattro-ur',
    'audi-r8-v12-tdi'         : 'audi-r8-v12-tdi',
    'peugeot-205-t16'         : 'peugeot-205-t16-e2',
    'lancia-delta-s4'         : 'lancia-delta-s4',
    'lancia-037'              : 'lancia-037',
    'ford-rs200'              : 'ford-rs200',
    'mg-metro-6r4'            : 'mg-metro-6r4',
    'renault-5-turbo'         : 'renault-5-turbo-2',
    'lancia-stratos'          : 'lancia-stratos-hf',
    'lancia-delta'            : 'lancia-delta-integrale-evo2',
    'ford-escort-cosworth'    : 'ford-escort-rs-cosworth',
    'subaru-22b'              : 'subaru-impreza-22b',
    'mitsubishi-evo'          : 'mitsubishi-evo-vi-tme',

    // Porsche
    'porsche-959'             : 'porsche-959',
    'porsche-911-gt1'         : 'porsche-911-gt1-strassen',
    'porsche-carrera-gt'      : 'porsche-carrera-gt',
    'porsche-911-gt3rs'       : 'porsche-911-gt3-rs-992',
    'porsche-cayman-gt4'      : 'porsche-718-cayman-gt4-rs',
    'ruf-ctr'                 : 'ruf-ctr-yellowbird',

    // V12, V10, hypersportives
    'ferrari-250-gto'         : 'ferrari-250-gto',
    'ferrari-f40'             : 'ferrari-f40',
    'ferrari-f50'             : 'ferrari-f50',
    'ferrari-enzo'            : 'ferrari-enzo',
    'lambo-miura'             : 'lamborghini-miura-sv',
    'lambo-countach'          : 'lamborghini-countach-lp400',
    'mclaren-f1'              : 'mclaren-f1',
    'jaguar-xj220'            : 'jaguar-xj220',
    'bugatti-eb110'           : 'bugatti-eb110-ss',
    'bugatti-chiron'          : 'bugatti-chiron',
    'lexus-lfa'               : 'lexus-lfa',
    'pagani-zonda'            : 'pagani-zonda-c12s',
    'gordonmurray-t50'        : 'gma-t50',
    'gma-t50'                 : 'gma-t50',

    // Japonaises
    'honda-nsx-na1'           : 'honda-nsx-na1',
    'honda-s2000'             : 'honda-s2000-ap1',
    'nissan-skyline-r34'      : 'nissan-skyline-gtr-r34',
    'toyota-supra-mk4'        : 'toyota-supra-rz-a80',
    'mazda-rx7'               : 'mazda-rx7-fd',
    'nissan-gtr'              : 'nissan-gtr-r35',
    'toyota-gr-yaris'         : 'toyota-gr-yaris',

    // Allemandes
    'bmw-e30-m3'              : 'bmw-m3-e30-evo3',
    'mercedes-190e'           : 'mercedes-190e-evo2',
    'audi-rs2'                : 'audi-rs2-avant',

    // Françaises
    'alpine-a110-og'          : 'alpine-a110-1600s',
    'alpine-a110'             : 'alpine-a110-2017',
    'renault-clio-williams'   : 'renault-clio-williams',
    'renault-clio-v6'         : 'renault-clio-v6-ph2',
    'peugeot-205-gti'         : 'peugeot-205-gti-19',
    'citroen-sm'              : 'citroen-sm',
    'venturi-400gt'           : 'venturi-400-gt',

    // Italiennes, britanniques, orphelines
    'alfa-giulia-gtam'        : 'alfa-romeo-giulia-gta',
    'lotus-elise'             : 'lotus-elise-s1',
    'caterham-seven'          : 'caterham-seven-620r',
    'tvr-sagaris'             : 'tvr-sagaris',
    'detomaso-pantera'        : 'de-tomaso-pantera-gt5',
    'saab-900turbo'           : 'saab-900-turbo-16s',
    'volvo-850r'              : 'volvo-850-t5r'
  };

  /* ======================================================================
     5. RENDU
     ----------------------------------------------------------------------
     Le bloc s'insère DANS ta fiche existante (infoPageHTML), sous la carte
     « Le saviez-vous ». Il réutilise tes classes .specs / .spec / .fact et
     tes variables CSS : le module hérite de ton thème au lieu d'en imposer
     un second. Seules cinq classes nouvelles (préfixe .gsp-) sont ajoutées,
     pour les indicateurs dérivés que ta feuille de style ne couvrait pas.
     ====================================================================== */

  const esc = s => String(s ?? '').replace(/[&<>"']/g, m =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

  const RAR_VAR = { legendaire:'--legendaire', epique:'--epique', rare:'--rare',
                    peucommun:'--peucommun', commun:'--commun' };

  /** Une des trois vedettes : gros chiffre + unité + jauge de percentile. */
  function vedette(f, champ) {
    const def = DERIVES[champ];
    const v = deriver(f)[champ];
    if (v == null) return '';
    const p = percentile(champ, v);
    return `<div class="gsp-v">
      <b>${esc(fmtNombre(v, def.dec))}</b>
      <small>${esc(def.u)}<br>${esc(def.lib)}</small>
      ${p != null ? `<div class="gsp-jauge"><i style="width:${Math.round(p*100)}%"></i></div>` : ''}
    </div>`;
  }

  function specRow(f, champ) {
    const val = fmt(f, champ);
    if (!val) return '';
    return `<div class="spec"><dt>${esc((CHAMPS[champ]||DERIVES[champ]).lib)}</dt><dd>${esc(val)}</dd></div>`;
  }

  /**
   * Bloc « fiche technique avancée » pour un id du CATALOGUE.
   * Renvoie une chaîne vide si aucune fiche n'est renseignée : ta fiche
   * existante reste alors exactement telle qu'elle est aujourd'hui.
   */
  /** Bloc « Générations » — indépendant de la fiche technique.
   *  Beaucoup d'entrées ont des générations sans avoir de fiche détaillée
   *  (Série 3, Golf, Clio…) : les deux blocs doivent pouvoir vivre séparément. */
  function gensHTML(idCatalogue) {
    const g = GENS[idCatalogue];
    if (!g || !g.length) return '';

    let nbMotos = 0;

    const lignes = g.map(gen => {
      /* Format DÉTAILLÉ : { c, a, m:[[nom, méca, ch, transmission, note]] } */
      if (gen && !Array.isArray(gen) && Array.isArray(gen.m)) {
        nbMotos += gen.m.length;
        const motos = gen.m.map(([nom, meca, ch, tx, note]) => `
          <div class="gm">
            <div class="gm-t"><b>${esc(nom)}</b><span>${esc(ch)}</span></div>
            <p>${esc(meca)}${tx ? ' · ' + esc(tx) : ''}</p>
            ${note ? `<small>${esc(note)}</small>` : ''}
          </div>`).join('');
        return `<div class="gg gg-d">
          <div class="gg-tete"><b>${esc(gen.c)}</b><i>${esc(gen.a)}</i></div>
          <div class="gm-liste">${motos}</div>
        </div>`;
      }
      /* Format COURT : [code, années, méca, ch, note] */
      const [code, an, meca, ch, note] = gen;
      nbMotos++;
      return `<div class="gg">
        <b>${esc(code)}</b>
        <div class="gt">
          <i>${esc(an)}</i>
          <p>${esc([meca, ch].filter(Boolean).join(' · '))}</p>
          ${note ? `<small>${esc(note)}</small>` : ''}
        </div>
      </div>`;
    }).join('');

    const detaille = g.some(x => x && !Array.isArray(x) && Array.isArray(x.m));
    return `<div class="gsp gsp-gens">
      <div class="gsp-h"><span>Générations &amp; motorisations</span>
        <em>${g.length} gén.${detaille ? ` · ${nbMotos} version${nbMotos > 1 ? 's' : ''}` : ''}</em></div>
      ${lignes}
    </div>`;
  }

  function ficheHTML(idCatalogue) {
    const cle = MAP[idCatalogue];
    const f = cle && SPECS[cle];
    if (!f) return '';

    const r = rarete(f.prod);
    const flous = (f.flou || []).map(c => (CHAMPS[c] || DERIVES[c] || {}).lib).filter(Boolean);

    const vedettes = [vedette(f,'kgch'), vedette(f,'chT'), vedette(f,'chL')].filter(Boolean).join('');
    const rows = ['kg','nm','cyl','rupteur','nmL','kgnm']
      .map(c => specRow(f, c)).filter(Boolean).join('');

    return `<div class="gsp">
      ${distinctionsHTML(idCatalogue)}
      <div class="gsp-h">
        <span>Fiche technique</span>
        ${f.surnom ? `<em>« ${esc(f.surnom)} »</em>` : ''}
      </div>

      ${signature(f) ? `<p class="gsp-sig">${esc(signature(f))}</p>` : ''}
      ${vedettes ? `<div class="gsp-vedettes">${vedettes}</div>` : ''}
      ${rows ? `<div class="specs specs-info">${rows}</div>` : ''}

      ${r ? `<div class="gsp-rar" style="color:var(${RAR_VAR[r.cle]});border-color:color-mix(in srgb,var(${RAR_VAR[r.cle]}) 40%,transparent)"
              title="Palier dérivé du volume de production : ${esc(r.lib)}">
              ${fmtNombre(f.prod)} exemplaire${f.prod > 1 ? 's' : ''} produit${f.prod > 1 ? 's' : ''}</div>` : ''}

      ${f.son ? `<div class="fact" style="border-left-color:var(--peucommun)">
                   <div class="fact-k" style="color:var(--peucommun)">Signature sonore</div>
                   <p>${esc(f.son)}</p></div>` : ''}

      ${f.note ? `<div class="fact"><div class="fact-k">À savoir</div><p>${esc(f.note)}</p></div>` : ''}

      ${flous.length ? `<p class="gsp-flou">Valeurs approximatives (≈) : ${esc(flous.join(', ').toLowerCase())}.</p>` : ''}
    </div>`;
  }

  /** Ce qui est réellement injecté dans la fiche : les deux blocs à la suite. */
  function blocHTML(idCatalogue) {
    return ficheHTML(idCatalogue) + gensHTML(idCatalogue) + moteursHTML(idCatalogue);
  }


  /* ======================================================================
     INDEX INVERSÉ DES BLOCS MOTEURS
     ----------------------------------------------------------------------
     Les 1 065 motorisations décrivent chacune un bloc en texte. Lues à
     l'envers, elles révèlent ce qu'aucun catalogue ne montre : le même
     moteur qui traverse plusieurs marques et plusieurs décennies. Le V6 PRV
     relie la 504 Coupé, la SM, la DeLorean et l'Alpine GTA. Le 4G63 va de
     la Galant VR-4 à l'Evo IX. C'est exactement le lien qu'un passionné a
     en tête sans jamais pouvoir le visualiser.

     PRINCIPE DE FIABILITÉ — le même que partout ailleurs ici :
     reconnaissance par MOTIF EXPLICITE, jamais par inférence. On n'associe
     pas deux voitures parce qu'elles ont « un V6 3.0 turbo » : cette
     description couvre vingt blocs sans rapport. On les associe parce que
     le code du bloc est écrit noir sur blanc dans la fiche. Une famille qui
     n'apparaît qu'une fois n'est pas affichée : sans lien, pas d'intérêt.
     ====================================================================== */

  const MOTEURS = [
    { c:'2jz',    n:'Toyota 2JZ',        re:/\b2JZ/i,             d:'Six en ligne fonte, réputé encaisser le double de sa puissance sans ouverture.' },
    { c:'1jz',    n:'Toyota 1JZ',        re:/\b1JZ/i,             d:'Le petit frère 2,5 L du 2JZ, roi de la berline japonaise à propulsion.' },
    { c:'4age',   n:'Toyota 4A-GE',      re:/\b4A-G/i,            d:'Le seize soupapes de la AE86, produit pendant quinze ans.' },
    { c:'3sgte',  n:'Toyota 3S-GTE',     re:/\b3S-G/i,            d:'Le turbo des Celica GT-Four et MR2, forgé par le rallye mondial.' },
    { c:'2zz',    n:'Toyota 2ZZ-GE',     re:/\b2ZZ/i,             d:'Culasse co-développée avec Yamaha. Le bloc des Lotus Elise et Exige.' },
    { c:'2gr',    n:'Toyota 2GR',        re:/\b2GR|Toyota 3\.5 V6/i, d:'V6 3,5 L, compressé chez Lotus.' },
    { c:'rb26',   n:'Nissan RB26DETT',   re:/\bRB2[68]|RBX/i,     d:'Le bloc des Skyline GT-R R32, R33 et R34.' },
    { c:'sr20',   n:'Nissan SR20DET',    re:/\bSR20/i,            d:'Le moteur de la scène drift : Silvia, 180SX, Pulsar GTI-R.' },
    { c:'vq',     n:'Nissan VQ',         re:/\bVQ3[57]/i,         d:'Élu parmi les dix meilleurs moteurs du monde quatorze années de suite.' },
    { c:'vr38',   n:'Nissan VR38DETT',   re:/\bVR38/i,            d:'Assemblé à la main par un seul takumi, dont le nom figure sur une plaque.' },
    { c:'vg30',   n:'Nissan VG30',       re:/\bVG30/i,            d:'Le V6 de la 300ZX, premier japonais biturbo de grande diffusion.' },
    { c:'4g63',   n:'Mitsubishi 4G63',   re:/\b4G63/i,            d:'Vingt-trois ans de Lancer Evo, de la Galant VR-4 à l\'Evo IX.' },
    { c:'ej',     n:'Subaru EJ',         re:/\bEJ2[025]|EJ207|EJ257/i, d:'Le flat-four à collecteur inégal : le battement Subaru.' },
    { c:'13b',    n:'Mazda 13B rotatif', re:/\b13B/i,             d:'Birotor Wankel. Aucun autre moteur ne produit ce son.' },
    { c:'kseries',n:'Honda K-Series',    re:/\bK20|\bK24/i,       d:'Le VTEC des Civic Type R et Integra DC5.' },
    { c:'bseries',n:'Honda B-Series',    re:/\bB1[68][A-Z]/i,     d:'Le VTEC originel : B16B, B18C. Plus de 115 ch par litre en atmosphérique.' },
    { c:'f20c',   n:'Honda F20C / F22C', re:/\bF2[02]C/i,         d:'9 000 tr/min et 120 ch/L : record de puissance spécifique atmosphérique.' },
    { c:'h22',    n:'Honda H22',         re:/\bH22/i,             d:'Le quatre cylindres des Prelude VTEC.' },
    { c:'c30',    n:'Honda C30A / C32B', re:/\bC3[02][AB]/i,      d:'Le V6 tout aluminium de la NSX, équilibré à la main sur les Type R.' },
    { c:'mezger', n:'Porsche Mezger',    re:/Mezger/i,            d:'Vilebrequin issu de la 962 du Mans. Le flat-six des GT3, GT2 et Turbo jusqu\'en 2012.' },
    { c:'prv',    n:'V6 PRV',            re:/\bPRV\b/i,           d:'Peugeot-Renault-Volvo. Un même V6 chez Citroën, DeLorean, Alpine, Venturi et Lancia.' },
    { c:'busso',  n:'V6 Busso (Alfa)',   re:/Busso/i,             d:'Souvent cité comme le V6 le plus mélodieux jamais produit. Vingt-huit ans de carrière.' },
    { c:'vr6',    n:'Volkswagen VR6',    re:/\bVR6/i, m:['Volkswagen','Audi','SEAT','Škoda'], d:'Six cylindres à 15°, dans l\'encombrement d\'un quatre cylindres.' },
    { c:'ea113',  n:'VAG 1.8 T 20v',     re:/1\.8 turbo 20v|1\.8T\b/i, m:['Volkswagen','Audi','SEAT','Cupra','Škoda'], d:'De la Golf IV GTI à l\'Audi TT et la Leon Cupra R : le bloc de toute une génération de préparation.' },
    { c:'ea888',  n:'VAG 2.0 TFSI / TSI',re:/2\.0 T[FS]I/i, m:['Volkswagen','Audi','SEAT','Cupra','Škoda'], d:'Le quatre cylindres du groupe VW, de 200 à 310 ch selon les versions.' },
    { c:'audi5',  n:'Audi 5 cylindres 2.5', re:/5 en ligne 2\.5 turbo/i, m:['Audi','Cupra','SEAT'], d:'Ordre d\'allumage 1-2-4-5-3 : la signature sonore héritée du Groupe B.' },
    { c:'s54',    n:'BMW S54',           re:/\bS54\b/i,           d:'Six papillons indépendants, 8 000 tr/min. Le bloc de la M3 E46 et de la Z3 M.' },
    { c:'s65',    n:'BMW S65',           re:/\bS65\b/i,           d:'V8 dérivé du V10 de la M5 E60. Rupteur à 8 400 tr/min.' },
    { c:'s55',    n:'BMW S55',           re:/\bS55\b/i,           d:'Le six en ligne biturbo des M3 F80, M4 F82 et M2 Competition.' },
    { c:'s58',    n:'BMW S58',           re:/\bS58\b/i,           d:'Bloc à carter fermé, dérivé du B58. De la M2 G87 à la M4 CSL.' },
    { c:'s63',    n:'BMW S63',           re:/\bS63\b/i,           d:'V8 biturbo « hot-inside-V » des M5 et X5 M.' },
    { c:'b58',    n:'BMW B58',           re:/\bB58\b/i,           d:'Le six en ligne turbo BMW, aussi sous le capot de la Toyota GR Supra.' },
    { c:'m156',   n:'Mercedes M156 / M159', re:/\bM15[69]\b/i,    d:'Le dernier grand V8 6,2 L atmosphérique conçu par AMG.' },
    { c:'m177',   n:'Mercedes M177 / M178', re:/\bM17[78]\b/i,    d:'V8 4,0 biturbo à turbos logés dans le V. De la C63 à l\'Aston Vantage.' },
    { c:'m139',   n:'Mercedes M133 / M139', re:/\bM13[39]\b/i,    d:'421 ch pour 2,0 L : record encore inégalé pour un quatre cylindres de série.' },
    { c:'v12amg', n:'V12 AMG (Pagani)',  re:/V12 AMG/i,           d:'Le V12 Mercedes qui anime toutes les Pagani depuis 1999.' },
    { c:'ls',     n:'GM small-block LS / LT', re:/\bL[ST][0-9]\b/i, m:['Chevrolet','Cadillac','Pontiac','GMC','Holden','Ultima','SCG','Vector'], d:'Du LS1 de la Corvette C5 au LT6 à vilebrequin plat de la C8 Z06.' },
    { c:'hemi',   n:'Chrysler HEMI',     re:/HEMI/i, m:['Dodge','Chrysler','Plymouth','Jeep','Ram'], d:'Chambres hémisphériques. Du 426 de 1964 au 6.2 compressé des Hellcat.' },
    { c:'coyote', n:'Ford Coyote 5.0',   re:/Coyote/i,            d:'Le V8 des Mustang GT modernes.' },
    { c:'yb',     n:'Ford Cosworth YB',  re:/\bYB[A-Z]\b/i,       d:'Le bloc des Sierra et Escort Cosworth. Plus de 500 ch en Groupe A.' },
    { c:'ecoboost23', n:'Ford EcoBoost 2.3', re:/2\.3 (EcoBoost|turbo)|EcoBoost 2\.3/i, m:['Ford'], d:'Du Focus RS Mk3 à la Mustang, en passant par le Ranger Raptor.' },
    { c:'dfv',    n:'Ford Cosworth DFV', re:/\bDFV\b/i,           d:'155 victoires en Grand Prix. Le moteur de F1 le plus victorieux de l\'histoire.' },
    { c:'kseries_rover', n:'Rover K-Series', re:/K-Series/i,      d:'Le bloc léger des premières Lotus Elise.' },
    { c:'w16',    n:'Bugatti W16 8.0',   re:/\bW16\b/i,           d:'Quatre turbos, seize cylindres, dix radiateurs. De la Veyron à la Chiron.' },
    { c:'flat12', n:'Flat-12',            re:/flat-12|12 cylindres à plat/i, d:'Douze cylindres à plat. Centre de gravité très bas, encombrement démesuré.' },
    { c:'w12',    n:'W12 Volkswagen',     re:/\bW12\b/i,           d:'Deux VR6 accolés. Bentley, Audi et Volkswagen l\'ont partagé pendant vingt-et-un ans.' },
    { c:'v12tdi', n:'V12 diesel',          /* Le point de « 6.0 » ne doit PAS interrompre la recherche : exclure « . »
         pour éviter de traverser une phrase bloquait aussi toutes les cylindrées
         décimales, et « V12 6.0 TDI » n'était plus reconnu. On autorise donc
         explicitement chiffres, points et espaces entre l'architecture et le
         type de carburant, et rien d'autre. */
      re:/V12[\s\d.,]{0,10}(bi)?(turbo)?(diesel|TDI|HDi)|TDI jusqu'au V12/i,
      m:['Audi','Peugeot','Volkswagen'],
      d:'Le seul V12 diesel de l\'histoire de l\'automobile. Audi l\'a gagné au Mans avec la R10, puis l\'a mis dans un Q7 de série ; Peugeot a répondu avec le V12 HDi de la 908.' },
    { c:'v8amerique', n:'V8 américain sous capot européen', re:/V8 (Chevrolet|Chrysler|Ford)/i,
      d:'La recette anglo-italienne : châssis européen, gros V8 américain increvable et bon marché.' },
    { c:'v6maserati', n:'V6 Maserati',    re:/V6 Maserati/i,       d:'Le V6 de la Merak, aussi sous le capot de la Citroën SM et de la Ligier JS2.' },
    { c:'xk',     n:'Jaguar XK',         re:/6 en ligne XK/i,     d:'Double arbre à cames en tête dès 1949. Cinq victoires au Mans.' },
  ];

  /* Index construit une fois : famille -> [ { id, gen, moto, meca } ] */
  let _idxMoteurs = null;
  /* L'index parcourt le CATALOGUE, pas seulement GENS, et interroge mecaDe()
     — c'est-à-dire exactement les mêmes sources que les collections.

     BUG CORRIGÉ ICI : cet index ne lisait auparavant que le champ mécanique
     des générations. L'Audi R10 TDI était donc trouvée (« V12 5.5
     biturbodiesel ») mais pas le Q7 V12 TDI, décrit ailleurs. Une famille à
     un seul porteur n'étant pas affichée, la famille « V12 TDI » disparaissait
     entièrement. Deux niveaux de couverture différents pour deux
     fonctionnalités qui décrivent la même chose : c'est une incohérence
     interne, et elle produit des trous silencieux. Une seule source, partout. */
  function indexMoteurs() {
    if (_idxMoteurs) return _idxMoteurs;
    const idx = new Map();

    let ids = [];
    try { ids = (typeof CARS !== 'undefined' && Array.isArray(CARS)) ? CARS.map(c => c.id) : []; } catch (_) {}
    if (!ids.length) ids = Object.keys(GENS);
    ids = [...new Set([...ids, ...Object.keys(GENS)])];

    for (const id of ids) {
      const meca = mecaDe(id);
      if (!meca) continue;
      for (const f of MOTEURS) {
        if (!f.re.test(meca)) continue;
        /* Garde-fou : une même description d'architecture peut recouvrir des
           blocs sans rapport. « 5 en ligne 2.5 turbo » désigne aussi bien le
           2.5 TFSI Audi que le Td5 Land Rover ou le bloc Volvo. Quand le texte
           ne suffit pas à trancher, la famille déclare ses marques éligibles —
           et un lien douteux est écarté plutôt qu'affiché. */
        if (f.m && !f.m.includes(marqueDe(id))) continue;
        if (!idx.has(f.c)) idx.set(f.c, []);

        /* Quand les générations existent, on garde le détail des motorisations
           concernées ; sinon on enregistre le modèle une fois. */
        const detail = [];
        const g = GENS[id];
        if (g) for (const gen of g) {
          const det = gen && !Array.isArray(gen) && Array.isArray(gen.m);
          const lignes = det ? gen.m.map(m => ({ nom:m[0], meca:m[1], code:gen.c }))
                             : [{ nom:gen[0], meca:gen[2], code:gen[0] }];
          for (const l of lignes) if (l.meca && f.re.test(l.meca))
            detail.push({ id, gen:l.code, moto:l.nom, meca:l.meca });
        }
        if (detail.length) idx.get(f.c).push(...detail);
        else idx.get(f.c).push({ id, gen:null, moto:null, meca });
      }
    }
    return (_idxMoteurs = idx);
  }

  /** Marque d'une entrée du catalogue, chaîne vide si hors de portée. */
  function marqueDe(id) {
    try {
      if (typeof CARS !== 'undefined' && Array.isArray(CARS)) {
        const c = CARS.find(x => x.id === id);
        if (c) return c.brand;
      }
    } catch (_) {}
    return '';
  }

  /* Nom lisible d'une entrée du catalogue. */
  function nomCatalogue(id) {
    try {
      if (typeof CARS !== 'undefined' && Array.isArray(CARS)) {
        const c = CARS.find(x => x.id === id);
        if (c) return `${c.brand} ${c.model}`;
      }
    } catch (_) {}
    return id;
  }

  /* Familles présentes sur un modèle, avec leurs autres porteurs.
     Une famille sans autre porteur n'est pas retournée : sans lien, pas d'intérêt. */
  function famillesDe(idCatalogue) {
    const idx = indexMoteurs();
    const out = [];
    for (const f of MOTEURS) {
      const liste = idx.get(f.c);
      if (!liste || !liste.some(x => x.id === idCatalogue)) continue;
      const autres = [...new Set(liste.filter(x => x.id !== idCatalogue).map(x => x.id))];
      if (!autres.length) continue;
      out.push({ ...f, autres: autres.map(id => ({ id, nom: nomCatalogue(id) }))
                                     .sort((a, b) => a.nom.localeCompare(b.nom)) });
    }
    return out;
  }

  /* Rendu du bloc « le même moteur ailleurs ».
     Utilise <details> natif : aucun écouteur à câbler, donc rien à nettoyer
     quand la fiche est détruite — pas de fuite d'écouteurs possible. */
  function moteursHTML(idCatalogue) {
    const fam = famillesDe(idCatalogue);
    if (!fam.length) return '';
    const blocs = fam.map(f => `
      <details class="gmm">
        <summary><b>${esc(f.n)}</b><span>${f.autres.length} autre${f.autres.length > 1 ? 's' : ''}</span></summary>
        <p class="gmm-d">${esc(f.d)}</p>
        <div class="gmm-l">${f.autres.map(a =>
          `<button data-car="${esc(a.id)}">${esc(a.nom)}</button>`).join('')}</div>
      </details>`).join('');
    return `<div class="gsp gsp-mot">
      <div class="gsp-h"><span>Le même bloc ailleurs</span><em>${fam.length}</em></div>
      ${blocs}
    </div>`;
  }

  /* ======================================================================
     COMPLÉMENT D'ARCHITECTURE
     ----------------------------------------------------------------------
     Filet de sécurité pour les entrées qu'aucune autre source ne décrit :
     ni générations, ni fiche technique, ni champ `eng` dans INFO. Une seule
     chaîne par modèle, contenant strictement ce qui sert à le classer :
     architecture, suralimentation, position du bloc.

     Ce n'est pas une quatrième base de données. C'est un rattrapage ciblé,
     et il doit rester court : chaque ligne ajoutée ici signale un modèle qui
     mériterait plutôt une vraie entrée dans GENS.
     ====================================================================== */

  const ARCHI = {
    // --- Douze cylindres ---
    'ferrari-daytona-sp3':'V12 6.5 atmo moteur central',
    'ferrari-monza-sp':'V12 6.5 atmo moteur central',
    'ferrari-f12':'V12 6.3 atmo moteur avant',
    'ferrari-550':'V12 5.5 atmo moteur avant manuelle 6 à grille',
    'ferrari-daytona-365':'V12 4.4 atmo moteur avant',
    'ferrari-400':'V12 4.8 atmo moteur avant',
    'ferrari-512bb':'flat-12 5.0 atmo moteur central',
    'ferrari-ff':'V12 6.3 atmo intégrale',
    'ferrari-12cilindri':'V12 6.5 atmo moteur avant',
    'ferrari-f80':'V6 3.0 biturbo hybride moteur central monocoque carbone',
    'ferrari-purosangue':'V12 6.5 atmo intégrale',
    'lambo-diablo':'V12 5.7 atmo moteur central',
    'lambo-espada':'V12 4.0 atmo moteur avant',
    'lambo-sian':'V12 6.5 atmo hybride moteur central',
    'lambo-revuelto':'V12 6.5 atmo hybride rechargeable moteur central',
    'lambo-temerario':'V8 4.0 biturbo hybride moteur central',
    'lambo-jalpa':'V8 3.5 atmo moteur central',
    'lambo-lm002':'V12 5.2 atmo 4x4',
    'aston-one77':'V12 7.3 atmo moteur avant monocoque carbone',
    'aston-vanquish':'V12 5.9 atmo moteur avant transaxle',
    'aston-db12':'V8 4.0 biturbo moteur avant',
    'aston-dbs':'V12 5.2 biturbo moteur avant',
    'aston-db7':'6 en ligne 3.2 compressé puis V12 6.0 atmo',
    'aston-dbx':'V8 4.0 biturbo intégrale',
    'bmw-850csi':'V12 5.6 atmo moteur avant manuelle 6',
    'mercedes-600':'V8 6.3 atmo hydraulique',
    'mercedes-clk-gtr':'V12 6.9 atmo moteur central homologation',
    'toyota-century':'V12 5.0 atmo puis V8 hybride',
    'pagani-utopia':'V12 6.0 AMG biturbo moteur central manuelle 7 à grille',
    'bugatti-eb110':'V12 3.5 quadriturbo intégrale moteur central',
    'bugatti-divo':'W16 8.0 quadriturbo intégrale',
    'bugatti-bolide':'W16 8.0 quadriturbo monocoque carbone',
    'bugatti-tourbillon':'V16 8.3 atmo hybride moteur central',
    'maserati-mc12':'V12 6.0 atmo moteur central homologation',
    'maserati-bora':'V8 4.7 atmo moteur central',
    'maserati-merak':'V6 3.0 atmo moteur central',
    'maserati-quattroporte':'V6 et V8 biturbo propulsion',
    'rr-phantom':'V12 6.75 biturbo propulsion',
    'rr-ghost':'V12 6.6 biturbo intégrale',
    'rr-cullinan':'V12 6.75 biturbo intégrale',
    'rr-spectre':'deux moteurs électriques intégrale',
    'rr-silvershadow':'V8 6.75 atmo propulsion',
    'bentley-flying-spur':'W12 6.0 biturbo et V8 4.0 biturbo intégrale',
    'bentley-bentayga':'W12 6.0 biturbo puis V8 4.0 intégrale',
    'bentley-mulsanne':'V8 6.75 biturbo propulsion',
    'bentley-blower':'4 cyl. 4.4 à compresseur Roots propulsion',
    'jaguar-xj':'6 en ligne, V8 et V12 propulsion',
    'jaguar-dtype':'6 en ligne 3.4 atmo victoire au Mans',
    'lambo-countach':'V12 5.2 atmo moteur central',
    'iso-grifo':'V8 Chevrolet 5.4 atmo moteur avant',
    'jensen-interceptor':'V8 Chrysler 6.3 atmo propulsion',
    'bizzarrini-5300gt':'V8 Chevrolet 5.3 atmo moteur avant central',
    'detomaso-mangusta':'V8 Ford 4.7 atmo moteur central',
    'detomaso-p72':'V8 5.0 compressé moteur central manuelle 6 à grille',
    'facel-vega-hk500':'V8 Chrysler 6.3 atmo propulsion',
    'facel-vega-facel2':'V8 Chrysler 6.3 atmo propulsion',
    'delahaye-135':'6 en ligne 3.5 atmo propulsion',
    'duesenberg-model-j':'8 en ligne 6.9 atmo compressé propulsion',
    'cord-810':'V8 4.7 compressé traction phares escamotables',
    'tucker-48':'flat-6 5.5 atmo moteur arrière',
    'ligier-js2':'V6 Maserati 3.0 atmo moteur central',

    // --- Dix cylindres et V8 marquants ---
    'lexus-lfa':'V10 4.8 atmo moteur avant 9 000 tr/min',
    'porsche-carrera-gt':'V10 5.7 atmo moteur central manuelle 6',
    'dodge-viper':'V10 8.4 atmo moteur avant propulsion',
    'audi-r8':'V8 4.2 et V10 5.2 atmo moteur central',
    'mercedes-sls':'V8 6.2 atmo transaxle portes papillon',
    'mercedes-amg-gtbs':'V8 4.0 biturbo vilebrequin plat propulsion',
    'mercedes-slr':'V8 5.4 compressé moteur avant central',
    'mercedes-amg-one':'V6 1.6 turbo hybride issu de la Formule 1 moteur central',
    'ford-gt40':'V8 7.0 atmo moteur central victoire au Mans',
    'saleen-s7':'V8 7.0 biturbo moteur central',
    'panoz-esperante':'V8 4.6 atmo propulsion',
    'vector-w8':'V8 6.0 biturbo moteur central',
    'noble-m600':'V8 4.4 biturbo moteur central manuelle 6',
    'ultima-gtr':'V8 Chevrolet atmo moteur central',
    'scg-004':'V8 5.0 compressé moteur central trois places de front',
    'hennessey-venom-gt':'V8 7.0 biturbo moteur central record du monde',
    'hennessey-venom-f5':'V8 6.6 biturbo moteur central',
    'ssc-tuatara':'V8 5.9 biturbo moteur central',
    'czinger-21c':'V8 2.9 biturbo hybride moteur central',
    'gumpert-apollo':'V8 4.2 biturbo moteur central',
    'apollo-ie':'V12 6.3 atmo moteur central 9 000 tr/min',
    'wiesmann-gt':'V8 BMW 4.4 atmo propulsion',
    'spyker-c8':'V8 Audi 4.2 atmo moteur central boîte à grille',
    'gtaspano-spano':'V10 8.0 biturbo moteur central',
    'hispano-suiza-carmen':'quatre moteurs électriques monocoque carbone',
    'nio-ep9':'quatre moteurs électriques record du Nürburgring',
    'aspark-owl':'quatre moteurs électriques',
    'wmotors-lykan':'flat-6 3.7 biturbo RUF moteur central',
    'zenvo-tsrs':'V8 5.8 biturbo moteur central aileron actif',
    'koenigsegg-cc8s':'V8 4.7 compressé moteur central',
    'koenigsegg-one1':'V8 5.0 biturbo moteur central monocoque carbone',
    'koenigsegg-cc850':'V8 5.0 biturbo moteur central boîte manuelle 9',
    'koenigsegg-gemera':'trois moteurs électriques et 3 cyl. 2.0 biturbo',
    'pininfarina-battista':'quatre moteurs électriques intégrale',
    'lotus-evija':'quatre moteurs électriques monocoque carbone',
    'mclaren-w1':'V8 4.0 biturbo hybride moteur central',
    'mclaren-speedtail':'V8 3.8 biturbo hybride trois places de front',
    'mclaren-artura':'V6 3.0 biturbo hybride moteur central',
    'mclaren-gt':'V8 4.0 biturbo moteur central',
    'mclaren-12c':'V8 3.8 biturbo moteur central monocoque carbone',
    'mclaren-765lt':'V8 4.0 biturbo moteur central',
    'italdesign-zerouno':'V10 5.2 atmo moteur central',
    'dallara-stradale':'4 cyl. 2.3 turbo moteur central monocoque carbone',
    'mazzanti-evantra':'V8 biturbo moteur central',
    'praga-bohema':'V6 3.8 biturbo moteur central monocoque carbone',
    'donkervoort-d8':'5 en ligne 2.5 turbo Audi propulsion',
    'donkervoort-f22':'5 en ligne 2.5 turbo Audi propulsion',
    'ktm-xbow':'4 cyl. 2.0 TFSI moteur central monocoque carbone',
    'bac-mono':'4 cyl. 2.5 atmo moteur central une seule place',
    'ariel-atom':'4 cyl. Honda 2.0 atmo compressé moteur central',
    'radical-sr3':'4 cyl. d\'origine motocycliste moteur central',
    'morgan-3wheeler':'bicylindre en V apparent propulsion',
    'caterham-seven':'4 cyl. atmo et compressé propulsion',
    'tvr-sagaris':'6 en ligne 4.0 atmo maison propulsion',

    // --- Modèles courants qui manquaient d'architecture ---
    'renault-8-gordini':'4 cyl. 1.3 atmo moteur arrière propulsion',
    'renault-4':'4 cyl. atmo traction',
    'renault-avantime':'V6 3.0 atmo et 2.0 turbo traction',
    'renault-fuego':'4 cyl. 2.0 et 1.6 turbo traction',
    'renault-twizy':'moteur électrique propulsion',
    'citroen-mehari':'bicylindre à plat refroidi par air traction',
    'citroen-gs':'flat-4 refroidi par air traction hydropneumatique',
    'citroen-c6':'V6 2.7 et 3.0 HDi traction hydractive',
    'citroen-traction':'4 cyl. atmo traction avant monocoque',
    'citroen-type-h':'4 cyl. atmo traction',
    'peugeot-405-mi16':'4 cyl. 1.9 16v atmo traction',
    'peugeot-309-gti16':'4 cyl. 1.9 16v atmo traction',
    'peugeot-208-gti':'4 cyl. 1.6 THP turbo traction',
    'peugeot-rcz':'4 cyl. 1.6 THP turbo traction',
    'matra-bagheera':'4 cyl. atmo moteur central trois places de front',
    'matra-530':'V4 Ford atmo moteur central phares escamotables',
    'matra-rancho':'4 cyl. atmo traction',
    'talbot-samba':'4 cyl. atmo traction',
    'panhard-24':'bicylindre à plat refroidi par air traction',
    'trabant-601':'bicylindre 2 temps traction',
    'lada-2101':'4 cyl. atmo propulsion',
    'uaz-452':'4 cyl. atmo 4x4',
    'tata-nano':'bicylindre 624 cm³ moteur arrière',
    'hindustan-ambassador':'4 cyl. atmo propulsion',
    'vw-sp2':'flat-4 1.7 refroidi par air moteur arrière',
    'puma-gte':'flat-4 Volkswagen moteur arrière',
    'pegaso-z102':'V8 2.5 atmo à quatre arbres à cames propulsion',
    'tatra-t87':'V8 3.0 refroidi par air moteur arrière',
    'daf-33':'bicylindre atmo transmission à variation continue',
    'bmw-isetta':'monocylindre 250 cm³ atmo propulsion',
    'bmw-507':'V8 3.2 atmo propulsion',
    'bmw-z1':'6 en ligne 2.5 atmo propulsion',
    'bmw-30csl':'6 en ligne 3.0 atmo propulsion homologation Groupe 2',
    'porsche-550':'flat-4 1.5 atmo moteur central',
    'porsche-914':'flat-4 et flat-6 atmo moteur central',
    'porsche-924':'4 cyl. atmo et turbo transaxle',
    'porsche-944':'4 cyl. 2.5 et 3.0 atmo et turbo transaxle',
    'porsche-968':'4 cyl. 3.0 atmo transaxle',
    'porsche-928':'V8 4.5 à 5.4 atmo transaxle',
    'porsche-911-dakar':'flat-6 3.0 biturbo moteur arrière intégrale',
    'porsche-911-r':'flat-6 4.0 atmo moteur arrière manuelle 6',
    'opel-gt-classic':'4 cyl. 1.9 atmo propulsion phares escamotables',
    'opel-speedster':'4 cyl. 2.2 atmo moteur central',
    'fiat-x19':'4 cyl. 1.5 atmo moteur central phares escamotables',
    'fiat-barchetta':'4 cyl. 1.8 16v atmo traction',
    'autobianchi-a112':'4 cyl. 1.0 atmo traction',
    'lancia-fulvia':'V4 atmo traction',
    'lancia-aurelia':'V6 2.5 atmo transaxle',
    'lancia-flaminia':'V6 2.8 atmo propulsion',
    'lancia-beta-montecarlo':'4 cyl. 2.0 atmo moteur central',
    'lancia-thema-832':'V8 Ferrari 3.0 atmo traction',
    'alfa-montreal':'V8 2.6 atmo propulsion',
    'alfa-sz':'V6 Busso 3.0 atmo propulsion',
    'alfa-gtv6':'V6 Busso 2.5 atmo transaxle',
    'alfa-duetto':'4 cyl. atmo propulsion',
    'alfa-33-stradale-og':'V8 2.0 atmo moteur central',
    'alfa-8c':'V8 4.7 atmo transaxle',
    'toyota-2000gt':'6 en ligne 2.0 atmo propulsion phares escamotables',
    'toyota-sera':'4 cyl. 1.5 atmo portes papillon',
    'toyota-soarer':'6 en ligne turbo et V8 propulsion',
    'honda-beat':'3 cyl. 656 cm³ atmo moteur central kei',
    'honda-s660':'3 cyl. 658 cm³ turbo moteur central kei',
    'autozam-az1':'3 cyl. 657 cm³ turbo moteur central kei portes papillon',
    'suzuki-alto-works':'3 cyl. 657 cm³ turbo kei',
    'suzuki-cappuccino':'3 cyl. 657 cm³ turbo propulsion kei',
    'daihatsu-copen':'3 cyl. 659 cm³ turbo kei',
    'nissan-figaro':'4 cyl. 1.0 turbo traction',
    'nissan-pao':'4 cyl. 1.0 atmo traction',
    'nissan-hakosuka':'6 en ligne 2.0 atmo à quatre soupapes propulsion',
    'nissan-stagea-260rs':'6 en ligne 2.6 biturbo RB26 intégrale',
    'nissan-pulsar-gtir':'4 cyl. 2.0 turbo intégrale homologation',
    'mazda-cosmo':'birotor rotatif propulsion',
    'mazda-rx3':'birotor rotatif propulsion',
    'isuzu-117':'4 cyl. atmo propulsion',
    'isuzu-vehicross':'V6 3.5 atmo 4x4',
    'subaru-svx':'flat-6 3.3 atmo intégrale',
    'mitsubishi-galant-vr4':'4 cyl. 2.0 turbo intégrale quatre roues directrices',
    'lexus-ls400':'V8 4.0 atmo propulsion',
    'buick-gnx':'V6 3.8 turbo propulsion',
    'gmc-syclone':'V6 4.3 turbo intégrale',
    'pontiac-fiero':'V6 2.8 atmo moteur central',
    'plymouth-prowler':'V6 3.5 atmo propulsion',
    'chevrolet-corvette-c1':'V8 4.6 atmo propulsion',
    'chevrolet-c4-zr1':'V8 5.7 atmo à quatre arbres à cames Lotus propulsion',
    'shelby-daytona-coupe':'V8 4.7 atmo propulsion',
    'studebaker-avanti':'V8 4.7 compressé propulsion',
    'amc-javelin':'V8 6.4 atmo propulsion',
    'oldsmobile-442':'V8 6.6 atmo propulsion',
    'mercury-cougar-67':'V8 4.7 atmo propulsion phares escamotables',
    'volvo-p1800':'4 cyl. 1.8 atmo propulsion',
    'volvo-amazon':'4 cyl. atmo propulsion',
    'saab-93':'4 cyl. turbo traction',
    'polestar-1':'4 cyl. compressé et turbo hybride rechargeable monocoque carbone',
    'morgan-plusfour':'4 cyl. BMW 2.0 turbo propulsion châssis bois',
    'morgan-plus-8':'V8 Rover atmo propulsion châssis bois',
    'lotus-elan':'4 cyl. 1.6 atmo propulsion phares escamotables',
    'lotus-europa':'4 cyl. atmo moteur central',
    'lotus-emira':'V6 3.5 compressé et 4 cyl. 2.0 turbo moteur central',
    'jaguar-xk120':'6 en ligne 3.4 atmo propulsion',
    'jaguar-mk2':'6 en ligne atmo propulsion',
    'jaguar-xe-sv8':'V8 5.0 compressé propulsion record du Nürburgring',
    'mg-mgb':'4 cyl. 1.8 atmo propulsion',
    'mg-midget':'4 cyl. atmo propulsion',
    'mg-cyberster':'deux moteurs électriques portes en ciseaux',
    'triumph-spitfire':'4 cyl. atmo propulsion',
    'austin-healey-3000':'6 en ligne 2.9 atmo propulsion',
    'rover-75':'V6 2.5 atmo traction',
    'smart-roadster':'3 cyl. 0.7 turbo moteur central propulsion',
    'wiesmann-mf3':'6 en ligne BMW 3.2 atmo propulsion',
    'venturi-400gt':'V6 PRV 3.0 biturbo moteur central',
    'simca-aronde':'4 cyl. atmo propulsion',
    'renault-estafette':'4 cyl. atmo traction',
    'ligier-js50':'bicylindre diesel sans permis',
    'citroen-ami-2020':'moteur électrique sans permis',

    /* --- Codes moteurs manquants, repérés par moteursOrphelins() ---------
       Ces modèles étaient décrits par leur architecture mais pas par leur
       CODE de bloc. Résultat : ils n'entraient dans aucune famille et
       cassaient des liens pourtant réels — le S54 de la Z3 M et de la M3
       E46, le 4G63 partagé par la Galant VR-4 et la lignée Evo entière. */
    'bmw-z3':'6 en ligne S54 3.2 atmo propulsion',
    'bmw-m6':'V10 S85 5.0 atmo propulsion 8 250 tr/min',
    'bmw-m8':'V8 S63 4.4 biturbo intégrale',
    'bmw-x5m':'V8 S63 4.4 biturbo intégrale',
    'bmw-xm':'V8 S63 4.4 biturbo hybride rechargeable intégrale',
    'bmw-m135i':'6 en ligne N55 puis B58 3.0 turbo propulsion',
    'bmw-m235i':'6 en ligne N55 puis B58 3.0 turbo propulsion',
    'bmw-m340i':'6 en ligne B58 3.0 turbo hybridation légère',
    'bmw-335i':'6 en ligne N54 puis N55 3.0 turbo propulsion',
    'bmw-130i':'6 en ligne N52 3.0 atmo propulsion',
    'bmw-1m':'6 en ligne N54 3.0 biturbo propulsion',
    'bmw-m3-csl':'6 en ligne S54 3.2 atmo propulsion toit carbone',
    'bmw-z3m-coupe':'6 en ligne S54 3.2 atmo propulsion',
    'bmw-635csi':'6 en ligne M30 3.5 atmo propulsion',
    'mitsubishi-galant-vr4':'4 cyl. 2.0 turbo 4G63 intégrale quatre roues directrices',
    'mitsubishi-eclipse':'4 cyl. 2.0 turbo 4G63 traction et intégrale',
    'nissan-180sx':'4 cyl. 2.0 SR20DET turbo propulsion phares escamotables',
    'nissan-silvia-s13':'4 cyl. 1.8 CA18DET puis 2.0 SR20DET turbo propulsion',
    'nissan-silvia-s14':'4 cyl. 2.0 SR20DET turbo propulsion',
    'nissan-pulsar-gtir':'4 cyl. 2.0 SR20DET turbo intégrale homologation',
    'nissan-skyline-r33':'6 en ligne 2.6 RB26DETT biturbo intégrale',
    'jaguar-xk120':'6 en ligne XK 3.4 atmo propulsion',
    'jaguar-mk2':'6 en ligne XK 3.8 atmo propulsion',
    'jaguar-xk':'V8 AJ 4.0 à 5.0 atmo et compressé propulsion',
    'jaguar-ftype':'V6 3.0 compressé et V8 5.0 compressé propulsion',
    'lotus-evora':'V6 Toyota 2GR 3.5 compressé moteur central',
    'lotus-emira':'V6 Toyota 2GR 3.5 compressé et 4 cyl. 2.0 turbo moteur central',
    'lotus-exige':'4 cyl. Toyota 2ZZ compressé puis V6 2GR 3.5 compressé moteur central',
    'honda-nsx-nc1':'V6 3.5 biturbo hybride moteur central intégrale',
    'honda-integra-dc5':'4 cyl. K20A 2.0 VTEC atmo traction',
    'honda-city-turbo2':'4 cyl. 1.2 turbo traction',
    'honda-prelude':'4 cyl. H22A 2.2 VTEC atmo traction quatre roues directrices',
    'toyota-gr-supra':'6 en ligne B58 3.0 turbo BMW propulsion',
    'toyota-celica-gt4':'4 cyl. 3S-GTE 2.0 turbo intégrale homologation',
    'toyota-celica-gt-four':'4 cyl. 3S-GTE 2.0 turbo intégrale homologation',
    'toyota-gr-corolla':'3 cyl. G16E 1.6 turbo intégrale',
    'toyota-chaser':'6 en ligne 1JZ-GTE 2.5 turbo propulsion',
    'toyota-soarer':'6 en ligne 1JZ et 2JZ turbo et V8 propulsion',
    'lexus-is':'6 en ligne 2JZ-GE 3.0 atmo et V6 propulsion',
    'subaru-impreza-gc8':'flat-4 EJ20 2.0 turbo intégrale',
    'subaru-impreza-blob':'flat-4 EJ20 et EJ25 turbo intégrale',
    'subaru-legacy':'flat-4 EJ20 et EJ25 turbo intégrale',
    'subaru-forester':'flat-4 EJ20 et EJ25 turbo intégrale',
    'mazda-rx7-fb':'birotor rotatif 12A propulsion phares escamotables',
    'ford-escort-cosworth':'4 cyl. YBT 2.0 turbo Cosworth intégrale',
    'ford-sierra-cosworth':'4 cyl. YBB 2.0 turbo Cosworth propulsion',
    'ford-capri':'V6 Cologne 2.8 atmo propulsion',
    'ford-taurus-sho':'V6 Yamaha 3.0 atmo traction',
    'ford-focus-rs':'4 cyl. 2.3 EcoBoost turbo intégrale',
    'ford-mustang-gt':'V8 Coyote 5.0 atmo propulsion',
    'ford-shelby-gt500':'V8 5.2 compressé propulsion vilebrequin plat',
    'chevrolet-corvette-c5':'V8 LS1 5.7 atmo transaxle',
    'chevrolet-corvette-c6':'V8 LS2 LS3 et LS7 atmo transaxle',
    'chevrolet-corvette-c7':'V8 LT1 6.2 atmo transaxle',
    'chevrolet-corvette-z06':'V8 LS7 puis LT4 et LT6 propulsion',
    'chevrolet-camaro':'V8 LS1 LS3 et LT4 atmo et compressé propulsion',
    'pontiac-firebird':'V8 LS1 5.7 atmo propulsion',
    'cadillac-cts-v':'V8 LSA et LT4 6.2 compressé propulsion',
    'cadillac-ct5v-bw':'V8 LT4 6.2 compressé propulsion',
    'holden-commodore':'V8 LS1 et LS3 atmo propulsion',
    'holden-monaro':'V8 LS1 5.7 atmo propulsion',
    'dodge-challenger':'V8 HEMI 5.7 6.2 et 6.4 atmo et compressé propulsion',
    'dodge-hellcat':'V8 HEMI 6.2 compressé propulsion',
    'dodge-charger-moderne':'V8 HEMI 5.7 et 6.4 propulsion',
    'dodge-demon':'V8 HEMI 6.2 compressé propulsion',
    'dodge-durango-srt':'V8 HEMI 6.2 compressé intégrale',
    'jeep-trackhawk':'V8 HEMI 6.2 compressé intégrale',
    'ram-trx':'V8 HEMI 6.2 compressé 4x4',
    'ram-1500':'V8 HEMI 5.7 atmo 4x4',
    'chrysler-300c':'V8 HEMI 5.7 et 6.1 propulsion',
    'plymouth-superbird':'V8 HEMI 7.0 atmo propulsion aileron',
    'plymouth-road-runner':'V8 HEMI 7.0 atmo propulsion',
    'dodge-charger-daytona-69':'V8 HEMI 7.0 atmo propulsion aileron',
    'plymouth-barracuda':'V8 HEMI 7.0 atmo propulsion',
    'citroen-sm':'V6 Maserati 2.7 atmo traction hydropneumatique',
    'audi-s3':'4 cyl. 1.8T 20v puis 2.0 TFSI quattro',
    'audi-s4':'V6 2.7 biturbo, V8 4.2 atmo puis V6 3.0 TFSI quattro',
    'audi-s5':'V8 4.2 FSI atmo puis V6 3.0 TFSI quattro',
    'audi-s6':'V8 4.2 atmo, V10 5.2 atmo puis V8 4.0 TFSI quattro',
    'audi-s8':'V8 4.2 atmo, V10 5.2 atmo puis V8 4.0 TFSI quattro',
    'audi-rs7':'V8 4.0 TFSI biturbo quattro',
    'audi-rs5':'V8 4.2 FSI atmo puis V6 2.9 biturbo quattro',
    'audi-rsq3':'5 en ligne 2.5 TFSI turbo quattro',
    'audi-rsq8':'V8 4.0 TFSI biturbo quattro',
    'audi-a5':'4 cyl. 2.0 TFSI et V6 quattro',
    'audi-sq5':'V6 3.0 TFSI et TDI quattro',
    'skoda-octavia-rs':'4 cyl. 1.8T 20v puis 2.0 TFSI traction',
    'seat-leon':'4 cyl. 1.8T 20v puis 2.0 TFSI traction',
    'vw-golf-r32':'VR6 3.2 atmo 4Motion',
    'vw-golf-gtd':'4 cyl. 2.0 TDI traction',
    'vw-golf-g60':'4 cyl. 1.8 G60 à compresseur',
    'vw-lupo-gti':'4 cyl. 1.6 16v atmo traction',
    'vw-polo-gti':'4 cyl. 1.8T puis 2.0 TFSI traction',
    'vw-up-gti':'3 cyl. 1.0 TSI turbo traction',
    'porsche-911-gt3rs':'flat-6 4.0 atmo Mezger puis MDG moteur arrière',
    'porsche-911-gt2rs':'flat-6 3.6 et 3.8 biturbo Mezger moteur arrière',
    'porsche-911-turbo':'flat-6 3.3 à 3.8 biturbo Mezger moteur arrière',
    'porsche-911-gt1':'flat-6 3.2 biturbo Mezger moteur central',
    'porsche-956-962':'flat-6 2.65 biturbo moteur central',
    'ruf-ctr':'flat-6 3.4 biturbo moteur arrière',
    'techart-gtstreet-r':'flat-6 3.8 biturbo intégrale',
    'gemballa-mirage-gt':'V10 5.7 atmo moteur central',
    '9ff-gt9':'flat-6 4.0 biturbo moteur central',
    'singer-911':'flat-6 4.0 atmo moteur arrière',
    'rwb-911':'flat-6 atmo et turbo moteur arrière',
  };

  /* ======================================================================
     COLLECTIONS MÉCANIQUES
     ----------------------------------------------------------------------
     Ton catalogue classe les voitures par marque, pays et rareté. Ce sont
     des critères administratifs. Un passionné, lui, range autrement : par
     architecture moteur, par régime, par position du bloc, par doctrine.
     « Les rotatifs », « le mur des 9 000 tr/min », « le club Mezger » — ce
     sont les vraies familles, celles qu'on a en tête.

     Ces collections ne stockent AUCUNE donnée nouvelle : ce sont des
     requêtes sur les 1 065 motorisations déjà écrites. Ajouter une
     collection coûte trois lignes et zéro octet de données.

     LECTURE DU GARAGE — point d'architecture important :
     `state.spots` est privé dans la fonction anonyme d'index.html, donc
     inaccessible. Mais la base IndexedDB, elle, est ouvrable par n'importe
     quel script de la page. On l'ouvre en LECTURE SEULE, sans jamais
     déclarer de version : impossible de déclencher un `onupgradeneeded`,
     donc impossible d'altérer le schéma. Le module observe, il ne touche à
     rien.
     ====================================================================== */

  /* --- Lecture non intrusive du garage --------------------------------- */
  let _captures = null, _capturesLe = 0;

  function lireGarage() {
    // Cache court : le rendu peut être déclenché plusieurs fois par seconde.
    if (_captures && Date.now() - _capturesLe < 3000) return Promise.resolve(_captures);
    return new Promise((res) => {
      let fini = false;
      const rendre = (v) => { if (fini) return; fini = true; _captures = v; _capturesLe = Date.now(); res(v); };
      setTimeout(() => rendre(_captures || new Set()), 1500);   // ne bloque jamais le rendu
      try {
        // Aucune version demandée : on ouvre l'existante, jamais on ne la migre.
        const rq = indexedDB.open('garage-manifest');
        rq.onerror = () => rendre(new Set());
        rq.onsuccess = () => {
          const db = rq.result;
          if (!db.objectStoreNames.contains('spots')) return rendre(new Set());
          try {
            const st = db.transaction('spots', 'readonly').objectStore('spots');
            const all = st.getAllKeys();
            all.onsuccess = () => rendre(new Set(all.result.filter(k => typeof k === 'string' && !k.startsWith('__'))));
            all.onerror = () => rendre(new Set());
          } catch (_) { rendre(new Set()); }
        };
      } catch (_) { rendre(new Set()); }
    });
  }

  /* --- Prédicats réutilisables ----------------------------------------- */

  /** Toutes les descriptions mécaniques d'un modèle, concaténées. */
  /* DEUX NIVEAUX DE LECTURE, ET LA DISTINCTION EST CAPITALE :

     mecaDe()  — la mécanique STRICTE. Champs techniques uniquement.
     texteDe() — tout, notes et anecdotes comprises.

     Pourquoi : la note de la M3 E92 dit « V8 dérivé du V10 de la M5 E60 », et
     celle de la XJ220 dit « annoncée en V12, produite en V6 biturbo ». Lire
     les notes pour classer une architecture range donc la M3 chez les V10 et
     la XJ220 chez les V12 — deux erreurs factuelles produites par du texte
     parfaitement exact. Les collections d'architecture lisent mecaDe ; celles
     de palmarès, qui vivent précisément dans les notes, lisent texteDe. */

  const _mecaCache = new Map(), _texteCache = new Map();

  function mecaDe(id) {
    if (_mecaCache.has(id)) return _mecaCache.get(id);
    let txt = '';

    // 1. Champs mécaniques et transmission des motorisations — jamais les notes
    const g = GENS[id];
    if (g) for (const gen of g) {
      if (gen && !Array.isArray(gen) && Array.isArray(gen.m))
        txt += ' ' + gen.m.map(x => `${x[1] || ''} ${x[3] || ''}`).join(' ');
      else txt += ' ' + [gen[2], gen[0]].filter(Boolean).join(' ');
    }

    // 2. Champs techniques de la fiche détaillée — note et son exclus
    const cle = MAP[id];
    if (cle && SPECS[cle]) {
      const f = SPECS[cle];
      txt += ' ' + [f.arch, f.adm, f.pos, f.tx, f.bv].filter(Boolean).join(' ');
    }

    /* 3. L'objet INFO d'index.html.
       Point capital pour la couverture : GENS ne couvre que 360 entrées sur
       927. INFO, lui, renseigne le champ `eng` sur plusieurs centaines de
       modèles supplémentaires — c'est une source déjà écrite, déjà relue, et
       déclarée en const à la racine donc lisible d'ici. L'ignorer revenait à
       rendre les deux tiers du catalogue invisibles aux collections. */
    try {
      if (typeof INFO !== 'undefined' && INFO && INFO[id] && INFO[id].eng)
        txt += ' ' + INFO[id].eng;
    } catch (_) {}

    // 4. Complément d'architecture pour ce qu'aucune des trois sources ne couvre
    if (ARCHI[id]) txt += ' ' + ARCHI[id];

    _mecaCache.set(id, txt);
    return txt;
  }

  /** Tout le texte disponible : mécanique + notes, anecdotes et palmarès. */
  function texteDe(id) {
    if (_texteCache.has(id)) return _texteCache.get(id);
    let txt = mecaDe(id);

    const g = GENS[id];
    if (g) for (const gen of g) {
      if (gen && !Array.isArray(gen) && Array.isArray(gen.m))
        txt += ' ' + gen.c + ' ' + gen.a + ' ' + gen.m.map(x => `${x[0] || ''} ${x[2] || ''} ${x[4] || ''}`).join(' ');
      else txt += ' ' + gen.join(' ');
    }
    const cle = MAP[id];
    if (cle && SPECS[cle]) {
      const f = SPECS[cle];
      txt += ' ' + [f.son, f.note, f.rupteur, f.surnom].filter(Boolean).join(' ');
    }
    try {
      if (typeof INFO !== 'undefined' && INFO && INFO[id]) {
        const i = INFO[id];
        txt += ' ' + [i.fact, i.hp, i.acc, i.vmax].filter(Boolean).join(' ');
      }
      if (typeof CARS !== 'undefined' && Array.isArray(CARS)) {
        const c = CARS.find(x => x.id === id);
        if (c) txt += ' ' + [c.yr, c.cat].filter(Boolean).join(' ');
      }
    } catch (_) {}

    _texteCache.set(id, txt);
    return txt;
  }

  const aMotif   = (id, re) => re.test(mecaDe(id));    // architecture : mécanique stricte
  const aTexte   = (id, re) => re.test(texteDe(id));   // palmarès et anecdotes

  /** Vrai si une GÉNÉRATION débutant après `anneeMin` porte le motif.
      Sans cette granularité, « manuelle 6 » sur une E30 de 1986 et « 2021 »
      lu dans la note d'une autre génération suffisaient à valider le critère :
      le prédicat devenait faux tout en restant syntaxiquement correct. */
  function genDepuis(id, re, anneeMin) {
    const g = GENS[id]; if (!g) return false;
    for (const gen of g) {
      const detaille = gen && !Array.isArray(gen) && Array.isArray(gen.m);
      const an = detaille ? gen.a : gen[1];
      const debut = parseInt(String(an).match(/\d{4}/) || 0, 10);
      if (!debut || debut < anneeMin) continue;
      const txt = detaille ? gen.m.map(x => x.join(' ')).join(' ') : gen.join(' ');
      if (re.test(txt)) return true;
    }
    return false;
  }
  const aFamille = (id, cle) => (indexMoteurs().get(cle) || []).some(x => x.id === id);
  const specDe   = id => (MAP[id] && SPECS[MAP[id]]) || null;

  /** Puissance maximale connue d'un modèle, tous niveaux confondus. */
  function chMax(id) {
    let max = 0;
    const f = specDe(id);
    if (f && f.ch) max = f.ch;
    try {
      if (typeof INFO !== 'undefined' && INFO && INFO[id] && INFO[id].hp) {
        const nums = String(INFO[id].hp).replace(/\s/g, '').match(/\d{2,5}/g) || [];
        for (const n of nums) max = Math.max(max, +n);
      }
    } catch (_) {}
    const g = GENS[id] || [];
    for (const gen of g) {
      const lignes = (gen && !Array.isArray(gen) && Array.isArray(gen.m)) ? gen.m.map(x => x[2]) : [gen[3]];
      for (const l of lignes) {
        const nums = String(l || '').replace(/\s/g, '').match(/\d{2,5}/g) || [];
        for (const n of nums) max = Math.max(max, +n);
      }
    }
    return max;
  }

  /** Régime maximal annoncé (rupteur ou mention explicite dans le texte). */
  function regimeMax(id) {
    const f = specDe(id);
    let max = f && f.rupteur ? f.rupteur : 0;
    const m = mecaDe(id).replace(/\s/g, '').match(/(\d{4,5})tr\/min/g) || [];
    for (const x of m) max = Math.max(max, +x.replace(/\D/g, ''));
    return max;
  }

  /* --- Définition des collections --------------------------------------
     Une collection = un nom, une icône, une phrase, un prédicat.
     Rien d'autre. Ajouter une famille se fait en trois lignes.
     ------------------------------------------------------------------- */

  const COLLECS = [
    { id:'mezger', ic:'⚙️', n:'Le club Mezger',
      d:'Le flat-six à vilebrequin de 962 du Mans. De la 996 GT3 à la GT2 RS, le bloc que les porschistes vénèrent.',
      t:id => aFamille(id, 'mezger') },

    { id:'prv', ic:'🤝', n:'La tournée du PRV',
      d:'Peugeot-Renault-Volvo. Un même V6 chez Citroën, DeLorean, Alpine, Venturi et Lancia — cinq marques, aucune parenté commerciale.',
      t:id => aFamille(id, 'prv') },

    { id:'busso', ic:'🎼', n:'La chorale Busso',
      d:'Vingt-huit ans de V6 Alfa Romeo. Souvent cité comme le six cylindres le plus mélodieux jamais produit.',
      t:id => aFamille(id, 'busso') },

    { id:'rotary', ic:'🌀', n:'Rotary Club',
      d:'Le moteur Wankel. Pas de pistons, pas de soupapes, un son que rien d\'autre ne produit.',
      t:id => aMotif(id, /rotatif|birotor|rotor|Wankel|13B|R26B/i) },

    { id:'cinq', ic:'🎺', n:'Cinq en ligne',
      d:'L\'architecture bâtarde entre le quatre et le six. Ordre d\'allumage décalé, timbre reconnaissable entre mille.',
      t:id => aMotif(id, /5 en ligne|cinq[- ]cylindres|5 cyl\./i) },

    { id:'douze', ic:'👑', n:'Douze cylindres',
      d:'V12, W12, flat-12. Le luxe d\'une combustion que rien ne justifie sinon le plaisir.',
      t:id => aMotif(id, /V12|W12|flat-12|12 cyl|W16/i) },

    { id:'dix', ic:'🔟', n:'Le clan des V10',
      d:'Une architecture rare, née de la Formule 1 et disparue avec elle.',
      t:id => aMotif(id, /V10/i) },

    { id:'neufmille', ic:'📈', n:'Le mur des 9 000',
      d:'Neuf mille tours par minute ou plus. Une frontière que très peu de moteurs de route ont franchie.',
      t:id => regimeMax(id) >= 8800 },

    { id:'atmo', ic:'🌬️', n:'Dernier souffle',
      d:'Plus de 400 ch sans la moindre suralimentation. Une espèce en voie d\'extinction réglementaire.',
      t:id => chMax(id) >= 400 && aMotif(id, /atmo/i) && !aMotif(id, /biturbo|quadriturbo/i) },

    { id:'central', ic:'🎯', n:'Le moteur au centre',
      d:'Bloc entre le conducteur et l\'essieu arrière. L\'architecture de la voiture de course, transposée à la route.',
      t:id => aMotif(id, /moteur central|position centrale|central arrière/i) },

    { id:'arriere', ic:'🐸', n:'Tout à l\'arrière',
      d:'Moteur en porte-à-faux derrière l\'essieu. Contre toute logique dynamique — et pourtant.',
      t:id => aMotif(id, /moteur arrière|position arrière|moteur en porte-à-faux/i) },

    { id:'compresseur', ic:'🌪️', n:'L\'ère du compresseur',
      d:'Suralimentation mécanique. Aucune inertie, un sifflement continu, et une consommation assumée.',
      t:id => aMotif(id, /compresseur|compressé|compressée|G-Lader|Kompressor/i) },

    { id:'groupeb', ic:'🔥', n:'Groupe B',
      d:'1982-1986. Quatre saisons, aucune limite technique, et une interdiction dans le sang.',
      t:id => aTexte(id, /Groupe B/i) },

    { id:'homolog', ic:'📜', n:'Nées pour homologuer',
      d:'Construites uniquement pour obtenir le droit de courir. Séries courtes, équipement absent, cotes déraisonnables.',
      t:id => aTexte(id, /homologation|d'homologation|homologuer/i) },

    { id:'mille', ic:'⚡', n:'Le club des mille',
      d:'Mille chevaux ou plus. La barre que seule une poignée de constructeurs a franchie.',
      t:id => chMax(id) >= 1000 },

    { id:'rarissime', ic:'💎', n:'Moins de cinq cents',
      d:'Production totale sous les cinq cents exemplaires. En croiser une relève du hasard pur.',
      t:id => { const f = specDe(id); return f && f.prod != null && f.prod <= 500; } },

    { id:'manuelle', ic:'🕹️', n:'Résistance manuelle',
      d:'Trois pédales et un levier, sur des voitures postérieures à 2015. Un choix militant.',
      t:id => genDepuis(id, /manuelle [67]/i, 2015) },

    { id:'vilebrequinplat', ic:'🎻', n:'Vilebrequin plat',
      d:'Manetons à 180°. Un V8 qui hurle comme un V8 de course au lieu de gronder.',
      t:id => aMotif(id, /vilebrequin plat/i) },

    { id:'quadri', ic:'🌀', n:'Quatre turbos',
      d:'Quadriturbo. Une réponse d\'ingénieur à une question que personne n\'avait posée.',
      t:id => aMotif(id, /quadriturbo|quatre turbos/i) },

    { id:'diesel', ic:'🛢️', n:'Le diesel qui gagne',
      d:'Le gazole en compétition. Audi puis Peugeot ont gagné Le Mans avec, avant que le règlement ne referme la porte.',
      t:id => aMotif(id, /diesel/i) && aMotif(id, /Mans|championnat|victoire|course/i) },

    { id:'hybride', ic:'🔋', n:'Hybrides de pointe',
      d:'L\'électricité au service de la performance, pas de la sobriété.',
      t:id => aMotif(id, /hybride/i) && chMax(id) >= 600 },

    { id:'lemans', ic:'🏁', n:'Vainqueurs du Mans',
      d:'Elles ont gagné les 24 Heures. Toutes catégories, toutes époques.',
      t:id => aTexte(id, /Victoire[s]? au (général au )?Mans|au Mans \d{4}|Victoire au Mans/i) },

    { id:'nurburgring', ic:'⏱️', n:'Le chrono de la Nordschleife',
      d:'Elles ont détenu un record au Nürburgring, dans leur catégorie ou toutes catégories confondues.',
      t:id => aTexte(id, /Nürburgring/i) },

    { id:'grille', ic:'🎰', n:'La boîte à grille',
      d:'Levier métallique dans une grille ouverte. Le geste le plus copié et le moins remplacé de l\'automobile.',
      t:id => aTexte(id, /à grille/i) },

    { id:'escamotables', ic:'👁️', n:'Phares escamotables',
      d:'Interdits de fait depuis les normes piétons de 2004. Une esthétique entière disparue par décret.',
      t:id => aTexte(id, /escamotables/i) },

    { id:'kei', ic:'🍙', n:'Kei cars',
      d:'Bridées à 64 ch et 660 cm³ par la loi japonaise. La contrainte comme moteur de créativité.',
      t:id => aTexte(id, /kei|657 cm³|656 cm³|658 cm³|660 cm³/i) },

    { id:'f1route', ic:'🏎️', n:'Un moteur de F1 sur la route',
      d:'Blocs directement dérivés de la Formule 1, homologués pour un usage routier.',
      t:id => aTexte(id, /issu de la F1|dérivé de la F1|de Formule 1|programme Formule 1|V10 de Formule 1|moteur de Formule 1/i) },

    { id:'pikespeak', ic:'⛰️', n:'Pikes Peak',
      d:'La course de côte du Colorado. Vingt kilomètres, cent cinquante-six virages, quatre mille mètres d\'altitude.',
      t:id => aTexte(id, /Pikes Peak/i) },

    { id:'annee', ic:'🥇', n:'Voiture de l\'Année',
      d:'Élues par le jury européen. Le titre le plus convoité — et parfois le plus discuté.',
      t:id => aTexte(id, /Voiture de l'Année/i) },

    { id:'aeroactive', ic:'🪁', n:'Aérodynamique active',
      d:'Ailerons, volets et conduits qui bougent en roulant. La voiture change de forme selon ce qu\'on lui demande.',
      t:id => aTexte(id, /aéro active|aérodynamique active|volets aérodynamiques|aileron actif|aileron mobile|ALA|prises d'air latérales mobiles/i) },

    { id:'record', ic:'🚀', n:'Record du monde de vitesse',
      d:'Elles ont détenu, à un moment, le titre de voiture de série la plus rapide du monde.',
      t:id => aTexte(id, /record du monde|la plus rapide du monde|voiture de série la plus rapide/i) },

    { id:'carbone', ic:'🕸️', n:'Monocoque carbone',
      d:'Châssis en fibre de carbone. Né en Formule 1 en 1981, descendu sur route avec la McLaren F1.',
      t:id => aTexte(id, /monocoque carbone|châssis carbone|coque en fibre de carbone|Monocage|monocoque en fibre/i) },

    { id:'tonne', ic:'🪶', n:'Sous la tonne',
      d:'Moins de mille kilos. La légèreté comme doctrine, pas comme argument marketing.',
      t:id => { const f = specDe(id); return f && f.kg && f.kg < 1000; } },

    { id:'sequentiel', ic:'🔀', n:'Turbos séquentiels',
      d:'Deux turbos qui se relaient : le petit à bas régime, le gros ensuite. Une complication au service de la linéarité.',
      t:id => aMotif(id, /séquentiel/i) && aMotif(id, /turbo/i) },

    { id:'orphelines', ic:'🕯️', n:'Les orphelines',
      d:'Marques mortes, absorbées ou disparues du marché. Chaque exemplaire croisé est un survivant.',
      t:id => ['Saab','Rover','Pontiac','Oldsmobile','Plymouth','Hummer','Daewoo','Talbot','Simca',
               'Panhard','Facel Vega','Matra','Venturi','De Tomaso','TVR','Lancia','Autobianchi',
               'Mercury','AMC','Studebaker','Tucker','Cord','Duesenberg','Holden','Trabant',
               'DeLorean','Jensen','Vector','Wiesmann','Gumpert','Spyker','Bizzarrini','Iso',
               'Datsun','Scion','Isuzu','Daihatsu','Tatra','Lada','Hindustan','Puma','Pegaso']
              .includes(marqueDe(id)) },

    { id:'air', ic:'💨', n:'Refroidis par air',
      d:'Pas de radiateur, pas de liquide. Une doctrine mécanique entière, éteinte par les normes de bruit et d\'émissions.',
      t:id => aMotif(id, /refroidi par air|refroidie par air|refroidissement par air/i) },

    { id:'papillon', ic:'🦋', n:'Portes papillon et ciseaux',
      d:'Elles s\'ouvrent vers le haut. Argument technique parfois, argument théâtral toujours.',
      t:id => aTexte(id, /portes? papillon|portes? en ciseaux|portes? en dièdre|papillon/i) },

    { id:'troisplaces', ic:'🪑', n:'Trois places de front',
      d:'Conducteur au centre. La McLaren F1 l\'a rendu célèbre, mais Matra l\'avait fait vingt ans plus tôt.',
      t:id => aTexte(id, /trois places de front|3 places de front|poste de conduite central|conducteur au centre/i) },

    { id:'quatredirect', ic:'↔️', n:'Quatre roues directrices',
      d:'Les roues arrière braquent aussi. Inventé au Japon dans les années 80, redevenu courant quarante ans plus tard.',
      t:id => aTexte(id, /quatre roues directrices|roues arrière directrices|4WS|4Control|Super HICAS/i) },

    { id:'ferrarihors', ic:'🐎', n:'Un moteur Ferrari, pas une Ferrari',
      d:'Maranello a fourni des blocs à d\'autres marques. Une berline Lancia à V8 de 308, une Maserati à V12 d\'Enzo.',
      t:id => marqueDe(id) !== 'Ferrari' && aTexte(id, /V8 Ferrari|V12 6\.0 \(base Enzo\)|bloc Ferrari|V12 Ferrari|moteur assemblé à Maranello|d'inspiration Ferrari/i) },

    { id:'concepts', ic:'🧪', n:'Restées à l\'état de concept',
      d:'Construites, roulantes, présentées — et jamais commercialisées. Ce qui aurait pu exister.',
      /* « concept » sans limites de mot capture « CONCEPTion », et
         « un seul exemplaire » capture la Cerbera Speed 12 alors que
         l'entrée du catalogue désigne la Cerbera de série, bel et bien
         produite. Motifs resserrés : un mot entier, ou une formule sans
         ambiguïté. */
      t:id => aTexte(id, /\bconcepts?\b|prototype unique|jamais commercialis/i) },

    { id:'proto', ic:'🔬', n:'Restées à l\'état de prototype',
      d:'Présentées, roulantes, applaudies — et jamais commercialisées. Un ou deux exemplaires existent, et ils sont dans un musée.',
      /* Premier essai fondé sur les mots « concept » et « prototype » : il
         attrapait la M5 (« programme F1 »), la Corvette C8 et la 911, dont les
         notes emploient ces termes à propos d'autre chose. On s'appuie donc
         d'abord sur un FAIT — le volume de production — et seulement ensuite
         sur des formulations sans ambiguïté possible. */
      t:id => {
        const f = specDe(id);
        if (f && f.prod != null && f.prod <= 3) return true;
        return /\(concept\)|resté[e]?s? à l'état de prototype|jamais (été )?commercialisé|n'a jamais été vendu|un seul exemplaire (roulant|route|construit)|Un seul exemplaire/i.test(texteDe(id));
      } },

    { id:'transaxle', ic:'⚖️', n:'Transaxle',
      d:'Boîte accolée au pont arrière. Une complication mécanique au seul service de la répartition des masses.',
      t:id => aMotif(id, /transaxle/i) },
  ];


  /* --- Calcul et rendu des collections ---------------------------------- */

  let _collecsCache = null;
  function calculerCollecs() {
    if (_collecsCache) return _collecsCache;
    /* Dédoublonnage défensif : si un identifiant apparaît deux fois dans CARS
       — ce qui arrive vite quand on colle un bloc d'ajouts deux fois — chaque
       collection l'afficherait en double sans que rien ne signale l'erreur. */
    let ids = [];
    try { ids = (typeof CARS !== 'undefined' && Array.isArray(CARS)) ? CARS.map(c => c.id) : []; } catch (_) {}
    if (!ids.length) ids = Object.keys(GENS);
    ids = [...new Set(ids)];
    const out = [];
    for (const c of COLLECS) {
      const membres = [];
      for (const id of ids) { try { if (c.t(id)) membres.push(id); } catch (_) {} }
      if (membres.length >= 2) out.push({ ...c, membres });
    }
    return (_collecsCache = out.sort((a, b) => b.membres.length - a.membres.length));
  }

  function carteCollec(c, possedes) {
    const eus = c.membres.filter(id => possedes.has(id));
    const pct = Math.round(eus.length / c.membres.length * 100);
    const complet = eus.length === c.membres.length;
    /* data-car est lu par la délégation d'événements d'index.html : ces puces
       ouvrent donc la fiche du modèle sans qu'aucun écouteur soit ajouté ici.
       On se branche sur le mécanisme existant plutôt que d'en créer un second. */
    const puces = c.membres
      .sort((a, b) => (possedes.has(b) - possedes.has(a)) || nomCatalogue(a).localeCompare(nomCatalogue(b)))
      .map(id => `<button class="gcl-p${possedes.has(id) ? ' on' : ''}" data-car="${esc(id)}">${esc(nomCatalogue(id))}</button>`)
      .join('');
    return `<details class="gcl${complet ? ' fait' : ''}">
      <summary>
        <span class="gcl-ic">${c.ic}</span>
        <span class="gcl-t"><b>${esc(c.n)}</b><i>${eus.length} / ${c.membres.length}</i></span>
        <span class="gcl-j"><i style="width:${pct}%"></i></span>
      </summary>
      <p class="gcl-d">${esc(c.d)}</p>
      <div class="gcl-l">${puces}</div>
    </details>`;
  }

  function collecsHTML(possedes) {
    const l = calculerCollecs();
    const totalM = l.reduce((n, c) => n + c.membres.length, 0);
    const acquis = l.reduce((n, c) => n + c.membres.filter(id => possedes.has(id)).length, 0);
    const finies = l.filter(c => c.membres.every(id => possedes.has(id))).length;
    return `<div class="section panel gcl-wrap">
      <div class="gcl-head">
        <div class="h2">Collections mécaniques</div>
        <span>${finies}/${l.length} bouclées · ${acquis}/${totalM} pièces</span>
      </div>
      <p class="gcl-intro">Ton catalogue range par marque et par pays. Un passionné range par architecture. Voici l'autre classement.</p>
      ${l.map(c => carteCollec(c, possedes)).join('')}
    </div>`;
  }

  /* --- Greffe dans l'onglet Défis --------------------------------------
     L'app reconstruit #view entièrement à chaque render(). On réinjecte
     donc à chaque mutation, en vérifiant l'absence préalable — idempotent
     par construction, aucun risque de doublon ni de fuite.
     ------------------------------------------------------------------- */
  /* VERROU OBLIGATOIRE : la greffe modifie #view, ce qui redéclenche
     l'observateur qui l'a appelée. Sans ce drapeau, on obtient une boucle de
     mutation infinie qui gèle l'onglet — bug trouvé au banc d'essai, pas à la
     relecture. Toute écriture dans un nœud observé doit être verrouillée. */
  let _greffeEnCours = false;

  function grefferCollecs() {
    if (_greffeEnCours) return;
    const vue = document.getElementById('view');
    if (!vue) return;
    if (!vue.querySelector('.rankbar')) return;          // on n'est pas sur l'onglet Défis
    if (vue.querySelector('.gcl-wrap')) return;          // déjà greffé

    _greffeEnCours = true;
    const ancre = document.createElement('div');
    ancre.className = 'gcl-wrap';                        // marqué dès l'insertion : idempotent immédiatement
    vue.appendChild(ancre);

    lireGarage().then(possedes => {
      try {
        if (document.body.contains(ancre)) ancre.outerHTML = collecsHTML(possedes);
      } finally { _greffeEnCours = false; }
    }).catch(() => { _greffeEnCours = false; });
  }


  /* ======================================================================
     DISTINCTIONS
     ----------------------------------------------------------------------
     Un chiffre isolé ne dit rien. « 986 kg » ne parle qu'à qui a déjà les
     ordres de grandeur. « La plus légère du catalogue » parle à tout le
     monde. On calcule donc, pour chaque modèle, les classements où il
     figure dans les trois premiers — et on n'affiche rien sinon. Une
     distinction distribuée à tout le monde n'est plus une distinction.
     ====================================================================== */

  const PALMARES = [
    { c:'kgch',  lib:'meilleur rapport poids/puissance', sens:-1, val:f => deriver(f).kgch },
    { c:'chT',   lib:'puissance par tonne',              sens: 1, val:f => deriver(f).chT  },
    { c:'chL',   lib:'puissance spécifique',             sens: 1, val:f => deriver(f).chL  },
    { c:'kg',    lib:'plus légère',                      sens:-1, val:f => f.kg            },
    { c:'ch',    lib:'plus puissante',                   sens: 1, val:f => f.ch            },
    { c:'rupteur', lib:'plus haut régime',               sens: 1, val:f => f.rupteur       },
    { c:'prod',  lib:'plus rare',                        sens:-1, val:f => f.prod          },
  ];

  let _palmCache = null;
  function classements() {
    if (_palmCache) return _palmCache;
    const out = {};
    for (const p of PALMARES) {
      const l = Object.keys(SPECS)
        /* Le moteur rotatif est exclu des classements rapportés à la cylindrée :
           1,3 L au sens Wankel correspond à environ 2,6 L au sens d'un moteur à
           pistons. Le comparer aux autres produirait un classement faux tout en
           étant arithmétiquement correct — c'est le pire type d'erreur. */
        .filter(k => !(/L|nmL/.test(p.c) && /rotatif|birotor/i.test(SPECS[k].arch || '')))
        .map(k => ({ k, v: p.val(SPECS[k]) }))
        .filter(x => typeof x.v === 'number' && isFinite(x.v))
        .sort((a, b) => (b.v - a.v) * p.sens);
      out[p.c] = l.map(x => x.k);
    }
    return (_palmCache = out);
  }

  const ORDINAUX = ['', '', '2ᵉ', '3ᵉ'];

  function distinctionsHTML(idCatalogue) {
    const cle = MAP[idCatalogue];
    if (!cle || !SPECS[cle]) return '';
    const cl = classements();
    const mentions = [];
    for (const p of PALMARES) {
      const rang = cl[p.c].indexOf(cle);
      if (rang < 0 || rang > 2 || cl[p.c].length < 12) continue;
      mentions.push(rang === 0
        ? `<span class="gdi or">🏆 ${esc(p.lib)} du catalogue</span>`
        : `<span class="gdi">${ORDINAUX[rang + 1]} ${esc(p.lib)}</span>`);
    }
    if (!mentions.length) return '';
    return `<div class="gdi-l">${mentions.join('')}</div>`;
  }

  /* ======================================================================
     RECADRAGE INTELLIGENT DES PHOTOS
     ----------------------------------------------------------------------
     PROBLÈME OBSERVÉ : une photo bien cadrée par l'utilisateur apparaît
     décentrée dans l'app. Cause : `object-fit: cover` recadre au CENTRE
     vertical par défaut. Or sur une photo de voiture prise debout, le ciel
     occupe le tiers supérieur et le sujet vit dans la moitié basse. Le crop
     mathématiquement centré est donc systématiquement mal placé.

     SOLUTION ÉCARTÉE : une valeur fixe du type `object-position: center 65%`.
     Ça corrige la photo de station-service et casse le portrait serré, le
     plan en contre-plongée, la photo prise depuis un pont. On déplacerait le
     problème au lieu de le résoudre.

     SOLUTION RETENUE : mesurer où se trouve réellement le sujet. Le ciel est
     une surface lisse — variation de luminance quasi nulle. Une carrosserie,
     des jantes, une route, une station-service sont des surfaces à fort
     gradient. On calcule donc l'ÉNERGIE de détail par bande horizontale, et
     le centre de masse de cette énergie donne la hauteur du sujet.

     Coût : une image réduite à 24×32 puis un parcours de 768 pixels. Moins
     d'une milliseconde, une seule fois par photo, résultat mis en cache.
     ====================================================================== */

  const _cropCache = new Map();
  let _cropCanvas = null;

  /** Position verticale du sujet, en pourcentage de la hauteur (25 à 75). */
  function centreSujet(img) {
    const L = 24, H = 32;
    if (!_cropCanvas) {
      _cropCanvas = document.createElement('canvas');
      _cropCanvas.width = L; _cropCanvas.height = H;
    }
    const ctx = _cropCanvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, L, H);
    const d = ctx.getImageData(0, 0, L, H).data;

    // Luminance perçue
    const g = new Float32Array(L * H);
    for (let i = 0; i < L * H; i++) {
      const o = i * 4;
      g[i] = 0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2];
    }

    // Énergie de détail par ligne : somme des gradients horizontal et vertical.
    const energie = new Float32Array(H);
    let total = 0;
    for (let y = 0; y < H; y++) {
      let e = 0;
      for (let x = 0; x < L; x++) {
        const i = y * L + x;
        if (x < L - 1) e += Math.abs(g[i] - g[i + 1]);
        if (y < H - 1) e += Math.abs(g[i] - g[i + L]);
      }
      energie[y] = e; total += e;
    }
    if (total < 1) return 50;                       // image uniforme : on ne touche à rien

    /* Seuil de bruit : on ignore les bandes dont l'énergie est très inférieure
       à la moyenne. Sans ce filtre, un ciel légèrement nuageux compte autant
       qu'une carrosserie et ramène le centre de masse vers le milieu. */
    const moy = total / H;
    let som = 0, poids = 0;
    for (let y = 0; y < H; y++) {
      const e = energie[y] < moy * 0.35 ? 0 : energie[y];
      som += e * (y + 0.5); poids += e;
    }
    if (poids < 1) return 50;

    const pct = (som / poids) / H * 100;
    return Math.max(25, Math.min(75, Math.round(pct)));   // garde-fou : jamais de crop extrême
  }

  function recadrer(img) {
    if (!img || img.dataset.gcrop) return;
    const src = img.currentSrc || img.src;
    if (!src || src.indexOf('data:image') !== 0) return;   // photos locales uniquement

    const appliquer = () => {
      try {
        if (!img.naturalWidth) return;
        let pct = _cropCache.get(src);
        if (pct === undefined) { pct = centreSujet(img); _cropCache.set(src, pct); }
        img.dataset.gcrop = pct;
        img.style.objectPosition = `center ${pct}%`;
      } catch (_) { img.dataset.gcrop = 'ko'; }
    };

    if (img.complete && img.naturalWidth) appliquer();
    else img.addEventListener('load', appliquer, { once: true });
  }

  function recadrerTout() {
    document.querySelectorAll('#overlay img, #view img, .rv-card img')
      .forEach(recadrer);
  }

  /* ======================================================================
     RATTACHEMENT DES VOITURES « NON CLASSÉ »
     ----------------------------------------------------------------------
     Quand une voiture manque au catalogue, tu la crées en « Non classé »
     sous un identifiant `custom:...`. Si le modèle rejoint plus tard le
     catalogue officiel, ta capture reste orpheline : hors marque, hors pays,
     hors score, et en double du modèle officiel.

     Ce module détecte ces correspondances et propose de rattacher.

     TROIS RÈGLES DE SÛRETÉ, parce qu'on touche à tes données :

     1. RIEN N'EST FAIT SANS TON ACCORD. Le module lit, compare, et affiche
        une proposition. Aucune écriture avant un clic explicite. Une
        migration silencieuse qui se trompe est indétectable.

     2. ON ÉCRIT AVANT DE SUPPRIMER. La nouvelle entrée est enregistrée et
        confirmée, ensuite seulement l'ancienne est retirée. Si l'écriture
        échoue, la capture d'origine est toujours là.

     3. ON FUSIONNE, ON N'ÉCRASE PAS. Si le modèle officiel est déjà au
        garage, les photos des deux entrées sont réunies, la date la plus
        ancienne conservée, les notes concaténées, le favori conservé si
        l'un des deux l'était. Aucune photo perdue.
     ====================================================================== */

  function _bigrammes(t) { const o = new Set(); for (let i = 0; i < t.length - 1; i++) o.add(t.slice(i, i + 2)); return o; }
  function _dice(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1;
    const A = _bigrammes(a), B = _bigrammes(b);
    let n = 0; for (const g of A) if (B.has(g)) n++;
    return (2 * n) / (A.size + B.size);
  }

  function ouvrirBase(mode) {
    return new Promise((res, rej) => {
      let fini = false;
      const t = setTimeout(() => { if (!fini) { fini = true; rej(new Error('timeout')); } }, 4000);
      try {
        const rq = indexedDB.open('garage-manifest');       // jamais de version : aucune migration possible
        rq.onsuccess = () => { if (fini) return; fini = true; clearTimeout(t); res(rq.result); };
        rq.onerror   = () => { if (fini) return; fini = true; clearTimeout(t); rej(rq.error); };
      } catch (e) { clearTimeout(t); rej(e); }
    });
  }

  const _lire = (st, k) => new Promise((res) => { const r = st.get(k); r.onsuccess = () => res(r.result); r.onerror = () => res(null); });
  const _tous = (st)    => new Promise((res) => { const r = st.getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => res([]); });

  /** Cherche, pour chaque « Non classé » capturé, une entrée officielle correspondante. */
  async function chercherRattachements() {
    let cat = [];
    try { cat = (typeof CARS !== 'undefined' && Array.isArray(CARS)) ? CARS.filter(c => !c.custom) : []; } catch (_) {}
    if (!cat.length) return [];

    let db;
    try { db = await ouvrirBase(); } catch (_) { return []; }
    if (!db.objectStoreNames.contains('spots')) return [];

    const st = db.transaction('spots', 'readonly').objectStore('spots');
    const reg = await _lire(st, '__customcars__');
    const customs = (reg && Array.isArray(reg.list)) ? reg.list : [];
    if (!customs.length) return [];

    const spots = await _tous(st);
    const parId = new Map(spots.map(s => [s.carId, s]));

    const props = [];
    for (const cu of customs) {
      const capture = parId.get(cu.id);
      if (!capture) continue;                                  // custom créée mais jamais utilisée
      const cibleTxt = norm(`${cu.brand} ${cu.model}`);
      const marqueCu = norm(cu.brand);

      let best = null, score = 0;
      for (const c of cat) {
        const sim = _dice(cibleTxt, norm(`${c.brand} ${c.model}`));
        /* La marque doit correspondre. Sans cette contrainte, « Clio V6 » et
           « Clio R.S. » atteignent 0,85 de similarité et on rattacherait la
           capture au mauvais modèle — une erreur invisible et permanente. */
        const memeMarque = norm(c.brand) === marqueCu
          || norm(c.brand).includes(marqueCu) || marqueCu.includes(norm(c.brand));
        if (!memeMarque) continue;
        if (sim > score) { score = sim; best = c; }
      }
      /* Seuil volontairement haut : on écrit dans les données de l'utilisateur.
         Un rattachement manqué se rattrape, un rattachement erroné non. */
      if (best && score >= 0.86) {
        props.push({ custom: cu, capture, cible: best, score: Math.round(score * 100),
                     existante: parId.get(best.id) || null });
      }
    }
    return props;
  }

  /** Fusionne deux captures sans jamais perdre de contenu. */
  function fusionner(cibleId, ancienne, existante) {
    const photos = [...(existante?.photos || []), ...(ancienne.photos || [])]
      .filter((p, i, t) => p && t.indexOf(p) === i);           // dédoublonnage strict
    const dates = [existante?.at, ancienne.at].filter(Boolean).sort();
    const notes = [existante?.note, ancienne.note].filter(n => n && n.trim());
    return {
      carId: cibleId,
      at: dates[0] || new Date().toISOString(),                // la plus ancienne des deux
      loc: existante?.loc || ancienne.loc || '',
      coords: existante?.coords || ancienne.coords || null,
      note: [...new Set(notes)].join(' · ').slice(0, 2000),
      photos,
      cover: Math.min(existante?.cover || 0, Math.max(0, photos.length - 1)),
      variants: [...new Set([...(existante?.variants || []), ...(ancienne.variants || [])])],
      favorite: !!(existante?.favorite || ancienne.favorite)
    };
  }

  async function appliquerRattachements(props) {
    const db = await ouvrirBase();
    const journal = [];
    for (const pr of props) {
      const tx = db.transaction('spots', 'readwrite');
      const st = tx.objectStore('spots');
      const fusion = fusionner(pr.cible.id, pr.capture, pr.existante);

      // 1. On écrit la nouvelle entrée, et on attend sa confirmation.
      const ecrit = await new Promise(res => {
        const r = st.put(fusion); r.onsuccess = () => res(true); r.onerror = () => res(false);
      });
      if (!ecrit) { journal.push(`échec : ${pr.custom.brand} ${pr.custom.model} (conservée)`); continue; }

      // 2. Seulement ensuite, on retire l'ancienne et on nettoie le registre.
      await new Promise(res => { const r = st.delete(pr.custom.id); r.onsuccess = r.onerror = () => res(); });
      const reg = await _lire(st, '__customcars__');
      if (reg && Array.isArray(reg.list)) {
        reg.list = reg.list.filter(c => c.id !== pr.custom.id);
        await new Promise(res => { const r = st.put(reg); r.onsuccess = r.onerror = () => res(); });
      }
      journal.push(`${pr.custom.brand} ${pr.custom.model} → ${pr.cible.brand} ${pr.cible.model}`);
    }
    console.info('[GMSpecs] rattachements :', journal);
    return journal;
  }

  /* --- Bandeau de proposition ------------------------------------------ */
  let _bandeauFait = false;

  async function proposerRattachements() {
    if (_bandeauFait || document.getElementById('gmr-rat')) return;
    _bandeauFait = true;
    let props = [];
    try { props = await chercherRattachements(); } catch (_) { return; }
    if (!props.length) return;

    const el = document.createElement('div');
    el.id = 'gmr-rat';
    el.innerHTML = `<div class="gmr-rc">
      <b>${props.length} voiture${props.length > 1 ? 's' : ''} non classée${props.length > 1 ? 's' : ''} ${props.length > 1 ? 'ont' : 'a'} rejoint le catalogue</b>
      <span>${props.map(p => `${esc(p.custom.brand)} ${esc(p.custom.model)} → ${esc(p.cible.brand)} ${esc(p.cible.model)}`).join('<br>')}</span>
      <em>Tes photos, ta date et ta note sont conservées. Rien n'est supprimé avant que la nouvelle fiche soit enregistrée.</em>
      <div class="gmr-ra">
        <button class="btn" data-rat="non">Plus tard</button>
        <button class="btn red" data-rat="oui">Rattacher</button>
      </div></div>`;
    el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-rat]'); if (!b) return;
      if (b.dataset.rat === 'non') return el.remove();
      b.disabled = true; b.textContent = 'Rattachement…';
      try { await appliquerRattachements(props); } catch (_) {}
      el.remove();
      location.reload();                    // l'app a déjà chargé son état en mémoire
    });
    document.body.appendChild(el);
  }

  /* ======================================================================
     CONTRÔLE QUALITÉ ET PILOTAGE DE LA COUVERTURE
     ----------------------------------------------------------------------
     À 927 entrées, le catalogue ne se remplit pas d'un coup : il se remplit
     par lots, sur des mois. Deux outils sont donc indispensables, sans quoi
     la base se dégrade silencieusement :

       valider()  — contrôle de cohérence de chaque fiche. Se lance en
                    console avant chaque livraison de lot.
       audit()    — état de la couverture, marque par marque, et liste
                    priorisée de ce qui manque. C'est ce qui dit quoi
                    traiter ensuite plutôt que de remplir au hasard.

     Le vrai goulot n'est pas d'écrire les fiches, c'est de garantir
     qu'elles sont justes. Ces deux fonctions sont l'outillage de cette
     garantie.
     ====================================================================== */

  /** Contrôle de cohérence. Renvoie la liste des anomalies détectées. */
  function valider() {
    const pb = [];
    const anneesPlausibles = (t) => {
      const ans = String(t).match(/\d{4}/g);
      if (!ans) return false;
      return ans.every(a => +a >= 1885 && +a <= new Date().getFullYear() + 2);
    };

    for (const id in GENS) {
      const g = GENS[id];
      if (!Array.isArray(g) || !g.length) { pb.push([id, 'générations vides']); continue; }

      let precedente = 0;
      g.forEach((gen, i) => {
        const detaille = gen && !Array.isArray(gen) && Array.isArray(gen.m);
        const code = detaille ? gen.c : gen[0];
        const an   = detaille ? gen.a : gen[1];

        if (!code) pb.push([id, `génération ${i} sans code châssis`]);
        if (!anneesPlausibles(an)) pb.push([id, `${code} : années invalides « ${an} »`]);

        // Les générations doivent se suivre chronologiquement.
        const debut = +String(an).match(/\d{4}/)[0];
        if (debut < precedente) pb.push([id, `${code} : génération antérieure à la précédente`]);
        precedente = debut;

        if (detaille) {
          if (!gen.m.length) pb.push([id, `${code} : aucune motorisation`]);
          gen.m.forEach(([nom, meca, ch]) => {
            if (!nom)  pb.push([id, `${code} : motorisation sans nom`]);
            if (!meca) pb.push([id, `${code} / ${nom} : mécanique non renseignée`]);
            if (!ch || !/\d/.test(ch)) pb.push([id, `${code} / ${nom} : puissance non renseignée`]);
          });
          // Doublons de nom à l'intérieur d'une même génération.
          const noms = gen.m.map(x => x[0]);
          if (new Set(noms).size !== noms.length) pb.push([id, `${code} : motorisations en doublon`]);
        }
      });
    }

    // Les identifiants doivent exister dans le catalogue de l'app.
    try {
      if (typeof CARS !== 'undefined' && Array.isArray(CARS)) {
        const connus = new Set(CARS.map(c => c.id));
        for (const id in GENS) if (!connus.has(id)) pb.push([id, 'identifiant absent du catalogue']);
        for (const id in MAP)  if (!connus.has(id)) pb.push([id, 'identifiant absent du catalogue (fiche technique)']);
      }
    } catch (_) {}

    return pb;
  }

  /** État de la couverture et priorités de remplissage. */
  function audit() {
    let cat = [];
    try { cat = (typeof CARS !== 'undefined' && Array.isArray(CARS)) ? CARS : []; } catch (_) {}
    if (!cat.length) return { erreur: 'catalogue hors de portée' };

    const estDetaille = id => Array.isArray(GENS[id]) &&
      GENS[id].some(g => g && !Array.isArray(g) && Array.isArray(g.m));

    const parMarque = {};
    for (const c of cat) {
      const m = (parMarque[c.brand] ||= { total: 0, gens: 0, detail: 0, fiche: 0, manquants: [] });
      m.total++;
      if (GENS[c.id])       m.gens++;
      if (estDetaille(c.id)) m.detail++;
      if (MAP[c.id])        m.fiche++;
      if (!GENS[c.id] && !MAP[c.id]) m.manquants.push(c.model);
    }

    const marques = Object.entries(parMarque)
      .map(([marque, v]) => ({ marque, ...v, couverture: Math.round((v.gens || v.fiche ? Math.max(v.gens, v.fiche) : 0) / v.total * 100) }))
      .sort((a, b) => b.total - a.total);

    const traites = cat.filter(c => GENS[c.id] || MAP[c.id]).length;

    return {
      catalogue: cat.length,
      traites,
      couvertureGlobale: Math.round(traites / cat.length * 100) + ' %',
      modelesDetailles: cat.filter(c => estDetaille(c.id)).length,
      /* Priorité de remplissage : les marques les plus représentées au
         catalogue et les moins couvertes. C'est là que chaque fiche écrite
         rapporte le plus. */
      prioritaires: marques.filter(m => m.total >= 8 && m.couverture < 50)
                           .slice(0, 15)
                           .map(m => `${m.marque} — ${m.gens + m.fiche}/${m.total}`),
      parMarque: marques
    };
  }

  /* ======================================================================
     6. AUTO-INSTALLATION
     ----------------------------------------------------------------------
     Le module s'injecte lui-même : ni balise CSS, ni ligne d'appel à ajouter
     dans index.html. C'est un choix d'architecture, pas une facilité.

     Raisonnement : index.html fait 3 673 lignes et concentre TOUTE l'app.
     Chaque édition manuelle dedans est un risque de régression pour un
     bénéfice nul. Un module qui s'auto-greffe se désinstalle en supprimant
     un fichier — la modification reste réversible et traçable.

     Mécanique : un MutationObserver surveille #overlay. Dès qu'une fiche
     véhicule s'ouvre, on lit le titre de la page « fiche technique », on
     retrouve l'entrée du catalogue, et on ajoute le bloc en fin de page.
     Si quoi que ce soit manque, la fonction ne fait rien : ta fiche reste
     rigoureusement identique à aujourd'hui.
     ====================================================================== */

  const CSS = `
  .gsp{ margin-top:16px; }
  .gsp-h{ display:flex; align-items:baseline; justify-content:space-between; gap:8px;
    font:600 10px/1 var(--mono); letter-spacing:.14em; text-transform:uppercase; color:var(--dim); }
  .gsp-h em{ font-style:normal; color:var(--red); letter-spacing:.06em; }
  .gsp-sig{ margin:9px 0 0; font:400 12px/1.5 var(--sans); color:var(--muted2); }
  .gsp-vedettes{ display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-top:12px; }
  .gsp-v{ border:1px solid var(--line); background:var(--panel2); border-radius:10px;
    padding:11px 8px; text-align:center; }
  .gsp-v b{ display:block; font:700 20px/1 var(--mono); font-variant-numeric:tabular-nums; color:var(--red); }
  .gsp-v small{ display:block; margin-top:5px; font:400 9px/1.35 var(--mono);
    letter-spacing:.05em; text-transform:uppercase; color:var(--dim); }
  .gsp-jauge{ height:3px; border-radius:2px; background:#232327; margin-top:8px; overflow:hidden; }
  .gsp-jauge>i{ display:block; height:100%; background:var(--red); border-radius:2px; }
  .gsp .specs{ margin-top:9px; }
  .gsp-rar{ display:inline-block; margin-top:12px; padding:5px 11px; border:1px solid var(--line);
    border-radius:999px; font:600 10px/1 var(--mono); letter-spacing:.08em; }
  .gsp-flou{ margin:10px 2px 0; font:400 10.5px/1.5 var(--mono); color:var(--dim); }
  .gsp-gens .gsp-h em{ color:var(--dim); }
  .gg{ display:flex; gap:11px; padding:11px 0; border-top:1px solid var(--line); }
  .gg:first-of-type{ border-top:none; padding-top:8px; }
  .gg>b{ flex:0 0 82px; font:700 12px/1.35 var(--mono); letter-spacing:.03em; color:var(--red); }
  .gg .gt{ flex:1; min-width:0; }
  .gg .gt i{ display:block; font-style:normal; font:600 10.5px/1 var(--mono); color:var(--dim); }
  .gg .gt p{ margin:5px 0 0; font:500 12.5px/1.4 var(--sans); }
  .gg .gt small{ display:block; margin-top:5px; font:400 11.5px/1.5 var(--sans); color:var(--muted2); }
  .gg-d{ display:block; }
  .gg-tete{ display:flex; align-items:baseline; gap:9px; }
  .gg-tete b{ font:700 13px/1.3 var(--mono); letter-spacing:.04em; color:var(--red); }
  .gg-tete i{ font-style:normal; font:600 10.5px/1 var(--mono); color:var(--dim); }
  .gm-liste{ margin-top:8px; padding-left:11px; border-left:2px solid var(--line); }
  .gm + .gm{ margin-top:11px; }
  .gm-t{ display:flex; align-items:baseline; justify-content:space-between; gap:10px; }
  .gm-t b{ font:600 12.5px/1.3 var(--sans); }
  .gm-t span{ flex:none; font:700 11.5px/1 var(--mono); color:var(--peucommun); }
  .gm p{ margin:3px 0 0; font:400 11.5px/1.4 var(--mono); color:var(--muted2); }
  .gm small{ display:block; margin-top:4px; font:400 11.5px/1.5 var(--sans); color:var(--dim); }
  .gsp-mot .gsp-h em{ color:var(--dim); }
  .gmm{ border-top:1px solid var(--line); }
  .gmm:first-of-type{ border-top:none; }
  .gmm summary{ display:flex; align-items:baseline; justify-content:space-between; gap:10px;
    padding:11px 0; cursor:pointer; list-style:none; }
  .gmm summary::-webkit-details-marker{ display:none; }
  .gmm summary b{ font:600 12.5px/1.3 var(--sans); }
  .gmm summary span{ flex:none; font:600 10px/1 var(--mono); letter-spacing:.06em;
    text-transform:uppercase; color:var(--red); }
  .gmm[open] summary b{ color:var(--red); }
  .gmm-d{ margin:0 0 9px; font:400 11.5px/1.5 var(--sans); color:var(--muted2); }
  .gmm-l{ display:flex; flex-wrap:wrap; gap:5px; padding-bottom:12px; }
  .gmm-l button{ padding:6px 10px; border:1px solid var(--line); border-radius:999px;
    background:var(--panel2); font:500 11px/1 var(--sans); color:var(--muted); cursor:pointer; }
  .gmm-l button:active{ transform:scale(.96); border-color:var(--red-dk); }

  .gcl-head{ display:flex; align-items:baseline; justify-content:space-between; gap:10px; }
  .gcl-head span{ font:500 10px/1 var(--mono); letter-spacing:.04em; color:var(--dim); }
  .gcl-intro{ margin:8px 0 14px; font:400 12px/1.5 var(--sans); color:var(--muted2); }
  .gcl{ border-top:1px solid var(--line); }
  .gcl summary{ display:flex; align-items:center; gap:11px; padding:12px 0; cursor:pointer; list-style:none; }
  .gcl summary::-webkit-details-marker{ display:none; }
  .gcl-ic{ font-size:1.15rem; flex:none; width:26px; text-align:center; }
  .gcl-t{ flex:1; min-width:0; }
  .gcl-t b{ display:block; font:600 13px/1.25 var(--sans); }
  .gcl-t i{ display:block; margin-top:3px; font-style:normal; font:600 10px/1 var(--mono);
    letter-spacing:.05em; color:var(--dim); font-variant-numeric:tabular-nums; }
  .gcl-j{ flex:0 0 54px; height:4px; border-radius:3px; background:#232327; overflow:hidden; }
  .gcl-j>i{ display:block; height:100%; background:var(--red); border-radius:3px; transition:width .5s ease; }
  .gcl.fait .gcl-t b{ color:var(--legendaire); }
  .gcl.fait .gcl-j>i{ background:var(--legendaire); }
  .gcl[open] .gcl-t b{ color:var(--red); }
  .gcl-d{ margin:0 0 10px; font:400 12px/1.55 var(--sans); color:var(--muted2); }
  .gcl-l{ display:flex; flex-wrap:wrap; gap:5px; padding-bottom:13px; }
  .gcl-p{ padding:6px 10px; border:1px solid var(--line); border-radius:999px; background:var(--panel2);
    font:500 11px/1 var(--sans); color:var(--dim); cursor:pointer; }
  .gcl-p:active{ transform:scale(.96); }
  .gcl-p.on{ color:var(--txt); border-color:var(--red-dk); background:rgba(239,68,68,.12); }

  .gdi-l{ display:flex; flex-wrap:wrap; gap:6px; margin-bottom:14px; }
  .gdi{ padding:5px 10px; border-radius:999px; border:1px solid var(--line2);
    background:var(--panel2); font:600 10px/1.3 var(--mono); letter-spacing:.04em;
    text-transform:uppercase; color:var(--muted); }
  .gdi.or{ color:var(--legendaire); border-color:rgba(251,191,36,.45);
    background:rgba(251,191,36,.08); }

  #gmr-rat{ position:fixed; left:12px; right:12px; bottom:calc(var(--tabh,64px) + 12px + var(--sb,0px));
    z-index:255; display:flex; justify-content:center; }
  .gmr-rc{ width:100%; max-width:520px; background:var(--panel); border:1px solid var(--line2);
    border-radius:14px; padding:14px 16px; box-shadow:0 12px 40px rgba(0,0,0,.55); }
  .gmr-rc b{ display:block; font:600 13px/1.35 var(--sans); }
  .gmr-rc span{ display:block; margin-top:7px; font:500 11.5px/1.6 var(--mono); color:var(--peucommun); }
  .gmr-rc em{ display:block; margin-top:8px; font-style:normal; font:400 11px/1.5 var(--sans); color:var(--dim); }
  .gmr-ra{ display:flex; gap:8px; margin-top:12px; }
  .gmr-ra .btn{ flex:1; text-align:center; }
  `;

  function injecterCSS() {
    if (document.getElementById('gsp-css')) return;
    const st = document.createElement('style');
    st.id = 'gsp-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  /* Index « Marque Modèle » -> id du catalogue.
     CARS est déclaré en const au niveau racine d'un <script> classique : il est
     donc visible depuis ce fichier, chargé après lui. Construit une seule fois. */
  let _index = null;
  function indexTitres() {
    if (_index) return _index;
    _index = new Map();
    try {
      const cat = (typeof CARS !== 'undefined' && Array.isArray(CARS)) ? CARS : [];
      for (const c of cat) _index.set(norm(`${c.brand} ${c.model}`), c.id);
    } catch (_) { /* catalogue hors de portée : le module se met simplement en veille */ }
    return _index;
  }

  function greffer() {
    const pages = document.querySelectorAll('#overlay .sheet .page');
    if (!pages.length) return;
    const page = pages[pages.length - 1];          // la fiche technique est la dernière page
    if (page.querySelector('.gsp')) return;         // déjà greffé
    const h2 = page.querySelector('.info-head h2');
    if (!h2) return;
    const id = indexTitres().get(norm(h2.textContent));
    if (!id) return;
    const html = blocHTML(id);
    if (html) page.insertAdjacentHTML('beforeend', html);
  }

  function autoInstall() {
    injecterCSS();
    const vue = document.getElementById('view');
    if (vue) new MutationObserver(() => {
      try { grefferCollecs(); } catch (_) {}
      try { recadrerTout(); } catch (_) {}
    }).observe(vue, { childList: true, subtree: true });
    try { grefferCollecs(); } catch (_) {}
    const n = etendreVariants();
    if (n) console.info(`[GMSpecs] ${n} modèle(s) enrichi(s) de leurs générations dans le système de collection`);
    const cible = document.getElementById('overlay') || document.body;
    new MutationObserver(() => {
      try { greffer(); } catch (_) {}
      try { recadrerTout(); } catch (_) {}
    }).observe(cible, { childList: true, subtree: true });
    try { greffer(); recadrerTout(); } catch (_) {}
    /* Différé : on laisse l'app finir son propre démarrage avant d'ouvrir la base. */
    setTimeout(() => { try { proposerRattachements(); } catch (_) {} }, 2500);
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', autoInstall);
  else
    autoInstall();

  /* ======================================================================
     7. API
     ====================================================================== */

  const API = {
    CHAMPS, DERIVES, SPECS, MAP, GENS,

    /** Le bloc HTML à injecter dans infoPageHTML. Chaîne vide si non renseignée. */
    blocHTML,

    /** Fiche brute par clé de spec. */
    get: cle => SPECS[cle] || null,

    /** Fiche complète (données + dérivés + rareté + signature) par id de catalogue. */
    pourCatalogue(idCatalogue) {
      const cle = MAP[idCatalogue];
      if (!cle || !SPECS[cle]) return null;
      const f = SPECS[cle];
      return { cle, idCatalogue, ...f, ...deriver(f), rarete: rarete(f.prod), signature: signature(f) };
    },

    /** Classement du lot sur un champ ou un dérivé. */
    classement(champ, n = 10) {
      const def = CHAMPS[champ] || DERIVES[champ];
      if (!def) return [];
      const sens = def.sens || 1;
      return Object.keys(SPECS)
        .map(cle => ({ cle, nom: SPECS[cle].nom, v: SPECS[cle][champ] ?? deriver(SPECS[cle])[champ] }))
        .filter(o => typeof o.v === 'number' && isFinite(o.v))
        .sort((a, b) => (b.v - a.v) * sens)
        .slice(0, n);
    },

    rarete, deriver, percentile, signature,
    valider, audit,
    MOTEURS, famillesDe, COLLECS,
    recadrer, recadrerTout, centreSujet,
    chercherRattachements, appliquerRattachements, proposerRattachements,

    /** Les collections mécaniques et leurs membres. */
    collections: () => calculerCollecs().map(c => ({
      id: c.id, nom: c.n, description: c.d,
      membres: c.membres.map(nomCatalogue).sort()
    })),

    /** Toutes les familles de blocs partagées, triées par nombre de porteurs. */
    moteurs() {
      const idx = indexMoteurs();
      return MOTEURS.map(f => {
        const l = idx.get(f.c) || [];
        const ids = [...new Set(l.map(x => x.id))];
        return { cle:f.c, nom:f.n, description:f.d, modeles:ids.length,
                 versions:l.length, porteurs:ids.map(nomCatalogue).sort() };
      }).filter(f => f.modeles > 1).sort((a, b) => b.modeles - a.modeles);
    },

    /** Familles déclarées mais invisibles : zéro ou un seul porteur détecté.
     *  À lancer après chaque ajout de famille — c'est ce contrôle qui aurait
     *  révélé tout de suite que « V12 diesel » ne trouvait que la R10. */
    moteursOrphelins() {
      const idx = indexMoteurs();
      return MOTEURS.map(f => {
        const ids = [...new Set((idx.get(f.c) || []).map(x => x.id))];
        return { nom: f.n, porteurs: ids.length, modeles: ids.map(nomCatalogue) };
      }).filter(f => f.porteurs < 2);
    },

    /** Diagnostic : couverture des fiches et de la table de correspondance. */
    stats() {
      const cles = Object.keys(SPECS);
      const couverture = {};
      for (const c in CHAMPS)
        couverture[c] = Math.round(cles.filter(k => SPECS[k][c] != null).length / cles.length * 100);
      const mappees = new Set(Object.values(MAP));
      const gens = Object.keys(GENS);
      return {
        fiches: cles.length,
        rattachees: Object.keys(MAP).length,
        orphelines: cles.filter(k => !mappees.has(k)),
        modelesAvecGenerations: gens.length,
        generations: gens.reduce((n, k) => n + GENS[k].length, 0),
        motorisations: gens.reduce((n, k) => n + GENS[k].reduce(
          (m, g) => m + ((g && !Array.isArray(g) && Array.isArray(g.m)) ? g.m.length : 1), 0), 0),
        couverture
      };
    }
  };

  global.GMSpecs = API;
})(window);
