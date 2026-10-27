# Carte des écrans ↔ code — Garage Manifest

> Relevée sur la branche le **30/09/2026** (v20.194.0), en lecture seule.
> Sert de pont entre les maquettes (`DESIGN.md`) et le code : chaque élément
> visible → où il est produit → ce qu'il déclenche → ce qu'un nouveau design a
> le droit d'en faire.
>
> ⚠️ Une partie de l'interface **n'est pas dans `index.html`** : elle est
> greffée après coup par `gm-specs.js` (marqués **[greffe]**). Lire
> `index.html` seul donne une carte fausse.

**Légende des statuts**

| | Signifie | Un nouveau design peut… |
|---|---|---|
| 🟢 | Habillage | changer librement l'apparence (CSS, disposition) |
| 🟡 | UX sans métier | changer le parcours ou la présentation, **sans** changer ce que la fonction fait des données |
| ⚙️ | Fonctionnel, stable | se contenter de l'habiller ; le comportement est testé par un banc |
| 🔴 | Contrat | **ne pas toucher** : renommer ou retirer casse une greffe ou une donnée **en silence** |

---

## 1. Coque de l'app (toujours visible)

| Élément | Code | Déclenche | Statut |
|---|---|---|---|
| En-tête : logo, « 1/1071 repérées », « 0 % complet », points, légendes | `renderChrome()` → `#brandIcon`, `#readouts`, `#progbar` | — (lecture de `computeStats()`) | 🟢 |
| Barre d'onglets : Défis · Garage · **＋** · Favoris · Plus | `renderChrome()` → `#tabs`, boutons `[data-tab]` | `state.tab = …` puis `render()` | 🟢 visuel · 🔴 `[data-tab]` (lu par `gm-specs.js`) |
| Bouton central **＋** (capture) | `[data-fab]` dans `#tabs` | `openCapture()` | 🟢 visuel · ⚙️ action |
| Zone de contenu | `#view` (rempli par `render()`) | — | 🔴 id (observé par les greffes) |
| Feuilles modales (capture, fiche) | `openSheet()` → `#overlay > .scrim > .sheet` | fermeture : `[data-close]`, `[data-scrim]` | 🟢 visuel · 🔴 `#overlay`, `.sheet` (observés par les greffes) |
| Messages brefs | `toast()` → `#toast` | — | 🟢 |
| Bandeau « Partenaire » | **[greffe]** `grefferBandeauSponsor()` → `.gsp`, fermeture `[data-gsp="fermer"]` | — | 🟢 |

## 2. Parcours capture → révélation (P0)

| Étape | Élément | Code | Déclenche | Statut |
|---|---|---|---|---|
| 1. Choix de la source | Feuille « Enregistrer une prise » : Appareil photo · Importer une photo · Importer un lot | `openCapture()` → `renderCapture()` → `renderCaptureBody()` étape `source` ; boutons `[data-cap="camera"\|"gallery"\|"batch"]` | caméra → étape `camera` ; galerie → `#fileInput` | 🟡 |
| 2. Visée | Vidéo plein cadre + déclencheur | étape `camera` : `#camWrap`, `video#cam`, `#shutter` ; `startCamera()` | `shoot()` → photo 1 280 px JPEG | 🟡 visuel · ⚙️ `shoot()` |
| 2 bis. Caméra refusée | Message + « Importer une photo » | `startCamera()` (catch) | `[data-cap="gallery"]` | 🟢 |
| 3. Analyse | **Aucun état visible aujourd'hui** : le formulaire s'affiche, la reconnaissance tourne en arrière-plan (jusqu'à 15 s) | `afterPhoto()` → `identifyCar()` | appel du relais IA, puis `GMMatcher.rapprocher()` | 🟡 **à concevoir** |
| 4a. Résultat sûr (`CONFIRME`) | Popup « Modèle trouvé », confiance en %, « Oui, c'est elle » / « Ce n'est pas mon véhicule » | `showRecogPopup(cand)` → `#recogWrap`, `[data-recog="yes"\|"no"]` | oui → `draft.carId` ; non → focus sur la recherche | 🟡 |
| 4b. Résultat **ambigu** (`AMBIGU`) | ⚠️ **Même popup, un seul nom** : l'app cache la seconde piste (ex. « BMW M3 74 % » alors que M4 est à 73 %) | `afterPhoto()` n'utilise que `valid[0]` ; le statut est dans `lastMatch` | — | 🟡 **défaut à concevoir** |
| 4c. Pas de correspondance sûre | ⚠️ **Rien** : ni proposition, ni message. Le joueur ne sait pas si l'IA a échoué ou n'a rien trouvé | `afterPhoto()` : « silence volontaire » | — | 🟡 **défaut à concevoir** |
| 4d. Erreur (hors ligne, délai, quota du jour) | Message bref (`toast`) : texte de `lastAiError` | `identifyCar()` → `lastAiError` | — | 🟡 |
| 5. Formulaire | Photo + reprise (caméra / galerie), recherche « Quel modèle ? », liste (tag **IA** sur les candidats), « Voiture introuvable → Non classé », déclinaisons, lieu, date, GPS, note | étape `form` : `.preview`, `#pickQ`, `#pickList` / `[data-pick]`, `[data-act="showcustomform"\|"createcustom"]`, `#varZone` / `[data-var]`, `#loc`, `#when`, `[data-act="gps"]`, `#note` | choix du modèle, `grabGPS()` | 🟡 |
| 6. Validation | « Ajouter au garage » / « Enregistrer » | `[data-act="save"]` → `saveDraft()` | écriture IndexedDB, plafond de photos par rareté, `showReveal()` si nouvelle voiture | 🟢 bouton · ⚙️ `saveDraft()` (banc `banc-photos.js`) |
| 7. Révélation | Carte « Nouvelle capture — [rareté] », photo, nom, marque · catégorie, « +N pts », « toucher pour continuer » ; halo de la couleur de rareté ; **confettis** pour épique / légendaire ; vibration | `showReveal(carId)` → `#revealWrap`, `.rv-card`, `.rv-new`, `.rv-name`, `.rv-pts`, `.cf` | clic → `openDetail()` | 🟡 · ⚠️ confettis **contraires au brief** (`DESIGN.md` §10) |
| 7 bis. Recadrage auto de la photo | Cadrage mémorisé appliqué aux images | **[greffe]** `recadrerTout()` sur `#overlay img, #view img, .rv-card img` | — | 🔴 `.rv-card img` |
| 8. Lot de photos | « Lot en cours — encore N photos » ; enchaîne les captures | `draft.queue`, `handleFile()` | — | 🟡 |
| — | Le **Rouleau** (pellicule, révélation différée) | `gm-rouleau.js`, **non intégré** | — | ⚙️ module prêt, intégration = décision de design (`CLAUDE.md` §8 bis) |

## 3. Fiche d'une voiture

Aujourd'hui : **deux pages à faire glisser** (photo · fiche technique) avec des
points de pagination. La maquette propose **trois onglets** (Fiche technique ·
Photos · Historique) : changement de structure, à valider.

| Élément | Code | Déclenche | Statut |
|---|---|---|---|
| Ouverture | `openDetail(carId)` → `#pager` > `.page` ×2, `#dots` / `[data-dot]`, `.swipe-hint` | défilement horizontal | 🟡 |
| Titre de la feuille | `.sh-head h3` | — | 🟢 |
| **Page photo** (voiture au garage seulement) | `photoPageHTML()` | | |
| Grande photo = couverture | `.detail-hero img` = `cover(rec)` → `photos[cover]` | — | 🟢 visuel · 🔴 `.detail-hero` et son `img` (6 greffes les cherchent) |
| Pastille de rareté sur la photo | `.detail-hero .chip` | — | 🟢 |
| Corbeille de la photo | **[greffe]** `grefferSuppressionPhoto()` → `.gsup-btn` | `GMGarage.supprimerPhoto(src, {confirmer:true})` | 🟢 visuel · ⚙️ (banc `banc-photos.js`) |
| « Flouter la plaque » | **[greffe]** `grefferFloutage()` → `.gfl-ouvrir` | éditeur de floutage | 🟢 visuel · ⚙️ |
| « Cadrer » | **[greffe]** `grefferCadrage()` → `.gcz-ouvrir` | éditeur de cadrage | 🟢 visuel · ⚙️ |
| Vignettes + ajout | `.thumbstrip` : `[data-setcover]`, `[data-addphoto]` | `setCover()` ; `openCapture(carId)` | 🟢 |
| Titre, marque, drapeau | `.detail-title` | — | 🟢 |
| Favori · points | `[data-favtoggle]`, `.pts` | `toggleFavorite()` | 🟢 |
| Repérée le · Lieu · Position (lien Google Maps) | `.specs` dans `photoPageHTML()` | lien externe `maps.google.com` | 🟢 · lien à décider (`RESTE-A-FAIRE.md` §2 quater) |
| Note | `#detNote` | enregistrée à la perte du focus | 🟢 |
| Déclinaisons repérées | `.var-chips` / `.vchip` (lecture) | — | 🟢 |
| Ajouter une photo · Partager · Retirer du garage | `[data-addphoto]`, `[data-act="sharecard"]`, `[data-release]` | `openCapture()`, carte de partage, `askConfirm` puis `release()` | 🟢 visuel · ⚙️ `release()` (pierre tombale) |
| **Page technique** | `infoPageHTML()` | | |
| Conteneur de la fiche | `.detail-shell` avec `data-car-id`, `data-brand`, `data-rarity`, et `data-verrou` si la voiture n'est pas au garage | — | 🔴 **tous ces attributs** (`CLAUDE.md` §3) |
| Rareté · titre · origine | `.info-head` > `.chip`, **`h2`**, `.muted` | — | 🟢 visuel · 🔴 `.info-head h2` (lu en 4 endroits) |
| Sélecteur de motorisation | `.moto-select[data-moto-actif="type\|variante"]` ; boutons `[data-moto-type]`, `[data-moto-variant]` | `state.motoSel` puis nouveau rendu ; la fiche greffée suit la variante | 🟢 visuel (styles aujourd'hui **en ligne**) · 🔴 `data-moto-actif` |
| Lignes : moteur, puissance, 0–100*, V-max*, millésimes, origine, catégorie, rareté | `.specs-info` | — | 🟢 (*présents seulement si `INFO` les porte : 63 / 91 voitures) |
| « Le saviez-vous » | `.fact` (`INFO.fact`, 499 voitures) sinon description de catégorie | — | 🟢 |
| Fiche technique détaillée, ratios, générations & motorisations | **[greffe]** `greffer()` → `blocHTML(id)`, en fin de dernière page | lit `SPECS`, `GENS`, `MOTOR_SPECS`, `data-moto-actif` | 🟢 visuel · 🔴 logique (`CLAUDE.md` §2–§4) |
| « Associer » / « Classer » (voitures « Non classé ») | **[greffe]** `grefferClasser()` → `.gcl-btn` dans `.info-head` | réaffectation d'une prise | ⚙️ |
| Voiture non capturée | message « Pas encore au garage » ; **rien de technique greffé** | `data-verrou` | 🔴 le verrou est une mécanique de jeu |

## 4. Garage (onglet `collection`)

| Élément | Code | Déclenche | Statut |
|---|---|---|---|
| Panneau repliable « Progression 1/187 » regroupant tuiles de rareté et filtres | **[greffe]** `grefferGarage()` → `.gst` / `.gst-in` / `[data-gst]`, qui replie `.tiles` et `.filters` | ouvre / ferme | 🟢 visuel · 🔴 `.tiles`, `.tile`, `.lab span`, `.filters` |
| Tuiles de rareté (Tous, Courant… Légendaire, `n/total`) | `viewCollection()` → `tile()` → `[data-rarity]` | filtre par rareté | 🟢 |
| Complétude par marque / par pays | `rail()` → `.rail-row[data-filter][data-val]`, `[data-toggle="brands"\|"countries"]` | filtre ; déplier | 🟢 · 🔴 `.rail-head .v.done` |
| Recherche, marque, type, tri, Toutes / Au garage / Manquantes | `.filters` : `#q`, `#brandSel`, `#catSel`, `#sortSel`, `[data-status]` | `visibleCars()` | 🟢 |
| Grille de voitures | `collectionResultsHTML()` → `carCard()` → `.card[data-car]` : `.thumb` (photo de couverture, sinon silhouette + cadenas), pastille, drapeau, coche, favori, `.cmeta` (rareté, nom, marque · catégorie) | `openDetail()` | 🟢 visuel · 🔴 `[data-car]` |
| « Non classé » | `unclassedHTML()` | — | 🟢 |

## 5. Défis (onglet `defis`)

| Élément | Code | Statut |
|---|---|---|
| Classement / rang | `rankMissionsHTML()` → `.rankbar` | 🟢 visuel · 🔴 `.rankbar` (point d'ancrage de 3 greffes) |
| Missions | `rankMissionsHTML()` | 🟢 |
| Collections thématiques | **[greffe]** `grefferCollecs()` → `.gcl-wrap` | 🟢 visuel · ⚙️ |
| Mystère du jour | **[greffe]** `grefferMystere()` → `.gmy-wrap`, `#gmy-q`, `[data-my]` | 🟢 visuel · ⚙️ |

## 6. Favoris, Plus et sous-pages

| Écran | Code | Statut |
|---|---|---|
| Favoris (prises marquées d'une étoile, les plus récentes d'abord) | `viewFavorites()` | 🟢 |
| Plus : Carte de chasse · Statistiques & équipage · Trophées · Réglages | `viewPlus()` → `.plus-row[data-tab]` ; retour `subBackHTML()` → `.subback` | 🟢 |
| Carte de chasse | `viewMap()` + `initHuntMap()` → `#huntMap` ; repères `L.circleMarker` (couleur de rareté) ; bulle « Voir la fiche » `[data-car]` ; en sombre, **les tuiles OpenStreetMap sont inversées par filtre CSS** (`.map-dark`) | 🟢 visuel · ⚙️ (bancs `banc-carte*.js`) · palette de notre carte à définir |
| Statistiques & équipage | `viewStats()` + `crewHTML()` | 🟢 |
| Trophées | `viewTrophies()` | 🟢 |
| Réglages : thème, IA, sauvegarde, installation, export / import, équipage, compte | `viewSettings()` + `extraSettingsHTML()` ; `[data-theme-set]`, `[data-act="export"\|"import"\|"reset"\|"install"\|"notif"\|"feedback"\|"shareprofile"\|"importprofile"]` ; **[greffe]** version `grefferVersion()` → `.gvr` ; compte : `gm-compte.js` (en sommeil) | 🟢 visuel · ⚙️ actions |

---

## 7. Ce qu'un nouveau design ne doit jamais casser (récapitulatif 🔴)

Sélecteurs et attributs lus par `gm-specs.js` ou par les bancs : `#view`,
`#overlay`, `#overlay .sheet`, `#overlay .detail-hero` et son `img`,
`.rv-card img`, `.info-head` et `.info-head h2`, `.detail-shell` et ses
attributs `data-car-id` / `data-brand` / `data-rarity` / `data-verrou`,
`[data-moto-actif]`, `[data-car]`, `[data-tab]`, `.rankbar`, `.tiles`, `.tile`,
`.lab span`, `.filters`, `.rail-head .v.done`, `.h2`.

Les fonctions de données restent telles quelles : `saveDraft()`,
`identifyCar()`, `GMMatcher.rapprocher()`, `release()`, `supprimerPhoto()`,
`importerDonnees()`, `fichePourInterface()`. **Un redesign change l'affichage,
pas ce qui est enregistré.**

## 8. Défauts d'UX relevés en faisant la carte (hors design pur)

> ✅ **Corrigés le 30/09 (v20.195.0)** : 1 à 4, par le parcours P0 (`design/SPEC-P0-*.md`,
> banc `banc-p0.js`). Les sections 2 ci-dessus décrivent l'état **d'avant** ; le
> nouvel enchaînement est : source → analyse (`draft.step="analyse"`) → résultat
> (`"resultat"`, `p0ResultatHTML()`) → formulaire → `showReveal()` → `showDebloque()`,
> ou `showMaj()` (déjà au garage), ou `flashCapture()` + `showBilanLot()` (lot).
> Restent ouverts : 5 et 6.

1. **Aucun état « analyse en cours »** pendant la reconnaissance (jusqu'à 15 s).
2. **`AMBIGU` présenté comme sûr** : un seul nom affiché, la seconde piste cachée.
3. **`AUCUNE_CORRESPONDANCE_SURE` muet** : le joueur ne sait pas que l'IA n'a rien trouvé.
4. **Confettis** à la révélation des voitures épiques et légendaires, contraires au brief.
5. Lien « Ouvrir dans Maps » au **bleu par défaut du navigateur**.
6. Styles du sélecteur de motorisation écrits **en ligne** : à passer en classes pour pouvoir les thématiser (clair / sombre).
