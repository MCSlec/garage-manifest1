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

1. [ ] Créer un compte **Cloudflare** (gratuit).
2. [ ] Acheter un **nom de domaine** (≈ 10 €/an) — nécessaire pour que Resend
   écrive à n'importe quelle adresse.
3. [ ] Créer **un** compte **Resend** et y vérifier le domaine (SPF / DKIM).
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
- [ ] **Créer une alerte de facturation** Cloudflare **et** chez le fournisseur d'IA :
  la seule garantie qui ne dépend pas du code.

## 2 ter. 🔴 Relais IA

- [x] Plafonds validés le 29/09 (3 000/jour au total, 30/jour sans compte, 200/jour
  avec compte) et `/notify` supprimé — **faits dans le code**.
- [ ] **Redéployer le relais** avec la liaison D1 `DB` et la variable `APP_ORIGIN`
  (README §3bis). Tant que ce n'est pas fait, c'est l'ANCIEN relais, ouvert, qui tourne.
- [ ] 🟡 **Choisir le fournisseur d'IA** : Claude Haiku (payant dès le 1er appel)
  ou Gemini Flash-Lite (quota gratuit quotidien). Voir le rapport du 29/09.

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

## 5. 🟡 Décisions produit en attente

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
