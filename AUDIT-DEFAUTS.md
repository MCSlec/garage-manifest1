# Chasse aux défauts — 29/09/2026

> Revue du code et des données de Garage Manifest (`index.html`, `gm-specs.js`,
> `gm-matcher.js`, `gm-rouleau.js`, `sw.js`, bancs). Chaque défaut **corrigé**
> a été reproduit **avant** correction, puis couvert par un banc qui échoue sur
> l'ancien code (test par mutation). Ce qui n'est pas corrigé est listé avec la
> raison et l'action proposée.

## 1. Corrigé

| Réf. | Gravité | Défaut | Preuve | Correctif |
|---|---|---|---|---|
| **DT-09** | 🔴 Sécurité | L'id d'une voiture « Non classé » importée n'était contrôlé que sur son préfixe `custom:`, puis injecté tel quel dans `data-car="…"`. Une sauvegarde forgée sortait de l'attribut et exécutait du script — persisté en base, donc rejoué à chaque démarrage. | `banc-imports.js` sur l'ancien code : la charge s'exécute (`__pwned` = 2 à l'import, 3 au redémarrage) | `CUSTOM_ID_RE = /^custom:[a-z0-9-]{1,110}$/` (exactement ce que `createCustomCar` produit), appliqué à l'import **et** au démarrage |
| **DT-10** | 🔴 Sécurité | La sauvegarde recopiait `meta.friends` sans contrôle ; le classement interpole `score` et `count` sans échappement (ce sont censément des nombres). HTML exécuté à l'ouverture de l'onglet Équipage. | idem | `sanitizeFriend` / `sanitizeFeed` / `sanitizeMissions` : nombres finis bornés, textes tronqués, légendes limitées aux ids du catalogue ; appliqués à l'import de sauvegarde, à l'import de profil **et** au démarrage |
| **DT-10 bis** | 🟠 Robustesse | Une valeur de défi non-tableau (`missions[clé] = "texte"`) faisait planter `missionsFor()` à **chaque rendu** : application inutilisable jusqu'à effacement manuel. Un `bonus` à `Infinity` rendait le score infini. | idem | Idem : seuls les tableaux de chaînes sont conservés ; bonus borné |
| **Greffe par titre** | 🟠 Logique | `greffer()` retrouvait la voiture par le **texte du titre**. Une « Non classé » baptisée « Ferrari F40 » par le joueur recevait la fiche technique de la vraie F40. | `banc-imports.js` : la fiche se greffe sur l'homonyme avec l'ancien `greffer()` | Nouveau marqueur de contrat DOM **`data-car-id`** (§3) ; aucune fiche sur un id `custom:` ; le titre reste un repli pour un `index.html` plus ancien encore en cache |
| **Marques en double** | 🟠 Données | « MINI » (5 entrées de `CARS`) / « Mini » (3 de `CATALOGUE_PLUS`), « NIO » / « Nio » : deux entrées dans le filtre des marques, comptées deux fois. Surtout, la liste premium disait `'Mini'` : les « MINI » n'étaient pas reconnues et **la Cooper, déclarée `commun`, passait `courant` à l'exécution**. | Mesure directe : `mini-cooper r = courant` | Orthographe officielle `MINI` / `NIO` partout ; nouveau contrôle `MARQUE EN DOUBLE` dans `banc-audit.js` (ERREUR), vérifié par mutation |
| **SW : repli vide** | 🟡 Robustesse | Hors ligne, sur une ressource jamais mise en cache, `respondWith()` recevait `undefined` (TypeError dans la console au lieu d'un échec réseau propre). Trois chemins concernés. | Lecture du code | `Response.error()` en dernier recours |
| **`escapeHtml(0)`** | 🟡 Affichage | `String(s \|\| "")` faisait disparaître un `0` (compteur, année). | Lecture du code | `String(s ?? "")` |
| **Taille des imports** | 🟡 Robustesse | `file.text()` chargeait tout en mémoire avant le moindre contrôle : un fichier démesuré figeait puis tuait l'onglet sans message. | `banc-imports.js` | Contrôle **avant lecture** : sauvegarde ≤ 500 Mo (limite pratique d'une chaîne JS) et ≤ espace libre de l'appareil ; profil ≤ 1 Mo ; 50 photos max par voiture. Messages explicites |
| **Bandeau pub au-dessus des fiches** | 🟠 Affichage | Le bandeau sponsor avait un `z-index` de 120, le voile des fiches 50 : configuré, il serait passé **par-dessus** une fiche ouverte, et il recouvrait le bas des listes. | Banc navigateur | `z-index` 29 (sous les onglets et les fiches), hauteur réservée au contenu, aux toasts et à l'avis de mise à jour |
| **Accessibilité** | 🟡 A11y | 11 boutons réduits à une icône sans nom accessible, dont « Tout effacer » et « Retirer du garage » : un lecteur d'écran annonçait « bouton ». | `grep` | `aria-label` (et `aria-pressed` sur le favori) — **invisible à l'écran**, aucun changement de design |

## 2. Non corrigé — à décider

| Réf. | Gravité | Constat | Pourquoi pas corrigé ici | Action proposée |
|---|---|---|---|---|
| **Leaflet sans SRI** | 🟠 Chaîne d'approvisionnement | La carte charge `leaflet.min.js` depuis cdnjs **sans attribut `integrity`** : un CDN compromis exécuterait son code dans l'app. C'est aussi la seule dépendance externe, en tension avec l'invariant §1.2 (non documentée comme exception). | cdnjs est bloqué par le réseau de cet environnement : impossible de vérifier le hash. Un hash faux casserait la carte. | Ajouter `integrity="sha512-…"` + `crossorigin="anonymous"` (hash publié par cdnjs pour 1.9.4), ou héberger Leaflet dans le dépôt ; documenter l'exception au §1.2 |
| **Observateur de greffe** | 🟡 Performance | `autoInstall()` relance 5 greffons + `recadrerTout()` à **chaque** mutation du sous-arbre `#view` ; le bloc contient aussi un commentaire dupliqué et une indentation incohérente. | Toucher au moment de la greffe exige un passage complet au banc navigateur sur tous les onglets ; gain non mesuré. | Regrouper les appels dans un `requestAnimationFrame` (une passe par image), puis mesurer |
| **Alias `gm`** | ⚪ Dette | `gm-matcher.js` normalise `gm` → `general motors`, marque absente du catalogue. | Inoffensif. | Retirer à la prochaine révision du matcher |
| **Norme hp → ch (US)** | 🟠 Données | Explorer, Silverado, Tahoe, Suburban : puissances en hp SAE saisies comme des ch (420 hp = 426 ch), gammes multi-moteurs. | Arbitrage de version de référence nécessaire avant tout chiffre. | Voir `CONTEXT.md` |

## 2 bis. Deux couches de données qui se contredisent : `INFO` ↔ `SPECS`

`index.html` porte une table **`INFO`** (moteur, puissance, 0-100, V-max) affichée
en **première page** de fiche ; `gm-specs.js` greffe la fiche **`SPECS`** en
dernière page. Pour les voitures sans sélecteur de motorisation, les deux
puissances s'affichent en même temps. Comparaison automatique : **35 écarts sur
382** (tolérance ± 7 %).

**Tranchés ce 29/09 (6)** — `INFO` avait raison, la fiche décrivait une autre
version (§4.5 bis) : 635 CSi (portait la M635CSi), XK8 (portait la XKR), Lotus
Elan (portait la Sprint), LS 400 (puissance sans référent), Opel GT (SAE sans
couple assorti) ; Charger : `INFO` élargi à la V6 de base.

**Restent 29**, à trancher cas par cas sur source. La plupart sont des légendes ou
des voitures de course, où `INFO` cite une autre version (course, qualification,
lignée entière) : ce n'est pas forcément la fiche qui a tort.

| Entrée | Fiche | `INFO` (puissance) | Fiche (ch · cylindrée) |
|---|---|---|---|
| `bugatti-eb110` | Bugatti EB110 Super Sport | ≈ 560 ch | 611 ch 3.5L |
| `lambo-miura` | Lamborghini Miura P400 SV | ≈ 350 ch | 385 ch 3.9L |
| `koenigsegg-agera-rs` | Koenigsegg Agera RS | ≈ 1160 ch | 1360 ch 5L |
| `koenigsegg-gemera` | Koenigsegg Gemera | ≈ 1700 ch | 2300 ch 5L |
| `mazda-rx7` | Mazda RX-7 (FD) | ≈ 280 ch | 255 ch 1.308L |
| `czinger-21c` | Czinger 21C | ≈ 1250 ch | 1350 ch 2.9L |
| `mclaren-mp44` | McLaren MP4/4 (F1 1988) | ≈ 900+ ch (qualif) | 685 ch 1.5L |
| `audi-s1-e2` | Audi Sport quattro S1 E2 | ≈ 550+ ch | 500 ch 2.1L |
| `ford-rs200` | Ford RS200 | ≈ 450 ch (course) | 250 ch 1.8L |
| `mg-metro-6r4` | MG Metro 6R4 | ≈ 410 ch | 250 ch 3L |
| `radical-sr3` | Radical SR3 | ≈ 226–232 ch | 260 ch 1.5L |
| `jensen-interceptor` | Jensen Interceptor | ≈ 330 ch | 390 ch 7.2L |
| `toyota-century` | Toyota Century | ≈ 280 ch | 431 ch 5L |
| `bmw-m6` | BMW M6 | ≈ 507 ch | 560 ch 4.4L |
| `ultima-gtr` | Ultima GTR / RS | ≈ 534–720 ch | 1020 ch 6.8L |
| `ford-thunderbird-55` | Ford Thunderbird (1955) | ≈ 198 ch | 215 ch 4.8L |
| `ford-crown-victoria` | Ford Crown Victoria | ≈ 220 ch | 250 ch 4.6L |
| `amc-javelin` | AMC Javelin / AMX | ≈ 315 ch | 340 ch 6.4L |
| `cord-810` | Cord 810 / 812 | ≈ 170 ch | 127 ch 4.7L |
| `studebaker-avanti` | Studebaker Avanti | ≈ 240 ch | 290 ch 4.7L |
| `vw-phaeton` | Volkswagen Phaeton | ≈ 420 ch (W12) | 450 ch 6L |
| `jaguar-xk120` | Jaguar XK120 | ≈ 160 ch | 180 ch 3.4L |
| `tatra-t87` | Tatra T87 | ≈ 85 ch | 75 ch 3L |
| `porsche-935` | Porsche 935 « Moby Dick » | ≈ 750+ ch | 845 ch 3.2L |
| `matra-ms670` | Matra MS670 | ≈ 450 ch | 490 ch 3L |
| `donkervoort-d8` | Donkervoort D8 GTO | ≈ 385 ch | 415 ch 2.5L |
| `vw-sp2` | Volkswagen SP2 | ≈ 65 ch | 75 ch 1.7L |
| `nissan-r390` | Nissan R390 GT1 | ≈ 650 ch | 550 ch 3.5L |
| `brabus-rocket` | Brabus Rocket 1000 | ≈ 730–900 ch | 1000 ch 4.5L |

**Proposition d'architecture** (non appliquée : change le contenu affiché) : pour
toute voiture dotée d'une fiche, dériver la puissance de `INFO` depuis `SPECS`
au rendu — une seule source de vérité, conformément au principe « rien n'est
stocké s'il peut être calculé ». `INFO` ne garderait que ce que `SPECS` n'a pas
(0-100, V-max, anecdote).

## 3. Bancs après correction

audit 0 erreur / 0 alerte · matcher 17/17 · fusions 19/19 · DOM 14/14 · rendu 51/51 · rouleau 19/19 · **imports 18/18 (nouveau)**.
