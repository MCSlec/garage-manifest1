# PASSATION — à lire en premier dans toute nouvelle session

> **Pourquoi ce fichier.** Une nouvelle session ne voit **rien** des conversations
> précédentes : seulement le dépôt. Ce fichier est le relais entre deux sessions.
> Il dit **où on en est, ce qui est prouvé, ce qui reste, et les pièges déjà payés**.
> Le détail vit ailleurs ; ici, on pointe vers lui.
>
> **Dernière mise à jour : 07/10/2026** (branche
> `claude/create-claude-documentation-8eo2t7`, version `20.196.0`). **Partie B du
> tuto en cours, à moitié faite** : lire le §2 avant toute instruction au propriétaire.
> **À mettre à jour à chaque fin de session** : remplacer, ne pas empiler (l'historique
> est dans `CONTEXT.md` et `git log`).

---

## 1. Démarrer une session : les 5 réflexes

1. **Branche** : `claude/create-claude-documentation-8eo2t7` (PR #1). Jamais `main`,
   qui a plus de 100 commits de retard. Si la session a démarré sur `main`, le dire
   au propriétaire **avant toute chose**.
2. **Règles du propriétaire** : `CLAUDE.md` §0 bis (pas de merge sans « merge », rien
   de payant, les clés jamais dans la conversation, son « go » avant toute
   modification de ses comptes).
3. **Bancs** : le hook de démarrage installe Playwright. Commande de contrôle :
   ```sh
   export NODE_PATH=$PWD/.claude/outils-bancs/node_modules CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome
   for f in banc-*.js; do node $f >/dev/null 2>&1 && echo "OK $f" || echo "ÉCHEC $f"; done
   ```
   Dernier passage complet : **17/17 verts** (07/10, v20.196.0), après l'ajout de la
   purge nocturne au relais (`ai-relay-worker.js`, hors cache : aucun bump).
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
| Relais — **réglages** | `GEMINI_API_KEY` = **Secret**, clé **neuve** « garage-manifest-relais » (projet « Projet Gemini 2 ») · `IA_FOURNISSEUR=gemini` · `APP_ORIGIN=https://mcslec.github.io` · **`RESEND_API_KEY` encore présente** (Variable en clair) · **aucune liaison** · aucun cron. Dernière modification 04/10 20:55 UTC | Capture du propriétaire 04/10 + `workers_list` 07/10 |
| ⚠️ Reconnaissance photo **en ce moment** | **Non vérifiée** depuis le 04/10 : l'ancien code met la clé **neuve** dans `?key=`. Si Google la refuse sous cette forme, la reconnaissance est en panne jusqu'au collage du nouveau code (B2), qui passe par l'en-tête | Déduction, à vérifier |
| Clés Gemini (AI Studio) | `…eeUw` « CARDEX » (l'**ancienne** du relais, à supprimer après B5) ; `…kvaw` « Default Gemini API Key » (inutilisée par le relais) ; la neuve. Les projets sont en **« Niveau sans frais »** | Captures du propriétaire, 04/10 |
| Claude Haiku | **N'a jamais tourné**, aucune clé Anthropic : rien de facturable | Code déployé + réglages |
| Compte Resend | Offre gratuite, **sans domaine**, **une** clé « Garage manifest » (27/08) — à révoquer. Historique d'envoi vide (rétention courte : ne prouve rien). Adresse du compte toujours **à vérifier** (C1) | Connecteur Resend, 02/10 |
| R2 | Non activé (normal : mode essai, R2 exige une carte) | Connecteur, 02/10 |
| Serveur de comptes | **N'existe pas** (partie C) | `workers_list`, 07/10 |
| Comptes dans l'app | Code prêt et testé, **en sommeil** (`COMPTE_URL` vide) | Dépôt |

**Ce que les connecteurs permettent** (vérifié le 07/10) : Cloudflare = lire les
Workers et leur code, créer et interroger D1. **Pas** de juridiction à la création,
**pas** d'écriture de variables, liaisons, cron ni code : tout cela se fait par le
propriétaire, guidé. `workers_get_worker` **n'est pas appelé** : il pourrait renvoyer
en clair les clés rangées en Variable. Resend = lire, et révoquer une clé (après « go »).
Le conteneur **ne joint pas** `*.workers.dev` (politique réseau) : les sondages du
relais se font depuis le navigateur du propriétaire (`TUTO-GRATUIT.md` B5).

---

## 3. Ce qui reste : la prochaine étape concrète

**État au 07/10 : A faite, B à moitié.** Le propriétaire ne lance pas de ligne de
commande : tout se fait dans le navigateur (souvent **sur téléphone** : captures
Android), ou par les connecteurs pour ce qu'ils savent faire. ⚠️ Dire **précisément
ce qui reste** : une liste qui renumérote des étapes déjà faites lui fait croire
qu'on lui fait tout refaire (vécu le 04/10).

| Ordre | Étape | Qui | État |
|---|---|---|---|
| ✅ | **A** — base D1 `garage-comptes`, juridiction UE, schéma | Propriétaire (création) + connecteur (schéma, vérification) | Fait et prouvé le 04/10 |
| ✅ | **B1** clé Gemini neuve ; **B4** Secret + `IA_FOURNISSEUR` + `APP_ORIGIN` | Propriétaire | Fait le 04/10 (capture) |
| 1 | **B4 (fin)** — supprimer `RESEND_API_KEY` du relais | Propriétaire | **À faire** |
| 2 | **B3** — liaison D1 `DB` → `garage-comptes` | Propriétaire | **À faire** |
| 3 | **B2** — coller le nouveau `ai-relay-worker.js` (**celui du 07/10, avec purge**), puis la session relit le code déployé par le connecteur et le compare au dépôt | Propriétaire + session | À faire |
| 4 | **B2 bis** — cron `17 3 * * *` sur le relais (**après** B2) | Propriétaire | À faire |
| 5 | **B5** — sondage sans image (sur ordinateur, facultatif) puis vraie photo, onglet *Observability* ouvert ; ensuite supprimer la clé « CARDEX » | Propriétaire | À faire |
| 6 | **C** — serveur de comptes, **sans R2**, `MAIL_FROM=Garage Manifest <onboarding@resend.dev>`, clé Resend neuve (l'ancienne révoquée), `CODE_SECRET`, cron **indispensable** | Propriétaire (secrets) + session | — |
| 7 | **D** — adresse du Worker → `COMPTE_URL`, bump `VERSION_MODULE` + `sw.js`, bancs, livraison | Session | — |
| 8 | **E** — test sur téléphone. **Exige la fusion de la PR #1** | Propriétaire | — |

**Compatibilité vérifiée** : le nouveau relais et l'app de `main` utilisent le même
contrat (`POST {image}` → `[{brand, model, variant, cues, confidence}]`), le même nom
de clé et le même modèle. La partie B ne demande **aucune** fusion.

---

## 4. Décisions qui attendent le propriétaire

Posées **une fois**, détaillées dans `RESTE-A-FAIRE.md`. Ne pas les reposer : attendre
qu'il en parle.

- **« merge »** de la PR #1. Une revue (`/security-review` ou `/code-review`) est
  recommandée avant, au titre de `CLAUDE.md` §8 sexies.
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
