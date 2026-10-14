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
| **Leaflet sans SRI** | ✅ Résolu le 29/09 | Leaflet chargé depuis cdnjs sans contrôle d'intégrité. | — | **Hébergé dans le dépôt** (`vendor/leaflet`, v1.9.4 du registre npm), mis en cache hors ligne ; `banc-carte.js` vérifie qu'aucun script ni style ne vient d'un autre domaine (mutation : l'ancien chargeur échoue 6 tests sur 7) |
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

**29 septembre, suite : les 29 restants tranchés sur source → 0 écart sur 382.**
- **La fiche décrivait une autre version** (§4.5 bis), corrigée : EB110 (Super Sport → GT), Miura (P400 SV → P400), Agera RS et Czinger 21C (option payante → série), Jensen (7.2 → 6.3), Thunderbird 1955 (312 → 292), Crown Victoria (Police Interceptor → civile), Avanti (R2 compresseur → R1), Phaeton (W12 → V6 TDI), XK120 (SE → standard), D8 GTO (JD70 → 2013), AMC Javelin/AMX (401 → AMX 390), SP2 (SAE → DIN).
- **Voitures de course décrites en version routière**, alors que l'entrée est en catégorie « Course » : RS200 et Metro 6R4 (250 ch → 450 / 416 ch de rallye), R390 GT1 (550 → 650 ch de course).
- **`INFO` périmé ou faux**, corrigé : Gemera (1 700 ch jamais produite → HV8 2 332 ch), MP4/4 (« 900+ ch en qualif » : impossible en 1988 avec une pression de suralimentation limitée à 2,5 bar → 685 ch), 935 (→ 845 ch).
- **L'entrée couvre une lignée** : `INFO` élargi à la plage réelle (Century, M6, Cord, MS670, Rocket, RX-7, Tatra, S1 E2).
- **Valeurs impossibles retirées** : Radical SR3 (280 Nm pour un 1.5 d'origine moto → couple retiré, SR3 de 2002 à 252 bhp) ; Ultima (RS-1020 : 1 034 ch et 920 Nm, V8 6.2 et non 6.8).

Le contrôle est désormais **permanent** : `banc-audit.js`, E quater (ALERTE), vérifié par mutation.

**Proposition d'architecture** (non appliquée : change le contenu affiché) : pour
toute voiture dotée d'une fiche, dériver la puissance de `INFO` depuis `SPECS`
au rendu — une seule source de vérité, conformément au principe « rien n'est
stocké s'il peut être calculé ». `INFO` ne garderait que ce que `SPECS` n'a pas
(0-100, V-max, anecdote).

## 3. Bancs après correction

audit 0 erreur / 0 alerte · matcher 17/17 · fusions 19/19 · DOM 14/14 · rendu 51/51 · rouleau 19/19 · **imports 18/18 (nouveau)**.
