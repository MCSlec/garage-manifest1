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
  - Emplacement (*location*) : laisse le choix automatique, ou choisis l'Europe
    occidentale.
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
  ✅ **Tu dois voir 6 tables** : `codes`, `garages`, `limites`, `sessions`, `usages`,
  `utilisateurs`. Il peut y en avoir une 7ᵉ qui commence par `_cf_` : c'est celle de
  Cloudflare, normal.

> **Pourquoi une console et pas un fichier ?** Le schéma, c'est le *plan* de la
> base : quelles tables, quelles colonnes. Il ne contient aucune donnée. Le
> réexécuter ne casse rien : chaque ligne commence par `CREATE TABLE IF NOT EXISTS`,
> donc une table qui existe déjà est laissée telle quelle.

---

## Partie B — Le relais IA avec Gemini gratuit (≈ 20 min)

### B1. La clé Gemini (Google) — réutilise celle que tu as déjà

Ton relais a démarré sur Gemini en juillet : tu as donc **déjà** un compte Google AI
Studio, et probablement une clé.

- [ ] Va sur **aistudio.google.com/app/apikey**, connecte-toi avec le **même** compte
  Google qu'en juillet.
- [ ] **Une clé figure dans la liste ?** Vérifie que son projet affiche une offre
  **gratuite** (*Free tier*, pas de facturation). Si AI Studio te laisse la copier,
  copie-la. Sinon, ou si tu as un doute, **Create API key** dans ce même projet : une
  clé de plus ne coûte rien. Tu pourras supprimer l'ancienne une fois B5 réussie.
- [ ] **Aucune clé ?** **Create API key**. Si Google propose de choisir un projet,
  laisse-le en créer un.
- [ ] **Copie la clé** et garde l'onglet ouvert (tu la colleras à l'étape B4).

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

> À partir de cet instant, le relais **refuse de travailler** (erreur 503) tant que la
> base n'est pas reliée (B3). C'est voulu : un relais sans plafond serait un service
> ouvert à tous. Enchaîne directement B3 et B4 ; pendant ces quelques minutes, l'app
> propose simplement le choix manuel.

### B3. Relier la base au relais

- [ ] Retour sur la page de **silent-firefly-2620** → onglet **Settings** → section
  **Bindings** → **Add** → **D1 database**.
- [ ] **Variable name : `DB`** (deux majuscules, rien d'autre).
- [ ] **D1 database : `garage-comptes`** → **Deploy** (ou *Save*).

### B4. Les réglages du relais

Toujours dans **Settings** → section **Variables and Secrets** → **Add**, une ligne
à la fois :

| Type | Nom (exactement) | Valeur |
|---|---|---|
| **Secret** | `GEMINI_API_KEY` | la clé copiée en B1 |
| **Text** | `IA_FOURNISSEUR` | `gemini` |
| **Text** | `APP_ORIGIN` | `https://mcslec.github.io` (sans `/` à la fin, sans `garage-manifest1`) |

- [ ] Les trois lignes sont ajoutées, puis **Deploy**.
- [ ] S'il existe une ligne **`IA_SECOURS`** : supprime-la (icône corbeille ou
  « … » → *Delete*). Un secours vers Anthropic serait payant.
- [ ] S'il existe des lignes **`RESEND_API_KEY`** ou **`NOTIFY_TO`** sur le relais :
  supprime-les. Elles servaient à l'ancienne route `/notify` (signalement par e-mail),
  supprimée le 29/09. Un secret que plus aucun code ne lit n'apporte rien et reste
  un risque. ⚠️ Ne touche pas à celles du serveur de comptes (partie C) : lui s'en
  sert.
- [ ] S'il existe une ligne **`ANTHROPIC_API_KEY`** : **laisse-la pour l'instant**. Tu
  la supprimeras une fois le test B5 réussi (sans `IA_SECOURS`, elle n'est jamais
  utilisée).

> **Pourquoi `APP_ORIGIN` sans le chemin ?** Une *origine*, c'est le protocole et le
> domaine, sans rien après : `https://mcslec.github.io`. Le navigateur l'annonce à
> chaque requête, et le relais refuse toute autre origine. Un seul caractère de
> trop (un `/` final) et l'app elle-même serait refusée.

### B5. Tester pour de vrai

Les bancs de test **simulent** Gemini : ils prouvent la logique, pas que Google
accepte réellement notre requête. Seul un vrai appel le prouve.

- [ ] Cloudflare → **silent-firefly-2620** → onglet **Logs** → démarre le flux en
  direct (*Begin log stream* / *Live*). Laisse cet onglet ouvert.
- [ ] Sur ton téléphone, ouvre l'app, photographie une voiture (ou importe une photo
  nette d'une voiture connue).
- ✅ **Réussi** si :
  - l'app propose une voiture (ou plusieurs, à départager) ;
  - dans les journaux, la requête apparaît avec le statut **200**, et **aucune** ligne
    `[relais]` en rouge.
- [ ] Une fois réussi : **Settings → Variables and Secrets → supprime
  `ANTHROPIC_API_KEY`**, puis **Deploy**. Va aussi sur **console.anthropic.com** →
  *Billing* et **désactive la recharge automatique** (*auto-reload*) s'il y en a une.

🎉 **À la fin de B, la reconnaissance photo tourne gratuitement**, avec des
plafonds : 30 identifications par jour et par appareil sans compte, 3 000 par jour
au total. Ça marche **dès maintenant** avec l'app en ligne, sans rien attendre de
moi.

---

## Partie C — Le serveur de comptes, en mode essai (≈ 20 min)

### C1. La clé Resend

- [ ] Va sur **resend.com**, connecte-toi → **API Keys** → **Create API Key**.
- [ ] Nom : `garage-comptes`. Permission : **Sending access** (envoi seulement).
- [ ] **Copie la clé tout de suite** : Resend ne l'affiche qu'**une seule fois**.
  Si tu la perds, supprime-la et recrée-en une.
- [ ] **Note l'adresse e-mail de ton compte Resend** (en haut à droite, ou
  *Settings*). C'est **la seule** adresse qui pourra recevoir un code tant qu'on n'a
  pas de domaine.

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

- [ ] **garage-comptes** → **Settings** → **Bindings** → **Add** → **D1 database**
  → nom **`DB`**, base **`garage-comptes`** → **Deploy**.
- [ ] **N'ajoute PAS de liaison R2.** Son absence, c'est précisément le mode essai :
  le serveur sauvegarde la collection et laisse les photos sur ton téléphone. (R2
  demande une carte bancaire.)

### C5. Les réglages du serveur

**Settings → Variables and Secrets → Add**, une ligne à la fois :

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

### C6. La purge de nuit (recommandé)

Chaque nuit, le serveur efface ce qui a expiré : codes non utilisés, sessions
échues, compteurs anti-abus. C'est la règle RGPD « rien d'inutile n'est gardé ».

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
  **Plus → Réglages**, la version affichée doit être **20.196.0** ou plus.
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

## Si ça ne marche pas

Trouve ton symptôme, applique la cause. Si rien ne correspond, envoie-moi le symptôme
exact et une capture d'écran **où aucune clé n'est visible**.

### Partie A
| Symptôme | Cause | Remède |
|---|---|---|
| La Console D1 affiche une erreur à l'exécution du schéma | Copie incomplète | Recommence A4 avec le bouton **Copy raw file** (pas une sélection à la souris) |
| A5 montre moins de 6 tables | Schéma exécuté en partie | Réexécute A4 : il ne recrée que ce qui manque |

### Partie B — le relais

Ton app en ligne (version actuelle de `main`) affiche une erreur du relais sous la
forme **« Relais IA indisponible (HTTP xxx) »**. Le nombre `xxx` désigne la cause,
et les journaux (onglet **Logs** du relais) la précisent.

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
