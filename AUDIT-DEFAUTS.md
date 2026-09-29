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
| **Accessibilité** | 🟡 A11y | 11 boutons réduits à une icône sans nom accessible, dont « Tout effacer » et « Retirer du garage » : un lecteur d'écran annonçait « bouton ». | `grep` | `aria-label` (et `aria-pressed` sur le favori) — **invisible à l'écran**, aucun changement de design |

## 2. Non corrigé — à décider

| Réf. | Gravité | Constat | Pourquoi pas corrigé ici | Action proposée |
|---|---|---|---|---|
| **Leaflet sans SRI** | 🟠 Chaîne d'approvisionnement | La carte charge `leaflet.min.js` depuis cdnjs **sans attribut `integrity`** : un CDN compromis exécuterait son code dans l'app. C'est aussi la seule dépendance externe, en tension avec l'invariant §1.2 (non documentée comme exception). | cdnjs est bloqué par le réseau de cet environnement : impossible de vérifier le hash. Un hash faux casserait la carte. | Ajouter `integrity="sha512-…"` + `crossorigin="anonymous"` (hash publié par cdnjs pour 1.9.4), ou héberger Leaflet dans le dépôt ; documenter l'exception au §1.2 |
| **Observateur de greffe** | 🟡 Performance | `autoInstall()` relance 5 greffons + `recadrerTout()` à **chaque** mutation du sous-arbre `#view` ; le bloc contient aussi un commentaire dupliqué et une indentation incohérente. | Toucher au moment de la greffe exige un passage complet au banc navigateur sur tous les onglets ; gain non mesuré. | Regrouper les appels dans un `requestAnimationFrame` (une passe par image), puis mesurer |
| **Taille des fichiers importés** | 🟡 Robustesse | `JSON.parse` d'un fichier arbitrairement gros ; nombre de photos par prise non plafonné (chaque photo l'est à 12 Mo). | Choix de produit (quelle limite ?). | Refuser au-delà d'une taille totale (ex. 200 Mo) et plafonner les photos par prise |
| **Alias `gm`** | ⚪ Dette | `gm-matcher.js` normalise `gm` → `general motors`, marque absente du catalogue. | Inoffensif. | Retirer à la prochaine révision du matcher |
| **Norme hp → ch (US)** | 🟠 Données | Explorer, Silverado, Tahoe, Suburban : puissances en hp SAE saisies comme des ch (420 hp = 426 ch), gammes multi-moteurs. | Arbitrage de version de référence nécessaire avant tout chiffre. | Voir `CONTEXT.md` |

## 3. Bancs après correction

audit 0 erreur / 0 alerte · matcher 17/17 · fusions 19/19 · DOM 14/14 · rendu 51/51 · rouleau 19/19 · **imports 18/18 (nouveau)**.
