# CLAUDE.md — Règles de travail sur Garage Manifest

> **Rôle de ce fichier.** Contrat d'ingénierie pour toute intervention automatisée
> (Claude Code ou autre) sur ce dépôt. Il fige les **invariants** qui ne se
> discutent pas, les **contrats** entre modules qui cassent en silence si on les
> ignore, et les **conventions de données** qui garantissent qu'aucun chiffre
> n'est inventé. Le *pourquoi* (décisions, historique des chantiers) vit dans
> `CONTEXT.md` ; le *quoi/comment fonctionnel* vit dans `README.md`. Ce fichier-ci
> porte le *comment travailler sans rien casser*.
>
> Règle d'or : **une contrainte marquée « invariant » ne se contourne pas par
> défaut.** Toute proposition qui la remet en cause doit être argumentée
> explicitement et validée, jamais appliquée d'office.

---

## 0. Le projet en une phrase

Garage Manifest est une **PWA vanilla** (« Pokédex pour voitures ») déployée en
statique sur GitHub Pages. Aucun build, aucune dépendance, aucun serveur : le
code livré *est* le code exécuté.

Trois fichiers portent la logique, et ils ont chacun un rôle strict :

| Fichier | Rôle | Ce qu'on y touche |
|---|---|---|
| `index.html` | L'application entière (HTML + CSS + JS + catalogue `CARS`) | Par **patchs ciblés** uniquement (voir §1) |
| `gm-specs.js` | Couche **additive** de fiches techniques, générations, catalogue étendu | Module autonome, se greffe seul |
| `sw.js` | Service worker (cache app-shell → hors-ligne) | `VERSION` à incrémenter à chaque livraison (voir §5) |

---

## 1. Contraintes d'architecture (INVARIANTS)

Ces choix sont structurants. Les casser, c'est casser le modèle de déploiement,
l'auditabilité ou le fonctionnement hors-ligne.

### 1.1 — `index.html` unique et auto-contenu
L'application (HTML, CSS, JS applicatif, catalogue `CARS`) tient dans **un seul
fichier** `index.html`. Les modules `gm-*.js` sont chargés **à côté**, en réseau-
d'abord. Justification : déployable par simple copie, hébergement statique
gratuit, et **auditabilité totale** — le code livré est lisible d'un bloc.

### 1.2 — Vanilla JS, zéro dépendance
Pas de framework, pas de bundler, pas de `npm install`, pas d'étape de build.
Justification : rien à télécharger à l'exécution (donc réellement hors-ligne),
aucune chaîne de dépendances à maintenir, aucune rupture liée à une montée de
version tierce. **N'introduis jamais de dépendance externe** (CDN, package, lib)
sans que ce soit explicitement demandé et argumenté.

### 1.3 — Jamais réécrire `index.html` en entier
`index.html` fait ~3 900 lignes et concentre l'app complète. **Interdiction de le
régénérer, de le reformater globalement, ou de le remplacer d'un bloc.**
On travaille **par patchs ciblés** : on localise la zone (fonction, bloc `const`,
handler), on édite le strict nécessaire, on laisse le reste identique au caractère
près.

- **Pourquoi.** Une réécriture globale (a) rend la revue impossible — on ne peut
  plus distinguer le changement voulu du bruit de reformatage ; (b) fait perdre
  silencieusement des correctifs ponctuels accumulés (bugs `cyl:0`, rareté
  géographique Ram/F-150, etc.) ; (c) casse le `diff` git qui est la seule trace
  d'audit du projet.
- **En pratique.** Utilise des remplacements de chaîne exacts et uniques.
  Si une modification touche beaucoup d'endroits, fais **plusieurs petits patchs
  ciblés**, pas un gros remplacement. Le même principe s'applique à `gm-specs.js`
  (~14 700 lignes) : additif et localisé, jamais réécrit.

### 1.4 — Persistance et hors-ligne
- **IndexedDB** (base `garage-manifest`, store `spots`) pour la collection et les
  photos — volume élevé, asynchrone, quota large. Repli **en mémoire** si
  IndexedDB est indisponible (bac à sable, aperçu) : l'app tourne, sans
  persistance. Ne remplace pas ce mécanisme par `localStorage`.
- **Service worker** (`sw.js`) pour l'installabilité et la consultation hors-ligne.

### 1.5 — Aucun secret côté client
La reconnaissance photo passe par un relais **Cloudflare Workers**
(`ai-relay-worker.js`, déployé à part). La clé du modèle ne doit **jamais** vivre
dans le navigateur. Le client envoie `POST {image: dataURL}` et reçoit
`[{brand, model, confidence}]` ; le rapprochement catalogue se fait **côté client**
dans `index.html` (`matchCatalog`).

---

## 2. Architecture de `gm-specs.js`

### 2.1 — Un IIFE, une seule fuite globale
Tout le module est une **IIFE** (`(function (global) { 'use strict'; … })(window)`).
Toutes les structures internes — `SPECS`, `GENS`, `MAP`, `MOTOR_SPECS`,
`CATALOGUE_PLUS`, `CHAMPS`, `DERIVES`, fonctions de rendu et de greffe — sont
**privées à la clôture**. Le **seul** symbole exposé est `window.GMSpecs`, l'objet
`API` défini en fin de fichier.

- **Conséquence critique (bug déjà rencontré).** Depuis `index.html`, il est
  **interdit** de tester `typeof MOTOR_SPECS !== "undefined"` ou de lire `GENS`,
  `MAP`, `SPECS` directement : ces noms n'existent pas dans le scope global, la
  garde est donc *toujours fausse* et échoue **en silence** (aucune erreur JS,
  le rendu est simplement vide). Tout accès depuis `index.html` passe par
  `window.GMSpecs.MOTOR_SPECS`, `window.GMSpecs.GENS`, `window.GMSpecs.MAP`, etc.
- **Leçon.** `node --check` valide la *syntaxe*, pas le *comportement*. Tout
  câblage entre `index.html` et `gm-specs.js` doit être vérifié par une exécution
  réelle (banc navigateur, voir §6), jamais par la seule lecture du code.

### 2.2 — Les quatre structures de données
| Structure | Clé | Contenu | Rôle |
|---|---|---|---|
| `SPECS` | clé de spec (`'alfa-giulia'`) | fiche **plate** : `ch, nm, kg, cyl, arch, adm, pos, tx, bv, rupteur, prod, note, son, surnom, flou[]` | La fiche technique mono-moteur du modèle |
| `GENS` | **id catalogue** ⚠️ | tableau de générations, format **positionnel** (voir §4.3) | Bloc « Générations & motorisations » (texte libre) |
| `MAP` | **id catalogue** → **clé de spec** | table de correspondance | Relie une entrée du catalogue à sa fiche `SPECS`/`GENS` |
| `MOTOR_SPECS` | **id catalogue** | `{ types:[{ id, label, variants:[{ id, label, ch, nm, kg, cyl, arch, adm, pos, tx, bv, note }] }] }` | Sélecteur multi-motorisations |

> ⚠️ **`GENS` et `SPECS` ne sont PAS indexés pareil.** `SPECS` l'est par clé
> de fiche (on y arrive via `MAP[id]`) ; `GENS` l'est par **id catalogue**,
> directement — `gensHTML()` lit `GENS[idCatalogue]`, sans passer par `MAP`.
> Pour 28 voitures les deux diffèrent (`landrover-rangerover` → fiche
> `range-rover`). Ranger des générations sous la clé de fiche, ou les lire
> par elle, les rend invisibles **sans aucune erreur**. Ce tableau affirmait
> l'inverse jusqu'au 24/09 : `fichePourInterface()` a été écrite d'après lui
> et renvoyait `generations: null` pour ces 28 voitures. Le banc d'audit
> signale désormais tout bloc `GENS` orphelin (contrôle D ter).

Points de conception à respecter :
- **`MOTOR_SPECS` est purement additif.** Il ne modifie ni `SPECS`, ni `GENS`, ni
  `MAP`. Les fiches mono-moteur existantes restent intactes quand on ajoute des
  motorisations.
- Les champs d'une variante `MOTOR_SPECS` sont **exactement ceux de `SPECS`**,
  donc directement consommables par `DERIVES.calc()` (kg/ch, ch/t, ch/L, Nm/L,
  kg/Nm) sans logique de ratio supplémentaire.
- **Rien n'est stocké s'il peut être calculé.** Les ratios (`DERIVES`) sont des
  fonctions de deux données, jamais des champs. Stocker un ratio, c'est garantir
  une incohérence le jour où l'une des deux valeurs change.
- **La rareté « fiche technique » (`PALIERS_RARETE`) est dérivée** du volume de
  production (`log10`), pas écrite à la main. ⚠️ À ne pas confondre avec `RARITY`
  (6 paliers, saisie manuelle, dans `index.html`) qui pilote la rareté réellement
  **affichée dans le jeu**. Les deux systèmes coexistent sans lien automatique.

### 2.3 — Règle des deux catalogues : `CARS` + `CATALOGUE_PLUS`
Le catalogue réel affiché est la **fusion** de deux sources, réunies au démarrage
par `etendreCatalogue()` :

```
CARS            (dans index.html)      ← source historique
CATALOGUE_PLUS  (dans gm-specs.js)     ← extension additive
        └──── etendreCatalogue() ────► catalogue complet
```

**Toute vérification « cette voiture existe-t-elle dans le catalogue ? » doit
interroger les DEUX sources.** Ne jamais conclure à une absence en n'ayant
regardé que `CARS`.

- **Pourquoi cette règle est écrite noir sur blanc.** L'oubli de
  `CATALOGUE_PLUS` a déjà provoqué des erreurs : croire à tort que les M2 CS /
  M4 CSL manquaient, et écarter des candidats `MOTOR_SPECS` (audi-s4, audi-s5,
  toyota-supra-mk3) qui existaient en réalité dans `CATALOGUE_PLUS`.
- Un ajout de modèle « complet » se répercute donc potentiellement dans
  **quatre** structures cohérentes : `CATALOGUE_PLUS` (existence + identité),
  `SPECS` (fiche technique), `GENS` (générations) et `MAP` (correspondance).

---

## 3. Contrat DOM entre `index.html` et `gm-specs.js`

`gm-specs.js` ne connaît pas l'implémentation d'`index.html` : il communique avec
lui **uniquement par des marqueurs `data-*` dans le DOM**. Ces attributs sont un
**contrat** — les renommer ou les retirer casse la greffe en silence.

Mécanique : un `MutationObserver` surveille `#overlay`. Dès qu'une fiche s'ouvre,
`greffer()` repère la voiture par le titre `.info-head h2`, résout son id, puis
injecte `blocHTML(id)` en fin de dernière page (fiche technique + générations +
moteurs).

| Marqueur | Posé par | Lu par | Effet |
|---|---|---|---|
| `[data-verrou]` | `index.html`, sur une voiture **non spottée** | `greffer()` | Si présent → **on ne greffe RIEN**. Le verrou de collection est une mécanique de jeu qui doit survivre à tout re-design. |
| `[data-moto-actif="typeId\|variantId"]` | `index.html`, sur le sélecteur de motorisation | `varianteActive()` puis `greffer()` | Indique la motorisation choisie. La fiche greffée est alors recalculée **pour cette variante** (`ficheHTML(id, variante)`) : champs mécaniques de la variante, mais note/surnom/production/son du modèle ; le `rupteur` est **retiré** car propre à un seul moteur. |

Règles à ne jamais enfreindre :
- **Le verrou est étanche.** `greffer()` doit sortir immédiatement si
  `[data-verrou]` est présent — sinon masse/couple/ratios fuient sur des voitures
  non collectées (bug déjà corrigé au banc navigateur).
- **Les chiffres greffés suivent la motorisation active.** Toute variante lue via
  `[data-moto-actif]` doit recalculer la fiche ; ne jamais laisser les chiffres
  d'une variante afficher ceux d'une autre (bug déjà corrigé : Giulia Diesel qui
  affichait le couple de la 2.0 essence, M4 CS avec la masse de la G82).
- **Un seul bloc de chaque.** Ne pas dupliquer le bloc « Générations » entre
  `index.html` et `gm-specs.js`.

---

## 4. Conventions de données (aucun chiffre inventé)

Principe cardinal : **on n'écrit jamais une valeur qu'on ne peut pas sourcer.**
Mieux vaut une génération manquante qu'une génération approximée. Les chiffres
sont vérifiés par recherche (presse constructeur, zeperfs, autotijd, largus,
automobile-sportive, cars-data…) au moment de la saisie.

### 4.1 — `flou:[…]` → affichage « ≈ »
Chaque fiche déclare dans le tableau `flou` la **liste des clés de champs** dont
la valeur exacte n'est pas garantie (`flou:['ch','prod']`). À l'affichage, `fmt()`
préfixe ces valeurs de « **≈** », et un bas de fiche récapitule
« Valeurs approximatives (≈) : … ». C'est le seul mécanisme autorisé pour publier
une valeur incertaine — on l'annonce, on ne la maquille pas en valeur ferme.

### 4.2 — `nc` = non communiqué
Quand un constructeur ne publie officiellement pas une valeur, on ne l'invente pas
et on ne la devine pas : la valeur est traitée comme **non communiquée (`nc`)**.
Concrètement : soit le champ est omis (donc non affiché), soit il est déclaré dans
`flou` avec une note explicite indiquant que le chiffre est une estimation et non
une donnée constructeur (ex. Audi qui ne communique pas une puissance officielle).
Ne jamais transformer un « nc » en valeur ferme.

### 4.3 — Format positionnel des générations (`GENS`)
Format volontairement compact, pour qu'une génération tienne sur une ligne
relisible et corrigeable d'un coup d'œil :

```
Format COURT    : [ code, années, mécanique, puissance, note ]
Format DÉTAILLÉ : { c: code, a: années, m: [[ nom, mécanique, ch, transmission, note ], …] }
```

Le **code** (E30, 964, NA, Fox…) est ce qui compte pour un passionné : c'est la
première colonne. Le rendu (`gensHTML`) gère les deux formats.

### 4.4 — Couple cumulé pour les hybrides… sauf architecture HSD
Pour un véhicule **hybride**, `ch` et `nm` désignent les valeurs **cumulées**
(thermique + électrique), conformément à la communication constructeur. La note
de la fiche le précise (« puissance et couple cumulés », « couple cumulé »). Ne
pas additionner soi-même des chiffres partiels ni mélanger une puissance
thermique seule avec un couple cumulé : on reprend la valeur système publiée.

⚠️ **Exception majeure — les hybrides Toyota / Lexus (HSD).** Toyota ne publie
**aucun** couple système pour son Hybrid Synergy Drive, et ce n'est pas un oubli :
dans cette architecture, thermique et électrique sont reliés par un **train
épicycloïdal**, sans embrayage ni convertisseur. Les deux couples ne s'additionnent
donc jamais sur un arbre commun — **un « couple cumulé » n'a pas de sens physique**
ici. Y inscrire un chiffre, même trouvé quelque part, est une **erreur technique**,
pas une approximation. Le champ `nm` reste vide pour ces fiches (Prius, Camry,
Crown, RAV4 hybride, C-HR, Lexus RX…).

Même prudence pour les hybrides **série** en général : la règle du couple cumulé
vaut pour les architectures **parallèles** où le constructeur publie une valeur
système (Peugeot PSE, Volvo T8, AMG E Performance, Alfa Tonale Q4…).

### 4.4 bis — Voitures de course : couple non publié, et trois régimes de `flou`

Le **couple n'est jamais publié** par les écuries : le champ `nm` reste vide,
jamais estimé. Une fiche de course sans couple est **conforme**, pas incomplète
— ne pas la « corriger ». Cela concerne la grande majorité des 69 entrées de
catégorie « Course ».

Pour `ch` et `kg`, en revanche, **il n'y a pas un seul régime mais trois**, et
les confondre produit l'erreur dans un sens ou dans l'autre. La BoP ne régit pas
toutes les voitures de course : appliquer `flou:['ch','kg']` à toute la
catégorie annoncerait une incertitude là où le chiffre est certain — et le « ≈ »
perd tout son sens s'il est partout.

Le critère de tri est une **propriété factuelle de la série**, pas une
impression :

| Régime | Qui | `flou` | Pourquoi |
|---|---|---|---|
| **BoP** | GT3, GTE, Hypercar LMH/LMDh — 14 fiches | `['ch','kg']` | Bride **et** lest redéfinis à chaque épreuve. Les 680 ch / 1 030 kg affichés par tous les Hypercar ne sont pas des chiffres d'ingénierie, ce sont des plafonds réglementaires. |
| **Bride** | F1, prototypes, GT1/LMGTP, WRC, Groupe B, dragster, ovale, IndyCar — 45 fiches | `['ch']` **seulement** | La puissance est bridée par un restricteur ou jamais communiquée. Mais la masse est un **minimum réglementaire** que la voiture atteint exactement : une F1 2023 pèse 798 kg parce que le règlement l'impose — c'est la donnée **la plus ferme** de sa fiche. La marquer « ≈ » serait faux. |
| **Ferme** | Monotypes et séries clients — 10 fiches | *(rien)* | 911 GT3 Cup, A110 Cup, 488 Challenge, Radical SR3, Lamera, Mitjet, Espace F1, Daytona Coupé : chiffres constructeur, valables toute la saison. |

> ⚠️ **Le piège de la masse réglementaire.** C'est le contresens à ne pas faire.
> Dans une série à BoP, le lest bouge → la masse est floue. Dans une série à
> minimum réglementaire, la masse est au contraire *plus* certaine que sur une
> routière, puisque l'équipe construit la voiture pour taper exactement ce
> chiffre. Masses réglementaires déjà au catalogue et à laisser fermes :
> F1 798 kg (2023), 746 (2020), 605 (2004), 505 (1992) ; Top Fuel 1 050 kg ;
> Sprint Car 635 kg ; Midget 410 kg ; WRC 1 230 kg.

> ⚠️ `nc` n'existe pas comme champ dans le code : il n'y a **aucun** rendu associé.
> La seule façon de dire « non communiqué » est donc de **laisser le champ absent**
> (`fmt()` n'affiche alors pas la ligne). N'écris jamais un champ `nc:[…]` en
> croyant qu'il produira un affichage : il serait inerte.

### 4.4 ter — Une seule norme de mesure par fiche

`ch` et `nm` d'une même fiche doivent provenir de la **même norme** et, idéalement,
de la **même source**. Mélanger deux référentiels ne produit aucune erreur visible
mais fausse **tous les ratios dérivés** (kg/ch, ch/t, ch/L, Nm/L) — et ces ratios
sont justement ce que la fiche met en avant.

Les référentiels qui se confondent le plus facilement :

| Piège | Exemple rencontré |
|---|---|
| **SAE gross vs SAE net** (bascule en 1972 aux États-Unis) | Chevrolet C10 portait `ch:255` (SAE gross) avec des couples SAE net. Le 350 V8 en SAE net donne 165 ch **et 255 lb-ft** — la coïncidence des deux « 255 » explique la saisie d'origine. Idem K5 Blazer. |
| **SAE vs DIN** | Citroën DS : 141 ch SAE = 130 ch DIN. Ami 6 : 35 ch SAE = 32 ch DIN, et c'est la version DIN qui porte le couple publié. |
| **Couple moteur vs couple à la roue** | GMC Hummer EV : « 11 500 lb-ft » (15 592 Nm) est le couple **à la roue** annoncé par le marketing ; le couple moteur réel est de 1 485 Nm. Même piège sur la Lucid Air (1 430 lb-ft annoncés contre 1 390 Nm moteur). |
| **Couple cumulé vs couple partiel** | Voir §4.4 — ne jamais additionner soi-même. |

**Le signal d'alerte :** deux sources qui s'écartent d'un **ordre de grandeur** ne
mesurent presque jamais la même chose. Un écart de 10 % est une imprécision ; un
écart d'un facteur 1,4 ou 10 est un **changement de référentiel**. Dans ce cas on
ne moyenne pas, on ne choisit pas au hasard : on identifie la norme et on prend
les deux valeurs dans celle-là.

Quand la norme retenue n'est pas évidente, la **note de la fiche le précise**
(« chiffres du V8 5.7 en norme SAE net ») — sinon l'arbitrage se reperd à la
première relecture.

### 4.5 — Règle GTA (déclinaisons qui méritent leur propre fiche)
Une déclinaison qui constitue un **modèle à part entière** — poids, identité et
rareté propres, pas seulement un choix de moteur sur la même carrosserie — a sa
**fiche catalogue séparée** et est **exclue** de la fiche de base (et de son
`MOTOR_SPECS`). Le nom vient de l'Alfa Romeo Giulia **GTA**, distincte de la
Giulia standard.

- **Le critère de tri.** Moteur différent seul → **même fiche + sélecteur**
  (`MOTOR_SPECS`). Modèle différent (poids/identité/rareté) → **fiche séparée**,
  exclu de la base.

### 4.5 bis — L'entrée catalogue est l'arbitre de ce que décrit une fiche

Corollaire de la règle GTA, et **le contrôle à faire avant d'écrire le moindre
chiffre** : une fiche `SPECS` doit décrire **exactement la voiture que son entrée
catalogue annonce** — son libellé, ses millésimes, sa catégorie et sa rareté.

Quand la puissance d'une fiche ne correspond pas à ce que son nom annonce, ce
n'est pas une donnée manquante, c'est un **périmètre mal défini** — et le
compléter mécaniquement fige l'erreur. Cas réellement rencontrés et tranchés :

| Fiche | Elle portait | Arbitre | Tranché en |
|---|---|---|---|
| Peugeot 106 | 120 ch (la **GTI**) | `106 GTI` et `106 Rallye` ont leurs **propres entrées** ; celle-ci est « Citadine, commun » | 106 1.1i, 60 ch |
| Simca 1000 | 103 ch (la **Rallye 3**) | L'entrée dit « Rallye **2** » | Rallye 2, 82 ch |
| Fiat 500 (Nuova) | 23 ch (la **500 R**, 594 cm³) | L'entrée dit « Nuova » ; la moderne a son entrée | 500 F, 18 ch, 499 cm³ |
| Lancia 037 | masse de la version **Groupe B** | Catégorie « Classique », pas « Course » | Stradale, 1 170 kg |
| Renault Scénic | `ch` de l'**électrique**, `cyl` du **thermique** | — (incohérence interne) | E-Tech 170, `cyl:0` |
| Ariel Atom | 350 ch, **aucune version réelle** | — (valeur sans référent) | Atom 4, 320 ch |

**Le réflexe :** avant de chercher un chiffre manquant, vérifie que `ch` désigne
bien la voiture nommée. Une incohérence ici est la racine des bugs
Giulia/Quadrifoglio et M2 CS/M4 CSL — la fiche affiche une **autre voiture**.
- **Exclusions déjà appliquées** au titre de cette règle : 911 Turbo/GT3/GT2 RS,
  M3 CSL/Touring, Golf R/R32, Mégane R.S./R26.R, 206 WRC, séries d'homologation
  en très petit volume (ex. Alfa GTV6 3.0 sud-africaine, 212 ex.).

---

## 5. Versionnement : incrémenter `VERSION_MODULE` **et** `sw.js` à chaque livraison

Le service worker sert le cache tant que sa `VERSION` ne change pas. **Si on livre
une modification d'un fichier mis en cache sans incrémenter la version, l'ancienne
copie est resservie indéfiniment côté téléphone** — la correction n'atteint jamais
l'utilisateur.

Règle : **à chaque livraison qui touche `gm-specs.js` (ou tout fichier caché),
incrémenter conjointement :**
1. `VERSION_MODULE` dans `gm-specs.js` (ligne ~22).
2. `VERSION` (`"garage-v…"`) dans `sw.js` (ligne ~12).

Ces deux numéros sont **tenus synchronisés** (au 22/09/2026 : `gm-specs.js` →
`20.128.0`, `sw.js` → `garage-v20.128.0`). `VERSION_MODULE` s'affiche en outre
dans l'UI via `grefferVersion()`, ce qui permet de vérifier de visu quelle version
tourne réellement sur l'appareil.

> ℹ️ `APP_VERSION` dans `index.html` (aujourd'hui `3.2.0`) est un **repère produit
> distinct** ; il se bump aux MAJ notables, mais ce n'est **pas** lui qui invalide
> le cache. Le déclencheur de rafraîchissement, c'est `VERSION` dans `sw.js`.

Fichiers **hors cache** (toujours frais, pas de bump nécessaire) : les bancs et
fichiers de travail, filtrés par `HORS_CACHE` dans `sw.js`
(`/banc[-.]/`, `/test[-.]/`, `/apercu[-.]/`) — d'où `banc-v1.html`. Les modules
`gm-*.js` sont servis **réseau-d'abord** (`FRAIS`), avec le cache en repli
hors-ligne uniquement.

---

## 5 bis. Le banc d'audit des données — `node banc-audit.js`

Contrôle structurel du catalogue, exécuté hors navigateur (DOM simulé). Il charge
`gm-specs.js` réellement, donc il audite le catalogue **fusionné tel que l'app le
voit**, pas une lecture statique du texte. Il sort en code non nul sur ERREUR :
utilisable comme garde avant commit.

Ce qu'il attrape, et que ni l'œil ni `node --check` ne voient :

| Contrôle | Pourquoi il existe |
|---|---|
| **Clés dupliquées** (scan de la source) | En JS, une clé répétée dans un littéral d'objet est **écrasée en silence**. 50 cas trouvés au premier passage, dont `GENS['audi-rs3']` dont la version détaillée disparaissait au profit d'une version appauvrie. Indétectable après chargement : le doublon est déjà absorbé. |
| **Doublons visibles** (libellé catalogue, nom de fiche) | Deux entrées d'**ID différents** peuvent désigner la même voiture : elles passent tous les contrôles techniques et apparaissent pourtant deux fois dans la grille — donc se collectionnent deux fois. 3 cas trouvés (RS2 Avant, C 43, Ami). |
| **Contamination copie-voisine** | Le motif des bugs Giulia/Quadrifoglio et M2 CS/M4 CSL : deux fiches adjacentes aux chiffres identiques. |
| **`MAP` orphelines** | Correspondance pointant vers une fiche ou un id inexistant → fiche technique muette. |
| **Fiches `SPECS` inatteignables** | `ficheHTML()` résout par `MAP[idCatalogue]` **strictement** — il n'y a **aucun repli** sur `SPECS[idCatalogue]`. Une fiche qu'aucune entrée `MAP` ne désigne est donc écrite, versionnée, relue… et **jamais affichée**, sans le moindre signal. 19 fiches étaient dans ce cas, dont celle de la Mégane R.S. Trophy-R alors que la voiture figurait bien au catalogue : il manquait une seule ligne dans `MAP`. |
| **Blocs `GENS` morts** | Même angle mort pour les générations, mais par l'autre bout : `gensHTML()` lit `GENS[idCatalogue]` directement. Un bloc rangé sous un id qui n'est pas au catalogue n'est jamais affiché. 3 cas trouvés, tous issus de doublons retirés par `DOUBLONS_A_RETIRER` — leurs générations restaient attachées à l'id supprimé, et la up! GTI s'affichait sans les siennes. |
| **Champs manquants / hors plage** | Complétude par champ, et incohérences d'ordre de grandeur. |
| **Divergences `CARS` / `CATALOGUE_PLUS`** | Un id déclaré des deux côtés : `CARS` fait autorité, l'autre déclaration est **perdue en silence**. |

**Calibrage :** les bornes de plausibilité sont volontairement larges, calées sur
les extrêmes **réels** du catalogue (Top Fuel 11 000 ch, Hummer EV 4 100 kg,
Citroën Ami 8 ch). Un banc qui crie au loup finit ignoré — ne les resserre pas
sans vérifier la fiche incriminée.

### ⚠️ La sortie du banc se vérifie cas par cas avant d'être appliquée

Les contrôles qui **apparient** des données (GENS ↔ MOTOR_SPECS, contamination
entre voisines) reposent sur une heuristique. Une heuristique se trompe, et
appliquer sa sortie en lot **fabrique des erreurs au lieu d'en corriger**.

C'est arrivé : la première version du contrôle GENS ↔ MOTOR_SPECS comparait les
puissances d'un modèle **sans vérifier qu'il s'agissait du même moteur**. Sa
liste de 12 « divergences » appliquée telle quelle a cassé **6 valeurs justes** —
le 462 ch de la 996 GT2 remplacé par celui de la 992 Carrera S, le 103 ch de la
205 Rallye par celui de la GTI 1.6, le 180 ch de l'Octavia RS essence par celui
du TDI diesel. Toutes ont dû être rétablies.

**Le réflexe :**
1. Avant d'appliquer une liste du banc, **ouvrir chaque ligne visée** et vérifier
   que la valeur appartient bien à la motorisation que le contrôle croit viser.
2. Corriger d'abord **le détecteur**, ensuite les données. Ici l'appariement se
   fait désormais sur la **cylindrée**, ce qui supprime la classe entière de faux
   positifs.
3. **Tester que le détecteur détecte encore** après l'avoir resserré : réintroduire
   volontairement une divergence sur une copie et vérifier qu'elle remonte. Un
   contrôle trop strict affiche « 0 anomalie » en ne voyant plus rien — le pire
   des deux mondes, parce qu'il rassure.

### Exempter plutôt que relâcher

Quand un contrôle signale un cas **légitime**, la tentation est d'assouplir son
seuil. C'est le geste à ne pas faire : il rend le contrôle aveugle à *toute* la
classe de défauts qu'il existait pour attraper.

La bonne réponse est une **liste d'exemptions nominative et justifiée**
(`JUMELLES_AVEREES` dans `banc-audit.js`). Chaque entrée cite sa raison, donc
elle est relisable et contestable ; et le contrôle reste entier pour tous les
autres cas.

> Exemple : le Porsche 718 Cayman **est** un 718 Boxster à toit fixe — même
> plateforme MSB, même flat-4, et Porsche homologue les deux à la même masse
> DIN. Le contrôle « contamination copie-voisine » ne peut pas, par
> construction, distinguer ça d'un copier-coller raté. On nomme la paire ;
> on ne baisse pas le seuil.

Une liste d'exemptions sans justification écrite redevient un tapis sous lequel
on glisse les vrais défauts — la justification *est* le garde-fou.

Préfixé `banc-` : jamais mis en cache par `sw.js` (`HORS_CACHE`), donc sa
modification n'impose aucun bump de version.

## 6. Checklist avant livraison

1. **Patch ciblé, pas de réécriture.** `git diff` ne montre que le changement
   voulu, aucun reformatage parasite (§1.3).
2. **Aucune dépendance ajoutée**, aucun secret côté client (§1.2, §1.5).
3. **Accès inter-modules via `window.GMSpecs`** uniquement, jamais les noms
   privés (§2.1).
4. **Existence catalogue vérifiée sur `CARS` ET `CATALOGUE_PLUS`** (§2.3).
5. **Contrat DOM respecté** : verrou étanche, chiffres suivant la variante active,
   pas de bloc dupliqué (§3).
6. **Données sourcées** : `flou` renseigné pour l'incertain, `nc` non maquillé,
   couple cumulé pour les hybrides, règle GTA appliquée (§4).
7. **`VERSION_MODULE` + `sw.js VERSION` incrémentés et synchronisés** (§5).
8. **`node banc-audit.js` repasse à 0 erreur** (§5 bis) — obligatoire dès qu'on
   touche aux données. C'est la garde mécanique contre les doublons silencieux,
   les correspondances mortes et la contamination entre fiches voisines.
9. **Vérification comportementale, pas seulement syntaxique** : `node --check`
   ne prouve rien sur le câblage DOM. Un test d'exécution réelle (banc Playwright
   qui écrit des spots dans IndexedDB, ouvre les fiches, lit le DOM) est
   obligatoire pour toute modification de la greffe ou du contrat inter-modules.

---

## 7. Fichiers du dépôt (repères)

| Fichier | Nature |
|---|---|
| `index.html` | Application complète + catalogue `CARS` — patchs ciblés |
| `gm-specs.js` | Module fiches techniques (IIFE, `window.GMSpecs`) |
| `sw.js` | Service worker (cache, `VERSION`) |
| `manifest.webmanifest` | Manifeste PWA |
| `ai-relay-worker.js` | Relais IA Cloudflare — déployé **à part**, hors dossier statique |
| `banc-v1.html` | ⚠️ **Contient le prototype complet du « Rouleau »** (~737 lignes), pas un simple banc jetable — voir §9. Hors cache, ne pas livrer comme app, **et ne jamais supprimer** |
| `index-1.html` | Ancienne copie de travail d'`index.html` — **non servie**, ne pas confondre avec le fichier de prod |
| `CONTEXT.md` | État projet, décisions, journal des chantiers (le *pourquoi*) |
| `README.md` | Documentation utilisateur/fonctionnelle (le *quoi*) |
| `*.png` | Icônes PWA |

---

## 8 bis. « Le Rouleau » — prototype vivant dans `banc-v1.html`

> ⚠️ **Ne conclus pas qu'il n'existe pas parce que `gm-rouleau.js` est absent
> du dépôt.** L'erreur a déjà été commise : un `grep` sur `index.html` seul
> ne trouve rien, et on en déduit à tort que le module vient d'un autre
> projet. Le Rouleau existe, **entier**, embarqué dans `banc-v1.html`.

**État réel, à jour :**

| Où | Quoi |
|---|---|
| `banc-v1.html` | Le module complet (~737 lignes), IIFE exposant `window.GMRouleau`, v1.0.0 |
| Application principale | **Non intégré.** `index.html` ne le charge pas et ne le connaît pas |
| `gm-rouleau.js` | **N'existe pas encore** comme fichier autonome |

**Ce que le prototype porte déjà**, et qu'il ne faut surtout pas réécrire de
zéro : pellicule persistée en **IndexedDB dédiée** (`gm-rouleau` / store
`pellicule`, base séparée — aucun contact avec le store `spots`), Blob stocké
nativement plutôt qu'en base64 (+33 % de volume évités), machine à quatre
états (`latent` → `encours` → `revele` / `echec`), reprise des `encours`
orphelins après fermeture brutale, back-off exponentiel avec gigue,
**disjoncteur** après 3 échecs réseau, concurrence bornée, Background Sync,
purge à 7 jours, et détection des **jumelles d'une rafale** par hachage
perceptuel (dHash + écart chromatique), avec des seuils calibrés au banc et
la justification de leur asymétrie écrite en commentaire.

**Point de branchement prévu par le prototype lui-même :**

```
init({ identify, onRevele, onChange, onErreur, conteneur })
   └── onRevele(item)  ← « c'est là que tu branches matchCatalog() »
```

⚠️ À l'intégration, `onRevele` doit appeler **`window.GMMatcher.rapprocher()`**
et non `matchCatalog()` : ce dernier est désormais le repli, pas le chemin
nominal (voir §8 ter).

**Règle de travail :** `banc-v1.html` n'est pas un fichier jetable. Ne pas le
supprimer, ne pas le « nettoyer », ne pas reconstruire le Rouleau ailleurs.
L'extraction vers `gm-rouleau.js` puis l'intégration à `index.html` est un
**chantier séparé**, à mener sans perdre les mécanismes ci-dessus.

---

## 8 ter. `gm-matcher.js` — rapprochement IA → catalogue

Sorti d'`index.html` parce que `matchCatalog()` confondait trois grandeurs en
un seul nombre : la confiance de l'IA, la ressemblance textuelle au catalogue,
et la confiance affichée. Les mélanger empêche de répondre à la seule question
qui compte à la capture : **proposer une voiture, ou demander à l'utilisateur
de choisir ?**

`window.GMMatcher.rapprocher(devinettes, { catalogue })` renvoie :

```
{ statut: 'CONFIRME' | 'AMBIGU' | 'AUCUNE_CORRESPONDANCE_SURE',
  candidats: [{ id, brand, model, aiConfidence, catalogScore, finalConfidence, source }],
  marge, raison }
```

- **Le catalogue est injecté en paramètre**, jamais lu d'un global : c'est ce
  qui rend le module testable hors navigateur (`node banc-matcher.js`).
- **`AUCUNE_CORRESPONDANCE_SURE` est un résultat normal**, pas une panne. Une
  voiture hors catalogue DOIT le produire. Un matcher qui renvoie toujours
  quelque chose transforme chaque inconnue en faux positif silencieux, et
  l'utilisateur collectionne une voiture qu'il n'a pas vue.
- **La marge décide, pas la confiance absolue.** Deux candidats à 0,70 et 0,69
  sont ambigus même si les deux scores sont élevés.
- **`identifyCar()` garde `matchCatalog()` en repli** : les modules `gm-*.js`
  sont servis réseau-d'abord, donc `gm-matcher.js` peut manquer au premier
  lancement hors ligne. Sans repli, photographier ne renverrait rien.
  Le résultat complet est lisible via `lastMatch`.

Banc : `node banc-matcher.js`, 17 tests sur le catalogue **fusionné** (1 070),
sortie en code non nul si échec. Préfixé `banc-`, donc hors cache.

---

## 8 quater. `GMSpecs.fichePourInterface()` — contrat de DONNÉES

`blocHTML()` renvoie du **HTML déjà mis en forme** : parfait pour se greffer
dans l'app existante, inutilisable pour bâtir une interface différente.

`fichePourInterface(idCatalogue, { typeId, variantId })` renvoie les mêmes
informations en **données brutes** : `catalogue`, `modele`, `motorisations[]`,
`technique`, `derives`, `flou[]`, `rareteFiche`, `generations`, `signature`.

> ⚠️ **Le piège des deux raretés.** `catalogue.rarete` est celle du **jeu**
> (6 paliers, saisie manuelle, pilote les points et la couleur de la tuile) :
> c'est **celle-ci qu'on affiche**. `rareteFiche` est dérivée du **volume de
> production** et sert à caractériser la voiture dans la fiche technique ;
> elle vaut `null` dès que `prod` est inconnu — le cas de la majorité des
> modèles de grande diffusion. Les afficher l'une pour l'autre produit une
> fiche qui **contredit sa propre grille**. (Alfa Giulia : `peucommun` au jeu,
> `rareteFiche` à `null`.)

Le bloc `catalogue` (`brand`, `model`, `yr`, `c`, `cat`, `rarete`) existe parce
que `SPECS` ne porte qu'un `nom` complet et un `pays` en toutes lettres : ni
marque seule, ni drapeau, ni catégorie, ni rareté de jeu. Sans lui, une
interface va chercher l'en-tête dans `CARS` elle-même — et oublie
`CATALOGUE_PLUS` (§2.3).

**Pourquoi elle est nécessaire.** Sans elle, une interface tierce devrait lire
`MOTOR_SPECS` elle-même puis **refaire la fusion modèle ↔ variante**. Or cette
fusion s'est déjà trompée en production (Giulia Diesel affichant le couple de
la 2.0 essence, M4 CS avec la masse de la G82). Dupliquer cette logique, c'est
garantir qu'une des deux copies divergera. La fonction applique donc la fusion
au seul endroit où elle est écrite.

Garde-fou : un `choix` qui ne correspond à aucune variante renvoie
`choix: null` et les chiffres du modèle — l'interface peut détecter l'écart
au lieu d'afficher, sans le savoir, les chiffres d'une autre voiture.
Le retour est une copie profonde : le muter n'altère pas `MOTOR_SPECS`.

---

## 9. Rétro-ingénierie — pourquoi ces règles, et pas d'autres

Pour pouvoir défendre et maintenir ce projet, voici la logique derrière les choix
les moins évidents :

- **Pourquoi une IIFE avec une seule fuite globale (`window.GMSpecs`) ?** Parce
  qu'un fichier de 14 700 lignes qui polluerait le scope global multiplierait les
  collisions de noms avec `index.html` (qui définit lui aussi `CARS`, `MAP`-like,
  etc.). L'IIFE crée une frontière nette : *tout est privé sauf le contrat
  explicite*. Le prix à payer — impossible de lire `MOTOR_SPECS` directement — est
  exactement la garantie qu'on veut : on ne peut coupler les deux fichiers que par
  l'API publique, jamais par accident.

- **Pourquoi interdire la réécriture globale d'`index.html` ?** Parce que le seul
  outil d'audit de ce projet est le `diff` git. Un reformatage global rend le diff
  illisible et noie les vrais changements ; c'est aussi comme ça qu'on reperd des
  correctifs ponctuels durement gagnés. La discipline du patch ciblé *est* la
  stratégie de qualité, en l'absence de tests unitaires exhaustifs.

- **Pourquoi dériver les ratios et la rareté-production au lieu de les stocker ?**
  Parce qu'une valeur dérivée stockée devient fausse dès que sa source change, et
  personne ne s'en aperçoit. Une fonction pure recalculée à l'affichage ne peut
  pas désynchroniser. C'est le même principe que `computeStats` côté `index.html`,
  qui recalcule tout depuis `spots` plutôt que de dupliquer un état.

- **Pourquoi le contrat DOM par `data-*` plutôt qu'un appel de fonction direct ?**
  Parce que `gm-specs.js` est chargé réseau-d'abord et peut arriver *après* le
  rendu d'`index.html`. Un contrat par attributs DOM + `MutationObserver` est
  résilient à l'ordre de chargement : le module se greffe quand le DOM est prêt,
  sans que `index.html` ait à connaître son existence. C'est de l'inversion de
  dépendance — le même patron que le point de branchement IA
  (`identifyCar` / `matchCatalog`).

- **Pourquoi `flou`/`nc`/couple cumulé sont des règles et non des détails ?**
  Parce que la valeur d'un catalogue automobile, c'est la **confiance** dans ses
  chiffres. Un seul chiffre inventé qui passe pour ferme détruit cette confiance
  rétroactivement sur toute la base. Annoncer l'incertitude (`≈`), assumer le non-
  communiqué (`nc`) et respecter la convention constructeur (couple cumulé) est ce
  qui distingue une base sérieuse d'une compilation approximative.
