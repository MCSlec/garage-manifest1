# Garage Manifest — Document de contexte projet

> **Rôle de ce fichier :** état compacté du projet, à lire en premier par toute
> IA (Claude Code inclus) qui reprend ce dépôt. Il porte le *pourquoi*
> (décisions, contraintes, historique des bugs, chantiers en cours et
> abandonnés) — le *comment* vit dans `index.html` et `gm-specs.js`.
>
> **Règle de maintenance :** mis à jour à la fin de chaque chantier, avant
> fermeture de la conversation correspondante. Un `CONTEXT.md` périmé est pire
> qu'absent — il fait perdre confiance dans tout le reste du fichier.
>
> Ce document a été recompilé le 22/09/2026 à partir de l'historique complet
> de quatre conversations Claude.ai (23/07, 05/08, 17-18/09, 21-22/09) au
> moment du passage du projet vers Claude Code. Certains chiffres (nombre de
> voitures, versions) datent de la dernière conversation connue et doivent être
> revérifiés contre le dépôt réel avant d'être cités comme à jour.

**Dernière mise à jour :** 22/09/2026
**Version applicative de référence :** `gm-specs.js` v20.115.0 · `sw.js` garage-v20.115.0
> ⚠️ **Réconcilié avec le dépôt réel le 22/09/2026 (import dans Claude Code).** Les
> fichiers versionnés sont en **v20.115.0**, bien qu'ils contiennent déjà ~48 modèles /
> ~156 variantes `MOTOR_SPECS`. Le journal du chantier 21-22/09 (§12) visait v20.116.0 :
> le bump de version n'avait pas été appliqué/poussé au moment de la compilation de ce
> document. À corriger lors de la prochaine livraison touchant `gm-specs.js` (règle §5 de
> `CLAUDE.md`). Les comptages de ce fichier (fiches, variantes) restent des indications à
> recroiser contre le code, jamais des vérités figées.

---

## 1. Identité du projet

**Nom :** Garage Manifest
**Nature :** Progressive Web App personnelle de catalogage automobile — un « Pokédex pour voitures ».
**Auteur / mainteneur :** Cyril — passionné d'automobile et de motorsport, apprenti ingénieur (Chargé d'Affaires Études), habitué du circuit de Prenois/Dijon.
**Déploiement :** GitHub Pages
**URL de production :** `https://mcslec.github.io/garage-manifest1/`
**Dépôt GitHub :** `MCSlec/garage-manifest1`

**Objectif fonctionnel :** identifier, cataloguer et collectionner des véhicules
croisés dans la vie réelle, à partir d'une photo prise au téléphone. Progression
par missions/défis, gestion de favoris, consultation hors-ligne totale.

**Cible matérielle prioritaire :** Xiaomi 15 Ultra (usage terrain), Xiaomi Pad 7
(secondaire, utilisé aussi pour piloter Claude Code). Le rendu desktop est
toléré, pas optimisé.

**Modèle économique envisagé :** freemium — usage solo gratuit, création de
« clan » payante (~5 €). Décision actée : **pas de publicité**, jamais.

**Personnalité de travail de Cyril :** communication en français informel,
instructions courtes et directes (« Go », « Goooo »), refuse qu'on s'arrête
pour poser des questions entre deux features s'il a déjà donné le cap. Exige
que les chiffres techniques (specs auto) soient vérifiés par une vraie source —
préfixe `≈` si incertain, champ laissé vide si non fiable, **jamais de valeur
inventée**. Apprécie les explications « rétro-ingénierie » qui montrent le
raisonnement d'architecture, pas seulement le résultat.

---

## 2. Contraintes d'architecture (invariants)

Ces choix sont structurants. Toute proposition qui les remet en cause doit être
argumentée explicitement, pas appliquée par défaut.

| Contrainte | Décision | Justification |
|---|---|---|
| Distribution | `index.html` unique | Déployable par simple copie, aucun outillage, hébergement statique gratuit, auditabilité totale du code livré |
| Stack | Vanilla JS, zéro dépendance, zéro build step | Pas de chaîne de dépendances à maintenir, pas de rupture liée à une montée de version tierce |
| Persistance | IndexedDB | Volume important (catalogue + photos en dataURL), asynchrone donc non bloquant, quota très supérieur à localStorage |
| Hors-ligne | Service Worker | Consultation du garage sans réseau, installabilité PWA (icône écran d'accueil) |
| Accès IA | Relay Cloudflare Workers | Aucun secret côté client — le navigateur ne porte jamais la clé du modèle. Le Worker fait proxy et contrôle |
| **Ne jamais réécrire `index.html` en entier** | Patchs ciblés uniquement, avec ancrage unique vérifié avant écriture | Le catalogue d'origine et tout le code existant ne doivent jamais être écrasés par erreur |

### Invariants de code relevés (non écrits dans le code, mais respectés partout — à traiter comme des règles)

1. **Rendu par chaînes.** Aucune manipulation de nœud DOM à la main : chaque
   vue est une fonction pure `state → string` HTML, injectée par `innerHTML`.
   Corollaire : tout texte d'origine utilisateur **doit** passer par `escapeHtml()`.
2. **Délégation d'événements globale.** Trois écouteurs seulement (`click`,
   `input`, `change`) posés sur `document`, dispatchés par attributs `data-*`.
   Un nouveau contrôle = un nouvel attribut `data-*`, jamais un
   `addEventListener` local. C'est ce choix qui rend le re-rendu `innerHTML`
   sans effet de bord (les boutons de `gm-specs.js` type `data-car="…"` sont
   captés gratuitement par cette délégation existante).
3. **`CARS_BY_ID` est le point de vérité unique du lookup.** Les voitures
   « Non classé » y sont injectées à chaud pour que *toutes* les vues
   existantes fonctionnent sans modification. Ne jamais résoudre un `carId`
   autrement.
4. **Le catalogue est immuable en mémoire.** `CARS` n'est jamais muté ; les
   ajouts utilisateur vivent dans `CUSTOM_REG`, à côté. (Note : `CARS` est
   déclaré `const`, mais un tableau `const` reste modifiable en place —
   `gm-specs.js` exploite ce point technique pour injecter ses modèles
   manquants à chaud via `etendreCatalogue()`, sans jamais réassigner `CARS`.)

---

## 3. Modèle de données (IndexedDB)

**Nom de la base :** `garage-manifest`
**Version du schéma :** `1` (constante `VER`)
**Module d'accès :** `Store`, IIFE dans `index.html`, API `open / isMemory / all / put / del / clear`

### Object stores

| Store | keyPath | Auto-incrément | Index | Rôle |
|---|---|---|---|---|
| `spots` | `"carId"` | non | aucun | Store **unique**. Contient trois natures d'enregistrements distinguées par la valeur de la clé |

> ⚠️ Il n'existe qu'un seul object store. Métadonnées applicatives et registre
> des voitures hors-catalogue vivent dans ce même store sous des clés
> sentinelles (`__meta__`, `__customcars__`). Dette technique identifiée mais
> jamais traitée : ça marche, ce n'est juste pas ce qu'un schéma propre aurait
> fait dès le départ.

### Les trois formes d'enregistrement du store `spots`

**a) Prise de véhicule** — clé = l'`id` catalogue (ex. `"alpine-a110"`) ou un id
custom (`"custom:…"`). Écrite par `saveDraft()`.

```js
{
  carId:    "alpine-a110",          // clé primaire, = CARS[].id
  at:       "2026-07-12T10:00:00Z", // ISO ; construit depuis la date locale à 12:00 (anti-décalage TZ)
  loc:      "Monaco",               // libellé libre, trim
  coords:   { lat: 43.73, lng: 7.42 } | null,
  note:     "…",
  photos:   [ "data:image/jpeg;base64,…", … ], // dataURL, JPEG q0.78–0.82, côté max 1280 px
  cover:    0,                      // index dans photos[]
  variants: [ "Phase 2 (1997-99)" ],// sous-ensemble de VARIANTS[carId]
  favorite: false
}
```

Ordre d'insertion des photos : `unshift` (nouvelle prise → devient la 1ʳᵉ) si le
véhicule n'était pas encore verrouillé, `push` (ajout depuis une fiche
existante) sinon.

**b) Singleton métadonnées** — clé `"__meta__"`, variable `META`, écrite par `saveMeta()`.

```js
{
  carId:    "__meta__",
  bonus:    0,        // points de missions cumulés, additionnés au score de rareté
  missions: { "2026-07-23": ["d-fr","d-suv"], "2026-S30": ["w-jdm"] }, // clé période → ids déjà crédités
  friends:  [ { name, ts, score, count, rank, legends:[{id,at}] } ],
  feed:     [ { who, id, at } ],  // borné à 50 entrées
  name:     "",       // nom de pilote
  ai:       ""        // URL du relais de reconnaissance (résolue par resolveAiEndpoint() si vide)
}
```

**c) Singleton registre « Non classé »** — clé `"__customcars__"`, variable `CUSTOM_REG`.

```js
{
  carId: "__customcars__",
  list: [ {
    id:    "custom:renault-avantime-phase-2-lx3k9f", // "custom:" + slug + Date.now().toString(36)
    brand: "Renault", model: "Avantime phase 2", yr: "2002",
    c:     "🏳️",        // drapeau "Non renseigné"
    cat:   "Non classé",
    r:     "commun",     // rareté forcée — n'entre pas au score
    custom: true          // discriminant utilisé partout dans l'UI
  } ]
}
```

### Stratégie de migration

`onupgradeneeded` fait une seule chose : crée le store `spots` s'il n'existe
pas, sinon ne fait rien. **Il n'y a pas de stratégie de migration versionnée.**
Tant que `VER` reste à `1`, aucun risque. Le jour où `VER` passe à `2`, il
faudra écrire un `switch` sur `e.oldVersion` — à anticiper avant d'en avoir
besoin, pas après.

**Repli mémoire :** si `indexedDB.open` échoue, `Store` bascule sur une `Map`
en mémoire. L'app reste fonctionnelle mais volatile ; `Store.isMemory()`
remonte l'info dans les Réglages.

**Lecture externe non intrusive (utilisée par `gm-specs.js`) :** `gm-specs.js`
ouvre `garage-manifest` en lecture seule, **sans jamais déclarer de numéro de
version** — techniquement impossible de déclencher un `onupgradeneeded`, donc
impossible d'altérer le schéma depuis ce module. Délai de sécurité de 1,5 s :
si la base ne répond pas, l'affichage se fait quand même avec un ensemble vide.

---

## 4. Couche catalogue

**Volumétrie (dernier chiffre connu, à revérifier) :** ~1 075 véhicules,
156 marques, 21 pays. Répartition par rareté (avant le dernier recalibrage à
6 paliers) : commun 199 · peu commun 183 · rare 314 · épique 85 · légendaire 267.

**Format de stockage :** deux sources complémentaires, **toujours interroger
les deux** :
- `CARS` — tableau en dur dans `index.html`, catalogue d'origine.
- `CATALOGUE_PLUS` — dans `gm-specs.js`, modèles ajoutés ensuite et injectés à
  chaud dans `CARS_BY_ID` par `etendreCatalogue()`.

> ⚠️ **Piège vécu deux fois :** un audit qui ne cherche que dans `CARS`
> conclut à tort que des voitures existantes sont absentes (`audi-s4`,
> `audi-s5`, `toyota-supra-mk3` en ont fait les frais). Toujours croiser les
> deux sources avant de déclarer un id manquant.

### Couche VARIANTS

Rôle : gestion des déclinaisons d'un même modèle (finition, phase, millésime)
rattachées à une entrée parente du catalogue — ex. `VARIANTS['alfa-giulia'] =
["Ti", "Veloce", "Quadrifoglio"]`. Active l'UI « Déclinaisons » (chips
have/miss) dans la page photo. **Distinct de `MOTOR_SPECS`** (voir §4bis) —
question ouverte, jamais tranchée : sont-ce deux vues du même concept, ou deux
concepts qui vont finir par se contredire (ex. « Veloce » apparaît à la fois
comme variante d'équipement et comme type de motorisation) ?

### Système de rareté — 6 paliers (depuis v19.0.0)

| Palier | Points | Critère |
|---|---|---|
| **Courant** | 1 | Grande diffusion (citadine, berline, SUV, utilitaire…), encore produite après 2010 (critère = année de **fin** de production, pas de début), marque généraliste, sans mention sportive dans le nom |
| **Commun** | 2 | Marques premium en version de base (Série 3, Classe A, A3) — volontairement distinctes du Courant, sinon le palier devenait un fourre-tout |
| **Peu commun** | 4 | Versions sportives de grande diffusion (Cayman, A35, S3, M340i, Countryman JCW) |
| **Rare** | 8 | Sportives de série à volumes modérés (Cayman S, 911 GTS, Panamera Turbo, A110 S) |
| **Épique** | 20 | Séries limitées de quelques milliers (M2 CS, GT-R Nismo, 911 GT3 Cup) |
| **Légendaire** | 50 | Voitures de course (GT3 R, GT3, AMG GT3…) et séries limitées sous ~1 000 exemplaires (M4 CSL, 911 R, RS2) |

**Critère de classement = volume de production réel, jamais l'impression.**

> **Application aux voitures de course (22/09/2026).** 50 des 69 entrées
> « Course » étaient déjà `legendaire`, 19 non — un écart systématique, pas
> ponctuel. Tranché **par volume**, comme la règle l'impose, et non par
> statut : 14 passent en `legendaire` (GT3 client, la plus diffusée étant
> l'AMG GT3 à ~300 ex. ; GTE et Hypercar LMH/LMDh à quelques dizaines de
> châssis ; Rally1 ; A110 Cup ~150), la Radical SR3 passe `rare` → `epique`
> (~1 500 ex.). **Trois restent volontairement en place** : la 911 GT3 Cup
> à `epique` (5 381 produites depuis 1990, 1 130 pour la seule 992 — la
> règle la cite nommément à ce palier), la Dallara IR-18 à `epique` et les
> Midget / Sprint Car à `rare`, types de châssis construits par milliers.
> Effet sur le jeu : **+444 points sur un maximum de 19 092, soit +2,3 %**.

Deux faux positifs corrigés au banc : (1) l'ancienneté se juge sur la fin de
production, pas le début ; (2) `chMax` renvoyait la puissance max toutes
générations confondues, ce qui faisait hériter une fiche générique de la
puissance de sa variante sportive — critère de puissance retiré du calcul,
le nom du modèle suffit à repérer une version sportive.

### §4bis — `MOTOR_SPECS` : sélecteur de motorisation

Pour les modèles où une seule fiche SPECS ne suffit pas (plusieurs
motorisations disponibles à l'achat sur une même carrosserie — Giulia,
Panamera, Mégane…), structure additive dans `gm-specs.js`, **jamais** de
modification de `SPECS`/`GENS`/`MAP` existants :

```js
MOTOR_SPECS[catalogId] = {
  types: [{
    id, label,               // ex. id:'991-2', label:'991.2 (2019–2022)'
    variants: [{
      id, label, ch, nm, kg, cyl, arch, adm, pos, tx, bv,
      note,                  // anecdote propre à CETTE motorisation
      flou: ['ch','kg'],     // champs marqués ≈ (ex. valeurs soumises à la BoP en course)
      nc: ['nm']             // champs jamais publiés → null, jamais inventés
    }]
  }]
}
```

Chaque variante porte les mêmes champs que `SPECS`, pour compatibilité directe
avec `DERIVES.calc()` (ratios kg/ch, ch/t, ch/L).

**État au 22/09/2026 : 50 modèles, 164 variantes, 0 anomalie d'audit.**

**Règle « GTA »** (nommée d'après le cas Alfa Giulietta/GTA) : une déclinaison
qui a sa **propre fiche catalogue séparée** (911 Turbo/GT3/GT2 RS, M3 CSL/
Touring, Golf R/R32, Mégane R.S./R26.R, 206 WRC) est **exclue** de
`MOTOR_SPECS` du modèle de base — sinon la même voiture existe deux fois avec
des chiffres potentiellement incohérents. Distinction : même
identité/carrosserie avec différents moteurs → une seule fiche + sélecteur ;
identité distincte (poids, rareté, nom différents, ex. Giulia GTA) → fiche
catalogue séparée.

**Multi-générations :** pour un id catalogue qui couvre plusieurs générations
(911, M3, Panamera…), chaque **génération devient un `type`**, ses moteurs
deviennent les `variants`. Pas besoin de choisir une seule génération à
représenter.

**Convention course (voitures de compétition) :** puissance et masse sont
fixées par la Balance of Performance (bride + lest ajustés course par course)
→ toujours marquées `flou`. Le couple n'est jamais publié pour ces autos →
`nm: null` déclaré dans `nc`, jamais estimé.

**Convention hybrides :** `nm` stocke toujours le couple **cumulé** (thermique
+ électrique), jamais le couple thermique seul seul.

**Contrat DOM entre `index.html` et `gm-specs.js` :**
- `[data-moto-actif="typeId|variantId"]` posé sur le sélecteur par
  `index.html` → lu par `varianteActive()` dans `gm-specs.js` pour savoir
  quelle variante calculer.
- `[data-verrou]` posé par `index.html` sur une voiture **non spottée** →
  `greffer()` dans `gm-specs.js` ne greffe rien (voir §7, règle du verrou).

**Lecture obligatoire :** `MOTOR_SPECS`, `GENS`, `MAP` sont **privés à l'IIFE**
de `gm-specs.js`. Seul `window.GMSpecs` (l'objet `API` exposé) est global.
Tout code dans `index.html` qui a besoin de ces structures doit passer par
`window.GMSpecs.MOTOR_SPECS`, `window.GMSpecs.GENS`, etc. — jamais par le nom
de variable nu (`typeof MOTOR_SPECS` vaut toujours `"undefined"` depuis
`index.html`, piège qui a fait planter le sélecteur pendant plusieurs sessions
sans qu'aucune erreur JS ne le signale).

**Répartition des rôles dans le rendu de la fiche :**
- `index.html` / `infoPageHTML()` : en-tête, sélecteur de motorisation,
  Moteur/Puissance résumés, identité (millésimes, origine, catégorie, rareté),
  panneau de verrou.
- `gm-specs.js` / `greffer()` : tout le bloc chiffré détaillé (ratios, masse,
  couple, cylindrée, À savoir, note de variante) + bloc « Générations &
  motorisations » (lecture de `GENS`/`MAP`) + bloc « Le même bloc ailleurs »
  (index inversé des architectures moteur à travers le catalogue).
  `greffer()` est déclenché par un `MutationObserver` sur `#overlay` : il
  repère la voiture ouverte via le titre `.info-head h2`, résout son id, et
  ajoute en fin de page `blocHTML(id, varianteActive(page, id))`.

---

## 5. Pipeline de reconnaissance photo

```
[Capture / sélection photo]
        ↓  redimensionnement côté client, JPEG q0.78–0.82, côté max 1280 px
[Requête vers le relay Cloudflare Workers]
        ↓
[Worker → API Anthropic → Claude]
        ↓
[Réponse — actuellement texte libre, chantier en cours vers JSON structuré]
        ↓
[matchCatalog() : coefficient de Dice sur bigrammes contre CARS + customs]
        ↓
[Proposition à l'utilisateur / enregistrement en base]
```

**Endpoint du relay (codé en dur, aucune config utilisateur nécessaire) :**
`https://silent-firefly-2620.cyril-lapopin.workers.dev`

**Modèle utilisé :** `claude-haiku-4-5-20251001` via l'API Anthropic.
**Historique de migration :** le relay utilisait initialement
`gemini-2.5-flash-lite`, fermé aux nouveaux comptes Google (erreur 404,
diagnostiquée via les logs Observability de Cloudflare) → bascule vers
`gemini-3.1-flash-lite` → migration complète vers Claude (`claude-haiku-4-5-20251001`)
entre fin juillet et mi-septembre 2026. Toute référence à Gemini dans
d'anciennes notes ou captures est **obsolète**.

⚠️ **Une clé API Google a été accidentellement exposée dans une capture
d'écran** au tout début du projet — révoquée et remplacée à l'époque, sans
suite. À garder en tête si une ancienne capture ressort.

### Algorithme de matching actuel (`matchCatalog`)

1. `normalizeText` : NFD → suppression des diacritiques → minuscules → tout
   non `[a-z0-9 ]` devient espace → espaces compactés.
2. `diceCoefficient(qFull, full)` avec `qFull = "marque modèle"` normalisé,
   comparé aux ~1 075 entrées + les customs. Comptage des bigrammes
   décrémental, correct sur les répétitions.
3. Score = `min(1, similarité × 0.7 + bonusMarque 0.3)`. Le bonus est accordé
   si la marque devinée est égale à, contient, ou est contenue dans la marque
   catalogue.
4. **Seuil anti faux-positifs : 0.32.** En dessous → `null`.
5. Confiance finale = `score × (0.55 + 0.45 × confianceIA)`, arrondie au
   centième. Même avec une confiance IA nulle, le rapprochement textuel
   conserve 55 % de son poids.
6. `identifyCar` déduplique par id (max), trie décroissant, **tronque à 3**.
7. `afterPhoto` filtre ensuite les customs (`!CARS_BY_ID[c.id].custom`) : une
   voiture « Non classé » ne peut **jamais** être proposée automatiquement,
   même si `matchCatalog` la scanne.

**Coût :** O(n × longueur) par supposition, n = taille du catalogue.
Imperceptible sur mobile ; à surveiller si le catalogue double.

### Chantier « matching » — en cours, pas terminé

**Diagnostic posé :** le système actuel confond deux notions différentes — la
confiance du modèle de vision, et la qualité du rapprochement textuel avec le
catalogue. Résultat concret : deux pourcentages affichés côte à côte
(« IA 91 % », « Catalogue 74 % ») que personne ne sait interpréter, alors
qu'un simple mot-clé mal orthographié peut donner deux scores identiques pour
des raisons totalement différentes.

**Plan validé, dans l'ordre :**
1. **Sortie structurée côté prompt Claude (P0)** — faire produire
   `{brand, model, generation, variant, year_range, confidence, alternatives[]}`
   en JSON strict, plutôt que du texte libre parsé côté client au regex
   (le maillon le plus fragile de toute la chaîne).
2. **Trois niveaux de confiance distincts** — `aiConfidence`, `catalogScore`,
   `finalConfidence`, avec une marge (`margin`) et la possibilité explicite de
   remonter `NO_CONFIDENT_MATCH` plutôt que de forcer un candidat.
3. **Instrumentation dès maintenant** — enregistrer confirmations/corrections
   utilisateur, sans prétendre faire une calibration statistique sérieuse sur
   quelques dizaines de cas.
4. **Matcher séparé** — `gm-matcher.js`, indépendant du DOM et testable en
   isolation avec `matchCatalog(aiResult, CARS)`.
5. **Contrat explicite IA → matcher** — Claude produit une hypothèse
   automobile structurée ; le matcher détermine ensuite ce qui correspond
   réellement au catalogue. Deux responsabilités séparées, pas mélangées.

**Règle d'affichage actée (contredite une fois par erreur dans une maquette
externe, donc à répéter explicitement à toute IA de design) : ne jamais
afficher un pourcentage brut comme une probabilité scientifique.** Utiliser
« Très probable » + coches de correspondance visuelles, jamais le chiffre nu
à côté. Corollaire : **l'affichage de confiance IA ne doit pas être retouché
tant que `finalConfidence`/`NO_CONFIDENT_MATCH` n'existent pas réellement** —
coder une UI pour un système qui n'existe pas encore est un piège classique.

**Prérequis avant de toucher au code du matcher :** relire `ai-relay-worker.js`
(le code réel du Worker Cloudflare) pour voir le prompt exact et le format de
sortie actuel — jamais tranché sur hypothèse.

---

## 6. Interface — structure à 5 emplacements

Barre inférieure `nav.tabs`, construite par `renderChrome`. 5 emplacements,
dont un bouton d'action central (FAB).

| Emplacement | `state.tab` | Icône | Fonction | État |
|---|---|---|---|---|
| 1 | `defis` | `flag` | Rang, jauge de progression, défis du jour (2) et de la semaine (3) | Opérationnel |
| 2 | `collection` | `car` | **Vue principale.** Tuiles de rareté, complétude par marque/pays, filtres, grille du catalogue, bloc « Non classé » | Opérationnel |
| 3 | — | `plus` | **FAB**, pas un onglet : déclenche `openCapture(null)` | Opérationnel |
| 4 | `favoris` | `star` | Grille des prises marquées `favorite:true`, triées par date décroissante | Opérationnel |
| 5 | `plus` | `more` | Menu de navigation vers 4 sous-pages | Opérationnel |

**Sous-pages accessibles depuis « Plus »** (bouton retour `subBackHTML`,
l'onglet Plus reste visuellement actif via le `Set` `PLUS_PAGES`) :

| `state.tab` | Titre | Contenu |
|---|---|---|
| `map` | Carte de chasse | Leaflet + tuiles OSM, marqueurs colorés par rareté, popup → fiche |
| `stats` | Statistiques & équipage | 6 cartes chiffrées, barres par rareté/catégorie, sparkline 6 mois, prises récentes, bloc Équipage |
| `trophies` | Trophées | 14 badges (`BADGES`), état recalculé à chaque rendu |
| `settings` | Réglages | Export/import JSON, install PWA, feedback, quota de stockage, état du SW, reset, nom de pilote, endpoint IA |

**Parti pris ergonomique :** navigation par barre inférieure, atteignable au
pouce en usage une main sur mobile.

### Fiche véhicule — pager swipeable à 2 pages

Page 1 : photo(s) + lieu/date/note (uniquement si spottée). Page 2 : fiche
technique. Carrousel en CSS natif (`scroll-snap-type: x mandatory`) — **aucun
JS de gestuelle**, le navigateur gère le swipe et l'inertie, le JS se contente
de synchroniser les points de pagination sur l'événement de scroll. Fluide à
60 fps sur Xiaomi, zéro bug de geste.

---

## 7. Moteur de missions / défis

**Principe :** défis du jour (2) et de la semaine (3), générés et affichés
dans l'onglet Défis. Chaque défi crédité ajoute des points (`bonus`) au score
global, stockés par clé de période dans `META.missions` (ex. `"2026-07-23":
["d-fr","d-suv"]`, `"2026-S30": ["w-jdm"]`) pour ne jamais créditer deux fois
la même période.

**Trophées :** 14 badges définis dans `BADGES`, état recalculé à chaque rendu
(pas de stockage d'état de badge — dérivé de `state.spots` à la volée). Deux
badges bonus ajoutés en cours de route : *Accès paddock* (3 voitures de
course) et *Chasseur d'hypercars* (3 hypercars).

**Collections mécaniques (chantier livré) :** deuxième classement du garage,
sous les défis du jour dans l'onglet Défis. Range le catalogue non pas par
critère administratif (marque, pays, rareté) mais par ce qu'un passionné a
réellement en tête : architecture moteur, régime, position du bloc, doctrine.
24 collections définies (« Le club Mezger », « La tournée du PRV », « Rotary
Club », « Le mur des 9 000 », « Phares escamotables », « Kei cars », « La
boîte à grille », « Pikes Peak », « Sous la tonne », « Les orphelines », « Un
moteur de F1 sur la route »…). **Zéro donnée nouvelle** — ce sont des requêtes
sur les motorisations déjà écrites dans `gm-specs.js`, +3 lignes par
collection ajoutée. Lit le garage réel via ouverture IndexedDB en lecture
seule sans déclarer de version (voir §3).

**Distinctions (chantier livré) :** en tête de fiche technique, badge du type
« 🏆 MEILLEUR RAPPORT POIDS/PUISSANCE DU CATALOGUE » quand le modèle figure
dans le top 3 d'un classement. Rien ne s'affiche en dessous du podium — une
distinction donnée à tous n'en est plus une.

**Navigation en réseau (chantier livré) :** les puces « Le même bloc ailleurs »
et les modèles cités dans les collections sont cliquables (`data-car="…"`),
captés gratuitement par la délégation de clics déjà existante d'`index.html`
— zéro nouvel écouteur d'événement ajouté.

### Règle métier — verrouillage des specs (mécanique de collection, pas détail d'affichage)

Les specs d'une voiture **non encore spottée** ne sont **jamais** affichées :
la fiche montre un panneau « 🔒 Fiche technique verrouillée » à la place du
sélecteur, de la grille de specs, de l'anecdote et des générations.
**Doit survivre à tout re-design.** Marqueur DOM `[data-verrou]` posé côté
`index.html`, lu côté `gm-specs.js` pour que `greffer()` n'injecte rien.

⚠️ Effet de bord assumé : Cyril ne peut pas vérifier visuellement les fiches
des voitures qu'il n'a pas croisées lui-même. Contourné pour le développement
par un banc Playwright qui simule des spots réels dans IndexedDB sans jamais
toucher au code de l'app — c'est la méthode de test standard du projet
(voir §9).

---

## 8. Favoris

**Implémentation :** flag `favorite: true` sur l'enregistrement `spots` de la
voiture. Bascule via `data-favtoggle`.
**Impact UI :** grille dédiée dans l'onglet Favoris, triée par date de prise
décroissante.

---

## 9. Méthode de test — banc Playwright

**Depuis la session du 17-18/09, c'est la méthode de référence** pour toute
modification touchant au rendu : `node --check` valide la syntaxe mais **ne
prouve rien sur le comportement réel**. Deux bugs sérieux sont passés à
travers une vérification syntaxique propre avant d'être trouvés au banc :
- Le sélecteur de motorisation ne s'affichait jamais en production
  (`typeof MOTOR_SPECS` toujours `undefined`, voir §4bis) — 0 erreur JS, rien
  ne le signalait.
- Le verrou de collection fuyait : `greffer()` injectait masse/couple/ratios
  sur des voitures non spottées.

**Protocole du banc :** Chromium headless (Playwright), viewport 412×915
(dimensions Xiaomi), on écrit de **vrais spots** dans IndexedDB
(`garage-manifest`/`spots`) via `indexedDB.open`, on recharge la page, on
simule des clics réels (`data-car`, `data-moto-type`), on lit le DOM produit.
Comparaison systématique avant/après patch. Screenshot de contrôle à chaque
livraison significative.

**Discipline de vague** (héritée du chantier des fiches techniques) : travail
par lots de 13 à 15 éléments, vérification des ids contre le vrai fichier
avant écriture, contrôle des doublons de clés après chaque vague, banc
Playwright avant toute livraison. Ne jamais faire confiance à un contenu
`view`-é en mémoire depuis plusieurs messages — revoir le fichier juste avant
de l'éditer.

---

## 10. État d'avancement

### Terminé et stable
- [x] Catalogue étendu (~1 075 véhicules, 156 marques, 21 pays)
- [x] Système de rareté à 6 paliers, recalibré sur le volume de production réel
- [x] Navigation 5 emplacements + sous-pages « Plus »
- [x] Fiche swipeable 2 pages (photo / technique), carrousel CSS natif
- [x] Pipeline reconnaissance photo opérationnel (Cloudflare Worker + Claude Haiku)
- [x] Export/import JSON (inclut META et customs)
- [x] Service worker : cycle de mise à jour avec bandeau utilisateur, cache-first
- [x] Protection XSS sur les imports photo, dialogues in-app (plus de `confirm()`/`prompt()` natifs)
- [x] Fix du listener leak dans `setupFiche()` (accumulation de `pointermove`/`pointerup`/`resize` sur `window` à chaque ouverture de fiche)
- [x] `MOTOR_SPECS` : 50 modèles / 164 variantes, sélecteur fonctionnel, testé au banc Playwright (22/09/2026)
- [x] Verrou de collection étanche (specs invisibles tant que non spottée), testé au banc
- [x] Bloc « Générations & motorisations » branché sur `GENS`/`MAP` — première vraie consommation de `gm-specs.js` par l'affichage
- [x] Notes de variante affichées dans la fiche (« Cette version · … ») — étaient écrites depuis des sessions mais jamais rendues avant le 22/09
- [x] Collections mécaniques (24), Distinctions (podium), navigation en réseau entre modèles
- [x] **1 073/1 073 fiches techniques — couverture complète (24/09/2026).** Plus aucune entrée du catalogue n'ouvre sur un bloc vide. Neuf fiches sortent volontairement sans couple ou sans masse : chaque note dit laquelle et pourquoi, et `MANQUES.md` porte le détail du sourcing. Un champ absent est une information (« non communiqué »), pas un trou.

### En cours
- [ ] **204 fiches multi-générations restent sans sélecteur `MOTOR_SPECS`** — répartition connue par catégorie : SUV (45), Sportive (57), Berline (31), Classique (13), Citadine (15), Supercar (10), Youngtimer (11), Roadster (7), Hypercar (3), GT (3), Course (0, **traité le 22/09** : 917, 956/962, 205 T16, Impreza WRC, Mitjet 2L restaient — à vérifier l'état exact au dépôt)
- [x] ~~fiches techniques non remplies~~ — **terminé le 24/09/2026**, voir ci-dessus
- [x] ~~Chantier matching IA~~ — **`gm-matcher.js` livré** (22/09) : `finalConfidence`, `AUCUNE_CORRESPONDANCE_SURE`, catalogue injecté en paramètre, banc `node banc-matcher.js` 17/17. `matchCatalog()` reste en repli dans `identifyCar()`
- [x] **Blocs « Générations » : 1 073/1 073 (100 %)**, terminé le 28/09 en treize vagues (G1 → G13). ⚠️ Mesure par `GENS[idCatalogue]`, la clé que lit le rendu (voir `CLAUDE.md` §2.2) ; `api-gens` vérifie que `fichePourInterface()` renvoie exactement ce que le rendu affiche sur les 1 073 entrées
- [ ] Fiche à onglets (Fiche technique / Photos / Historique) — direction validée sur maquette, **pas implémentée**, périmètre élargi non couvert par le modèle de données actuel (dimensions, équipement, poids tractable, comparatif concurrents)
- [ ] Vue cinématique du véhicule (caméra fluide autour de la voiture) — CSS/photos compositing **prouvé insuffisant** par test Playwright réel ; pistes restantes : vidéo en boucle non scrubbée, ou accepter des transitions photo statiques
- [ ] Feature clan payante (freemium ~5€) — non commencée
- [ ] `DEV_UNLOCK` (bypass du verrou pour vérification visuelle en dev) — proposé, jamais implémenté ; contourné pour l'instant par le banc Playwright

### Dette technique identifiée
- **Fiches « multi-architectures » (mesuré le 28/09 : 92 fiches, dont 37 « courantes » ou « communes »).**
  Le champ `arch` ou `adm` décrit plusieurs moteurs à la fois (« 3 cyl. / électrique »,
  « turbo / atmo ») alors que `ch`, `nm` et `cyl` n'appartiennent qu'à l'un d'eux — parfois
  à deux versions différentes (2008 : puissance de l'électrique, cylindrée du thermique).
  Mesure au fil des vagues : 92 (28/09 matin) → 65 (28/09 soir). Pas mis au banc en ALERTE : 92 alertes d'un coup, c'est un banc qu'on finit par ignorer.
  Traité vague par vague dans le chantier E, les « courantes » d'abord : le sélecteur absorbe
  les versions multiples et la fiche redevient mono-version (§4.5 bis). Liste : relancer la
  requête du 28/09 (`arch`/`adm` contenant « / », « , électrique », « , hybride », « ou »).
- Store IndexedDB unique portant trois natures d'enregistrements différentes via des clés sentinelles, plutôt que plusieurs stores dédiés.
- Pas de stratégie de migration de schéma versionnée (`VER` reste à `1` depuis le début).
- Ambiguïté non tranchée entre `VARIANTS` (finitions/phases) et les `types` de `MOTOR_SPECS` (motorisations) — risque de contradiction déjà repéré une fois sur Giulia/« Veloce ».
- Historique de bugs de contamination de données par copie-adjacente : `SPECS['alfa-giulia']` a longtemps porté les chiffres de la Quadrifoglio au lieu de la 2.0 Turbo de base ; `SPECS['bmw-m2-cs']` a porté les chiffres de la M4 CSL. Motif récurrent à surveiller à chaque nouvelle vague : vérifier qu'une entrée fraîchement écrite ne « bave » pas sur sa voisine.

---

## 11. Décisions écartées (et pourquoi)

| Option envisagée | Écartée parce que |
|---|---|
| Rattachement automatique en masse des voitures « Non classé » vers le catalogue | Trois points de rupture (structure du registre, moment de démarrage de l'app, bandeau parfois invisible), aucun seuil de similarité ne distingue fiablement « GT3 R » de « GT3 RS » — remplacé par un bouton manuel sur chaque fiche, l'utilisateur tranche lui-même |
| Fiches séparées par génération/phase dans le catalogue | Catalogue plat + couche `VARIANTS` préféré, pour ne pas multiplier les entrées d'un même modèle |
| Afficher un pourcentage de confiance IA brut à l'écran | Anti-pattern identifié explicitement : donne une fausse impression de rigueur scientifique à un score qui ne l'est pas — remplacé par un jugement qualitatif (« Très probable ») |
| Redesign complet de la fiche en un seul chantier (maquette à onglets) | Périmètre trop large d'un coup (nouveaux champs de données, comparatifs inventés, contradictions avec des règles déjà actées) — approche par couches préférée, en partant de ce qui tourne déjà |
| Vue cinématique par scrubbing vidéo programmé (`currentTime`) | Les navigateurs mobiles bloquent le contrôle programmatique de lecture vidéo — affiche un simple bouton play au lieu de scrubber |
| Publicité dans le modèle économique | Décision de principe, actée dès le début du projet |

---

## 11 bis. Chantiers CADRÉS mais NON ENTAMÉS (ne pas démarrer sans demande)

Ces tâches sont décidées et spécifiées, mais volontairement repoussées. Les
inscrire ici évite deux dérives : les redécouvrir dans six mois en devant
casser l'existant, et les démarrer par zèle alors que la priorité est
ailleurs.

### A. Zone du futur bandeau publicitaire — *préparation seulement*

**But :** réserver la place dans le layout mobile **maintenant**, pour ne pas
avoir à refaire l'interface le jour où le bandeau arrive.

- Bandeau **fixe en bas**, et **uniquement** ça. Pas d'interstitiel, pas de
  plein écran, pas de pop-up, rien qui bloque l'utilisateur.
- **Aucune régie branchée, aucun emplacement visible** tant que ce n'est pas
  demandé : pas de bloc « PUBLICITÉ », pas de faux cadre.
- Contraintes : hauteur de bandeau mobile classique ; ne recouvre jamais les
  boutons ni le contenu ; `padding-bottom` correspondant sur le contenu
  scrollable ; `env(safe-area-inset-bottom)` respecté ; comportement propre
  sur desktop ; activable plus tard par une simple classe/id.
- **Constat du 28/09 : le bandeau existe déjà** dans `gm-specs.js`
  (`SPONSORS` par région, vide par défaut donc invisible, refermable pour la
  session, mention « Publicité », fixe au-dessus de la barre d'onglets). Seul
  écart avec ce cadrage : une fois actif, il **recouvre le bas du contenu**
  (pas de `padding-bottom` sur la zone qui défile). Question de mise en page,
  laissée à la décision de design.
- **La pub est une couche externe de monétisation, jamais une mécanique de
  jeu.** Elle ne doit influencer ni la fiche voiture, ni la boucle
  capture → identification → confirmation → collection → fiche → progression.
- Plus tard : ciblage par pays/langue.

### B. Internationalisation — *préparation seulement*

**But :** poser une base propre pour fr / en / es / de / it / pt, sans
traduire quoi que ce soit maintenant.

- Recenser les textes d'interface codés en dur et, **si** une abstraction
  légère (`t("nav.collection")`) s'ajoute sans refonte, la préparer.
- **Ne pas transformer tout le projet** si cela implique un gros chantier.
- ⚠️ **Règle structurante : les DONNÉES automobiles ne se mélangent jamais
  aux textes de traduction.** Un nom de modèle, une note de fiche, un libellé
  de motorisation ne sont pas des chaînes d'UI. Les confondre rendrait le
  catalogue intraduisible… et traduisible par erreur, ce qui est pire.

> **État au 28/09 : recensement fait (option a), aucun code modifié.**
> `node banc-i18n.js --md` → `I18N.md` : **547 textes d'interface distincts**
> (index.html 379, gm-specs.js 161, gm-matcher.js 7) + 131 textes éditoriaux
> (collections, à traiter comme les notes de fiche). Plus de 20 000 chaînes de
> données écartées mécaniquement. Trois obstacles à un `t("clé")` naïf :
> phrases coupées par des `${…}`, pluriels codés en français
> (« voiture{…} née{…} »), et libellés de catégorie qui servent aussi de clés
> de filtrage. Option (b) — le mécanisme `t()` — non lancée.

### C. Extraction du Rouleau depuis `banc-v1.html` → `gm-rouleau.js`

Voir `CLAUDE.md` §8 bis. À l'intégration, `onRevele` appellera
`GMMatcher.rapprocher()`, pas `matchCatalog()`. Exige un banc navigateur
dédié (rafale, hors-ligne, retry, reprise après fermeture brutale) **avant**
tout branchement : c'est le seul chemin par lequel l'utilisateur ajoute des
voitures.

> **État au 28/09 : extraction et banc faits, intégration non commencée.**
> `gm-rouleau.js` v1.0.1 + `banc-rouleau.js` (19/19). Reste l'intégration à
> l'écran de capture, qui attend une décision de design (où la pellicule
> apparaît, comment on ouvre une vue révélée).

### D. Champs de performance (0–100, v-max, consommation, carburant)

N'existent dans aucune structure. Les ajouter, c'est ~2 000 valeurs à sourcer
sur 1 017 fiches. **Programme, pas session.**

### E. Étape B — `MOTOR_SPECS` sur les 267 modèles sans sélecteur

654 motorisations, ~4 000 valeurs. **Programme, pas session.**

> **Priorité en cours, qui passe avant A→E :** la fiche voiture générique,
> celle qui sert les 1 070 entrées avec la même architecture.

---

## 12. Journal des chantiers

| Date | Chantier | Livré | Fichiers touchés |
|---|---|---|---|
| 23/07/2026 | Lancement — catalogue, navigation 5 onglets, reconnaissance IA (Gemini à l'époque), déploiement GitHub Pages guidé | 743→927 voitures, 150 modèles/473 phases en VARIANTS, pipeline IA opérationnel | `index.html` |
| 05/08/2026 | Documentation rétro (CONTEXT.md initial, 677 lignes), corpus de fixes v3.1→v3.4 (XSS, listener leak, PHOTO_SETS, endpoint IA codé en dur), exploration créative vue cinématique (abandonnée, CSS insuffisant) | 4 versions applicatives, `PROMPT_CLAUDE_DESIGN.md` produit pour Claude Design | `index.html`, `CONTEXT.md` |
| 17-18/09/2026 | Enrichissement massif des fiches techniques (223→994/1075 « niveau Elise »), recalibrage rareté à 6 paliers, review externe vérifiée et partiellement confirmée, migration IA vers Claude Haiku confirmée | `gm-specs.js` v20.43.0→v20.115.0 | `index.html`, `gm-specs.js`, `sw.js` |
| 21-22/09/2026 | Chantier `MOTOR_SPECS` (28→50 modèles, 84→164 variantes), fix critique IIFE (`window.GMSpecs`), verrou de collection, banc Playwright, fiches de course GT3 R/GT3 Cup, correctif du déploiement (`index.html` jamais poussé en prod), passage du projet vers Claude Code | `gm-specs.js` v20.116.0, `sw.js`, `index.html` (13 lignes de diff ciblé), `CLAUDE.md` créé sur le dépôt | `index.html`, `gm-specs.js`, `sw.js`, `CLAUDE.md` |
| 22-23/09/2026 | `gm-matcher.js` (rapprochement IA→catalogue, 3 défauts réels corrigés dans le scoreur), `banc-audit.js` (56 anomalies → 0 : 50 clés dupliquées écrasées en silence, 67 déclarations fantômes, 1 fiche inatteignable, 7 fiches décrivant une autre voiture), `fichePourInterface()`, BoP sur les 69 fiches de course, refonte UI mobile étape 1 | `gm-specs.js` v20.136.0→v20.143.0 | `gm-matcher.js`, `banc-*.js`, `gm-specs.js`, `index.html`, `sw.js`, `CLAUDE.md`, `MANQUES.md` |
| 24/09/2026 | **Comblement terminé : 96,2 % → 100,0 % (1 073/1 073).** 41 dernières fiches en six vagues par familles techniques. Trois arbitrages de norme tranchés (§4.4 ter) : Sportage 128 ch **ECE** contre 140 ch **JIS**, Shelby F-150 785 ch **SAE** → 796 ch (PS), Topolino 535 vs 740 kg (facteur 1,4 → deux grandeurs différentes, aucune reprise). Cas de règle : Rafale et Arkana E-Tech sortent **sans couple**, la boîte multimode à crabots n'additionnant pas les deux couples sur un arbre commun — même raisonnement que l'exception HSD. Citroën ZX 16v déparquée (les 163 ch pour 1,9 L qui bloquaient étaient une autre voiture). Nouveau `banc-rendu.js` : vérifie la puissance par ses **dérivées** et l'absence effective des champs non communiqués | `gm-specs.js` v20.144.0, `sw.js` `garage-v20.144.0` | `gm-specs.js`, `sw.js`, `MANQUES.md`, `banc-rendu.js`, `CONTEXT.md` |
| 24-28/09/2026 | **Générations : 661 → 1 073/1 073 (100 %).** Treize vagues par familles, chaque affirmation recoupée avant écriture (une vingtaine de notes de moteur de recherche fausses écartées). En chemin, **57 fiches corrigées** qui décrivaient une autre voiture que leur entrée : puissances saisies en hp dans le champ `ch` (Demon 170, ZR-1, Tuatara, Hummer EV…), couple saisi comme puissance (968 : « 305 ch » = 305 Nm), fiches d'une autre génération (Taurus SHO EcoBoost sur une entrée 1989-1999, DBS 2007 sur une entrée 2018). **Nouveau contrôle « jumelles à distance »** au banc d'audit : le contrôle copie-voisine ne comparait que des fiches adjacentes ; étendu à toutes les paires, il a révélé 30 groupes identiques, dont ~26 entrées courantes affichant leur version sportive (CLA = CLA 45, Polo = Polo GTI, Panamera = Turbo S E-Hybrid…) — corrigées sur la version de base, chiffres sourcés. 7 alertes laissées à l'arbitrage (doublons de catalogue S3, Ghibli, 124 Spider ; jumelles non vérifiables) | `gm-specs.js` v20.159.0, `sw.js` `garage-v20.159.0` | `gm-specs.js`, `sw.js`, `index.html` (libellé quattro), `banc-audit.js`, `CLAUDE.md`, `CONTEXT.md` |
| 28/09/2026 | **Second passage §4.5 bis : 32 fiches génériques de plus.** Heuristique hors banc (trop bruyante pour y entrer : 137 couples, dont une majorité légitimes) : une entrée courante au moins aussi puissante que sa déclinaison sportive. Ramenées à leur version de base, chiffres sourcés : Mégane (= R.S.), 508 (= PSE), 911 Carrera (= GTS), Cayenne (= Turbo E-Hybrid), Macan, X3 (= X3 M), Z3, F-Type (= R), Formentor (= VZ5), T-Roc (= R), Juke (= Nismo RS), Fiesta (= ST), Ram 1500 (= TRX), Passat, up!, Punto, Celica, Mustang, Defender, Range Rover, 406, Xantia, C4, C5, AX, ZX, 206, R5 (= 5 Turbo), Transporter, JCW, 190 E 2.5-16 (= Evo II), Integra Type R (DC2 portant la DC5). Laissées faute de source complète : R19, 205, Xsara, 405, 504, Range Rover Sport. Nouveaux doublons d'entrées signalés, non tranchés : A45 S / A 45 AMG, Challenger Hellcat ×2, Celica GT-Four ×2, Cayman / 718 Cayman | `gm-specs.js` v20.160.0, `sw.js` `garage-v20.160.0` | `gm-specs.js`, `sw.js`, `CONTEXT.md` |
| 28/09/2026 | **Déclinaisons Porsche et préparateurs.** Kits **Manthey (MR)** ajoutés en lignes de générations (règle GTA : un kit sur une voiture existante n'est pas un modèle à part) : GT3 992, GT3 RS 991.2 et 992, GT2 RS 991.2 (6 min 43,300 s au Nürburgring, 2021). **7 nouvelles entrées** complètes (catalogue, fiche, `MAP`, `GENS`, `ARCHI`) : 911 GT2 (993/996/997), 911 S/T, RUF CTR3, RUF SCR (2018), Gemballa Avalanche, Marsien, Gunther Werks 400R. Pas de « TechArt GTstreet RS » : le modèle 992 reste la GTstreet R, dont la fiche est complétée (87 exemplaires). Avalanche et Marsien sans masse : non communiquée | `gm-specs.js` v20.161.0, `sw.js` `garage-v20.161.0` | `gm-specs.js`, `sw.js`, `CONTEXT.md` |
| 28/09/2026 | **Fusion des doublons d'entrées, sans perte de collection.** Défaut trouvé en préparant la fusion : une prise enregistrée sous un id retiré n'était plus chargée au démarrage — les 21 doublons retirés depuis le 18/09 avaient fait disparaître en silence les voitures correspondantes des collections. Nouvelle table **`FUSIONS`** (id retiré → id conservé, et case de déclinaison à cocher) dont `DOUBLONS_A_RETIRER` est désormais dérivé ; migration au démarrage et à l'import dans `index.html`, idempotente, qui rend aussi leurs prises aux 21 anciens doublons. **9 paires fusionnées** : S3 / S3 Sportback-Berline, Ghibli / Ghibli (2013) → génération M157, 124 Spider ×2, A45 ×2, Challenger Hellcat ×2 (la Demon garde son entrée), Celica GT-Four / ST185 → génération ST185, Cayman / 718 Cayman → génération 718, Boxster / 718 Boxster → génération 718 (le sélecteur de motorisations passe au Boxster, sans la S qui a son entrée), Shelby GT500 ×2. Catalogue 1 080 → 1 071. **Les 4 paires « jumelles » tranchées par les sources** : Ascona et Manta affichaient toutes deux la 400 d'homologation avec un couple et une cylindrée faux → ramenées à l'Ascona B 2.0 S (100 ch) et à la Manta B GT/E (110 ch) ; Chevelle SS / El Camino portaient `ch:454` (la cylindrée en pouces cubes) au lieu de 456 ch ; Daytona / Superbird et 180SX / S13 sont bien mécaniquement jumelles mais pas de même masse (et le SR20DET fait 275 Nm, pas 264). Ghibli ramenée à la V6 350 (elle portait les 580 ch de la Trofeo), 124 Spider à la 140 ch, avec sélecteur 140 / Abarth 170. Bancs : audit 0 erreur · 0 alerte, `banc-fusions.js` 19/19 (et 15 échecs sans le patch), DOM 14/14, rendu 42/42, matcher 17/17 | `gm-specs.js` v20.162.0, `sw.js` `garage-v20.162.0` | `gm-specs.js`, `index.html`, `sw.js`, `banc-audit.js`, `banc-fusions.js`, `CLAUDE.md`, `CONTEXT.md` |
| 28/09/2026 | **Étape B `MOTOR_SPECS`, vague E1** (chantier E lancé) : Golf VIII (1.0 TSI 110, 1.5 eTSI 150, 2.0 TDI 115 et 150) et Yaris XP210 (116h, 130h) — 51 modèles équipés. La fiche Yaris perd son couple (185 Nm) : aucun couple système n'existe sur un hybride Toyota (§4.4). **Correctif de rendu** : `ficheHTML()` forçait `flou: []` sur toute variante, alors que `fichePourInterface()` respectait le `flou` de la variante — une masse approximative de variante s'affichait comme ferme. **Limite de sourçage** : l'environnement bloque la lecture directe de largus, zeperfs, ultimatespecs, automobile-catalog et Wikipédia ; seuls les résumés de recherche sont accessibles. Requêtes formulées sans chiffres pour ne pas s'auto-confirmer, et masses de sources mêlées (DIN / UE) marquées ≈ | `gm-specs.js` v20.163.0, `sw.js` `garage-v20.163.0` | `gm-specs.js`, `sw.js`, `CLAUDE.md`, `CONTEXT.md` |
| 28/09/2026 | **Vague E2** : Polo VI (MPI 80, TSI 95, TSI 110), Sandero III (SCe 65, TCe 90, ECO-G 100), Captur II (TCe 90, E-Tech 145, E-Tech plug-in 160), 2008 II (PureTech 100 et 130, BlueHDi 110, e-2008) — 55 modèles équipés. Fiches ramenées à leur version de base : **2008** (elle portait les 156 ch de l'e-2008 avec la cylindrée du thermique, incohérence interne du type Scénic) et **Captur** (hybride rechargeable 160 ch à 270 Nm non sourcés). Les hybrides E-Tech restent sans couple : Renault ne publie pas de couple système. Détail trouvé en sourçant : le TCe 90 du Sandero perd un rapport en 2022. **Incertitude héritée par les ratios** : kg/ch, ch/t et kg/Nm s'affichaient fermes sur une masse « ≈ » ; `DERIVES[x].dep` + `estFlou()`, même liste dans `fichePourInterface()`. Banc de rendu 51/51 (+ cas Captur « ≈ » hérité et Yaris HSD sans couple), mutation vérifiée | `gm-specs.js` v20.164.0, `sw.js` `garage-v20.164.0` | `gm-specs.js`, `sw.js`, `banc-rendu.js`, `CLAUDE.md`, `CONTEXT.md` |
| 28/09/2026 | **Chantier C, première moitié : le Rouleau extrait.** `gm-rouleau.js` extrait de `banc-v1.html` au caractère près (le prototype reste intact). Nouveau banc `banc-rouleau.js`, 19 tests, dont ce que le banc embarqué ne prouvait pas : reprise après fermeture brutale, disjoncteur, purge à 7 jours (révélées supprimées, latentes conservées), « même forme, autre couleur », dissociation, persistance. **Défaut trouvé et corrigé (v1.0.1)** : `estErreurReseau()` testait `includes('5')`, si bien qu'une erreur 400 « 25 Mo maximum » ouvrait le disjoncteur et gelait la pellicule. Mutations vérifiées (reprise des vues orphelines : 2 échecs). Intégration à `index.html` non faite : elle touche l'écran de capture | aucune (module non chargé par l'app) | `gm-rouleau.js`, `banc-rouleau.js`, `CLAUDE.md`, `CONTEXT.md` |
| 28/09/2026 | **Chantier B, option (a) : recensement des textes d'interface**, sans toucher au code. `banc-i18n.js` tokenise le JavaScript (chaînes, gabarits avec `${…}`, commentaires, expressions régulières) et le balisage, écarte mécaniquement les données automobiles (littéraux `CARS`, `INFO`, `VARIANTS`, `SPECS`, `GENS`, `MOTOR_SPECS`… repérés par équilibrage de crochets, plus tout nom de marque du catalogue) et génère `I18N.md` : 547 textes d'interface distincts + 131 éditoriaux. Les gabarits sont recomposés entiers avant de retirer les balises, si bien que les phrases paramétrées restent lisibles (« Capture {…} voiture{…} née{…} avant 1980 »). Au passage, **constat sur A** : le bandeau sponsor existe déjà, il ne manque que la marge qui l'empêche de recouvrir le contenu | aucune | `banc-i18n.js`, `I18N.md`, `CLAUDE.md`, `CONTEXT.md` |
| 28/09/2026 | **Vague E3** : Corsa F (1.2 75, 1.2 Turbo 100, Corsa-e), Qashqai J12 (1.3 DIG-T 140 et 158, e-POWER 190), Tiguan II (1.5 TSI 150, 2.0 TDI 150), C4 III (PureTech 130, ë-C4) — 59 modèles équipés. Fiches ramenées à leur version de base : **Corsa** (elle affichait les chiffres de la 130 avec l'architecture « 3 cyl. / électrique ») et **Qashqai** (e-POWER 190 sur une entrée courante). Cas d'école de l'**hybride série** : l'e-POWER garde ses 330 Nm, qui sont le couple à la roue puisque seul le moteur électrique entraîne les roues, mais n'a ni cylindrée ni ch/L, sans signification quand le thermique ne fait que produire du courant | `gm-specs.js` v20.165.0, `sw.js` `garage-v20.165.0` | `gm-specs.js`, `sw.js`, `CLAUDE.md`, `CONTEXT.md` |
| 28/09/2026 | **Vague E4** : Twingo III (SCe 65, TCe 90), Fiat 500 (1.2 69, TwinAir 85, Hybrid 70), Duster III (ECO-G 100, TCe 130, Hybrid 140), Ibiza V et Fabia IV (MPI 80, TSI 95) — 64 modèles équipés. **Les cinq fiches décrivaient une autre voiture que leur entrée** (§4.5 bis) : l'Ibiza affichait la Cupra, qui a sa propre entrée (192 ch), la Fabia une 1.5 TSI 150, le Duster un TCe 150 ; la Twingo et la 500 mêlaient chiffres électriques ou turbo et cylindrée thermique. Toutes ramenées à leur version de base. Twingo électrique et 500e non ajoutées : les résumés de recherche mélangeaient deux générations (Twingo III Z.E. / Twingo IV 2026) | `gm-specs.js` v20.166.0, `sw.js` `garage-v20.166.0` | `gm-specs.js`, `sw.js`, `CLAUDE.md`, `CONTEXT.md` |
| 28/09/2026 | **Vague E5**, première vague tirée de la liste des fiches « multi-architectures » (§10 Dette) : Mokka B (1.2 Turbo 100 et 130, Mokka-e), Kona II (Hybrid 141, Electric 217), Picanto III (1.0 67, 1.2 79), Vitara IV (1.4 Boosterjet 129, 1.5 Hybrid 115) — 68 modèles équipés. Fiches ramenées à une seule version : le **Kona** affichait le Kona N (280 ch), une autre voiture ; le **Mokka** l'électrique avec la cylindrée du thermique. Couple : cumulé et publié sur le Kona Hybrid (parallèle à embrayage), absent sur le Vitara Hybrid AGS (non publié). MG ZS et Kona 1.0 T-GDi remis à plus tard : générations mal départagées par les sources | `gm-specs.js` v20.167.0, `sw.js` `garage-v20.167.0` | `gm-specs.js`, `sw.js`, `CLAUDE.md`, `CONTEXT.md` |
| 28/09/2026 | **Vague E6** (liste « multi-architectures ») : Panda III (1.2 69, Hybrid 70), Superb III (1.5 TSI 150, 2.0 TDI 150), Fortwo 453 (1.0 71, EQ 82), Ypsilon IV (Hybride 100, Elettrica 156) — 72 modèles équipés. Cinq fiches ramenées à une seule version : Superb (portait la 2.0 TSI 280 4x4), Fortwo (portait la Brabus 109), Panda, Logan III (ECO-G 100, sans sélecteur faute d'un second moteur sourcé) et Ypsilon | `gm-specs.js` v20.168.0, `sw.js` `garage-v20.168.0` | `gm-specs.js`, `sw.js`, `CLAUDE.md`, `CONTEXT.md` |
| 28/09/2026 | **Vague E7** (liste « multi-architectures ») : sélecteurs Mini F56 (One 102, Cooper 136), CX-5 II (2.0 G 165, 2.2 D 150), X1 U11 (18i, 18d) — 75 modèles équipés. Cinq fiches ramenées à une version : **Mini Cooper** (portait la Cooper S, qui a sa propre entrée), **CX-5** (puissance du 2.5 essence + couple du 2.2 diesel : deux moteurs dans une même fiche, ratios faux), **XC40** (Recharge Twin 408 ch → B3), **X1**, **Niro** (HEV 141, couple cumulé publié) | `gm-specs.js` v20.169.0, `sw.js` `garage-v20.169.0` | `gm-specs.js`, `sw.js`, `CLAUDE.md`, `CONTEXT.md` |
| 28/09/2026 | **Liste « multi-architectures » : 92 → 65.** Texte d'architecture aligné sur les chiffres déjà présents, vérifiés ligne par ligne (Golf, Sandero, C3, Clio, Berlingo, Partner, Transit, Boxer, Ducato, Proace, Sprinter, Vito) : aucun chiffre ajouté, sauf la masse de la Golf, sourcée en E1. **208** : elle portait la puissance de l'e-208 avec la cylindrée du thermique → 208 II PureTech 100 ; son sélecteur, limité à la 208 I, reçoit la 208 II (PureTech 100, e-208). Laissés pour une vague sourcée : Kangoo (deux moteurs réellement mêlés), couple de la Clio E-Tech (non vérifié) | `gm-specs.js` v20.170.0, `sw.js` `garage-v20.170.0` | `gm-specs.js`, `sw.js`, `CLAUDE.md`, `CONTEXT.md` |
| 28/09/2026 | **Vague E8** : sélecteurs Tucson IV et Sportage V (1.6 T-GDi 150, Hybrid 230), Arona (TSI 95, TSI 110) — 78 modèles équipés. Cinq fiches ramenées à leur version de base : Focus (portait la ST 2.3 de 280 ch, sans entrée propre, sur une entrée « courante »), Puma, Tucson et Sportage (hybride rechargeable 265 ch), Arona (1.5 TSI 150). Couple de l'hybride 230 non repris : les sources hésitent entre 265 Nm (thermique seul) et 350 Nm (système) | `gm-specs.js` v20.171.0, `sw.js` `garage-v20.171.0` | `gm-specs.js`, `sw.js`, `CLAUDE.md`, `CONTEXT.md` |
| 28/09/2026 | **Troisième passage §4.5 bis : onze fiches « courantes » ou « communes » portaient exactement la version sportive qui a sa propre entrée** (violation directe de la règle GTA). Classe A = A45 S (421 ch), Classe C = C 63 S E Performance (680 ch), Classe E et GLE = 63 AMG (612 ch), A4 = RS4, A6 = RS6, Série 3 = M340i, Série 5 = M5 CS, Stelvio = Quadrifoglio, XC60 = T8 Polestar Engineered, 308 GT = 308 GTi. Toutes ramenées à leur version de base, chiffres sourcés (A 180, C 200, E 200, GLE 300 d, 35 TFSI, 40 TDI, 320i, 520i, Stelvio 2.2 160, XC60 B4, 308 GT THP 205) ; libellé « 308 GT / GTi » → « 308 GT ». **Pourquoi le passage précédent ne les avait pas vues** : il rapprochait les entrées par marque exacte, or l'A45 est rangée sous « Mercedes-AMG », pas « Mercedes ». Requête de contrôle (hors banc, faute de pouvoir la rendre muette sans douze exemptions de moteurs réellement partagés) : fiche courante/commune dont `ch` ET `nm` égalent ceux d'une entrée plus rare de la même racine de marque — 12 correspondances restantes, toutes des moteurs partagés vérifiés (PureTech 130, 6.2 V8 GM, B58…) | `gm-specs.js` v20.172.0, `sw.js` `garage-v20.172.0` | `gm-specs.js`, `sw.js`, `CLAUDE.md`, `CONTEXT.md` |
| 28/09/2026 | **Neuf fiches « courantes » de plus** qui portaient la version la plus puissante de la gamme, sans entrée propre cette fois (le joueur qui croise une MG4 ou une Leaf ordinaire voyait les chiffres d'une version rare) : MG4 (XPower 435 ch → Standard 170), ID.3 (GTX 326 → Pro 204), Kodiaq (RS 245 → 1.5 TSI 150), Leaf (e+ 217 → 40 kWh 150), Mach-E (GT 487 → propulsion 269), 207 (RC 175 → 1.4 75), 5008 (→ PureTech 130), Zafira (OPC 240 → 1.6 115), Sharan (TSI 220 → TDI 150). Chiffres sourcés, masses « ≈ » | `gm-specs.js` v20.173.0, `sw.js` `garage-v20.173.0` | `gm-specs.js`, `sw.js`, `CLAUDE.md`, `CONTEXT.md` |
| 28/09/2026 | **Sept fiches premium « communes »** ramenées à leur version de base : Q5 (portait le SQ5, qui a sa propre entrée → 40 TDI), Q7 (→ 45 TDI), Evoque (PHEV → P200, masse DIN de la fiche officielle Land Rover), F-Pace (SVR V8 → P250), XC90 et V60 (T8 → B5 / B4), DS 7 (E-Tense 4x4 300 → BlueHDi 130). **Écartés volontairement : Tesla Model 3 / Y et Polestar 2** — Tesla ne publie ni couple ni puissance commerciale, et les agrégateurs se contredisent (même moteur, 440 Nm d'un côté, 240 Nm de l'autre) : mieux vaut une fiche haut de gamme signalée qu'un chiffre de base inventé | `gm-specs.js` v20.174.0, `sw.js` `garage-v20.174.0` | `gm-specs.js`, `sw.js`, `CLAUDE.md`, `CONTEXT.md` |

---

## 13. Notes pour Claude Code spécifiquement

Tu n'as pas accès aux conversations Claude.ai listées ci-dessus — ce document
en est la compilation. Points d'attention immédiats en reprenant ce dépôt :

1. **Vérifie l'écart entre ce document et l'état réel du code** avant toute
   modification — ce fichier a été recompilé le 22/09/2026 depuis l'historique
   de conversation, pas depuis une lecture ligne à ligne du dépôt au moment où
   tu le lis. Traite les chiffres (nombre de fiches, versions) comme des
   indications à recroiser, pas comme des vérités figées.
2. **`index.html` a déjà été poussé en retard une fois** (session du 21-22/09) —
   après toute livraison, vérifie explicitement que le commit est bien passé
   sur la branche que GitHub Pages déploie (`main`), pas seulement sur une
   branche de travail.
3. **Le banc Playwright (§9) est la méthode de validation attendue** pour
   toute modification de rendu — pas seulement `node --check`.
4. **Incrémente `VERSION_MODULE` (dans `gm-specs.js`) et `VERSION` (dans
   `sw.js`) à chaque livraison**, sinon le cache du service worker ressert
   l'ancienne version sur l'appareil de Cyril et il croira tester du code
   corrigé qui ne l'est pas — c'est arrivé plusieurs fois par le passé et a
   fait perdre du temps aux deux côtés.
5. Les conventions de données (≈ via `flou`, `nc` pour non communiqué, couple
   cumulé pour les hybrides, règle GTA) sont détaillées en §4bis — à respecter
   pour toute nouvelle entrée `MOTOR_SPECS`.
