# DESIGN.md — Direction visuelle de Garage Manifest

> **Statut.** Référence de design fixée par le propriétaire le 30/09/2026.
> **Ne pas changer cette direction sans sa validation explicite.** Ce fichier
> est au design ce que `CLAUDE.md` est au code : toute nouvelle interface se
> vérifie contre lui.
>
> Maquette de référence : [`design/maquette-fiche-giulia.png`](design/maquette-fiche-giulia.png)
> (8 écrans : identification, fiche technique, sélecteur de motorisation,
> photos, dimensions, générations, historique, fiche éditoriale).

---

## 0. Écarts entre la maquette et les données réelles (vérifiés le 30/09)

La maquette illustre une **direction visuelle**. Ses contenus ne sont pas des
données : **aucun chiffre, aucune version, aucune rareté ne se reprend de la
maquette.** L'app affiche ce que contiennent `CARS`, `CATALOGUE_PLUS`, `SPECS`,
`GENS` et `MOTOR_SPECS` (`CLAUDE.md` §2 et §4). Écarts relevés sur la Giulia :

| La maquette montre | Les données disent | Conséquence pour l'implémentation |
|---|---|---|
| Badge **« Rare »** | Rareté de jeu **peu commun** | Le badge affiche `catalogue.rarete`, jamais une valeur écrite dans le design |
| Diesel **2.2 JTDM 150 / 180**, Essence 200 **et** 280 | Diesel **136 / 160 / 190** ; Essence **200** ; Veloce **280 Q4 / 210 Q4** | Le sélecteur liste `MOTOR_SPECS` tel quel |
| « Giulia (2016–2020) **1ère génération** / (2020–2024) **2ème génération** » | Une seule génération, **Type 952** (2015–), restylée en 2020 | Les générations viennent de `GENS` ; un restylage n'est pas une génération |
| 0–100 km/h, Vmax | Présents pour **63** (0–100) et **91** (Vmax) voitures sur 1 071, via `INFO` — **pas** pour la Giulia | La ligne s'affiche **si et seulement si** la donnée existe — pas de case vide « — », pas de valeur inventée |
| Consommation, CO₂ | **Absents** (chantier D, **non lancé** sur décision du propriétaire) | Section masquée |
| Dimensions (hauteur, largeur, empattement), portes, places, coffre, poids tractable, équipement | **Absents** des données | Idem : section masquée, pas de données inventées |
| « Comparaison rapide » (Série 3, Classe C, A4) | **Aucune donnée** de ce type | Hors périmètre tant qu'une source n'existe pas |
| « Le savais-tu ? » | `INFO.fact` existe pour **499** voitures (déjà affiché « Le saviez-vous ») — **pas** pour la Giulia | Affiché quand il existe |
| Écran d'identification : « Moteur sélectionné : 2.0 Turbo 200 » | L'IA identifie un **modèle**, jamais une motorisation | La motorisation est choisie par le joueur, pas déduite de la photo |
| Photos constructeur | Photo **du joueur** (`photos[cover]`) | La maquette illustre la mise en page ; l'app montre la capture réelle |

Ce qui **existe** et que la maquette reprend fidèlement : confiance de
l'identification (`GMMatcher.rapprocher()` → `statut`, `finalConfidence`),
sélecteur type → variante (`MOTOR_SPECS`), puissance / couple / cylindrée /
masse / architecture / boîte / transmission (`SPECS`, variantes), générations
et déclinaisons (`GENS`, `VARIANTS`), galerie et couverture (`photos`, `cover`),
date et lieu de la prise.

La correspondance détaillée écran ↔ code est dans
[`design/CARTE-ECRANS.md`](design/CARTE-ECRANS.md).

---

## 1. Le brief (texte du propriétaire, 30/09/2026)

### Objectif
Faire évoluer l'interface de Garage Manifest sans changer sa direction
artistique. La référence visuelle principale et non négociable est la fiche
Giulia. **Ne pas créer une nouvelle direction graphique. Ne pas réinventer la
fiche voiture.** La fiche Giulia sert de *design system* de référence pour toute
l'application.

### 1. Identité visuelle
Application automobile premium, moderne, immersive : sombre, sobre,
automobile, éditoriale, mobile-first — **pas « jeu vidéo néon »**. Donner envie
de collectionner sans esthétique Pokémon / arcade / casino.

- Palette : ~90 % noir / gris / blanc ; rouge Garage Manifest pour les actions
  principales ; accents de marque secondaires ; accents de rareté très subtils.
- À éviter : gros contours néon, cartes entièrement colorées selon la rareté,
  effets flashy, dégradés agressifs, interface trop « gaming », multiplication
  des couleurs, gros éléments décoratifs qui prennent la place du contenu.
- Hiérarchie par ordre : **photographie → typographie → contraste →
  surfaces/cartes → petits accents de couleur.**

### 2. La fiche Giulia = master design
Elle définit proportions, espacements, typographie, hiérarchie, cartes
techniques, boutons, onglets, badges, sélecteurs, galerie, historique,
sections éditoriales, navigation mobile. Organisation :

```
[ grande photo de la voiture capturée ]
[ marque / modèle ]
[ rareté ]
[ onglets : Fiche technique · Photos · Historique ]
→ motorisation → caractéristiques → dérivés / ratios → générations → variantes → éditorial
```

La photo principale est **la photo de l'utilisateur** (`photos[cover]`, jamais
`photos[0]` par hypothèse), pas une photo constructeur.

### 3. Photo = élément central
« J'ai réellement trouvé cette voiture. » Grande photo, priorité visuelle,
traitement sobre, pas de surcharge par-dessus, voiture lisible. La galerie
permet de retrouver les autres captures.

### 4. Rareté
Six niveaux : courant, commun, peucommun, rare, epique, legendaire. Visible
mais élégante : base noire / grise / blanche, petit accent, halo subtil, badge
discret, éventuellement micro-animation à la révélation. **Pas de bordure
fluorescente géante.** Afficher la rareté **de jeu** (`RARITY` /
`catalogue.rarete`), jamais la rareté de fiche (`rareteFiche`) — voir
`CLAUDE.md` §8 quater.

### 5. Marque
Accent secondaire seulement (Alfa Romeo rouge, Porsche or, BMW bleu…).
**Garage Manifest = couleur principale ; marque = accent secondaire ; rareté =
accent subtil.** La marque ne recolore jamais l'interface.

### 6. Motorisations
Sélecteur à deux niveaux (type → variante) quand nécessaire ; lisible,
compact, tactile, premium. Le changement de motorisation met à jour les
données techniques (contrat `data-moto-actif`, `CLAUDE.md` §3). Pas de
composant énorme.

### 7. Garage (accueil)
Motivant immédiatement : ce que je possède, ce que je viens de capturer, ce
qui me manque, ma progression. Visuel, présenté comme une collection.
Priorité **photo → nom → rareté → progression**. Pas de statistiques inutiles.

### 8. Progression / collection (axe prioritaire)
« Voici ce que j'ai déjà, voici ce qu'il me manque. » Visible mais élégante :
voitures capturées, progression du catalogue, marques, générations,
variantes, raretés, collections complétées. **Pas de dizaines de jauges.**

### 9. Générations / variantes
Mécanique de collection (ex. M3 : E30 → E36 → E46 → E92 → F80 → G80). Cartes
compactes, silhouettes / photos quand disponibles, découvert / non découvert,
progression claire. **Ne pas inventer de contenu ou d'images absents des
données.**

### 10. Capture → révélation (P0)
Voir → capturer → analyser → révéler → confirmer → rejoindre le Garage → voir
ce que ça débloque → repartir chasser. Moment satisfaisant : animation
légère, apparition progressive du nom, rareté, photo, retour haptique si
disponible, transition vers la fiche. **Premium : pas de confettis ni
d'effets arcade.**

### 11. Le Rouleau
Évoque une pellicule : des captures en attente de révélation. La mécanique
existe (`gm-rouleau.js`) : le travail est UX / UI / intégration, **pas une
réécriture technique** (`CLAUDE.md` §8 bis).

### 12. Carnet de chasse
« Voilà les voitures que j'ai réellement croisées » : photos, date, lieu,
voiture identifiée, historique, favoris. Plus proche d'un carnet personnel que
d'un historique technique ; la photo reste centrale.

### 13. Collections thématiques
Allemandes, italiennes, japonaises, françaises, youngtimers, supercars,
sportives, anciennes, générations… **Léger au départ** : pas de défis, clans,
économie ni réseau social complexes. Prolonge CAPTURER → COLLECTIONNER →
COMPLÉTER.

### 14. Navigation mobile
Mobile-first, référence 390×844 / 393×852. Navigation simple ; **la capture est
extrêmement accessible**, bouton caméra central. Garage, Capture, Collection /
progression, Carnet, Plus / réglages. Pas de menus gigantesques.

### 15. Thèmes
Sombre (référence), Clair, Système. Le clair est **le même design system**
avec une autre palette de surfaces / contraste — mêmes hiérarchie, composants,
espacements, boutons, cartes, navigation.

### 16. Cartes / composants
Sobres : surfaces légèrement différenciées, bordures très discrètes, ombres
limitées, coins cohérents, contraste typographique. Ne pas mettre chaque
information dans sa propre carte ; la fiche Giulia décide quand utiliser une
carte, une ligne, un badge, une section, un onglet.

### 17. Typographie
Lisible, moderne, compacte, automobile / premium. Hiérarchie forte : marque,
modèle, motorisation, chiffres techniques, libellés secondaires. Gros chiffres
pour les données importantes, sans transformer l'interface en tableau de bord.

### 18. Micro-animations
Au service de : capture, révélation, changement de motorisation, ajout au
Garage, progression, découverte d'une génération, changement d'onglet.
Rapides, fluides, discrètes. **Pas d'animations permanentes.**

### 19. Ce qu'il ne faut pas faire
Inventer une nouvelle fiche ; changer brutalement la direction ; jeu mobile
flashy ; néon ; bordures géantes de rareté ; recolorer l'app selon la marque ;
photos constructeur systématiques ; surcharge de statistiques ; clans /
économie / réseau social ; dizaines de systèmes de progression ; **inventer des
données automobiles** ; modifier le catalogue pour résoudre un problème d'UI ;
réécrire massivement `index.html` ; refaire les modules techniques pour des
raisons visuelles.

### 20. Priorités
**P0** Capture → révélation · **P1** Garage / collection / progression ·
**P2** Générations / variantes · **P3** Collections thématiques ·
**P4** Carnet de chasse.
Boucle : VOIR → CAPTURER → IDENTIFIER → CONFIRMER → COLLECTIONNER → COMPLÉTER →
REPARTIR CHASSER.

### 21. Règle absolue
Avant tout nouvel écran ou composant : **« Est-ce que ce nouvel écran semble
appartenir à la même application que la fiche Giulia ? »** Si non, revoir le
design. Garage Manifest est **une seule** application cohérente, pas une
collection de mini-designs.

---

## 2. Répartition du travail (décidée le 30/09)

- **Direction et maquettes** : le propriétaire (avec ChatGPT si besoin).
- **Correspondance écran ↔ code, puis implémentation** : l'agent qui travaille
  sur le dépôt, parce qu'une partie de l'interface n'est pas dans `index.html`
  mais **greffée par `gm-specs.js`** (fiche technique et générations,
  sélecteur, cadrage, floutage de plaque, corbeille de photo, classement,
  bandeau partenaire, collections, mystère du jour, version). Une lecture
  d'`index.html` seul donne une carte fausse de l'app.
- Implémentation en **patchs ciblés** (`CLAUDE.md` §1.3), écran par écran,
  captures avant / après montrées au propriétaire **avant** toute livraison.
