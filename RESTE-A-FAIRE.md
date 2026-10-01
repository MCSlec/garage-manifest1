# Reste à faire — côté humain

> Ce que **seul le propriétaire du projet** peut faire : créer des comptes,
> payer, signer, décider. Tout le reste est pris en charge dans le code.
> Tenu à jour à chaque livraison ; une ligne cochée sort de la liste au
> passage suivant (l'historique reste dans `git log`).
>
> **Règle : une ligne n'est cochée que lorsque le propriétaire a dit
> explicitement qu'elle est faite.** Jamais par déduction (un fichier qui
> apparaît, une question qui ne revient pas…) : tant que ce n'est pas dit,
> ce n'est pas fait.
>
> 🔴 bloque un lancement · ⚖️ obligation légale · 🟡 décision produit

---

> 🧭 **Par où commencer ?** `TUTO-GRATUIT.md` : tout ce qui suit, pas à pas, dans
> le navigateur, sans ligne de commande (base D1, relais IA Gemini, comptes en essai).

## 0. 💶 Mode gratuit — décision du 01/10 : rien de payant pour l'instant

Ce qui tourne **gratuitement**, sans carte bancaire :
- **App** : GitHub Pages.
- **Relais IA** : Cloudflare Workers + D1 (offres gratuites) avec **Gemini en offre
  gratuite** (clé sur aistudio.google.com, **sans activer la facturation**).
  Réglages : `IA_FOURNISSEUR = gemini`, **pas** de `IA_SECOURS`. Quand le quota gratuit
  du jour est épuisé, le joueur lit « en pause pour aujourd'hui » et choisit à la main
  (géré dans le code depuis le 01/10).
- **Carte** : tuiles OpenStreetMap (gratuites, attribution obligatoire → point 1).

Règle d'or : **n'enregistre aucune carte bancaire** (Google AI Studio, Cloudflare).
Sans moyen de paiement, un service gratuit **refuse** au-delà de son quota au lieu de
facturer : c'est la meilleure protection, meilleure qu'une alerte.

⚠️ Contrepartie de Gemini gratuit : Google peut se servir des photos envoyées pour
améliorer ses produits (régime UE à vérifier, `cloud/CONFIDENTIALITE.md`). À dire dans la
politique de confidentialité avant d'ouvrir l'app au public.

**En pause tant qu'on reste gratuit** (ils demandent de payer) :
- **Comptes ouverts au public** (§2) : **deux** verrous payants. Resend n'écrit à
  n'importe quelle adresse qu'avec un nom de domaine (≈ 10 €/an) ; les photos vont dans
  **R2**, qui demande une carte bancaire. En attendant : **mode essai gratuit** (depuis
  la v20.196.0, R2 est facultatif) — connexion à ta seule adresse, collection sauvée
  sans les photos. `TUTO-GRATUIT.md`, parties C à E.
- **Notre carte** (§4) : le stockage R2 de Cloudflare demande une carte bancaire même pour
  son offre gratuite (à revérifier le moment venu), plus un domaine.
- **Clé Anthropic** : si un crédit existe, désactive la recharge automatique ; une fois
  Gemini vérifié, retire `ANTHROPIC_API_KEY` du relais.

## 1. ⚖️ Déjà en production — à trancher en premier

- [ ] **Attribution OpenStreetMap incomplète sur la carte actuelle.** La
  mention « © OpenStreetMap » figure **sous** la carte, mais seulement quand au
  moins une prise est géolocalisée ; carte vide → aucune mention, alors que les
  tuiles OSM s'affichent. La politique d'usage des tuiles OSM et la licence
  ODbL imposent une attribution visible. Deux sorties :
  - **(a)** feu vert pour ajouter la mention dans le cas « carte vide » (texte
    seul, sous la carte) ;
  - **(b)** passer à **notre** carte (§4) : l'attribution y est affichée
    d'office. Mais cela suppose que les étapes du §4 soient faites.

  Recommandation : **(a) tout de suite**, (b) dès que la carte est hébergée.

## 2. 🔴 Lancer les comptes (dans l'ordre)

Guide détaillé : `cloud/DEPLOIEMENT.md`.

**➜ Voie gratuite, pour essayer sur toi seul (prête depuis la v20.196.0)** —
**`TUTO-GRATUIT.md`, parties A, C, D, E** (tout dans le navigateur). Résumé, pour qui
préfère la ligne de commande (`cloud/DEPLOIEMENT.md`, « Mode essai gratuit ») :
1. [ ] Dans `cloud/`, copier `wrangler.toml.exemple` en `wrangler.toml`, **supprimer
   le bloc `[[r2_buckets]]`**, mettre `MAIL_FROM = "Garage Manifest <onboarding@resend.dev>"`.
2. [ ] `npx wrangler login`, puis base D1 + schéma (étape 3 du guide). **Pas** de R2.
3. [ ] Secrets : `npx wrangler secret put RESEND_API_KEY` (ta clé Resend) et
   `CODE_SECRET` (`openssl rand -base64 32`). Puis `npx wrangler deploy`.
4. [ ] **Me donner l'adresse du Worker** affichée par `deploy` : je renseigne
   `COMPTE_URL` et je livre.
5. [ ] Sur ton téléphone : Réglages → Compte → **l'adresse de ton compte Resend**
   (toute autre adresse ne recevra rien), code reçu, « Sauvegarder ». Le panneau doit
   dire « Collection seule ».

⚠️ Une fois `COMPTE_URL` livrée, le panneau « Compte » est visible par **tout le
monde** : un autre joueur qui tente sa chance ne recevra pas de code (Resend refuse).
Rien ne casse, mais c'est déroutant : à garder court, ou à dire autour de toi.

**Voie complète (ouverture au public)** :

1. [ ] Créer un compte **Cloudflare** (gratuit).
2. [ ] Acheter un **nom de domaine** (≈ 10 €/an) — nécessaire pour que Resend
   écrive à n'importe quelle adresse.
3. [ ] Créer **un** compte **Resend** et y vérifier le domaine (SPF / DKIM).
   - [x] Compte Resend créé, offre gratuite, **sans domaine** (01/10). Sans domaine,
     Resend n'envoie qu'à l'adresse du titulaire du compte : suffisant pour un essai
     sur toi seul, pas pour d'autres joueurs. La clé `RESEND_API_KEY` est un secret
     du Worker : ne la colle jamais dans l'app, ni dans un message.
   - [ ] Vérifier le domaine (après l'étape 2).
   ⚠️ Un seul compte : il n'y a qu'un type d'e-mail (le code de connexion), et
   ouvrir plusieurs comptes gratuits pour contourner la limite est interdit
   par la politique d'utilisation de Resend (risque : blocage, donc plus
   personne ne peut se connecter).
4. [ ] Dérouler `cloud/DEPLOIEMENT.md` : `wrangler login`, base D1 + schéma,
   bucket R2, secrets **`RESEND_API_KEY`** et **`CODE_SECRET`**, `wrangler deploy`.
5. [ ] **Me donner l'adresse du Worker** (`https://garage-comptes.<…>.workers.dev`) :
   je renseigne `COMPTE_URL` et je livre (bump de version).

## 2 bis. 🟡 Quotas et facture (après déploiement)

- [x] Quotas de stockage validés le 29/09 (5 000 photos / 1,5 Go par compte, 50 Go au total).
- [ ] ~~Alerte de facturation~~ → **sans objet en mode gratuit** (§0 : aucune carte
  enregistrée = aucune facture possible). À remettre le jour où un service payant est activé.

## 2 ter. 🔴 Relais IA

- [x] Plafonds validés le 29/09 (3 000/jour au total, 30/jour sans compte, 200/jour
  avec compte) et `/notify` supprimé — **faits dans le code**.
- [ ] **Redéployer le relais** avec la liaison D1 `DB` et la variable `APP_ORIGIN`
  (**`TUTO-GRATUIT.md`, parties A et B** ; README §3bis). Tant que ce n'est pas fait, c'est l'ANCIEN relais, ouvert, qui tourne.
- [x] Relais **multi-fournisseur** (Claude ou Gemini, bascule par la variable
  `IA_FOURNISSEUR`, secours facultatif `IA_SECOURS`) — **fait dans le code** le 30/09.
- [ ] **Régler le fournisseur** au redéploiement (README §3bis, étape 3) :
  **`gemini`, sans secours** (mode gratuit, §0). Pour Gemini, lire d'abord le point « offre gratuite » de
  `cloud/CONFIDENTIALITE.md`.
- [ ] Après la bascule : **une** capture de test et un coup d'œil au journal
  (`npx wrangler tail`) — le banc simule l'API, il ne remplace pas un vrai appel.

## 2 quater. 🌐 Ce que l'app contacte encore à l'extérieur (état au 30/09)

Le **code** de l'app (scripts, styles, polices, bibliothèques) ne vient plus que
de chez nous (`vendor/`, aucun CDN — vérifié par `banc-carte.js`). Restent des
**échanges de données** :

- [ ] **Tuiles de la carte → OpenStreetMap**, à chaque ouverture de l'onglet
  carte, tant que `CARTE_URL` est vide. Se règle en déployant notre carte (§4).
- [ ] 🟡 **Photo → fournisseur d'IA** (Anthropic ou Google) via notre relais,
  à chaque reconnaissance automatique. Notre relais n'est qu'un intermédiaire :
  le modèle reste chez un tiers. À décider si tu veux aller plus loin (piste :
  un modèle hébergé chez Cloudflare, qui héberge déjà le relais).
- [ ] 🟡 **Lien « Ouvrir dans Maps » → Google Maps**, seulement si tu touches le
  lien sur la fiche. À décider : le garder, ou le remplacer par notre carte.
- Comptes (Cloudflare, Resend) : en sommeil tant que `COMPTE_URL` est vide.

## 3. ⚖️ Avant d'ouvrir les comptes au public

Tout est dans `cloud/CONFIDENTIALITE.md` :

- [ ] Identité et contact du **responsable du traitement**, date de publication.
- [ ] Vérifier l'adhésion de **Cloudflare**, **Resend** et du **fournisseur d'IA**
  au Data Privacy Framework UE–États-Unis (transfert hors UE).
- [ ] Fournisseur d'IA retenu : relever la **durée de conservation** des photos
  reçues par son API et son engagement de **non-entraînement** ; les reporter
  dans `CONFIDENTIALITE.md` (section « Sans compte »). Ce texte concerne **tous**
  les utilisateurs, avec ou sans compte : la reconnaissance est active par défaut.
- [ ] Vérifier la durée de rétention des sauvegardes techniques D1
  (« Time Travel ») selon l'offre Cloudflare choisie.
- [ ] 🟡 **Comptes inactifs** : durée de conservation (proposition : suppression
  après 3 ans sans connexion, précédée d'un e-mail). Je code la purge dès que
  c'est tranché.
- [ ] 🟡 **Âge minimum** des utilisateurs.

## 4. 🔴 Notre propre carte (plus aucun appel externe)

**Prête côté app, en sommeil** (`CARTE_URL` vide dans `index.html`). Guide pas à
pas : `cloud/CARTE.md`. Nécessite le compte Cloudflare et le domaine du §2.

1. [ ] Installer l'outil **`pmtiles`** sur ton ordinateur.
2. [ ] 🟡 **Choisir l'emprise** après l'avoir **mesurée** (`--dry-run`, rien n'est
   téléchargé) : France au niveau des rues (probablement gratuit, ≤ 10 Go — à
   confirmer), ou monde entier (~120 Go, ≈ 1,65 $/mois). Me donner les tailles
   si tu veux que je t'aide à trancher.
3. [ ] Faire l'extrait, créer le bucket **`garage-carte`** (séparé des photos),
   envoyer le fichier (rclone au-delà de 315 Mo).
4. [ ] Brancher un **domaine personnalisé** (`carte.ton-domaine.fr`) sur le
   bucket — pas l'adresse `r2.dev`, réservée au développement.
5. [ ] Coller la **règle CORS** du guide sur le bucket.
6. [ ] **Me donner l'adresse du fichier** (`https://carte.…/france.pmtiles`) :
   je renseigne `CARTE_URL` et je livre.
7. [ ] 🟡 **Design de la carte** : aujourd'hui le style **standard clair** de
   protomaps, identique en thème sombre (une carte claire dans une app sombre).
   Palette clair + sombre à définir (ChatGPT possible, sur la base du brief
   donné le 30/09) ; je la branche ensuite dans le moteur, sans toucher au code.

## 4 bis. 📱 Plus tard : App Store / Google Play (à anticiper, rien à faire maintenant)

Ce qui changera quand l'app passera en application native (enveloppe type
Capacitor autour du même code) :
- **Comptes développeur** : Apple 99 $/an, Google 25 $ une fois.
- **Une étape de construction** (Xcode, Android Studio) : exception à la règle
  « aucune dépendance » de `CLAUDE.md` §1.2, à décider le moment venu.
- **Adresse de l'app** : elle ne sera plus `mcslec.github.io` mais une adresse
  interne (`capacitor://localhost` sur iPhone) → à ajouter dans `APP_ORIGIN`
  du relais et du serveur de comptes, sinon ils refusent l'app (403).
- **Apple refuse les simples sites emballés** (règle 4.2) : l'appareil photo
  natif, la carte et le hors-ligne jouent pour nous.
- **Suppression de compte dans l'app** exigée par Apple : déjà faite.
- **« Se connecter avec Apple »** : non exigé, on n'utilise ni Google ni
  Facebook pour se connecter.
- **Fiches de confidentialité des stores** : à remplir à partir de
  `cloud/CONFIDENTIALITE.md` (photo envoyée à l'IA, e-mail, position GPS).
- **Carte** : les serveurs d'OpenStreetMap n'acceptent pas le trafic d'une app
  publique → **notre carte (§4) devient obligatoire** avant la sortie.
- **Service worker** : peu utile en natif (les fichiers sont dans l'app) ;
  comportement à vérifier sur iPhone au moment du chantier.

## 5. 🟡 Décisions produit en attente

- [x] Spécification P0 reçue de ChatGPT (`design/SPEC-P0-CHATGPT.md`), confrontée au code
  (`design/SPEC-P0-ARBITRAGES.md`).
- [x] Arbitrages P0 rendus et parcours implémenté (v20.195.0, captures dans
  `design/p0-captures-apres/`).
- [ ] 🟡 **Fiche voiture à aligner sur les maquettes** (`design/maquette-fiche-giulia*.png`) :
  aujourd'hui deux pages à faire glisser, sans onglets ni grille à icônes. Chantier à lancer
  sur ton « go », écarts de données déjà listés dans `DESIGN.md` §0.

- [x] **Comptes en mode essai, gratuit** (« go comptes essai », fait le 01/10, v20.196.0 — à toi : §2, voie gratuite) : je rends R2 facultatif
  dans `compte-worker.js` (sauvegarde de la collection **sans les photos** quand
  `PHOTOS` est absent, refus net des envois de photos, banc mis à jour). Resend sans
  domaine n'écrit qu'à ton adresse : ça sert à éprouver le parcours de connexion sur
  ton téléphone, pas à ouvrir les comptes au public.
- [ ] Sauvegarde cloud **manuelle** (bouton, choix par défaut) ou automatique.
- [ ] Photos sauvegardées : **toutes** (choix par défaut, dédupliquées) ou la
  couverture seulement.
- [ ] **i18n (chantier B, option b)** : lancer le mécanisme `t("…")` ? Quelles
  langues en premier ?
- [ ] **Rouleau (chantier C)** : où apparaît la pellicule dans l'écran de
  capture, comment on ouvre une vue révélée (décision de design).
- [ ] **Chantier D** (0–100, v-max, consommation, carburant) : ~2 000 valeurs à
  sourcer — le lancer ?
- [ ] **Accès réseau** aux sites de fiches techniques (réglage de
  l'environnement Claude) : aujourd'hui seuls les résumés de recherche sont
  lisibles, ce qui ralentit le sourçage.
- [ ] **Merger la PR #1** (jamais fait sans ta demande explicite).
