Tu m'as rédigé le brief de design de Garage Manifest (fiche Giulia = design system de référence, priorité P0 « Capture → Révélation »). L'agent qui travaille sur le code a relevé l'état RÉEL de ce parcours dans l'app. Je te le transmets avec des captures de l'app actuelle.

**Ce que j'attends de toi : la SPÉCIFICATION de design du parcours P0**, état par état, dans le format imposé en bas. Pas de code : l'agent l'écrira. Pas de nouvelle direction visuelle : tout reste dans le langage de la fiche Giulia et dans les couleurs de l'app listées plus bas.

## 1. Le parcours tel qu'il existe aujourd'hui (captures jointes)

1. Bouton central « ＋ » → feuille « Enregistrer une prise » : Appareil photo · Importer une photo · Importer un lot.
2. Photo prise ou importée → **le formulaire s'affiche aussitôt**, la reconnaissance tourne en arrière-plan (jusqu'à 15 s), **sans aucun état visible**.
3. Si l'IA trouve : popup « Modèle trouvé », nom, « Confiance de reconnaissance : 96 % », boutons « Oui, c'est elle » / « Ce n'est pas mon véhicule » (capture `2-apres-photo`).
4. Formulaire : photo, recherche du modèle, liste (tag « IA » sur les propositions), « Voiture introuvable → Non classé », déclinaisons, lieu, date, GPS, note, bouton « Ajouter au garage » (captures `3-…`, `9-…`).
5. Révélation : carte centrée « Nouvelle capture — Peu commun », photo, nom, « +4 pts », halo de la couleur de rareté, « toucher pour continuer » → ouvre la fiche (capture `4-…`). Pour épique / légendaire : **confettis** (capture `8-…`), contraires à ton brief.

## 2. Les défauts à résoudre par le design

- **D1 — Pas d'état « analyse en cours »** pendant la reconnaissance (jusqu'à 15 s).
- **D2 — Résultat AMBIGU caché** : quand l'IA hésite (ex. BMW M3 à 74 % et M4 à 73 %), l'app n'affiche qu'un seul nom comme s'il était sûr.
- **D3 — Aucune correspondance sûre = silence** : voiture hors catalogue, ou identification trop faible → rien ne s'affiche ; le joueur ne sait pas que l'IA n'a rien trouvé.
- **D4 — Erreurs peu lisibles** : hors ligne, délai dépassé, quota du jour atteint (le relais renvoie « choisis la voiture à la main, ou reviens demain »), aucun relais configuré → simple message bref en bas d'écran.
- **D5 — Confettis** à la révélation épique / légendaire.
- **D6 — « Ce que ça débloque » absent** : après l'ajout, rien ne montre la progression gagnée.

## 3. Les états à spécifier (tous, aucun oublié)

- **E1** Choix de la source (caméra / import / lot).
- **E2** Visée caméra (et caméra refusée).
- **E3** Analyse en cours — nouveau (D1).
- **E4a** Résultat **CONFIRMÉ** (un candidat sûr).
- **E4b** Résultat **AMBIGU** (2 ou 3 candidats proches) — nouveau (D2).
- **E4c** **Aucune correspondance sûre** — deux cas : avec des pistes faibles, et sans aucune piste (D3).
- **E4d** Erreurs : hors ligne · délai · quota du jour · pas de relais (D4).
- **E5** Formulaire de confirmation (peut être allégé, mais tous les champs actuels restent accessibles : modèle, déclinaison, lieu, date, GPS, note, « Non classé »).
- **E6** Révélation, en **trois paliers** : courant / commun · peu commun / rare · épique / légendaire — **sans confettis** (D5).
- **E7** « Ce que ça débloque » (D6), avec uniquement les données de la section 4.
- **E8** Voiture **déjà au garage** capturée à nouveau (aujourd'hui : pas de révélation, message « Fiche mise à jour ») et **plafond de photos atteint** (message « Limite de N photos pour une voiture [rareté] »).
- **E9** Lot de photos (« encore N photos après celle-ci »).

## 4. Données RÉELLEMENT disponibles (n'utilise rien d'autre)

- **Reconnaissance** : statut (CONFIRMÉ / AMBIGU / AUCUNE CORRESPONDANCE SÛRE), jusqu'à 3 candidats avec marque, modèle et confiance finale (0–100 %), écart entre les deux premiers. L'IA ne reconnaît **qu'un modèle**, jamais une motorisation, une année ou une couleur.
- **Voiture** : marque, modèle, drapeau du pays, catégorie (Berline, Supercar…), millésimes, rareté de jeu (6 paliers) et sa couleur, points (+N pts).
- **Photo** : la photo du joueur (jamais de photo constructeur).
- **Progression** : voitures au garage / total (1 071), % du catalogue, points, nombre au garage / total **par rareté**, **par marque**, **par pays**, **par catégorie** ; « première voiture de cette marque » (déductible) ; déclinaisons cochées / total quand la voiture en a ; progression des collections thématiques (onglet Défis).
- **Absent** — ne pas l'afficher : 0–100 et V-max pour la plupart des voitures, consommation, CO₂, dimensions, équipement, prix, cote, comparaisons.

## 5. Contraintes techniques (non négociables)

- Couleurs : uniquement celles de l'app. Sombre : fond `#0b0b0d`, panneaux `#161618` / `#111113`, filets `#27272a` / `#3f3f46`, texte `#f4f4f5` / `#a1a1aa` / `#71717a` / `#52525b`, rouge d'action `#ef4444`. Clair : fond `#f4f4f5`, panneaux `#ffffff` / `#fafafa`, filets `#dedee2` / `#c7c7ce`, texte `#18181b` / `#52525b` / `#71717a` / `#a1a1aa`. Raretés : courant `#6b7280`, commun `#a1a1aa`, peu commun `#2dd4bf`, rare `#818cf8`, épique `#e879f9`, légendaire `#fbbf24`.
- Polices : **police système uniquement** (sans empattement + monospace pour les libellés techniques). **Aucune police téléchargée**, aucune image ou bibliothèque externe.
- Animations en **CSS** (transitions / keyframes), durées courtes ; respecter « réduire les animations » du téléphone (une version sans mouvement pour chaque animation).
- Retour haptique : une vibration courte existe déjà (plus marquée pour épique / légendaire).
- Mobile 390 × 844, zone du pouce, cibles tactiles ≥ 44 px, lisible en clair **et** en sombre.
- On garde les feuilles modales qui montent du bas (même famille que la fiche).

## 6. Format de réponse imposé

Pour **chaque état E1 → E9**, exactement ce bloc :

```
### E? — Nom de l'état
Quand : (ce qui déclenche l'état)
Disposition (de haut en bas) : (liste des éléments, taille relative, alignement)
Textes exacts (français, tutoiement) : (chaque libellé, bouton, message)
Couleurs : (uniquement les codes de la section 5)
Animation : (quoi, durée en ms, courbe) + version « mouvement réduit »
Actions : (chaque bouton → ce qu'il fait)
Données utilisées : (uniquement la section 4)
Clair / sombre : (ce qui change)
```

Puis, pour finir :
1. Un tableau **« Écart avec l'existant »** : pour chaque état, ce qui change par rapport aux captures jointes.
2. La liste de ce que tu **n'as pas pu faire** faute de données (section 4) ou à cause des contraintes (section 5) — plutôt que de l'inventer.
3. **Une maquette** du parcours au format mobile, dans le style de la fiche Giulia, avec les **vraies données** de la Giulia : **peu commune**, Alfa Romeo, Berline, 2015–, +4 pts. Pour E4b, utilise BMW M3 74 % / BMW M4 73 %.
