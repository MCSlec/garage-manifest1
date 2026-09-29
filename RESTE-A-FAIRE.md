# Reste à faire — côté humain

> Ce que **seul le propriétaire du projet** peut faire : créer des comptes,
> payer, signer, décider. Tout le reste est pris en charge dans le code.
> Tenu à jour à chaque livraison ; une ligne cochée sort de la liste au
> passage suivant (l'historique reste dans `git log`).
>
> 🔴 bloque un lancement · ⚖️ obligation légale · 🟡 décision produit

---

## 1. ⚖️ Déjà en production — à trancher en premier

- [ ] **Attribution OpenStreetMap absente de la carte.** `index.html` crée la
  carte avec `attributionControl:false` alors qu'elle affiche les tuiles de
  `tile.openstreetmap.org`. La politique d'usage des tuiles OSM et la licence
  ODbL imposent une mention visible « © OpenStreetMap ». Deux sorties :
  - **(a)** feu vert pour réafficher la mention (une ligne, petit texte en bas
    à droite de la carte) ;
  - **(b)** passer à la carte embarquée (§4) : plus de tuiles OSM, plus
    d'obligation — mais ce n'est pas immédiat.

  Recommandation : **(a) tout de suite**, (b) ensuite si tu la valides.

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

## 3. ⚖️ Avant d'ouvrir les comptes au public

Tout est dans `cloud/CONFIDENTIALITE.md` :

- [ ] Identité et contact du **responsable du traitement**, date de publication.
- [ ] Vérifier l'adhésion de **Cloudflare** et **Resend** au Data Privacy
  Framework UE–États-Unis (transfert hors UE).
- [ ] Vérifier la durée de rétention des sauvegardes techniques D1
  (« Time Travel ») selon l'offre Cloudflare choisie.
- [ ] 🟡 **Comptes inactifs** : durée de conservation (proposition : suppression
  après 3 ans sans connexion, précédée d'un e-mail). Je code la purge dès que
  c'est tranché.
- [ ] 🟡 **Âge minimum** des utilisateurs.

## 4. 🟡 Carte sans aucun service externe

Faisable, la question est le **niveau de détail** (chiffres mesurés le 29/09) :

| Option | Détail visible | Poids | Hébergement |
|---|---|---|---|
| **A. Carte du monde embarquée** (Natural Earth, domaine public) | Pays, côtes — pas de rues | 0,76 Mo (1:50 M) à 3,7 Mo (1:10 M), 0,2 à 0,9 Mo compressé | Dans le dépôt, hors ligne, rien à payer |
| **B. Rues de la France / de l'Europe** (données OSM en PMTiles) | Rues, comme aujourd'hui | Probablement plusieurs Go — **à mesurer** sur l'emprise choisie avant de décider | Trop gros pour GitHub Pages → ton bucket R2 (celui des comptes) |
| **C. Statu quo** | Rues | — | Serveurs OSM (externe) |

- [ ] Choisir A, B, ou A puis B.

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
