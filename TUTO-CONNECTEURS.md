# Tuto — Brancher Cloudflare (et Resend) à Claude, puis ouvrir la nouvelle session

> **Durée :** ≈ 10 minutes. **Coût :** 0 €. **Matériel :** navigateur, sur ordinateur
> ou tablette.
> **Ce que ça change :** dans la nouvelle session, Claude **voit** ton compte
> Cloudflare (relais, variables, liaisons, bases) au lieu de te demander des captures
> d'écran, et peut faire la partie A de `TUTO-GRATUIT.md` à ta place, **après ton
> « go »**.
>
> Les noms de boutons viennent de l'aide officielle de Claude. Si un libellé diffère
> légèrement chez toi, cherche le plus proche : l'enchaînement reste le même.

---

## Partie 1 — Brancher Cloudflare (≈ 3 min)

- [ ] **1.1** Va sur **claude.ai**, connecté avec ton compte habituel.
- [ ] **1.2** Ouvre **Customize** → **Connectors** (accès direct :
  **claude.ai/customize/connectors**).
- [ ] **1.3** Clique sur le **+** à côté de « Connectors », puis tape
  **Cloudflare** dans la recherche.
- [ ] **1.4** Choisis **« Cloudflare Developer Platform »**, avec le logo orange de
  Cloudflare. Sa description : *Build applications with compute, storage, and AI*.
- [ ] **1.5** **Connect**. Une fenêtre Cloudflare s'ouvre.
- [ ] **1.6** Connecte-toi avec **le compte Cloudflare qui porte ton relais**
  `silent-firefly-2620`, celui que tu as photographié.
- [ ] **1.7** Cloudflare affiche la liste des droits demandés : Workers, D1, KV,
  R2… **Accepte** (*Allow* / *Authorize*). S'il te demande de choisir un compte,
  prends celui du relais.
- [ ] **1.8** Retour sur claude.ai : le connecteur apparaît comme **connecté**.

> **Pourquoi c'est sans danger.** Le connecteur passe par l'autorisation officielle
> de Cloudflare (OAuth) : **aucun mot de passe** ne transite par Claude, et tu peux
> retirer l'accès à tout moment (Partie 6). Et la règle du projet tient toujours
> (`CLAUDE.md` §0 bis) : **aucune modification de ton compte sans que je l'annonce
> et que tu dises « go »**.

---

## Partie 2 — Brancher Resend (facultatif, ≈ 2 min)

Utile pour vérifier l'adresse de ton compte Resend, et lire le journal d'envoi si un
code de connexion n'arrive pas. Pas indispensable.

- [ ] **2.1** Même écran : **+** → recherche **Resend**.
- [ ] **2.2** Choisis **« Resend »**, avec la description *Email for developers…*
- [ ] **2.3** **Connect** → connecte-toi à Resend → **accepte**.
- [ ] **2.4** Le connecteur apparaît comme **connecté**.

> ⚠️ Ce connecteur **sait créer des clés API**. Je ne m'en servirai pas pour ça : une
> clé créée par moi s'afficherait dans la conversation. Tu crées toujours les clés
> toi-même (`TUTO-GRATUIT.md`, C1).

---

## Partie 3 — Les pièges du catalogue (à ne PAS brancher)

| Connecteur | Pourquoi non |
|---|---|
| **« Gemini »** | C'est la **plateforme de cryptomonnaies** Gemini, sans aucun rapport avec Google. Il n'existe pas de connecteur pour Google AI Studio : ta clé Gemini se gère à la main |
| Un connecteur « Anthropic » | Aucun connecteur ne donne accès à ta console Anthropic ; et tu n'en as pas besoin (aucune clé Anthropic dans ton relais) |
| GitHub | **Déjà là** : il vient du dépôt choisi au démarrage de la session (Partie 4), pas d'un connecteur |

---

## Partie 4 — Ouvrir la nouvelle session (≈ 3 min)

Une session ne charge ses connecteurs **qu'au démarrage** : celle d'aujourd'hui ne
les verra jamais. Il faut en ouvrir une nouvelle.

- [ ] **4.1** Va sur **claude.ai/code** (ou l'onglet **Code** de l'app Claude).
- [ ] **4.2** Sous la zone de saisie, clique sur le **sélecteur de dépôt** → choisis
  **`MCSlec/garage-manifest1`**.
- [ ] **4.3** ⚠️ **L'étape qui compte le plus.** À côté du dépôt, le **sélecteur de
  branche** affiche `main` par défaut. Change-le pour
  **`claude/create-claude-documentation-8eo2t7`**.
  *Pourquoi :* `main` a 105 commits de retard. Une session qui démarre dessus ne
  voit ni le tuto, ni la passation, ni le nouveau relais : elle repart vraiment de
  zéro.
- [ ] **4.4** L'environnement : laisse celui proposé, le même qu'aujourd'hui.
- [ ] **4.5** Colle ce message, puis envoie :

```
Lis d'abord PASSATION.md (CLAUDE.md te le demande aussi).
Base ton travail sur la branche claude/create-claude-documentation-8eo2t7 (PR #1) :
si ta branche désignée est différente, pars de celle-ci, jamais de main.
Puis, avec le connecteur Cloudflare (et Resend s'il est branché), constate l'état
réel de mon compte (Workers, variables, liaisons, bases D1) et compare-le au §2 de
PASSATION.md. Dis-moi ce qui concorde et ce qui diffère.
Ensuite, on fait ensemble les parties A puis B de TUTO-GRATUIT.md.
Avant toute modification sur Cloudflare : annonce exactement ce que tu vas faire,
et attends mon « go ». Je colle moi-même les clés secrètes.
```

---

## Partie 5 — Les premières minutes de la nouvelle session : ce que tu dois voir

✅ **Bon démarrage**, dans cet ordre :
1. elle dit avoir lu `PASSATION.md` et être sur la bonne branche (ou en partir) ;
2. elle **liste ce qu'elle voit** sur ton compte : `silent-firefly-2620`, ses deux
   variables `GEMINI_API_KEY` et `RESEND_API_KEY`, aucune liaison, aucune base D1 ;
3. elle **propose** de créer la base `garage-comptes`, explique pourquoi, et
   **attend ton « go »**.

🛑 **Arrête-la et dis-le-moi** (dans la nouvelle session) si :
- elle dit être sur `main`, ou ne trouve pas `PASSATION.md` → mauvaise branche (4.3) ;
- elle dit ne voir **aucun** outil Cloudflare → connecteur non chargé (Partie 6) ;
- elle modifie quelque chose sur Cloudflare **sans** t'avoir demandé « go » ;
- elle te demande de **coller une clé** dans la conversation.

---

## Partie 6 — Si ça ne marche pas

| Symptôme | Cause probable | Remède |
|---|---|---|
| La nouvelle session dit ne voir aucun outil Cloudflare | Connecteur ajouté **après** l'ouverture de la session, ou désactivé pour elle | Vérifie qu'il est **connecté** (claude.ai/customize/connectors), puis ouvre une **nouvelle** session |
| Elle voit Cloudflare mais pas `silent-firefly-2620` | Autorisation donnée sur un autre compte Cloudflare | Customize → Connectors → Cloudflare → **Disconnect**, puis Partie 1 avec le bon compte |
| Elle ne trouve pas `PASSATION.md` | Session démarrée sur `main` | Nouvelle session, branche `claude/create-claude-documentation-8eo2t7` (4.3) |
| Elle dit n'avoir **aucun** dépôt | Dépôt non sélectionné | Nouvelle session, étape 4.2 |
| Tu veux retirer l'accès plus tard | — | Customize → Connectors → le connecteur → **Disconnect**. Côté Cloudflare, l'autorisation se révoque aussi dans ton profil |

---

## Et la session d'aujourd'hui ?

Rien à faire : tout ce qu'elle a produit est poussé sur la branche (tuto, passation,
corrections). Tu peux la laisser telle quelle.
