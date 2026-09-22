# CLAUDE.md — Garage Manifest

Guide de travail pour tout agent (Claude ou autre) intervenant sur ce dépôt.
Le *pourquoi* détaillé (décisions, historique, chantiers) vit dans **`CONTEXT.md`** —
lis-le en complément. Ce fichier-ci porte les **règles à ne jamais enfreindre** et la
carte du code.

Garage Manifest est une PWA personnelle de catalogage automobile (« un Pokédex pour
voitures »), vanilla JS, déployée en statique sur GitHub Pages
(https://mcslec.github.io/garage-manifest1/). Cible prioritaire : mobile (Xiaomi 15 Ultra).

---

## 1. Contraintes d'architecture — invariants

Ces choix sont structurants. Ne les remets pas en cause « par défaut » : toute entorse
doit être argumentée explicitement et validée, jamais appliquée en douce.

- **`index.html` unique.** L'app (HTML + CSS + JS) est auto-contenue dans un seul
  `index.html`. Les seuls fichiers JS à côté sont les **modules `gm-*.js`** (aujourd'hui
  `gm-specs.js`), chargés **réseau-d'abord** par le service worker.
- **Vanilla JS, zéro dépendance.** Pas de build step, pas de framework, pas de
  gestionnaire de paquets, pas de chaîne de dépendances tierce. Déployable par simple
  copie de fichiers. Tout le code livré doit rester auditable à l'œil.
- **Ne JAMAIS réécrire `index.html` (ni `gm-specs.js`) en entier.** Ce sont de gros
  fichiers (index.html ≈ 340 Ko, gm-specs.js ≈ 1,1 Mo). On travaille **par patchs
  ciblés** : on lit la zone concernée, on édite le minimum, on laisse le reste
  intact. Une réécriture globale casse forcément quelque chose d'invisible et détruit
  l'historique de corrections fines accumulées.
- **Additif par principe.** Les nouvelles couches (specs, motorisations, catalogue
  étendu) se **greffent** sur l'existant sans le modifier — les fiches déjà correctes ne
  bougent pas.
- **Persistance IndexedDB** (base `garage-manifest`, store `spots`), **hors-ligne via
  service worker**, **accès IA via relay Cloudflare Workers** (aucun secret côté client).

**Vérifier son travail :** `node --check` valide la *syntaxe*, pas le *comportement*.
Tout câblage entre `index.html` et un module `gm-*.js` doit être testé par **exécution
réelle** (banc navigateur Playwright — voir `CONTEXT.md` §« Banc navigateur »), pas
seulement relu.

---

## 2. Architecture de `gm-specs.js`

Module « fiche technique » : couche de spécifications **additive** qui se greffe au
catalogue par clé. Le catalogue reste la source de vérité de l'identité (marque, modèle,
pays) ; ce module porte la mécanique (puissance, couple, masse, ratios, générations).

- **IIFE.** Tout le module est enfermé dans `(function (global) { 'use strict'; … })(window);`.
  Aucune de ses variables n'est un global nu.
- **`window.GMSpecs` est le SEUL point public.** À la fin, `global.GMSpecs = API`. Les
  structures internes (`SPECS`, `GENS`, `MAP`, `MOTOR_SPECS`, `CHAMPS`, `DERIVES`,
  `CATALOGUE_PLUS`…) sont **privées** à l'IIFE, puis **ré-exposées explicitement** sur
  l'objet `API`. Depuis `index.html`, on lit donc **`window.GMSpecs.MOTOR_SPECS`,
  `window.GMSpecs.GENS`, `window.GMSpecs.MAP`**, etc.
  - ⚠️ **Piège historique** : tester `typeof MOTOR_SPECS !== "undefined"` depuis
    `index.html` renvoie **toujours faux** (c'est un privé de l'IIFE, pas un global) —
    ça avait rendu le sélecteur de motorisation invisible sans lever d'erreur. Toujours
    passer par `window.GMSpecs.*`.
- **Structures principales :**
  - `SPECS[cle]` — fiche mécanique plate (ch, tr, nm, kg, cyl, rupteur, v, acc, prod…),
    plus `flou:[…]` et `note`.
  - `GENS[cle]` — générations ; certaines portent un sous-tableau `.m` de motorisations
    en **texte libre** (non exploitable en chiffres).
  - `MAP[idCatalogue] = cle` — pont **id catalogue → clé SPECS**.
  - `MOTOR_SPECS[idCatalogue]` — motorisations chiffrées et structurées
    (`types[].variants[]`, mêmes champs que `SPECS`, donc directement consommables par
    `DERIVES.calc()`). Ajout **additif**, ne touche ni `SPECS`, ni `GENS`, ni `MAP`.
  - `CHAMPS` / `DERIVES` — dictionnaire des champs et **ratios calculés à la volée**
    (kg/ch, ch/t, ch/L, Nm/L, kg/Nm). **Rien n'est stocké s'il peut être calculé.**
- **Greffe DOM par observation.** Le module ne s'appuie sur aucun appel depuis
  `index.html` : un `MutationObserver` surveille `#overlay`, et quand une fiche s'ouvre,
  `greffer()` repère la voiture par le titre `.info-head h2`, résout son id, et ajoute la
  fiche technique en fin de page.

### Règle des DEUX catalogues — `CARS` + `CATALOGUE_PLUS`

Le catalogue réellement affiché = **`CARS`** (dans `index.html`) **+ `CATALOGUE_PLUS`**
(dans `gm-specs.js`), fusionnés au démarrage par **`etendreCatalogue()`**.

➡️ Toute vérification « est-ce que cette voiture existe dans le catalogue ? » doit
interroger **les deux sources**. Chercher uniquement dans `CARS` a déjà conduit à croire
à tort que des modèles manquaient (M2 CS / M4 CSL) et à écarter des candidats valides.

---

## 3. Contrat DOM entre `index.html` et `gm-specs.js`

La fiche est rendue à deux mains ; la frontière passe par **deux marqueurs DOM** posés
par `index.html` et lus par `gm-specs.js`. Ne pas les renommer sans mettre à jour les
deux côtés.

- **`data-verrou`** — `index.html` le pose sur le panneau d'une voiture **non encore
  spottée** (« Fiche technique verrouillée »). `greffer()` voit `[data-verrou]` et **ne
  greffe RIEN** : masse, couple, ratios, générations restent cachés. Le verrou est une
  **mécanique de collection**, pas un détail d'affichage — il doit survivre à tout
  re-design. (Un oubli faisait « fuiter » les specs des voitures non croisées.)
- **`data-moto-actif="typeId|variantId"`** — `index.html` le pose sur le sélecteur de
  motorisation. `varianteActive()` le lit (`split('|')`) pour que `greffer()` calcule la
  fiche **de la variante sélectionnée** (`ficheHTML(id, variante)`), et non celle du
  moteur par défaut. Sans ce marqueur, la première variante est utilisée.

Répartition des rôles : `index.html` (`infoPageHTML()`) rend l'en-tête, le sélecteur de
motorisation, l'identité et le verrou ; `gm-specs.js` (`greffer()`) rend tout le bloc
chiffré et les générations.

> Note d'inventaire : le contrat « posé par index.html » est actif dans `index-1.html`
> (copie de travail portant les marqueurs `data-moto-actif` / `data-verrou`). Vérifie
> quelle copie est la cible d'un patch avant d'éditer, et garde les deux côtés du contrat
> synchronisés.

---

## 4. Conventions de données

- **`flou` → « ≈ ».** Chaque fiche déclare dans `flou:[…]` les champs dont la valeur
  exacte n'est **pas garantie**. Ils s'affichent **préfixés de « ≈ »**. **Aucun chiffre
  n'est inventé** — une valeur incertaine est signalée, jamais maquillée en donnée sûre.
- **« nc » = non communiqué.** Quand un constructeur ne communique officiellement pas une
  valeur (ex. puissance Audi RS « officiellement non communiquée »), on ne la fabrique
  pas : on la marque comme incertaine (`flou`) et on explique dans `note`
  (« non communiqué », estimation courante indiquée à part). Pas de faux chiffre précis.
- **Hybrides : couple/puissance CUMULÉS.** Pour un véhicule hybride, les champs `ch` et
  `nm` portent la valeur **cumulée** (thermique + électrique), et la `note` le précise
  (« puissance/couple cumulés »). Ne pas mélanger avec la seule valeur du bloc thermique.
- **Règle GTA — quand séparer une fiche.** Critère de tri d'un modèle à plusieurs
  versions :
  - *Même carrosserie, moteur différent au catalogue* → **une seule fiche + sélecteur de
    motorisation** (`MOTOR_SPECS`).
  - *Identité distincte* (poids, rareté, caractère propres — ex. **Alfa Giulia GTA** vs
    Giulia, 911 Turbo/GT3/GT2 RS, M3 CSL/Touring, Golf R/R32, Mégane R.S./R26.R, 206 WRC)
    → **fiche catalogue séparée**, exclue de la fiche de base et de son sélecteur.
  - En clair : une déclinaison qui mérite sa propre entrée catalogue ne se range **pas**
    dans les motorisations de la voiture de base.
- **Rareté : deux systèmes distincts, sans lien automatique.** La rareté **affichée** est
  écrite à la main dans `index.html` (`RARITY`, 6 paliers dont « Courant »).
  `PALIERS_RARETE` dans `gm-specs.js` (dérivé de `log10(production)`) n'est **pas** branché
  dessus. Ne pas supposer qu'ils sont synchronisés.
- **Sources.** Les chiffres saisis sont vérifiés par recherche (presse constructeur,
  zeperfs, largus, cars-data…). Une variante sans source fiable est **écartée**, pas
  approximée. Attention aux erreurs de « fiche voisine qui bave sur la suivante » lors des
  saisies en lot (bugs Giulia/Quadrifoglio, M2 CS/M4 CSL déjà rencontrés).

---

## 5. Règle de livraison — incrémenter la version À CHAQUE livraison

Deux compteurs, à **bumper ensemble** dès qu'on livre un changement de code :

1. **`VERSION_MODULE`** en haut de `gm-specs.js` (`const VERSION_MODULE = '…'`).
2. **`VERSION`** dans `sw.js` (`const VERSION = "garage-v…"`).

Ils sont maintenus **alignés** (aujourd'hui : module `20.115.0` ↔ sw `garage-v20.115.0`).
Le bump de `sw.js` **invalide le cache** du service worker : sans lui, les appareils
gardent l'ancienne version en cache et ne voient pas la mise à jour. Ne jamais livrer une
retouche de code sans incrémenter les deux.

Après un changement, vérifier que `sw.js` affiche bien la nouvelle version en tête, et
fermer complètement la PWA avant de la rouvrir pour forcer la prise en compte.

---

## 6. Carte du dépôt

| Fichier | Rôle |
|---|---|
| `index.html` | L'app complète (HTML + CSS + JS auto-contenu). Cible principale des patchs. |
| `gm-specs.js` | Module « fiche technique » (voir §2). Chargé réseau-d'abord. |
| `sw.js` | Service worker (cache app-shell, hors-ligne, versioning). |
| `manifest.webmanifest` | Manifeste PWA (installabilité). |
| `ai-relay-worker.js` | Relay Cloudflare Workers → API Anthropic (reconnaissance photo). Se déploie **à part**, pas avec les fichiers du site. |
| `CONTEXT.md` | État compacté du projet : décisions, chantiers, bugs, historique. |
| `index-1.html`, `banc-v1.html` | Copies de travail / banc d'essai. Ne pas confondre avec l'app servie (`index.html`). |
| `icon-*.png`, `favicon-32.png`, `apple-touch-icon-180.png`, `.nojekyll` | Assets & config GitHub Pages. |

---

## 7. Pipeline de reconnaissance photo (rappel)

`[photo] → POST {image: dataURL} au relay Cloudflare → API Anthropic (claude-haiku-4-5)
→ réponse [{brand, model, confidence}] en texte libre → matchCatalog() côté client
(coefficient de Dice + bonus marque) → proposition à l'utilisateur.`

Le relay reste **générique** : il ne connaît pas le catalogue ; tout le rapprochement se
fait côté client. Voir `CONTEXT.md` §5 pour le chantier en cours (sortie structurée,
confiances séparées, futur module `gm-matcher.js`).
