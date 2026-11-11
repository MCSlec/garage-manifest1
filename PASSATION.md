# PASSATION — à lire en premier dans toute nouvelle session

> **Pourquoi ce fichier.** Une nouvelle session ne voit **rien** des conversations
> précédentes : seulement le dépôt. Ce fichier est le relais entre deux sessions.
> Il dit **où on en est, ce qui est prouvé, ce qui reste, et les pièges déjà payés**.
> Le détail vit ailleurs ; ici, on pointe vers lui.
>
> **Dernière mise à jour : 27/10/2026** (branche
> `claude/create-claude-documentation-8eo2t7`, version `20.198.0`). **Partie B du
> tuto en cours, à moitié faite** : lire le §2 avant toute instruction au propriétaire.
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
   export NODE_PATH=$PWD/.claude/outils-bancs/node_modules CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome
   for f in banc-*.js; do node $f >/dev/null 2>&1 && echo "OK $f" || echo "ÉCHEC $f"; done
   ```
   Dernier passage complet : **17/17 verts** (27/10, v20.198.0), après les correctifs de
   la relecture de code du 26/10 (`banc-compte` 100, `banc-compte-navigateur` 72,
   `banc-p0` 28 ; détail : `AUDIT-DEFAUTS.md`, « Relecture de code du 26/10 »).
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
| **Relais IA** `silent-firefly-2620` — **code** | Toujours l'**ancien** (Gemini du 31/08, clé en `?key=`, `/notify` ouvert, CORS en miroir, aucun plafond, renvoie le détail des erreurs Google) | Connecteur, 02/10 (`workers_get_worker_code`) |
| Relais — **réglages** | `GEMINI_API_KEY` = **Secret**, clé **neuve** « garage-manifest-relais » (projet « Projet Gemini 2 ») · `IA_FOURNISSEUR=gemini` · `APP_ORIGIN=https://mcslec.github.io` · **`RESEND_API_KEY` encore présente** (Variable en clair) · **aucune liaison** · aucun cron. Dernière modification 04/10 20:55 UTC, **inchangé au 26/10** | Capture du propriétaire 04/10 + `workers_list` 26/10 |
| ⚠️ Reconnaissance photo **en ce moment** | **Non vérifiée** depuis le 04/10 : l'ancien code met la clé **neuve** dans `?key=`. Si Google la refuse sous cette forme, la reconnaissance est en panne jusqu'au collage du nouveau code (B2), qui passe par l'en-tête | Déduction, à vérifier |
| Clés Gemini (AI Studio) | `…eeUw` « CARDEX » (l'**ancienne** du relais, à supprimer après B5) ; `…kvaw` « Default Gemini API Key » (inutilisée par le relais) ; la neuve. Les projets sont en **« Niveau sans frais »** | Captures du propriétaire, 04/10 |
| Claude Haiku | **N'a jamais tourné**, aucune clé Anthropic : rien de facturable | Code déployé + réglages |
| Compte Resend | Offre gratuite, **sans domaine**, **aucune clé** : « Garage manifest » (27/08) **révoquée le 26/10** par le connecteur (ménage délégué par le propriétaire ; aucun appelant légitime, l'app de `main` n'appelle pas `/notify`). La ligne `RESEND_API_KEY` du relais contient donc une clé morte : à supprimer par hygiène (feuille de route, étape 2). Une clé neuve se crée à l'étape 12. Adresse du compte toujours **à vérifier** (étape 12) | Connecteur Resend, `list-api-keys` vide le 26/10 et le 27/10 |
| R2 | Non activé (normal : mode essai, R2 exige une carte) | Connecteur, 02/10 |
| Serveur de comptes | **N'existe pas** (partie C) | `workers_list`, 07/10 |
| Schéma de la base | **À jour** : 8 tables + 3 index, identiques au dépôt (C0 fait par le connecteur le 14/10, sur « go ») | Connecteur, `sqlite_master` comparé au dépôt |
| Connexion Google | Code prêt, **en sommeil** (`GOOGLE_CLIENT_ID` vide côté app et serveur). Script de Google autorisé par le propriétaire le 14/10 | Dépôt |
| Comptes dans l'app | Code prêt et testé, **en sommeil** (`COMPTE_URL` vide) | Dépôt |

**Ce que les connecteurs permettent** (vérifié le 07/10 ; le 22/10, le connecteur Cloudflare s'annonce **déprécié** au profit de `https://mcp.cloudflare.com/mcp`, qui couvre toute l'API. Il n'est **pas** branché : le propriétaire l'ajoute sur `claude.ai/customize/connectors`, puis ouvre une **nouvelle** session (les connecteurs se lisent au démarrage). Il permettrait à la session de faire la partie non secrète de B et C, toujours après « go ») : Cloudflare = lire les
Workers et leur code, créer et interroger D1. **Pas** de juridiction à la création,
**pas** d'écriture de variables, liaisons, cron ni code : tout cela se fait par le
propriétaire, guidé. `workers_get_worker` **n'est pas appelé** : il pourrait renvoyer
en clair les clés rangées en Variable. Resend = lire, et révoquer une clé (après « go »).
Le conteneur **ne joint pas** `*.workers.dev` (politique réseau) : les sondages du
relais se font depuis le navigateur du propriétaire (`TUTO-GRATUIT.md` B5).

---

## 3. Ce qui reste : la prochaine étape concrète

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
