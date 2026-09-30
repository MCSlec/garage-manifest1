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

**Bibliothèques tierces : Leaflet et protomaps-leaflet (carte), HÉBERGÉES DANS LE DÉPÔT** —
Leaflet :
`vendor/leaflet/`, v1.9.4 tirée du registre npm, licence BSD-2 jointe. Jusqu'au
29/09 elle était chargée depuis cdnjs sans contrôle d'intégrité : un CDN
compromis aurait exécuté son code dans l'app, et la carte ne s'affichait pas
hors ligne. **Jamais de CDN** : une bibliothèque indispensable se copie dans
`vendor/`, se met en cache (`EXTRAS` de `sw.js`) et se teste (`banc-carte.js`).
Les **tuiles** de la carte (images OpenStreetMap) restent externes tant que
`CARTE_URL` est vide.

**Carte à nous** (`cloud/CARTE.md`) : `protomaps-leaflet` 5.1.0 (npm, BSD-3,
`vendor/protomaps-leaflet/`, licences des composants embarqués jointes) dessine
un fichier PMTiles posé sur **notre** stockage R2, lu par requêtes Range. Dès
que `CARTE_URL` est renseignée : **zéro requête tierce, y compris en cas
d'échec** — jamais de repli silencieux vers OpenStreetMap. L'attribution
« © OpenStreetMap » reste affichée : c'est la licence ODbL des **données**,
indépendante de l'hébergeur. Banc : `banc-carte-perso.js`.

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
  (Seule exception, voulue : `gm-compte.js` garde son **jeton de session** dans
  `localStorage` — une préférence d'appareil, pas une donnée de collection.)
- **Service worker** (`sw.js`) pour l'installabilité et la consultation hors-ligne.

### 1.5 — Aucun secret côté client
La reconnaissance photo passe par un relais **Cloudflare Workers**
(`ai-relay-worker.js`, déployé à part). La clé du modèle ne doit **jamais** vivre
dans le navigateur. Le client envoie `POST {image: dataURL}` et reçoit
`[{brand, model, confidence}]` ; le rapprochement catalogue se fait **côté client**
dans `index.html` (`matchCatalog`).

**Protections du relais** (29/09, `banc-relais.js`) : l'adresse du relais est
publique, **CORS n'est pas une protection** (un script n'envoie pas d'Origin).
Ce qui protège la facture : des **quotas dans D1** pris d'un bloc — par appareil
sans compte, par compte connecté, et pour tout le service (`QUOTA_IA_*`) —,
une image ≤ 2 Mo en JPEG/PNG/WebP, une **route unique** (`POST /`), aucune erreur
détaillée renvoyée, et **503 sans base D1** (jamais de relais ouvert). Aucun
compte n'est exigé pour capturer. Côté app, le jeton de session n'est envoyé
**qu'au relais officiel** (`AI_ENDPOINT_DEFAULT`), jamais à un relais
personnalisé. `/notify` n'existe plus.

**Fournisseur au choix** (30/09) : `IA_FOURNISSEUR` = `anthropic` (défaut) ou
`gemini` ; `IA_SECOURS` facultatif, appelé **seulement** si le premier échoue —
jamais de secours implicite (dépense surprise). Même prompt, mêmes quotas, même
contrat de réponse : un nouveau fournisseur s'ajoute comme une entrée de
`FOURNISSEURS` (clé en **en-tête**, jamais dans l'URL), et `banc-relais.js`
repasse. Une erreur de configuration refuse **avant** de consommer un quota.

Même règle pour les **comptes** (§8 quinquies) : le serveur `cloud/compte-worker.js`
se déploie à part ; la clé d'envoi d'e-mails (`RESEND_API_KEY`) est un secret du
Worker. Le navigateur ne porte que l'adresse publique du Worker (`COMPTE_URL`) et
un jeton de session propre à l'utilisateur.

> ℹ️ **« Aucun serveur » (§0) reste vrai pour l'app** : elle fonctionne entière
> sans compte. Les deux Workers sont des services **facultatifs** ; l'app ne doit
> jamais dépendre de leur disponibilité pour afficher, capturer ou collectionner.

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

### 2.4 — Retirer une entrée = déclarer une fusion (INVARIANT)
Un id retiré du catalogue **ne supprime pas** les prises enregistrées sous cet
id : elles restent dans IndexedDB, mais `init()` ne charge que les ids connus
(`CARS_BY_ID[rec.carId]`). La voiture disparaît donc de la collection du joueur,
**sans message**. Ce défaut a touché les 21 doublons retirés avant le 28/09.

- **Le seul moyen de retirer un id est `FUSIONS`** (gm-specs.js) :
  `'id-retire': { vers:'id-conserve', declinaison:'…' }`. `DOUBLONS_A_RETIRER`
  en est **dérivé** — on ne peut plus retirer sans dire où va la collection.
- `declinaison` (facultatif) est le libellé **exact** d'une case de
  `VARIANTS[vers]` : quand l'entrée retirée désignait une génération
  (« Celica GT-Four (ST185) »), le joueur la retrouve cochée.
- **La migration vit dans `index.html`** (`fusionVers` / `fusionnerPrise`,
  appelées au démarrage et à l'import), via `window.GMSpecs.fusionDe()`.
  La prise conservée fait autorité (date, lieu, couverture) ; l'autre apporte
  photos, note et déclinaisons. Idempotente : relancée, elle ne double rien.
- **Fusionner plutôt que supprimer.** Deux entrées qui décrivent la même voiture
  deviennent une entrée + une **génération** (`GENS`, donc une case de
  déclinaison) ou une **motorisation** (`MOTOR_SPECS`), selon la règle GTA.
- Contrôles : `banc-audit.js` (cible existante, déclinaison existante) et
  `banc-fusions.js` (migration réelle dans Chromium + IndexedDB, 19 tests).

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
| `[data-car-id]` | `index.html`, sur `.detail-shell` | `greffer()` | L'**id** de la voiture affichée. Remplace la résolution par le texte du titre, qui greffait la fiche d'une voiture du catalogue sur une « Non classé » homonyme. Sur un id `custom:` → **aucune fiche**. Le titre reste un repli pour un `index.html` plus ancien encore en cache. |
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

**L'incertitude se propage aux ratios.** Un ratio (`DERIVES`) hérite du « ≈ » de
ses entrées, déclarées dans `DERIVES[x].dep` : une masse approximative rend
approximatifs kg/ch, ch/t et kg/Nm, mais pas ch/L. `estFlou()` porte la règle, et
`fichePourInterface().flou` renvoie la même liste que l'écran. Avant le 28/09, les
ratios mis en avant en haut de fiche s'affichaient fermes sur une masse « ≈ ».
Les variantes `MOTOR_SPECS` portent leur propre `flou`, que la fiche respecte.

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

**Hybrides Honda e:HEV (i-MMD)** : le moteur électrique de traction entraîne
seul les roues, sauf en prise directe du thermique à vitesse stabilisée. Honda
publie la puissance et le couple de ce moteur : on les reprend (Civic 315 Nm,
Jazz 253 Nm, CR-V 335 Nm), puissance et couple venant du même moteur, donc de
la même norme. Ne jamais y substituer le couple du seul thermique.

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
- **Sélecteurs rattachés à la bonne entrée** (28/09) : celui de la 205 (GTI seules) → 205 GTI ; celui de la 504 (coupé/cabriolet) → 504 Coupé ; celui de la Xantia (Activa seules) → Xantia Activa ; Rallye 1.3 retirée de la 106 → 106 Rallye, désormais en deux phases (1.3 / 1.6).
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

Ces deux numéros sont **tenus synchronisés** (au 30/09/2026 : `gm-specs.js` →
`20.195.0`, `sw.js` → `garage-v20.195.0`). `VERSION_MODULE` s'affiche en outre
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
| **`FUSIONS`** | Une fusion dont la cible n'est pas au catalogue rend les prises du joueur invisibles ; une `declinaison` mal orthographiée coche une case qui n'existe pas. Vérifié par mutation : les deux fautes, et un retrait abusif, remontent en ERREUR. |
| **Jumelles à distance** | Le contrôle « copie-voisine » ne compare que des fiches **adjacentes**. Étendu à toutes les paires, il a trouvé 30 groupes de fiches identiques au chiffre près (ch, Nm, L, kg). La majorité suivait un seul motif : une entrée **courante** (CLA, A3, Octavia, Polo, Panamera, X5, TT, Tiguan, Série 1…) affichait les chiffres de sa **version sportive**, qui a pourtant sa propre entrée — la règle GTA (§4.5 bis) violée en silence, avec des ratios faux et une rareté perçue absurde. Les vraies jumelles (Aygo/C1, Berlingo/Partner, ID.4/Enyaq) sont nommées dans `JUMELLES_AVEREES`, avec leur justification. |
| **Champs manquants / hors plage** | Complétude par champ, et incohérences d'ordre de grandeur. |
| **Règle GTA dans les sélecteurs** | Une variante `MOTOR_SPECS` dont le libellé nomme une déclinaison qui a **sa propre entrée** (même marque, modèle qui prolonge celui de base : « 206 » → « 206 RC ») doit sortir du sélecteur de base (§4.5). Le commentaire annonçant ce contrôle existait **sans code** : il a laissé passer la 206 RC, les 106 Rallye / GTI, les Xantia Activa et un sélecteur de 205 qui ne contenait **que** des GTI. Vérifié par mutation. |
| **Hybrides Toyota / Lexus sans couple** | La règle §4.4 (aucun couple système sur un HSD) était écrite mais pas contrôlée : la Corolla l'enfreignait sur sa fiche **et** deux variantes (dont une note affirmant « couple cumulé »), la Century aussi — c'était le couple du seul thermique. Toute fiche ou variante hybride Toyota/Lexus (hors Course) portant un `nm` remonte. Vérifié par mutation. |
| **Marque en double** | Une marque écrite de deux façons (« MINI » / « Mini ») apparaît deux fois dans le filtre et échappe aux listes comparées à l'identique : la liste premium disait `'Mini'`, et la Cooper « commun » passait « courant » à l'exécution. Comparaison sans casse, accents ni ponctuation → ERREUR. Vérifié par mutation. |
| **`INFO` ↔ `SPECS`** | `index.html` affiche en **première page** une puissance (`INFO`) indépendante de celle de la fiche technique greffée (`SPECS`). Sans sélecteur, le joueur voit les deux : elles doivent se recouvrir (± 7 % autour de la plage d'`INFO`). 35 écarts au premier passage, tous tranchés sur source le 29/09 — le plus souvent une fiche décrivant **une autre version** que l'entrée (EB110 Super Sport, Phaeton W12, RS200 routière pour une entrée « Course »). Vérifié par mutation. |
| **Divergences `CARS` / `CATALOGUE_PLUS`** | Un id déclaré des deux côtés : `CARS` fait autorité, l'autre déclaration est **perdue en silence**. |
| **Fiche ↔ variante** | La fiche `SPECS` et une variante `MOTOR_SPECS` qui décrivent le **même moteur** (appariées sur la cylindrée ± 60 cm³ **et** la puissance ± 6 ch) doivent afficher les mêmes chiffres, sinon le joueur lit deux valeurs selon qu'il a touché au sélecteur. 25 cas au premier passage (206 : 111 / 120 Nm ; C6 : 240 ch avec la cylindrée du 2.7 ; MR2 : 1 100 / 1 270 kg). Un champ `flou` d'un côté est ignoré (l'écart est annoncé). Exemptions nominatives : `MEME_MOTEUR_AUTRE_GENERATION`. Vérifié par mutation. |

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
   Si un id est retiré : il passe par `FUSIONS`, et `banc-fusions.js` repasse (§2.4).
9. **Vérification comportementale, pas seulement syntaxique** : `node --check`
   ne prouve rien sur le câblage DOM. Un test d'exécution réelle (banc Playwright
   qui écrit des spots dans IndexedDB, ouvre les fiches, lit le DOM) est
   obligatoire pour toute modification de la greffe ou du contrat inter-modules.
10. **Comptes** : toute modification de `gm-compte.js`, `cloud/` ou du contrat
    `GMGarage` repasse `banc-compte.js` **et** `banc-compte-navigateur.js` ;
    un changement de collecte met à jour `cloud/CONFIDENTIALITE.md` (§8 quinquies).

---

## 7. Fichiers du dépôt (repères)

| Fichier | Nature |
|---|---|
| `index.html` | Application complète + catalogue `CARS` — patchs ciblés |
| `gm-specs.js` | Module fiches techniques (IIFE, `window.GMSpecs`) |
| `sw.js` | Service worker (cache, `VERSION`) |
| `manifest.webmanifest` | Manifeste PWA |
| `ai-relay-worker.js` | Relais IA Cloudflare — déployé **à part**, hors dossier statique |
| `banc-v1.html` | ⚠️ **Contient le prototype complet du « Rouleau »** (~737 lignes), pas un simple banc jetable — voir §8 bis. Hors cache, ne pas livrer comme app, **et ne jamais supprimer** |
| `gm-rouleau.js` | Le Rouleau extrait (§8 bis), non intégré ; banc `banc-rouleau.js` |
| `gm-compte.js` | Compte par e-mail + sauvegarde cloud (§8 quinquies). **En sommeil** tant que `COMPTE_URL` est vide |
| `cloud/` | Serveur de comptes — déployé **à part** : `compte-worker.js`, `schema.sql`, `wrangler.toml.exemple`, `DEPLOIEMENT.md`, `CONFIDENTIALITE.md` (projet RGPD, à maintenir dans le même commit que tout changement de collecte) |
| `banc-compte.js` / `banc-compte-navigateur.js` | Bancs du serveur (Worker réel, D1/R2 simulés) et de bout en bout (app + Worker dans Chromium) |
| `vendor/leaflet/` | Leaflet 1.9.4 hébergé dans le dépôt (§1.2) ; banc `banc-carte.js` : aucun script ni style chargé depuis un autre domaine |
| `vendor/protomaps-leaflet/` | Moteur de rendu de **notre** carte (§1.2), chargé seulement si `CARTE_URL` est renseignée ; banc `banc-carte-perso.js` (fabrique une vraie archive PMTiles) ; guide `cloud/CARTE.md` |
| `banc-relais.js` | Banc serveur du relais IA : quotas (dont rafale simultanée), taille/format d'image, origine, route unique, erreurs sans détail, fermeture sans D1 |
| `banc-p0.js` | Banc navigateur du parcours **capture → révélation** (`design/SPEC-P0-*.md`) : analyse visible, écran selon le statut du matcher (sûr / ambigu / pistes faibles / rien / erreurs nommées), résultat tardif ignoré, révélation sans confettis en 3 paliers toujours sombre, « Ce que ça débloque » aux vrais compteurs, lot compact + bilan, mouvement réduit. `node banc-p0.js <dossier>` enregistre les captures |
| `banc-photos.js` | Banc navigateur des limites de photos : plafond par rareté (`PHOTOS_PAR_RARETE`), taille par photo, recompression des anciennes photos (`GMGarage.normaliserPhotos`), suppression d'une photo et non-résurrection à la fusion cloud (pierres tombales) |
| `banc-imports.js` | Banc navigateur des **fichiers importés hostiles** (sauvegarde, profil d'équipage) : aucune charge ne doit s'exécuter, à l'import comme au redémarrage (DT-09, DT-10) ; contrat `data-car-id` |
| `AUDIT-DEFAUTS.md` | Rapport de la chasse aux défauts du 29/09 : corrigé, et reste à décider |
| `banc-i18n.js` → `I18N.md` | Recensement des textes d'interface (préparation i18n). `I18N.md` est **généré** : relancer `node banc-i18n.js --md`, ne jamais l'éditer à la main |
| `index-1.html` | Ancienne copie de travail d'`index.html` — **non servie**, ne pas confondre avec le fichier de prod |
| `DESIGN.md` + `design/` | **Direction visuelle de référence** (brief du propriétaire du 30/09, maquette de la fiche Giulia) et écarts maquette ↔ données. À lire **avant** toute interface. La maquette n'est **pas** une source de données |
| `CONTEXT.md` | État projet, décisions, journal des chantiers (le *pourquoi*) |
| `RESTE-A-FAIRE.md` | Ce que **seul l'humain** peut faire (comptes, paiements, mentions légales, décisions). **À tenir à jour à chaque livraison** : ajouter ce qu'une livraison lui demande, retirer ce qui est fait |
| `README.md` | Documentation utilisateur/fonctionnelle (le *quoi*) |
| `.claude/hooks/session-start.sh` + `.claude/settings.json` | Hook de démarrage des sessions **cloud** : installe `playwright-core` 1.63.0 (version figée) dans `.claude/outils-bancs/` (ignoré par git, **jamais** à la racine — l'app reste sans dépendance) et exporte `NODE_PATH` / `CHROMIUM`. Les bancs navigateur tournent dès l'ouverture de la session, sans rien installer à la main. Idempotent ; inactif en local |
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
| `gm-rouleau.js` | **Le module de référence depuis le 28/09** : extrait de `banc-v1.html` au caractère près, puis une seule correction (v1.0.1, voir plus bas). IIFE exposant `window.GMRouleau` |
| `banc-v1.html` | Le prototype d'origine (v1.0.0), **conservé tel quel** : ne pas le supprimer ni le « nettoyer ». Il ne reçoit plus les corrections : c'est `gm-rouleau.js` qui évolue |
| `banc-rouleau.js` | Banc Playwright, 19 tests : rafale, voitures distinctes, même forme autre couleur, hors-ligne, retour réseau, back-off, disjoncteur, erreur applicative, fermeture brutale, persistance, purge à 7 jours, dissociation |
| Application principale | **Non intégré.** `index.html` ne le charge pas et ne le connaît pas ; aucun cache concerné |

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

**Correction v1.0.1, trouvée par le banc.** `estErreurReseau()` testait
`includes('5')` : tout message contenant le chiffre 5 passait pour une panne
réseau. Une erreur 400 « 25 Mo maximum » ouvrait donc le disjoncteur et gelait
toute la pellicule, service pourtant sain. Ne comptent plus comme réseau que
`TypeError` (fetch rejeté), délai dépassé, 429 et 5xx.

**Règle de travail :** `banc-v1.html` n'est pas un fichier jetable. Ne pas le
supprimer, ne pas le « nettoyer », ne pas reconstruire le Rouleau ailleurs.
L'extraction vers `gm-rouleau.js` est faite ; l'**intégration** à `index.html`
reste un chantier séparé, qui touche l'écran de capture et attend une décision
de design. `banc-rouleau.js` doit repasser avant tout branchement.

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

## 8 quinquies. Comptes et sauvegarde cloud — `gm-compte.js` + `cloud/`

Connexion par **code à 6 chiffres reçu par e-mail** (sans mot de passe, donc
sans « mot de passe oublié »), sauvegarde et
restauration du garage entre appareils. Guide : `cloud/DEPLOIEMENT.md`.

**Contrat côté app : `window.GMGarage`** (posé par `index.html`, gelé) :

```
GMGarage.exporter()                   → { app, version, spots, meta, custom }  (= fichier d'export)
GMGarage.importer(data, { fusion })   → { n, rejected }
GMGarage.normaliserPhotos()           → nombre de photos recompressées
GMGarage.supprimerPhoto(src, { confirmer }) → { ok } | { ok:false, raison:'derniere'|'annule'|'introuvable' }
```

- `gm-compte.js` **ne touche jamais** à IndexedDB ni à `state` : tout passe par
  ce contrat. Une restauration cloud traverse donc **exactement les mêmes
  filtres** qu'un fichier importé (DT-02, DT-03, DT-09, DT-10) — une sauvegarde
  cloud n'est pas plus digne de confiance qu'un fichier reçu.
- `fusion:true` fusionne prise par prise (`fusionnerPrise`, la locale fait
  autorité) et garde pseudo, amis et fil locaux ; sans `fusion`, comportement
  historique de l'import.
- `exporter()` vide `meta.ai` : l'adresse du relais IA ne quitte pas l'appareil.

**Invariants du serveur**, chacun couvert par `banc-compte.js` :

| Invariant | Pourquoi |
|---|---|
| Code stocké en **HMAC** (`CODE_SECRET`), session en SHA-256 ; jamais en clair | Un code n'a que 10⁶ valeurs : une simple empreinte se retrouverait hors ligne en un million d'essais. Sans `CODE_SECRET`, le Worker refuse (500) |
| **5 essais par code**, comptés par un `UPDATE … WHERE essais < 5` **avant** la comparaison ; un seul code actif par adresse ; 10 codes/jour/adresse | La sécurité d'un code court tient au nombre d'essais, pas à sa longueur : ≤ 50 essais/jour → 1 chance sur 20 000. Vérifié en rafale de 30 requêtes simultanées |
| Code consommé par un `DELETE` **atomique** ; tirage uniforme (rejet) | Deux envois simultanés n'ouvrent qu'une session ; aucun code favorisé |
| Réponse identique à `/auth/code` que le compte existe ou non | Impossible de sonder qui est inscrit |
| `PUT /garage` exige `If-Match` (428 sinon), 409 si la version a bougé | Deux appareils ne s'écrasent jamais en silence ; le client restaure en fusion puis renvoie |
| Photo refusée si son contenu ne correspond pas à son empreinte | Personne ne peut substituer une photo à une autre |
| Clés du limiteur de débit **hachées** ; purge nocturne (`scheduled`) de l'échu | Minimisation RGPD : ni IP ni adresse d'un non-inscrit lisibles, rien d'échu conservé |
| Limiteur de débit, essai de code et réservation de quota : **une seule instruction** chacun (upsert / `UPDATE … RETURNING`) | Un « lire puis écrire » laisse passer des requêtes simultanées : 50 codes envoyés au lieu de 3, 8 photos au lieu de 4 (reproduit au banc, dont la fausse base **simule la latence** — sans elle, aucune course n'apparaît) |
| `/photos/manquantes` liste le préfixe du compte (1 appel / 1 000 photos) ; > 5 000 empreintes → 413, jamais de troncature | Offre gratuite : 1 000 appels aux services Cloudflare par requête |
| Garage ≤ 1,9 Mo **en octets** ; `donnees` doit être un objet | D1 refuse toute ligne > 2 Mo |
| **Quota** par compte et plafond global (`QUOTA_*`, réglables dans `wrangler.toml`) ; photo déjà stockée = idempotente, non comptée | Un compte gratuit ne peut pas remplir le stockage ni la facture |

**Côté client :**
- **En sommeil par défaut** : `COMPTE_URL = ''` → aucun panneau, aucune requête
  (pas même un pré-vol CORS — vérifié au banc). Les bancs l'activent par
  `window.GM_COMPTE_URL`.
- **Synchronisation** : chaque prise porte `maj` (dernière modification) ; « Retirer
  du garage » laisse une **pierre tombale** datée (`META.supprimes`), exportée
  avec la sauvegarde. À la fusion cloud, la version la plus récente gagne
  (plus de concaténation des notes), les photos s'additionnent, et un retrait
  plus récent que la dernière modification supprime la prise **sur tous les
  appareils**. « Tout effacer » reste une remise à zéro locale, non propagée.
  La fusion des doublons de catalogue (`FUSIONS`, `fusionnerPrise`) est une
  autre fonction, inchangée.
- **Photos** : plafond **par rareté** à la capture (`PHOTOS_PAR_RARETE` dans
  `index.html` : 3 courant → 30 légendaire), **jamais** de retrait des photos
  existantes au-delà ; 1,5 Mo par photo côté app (recompression plutôt que
  refus), 2 Mo côté serveur ; les anciennes photos trop lourdes sont ramenées
  au format actuel par `GMGarage.normaliserPhotos()` avant chaque sauvegarde.
  **Supprimer une photo** : la corbeille posée sur la photo par `gm-specs.js`
  (`grefferSuppressionPhoto`, `.gsup-btn` — il n'en existe **qu'une**) appelle
  `window.GMGarage.supprimerPhoto(src)` ; l'écriture directe dans IndexedDB ne
  reste qu'en repli pour un `index.html` ancien en cache. La fiche **ouverte**
  est cherchée d'abord (une même image peut figurer dans deux prises), la
  dernière photo est refusée **sans** boîte de confirmation (on ne confirme pas
  pour ensuite refuser), sinon la boîte de l'app (`askConfirm`, comme « Retirer du
  garage ») est demandée par `gm-specs.js` via `{ confirmer:true }` ; la suppression laisse une **pierre tombale**
  `META.photosSupprimees` { empreinte SHA-256 des octets → date }, même
  empreinte que `gm-compte.js`. Les photos s'additionnant à la fusion
  cloud, c'est **elle seule** qui empêche la photo de revenir d'un autre appareil
  (`sansPhotosSupprimees`, appliquée à toutes les prises après l'import en fusion).
- **Restauration** : une photo injoignable (hors 404) interrompt tout — sinon la
  sauvegarde qui suit un conflit effacerait du cloud une photo qui existe.
- Le code n'est envoyé qu'avec l'adresse **demandée sur cet appareil**
  (`emailEnAttente`), et la saisie reprend si l'app est fermée le temps de lire
  ses mails. Champ `autocomplete="one-time-code"` : remplissage automatique.
- ⚠️ **Pourquoi pas de lien magique** (version du 29/09 matin, abandonnée) : sur
  iPhone, une app installée sur l'écran d'accueil a un stockage **séparé** de
  Safari ; un lien ouvert depuis Mail connecte Safari, pas l'app. Il exposait
  aussi au « login CSRF » (lien piégé d'un tiers) et aux antivirus de messagerie
  qui visitent les liens. Ne pas y revenir sans avoir réglé ces trois points.

⚠️ **`CONFIDENTIALITE.md` décrit ce que le code collecte.** Toute modification
qui change ce qui est stocké, combien de temps ou par qui, la met à jour **dans
le même commit**.

---

## 8 sexies. Commandes « / » (compétences) : c'est à l'agent de les PROPOSER

Règle posée par le propriétaire le 29/09 : il ne doit pas avoir à penser aux
commandes « / ». **L'agent repère le moment où l'une d'elles apporte quelque
chose, et demande l'autorisation de la lancer** — jamais de lancement d'office,
jamais d'attente qu'on la lui réclame.

**Format de la demande** (court, une par moment opportun, pas de relance si
refusée tant que le contexte ne change pas) :

> ⚠️ **Une question en attente se pose UNE fois, puis se tait** (règle du
> propriétaire, 30/09). On ne la répète pas en fin de message, ni à chaque
> vérification périodique, ni à chaque livraison : elle vit dans
> `RESTE-A-FAIRE.md`, où le propriétaire la retrouve quand il veut. Pas de
> vérification de PR programmée sans demande : c'est lui qui relance.

```
🔧 Proposition : /nom-de-la-commande  (sur quoi)
   Pourquoi maintenant : l'événement qui la rend utile
   Plus-value : ce qu'elle apporte que le travail en cours n'apporte pas
   Nature : lecture seule (rapport) | modifie le code (chaque changement relu)
   Coût : durée / risque
   → « go » ou « non »
```

**Quand proposer quoi** (repères, non exhaustifs) :

| Moment | Commande | Plus-value attendue |
|---|---|---|
| Avant un **merge** ou une livraison qui touche sécurité, comptes, imports, relais | `/security-review` | Regard méthodique indépendant du fil de travail : failles d'injection, d'authentification, de fuite de données |
| Avant un **merge** de PR, ou après une série de commits sur la logique | `/code-review` (niveau adapté à la taille) | Bugs de correction repérés hors de l'angle de celui qui a écrit le code |
| Nouvelle session où les bancs navigateur ne tournent pas d'emblée | `/session-start-hook` | Bancs relançables dans toute session, première marche vers une CI |
| Suivi répétitif (PR, déploiement, file de tâches) | `/loop` | Vérification périodique sans que le propriétaire relance |
| Après un gros ajout, si du code dupliqué ou alambiqué est repéré | `/simplify` | Nettoyage — **uniquement en mode rapport**, puis patchs ciblés un par un (§1.3) |

**Garde-fous :**
- Une commande qui **modifie** le code ne s'applique jamais en lot : chaque
  changement proposé est relu et appliqué en patch ciblé (§1.3), puis les bancs
  repassent (§6).
- Les résultats d'une revue sont des **pistes à vérifier**, pas des vérités : on
  confirme chaque point sur le code avant d'agir (même principe que la sortie du
  banc d'audit, §5 bis).
- `/init` ne se propose pas : ce `CLAUDE.md` existe et fait foi.
- Les commandes de l'interface (`/clear`, `/model`, `/config`…) appartiennent au
  propriétaire : l'agent peut les lui **suggérer**, pas les lancer.

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
