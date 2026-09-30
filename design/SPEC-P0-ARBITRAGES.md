# Spécification P0 — confrontation au code (30/09/2026)

> La spécification de ChatGPT est conservée **telle quelle** dans
> [`SPEC-P0-CHATGPT.md`](SPEC-P0-CHATGPT.md). Ce fichier liste ce que le code
> impose de corriger ou de préciser avant de l'implémenter. En cas de conflit,
> **ce fichier l'emporte** sur la spécification, et `DESIGN.md` l'emporte sur
> les deux.

## 1. Corrections (la spécification se trompe sur l'existant)

| # | La spécification dit | Le code dit | Ce qu'on implémente |
|---|---|---|---|
| C1 | Compteurs du garage, % du catalogue, compteurs par rareté / marque / pays / catégorie, déclinaisons cochées, valeur de N pour le plafond : « **données absentes, ne pas inventer** » | **Tout existe** : `computeStats()` calcule `count`, `pct`, `score`, `byRarity`, `brandList`, `countryList`, `catList` ; les déclinaisons sont dans `VARIANTS` + `rec.variants` ; le plafond dans `PHOTOS_PAR_RARETE` | E7 affiche les **vrais chiffres** : « 2 / 1 071 au garage », « Peu commun 1 / N », « Alfa Romeo 1 / N », « Première Alfa Romeo », déclinaisons « 0 / 3 » |
| C2 | E5, maquette : « Déclinaisons : **Essence** » | « Essence » est un **type de motorisation** (`MOTOR_SPECS`). Les **déclinaisons** de la Giulia sont **Ti · Veloce · Quadrifoglio** (`VARIANTS`) | Les pastilles de déclinaison listent `VARIANTS[id]` ; la motorisation reste sur la fiche, jamais dans la capture (l'IA ne la reconnaît pas) |
| C3 | E4d : 4 cas d'erreur | `identifyCar()` en distingue **5** : pas de relais · quota du jour (429) · **relais en panne** (HTTP 5xx) · délai (15 s) · hors ligne | Le 5ᵉ cas (panne) prend les textes de « Reconnaissance indisponible » |
| C4 | E9 : « la révélation E6 reste complète pour chaque nouvelle voiture » | Aujourd'hui, un lot **n'a aucune révélation** : un message « Giulia ajoutée ✓ · reste N », puis la photo suivante | **Décision du propriétaire** (§3, D-A) |
| C5 | E8 cas B : « l'utilisateur doit conserver une sortie claire vers la fiche » | Au plafond, la prise **est** enregistrée (lieu, date, note…), **sans** la nouvelle photo | Le message dit ce qui a été gardé : « Prise mise à jour, photo non ajoutée : limite de 8 photos pour une voiture peu commune » |

## 2. Précisions d'implémentation (la spécification ne les couvre pas)

| # | Sujet | Règle |
|---|---|---|
| P1 | « Choisir manuellement » **pendant** l'analyse (E3) | Le résultat de l'IA qui arrive ensuite est **ignoré** : il ne doit ni ouvrir une popup, ni écraser un choix déjà fait |
| P2 | Photo déjà verrouillée (« Ajouter une photo » depuis une fiche) | Pas d'analyse : on passe directement à E5 (comportement actuel conservé) |
| P3 | Accessibilité | E3 → E4 annoncés aux lecteurs d'écran (`aria-live="polite"`) ; focus sur l'action principale de chaque état |
| P4 | « Mouvement réduit » | Une seule règle CSS `@media (prefers-reduced-motion: reduce)` pour tout le parcours |
| P5 | Contrats à préserver (`CARTE-ECRANS.md` §7) | `.rv-card img` (recadrage), `#overlay`, `.sheet`, `#fileInput`, `[data-fab]`, `[data-car]` : conservés tels quels |
| P6 | Fonctions de données | `saveDraft()`, `identifyCar()`, `GMMatcher.rapprocher()` **inchangées** : le P0 change l'affichage, pas ce qui est enregistré |
| P7 | Textes | Tous centralisés dans le même objet, pour le futur chantier i18n (`I18N.md`) |

## 3. Décisions laissées au propriétaire

| # | Question | Recommandation de l'agent |
|---|---|---|
| D-A | **Lot de photos** : révélation complète + « Ce que ça débloque » **pour chaque** voiture (la spec), ou révélation **compacte** pendant le lot (~1,5 s, sans écran E7) et **un seul bilan** à la fin (« Lot terminé : 7 nouvelles voitures, 2 fiches mises à jour ») ? | **Compacte + bilan final** : un lot de 30 photos de Monaco avec 30 révélations et 30 écrans E7 à toucher devient une corvée |
| D-B | La spec fait parler l'app **à la première personne** (« J'hésite… », « Je ne suis pas sûr ») ; l'app actuelle ne dit jamais « je » | Garder le « je » : il rend l'hésitation de l'IA humaine et honnête. Mais c'est un ton de marque, donc ton choix |
| D-C | Révélation **toujours sur fond sombre**, même en thème clair (la spec) | D'accord : c'est un moment « cinéma », comme un écran de lancement |
