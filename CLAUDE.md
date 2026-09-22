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
| `GENS` | clé de spec | tableau de générations, format **positionnel** (voir §4.3) | Bloc « Générations & motorisations » (texte libre) |
| `MAP` | **id catalogue** → **clé de spec** | table de correspondance | Relie une entrée du catalogue à sa fiche `SPECS`/`GENS` |
| `MOTOR_SPECS` | **id catalogue** | `{ types:[{ id, label, variants:[{ id, label, ch, nm, kg, cyl, arch, adm, pos, tx, bv, note }] }] }` | Sélecteur multi-motorisations |

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

### 4.4 bis — Voitures de course : couple non publié
Pour une voiture de **compétition**, puissance et masse sont fixées par la
Balance of Performance (bride et lest ajustés course par course) → à déclarer dans
`flou`. Le **couple n'est jamais publié** par les écuries : le champ `nm` reste
vide, jamais estimé. Cela concerne ~53 fiches du catalogue (GT3, LMP, F1,
Groupe B, dragsters). Une fiche de course sans couple est **conforme**, pas
incomplète — ne pas la « corriger ».

> ⚠️ `nc` n'existe pas comme champ dans le code : il n'y a **aucun** rendu associé.
> La seule façon de dire « non communiqué » est donc de **laisser le champ absent**
> (`fmt()` n'affiche alors pas la ligne). N'écris jamais un champ `nc:[…]` en
> croyant qu'il produira un affichage : il serait inerte.

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
`20.124.0`, `sw.js` → `garage-v20.124.0`). `VERSION_MODULE` s'affiche en outre
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
| **Champs manquants / hors plage** | Complétude par champ, et incohérences d'ordre de grandeur. |
| **Divergences `CARS` / `CATALOGUE_PLUS`** | Un id déclaré des deux côtés : `CARS` fait autorité, l'autre déclaration est **perdue en silence**. |

**Calibrage :** les bornes de plausibilité sont volontairement larges, calées sur
les extrêmes **réels** du catalogue (Top Fuel 11 000 ch, Hummer EV 4 100 kg,
Citroën Ami 8 ch). Un banc qui crie au loup finit ignoré — ne les resserre pas
sans vérifier la fiche incriminée.

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
| `banc-v1.html` | Banc d'essai — hors cache, ne pas livrer comme app |
| `index-1.html` | Ancienne copie de travail d'`index.html` — **non servie**, ne pas confondre avec le fichier de prod |
| `CONTEXT.md` | État projet, décisions, journal des chantiers (le *pourquoi*) |
| `README.md` | Documentation utilisateur/fonctionnelle (le *quoi*) |
| `*.png` | Icônes PWA |

---

## 8. Rétro-ingénierie — pourquoi ces règles, et pas d'autres

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
