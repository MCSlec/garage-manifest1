# Déployer les comptes Garage Manifest

> Ce dossier `cloud/` contient le code d'un **serveur**. Il ne part pas sur
> GitHub Pages avec l'app : il se déploie à part sur Cloudflare Workers, comme
> `ai-relay-worker.js`. Tant que ce n'est pas fait, l'app fonctionne exactement
> comme avant : le module `gm-compte.js` reste **en sommeil** (aucun panneau,
> aucun appel réseau).

## Ce qu'il faut avant de commencer

| Besoin | Pourquoi | Coût indicatif* |
|---|---|---|
| Compte **Cloudflare** | Héberge le Worker (code), D1 (base SQL) et R2 (photos) | Offre gratuite : 100 000 requêtes/jour, D1 5 Go, R2 10 Go |
| Compte **Resend** | Envoie l'e-mail contenant le lien de connexion | Offre gratuite : 3 000 e-mails/mois, 100/jour |
| Un **nom de domaine** à toi | Resend n'envoie à n'importe quelle adresse que depuis un domaine vérifié (SPF/DKIM). Sans domaine, il n'écrit qu'à ta propre adresse : suffisant pour tester, pas pour lancer | ≈ 10 €/an |
| **Node.js** sur ton ordinateur | Pour l'outil en ligne de commande `wrangler` | Gratuit |

\* Vérifie les grilles tarifaires au moment du déploiement : elles évoluent.

`wrangler` est un **outil de déploiement** sur ton poste, pas une dépendance de
l'app : rien n'est ajouté à ce que le navigateur télécharge (CLAUDE.md §1.2).

## Étapes

Toutes les commandes se lancent **depuis le dossier `cloud/`**.

### 1. Connexion à Cloudflare
```sh
npx wrangler login
```

### 2. Fichier de configuration
```sh
cp wrangler.toml.exemple wrangler.toml
```
`wrangler.toml` est propre à ton déploiement : il est ignoré par git
(`.gitignore`). Il ne contient **aucun secret**, mais pas de raison de publier
l'identifiant de ta base.

### 3. Base de données (D1)
```sh
npx wrangler d1 create garage-comptes
```
Recopie le `database_id` affiché dans `wrangler.toml`, puis crée les tables :
```sh
npx wrangler d1 execute garage-comptes --remote --file=schema.sql
```

### 4. Stockage des photos (R2)
```sh
npx wrangler r2 bucket create garage-photos
```
Le bucket reste **privé** : les photos ne sont servies que par le Worker, à leur
propriétaire authentifié. N'active jamais l'accès public.

### 5. Envoi des e-mails (Resend)
1. Crée un compte sur resend.com.
2. **Domains → Add domain** : ajoute ton domaine et recopie chez ton registraire
   les enregistrements DNS demandés (SPF, DKIM). Attends que le domaine passe
   « Verified ».
3. **API Keys → Create** : clé avec la permission « Sending access » seulement.
4. Donne-la au Worker comme **secret** (elle ne va jamais dans un fichier) :
   ```sh
   npx wrangler secret put RESEND_API_KEY
   ```
5. Dans `wrangler.toml`, mets `MAIL_FROM` sur une adresse de ce domaine :
   `"Garage Manifest <connexion@ton-domaine.fr>"`.

### 6. Adresse de l'app
Dans `wrangler.toml` :
- `APP_ORIGIN` : l'**origine exacte** de l'app, sans chemin ni `/` final
  (`https://mcslec.github.io`). Toute requête d'une autre origine est refusée (403).
- `APP_URL` : l'adresse complète où s'ouvre l'app ; le lien de connexion y
  ajoute `#connexion=…`.

### 7. Déploiement
```sh
npx wrangler deploy
```
Note l'adresse affichée, du type `https://garage-comptes.<ton-compte>.workers.dev`.

Le déclencheur `[triggers] crons` de `wrangler.toml` programme la **purge
nocturne** (jetons expirés, sessions échues, compteurs de débit) : rien à faire
de plus, mais ne le retire pas — c'est ce qui tient la promesse de
`CONFIDENTIALITE.md` sur les durées de conservation.

### 8. Activer le module dans l'app
Dans `gm-compte.js`, renseigne l'adresse du Worker, **sans `/` final** :
```js
const COMPTE_URL = 'https://garage-comptes.<ton-compte>.workers.dev';
```
Puis, comme pour toute livraison d'un fichier mis en cache, incrémente
`VERSION_MODULE` (`gm-specs.js`) **et** `VERSION` (`sw.js`) — sinon les
téléphones gardent l'ancienne copie (CLAUDE.md §5).

### 9. Publier la politique de confidentialité
Complète les champs `[À COMPLÉTER]` de `CONFIDENTIALITE.md` (identité du
responsable, contact) **avant** d'ouvrir les comptes au public : c'est une
obligation dès qu'on collecte une adresse e-mail.

## Vérifier que tout marche

1. Réglages → panneau **Compte** → saisis ton adresse → « Recevoir le lien ».
2. Ouvre le lien **sur le même appareil** : « Connecté ✓ ».
3. « Sauvegarder » : le message indique le nombre de voitures et de photos.
4. Sur un second appareil : connexion, puis « Récupérer ».

En cas de souci : `npx wrangler tail` affiche le journal du Worker en direct.
Aucun détail interne n'est renvoyé au navigateur (« Erreur interne ») ; le
détail est dans ce journal.

## Avant toute modification du serveur

```sh
node banc-compte.js              # le Worker réel, D1 et R2 simulés (37 tests)
node banc-compte-navigateur.js   # app + Worker de bout en bout dans Chromium (26 tests)
```
Les deux doivent repasser. Ils ne nécessitent ni compte Cloudflare ni réseau.

## Retirer le service

1. Remets `COMPTE_URL = ''` dans `gm-compte.js` et livre (bump des versions) :
   le panneau disparaît, les garages locaux ne sont pas touchés.
2. Préviens les utilisateurs : leur garage reste sur leur téléphone, et
   Réglages → « Exporter ma collection » en garde une copie fichier.
3. `npx wrangler delete`, puis supprime la base D1 et le bucket R2 depuis le
   tableau de bord Cloudflare.
