# Brief — palette de la carte de Garage Manifest

## Le contexte

Garage Manifest est une app mobile de collection de voitures (« un Pokédex pour
voitures ») : on photographie les voitures croisées dans la rue, et chacune
rejoint son garage. L'onglet **Carte de chasse** montre, sur une carte, l'endroit
où chaque voiture a été repérée.

La carte est dessinée par un moteur vectoriel (données OpenStreetMap). Je n'ai
**pas** besoin de code : j'ai besoin de **deux palettes de couleurs** (thème
sombre et thème clair), dans le format exact donné en bas de ce document.

Captures jointes : la fiche d'une voiture (Alfa Romeo Giulia) en sombre et en
clair — c'est **le design de référence de l'app** —, et l'écran Garage en sombre.

## Règles de design (non négociables)

1. **Ne crée pas une nouvelle direction visuelle.** La carte doit appartenir à
   la même app que les captures : gris neutres (tons « zinc »), aplats sobres,
   pas de dégradé, pas de couleur vive dans le fond de carte.
2. **La carte est un décor, les repères sont le contenu.** Les voitures sont
   affichées par des pastilles rondes colorées selon leur rareté. Aucune couleur
   du fond de carte ne doit leur voler la vedette.
3. **Piège à éviter :** deux raretés ont des couleurs **grises** (« courant »
   `#6b7280` et « commun » `#a1a1aa`). Sur un fond de carte gris, ces
   pastilles deviennent invisibles. Le fond de carte doit donc rester nettement
   plus sombre (en sombre) ou nettement plus clair (en clair) que ces deux gris,
   ou s'en écarter en teinte.
4. **Lisibilité des noms** (villes, rues) : contraste suffisant avec le fond,
   aidé par un halo.
5. **Le rouge est réservé à l'app** (bouton principal, accents) : pas de rouge
   dans la carte.

## Les couleurs de l'app (à respecter)

| Rôle dans l'app | Thème sombre | Thème clair |
|---|---|---|
| Fond de page | `#0b0b0d` | `#f4f4f5` |
| Panneaux / cartes | `#161618` | `#ffffff` |
| Panneau secondaire | `#111113` | `#fafafa` |
| Filet (bordures) | `#27272a` | `#dedee2` |
| Filet appuyé | `#3f3f46` | `#c7c7ce` |
| Texte principal | `#f4f4f5` | `#18181b` |
| Texte secondaire | `#a1a1aa` | `#52525b` |
| Texte discret | `#71717a` | `#71717a` |
| Texte très discret | `#52525b` | `#a1a1aa` |
| Accent (réservé à l'app) | `#ef4444` | `#ef4444` |

## Les couleurs des repères (pastilles de rareté, identiques dans les deux thèmes)

| Rareté | Couleur |
|---|---|
| Courant | `#6b7280` |
| Commun | `#a1a1aa` |
| Peu commun | `#2dd4bf` |
| Rare | `#818cf8` |
| Épique | `#e879f9` |
| Légendaire | `#fbbf24` |

Chaque pastille : cercle de 16 px, contour de 2 px de la couleur de rareté,
remplissage de la même couleur à 55 % d'opacité.

## Ce que j'attends de toi

1. Les **deux palettes**, dans le format JSON ci-dessous, **sans changer les
   noms des clés** (elles sont lues telles quelles).
2. Pour chaque palette, une ligne de justification.
3. La vérification des contrastes : texte des villes sur la terre, et chacune
   des six pastilles de rareté sur la terre (surtout « courant » et « commun »).

```json
{
  "sombre": {
    "fond": "#......",
    "terre": "#......",
    "eau": "#......",
    "parcs": "#......",
    "forets": "#......",
    "zones_speciales": "#......",
    "batiments": "#......",
    "autoroutes": "#......",
    "routes_principales": "#......",
    "routes_secondaires": "#......",
    "rues": "#......",
    "bordure_routes": "#......",
    "voies_ferrees": "#......",
    "frontieres": "#......",
    "noms_villes": "#......",
    "noms_rues": "#......",
    "noms_eau": "#......",
    "noms_regions_pays": "#......",
    "halo_noms": "#......"
  },
  "clair": {
    "…": "mêmes clés que ci-dessus"
  }
}
```

Définitions des clés, si besoin :
- `fond` : la couleur vue avant que la carte ne se dessine, et au-delà des terres ;
- `terre` : le sol par défaut, la couleur dominante de la carte ;
- `zones_speciales` : hôpitaux, écoles, zones industrielles, aéroports, zones militaires ;
- `bordure_routes` : le liseré de part et d'autre des routes ;
- `halo_noms` : le contour qui détache les noms du fond.
