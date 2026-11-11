# Notre propre carte — la créer, l'héberger, la brancher

> **Principe.** La carte n'est pas dans l'app : c'est **un seul fichier**
> (`.pmtiles`) posé sur **notre** stockage Cloudflare R2. L'app en lit
> seulement les morceaux dont elle a besoin (requêtes HTTP « Range »), et les
> dessine avec `protomaps-leaflet`, hébergé dans `vendor/`. Plus aucune
> requête vers OpenStreetMap ni vers qui que ce soit d'autre.
>
> Tant que `CARTE_URL` est vide dans `index.html`, rien ne change : l'app
> utilise les tuiles OpenStreetMap comme avant.

## Pourquoi un fichier PMTiles

- **Un fichier, pas un serveur.** Pas de logiciel de carte à installer ni à
  maintenir : un simple stockage de fichiers qui sait répondre aux requêtes
  « Range » suffit. R2 le fait nativement.
- **L'app ne télécharge que ce qu'elle affiche** : quelques centaines de Ko pour
  une vue, même si le fichier fait des Go.
- **Vectoriel** : les formes (routes, eau, noms de lieux) sont dessinées par
  l'app, et les noms de lieux affichés **en français** (`lang: "fr"`).

## Données et licence

Les données viennent d'**OpenStreetMap** via les extraits quotidiens de
Protomaps. Licence **ODbL** : même hébergée chez nous, la carte **doit afficher**
« © OpenStreetMap » — l'app le fait automatiquement en mode « carte à nous »
(vérifié par `banc-carte-perso.js`). Ne jamais retirer cette mention.

## Étapes

### 1. L'outil `pmtiles` (sur ton ordinateur)
Télécharge le binaire pour ton système depuis la page des versions du projet
`protomaps/go-pmtiles` sur GitHub, et place-le dans ton dossier de travail.

### 2. Choisir l'emprise — et la MESURER avant de télécharger
Les extraits se font depuis la carte du monde du jour (liste des versions :
`https://maps.protomaps.com/builds`, conservées une semaine). Remplace
`AAAAMMJJ` par une date récente.

`--dry-run` affiche la taille **sans rien télécharger** : fais-le pour chaque
option avant de choisir.

```sh
# France métropolitaine + Corse, jusqu'au niveau des rues (zoom 15)
pmtiles extract https://build.protomaps.com/AAAAMMJJ.pmtiles france.pmtiles \
  --bbox=-5.3,41.3,9.7,51.2 --maxzoom=15 --dry-run

# Le monde entier, mais seulement jusqu'au niveau des pays / grandes villes
pmtiles extract https://build.protomaps.com/AAAAMMJJ.pmtiles monde.pmtiles \
  --maxzoom=6 --dry-run
```

Ordres de grandeur publiés (à confirmer par `--dry-run`) : le monde **complet**
fait environ **110 à 120 Go** ; le monde jusqu'au zoom 6 environ **60 Mo**.

| Emprise | Coût de stockage R2* |
|---|---|
| Jusqu'à 10 Go (ex. France, à mesurer) | **0 €** (offre gratuite, 10 Go) |
| Monde complet (~120 Go) | ≈ 110 Go × 0,015 $ ≈ **1,65 $/mois** |

\* R2 : 10 Go gratuits, puis 0,015 $/Go/mois ; **sortie gratuite** (pas de
frais quand l'app lit la carte) ; 10 millions de lectures gratuites par mois,
une lecture ≈ un morceau de carte affiché. À revérifier sur la grille de
Cloudflare au moment de choisir.

Une fois choisi, relance la commande **sans** `--dry-run`.

### 3. Créer le stockage de la carte
Un bucket **séparé** de celui des photos (`garage-photos`, privé) : celui-ci
sera public, et il ne faut jamais mélanger les deux.
```sh
npx wrangler r2 bucket create garage-carte
```

### 4. Envoyer le fichier
- **Moins de 315 Mo** : `npx wrangler r2 object put garage-carte/france.pmtiles --file=france.pmtiles --remote`
- **Plus de 315 Mo** (cas de la France au zoom 15) : `wrangler` ne sait pas
  envoyer plus gros. Utilise **rclone** (envoi en plusieurs parties) avec une
  clé d'accès R2 créée dans le tableau de bord (R2 → *Manage API tokens*).

### 5. Rendre la carte lisible par l'app — par un domaine à toi
Tableau de bord → R2 → `garage-carte` → *Settings* → **Custom Domains** →
par exemple `carte.ton-domaine.fr` (le domaine doit être géré par Cloudflare).

⚠️ **Pas l'adresse `r2.dev`** : Cloudflare la réserve au développement (débit
limité, pas de cache). Le domaine personnalisé passe par le cache de
Cloudflare : la plupart des lectures ne touchent même plus R2.

### 6. Autoriser l'app à lire la carte (CORS)
Même écran → *CORS Policy* → coller, en mettant l'origine exacte de l'app :
```json
[
  {
    "AllowedOrigins": ["https://mcslec.github.io"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["range", "if-match"],
    "ExposeHeaders": ["etag"],
    "MaxAgeSeconds": 86400
  }
]
```
Sans `range` dans `AllowedHeaders`, le navigateur refuse de lire la carte par
morceaux et elle reste vide.

### 7. Brancher la carte dans l'app
Dans `index.html`, section « CARTE DE CHASSE » :
```js
const CARTE_URL = String(window.GM_CARTE_URL || "https://carte.ton-domaine.fr/france.pmtiles");
```
Puis livraison normale : bump `VERSION_MODULE` + `sw.js` (CLAUDE.md §5).

## Ce que le banc garantit

`node banc-carte-perso.js` fabrique une vraie archive PMTiles, la sert sur une
autre origine avec Range et CORS (comme R2), et vérifie dans Chromium :
- la carte est lue **uniquement** sur notre serveur, par morceaux ;
- elle est réellement **dessinée** (eau et terre distinctes) ;
- l'attribution OpenStreetMap est affichée ;
- si notre carte est introuvable, **aucun repli silencieux** vers un tiers ;
- sans `CARTE_URL`, comportement historique et `protomaps-leaflet` non chargé.

## Mettre la carte à jour

Les rues changent peu : refaire l'extrait deux à quatre fois par an suffit.
Même commande, même nom de fichier, puis réenvoi (étape 4). Aucun changement
dans l'app.

## Hors ligne

La carte n'est **pas** mise en cache par le service worker (c'est une autre
origine, et le fichier peut peser des Go) : le navigateur garde seulement les
morceaux déjà vus. Sans réseau, la carte s'ouvre avec les points de tes prises
mais sans fond — exactement comme aujourd'hui avec les tuiles OpenStreetMap. La
collection, elle, reste entièrement locale.
