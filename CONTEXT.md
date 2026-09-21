# Garage Manifest — Document de contexte projet

> **Rôle de ce fichier :** état compacté du projet, injecté au démarrage de chaque
> conversation. Il porte le *pourquoi* (décisions, contraintes, intentions) —
> le *comment* vit dans `index.html`.
>
> **Règle de maintenance :** mis à jour à la fin de chaque chantier, avant fermeture
> de la conversation correspondante. Un `CONTEXT.md` périmé est pire qu'absent.

**Dernière mise à jour :** 18 septembre 2026 (fin de chantier MOTOR_SPECS)
**Version applicative de référence :** service worker `garage-v20.115.0` (vérifié sur `sw.js` réel)

---

## 1. Identité du projet

**Nom :** Garage Manifest
**Nature :** Progressive Web App personnelle de catalogage automobile — un « Pokédex pour voitures ».
**Auteur / mainteneur :** Cyril
**Déploiement :** GitHub Pages
**URL de production :** https://mcslec.github.io/garage-manifest1/
**Dépôt :** GitHub — MCSlec/garage-manifest1

**Objectif fonctionnel :** identifier, cataloguer et collectionner des véhicules croisés
dans la vie réelle, à partir d'une photo prise au téléphone. Progression par missions,
gestion de favoris, consultation hors-ligne.

**Cible matérielle prioritaire :** Xiaomi 15 Ultra (usage terrain), Xiaomi Pad 7 (secondaire).
Le rendu desktop est toléré, pas optimisé.

---

## 2. Contraintes d'architecture (invariants)

Ces choix sont structurants. Toute proposition qui les remet en cause doit être
argumentée explicitement, pas appliquée par défaut.

| Contrainte | Décision | Justification |
|---|---|---|
| Distribution | Fichier `index.html` unique (+ modules `gm-*.js` séparés, chargés en réseau-d'abord) | Déployable par simple copie, aucun outillage, hébergement statique gratuit, auditabilité totale du code livré. Les modules `gm-specs.js`, `gm-rouleau.js` existent déjà à côté d'`index.html` — le futur `gm-matcher.js` suivra le même principe |
| Stack | Vanilla JS, zéro dépendance | Pas de build step, pas de chaîne de dépendances à maintenir, pas de rupture liée à une montée de version tierce |
| Persistance | IndexedDB | Volume potentiellement important (catalogue + photos), asynchrone donc non bloquant pour l'UI, quota très supérieur à localStorage |
| Hors-ligne | Service Worker | Consultation du garage sans réseau, installabilité PWA (icône sur l'écran d'accueil) |
| Accès IA | Relay Cloudflare Workers | Aucun secret côté client — le navigateur ne doit jamais porter la clé du modèle. Le Worker fait proxy, contrôle et éventuellement rate-limiting |

---

## 3. Modèle de données (IndexedDB)

> _À compléter par rétro-documentation du code — non vérifié à ce jour._

**Nom de la base :** _(à renseigner)_
**Version du schéma :** _(à renseigner)_

### Object stores

| Store | keyPath | Auto-incrément | Index | Rôle |
|---|---|---|---|---|
| _(à compléter)_ | | | | |

### Stratégie de migration

_(à compléter)_

---

## 4. Couche catalogue

**Volumétrie :** 1 081 véhicules référencés, 1 234+ motorisations, 0 anomalie connue.
**SPECS :** module séparé `gm-specs.js`, chargé réseau-d'abord via le service worker.
Contient `SPECS` (fiche plate par clé), `GENS` (générations, avec parfois un sous-tableau
`.m` de motorisations en **texte libre**, pas en chiffres exploitables), `MAP` (id
catalogue → clé SPECS), `DERIVES` (ratios calculés à la volée : kg/ch, ch/t, ch/l, Nm/L,
kg/Nm — jamais stockés), `PALIERS_RARETE` (rareté dérivée du volume de production —
**non branché sur la rareté réellement affichée**, qui reste écrite à la main dans
`index.html`, 6 paliers dont "Courant").

~~`gm-specs.js` chargé mais jamais consommé~~ — **affirmation fausse, corrigée le 18/09.**
`gm-specs.js` se **greffe lui-même** dans chaque fiche via `greffer()`, déclenché par un
`MutationObserver` sur `#overlay` : il repère la voiture par le titre `.info-head h2`, puis
ajoute en fin de page `blocHTML(id)` = fiche technique (ratios kg/ch · ch/t · ch/L, masse,
couple, cylindrée, À savoir) + bloc « Générations & motorisations » + moteurs. C'est ce
rendu qu'on voit sur les captures (Falcon XB).

**Répartition des rôles dans la fiche :**
- `index.html` / `infoPageHTML()` : en-tête, sélecteur de motorisation, Moteur/Puissance,
  identité (millésimes, origine, catégorie, rareté), verrou.
- `gm-specs.js` / `greffer()` : tout le bloc chiffré et les générations.

**Contrat entre les deux (marqueurs DOM) :**
- `[data-verrou]` posé par index.html sur une voiture non spottée → `greffer()` ne greffe rien.
- `[data-moto-actif="typeId|variantId"]` posé sur le sélecteur → `greffer()` calcule sa fiche
  à partir de la variante (`ficheHTML(id, variante)` : champs mécaniques de la variante,
  note/surnom/production du modèle, rupteur retiré car propre à un seul moteur).

### Couche VARIANTS

_Rôle exact : gestion des déclinaisons d'un même modèle. Existe et alimente l'affichage
"Déclinaisons" dans `index.html` (liste de chips, présence/absence par entrée du garage).
Distincte de `GENS` dans `gm-specs.js` — à clarifier si les deux doivent converger._

**Structure :** _(à compléter)_
**Règle de résolution :** _(à compléter)_

### Couche MOTOR_SPECS (multi-motorisations) — livrée

Structure **additive** dans `gm-specs.js`, placée juste avant l'objet `API`.
Ne modifie ni `SPECS`, ni `GENS`, ni `MAP` — les 889 fiches mono-moteur existantes
sont intactes.

```
MOTOR_SPECS[idCatalogue] = {
  types: [ { id, label, variants: [ { id, label, ch, nm, kg, cyl,
                                      arch, adm, pos, tx, bv, note } ] } ]
}
```

Les champs de chaque variante sont **les mêmes que ceux de `SPECS`**, donc
directement consommables par `DERIVES.calc()` (kg/ch, ch/t, ch/l, Nm/L, kg/Nm)
sans logique de ratio supplémentaire à écrire.

**État au 18/09/2026 : 42 modèles, 129 variantes, 0 anomalie** (audit automatisé :
ids vérifiés contre `CARS`, pas de doublon d'id de variante, aucun champ manquant,
valeurs numériques valides).

Modèles couverts (nb de variantes) : alfa-giulia (6), landrover-defender (6),
aston-vantage (5), peugeot-406-coupe (4), citroen-c6 (4), peugeot-106 (4),
peugeot-504 (4), alfa-giulietta (3), mazda-mx5 (3), kia-stinger (3),
opel-calibra (3), audi-tt (3), fiat-coupe (3), alfa-156 (3), alfa-147 (3),
alfa-75 (3), toyota-gr-supra (2), skoda-octavia-rs (2), nissan-300zx (2),
toyota-mr2 (2), alfa-gtv-916 (2), mercedes-190e (2), peugeot-205 (2),
matra-murena (2), lancia-fulvia (2), jaguar-xjs (2), citroen-xantia (2),
tvr-cerbera (2), porsche-panamera (6), peugeot-206 (6), renault-megane (4),
bmw-m3 (2), porsche-911 (2), audi-r8 (3), audi-rs6 (2), porsche-718-boxster (3), audi-s3 (2), bmw-m5 (3), bmw-m2-cs (2), bmw-m4-cs (2), audi-s4 (4), audi-s5 (4).

**Modèles multi-générations** (catalogue couvrant plusieurs générations sur une
seule fiche) : chaque **génération devient un `type`**, ses moteurs deviennent
les variantes. Pas besoin de choisir une seule génération. Règle GTA appliquée :
les déclinaisons qui ont leur propre fiche catalogue sont exclues de la fiche de
base (911 Turbo/GT3/GT2 RS, M3 CSL/Touring, Golf R/R32, Mégane R.S./R26.R,
206 WRC).

**Méthode de sélection :** scan automatisé de `GENS` → 266 fiches multi-lignes,
filtrées par heuristique (libellés contenant cylindrée/carburant) → 57 vrais cas
« choix moteur à l'achat sur la même carrosserie ». Écartés : les fourchettes
vagues (« 1.0–1.4 »), les cas générations-différentes (911, M3, Golf GTI…), et
~~3 ids « absents de `CARS` »~~ — **erreur corrigée le 18/09** : audi-s4, audi-s5 et
toyota-supra-mk3 existent bien, dans `CATALOGUE_PLUS`. S4 et S5 traitées (vague 20) ;
Supra A70 laissée de côté (poids et version Turbo non sourcés).

**Chiffres :** tous vérifiés par recherche web au moment de la saisie (presse
constructeur, zeperfs, autotijd, largus, automobile-sportive, cars-data…).
Aucune valeur estimée. Variantes écartées faute de source fiable plutôt
qu'approximées (ex. Calibra Turbo 4x4).

**Couverture partielle assumée** : pour les multi-générations, seules les
générations dont les chiffres ont pu être recoupés sont présentes (M3 : E46 et
G80 seulement ; 911 : 992 seulement ; Mégane : III seulement). Mieux vaut une
génération manquante qu'une génération approximée.

**Écartés après recherche (motif documenté) :**
- vw-golf-gti : puissances contradictoires d'une source à l'autre par génération
- mercedes-e63 : une seule variante avec poids sourcé (E63 S W213, 612 ch, 1 880 kg) — un sélecteur à une seule entrée n'a pas de sens
- R8 V8 4.2, RS6 C5/C6/C7, M3 E30/E36/E92/Competition : poids manquant ou contradictoire (RS6 C5 donnée à 1 667 kg ET 1 840 kg dans le même article)

- ford-gt40 : Mk I / Mk II / Mk IV sont des voitures de course distinctes, pas un choix moteur à l'achat
- renault-21-turbo : même moteur 175 ch sur les deux versions, seule la transmission change (traction / Quadra) — hors périmètre « motorisation »
- alfa-gtv6 : la 3.0 est une série d'homologation sud-africaine de 212 exemplaires, relevant plutôt d'une fiche à part (règle GTA)
- Générations sans poids sourcé : S3 8L/8Y, M5 E28/E34/E39/G90

**Liste des candidats issus du scan GENS : épuisée.**

### ⚠️ Deux sources de catalogue — à ne jamais oublier

Le catalogue affiché = `CARS` (dans `index.html`) **+** `CATALOGUE_PLUS` (dans
`gm-specs.js`, 228 entrées), fusionnés au démarrage par `etendreCatalogue()`.
Toute vérification « cette voiture existe-t-elle ? » doit interroger **les deux**.
Erreur commise le 18/09 : recherche limitée à `CARS`, qui a fait croire que les
M2 CS / M4 CSL manquaient et a écarté à tort 3 candidats MOTOR_SPECS.

Inventaire BMW CS/CSL réel : 3.0 CSL (E9), M3 CSL (E46), M5 CS, M2 CS, M4 CSL.
~~Manquent réellement : M3 CS, M4 CS~~ → **ajoutées le 18/09** dans les 4 structures
(`CATALOGUE_PLUS`, `SPECS`, `GENS`, `MAP`), rareté épique. M3 CS sans `MOTOR_SPECS`
(poids de la F80 CS non sourcé → une seule génération chiffrable).

**Bug de données corrigé :** `SPECS['bmw-m2-cs']` affichait 550 ch / 650 Nm — les chiffres
de la M4 CSL placée juste en dessous (copier-coller). Corrigé en 450 ch / 550 Nm / 2,979 L
(F87 CS, sources autotijd + presse). Même famille d'erreur que le bug Giulia/Quadrifoglio :
**une fiche voisine qui « bave » sur la suivante** — à surveiller lors des saisies en lot.

### 🐛 Bug corrigé — le sélecteur ne s'affichait jamais

`MOTOR_SPECS`, `GENS` et `MAP` sont **privés** au module `gm-specs.js` (déclarés
dans son IIFE) ; seul `window.GMSpecs` est global. Le premier câblage testait
`typeof MOTOR_SPECS !== "undefined"` → toujours faux → sélecteur et bloc
Générations **jamais rendus**, sans aucune erreur (la garde avalait tout).
Correctif : `MOTOR_SPECS` ajouté à l'objet `API`, et `index.html` lit
`window.GMSpecs.MOTOR_SPECS / .GENS / .MAP`. Vérifié par exécution réelle du
module dans un environnement simulé (38 modèles accessibles via `GMSpecs`).
Leçon : `node --check` valide la syntaxe, pas le comportement — un test
d'exécution est obligatoire pour tout câblage entre modules.

### ✅ Banc navigateur — 18/09/2026

`banc-motorisations.py` (Playwright, Chromium headless, viewport 412×915 type Xiaomi) :
écrit de vrais spots dans IndexedDB (`garage-manifest` / `spots`), recharge, ouvre les
fiches, clique le sélecteur, lit le DOM. **Premier test comportemental du chantier.**

Deux bugs trouvés qu'aucune vérification syntaxique ne pouvait voir, corrigés et re-testés :
1. Les chiffres du bloc greffé ne suivaient pas la motorisation (Giulia Diesel 190 affichait
   le couple de la 2.0 essence ; M4 CS F82 affichait la masse de la G82).
2. Le verrou fuyait : `greffer()` injectait masse/couple/ratios sur les voitures non spottées.
Plus un doublon de bloc Générations (le mien + celui de gm-specs) supprimé.

Résultat final : sélecteur OK, chiffres et ratios recalculés par variante (vérifiés à la
main : 1 465 kg / 190 ch = 7,71 kg/ch), verrou étanche, 1 seul bloc Générations, 0 erreur JS.

### Règle métier — verrouillage des specs

Les specs d'une voiture **non encore spottée** ne sont pas affichées : la fiche
montre un panneau « Fiche technique verrouillée » à la place du sélecteur, de la
grille de specs, de l'anecdote et des générations. Mécanique de collection, pas
détail d'affichage — **doit survivre à tout re-design**.

⚠️ Effet de bord : Cyril ne peut pas vérifier visuellement les fiches des voitures
qu'il n'a pas croisées. Contourné pour le développement par le banc Playwright, qui
simule des spots dans IndexedDB sans toucher au code de l'app.

### Chantier précédent — sélecteur multi-motorisations (UI)

Constat : une fiche unique ment pour les modèles à plusieurs motorisations distinctes
(essence/diesel/Veloce sur Giulia, essence/diesel sur Panamera, etc.). Critère de tri
validé : moteur différent seul → même fiche + sélecteur ; modèle différent (poids,
identité, rareté — ex. Giulia GTA) → fiche séparée, inchangé. Les 889 fiches mono-moteur
existantes ne bougent pas (tout est additif). Six pistes visuelles comparées (canvas de
design), contenu complet sur toutes : plaque constructeur, carnet d'atelier, stand et
chrono, tableau de bord, plan côté, ticket de contrôle technique — direction finale pas
encore choisie par Cyril.

---

## 5. Pipeline de reconnaissance photo

```
[Capture / sélection photo]
        ↓
[POST {image: dataURL} vers le relay Cloudflare Workers]
        ↓
[Worker → API Anthropic (Claude) → identifier()]
        ↓
[Réponse : [{brand, model, confidence}] — texte libre pour brand/model]
        ↓
[matchCatalog() côté client : Dice coefficient sur bigrammes + bonus marque]
        ↓
[Proposition à l'utilisateur / enregistrement en base]
```

**Modèle IA :** Claude, `claude-haiku-4-5-20251001`, via l'API Anthropic
(`api.anthropic.com/v1/messages`, clé dans la variable secrète `ANTHROPIC_API_KEY`).
✅ Vérifié le 18/09/2026 par grep direct sur le vrai `ai-relay-worker.js`. Corrige une
mention antérieure erronée de Google Gemini dans un résumé de session plus ancien —
le projet a changé de moteur entre fin juillet et le 17 septembre 2026 sans que ça soit
tracé ici, d'où l'importance de ce fichier.

**Endpoint du relay :** codé en dur côté client pour que les testeurs n'aient rien à
configurer. D'après une session antérieure : `https://silent-firefly-2620.cyril-lapopin.workers.dev`
— à reconfirmer sur le fichier réel, pas revérifié dans la session du 18/09.

**Format de requête :** `POST {image: dataURL}`.
**Format de réponse actuel :** tableau `[{brand, model, confidence}]`, `brand`/`model` en
texte libre (pas de structure marque/modèle/génération séparée). `matchCatalog()` dans
`index.html` fait tout le rapprochement catalogue côté client.
**Gestion d'erreur :** _(à compléter — non vérifié)_

### Chantier en cours — refonte confiance / matching

**Objectif :** séparer ce que pense l'IA de ce que pense le moteur de rapprochement
catalogue — aujourd'hui les deux notions sont mélangées dans un score unique difficile
à interpréter.

**Décisions prises (18/09/2026), issues d'un débat croisé avec une autre IA :**
1. **P0 — sortie structurée côté prompt Claude** : faire produire
   `{brand, model, generation, variant, year_range, confidence, alternatives[]}` plutôt
   que du texte libre à parser côté client. Priorité la plus haute — un changement de
   prompt, pas une réécriture d'architecture.
2. **Trois confiances séparées** : `aiConfidence` / `catalogScore` / `finalConfidence`,
   plus `margin = top1.score − top2.score` pour savoir si le système discrimine vraiment
   ou devine.
3. **`NO_CONFIDENT_MATCH`** comme état de premier ordre — ne jamais forcer le meilleur
   candidat s'il n'est pas assez convaincant.
4. **Instrumentation dès maintenant** (logger confirmations/corrections utilisateur),
   **sans promettre de calibration statistique** — volume d'usage bêta-entre-potes
   trop faible pour une vraie signification statistique par tranche de confiance.
5. **`gm-matcher.js`**, module séparé indépendant du DOM :
   `matchCatalog(aiResult, CARS) → {status, candidates, topCandidate, margin, diagnostics}`.
6. **Contrat explicite** : Claude fait de la vision (hypothèse automobile structurée),
   `gm-matcher.js` fait la décision catalogue. Claude ne choisit jamais un ID catalogue ;
   le matcher ne refait jamais de la vision.

**Bloquant avant de dessiner `gm-matcher.js` précisément :** le vrai `ai-relay-worker.js`
(prompt exact, parsing actuel de `identifier()`) — pas encore fourni.

---

## 6. Interface — structure à 5 onglets

| Onglet | Fonction | État |
|---|---|---|
| _(à compléter)_ | | |

**Parti pris ergonomique :** navigation par barre inférieure, atteignable au pouce
en usage une main sur mobile.

---

## 7. Moteur de missions

**Principe :** _(à compléter)_
**Modèle de données associé :** _(à compléter)_
**Déclenchement / évaluation :** _(à compléter)_

---

## 8. Favoris

**Implémentation :** _(à compléter)_
**Impact UI :** _(à compléter)_

---

## 9. État d'avancement

### Terminé et stable
- [x] Catalogue : 1 081 véhicules, 889 fiches SPECS complètes, 0 anomalie
- [x] Correction rareté Ram 1500 / Ford F-150 (logique géographique)
- [x] Bug `cyl:0` (affichage "0,0 L" sur les électriques) corrigé
- [x] `rechargerSurFiche()` : réouverture de la bonne fiche après reload

- [x] `MOTOR_SPECS` : 28 modèles / 84 variantes, audit à 0 anomalie (18/09/2026)
- [x] Bug Quadrifoglio corrigé dans `SPECS['alfa-giulia']` (520 ch / 2,9 L → 200 ch / 1,995 L)
- [x] Sélecteur de motorisation câblé dans `infoPageHTML()` + délégation de clics
- [x] Verrouillage des specs tant que la voiture n'est pas spottée
- [x] Bloc « Générations & motorisations » branché sur `GENS`/`MAP` (première consommation réelle de `gm-specs.js` par l'affichage)

### En cours
- [x] Sélecteur + verrou + bloc chiffré testés en navigateur réel (banc Playwright, 18/09)
- [ ] Le rendu visuel sera repris par ChatGPT ; Claude reste sur data + logique métier
- [ ] Refonte confiance / matching IA (voir §5) — bloqué sur l'obtention d'`ai-relay-worker.js`
- [ ] Poursuite de `MOTOR_SPECS` sur les modèles restants (voir §4)

### Bugs connus / comportements non résolus
| # | Symptôme | Reproduction | Piste |
|---|---|---|---|
| 1 | ~~`SPECS['alfa-giulia']` contenait les chiffres de la Quadrifoglio~~ | — | **Corrigé le 18/09/2026** : remplacés par ceux de la 2.0 Turbo 200 réellement représentée |
| 2 | Le même type de confusion s'est reproduit dans une maquette externe (0–100 de 3,9 s affiché sur une Giulia de base) — vigilance sur ce modèle | — | Toujours vérifier qu'une spec « Giulia » n'est pas en fait celle de la QV |

### Dette technique identifiée
- `gm-specs.js` chargé mais non consommé par `index.html` (voir §4) — soit on câble, soit on assume que c'est un module dormant/futur et on le documente comme tel
- Deux systèmes de rareté coexistent sans lien : `RARITY` (manuel, 6 paliers, dans `index.html`) et `PALIERS_RARETE` (dérivé de la production, dans `gm-specs.js`)

---

## 10. Décisions écartées (et pourquoi)

| Option envisagée | Écartée parce que |
|---|---|
| Vue cinématique de fiche via compositing CSS de photos | Playwright a confirmé que le CSS ne peut pas reproduire un mouvement de caméra fluide autour du véhicule ; alternative retenue : vidéo Veo en boucle ou transitions statiques soignées (non tranché) |
| Calibration statistique de la confiance IA dès maintenant | Volume d'usage bêta-entre-potes insuffisant pour une signification statistique réelle par tranche de confiance ; risque de fausse précision. Remplacé par : instrumentation seule, calibration différée à plus tard |

---

## 11. Journal des chantiers

| Date | Chantier | Livré | Fichier mis à jour |
|---|---|---|---|
| 17/09/2026 | Enrichissement SPECS massif (vagues A→BA) | 994/1075 fiches niveau "Elise", 31 doublons de clés résolus, bug `cyl:0` corrigé | `gm-specs.js` (v20.43.0 → v20.115.0) |
| 18/09/2026 | Reprise après saturation de la conversation précédente ; correction Claude/Gemini sur le relais IA ; plan de refonte confiance/matching arrêté en débat croisé avec une autre IA ; 6 directions visuelles de fiche technique comparées (canvas) | `CONTEXT.md` remis à jour | `CONTEXT.md` |
| 18/09/2026 | **Chantier MOTOR_SPECS** — 20 vagues : structure additive + 42 modèles / 129 variantes (dont 14 multi-générations) ; ajout M3 CS / M4 CS ; bug M2 CS corrigé ; **bug de câblage GMSpecs corrigé (sélecteur jamais affiché auparavant)**, tous chiffres vérifiés par recherche web ; sélecteur câblé dans `infoPageHTML()` ; verrouillage des specs non spottées ; bloc Générations branché sur `GENS` ; bug Quadrifoglio corrigé | `gm-specs.js`, `index.html` (non testés en navigateur) | `gm-specs.js`, `index.html`, `CONTEXT.md` |
