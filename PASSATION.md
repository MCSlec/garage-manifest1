# PASSATION — à lire en premier dans toute nouvelle session

> **Pourquoi ce fichier.** Une nouvelle session ne voit **rien** des conversations
> précédentes : seulement le dépôt. Ce fichier est le relais entre deux sessions.
> Il dit **où on en est, ce qui est prouvé, ce qui reste, et les pièges déjà payés**.
> Le détail vit ailleurs ; ici, on pointe vers lui.
>
> **Dernière mise à jour : 02/10/2026**, en fin de session (branche
> `claude/create-claude-documentation-8eo2t7`, version `20.196.0`).
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
   Dernier passage complet : **17/17 verts** (01/10, v20.196.0). Depuis : documentation
   seulement, aucun code.
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
| **Relais IA** `silent-firefly-2620.cyril-lapopin.workers.dev` | Code **Gemini** `gemini-3.1-flash-lite`, écrit par une IA le **31/08**, **jamais déposé sur GitHub**. Clé passée en `?key=`. Route `/notify` ouverte (injection HTML possible dans l'e-mail). Pas de plafond, CORS qui renvoie n'importe quelle origine | Code collé par le propriétaire, 02/10 |
| Reconnaissance photo | **Fonctionne** (« elle nomme directement la bonne voiture ») | Propriétaire, 02/10 |
| Variables du relais | `GEMINI_API_KEY` (format `AQ.`) et `RESEND_API_KEY`, toutes deux en **Variable texte clair**, pas en Secret. **Aucune** clé Anthropic | Capture du tableau de bord, 02/10 |
| Liaisons du relais | **Aucune** (pas de D1) | Idem |
| Claude Haiku | **N'a jamais tourné.** Le propriétaire ne l'a jamais demandé ; une IA l'avait écrit, puis était revenue à Gemini faute de clé | Commentaire d'en-tête du code déployé |
| Facturation | **Aucune possible** : pas de clé Anthropic ; Gemini en offre gratuite (à confirmer par le propriétaire dans AI Studio, étape B1) | Idem |
| Compte Resend | Créé en offre gratuite, **sans domaine**. Adresse du compte probablement **dijon.autodetail@gmail.com** (l'ancien `/notify` y écrivait depuis `onboarding@resend.dev`) | Propriétaire (01/10) ; déduction (02/10), **à vérifier** |
| Base D1, serveur de comptes | **N'existent pas encore** | Capture, 02/10 |
| Comptes dans l'app | Code prêt et testé, **en sommeil** (`COMPTE_URL` vide dans `gm-compte.js`) | Dépôt |

---

## 3. Ce qui reste : la prochaine étape concrète

**Le propriétaire n'a encore commencé aucune étape de `TUTO-GRATUIT.md`** (02/10).
Il ne lance pas de ligne de commande : tout se fait dans le navigateur, ou par le
connecteur Cloudflare s'il est branché.

| Ordre | Partie du tuto | Qui | Débloque |
|---|---|---|---|
| 1 | **A** — créer la base D1 `garage-comptes` et y exécuter `cloud/schema.sql` | Propriétaire, ou session avec le connecteur, **après son « go »** | Tout le reste |
| 2 | **B** — coller le nouveau `ai-relay-worker.js`, liaison `DB`, clé Gemini **repassée en Secret** (copier la valeur, supprimer, recréer), `IA_FOURNISSEUR=gemini` (**indispensable** : le défaut est `anthropic`), `APP_ORIGIN=https://mcslec.github.io`, supprimer `RESEND_API_KEY` du relais, puis une capture de test avec l'onglet *Observability* ouvert | Propriétaire (secrets) + session | Plafonds, clé dans l'en-tête, fin de `/notify` |
| 3 | **C** — serveur de comptes `garage-comptes`, **sans R2** (mode essai), `MAIL_FROM=Garage Manifest <onboarding@resend.dev>`, nouvelle clé Resend, ancienne révoquée, `CODE_SECRET` tiré dans la console du navigateur | Propriétaire (secrets) + session | — |
| 4 | **D** — le propriétaire donne l'adresse du Worker → renseigner `COMPTE_URL` dans `gm-compte.js`, augmenter la version (`VERSION_MODULE` + `sw.js`), relancer les bancs, livrer | Session | — |
| 5 | **E** — test sur téléphone. **Exige la fusion de la PR #1** (l'app en ligne vient de `main`) | Propriétaire | Comptes en essai |

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
