# PASSATION — à lire en premier dans toute nouvelle session

> **Pourquoi ce fichier.** Une nouvelle session ne voit **rien** des conversations
> précédentes : seulement le dépôt. Ce fichier est le relais entre deux sessions.
> Il dit **où on en est, ce qui est prouvé, ce qui reste, et les pièges déjà payés**.
> Le détail vit ailleurs ; ici, on pointe vers lui.
>
> **Dernière mise à jour : 21/11/2026** (branche
> `claude/create-claude-documentation-8eo2t7`, version `20.208.0`). **En ligne : v20.207.0**
> (PR #4 puis PR #5, 21/11) : synchronisation automatique, attribution OpenStreetMap,
> « Envoyer un retour » par e-mail, sélecteur Essence/Diesel, corrections de la relecture
> du 21/11. Sur la branche, en attente de « merge » : l'adresse des retours (v20.208.0). Comptes, Google et
> relais IA **en service** (§2) : lire le §2 avant toute instruction au propriétaire.
> Le propriétaire suit la **feuille de route** en tête de `TUTO-GRATUIT.md` (étapes
> 1 à 19, uniquement ce qui reste) : c'est elle qu'on cite, par son numéro.
> **À mettre à jour à chaque fin de session** : remplacer, ne pas empiler (l'historique
> est dans `CONTEXT.md` et `git log`).

---

## 1. Démarrer une session : les 5 réflexes

1. **Branche** : `claude/create-claude-documentation-8eo2t7` (PR #1). Jamais `main`,
   qui a plus de 100 commits de retard. Si la session a démarré sur `main`, le dire
   au propriétaire **avant toute chose**.
2. **Règles du propriétaire** : `CLAUDE.md` §0 bis (pas de merge sans « merge », rien
   de payant, les clés jamais dans la conversation, son « go » avant toute
   modification de ses comptes). **Depuis le 26/10, le moment est délégué** : ce qui
   est utile maintenant (code, bancs, revues en lecture seule, docs, push sur la
   branche) se fait sans redemander.
3. **Bancs** : le hook de démarrage installe Playwright. Commande de contrôle :
   ```sh
   export NODE_PATH=$PWD/.claude/outils-bancs/node_modules CHROMIUM=/opt/pw-browsers/chromium
   for f in banc-*.js; do node $f >/dev/null 2>&1 && echo "OK $f" || echo "ÉCHEC $f"; done
   ```
   `/opt/pw-browsers/chromium` est un lien **stable** : le dossier versionné
   (`chromium-1194/…`) a changé d'une image à l'autre et les bancs ne démarraient plus.
   Dernier passage complet : **21/21 verts** (21/11, v20.207.0, configuration de
   production ; comptes navigateur 136 dont la synchro auto, dom 19, retouches 32, carte 10,
   `banc-galerie.js` 14, `banc-retour.js` 15), dont les nouveaux
   `banc-retouches.js` (28) et `banc-sw.js` (14) ; détail et mutations :
   `AUDIT-DEFAUTS.md`, « Seconde relecture ». ⚠️ **Aucun banc ne joint Google** : avec
   l'identifiant renseigné, ouvrir les Réglages charge le vrai script, et le 18/11 le
   cadre du bouton de Google a levé sa propre erreur (« gis is not defined ») dans
   `banc-imports.js`. Les bancs qui ouvrent les Réglages coupent `accounts.google.com`
   et `*.gstatic.com` (`ctx.route`) ; seul `banc-compte-navigateur.js` sert un **faux**
   script Google. Tout nouveau banc qui ouvre les Réglages fait de même. Après un banc navigateur :
   `git checkout -- banc-capture.png` (capture régénérée à chaque passage).
4. **Connecteurs** : si « Cloudflare Developer Platform » est branché, **constater**
   l'état réel du compte (Workers, variables, liaisons, D1) et le comparer au §2
   ci-dessous avant d'affirmer quoi que ce soit.
5. **Langue et posture** : français, ingénieur senior qui explique ses choix
   (préférences du compte du propriétaire).

---

## 2. État réel de la production — PROUVÉ, avec la source

⚠️ **Le dépôt n'est pas la production.** Le 02/10, j'ai affirmé que le relais
tournait sur Claude Haiku parce que `ai-relay-worker.js` de `main` l'appelle. C'était
faux. Seul le tableau de bord Cloudflare fait foi.

| Élément | État | Source |
|---|---|---|
| **App en ligne** (GitHub Pages, construite depuis `main`) | Version du **21/09**. Aucun travail fait depuis le 22/09 n'est en ligne | `git log origin/main` |
| **Base D1 `garage-comptes`** | **Existe**, juridiction **`eu`**, 6 tables + 2 index **identiques** à `cloud/schema.sql` (comparaison automatique). Id `e8f5ab27-78b9-40af-ae61-508a25afff13` | Connecteur, 04/10 (`d1_databases_list`, `sqlite_master`) |
| **Relais IA** `silent-firefly-2620` — **code** | **Nouveau code** collé le 18/11 (version `ff85a8c8`) : celui du dépôt au 11/11 (lecture bornée, IPv6 /64, confiance 0, quotas, purge, route unique, plus de `/notify`) | Connecteur, 18/11 (`workers_get_worker_code`, recoupé ligne à ligne avec le dépôt) |
| Relais — **réglages** | `GEMINI_API_KEY` = **Secret** = clé `…4KOg` « garage-manifest-relais » (**prouvé** le 18/11 : la reconnaissance marche encore après la suppression de CARDEX) · `IA_FOURNISSEUR=gemini` · `APP_ORIGIN=https://mcslec.github.io` · liaison **`DB` → `garage-comptes`** · `RESEND_API_KEY` **supprimée** · cron « 17 3 * * * » enregistré (capture du 18/11) | Captures du propriétaire, 18/11 |
| Reconnaissance photo | **Marche** (18/11) : test console `400` (requête sans image refusée avant tout quota), puis 3 vraies photos passées jusqu'à Gemini (compteurs D1 à 3, journal sans erreur), l'app propose des voitures | Connecteur (D1 `limites`) + Observability + propriétaire |
| Clés Gemini (AI Studio) | `…4KOg` « garage-manifest-relais » (celle du relais) ; « CARDEX » **supprimée** le 18/11 ; `…kvaw` « Default Gemini API Key » (inutilisée, à supprimer si rien d'autre ne s'en sert). Toutes en « Niveau sans frais ». ⚠️ AI Studio affiche l'utilisation **par projet** : CARDEX et la clé du relais étant dans le même projet, CARDEX semblait « utilisée » par les photos du relais | Captures du propriétaire, 18/11 |
| Claude Haiku | **N'a jamais tourné**, aucune clé Anthropic : rien de facturable | Code déployé + réglages |
| Compte Resend | Offre gratuite, **sans domaine**, **aucune clé** : « Garage manifest » (27/08) **révoquée le 26/10** par le connecteur (ménage délégué par le propriétaire ; aucun appelant légitime, l'app de `main` n'appelle pas `/notify`). La ligne `RESEND_API_KEY` du relais contient donc une clé morte : à supprimer par hygiène (feuille de route, étape 2). Une clé neuve se crée à l'étape 12. Adresse du compte toujours **à vérifier** (étape 12) | Connecteur Resend, `list-api-keys` vide le 26/10 et le 27/10 |
| R2 | Non activé (normal : mode essai, R2 exige une carte) | Connecteur, 02/10 |
| Serveur de comptes | **En ligne** depuis le 18/11 : Worker `garage-comptes`, code identique au dépôt (`VERSION_SERVEUR` 2026-11-10, relu par le connecteur), liaison `DB`, `APP_ORIGIN`, `MAIL_FROM` (onboarding@resend.dev), secrets `CODE_SECRET` et `RESEND_API_KEY`, cron « 17 3 * * * » enregistré. `/sante` : base et origine OK (capture) ; envoi d'un code **réussi** (`{"ok":true}` depuis l'app). ⚠️ Le connecteur Resend voit une **autre équipe** (aucune clé) que celle qui porte la clé du serveur : ne pas en conclure que la clé manque | Connecteur + captures du propriétaire, 18/11 |
| Code à coller (étapes 3 et 8) | Le dépôt a changé depuis le tuto du 27/10 (relais : lecture bornée, IPv6 /64, confiance 0 ; comptes : `/sante`, plafond global de codes…). **Aucune incidence** : les étapes collent le fichier brut de la branche, donc toujours la dernière version. Vérification de l'étape 15 = **`/sante`** → `"ok":true` (l'ancienne, `/garage`, passait sans base reliée) | Dépôt |
| Schéma de la base | **À jour** : 8 tables + 3 index, identiques au dépôt (C0 fait par le connecteur le 14/10, sur « go ») | Connecteur, `sqlite_master` comparé au dépôt |
| Connexion Google | Projet Google Cloud **« Garage Manifest »** (compte dédié ou perso du propriétaire), écran de consentement créé (Externe, **mode Test** au 18/11), client **Web** « Garage Manifest web », origine `https://mcslec.github.io`. ID client (public) inscrit dans `gm-compte.js` le 18/11 (v20.201.0). *Code secret du client* apparu sur une capture : **remplacé le 20/11** (l'ancien supprimé, dit par le propriétaire). Reste : sa confirmation de F8. **F5 faite le 19/11** : mode Test, le propriétaire inscrit comme utilisateur test (1/100 ; « Publier » reste grisé tant qu'il manque une page de confidentialité publiée). Variable `GOOGLE_CLIENT_ID` (Texte) **déployée** sur `garage-comptes` le 18/11 (F6, capture du tableau de bord) ; **`/sante` → `"google":true` constaté le 18/11** (capture : `ok`, `base`, `reglages` vrais, `manquants` vide, `photos:false` attendu sans R2). `/sante` dit « présent », pas « identique à l'app » : la concordance des deux valeurs ne se prouve qu'à l'essai F8. Futurs clients Android / iOS : à **ajouter** dans le même projet ; iOS demandera que le serveur accepte plusieurs identifiants | Captures du propriétaire, 18/11 |
| Comptes dans l'app | `COMPTE_URL` = `https://garage-comptes.cyril-lapopin.workers.dev` (18/11, v20.200.0), **en ligne** depuis la PR #1. Hors connexion : aucune requête (banc). **Connecté, à partir de v20.205.0 (branche, pas encore en ligne)** : synchronisation automatique — récupération à l'ouverture si le cloud a changé, envoi quelques secondes après chaque geste. Au premier lancement de cette version, un téléphone déjà connecté fait **une** récupération complète (signature du cloud encore inconnue), puis plus rien tant que rien ne change | Dépôt |

**Ce que les connecteurs permettent** (vérifié le 07/10 ; le 22/10, le connecteur Cloudflare s'annonce **déprécié** au profit de `https://mcp.cloudflare.com/mcp`, qui couvre toute l'API. Il n'est **pas** branché : le propriétaire l'ajoute sur `claude.ai/customize/connectors`, puis ouvre une **nouvelle** session (les connecteurs se lisent au démarrage). Il permettrait à la session de faire la partie non secrète de B et C, toujours après « go ») : Cloudflare = lire les
Workers et leur code, créer et interroger D1. **Pas** de juridiction à la création,
**pas** d'écriture de variables, liaisons, cron ni code : tout cela se fait par le
propriétaire, guidé. `workers_get_worker` **n'est pas appelé** : il pourrait renvoyer
en clair les clés rangées en Variable. Resend = lire, et révoquer une clé (après « go »).
Le conteneur **ne joint pas** `*.workers.dev` (politique réseau) : les sondages du
relais se font depuis le navigateur du propriétaire (`TUTO-GRATUIT.md` B5).

---

## 3. Ce qui reste : la prochaine étape concrète

> **19/11 — PR #1 fusionnée** à la demande du propriétaire (« merge »), après relecture
> en lecture seule : 6 constats **non bloquants** (`AUDIT-DEFAUTS.md` §11, F-1 à F-6),
> à traiter dans une prochaine session, test d'abord. Reste au propriétaire : essais
> sur téléphone (étape 18, F8), suppression du code secret Google.
>
> **Constaté en production le 19/11 (D1, lecture seule)** : 1 compte, 1 liaison Google
> (la connexion Google a donc abouti au moins une fois), 1 garage en **version 3**
> (12 Ko, 39 voitures, sans photos), dernière écriture 23:52 UTC. La sauvegarde
> fonctionne ; son message est invisible (F-9). Le relais avait une surcharge locale
> avec « / » final, vidée par le propriétaire (F-7). F8 et l'étape 18 ne sont pas
> cochées tant que le propriétaire ne l'a pas dit.
>
> **19/11 — PR #2 fusionnée** sur « vas-y merge ça » : bouton « Enregistrer cette photo
> sur le téléphone » (v20.202.0, `banc-galerie.js`) **en ligne**. Méthode qui a servi :
> la branche reprend `main` après chaque fusion (avance rapide), la mise en ligne
> suivante passe par une **nouvelle PR**, ouverte seulement sur demande du propriétaire.
> Prochain lot proposé : F-7 à F-9 (`AUDIT-DEFAUTS.md` §11), puis F-1 à F-6.
>
> **19/11, lot F-1 à F-9 traité — sur la branche, PAS en ligne** (v20.203.0, `gm-compte.js`
> 2.6.0) : 7 corrigés, F-6 sans changement (non reproductible), F-2 reporté (remède au
> niveau du contrat `GMGarage`). Détail et mutations : `AUDIT-DEFAUTS.md` §11. Mise en
> ligne : nouvelle PR sur « merge » du propriétaire.
>
> **19/11, ensuite — sur la branche aussi** (v20.204.0) : bouton **retour** du téléphone
> (`banc-retour.js`) et carte qui recouvrait la fiche ouverte depuis elle (`banc-carte.js`).
> ⚠️ Tout nouvel écran plein écran s'ajoute à `COUCHES_RETOUR` (`CLAUDE.md` §3).
>
> **19/11 — PR #3 fusionnée** sur « MERGE PR » : lot F-1 à F-9, bouton retour et carte
> **en ligne** (v20.204.0). La branche reprend `main` (avance rapide).
>
> **20/11 — étape 18 faite** : connexion par **code e-mail** essayée sur le téléphone
> (e-mail reçu, code validé, dit par le propriétaire). Constat D1 en lecture seule : 1 compte,
> 1 session, 1 liaison Google, aucun code en attente (consommé) → le code e-mail et Google
> ouvrent **le même compte**. Garage en version 4.
>
> **20/11 — sur la branche, PAS en ligne** (v20.206.0, `gm-compte.js` 2.7.0, `APP_VERSION`
> 3.4.0) : **synchronisation automatique** (« go synchro auto ») — contrat et invariants dans
> `CLAUDE.md` §8 quinquies ; **attribution OpenStreetMap** sur la carte vide ; **« Envoyer un
> retour »** ouvre la messagerie (`mailto:`) au lieu de la feuille de partage (signalé par le
> propriétaire, capture Windows). Adresse du destinataire : l'adresse **dédiée**
> `garagemanifest.app@gmail.com`, créée et donnée par le propriétaire le 21/11 (v20.208.0) —
> ne jamais y mettre son adresse personnelle. Piège trouvé au banc : un lien `mailto:` déclenche
> `beforeunload` dans Chromium → `ouvrirExterne()` (`CLAUDE.md` §3). Mise en ligne : nouvelle
> PR sur « merge » du propriétaire, puis son essai sur deux appareils. Puis (v20.206.0) :
> choisir Essence / Diesel ne ramène plus sur la photo (fiche redessinée = position gardée,
> `CLAUDE.md` §3, `banc-dom.js`).
>
> **21/11 — PR #4 fusionnée** sur « merge et relis » : v20.206.0 **en ligne** (déploiement
> Pages `3edba2d` réussi). La branche reprend `main` (avance rapide). Puis, **sur la branche**
> (v20.207.0, `gm-compte.js` 2.7.1) : corrections de la relecture du 21/11 — silence des
> récupérations porté **par écriture** (un geste fait pendant une récupération était perdu
> pour la synchro), relance d'une récupération en échec, photos envoyées seules quand le
> serveur gagne R2, préférence « désactivée » gardée à la déconnexion, garde `mailto:` d'une
> seconde. Non fait : `304` sur `If-None-Match` (redéploiement serveur, `CLAUDE.md` §8 quinquies).
>
> **21/11 — PR #5 fusionnée** sur « merge » : v20.207.0 **en ligne**. Reste au propriétaire :
> l'essai de la synchro sur deux appareils (`RESTE-A-FAIRE.md` §5). Puis, sur la branche
> (v20.208.0) : l'adresse dédiée aux retours, inscrite (`banc-retour.js` 16).
> Photos : toujours hors du cloud (R2 exige une carte, refusée : `RESTE-A-FAIRE.md` §0).

**État au 27/10 : A faite, B à moitié.** Le propriétaire suit la feuille de route de
`TUTO-GRATUIT.md` (étapes 1 à 19) ; le tableau ci-dessous en est la version session.
**Ordre de la feuille** : B3 → fin de B4 → B2 → B2 bis → B5, puis C dans l'ordre
3-4-5 (texte) → C2 → C1 → C6 → C7 (chaque secret fabriqué juste avant d'être collé). Le propriétaire ne lance pas de ligne de
commande : tout se fait dans le navigateur (souvent **sur téléphone** : captures
Android), ou par les connecteurs pour ce qu'ils savent faire. ⚠️ Dire **précisément
ce qui reste** : une liste qui renumérote des étapes déjà faites lui fait croire
qu'on lui fait tout refaire (vécu le 04/10).

| Ordre | Étape | Qui | État |
|---|---|---|---|
| ✅ | **A** — base D1 `garage-comptes`, juridiction UE, schéma | Propriétaire (création) + connecteur (schéma, vérification) | Fait et prouvé le 04/10 |
| ✅ | **B1** clé Gemini neuve ; **B4** Secret + `IA_FOURNISSEUR` + `APP_ORIGIN` | Propriétaire | Fait le 04/10 (capture) |
| 1 | **B3** — liaison D1 `DB` → `garage-comptes` (feuille : étape 1) | Propriétaire | **À faire** |
| 2 | **B4 (fin)** — supprimer `RESEND_API_KEY` du relais (clé déjà révoquée : hygiène ; étape 2) | Propriétaire | **À faire** |
| 3 | **B2** — coller le nouveau `ai-relay-worker.js` (**celui du 07/10, avec purge**), puis la session relit le code déployé par le connecteur et le compare au dépôt | Propriétaire + session | À faire |
| 4 | **B2 bis** — cron `17 3 * * *` sur le relais (**après** B2) | Propriétaire | À faire |
| 5 | **B5** — sondage sans image (sur ordinateur, facultatif) puis vraie photo, onglet *Observability* ouvert ; ensuite supprimer la clé « CARDEX » | Propriétaire | À faire |
| ✅ | **C0** — tables de la connexion Google ajoutées à la base | Connecteur | Fait et prouvé le 14/10 |
| 6 | **C** — serveur de comptes, **sans R2**, `MAIL_FROM=Garage Manifest <onboarding@resend.dev>`, clé Resend neuve (l'ancienne **déjà révoquée**), `CODE_SECRET`, cron **indispensable** (étapes 8 à 15) | Propriétaire (secrets) + session | — |
| 7 | **D** — adresse du Worker → `COMPTE_URL`, bump `VERSION_MODULE` + `sw.js`, bancs, livraison | Session | — |
| 8 | **E** — test sur téléphone. **Exige la fusion de la PR #1** | Propriétaire | — |
| 9 | **F** (facultatif) — identifiant Google (gratuit), variable `GOOGLE_CLIENT_ID` du serveur, puis la session le met dans `gm-compte.js` ; essai sur iPhone | Propriétaire + session | — |

**Compatibilité vérifiée** : le nouveau relais et l'app de `main` utilisent le même
contrat (`POST {image}` → `[{brand, model, variant, cues, confidence}]`), le même nom
de clé et le même modèle. La partie B ne demande **aucune** fusion.

---

## 4. Décisions qui attendent le propriétaire

Posées **une fois**, détaillées dans `RESTE-A-FAIRE.md`. Ne pas les reposer : attendre
qu'il en parle.

- **« merge »** de la PR #1. Revues déjà faites : `/security-review` (connexion
  Google, 23/10) et `/code-review` (34 commits, 26/10), toutes les pistes corrigées ou
  justifiées dans `AUDIT-DEFAUTS.md`. Conseil donné : merger **après** la réussite de
  B5 (une seule variable à la fois). Une nouvelle revue ne se justifie que si du code
  change d'ici là (par exemple `COMPTE_URL` à l'étape D).
- **« go fiche »** : aligner la fiche voiture sur les maquettes (`DESIGN.md`,
  `design/`), avec les seules données réelles.
- **« OSM a »** : afficher l'attribution OpenStreetMap même quand la carte est vide
  (obligation de licence, `RESTE-A-FAIRE.md` §1).
- **Palette de carte** demandée à ChatGPT (`design/BRIEF-CHATGPT-CARTE.md`) : le
  propriétaire doit rapporter un JSON.
- Chantiers en attente de décision : i18n (B), intégration du Rouleau (C), chantier D
  (≈ 2 000 valeurs à sourcer, **ne pas lancer**), choix de la sauvegarde manuelle ou
  automatique.
- Plus tard, en payant : domaine (≈ 10 €/an) et R2 → comptes ouverts au public et
  carte hébergée chez nous.

---

## 5. Pièges déjà payés (ne pas les reproduire)

| Piège | Ce qui s'est passé | Le réflexe |
|---|---|---|
| Dépôt ≠ production | « Haiku tourne », « à tes frais » : affirmé sur la foi du dépôt, faux | Constater sur le tableau de bord avant d'affirmer |
| Chercher dans un seul fichier | Bouton corbeille ajouté alors que `gm-specs.js` en greffait déjà un | Chercher aussi dans `gm-specs.js` (`CLAUDE.md` §2.3) |
| Fichiers dans le scratchpad | Le propriétaire ne pouvait pas les ouvrir | Livrer dans le dépôt + `SendUserFile` |
| Appliquer une liste du banc en bloc | 6 valeurs justes cassées | `CLAUDE.md` §5 bis : ligne par ligne |
| Format de clé Gemini `AQ.` | Rejeté en `?key=` chez beaucoup d'utilisateurs, accepté chez le propriétaire | Le nouveau relais passe par l'en-tête `x-goog-api-key` : ne pas revenir à `?key=` |
| Confondre 501 et 503 côté comptes | Un 503 traité comme « pas de stockage photo » réécrirait le cloud sans des photos qui existent | `CLAUDE.md` §8 quinquies |
| Relancer une question | Le propriétaire a demandé d'arrêter | Une fois, puis `RESTE-A-FAIRE.md` |
| Supposer qu'un connecteur sait tout faire | Le connecteur Cloudflare ne règle ni juridiction, ni variables, ni liaisons | Lister ses outils (`ToolSearch`) avant de promettre une action |
| Écrire un résultat de mutation de mémoire | Le 27/10, le rapport allait affirmer que deux mutations de R-2 étaient détectées ; relancées, l'une ne l'est pas — et ne doit pas l'être (la date protège seule, la levée de pierre tombale n'est que du rangement) | Relancer la mutation **avant** d'écrire son résultat, sur une copie hors dépôt |
| Une purge qui vit dans un autre service | Le relais écrivait des empreintes d'IP que seul le serveur de comptes (pas encore déployé) effaçait | Chaque service purge ce qu'il écrit ; table partagée → même règle, vérifiée au banc |

---

## 6. Où trouver quoi

| Besoin | Fichier |
|---|---|
| Règles, invariants, contrats entre modules | `CLAUDE.md` (lu automatiquement) |
| Pourquoi les choix ont été faits ; journal daté | `CONTEXT.md` (journal en fin de fichier, section relais) |
| Ce que seul le propriétaire peut faire | `RESTE-A-FAIRE.md` |
| Déploiement pas à pas, dans le navigateur | `TUTO-GRATUIT.md` |
| Brancher les connecteurs Cloudflare / Resend, ouvrir une session sur la bonne branche | `TUTO-CONNECTEURS.md` |
| Déploiement en ligne de commande, invariants serveur | `cloud/DEPLOIEMENT.md` |
| Collecte de données (RGPD) | `cloud/CONFIDENTIALITE.md`, **dans le même commit** que tout changement de collecte |
| Direction visuelle | `DESIGN.md`, `design/` |
