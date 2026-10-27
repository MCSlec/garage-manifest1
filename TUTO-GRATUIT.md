# Tuto — Tout mettre en route gratuitement, pas à pas

> **Pour qui :** toi, le propriétaire du projet. **Durée :** ≈ 1 h la première fois.
> **Coût :** 0 €. **Matériel :** un **ordinateur** avec un navigateur (Chrome, Edge,
> Firefox ou Safari). Aucun logiciel à installer, aucune ligne de commande.
>
> Tout se fait **dans le navigateur**, sur les sites de Cloudflare, Google et Resend —
> comme tu l'as fait pour créer ton relais `silent-firefly-2620`.
>
> Coche les cases au fur et à mesure. Si une étape ne donne pas le résultat annoncé,
> **arrête-toi** et va à la partie « Si ça ne marche pas » en bas : chaque symptôme
> y a sa cause.

---

## 🧭 Ta feuille de route — UNIQUEMENT ce qui reste (27/10)

> Ce qui est déjà fait **n'y figure pas** : tu n'as rien à refaire. Suis les étapes
> **dans l'ordre**, sur un **ordinateur**. Chaque étape dit où cliquer, ce que tu dois
> voir, et renvoie à sa fiche détaillée plus bas (le *pourquoi*). Si le résultat
> annoncé n'apparaît pas : arrête-toi, regarde « Si ça ne marche pas » en bas, ou
> envoie-moi une capture **où aucune clé n'est visible**.

### Séance 1 — Finir le relais IA (≈ 15 min)

**Résultat :** la reconnaissance photo tourne gratuitement, avec des plafonds, **dans
l'app actuelle** — sans attendre la mise en ligne de la PR.

Tout se passe sur **dash.cloudflare.com → Workers & Pages → `silent-firefly-2620`**.

- [ ] **1. Relier la base** *(fiche B3, 2 min)*
  Onglet **Settings** → **Bindings** → **Add binding** → **D1 database** →
  *Variable name* **`DB`** → *D1 database* **`garage-comptes`** → **Deploy**.
  ✅ La liaison `DB` apparaît dans la liste.
  *(Le code actuel l'ignore : rien ne change encore pour l'app. C'est voulu — on pose
  la base **avant** le nouveau code pour que la reconnaissance ne coupe pas.)*

- [ ] **2. Ménage des réglages** *(fin de B4, 1 min)*
  **Settings** → **Variables and Secrets** → corbeille 🗑️ sur **`RESEND_API_KEY`**
  (et sur `NOTIFY_TO` et `IA_SECOURS` s'ils existent) → **Deploy**.
  ⚠️ **Ne touche pas** à `GEMINI_API_KEY`, `IA_FOURNISSEUR`, `APP_ORIGIN`.
  ✅ `RESEND_API_KEY` n'apparaît plus ; `GEMINI_API_KEY` (masquée, type Secret),
  `IA_FOURNISSEUR` et `APP_ORIGIN` sont toujours là.
  *(La clé Resend qu'elle contenait est déjà révoquée chez Resend depuis le 26/10 :
  la ligne ne sert plus à rien, on la retire par hygiène.)*

- [ ] **3. Coller le nouveau code** *(fiche B2, 3 min)*
  1. Ouvre cette adresse dans un nouvel onglet — c'est le code brut, en texte seul :
     `https://raw.githubusercontent.com/MCSlec/garage-manifest1/claude/create-claude-documentation-8eo2t7/ai-relay-worker.js`
  2. **Ctrl+A** puis **Ctrl+C** (Mac : Cmd+A, Cmd+C).
  3. Retour sur `silent-firefly-2620` → bouton **Edit code** (en haut à droite).
  4. Clique dans le code → **Ctrl+A** → **Ctrl+V** → **Deploy** → confirme.
  ✅ « Deployed » / « Version deployed ».
  👉 **Écris-moi « collé »** : je relis par le connecteur le code **réellement en
  ligne** et je le compare au dépôt (une copie tronquée se voit tout de suite).

- [ ] **4. La purge de nuit** *(fiche B2 bis, 1 min — après l'étape 3, jamais avant)*
  **Settings** → **Trigger Events** → **Cron Triggers** → **Add** → expression
  **`17 3 * * *`** → **Add/Deploy**.
  ✅ Le déclencheur apparaît (« At 03:17 AM »).

- [ ] **5. Test sans frais** *(fiche B5, 1 min)*
  Ouvre l'app `https://mcslec.github.io/garage-manifest1/` → **F12** → **Console** →
  colle (si Chrome refuse : tape `allow pasting`, Entrée, recommence) :
  ```js
  fetch("https://silent-firefly-2620.cyril-lapopin.workers.dev/",{method:"POST",body:"{}"}).then(r=>console.log(r.status),e=>console.log("bloqué",e))
  ```
  ✅ **`400`** = tout est en place (requête sans image, refusée **avant** tout quota
  ou appel à Gemini : ne coûte rien). **503** → refais l'étape 1 · **500** → les
  réglages de l'étape 2 · **« bloqué »** → `APP_ORIGIN`.

- [ ] **6. La vraie photo** *(fiche B5, 3 min)*
  `silent-firefly-2620` → onglet **Observability** → journaux en direct, laisse ouvert.
  Sur le téléphone : photographie une voiture (ou importe une photo nette).
  ✅ L'app propose une ou plusieurs voitures **et** la requête apparaît en **200**
  dans les journaux, sans ligne `[relais]` rouge.

- [ ] **7. Ménage chez Google** *(1 min, seulement si l'étape 6 a réussi)*
  **aistudio.google.com/app/apikey** → l'ancienne clé **« CARDEX »** (`…eeUw`) →
  ⋮ → **Supprimer**. La clé « Default Gemini API Key » (`…kvaw`) : à supprimer
  aussi si rien d'autre ne s'en sert. **Ne touche pas** à `garage-manifest-relais`
  (c'est celle du relais).

### Séance 2 — Le serveur de comptes (≈ 20 min)

**Résultat :** rien de visible tout de suite ; ça prépare les comptes et la
sauvegarde. Peut se faire le même jour que la séance 1 ou un autre.

> **Ordre volontaire :** on crée d'abord le serveur, et on ne fabrique chaque
> secret **qu'au moment de le coller** (étapes 11 et 12). Un secret qui attend dans
> le presse-papier pendant qu'on clique ailleurs finit collé au mauvais endroit.

- [ ] **8. Créer le serveur** *(fiche C3, 4 min)*
  **Workers & Pages** → **Create** → **Workers** → **Start with Hello World!** →
  nom **`garage-comptes`** → **Deploy**. Puis **Edit code**, et même geste qu'à
  l'étape 3 avec ce code-ci :
  `https://raw.githubusercontent.com/MCSlec/garage-manifest1/claude/create-claude-documentation-8eo2t7/cloud/compte-worker.js`
  → Ctrl+A, Ctrl+C → dans l'éditeur Ctrl+A, Ctrl+V → **Deploy**.

- [ ] **9. Relier la base** *(fiche C4, 1 min)*
  `garage-comptes` → **Settings** → **Bindings** → **Add binding** → **D1 database** →
  **`DB`** → **`garage-comptes`** → **Deploy**. **Pas** de liaison R2 (elle exige une
  carte bancaire ; sans elle, le serveur garde la collection et laisse les photos sur
  le téléphone).

- [ ] **10. Les deux réglages en texte** *(fiche C5)*
  **Settings** → **Variables and Secrets** → **Add variable**, case **Secret
  décochée** (c'est la case au bout de la ligne *Value* ; *+ Add* ajoute une ligne) :
  - `APP_ORIGIN` = `https://mcslec.github.io`
  - `MAIL_FROM` = `Garage Manifest <onboarding@resend.dev>`
  → **Deploy**.

- [ ] **11. Le secret des codes** *(fiche C2)*
  Dans un **autre onglet**, F12 → Console → colle puis Entrée :
  ```js
  btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
  ```
  Copie la suite affichée **sans les guillemets** → reviens sur `garage-comptes` →
  **Add variable** → nom **`CODE_SECRET`**, colle la valeur, case **Secret cochée** →
  **Deploy**.

- [ ] **12. La clé Resend** *(fiche C1)*
  Dans un autre onglet : **resend.com** → **API Keys** → **Create API Key** → nom
  `garage-comptes`, permission **Sending access** → **copie la clé** (affichée une
  seule fois) → reviens sur `garage-comptes` → **Add variable** → nom
  **`RESEND_API_KEY`**, colle, case **Secret cochée** → **Deploy**.
  Note au passage **l'adresse e-mail de ton compte Resend** (en haut à droite) : c'est
  la seule qui pourra recevoir un code tant qu'on n'a pas de domaine.
  *(Rien à supprimer chez Resend : l'ancienne clé a été révoquée le 26/10 et la liste
  était vide. Si tu y vois une autre clé que celle que tu viens de créer, dis-le-moi.)*

- [ ] **13. Contrôler les réglages** (Settings → Variables and Secrets).
  ✅ Quatre lignes : `APP_ORIGIN` et `MAIL_FROM` lisibles, `CODE_SECRET` et
  `RESEND_API_KEY` **masquées**. Une valeur secrète lisible en clair = case non
  cochée : supprime la ligne et recrée-la. Puis copie n'importe quel mot pour vider
  le presse-papier.

- [ ] **14. La purge de nuit** *(fiche C6, 1 min — indispensable, c'est une promesse
  RGPD)* `garage-comptes` → **Settings** → **Trigger Events** → **Cron Triggers** →
  **Add** → **`17 3 * * *`** → **Add/Deploy**.

- [ ] **15. Vérifier** *(fiche C7)* Ouvre
  `https://garage-comptes.cyril-lapopin.workers.dev/garage` (adapte si Cloudflare a
  donné une autre adresse au worker).
  ✅ La page affiche `{"erreur":"Session absente ou expirée"}` : le serveur tourne,
  lit la base, et refuse poliment un inconnu. C'est **la bonne réponse**.

- [ ] **16. M'envoyer l'adresse** *(partie D)* — l'adresse du worker, **et rien
  d'autre** (elle est publique). 👉 **De mon côté :** je l'inscris dans l'app
  (`COMPTE_URL`), j'augmente la version, je repasse les bancs, je pousse sur la
  branche.

### Séance 3 — Mettre en ligne et tester (≈ 10 min)

- [ ] **17. Écrire « merge »** quand tu le décides. Ton app en ligne est construite
  depuis `main`, qui n'a **aucun** des travaux depuis fin août (parcours de capture,
  corrections, comptes…). Je ne fusionne jamais sans ce mot.
  *Mon conseil :* au plus tôt **après l'étape 6 réussie**. On ne change qu'une chose
  à la fois : si la reconnaissance flanche, on saura que c'est le relais et pas la
  nouvelle app.
- [ ] **18. Tester sur le téléphone** *(partie E)* : ferme complètement l'app et
  rouvre-la (deux fois si besoin) → **Plus → Réglages** : version **20.198.0 ou
  plus** → **Compte** → adresse **du compte Resend** → **Recevoir un code** → code →
  **Valider** → **Sauvegarder**. Écris-moi « comptes testés ».
- [ ] **19. *(Facultatif)* « Continuer avec Google »** : partie F (identifiant Google,
  gratuit), quand tu veux, après la séance 2.

### Raccourci possible : me laisser faire les clics sans secret

Le connecteur Cloudflare de cette session est **en lecture seule** pour les workers :
il ne sait ni coller du code, ni poser une liaison, ni créer un déclencheur. Le
**nouveau** connecteur Cloudflare (`https://mcp.cloudflare.com/mcp`) couvre toute
l'API. Si tu l'ajoutes (**claude.ai/customize/connectors** → ajouter un connecteur
personnalisé → cette adresse → autorise ton compte Cloudflare), puis ouvres une
**nouvelle session** (les connecteurs se chargent au démarrage), je peux faire les
étapes 1, 3, 4, 8, 9, 10 et 14 moi-même — chacune **annoncée, puis faite seulement
après ton « go »**. Il te resterait les secrets (11, 12), la photo (6), le ménage
Google (7) et le téléphone (18) : les secrets ne passent **jamais** par moi.

---

## Où tu en es (constaté le 26/10 par le connecteur Cloudflare et tes captures)

| Étape | État | Preuve |
|---|---|---|
| **A** — base D1 `garage-comptes` | ✅ **Faite** (04/10), en **juridiction UE**, tables à jour (dont celles de la connexion Google, ajoutées le 14/10) | Lue par le connecteur, comparée au dépôt |
| **B1** — clé Gemini neuve (« garage-manifest-relais », projet « Projet Gemini 2 ») | ✅ **Faite** (04/10) | Ta capture |
| **B4** — `GEMINI_API_KEY` en **Secret**, `IA_FOURNISSEUR`, `APP_ORIGIN` | ✅ **Faites** (04/10) | Ta capture |
| **B4 (fin)** — supprimer `RESEND_API_KEY` du relais | ❌ À faire (simple hygiène : la clé qu'elle contient est **révoquée** chez Resend depuis le 26/10) | Toujours là le 04/10 ; relais inchangé depuis |
| **B3** — liaison `DB` du relais | ❌ À faire | Aucune liaison |
| **B2** — coller le nouveau code | ❌ À faire | Le relais tourne encore sur le code Gemini du 31/08 |
| **B2 bis** — purge de nuit (cron) | ❌ À faire, **après** B2 | — |
| **C0** — tables de la connexion Google dans la base | ✅ **Faite** (14/10, par le connecteur après ton « go ») | 8 tables et 3 index constatés |
| **Ancienne clé Resend** « Garage manifest » | ✅ **Révoquée** (26/10, par le connecteur après ton accord) | Liste des clés Resend vide |
| **C** — serveur de comptes (C1 à C7) | ❌ À faire | Un seul Worker sur ton compte |
| **F** — identifiant Google | Facultatif | — |

**Ce que règle la fin de B** (le nouveau code remplace entièrement l'actuel) :
1. **Le relais n'a aucune limite.** Son adresse est publique : un abus peut épuiser ton
   quota Gemini du jour, et la reconnaissance s'arrête alors pour toi aussi.
2. **`RESEND_API_KEY` est encore en Variable** (texte en clair) sur le relais. La clé
   est révoquée depuis le 26/10, donc inoffensive, mais une ligne que plus aucun code
   ne lit n'a rien à faire là.
3. **La clé Gemini part dans l'adresse de la requête** (`?key=…`). Google ne garantit
   pas d'accepter ta clé **neuve** sous cette forme : si la reconnaissance ne marche
   plus depuis le 04/10, c'est la cause probable. Le nouveau code passe par l'en-tête
   `x-goog-api-key`.
4. **La route `/notify` est ouverte à tous** (envoi d'e-mails sur ton quota Resend,
   HTML au choix de l'expéditeur). L'app ne l'a jamais appelée : le nouveau relais la
   supprime.

> **Après B5** (vraie photo réussie) : supprime l'ancienne clé Gemini « CARDEX »
> (`…eeUw`) dans AI Studio. La clé « Default Gemini API Key » (`…kvaw`) ne sert pas au
> relais : à supprimer aussi si rien d'autre ne l'utilise.

---

## La règle n° 1 : les clés ne voyagent pas

Tu vas manipuler **trois secrets** : la clé Gemini, la clé Resend et le secret des
codes. Chacun ouvre un service à ton nom.

- Un secret se colle **uniquement** dans la case « Secret » de Cloudflare (étapes
  B4 et C5). Nulle part ailleurs : ni dans l'app, ni dans GitHub, ni dans un message
  — **même pas à moi**. Je n'en ai jamais besoin.
- La **seule** chose que tu me donneras, c'est une adresse publique du type
  `https://garage-comptes.cyril-lapopin.workers.dev`. Elle n'a rien de secret.
- **Aucune carte bancaire**, nulle part. Si un site t'en demande une, c'est que tu
  t'es engagé sur une offre payante : reviens en arrière et préviens-moi.

**Pourquoi c'est si important :** un service gratuit **sans** moyen de paiement
refuse de travailler quand son quota est atteint. **Avec** une carte, il facture.
Pas de carte = pas de facture possible, quoi qu'il arrive.

---

## Vue d'ensemble — ce qu'on construit

```
                    ┌──────────────────────────────┐
  ton téléphone ──► │ relais IA  (silent-firefly)  │ ──► Gemini (Google, gratuit)
  (l'app)           └──────────────┬───────────────┘
        │                          │ compte les identifications
        │                          ▼
        │           ┌──────────────────────────────┐
        │           │ base D1  « garage-comptes »  │   ← partie A
        │           └──────────────▲───────────────┘
        │                          │ comptes, sessions, collections
        │           ┌──────────────┴───────────────┐
        └─────────► │ serveur de comptes           │ ──► Resend (envoie le code)
                    │ « garage-comptes »           │
                    └──────────────────────────────┘
```

**L'ordre compte.** La base (partie A) sert aux **deux** serveurs : le relais y
compte les identifications pour respecter les quotas, et le serveur de comptes y
range comptes et collections. Elle doit exister avant tout le reste.

| Partie | Ce que tu fais | Ce que ça débloque |
|---|---|---|
| **A** | Créer la base D1 | Rien de visible, mais tout en dépend |
| **B** | Mettre à jour le relais IA (Gemini gratuit) | La reconnaissance photo, gratuite et plafonnée — **dès la fin de B** |
| **C** | Créer le serveur de comptes | Rien de visible tant que je n'ai pas branché l'app |
| **D** | Me donner une adresse | Je branche l'app dessus |
| **E** | Tester sur ton téléphone | Les comptes, en mode essai |
| **F** | *(Facultatif)* Créer l'identifiant Google | Le bouton « Continuer avec Google » |

---

## Partie A — La base de données (≈ 5 min)

- [ ] **A1. Ouvrir Cloudflare.** Va sur **dash.cloudflare.com** et connecte-toi avec
  le compte qui porte ton relais (celui de `cyril-lapopin.workers.dev`).

- [ ] **A2. Aller aux bases D1.** Dans le menu de gauche : **Storage & Databases**
  → **D1 SQL Database**.
  *(Cloudflare réorganise parfois son menu : si tu ne le trouves pas, tape « D1 »
  dans la barre de recherche en haut du tableau de bord.)*

- [ ] **A3. Créer la base.** *Une base `garage-comptes` figure déjà dans la liste ?
  Ne la recrée pas : ouvre-la et passe directement à A4.* Sinon, bouton **Create** (ou
  « Create database »).
  - Nom : **`garage-comptes`**, exactement, en minuscules avec le tiret.
  - Emplacement : choisis la **juridiction** *European Union (EU)* (rubrique
    *Jurisdiction* / *Data location*), **pas** un simple indice de région
    (*Location hint*). La juridiction **garantit** que les données (e-mails,
    positions GPS des collections) restent dans l'UE ; l'indice n'est qu'un
    « au mieux ». Elle ne se choisit **qu'à la création** : impossible de
    l'ajouter ensuite sans recréer la base. Pas d'option de juridiction à
    l'écran ? Ne crée rien et préviens-moi.
    *(Fait ainsi le 04/10 : le connecteur Cloudflare ne sait pas régler la
    juridiction, d'où la création à la main.)*
  - Valide avec **Create**.

- [ ] **A4. Créer les tables.** Ouvre la base `garage-comptes` → onglet **Console**.
  1. Ouvre dans un autre onglet le fichier du schéma sur GitHub :
     `https://github.com/MCSlec/garage-manifest1/blob/claude/create-claude-documentation-8eo2t7/cloud/schema.sql`
  2. Clique sur l'icône **Copy raw file** (deux carrés superposés, en haut à droite
     du contenu) : tout le fichier est copié.
  3. Reviens dans la Console D1, colle (Ctrl+V / Cmd+V), puis **Execute**.

- [ ] **A5. Vérifier.** Dans la Console, colle cette ligne et exécute-la :
  ```sql
  SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;
  ```
  ✅ **Tu dois voir 8 tables** : `codes`, `garages`, `identites`, `jetons_consommes`,
  `limites`, `sessions`, `usages`, `utilisateurs`. Il peut y en avoir une de plus qui
  commence par `_cf_` : c'est celle de Cloudflare, normal.

> **Pourquoi une console et pas un fichier ?** Le schéma, c'est le *plan* de la
> base : quelles tables, quelles colonnes. Il ne contient aucune donnée. Le
> réexécuter ne casse rien : chaque ligne commence par `CREATE TABLE IF NOT EXISTS`,
> donc une table qui existe déjà est laissée telle quelle.

---

## Partie B — Le relais IA avec Gemini gratuit (≈ 20 min)

> **Ordre conseillé : B1 → B3 → B4 → B2 → B2 bis → B5** (et non dans l'ordre des
> numéros). L'ancien code ignore les nouveaux réglages et lit la clé Gemini qu'elle
> soit Variable ou Secret : en posant liaison et réglages **avant** le nouveau code,
> la reconnaissance ne s'arrête pas une seconde. Dans l'ordre des numéros, le relais
> répondrait 503 entre B2 et B3.

### B1. Une clé Gemini neuve, dans le même projet

L'ancienne clé a vécu en texte clair (Variable) depuis l'été et a été en partie
visible sur des captures : on en crée une **neuve**, collée directement dans un
Secret, au lieu de recopier l'ancienne via un brouillon.

- [ ] **Trouver le projet de la clé actuelle.** Cloudflare → `silent-firefly-2620` →
  **Settings** → *Variables and secrets* → ligne `GEMINI_API_KEY` : relève ses
  **4 derniers caractères** seulement. Sur **aistudio.google.com/app/apikey**, la clé
  qui finit pareil indique son **projet**. *(Le 04/10 : `…eeUw`, « CARDEX », projet
  « Projet Gemini 2 ».)*
- [ ] Vérifie que ce projet affiche **« Niveau sans frais »** (*Free tier*). Si une
  facturation est active, préviens-moi avant d'aller plus loin.
- [ ] **Créer une clé API** → nom `garage-manifest-relais` → **même projet** (le quota
  gratuit est compté par projet) → copie-la et enchaîne **directement** B4 : elle ne
  va nulle part ailleurs que dans la case Secret de Cloudflare.
- [ ] **Garde l'ancienne clé** jusqu'à la réussite de B5 (c'est le repli), puis
  supprime-la dans AI Studio (⋮ → *Supprimer*).

> **L'erreur 404 de juillet ne reviendra pas.** Elle venait du **modèle**
> (`gemini-2.5-flash-lite`, fermé aux nouveaux comptes), pas de ta clé. Le relais
> utilise désormais `gemini-3.1-flash-lite`, un modèle stable.
- [ ] ⚠️ **N'active jamais la facturation** (*Set up billing*, *Upgrade*). Sans
  facturation, tu restes sur l'offre gratuite : quand le quota du jour est épuisé,
  l'app affiche « en pause pour aujourd'hui », et le joueur choisit sa voiture à la
  main. Rien de plus.

### B2. Mettre à jour le code du relais

⚠️ **Tu modifies ton relais EXISTANT** (`silent-firefly-2620`). N'en crée pas un
nouveau : son adresse est inscrite dans l'app, une nouvelle adresse ne serait
jamais appelée.

- [ ] Ouvre le nouveau code sur GitHub :
  `https://github.com/MCSlec/garage-manifest1/blob/claude/create-claude-documentation-8eo2t7/ai-relay-worker.js`
  → **Copy raw file**.
- [ ] Cloudflare → **Workers & Pages** → clique sur **silent-firefly-2620** → bouton
  **Edit code** (en haut à droite).
- [ ] Dans l'éditeur, clique dans le code, **sélectionne tout** (Ctrl+A / Cmd+A),
  **colle** (Ctrl+V / Cmd+V) : l'ancien code est remplacé.
- [ ] **Deploy** (en haut à droite), confirme.

> Dans l'ordre conseillé (B3 et B4 déjà faits), le nouveau code travaille dès cet
> instant. Sinon, il **refuse de travailler** (erreur 503) tant que la base n'est pas
> reliée (B3) : c'est voulu, un relais sans plafond serait un service ouvert à tous.
>
> Dis-moi « collé » : je relis par le connecteur le code **réellement déployé** et le
> compare au fichier du dépôt (une copie tronquée se voit tout de suite).

### B2 bis. La purge de nuit du relais (après B2)

Le relais compte les identifications par appareil, sous forme d'**empreinte** de
l'adresse IP. Chaque nuit, il efface les compteurs échus : c'est ce que promet
`cloud/CONFIDENTIALITE.md` (« effacés sous 48 heures »). Sans ce réglage, ils
resteraient en base indéfiniment.

- [ ] **silent-firefly-2620** → **Settings** → **Trigger events** → **Cron triggers**
  → **Add** → expression **`17 3 * * *`** → **Add/Deploy**.
  (= tous les jours à 3 h 17 UTC. Gratuit : 5 déclencheurs par compte, on en utilise 2.)
- ⚠️ **Après B2 seulement** : l'ancien code n'a pas de purge, le déclencheur
  tomberait en erreur chaque nuit.

### B3. Relier la base au relais

- [ ] Retour sur la page de **silent-firefly-2620** → onglet **Settings** → section
  **Bindings** → **Add binding** → **D1 database**.
- [ ] **Variable name : `DB`** (deux majuscules, rien d'autre).
- [ ] **D1 database : `garage-comptes`** → **Deploy** (ou *Save*).

### B4. Les réglages du relais

**D'abord, passer la clé Gemini en Secret.** Cloudflare ne convertit pas une Variable
en Secret : on la supprime puis on la recrée.
- [ ] Ligne **`GEMINI_API_KEY`** → corbeille 🗑️ → confirme. (Tu as copié sa valeur en
  B1 : sinon, arrête-toi et fais B1.)

Puis **Add variable**. Le formulaire actuel (« Add environment variable ») n'a pas de
menu *Type* : c'est la case **Secret**, tout au bout de la ligne *Value* (sur
téléphone, fais glisser la ligne ou tourne l'écran pour la voir). **Cochée = Secret,
décochée = Text.** *+ Add* ajoute une ligne : on peut tout saisir d'un coup.

| Type | Nom (exactement) | Valeur |
|---|---|---|
| **Secret** | `GEMINI_API_KEY` | la clé **neuve** créée en B1 |
| **Text** | `IA_FOURNISSEUR` | `gemini` |
| **Text** | `APP_ORIGIN` | `https://mcslec.github.io` (sans `/` à la fin, sans `garage-manifest1`) |

- [ ] Les trois lignes sont ajoutées, puis **Deploy**.
- [ ] Contrôle : `GEMINI_API_KEY` affiche le type **Secret** et une valeur masquée.
  Si tu la lis en clair, la case n'était pas cochée : supprime et recrée.
- [ ] Copie n'importe quel mot pour **vider le presse-papier** : la clé vit
  désormais, chiffrée, chez Cloudflare.
- [ ] Un **bandeau jaune** propose de recopier ces réglages dans un fichier
  `wrangler` : il vise la ligne de commande, **ferme-le** (croix) sans rien recopier.
- [ ] S'il existe une ligne **`IA_SECOURS`** : supprime-la (icône corbeille ou
  « … » → *Delete*). Un secours vers Anthropic serait payant.
- [ ] Supprime la ligne **`RESEND_API_KEY`** du relais (et `NOTIFY_TO` s'il y en a une). Elles servaient à l'ancienne route `/notify` (signalement par e-mail),
  supprimée le 29/09. Un secret que plus aucun code ne lit n'apporte rien et reste
  un risque. ⚠️ Ne touche pas à celles du serveur de comptes (partie C) : lui s'en
  sert.

> **Pourquoi `APP_ORIGIN` sans le chemin ?** Une *origine*, c'est le protocole et le
> domaine, sans rien après : `https://mcslec.github.io`. Le navigateur l'annonce à
> chaque requête, et le relais refuse toute autre origine. Un seul caractère de
> trop (un `/` final) et l'app elle-même serait refusée.

### B5. Tester pour de vrai

Les bancs de test **simulent** Gemini : ils prouvent la logique, pas que Google
accepte réellement notre requête. Seul un vrai appel le prouve.

- [ ] *(Facultatif, sur ordinateur — ne consomme rien.)* Ouvre l'app
  (`https://mcslec.github.io/garage-manifest1/`), **F12** → **Console**, colle :
  ```js
  fetch("https://silent-firefly-2620.cyril-lapopin.workers.dev/",{method:"POST",body:"{}"}).then(r=>console.log(r.status),e=>console.log("bloqué",e))
  ```
  Une requête **sans image** : le relais vérifie sa configuration **avant** de compter
  un quota ou d'appeler Gemini, donc ce test ne coûte rien. **400** = tout est en place ·
  **503** = liaison `DB` absente (B3) · **500** = `IA_FOURNISSEUR` ou clé (B4) ·
  **« bloqué »** = `APP_ORIGIN` mal saisie (B4).

- [ ] Cloudflare → **silent-firefly-2620** → onglet **Observability** → journaux en
  direct (*Live* / *Real-time logs*). Laisse cet onglet ouvert.
- [ ] Sur ton téléphone, ouvre l'app, photographie une voiture (ou importe une photo
  nette d'une voiture connue).
- ✅ **Réussi** si :
  - l'app propose une voiture (ou plusieurs, à départager) ;
  - dans les journaux, la requête apparaît avec le statut **200**, et **aucune** ligne
    `[relais]` en rouge.
- ℹ️ Aucune clé Anthropic n'est enregistrée sur ton relais : rien à supprimer de ce
  côté, et rien ne peut être facturé par Anthropic.

🎉 **À la fin de B, la reconnaissance photo tourne gratuitement**, avec des
plafonds : 30 identifications par jour et par appareil sans compte, 3 000 par jour
au total. Ça marche **dès maintenant** avec l'app en ligne, sans rien attendre de
moi.

---

## Partie C — Le serveur de comptes, en mode essai (≈ 20 min)

### C0. Mettre la base à jour (si elle a été créée avant le 14/10)

Le serveur de comptes du 14/10 utilise deux tables de plus (connexion Google :
`identites`, `jetons_consommes`). Sans elles, **la suppression de compte et la purge
de nuit échoueraient**. La base `garage-comptes` a été créée le 04/10 : il faut les
ajouter.

- [ ] Rejoue **A4** (copier `cloud/schema.sql`, le coller dans la Console D1,
  **Execute**) — ou demande-le-moi : je le fais par le connecteur après ton « go ».
  Rien n'est effacé : chaque ligne commence par `CREATE TABLE IF NOT EXISTS`.
- [ ] Vérifie avec la requête de A5 : **8 tables** (les 6 d'origine + `identites` et
  `jetons_consommes`), plus éventuellement `_cf_KV`.

### C1. La clé Resend

- [ ] Va sur **resend.com**, connecte-toi → **API Keys** → **Create API Key**.
- [ ] Nom : `garage-comptes`. Permission : **Sending access** (envoi seulement).
- [ ] **Copie la clé tout de suite** : Resend ne l'affiche qu'**une seule fois**.
  Si tu la perds, supprime-la et recrée-en une.
- [ ] **Note l'adresse e-mail de ton compte Resend** (en haut à droite, ou
  *Settings*). C'est **la seule** adresse qui pourra recevoir un code tant qu'on n'a
  pas de domaine. D'après GitHub, c'est probablement **dijon.autodetail@gmail.com** :
  vérifie-le ici.
- ✅ **Rien à supprimer** : l'ancienne clé « Garage manifest » (celle qui était en
  clair sur le relais) a été **révoquée le 26/10** par le connecteur, avec ton accord,
  et la liste des clés était ensuite vide. Si tu vois une autre clé que celle que tu
  viens de créer, préviens-moi.

### C2. Fabriquer le secret des codes

Ce secret scelle les codes de connexion dans la base (même si la base fuitait, les
codes resteraient illisibles). Il doit être **aléatoire et long** : on ne l'invente
pas soi-même, on le fait tirer par la machine.

- [ ] Dans ton navigateur, sur **n'importe quelle page**, ouvre la console :
  **F12** (ou clic droit → *Inspecter*) → onglet **Console**.
  *(Sur Mac/Safari : Réglages → Avancés → « Afficher les fonctionnalités pour les
  développeurs web », puis Développement → Afficher la console JavaScript.)*
- [ ] Colle cette ligne puis **Entrée** :
  ```js
  btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
  ```
  *(Si Chrome refuse de coller et affiche un avertissement, tape d'abord à la main
  `allow pasting` puis Entrée, et recommence. C'est une protection contre les
  arnaques. Ici tu colles une ligne dont tu sais ce qu'elle fait : elle tire
  32 octets au hasard et les écrit en texte.)*
- [ ] La console affiche une suite d'environ 44 caractères entre guillemets, du type
  `"q3V…k8="`. **Copie-la sans les guillemets.** Ne la garde nulle part ailleurs
  qu'à l'étape C5.
- **Sur téléphone** (pas de console) : utilise le **générateur de mot de passe** d'un
  gestionnaire (celui de Google, Bitwarden, 1Password…) réglé sur **40 caractères ou
  plus**, lettres et chiffres. C'est aussi solide (≈ 238 bits de hasard, contre 256
  pour la console) : ne l'invente surtout pas toi-même. Colle-le directement en C5.

### C3. Créer le serveur

- [ ] Cloudflare → **Workers & Pages** → **Create** (ou *Create application*) →
  **Workers** → **Start with Hello World!** (ou *Create Worker*).
- [ ] Nom : **`garage-comptes`** → **Deploy**. Cloudflare publie un exemple
  « Hello World » : c'est normal, on le remplace juste après.
- [ ] Ouvre le code du serveur sur GitHub :
  `https://github.com/MCSlec/garage-manifest1/blob/claude/create-claude-documentation-8eo2t7/cloud/compte-worker.js`
  → **Copy raw file**.
- [ ] Sur la page du worker **garage-comptes** → **Edit code** → sélectionne tout →
  colle → **Deploy**.

### C4. Relier la base

- [ ] **garage-comptes** → **Settings** → **Bindings** → **Add binding** → **D1 database**
  → nom **`DB`**, base **`garage-comptes`** → **Deploy**.
- [ ] **N'ajoute PAS de liaison R2.** Son absence, c'est précisément le mode essai :
  le serveur sauvegarde la collection et laisse les photos sur ton téléphone. (R2
  demande une carte bancaire.)

### C5. Les réglages du serveur

**Settings → Variables and Secrets → Add variable**. Comme en B4 : pas de menu *Type*,
c'est la case **Secret** au bout de la ligne *Value* (**cochée = Secret, décochée =
Text**) ; *+ Add* ajoute une ligne :

| Type | Nom (exactement) | Valeur |
|---|---|---|
| **Secret** | `RESEND_API_KEY` | la clé Resend copiée en C1 |
| **Secret** | `CODE_SECRET` | la suite tirée en C2 |
| **Text** | `APP_ORIGIN` | `https://mcslec.github.io` |
| **Text** | `MAIL_FROM` | `Garage Manifest <onboarding@resend.dev>` |

- [ ] Les quatre lignes sont ajoutées, puis **Deploy**.

> **`onboarding@resend.dev`**, c'est l'adresse d'essai que Resend prête à tout le
> monde. Contrepartie : elle n'écrit **qu'à l'adresse de ton compte Resend**. Le jour
> où tu auras un domaine, on la remplacera par `connexion@ton-domaine.fr`, et tout le
> monde pourra recevoir un code.

### C6. La purge de nuit (indispensable)

Chaque nuit, le serveur efface ce qui a expiré : codes non utilisés, sessions
échues, compteurs anti-abus. C'est la règle RGPD « rien d'inutile n'est gardé », et
`cloud/CONFIDENTIALITE.md` la promet (« effacé à la purge nocturne suivante ») : sans
ce déclencheur, la promesse serait fausse. *(Le relais a sa propre purge depuis le
07/10, étape B2 bis : celle-ci couvre les codes et les sessions.)*

- [ ] **garage-comptes** → **Settings** → **Trigger Events** (ou *Triggers*) →
  **Add** → **Cron Triggers** → expression **`17 3 * * *`** → **Add/Deploy**.
  (= tous les jours à 3 h 17, heure UTC. La prise en compte peut demander jusqu'à
  15 minutes.)

### C7. Vérifier que le serveur répond

- [ ] Sur la page du worker, copie son adresse (*Domains & Routes* ou en haut :
  `https://garage-comptes.cyril-lapopin.workers.dev`).
- [ ] Ouvre dans ton navigateur cette adresse suivie de `/garage`, par exemple
  `https://garage-comptes.cyril-lapopin.workers.dev/garage`.
- ✅ **Réussi** si la page affiche :
  `{"erreur":"Session absente ou expirée"}`
  C'est **la bonne réponse** : le serveur tourne, lit la base, et refuse poliment
  quelqu'un qui n'est pas connecté.

---

## Partie D — Me donner l'adresse (≈ 1 min)

- [ ] Envoie-moi dans la conversation l'adresse du worker, **et rien d'autre** :
  `https://garage-comptes.cyril-lapopin.workers.dev`
- Je l'inscris dans l'app (`COMPTE_URL`), je relance les bancs, je livre.

---

## Partie E — Tester sur ton téléphone (≈ 5 min, après ma livraison)

⚠️ **Prérequis : la PR #1 doit être fusionnée dans `main`.** Ton app en ligne
(GitHub Pages) est construite depuis `main`, qui ne contient encore **aucun** des
travaux récents : comptes, parcours de capture, suppression de photo… Tant que tu ne
m'as pas dit « merge », ton téléphone ne verra pas le panneau « Compte ». La décision
t'appartient : je ne fusionne jamais sans ta demande explicite.

Une fois la fusion faite :

- [ ] Sur le téléphone, ferme complètement l'app puis rouvre-la (deux fois si
  besoin) : c'est ainsi que le téléphone télécharge la nouvelle version. Dans
  **Plus → Réglages**, la version affichée doit être **20.198.0** ou plus.
- [ ] **Plus → Réglages → Compte** → tape **l'adresse de ton compte Resend** →
  **Recevoir un code**.
- [ ] Le mail arrive en moins d'une minute (regarde les **indésirables**). Le code
  figure aussi dans l'objet du mail : visible directement dans la notification.
- [ ] Tape le code → **Valider** → le panneau affiche **Connecté**.
- [ ] **Sauvegarder** → message attendu :
  « Sauvegardé : N voitures, sans les photos (ce serveur ne les garde pas : elles
  restent sur ce téléphone). » Le panneau indique **« Collection seule »**.
- [ ] *(Facultatif, le vrai test)* Sur un **autre** appareil, ou dans un navigateur
  en navigation privée : ouvre l'app, connecte-toi avec la même adresse,
  **Récupérer** → tes voitures arrivent, sans les photos.

🎉 C'est fini. Dis-moi simplement « comptes testés » : je coche dans
`RESTE-A-FAIRE.md`.

---

## Partie F — « Continuer avec Google » (facultatif, ≈ 15 min, après C)

Le code est prêt depuis le 14/10, **en sommeil** : sans l'identifiant ci-dessous, ni
bouton, ni la moindre requête vers Google. Gratuit, **aucune carte bancaire**.

> **Ce que tu vas créer :** un « identifiant client » Google. Il dit à Google :
> « l'app installée sur `mcslec.github.io` a le droit d'afficher un bouton de
> connexion ». Cet identifiant est **public** (il est lisible dans l'app) : tu peux
> me l'envoyer. Si Google t'affiche aussi un **secret client** (*client secret*),
> celui-là, on n'en a **pas besoin** : ne le copie pas, ne l'envoie à personne.

- [ ] **F1. Ouvrir Google Cloud.** Va sur **console.cloud.google.com** avec ton compte
  Google. En haut, sélecteur de projet → **Nouveau projet** → nom `Garage Manifest` →
  **Créer**. *(Un projet à part, plutôt que celui de Gemini : l'identité et l'IA
  restent séparées, et le nom affiché aux joueurs est le bon.)*
- [ ] **F2. Présenter l'app à Google.** Menu → **Google Auth Platform** (selon
  l'interface : *API et services* → *Écran de consentement OAuth*) → **Commencer** :
  - nom de l'app : `Garage Manifest` ; e-mail d'assistance : ton adresse ;
  - audience : **Externe** ; coordonnées : ton adresse → accepte → **Créer**.
- [ ] **F3. Créer l'identifiant.** **Clients** (ou *Identifiants*) → **Créer un client**
  → type **Application Web** → nom `Garage Manifest web` →
  **Origines JavaScript autorisées** : `https://mcslec.github.io` (exactement, sans
  `/` final, sans `garage-manifest1`) → **aucune** URI de redirection → **Créer**.
- [ ] **F4. Copier l'identifiant client** : il finit par `.apps.googleusercontent.com`.
- [ ] **F5. Qui peut se connecter.** Tant que l'app est en mode **Test**, seuls les
  comptes ajoutés comme **utilisateurs test** peuvent se connecter : ajoute ta propre
  adresse Google (*Audience* → *Utilisateurs test*). Pour ouvrir à tous :
  **Publier l'application**. Avec les seules informations de base (adresse, nom),
  Google ne demande en principe pas de vérification — **si un écran en réclame une,
  ou un paiement, arrête-toi et préviens-moi.**
- [ ] **F6. Le serveur.** Cloudflare → **garage-comptes** → **Settings** → *Variables
  and secrets* → **Add** : **Text** (case *Secret* décochée), nom `GOOGLE_CLIENT_ID`,
  valeur = l'identifiant de F4 → **Deploy**.
- [ ] **F7. Me l'envoyer** dans la conversation. Je l'inscris dans l'app
  (`gm-compte.js`), j'augmente la version, je relance les bancs, je livre. Comme pour E,
  le bouton n'est visible sur ton téléphone qu'**après la fusion de la PR #1**.
- [ ] **F8. Tester** : Réglages → Compte → **Continuer avec Google** → choisis ton
  compte → « Connecté » → **Sauvegarder**. Puis, si tu peux, **sur un iPhone** : c'est
  le seul point encore incertain (stockage séparé de l'app installée).

| Symptôme | Cause | Remède |
|---|---|---|
| Fenêtre Google « Erreur 400 : origin_mismatch » | Origine mal saisie en F3 | Exactement `https://mcslec.github.io` |
| « Accès bloqué : l'app n'a pas terminé la validation » | Mode Test, ton adresse n'est pas testeuse | F5 : ajoute-toi, ou publie |
| Pas de bouton Google dans Compte | Identifiant pas encore livré, ou ancienne version en cache | F7 ; ferme et rouvre l'app |
| « Connexion Google non configurée sur ce serveur » | Variable du serveur absente | F6 |
| « Connexion Google refusée » | Identifiant différent entre l'app et le serveur | Même valeur en F6 et en F7 |
| « Avec cette adresse, connecte-toi avec un code reçu par e-mail » | Adresse Google qui n'est pas en `@gmail.com` (ni d'un domaine géré par Google) : Google n'en est pas maître | Connecte-toi par code — protection voulue, elle empêche qu'un tiers crée ou ouvre ton compte avec une ancienne adresse |
| « Connexion Google indisponible pour l'instant » | Script de Google bloqué (hors ligne, bloqueur de pubs) | Code par e-mail, ou désactive le bloqueur pour l'app |

---

## Si ça ne marche pas

Trouve ton symptôme, applique la cause. Si rien ne correspond, envoie-moi le symptôme
exact et une capture d'écran **où aucune clé n'est visible**.

### Partie A
| Symptôme | Cause | Remède |
|---|---|---|
| La Console D1 affiche une erreur à l'exécution du schéma | Copie incomplète | Recommence A4 avec le bouton **Copy raw file** (pas une sélection à la souris) |
| A5 montre moins de 8 tables | Schéma exécuté en partie | Réexécute A4 : il ne recrée que ce qui manque |

### Partie B — le relais

Ton app en ligne (version actuelle de `main`) affiche une erreur du relais sous la
forme **« Relais IA indisponible (HTTP xxx) »**. Le nombre `xxx` désigne la cause,
et les journaux (onglet **Observability** du relais) la précisent.

| Code dans l'app | Ligne dans les journaux | Cause | Remède |
|---|---|---|---|
| **HTTP 503** | `liaison D1 « DB » absente` | B3 oubliée, ou nom différent de `DB` | Refais B3, nom **`DB`** exactement |
| **HTTP 500** | `fournisseur inconnu « … »` | Faute de frappe dans `IA_FOURNISSEUR` | Valeur **`gemini`**, en minuscules, sans espace |
| **HTTP 500** | `aucune clé pour gemini` | Secret absent ou mal nommé | Secret **`GEMINI_API_KEY`** exactement |
| **HTTP 502** | `erreur gemini HTTP 400` ou `HTTP 403` | Clé Gemini invalide ou mal copiée | Recrée une clé en B1, remplace le secret |
| **HTTP 502** | `erreur gemini HTTP 404` | Modèle introuvable (renommé par Google) | Dis-le-moi : on le change par une variable `GEMINI_MODELE`, sans toucher au code |
| **HTTP 429** | *(rien d'anormal)* | Quota du jour atteint (Gemini, ou 30 par appareil) | Normal en offre gratuite : ça revient le lendemain |
| **HTTP 403** | *(rien)* | `APP_ORIGIN` mal saisie : le relais refuse l'app | Exactement `https://mcslec.github.io`, sans `/` final |
| L'app propose directement le choix manuel, aucune requête dans les journaux | — | Le téléphone utilise un autre relais | App → Réglages → « Endpoint IA » : vide (relais officiel) ou l'adresse de `silent-firefly-2620` |

*(Après la fusion de la PR #1, l'app affiche des messages en clair à la place des
codes, par exemple « La reconnaissance n'est plus disponible aujourd'hui » pour
un 429. Les causes restent les mêmes.)*

### Partie C / E — les comptes
| Ce que tu vois | Cause probable | Remède |
|---|---|---|
| C7 affiche `{"erreur":"Erreur interne"}` | Liaison `DB` absente ou mal nommée | Refais C4, nom **`DB`** exactement |
| C7 affiche une page d'erreur Cloudflare (code 1101, ou « Worker threw exception ») | Code incomplet : copie tronquée | Refais la fin de C3 avec **Copy raw file**, puis **Deploy** |
| C7 affiche `Hello World!` | Le code d'exemple est toujours là | Refais la fin de C3 : *Edit code*, tout remplacer, **Deploy** |
| « Erreur interne » en demandant un code | L'adresse saisie n'est pas celle du compte Resend, **ou** `RESEND_API_KEY` / `MAIL_FROM` erronés | Tape l'adresse **du compte Resend**. Sinon, vérifie C1 et C5 (journaux du worker : `envoi-mail-403` = mauvaise adresse ou clé) |
| Aucun mail reçu, sans erreur | Filtre anti-spam | Regarde les **indésirables** ; marque le mail « pas spam » |
| « Trop de demandes, réessaie plus tard » | Plus de 3 codes en 15 minutes | Protection anti-abus : patiente 15 minutes |
| « Code incorrect » alors qu'il est juste | Un code plus récent l'a remplacé | Seul le **dernier** code reçu vaut : utilise le plus récent |
| Le panneau « Compte » n'apparaît pas | PR #1 pas encore fusionnée, ou ancienne version en cache | Voir le prérequis de la partie E ; ferme et rouvre l'app |

---

## Pour l'expliquer à ta hiérarchie

> « Deux services serveur gratuits, hébergés chez Cloudflare, partagent une même base
> de données. Le premier relaie les photos vers une IA de reconnaissance en offre
> gratuite, avec des plafonds par appareil et par jour. Le second gère les comptes
> sans mot de passe (code à usage unique reçu par e-mail) et sauvegarde les
> collections. Aucun moyen de paiement n'est enregistré : un quota atteint suspend le
> service au lieu de le facturer. Aucun secret n'est présent dans l'application ni
> dans le code source : ils sont stockés chiffrés côté hébergeur. »
