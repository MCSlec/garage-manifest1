SPÉCIFICATION UX/UI — GARAGE MANIFEST
P0 « CAPTURE → RÉVÉLATION »

Référence visuelle non négociable : la fiche Giulia existante constitue le design system de référence. Aucune nouvelle direction visuelle. Les feuilles modales remontant du bas sont conservées. Le parcours doit rester dans le langage visuel de la fiche Giulia et dans les couleurs de l’application.

Objectif : spécifier intégralement le parcours de capture, de l’entrée « + » jusqu’à la révélation et à la progression débloquée.

============================================================
E1 — Choix de la source
============================================================

Quand :
L’utilisateur touche le bouton central « ＋ » depuis la navigation principale.

Disposition (de haut en bas) :
- Feuille modale remontant du bas, largeur quasi totale.
- Poignée de feuille en haut.
- Titre centré : « Enregistrer une prise ».
- Trois grandes actions verticales, hauteur tactile ≥ 44 px :
  1. Appareil photo
  2. Importer une photo
  3. Importer un lot
- Chaque action comporte une icône à gauche, le libellé au centre/gauche et une courte indication secondaire si nécessaire.
- Fond de la feuille = panneau.
- Aucun élément décoratif supplémentaire.

Textes exacts (français, tutoiement) :
- « Enregistrer une prise »
- « Appareil photo »
- « Importer une photo »
- « Importer un lot »
- Pour la caméra : « Prendre une photo »
- Pour une photo : « Choisir une photo »
- Pour un lot : « Choisir plusieurs photos »

Couleurs :
- Fond sombre : #0b0b0d
- Panneau : #161618
- Filets : #27272a
- Texte principal : #f4f4f5
- Texte secondaire : #a1a1aa
- Action sélectionnée / principale : #ef4444

Clair :
- Fond #f4f4f5
- Panneau #ffffff
- Filets #dedee2
- Texte principal #18181b
- Texte secondaire #52525b
- Action #ef4444

Animation :
- Feuille : montée 240 ms, ease-out.
- Les trois actions apparaissent avec un léger décalage de 30 ms entre elles.
- Mouvement réduit : aucune translation ; apparition instantanée.

Actions :
- « Appareil photo » → E2.
- « Importer une photo » → sélection d'une photo → E3.
- « Importer un lot » → sélection de plusieurs photos → première photo → E3, puis E9 pour la suite.
- Glissement vers le bas / fermeture → retour à l'écran précédent.

Données utilisées :
- Aucune donnée de voiture nécessaire.

Clair / sombre :
- Même structure.
- Seuls fond, panneaux, filets et textes passent aux valeurs clair/sombre.

============================================================
E2 — Visée caméra
============================================================

Quand :
L’utilisateur choisit « Appareil photo » en E1.

Disposition (de haut en bas) :
- Vue caméra plein écran.
- Barre supérieure minimale avec retour.
- Zone centrale de visée discrète, sans cadre agressif.
- Bouton déclencheur circulaire en bas, zone tactile ≥ 64 px.
- Aucun texte permanent inutile.
- Si l'autorisation caméra est refusée, remplacer la vue caméra par l'état d'erreur décrit ci-dessous.

Textes exacts (français, tutoiement) :
- « Prendre une photo »
- Autorisation refusée : « Accès à l’appareil photo refusé »
- « Autorise l’accès à l’appareil photo dans les réglages de ton téléphone. »
- Bouton : « Retour »
- Bouton : « Importer une photo »

Couleurs :
- Fond / zone caméra : #0b0b0d
- Texte : #f4f4f5
- Texte secondaire : #a1a1aa
- Bouton principal : #ef4444
- Filets : #27272a

Animation :
- Déclencheur : compression 100 ms, ease-out, puis retour 100 ms.
- Après prise : transition vers E3 180 ms, ease-out.
- Mouvement réduit : aucun mouvement, changement d'état instantané.

Actions :
- Déclencheur → capture de la photo → E3.
- Retour → E1.
- « Importer une photo » → sélection d'une photo → E3.
- Permission refusée → afficher l'état refusé sans boucle de demande automatique.

Données utilisées :
- Photo du joueur.
- GPS uniquement si l'utilisateur l'autorise ensuite dans E5.

Clair / sombre :
- La visée caméra reste sombre pour conserver la lisibilité de l'image caméra.
- L'état de permission suit le thème de l'application.

============================================================
E3 — Analyse en cours
============================================================

Quand :
Une photo vient d'être prise ou importée et la reconnaissance est lancée.

Disposition (de haut en bas) :
- Feuille / écran centré autour de la photo du joueur.
- Photo occupant environ 55–60 % de la hauteur disponible.
- Sous la photo :
  - indicateur d'analyse ;
  - titre ;
  - message d'attente.
- Aucun faux résultat de voiture pendant l'analyse.
- Aucun pourcentage inventé.
- Le formulaire de confirmation ne doit pas apparaître comme si l'analyse était terminée.

Textes exacts (français, tutoiement) :
- « Analyse en cours »
- « J’essaie d’identifier cette voiture… »
- « Jusqu’à 15 s »
- Option disponible pendant l'attente : « Choisir manuellement »

Couleurs :
- Fond #0b0b0d
- Panneau #161618
- Texte #f4f4f5
- Texte secondaire #a1a1aa
- Filet #27272a
- Action #ef4444

Animation :
- Indicateur de progression indéterminée : 900 ms, ease-in-out, répétition.
- La photo reste immobile.
- Aucun effet de scan lumineux.
- Mouvement réduit : supprimer l'animation et afficher simplement un indicateur statique + « Analyse en cours ».

Actions :
- « Choisir manuellement » → E5 avec aucun modèle présélectionné.
- Fin de reconnaissance → E4a, E4b, E4c ou E4d selon le résultat.
- Annulation → retour au parcours précédent sans créer de capture.

Données utilisées :
- Photo du joueur.
- Statut de reconnaissance.
- Aucun autre résultat tant que l'analyse n'est pas terminée.

Clair / sombre :
- Structure identique.
- Adaptation des fonds, textes et filets aux valeurs clair/sombre.

============================================================
E4a — Résultat confirmé
============================================================

Quand :
GMMatcher retourne CONFIRME avec un candidat sûr.

Disposition (de haut en bas) :
- Photo du joueur en haut, environ 35–40 % de l'écran.
- Petit bandeau de résultat sous la photo.
- Titre : « Modèle trouvé »
- Marque + modèle en évidence.
- Ligne de confiance : « Confiance de reconnaissance : 96 % » avec la valeur réelle.
- Deux actions :
  - principale : « Oui, c’est elle »
  - secondaire : « Ce n’est pas mon véhicule »
- En dessous, possibilité de poursuivre vers la recherche manuelle.

Textes exacts (français, tutoiement) :
- « Modèle trouvé »
- « Alfa Romeo Giulia » pour la maquette Giulia
- « Confiance de reconnaissance : 96 % » uniquement si la donnée réelle est 96 %
- « Oui, c’est elle »
- « Ce n’est pas mon véhicule »
- « Choisir manuellement »

Couleurs :
- Action principale #ef4444
- Texte principal #f4f4f5
- Texte secondaire #a1a1aa
- Filets #27272a
- Fond #0b0b0d
- Panneau #161618

Animation :
- Apparition du résultat : 220 ms, ease-out.
- Bouton principal : aucun effet de célébration.
- Mouvement réduit : apparition instantanée.

Actions :
- « Oui, c’est elle » → E5 avec le candidat sélectionné.
- « Ce n’est pas mon véhicule » → E5 sans modèle confirmé / recherche manuelle.
- « Choisir manuellement » → E5 avec recherche du modèle.

Données utilisées :
- Candidat brand, model, finalConfidence.
- Photo du joueur.

Clair / sombre :
- Même hiérarchie.
- Adaptation des couleurs uniquement.

============================================================
E4b — Résultat ambigu
============================================================

Quand :
GMMatcher retourne AMBIGU.

Disposition (de haut en bas) :
- Photo du joueur.
- Titre : « J’hésite entre plusieurs modèles »
- Sous-titre : « Vérifie celui qui correspond à ta voiture. »
- 2 candidats principaux sous forme de cartes empilées.
- Éventuellement un troisième candidat si fourni.
- Chaque carte contient uniquement :
  - marque ;
  - modèle ;
  - confiance finale.
- Ligne discrète indiquant l'écart entre les deux premiers.
- Bouton secondaire : « Aucun de ces modèles »

Textes exacts (français, tutoiement) :
Pour l'exemple demandé :
- « J’hésite entre plusieurs modèles »
- « Vérifie celui qui correspond à ta voiture. »
- « BMW M3 »
- « 74 % »
- « BMW M4 »
- « 73 % »
- « Écart : 1 point »
- « Aucun de ces modèles »

Couleurs :
- Fond #0b0b0d
- Panneau #161618
- Panneau secondaire #111113
- Filets #27272a
- Candidat sélectionné : filet #3f3f46 + action #ef4444
- Texte #f4f4f5
- Secondaire #a1a1aa

Aucune couleur de rareté ici : la rareté n'est pas encore nécessaire à ce stade.

Animation :
- Les candidats apparaissent l'un après l'autre, 120 ms chacun, ease-out.
- Aucun effet de jackpot.
- Mouvement réduit : tous les candidats apparaissent simultanément.

Actions :
- Toucher « BMW M3 » → E5 avec BMW M3 présélectionnée.
- Toucher « BMW M4 » → E5 avec BMW M4 présélectionnée.
- « Aucun de ces modèles » → E5 sans sélection.
- Les cartes restent accessibles comme grandes cibles tactiles.

Données utilisées :
- Jusqu'à 3 candidats.
- brand, model, finalConfidence.
- marge.
- Statut AMBIGU.

Clair / sombre :
- Même structure.
- Filets et surfaces adaptés au thème.

============================================================
E4c — Aucune correspondance sûre
============================================================

Quand :
GMMatcher retourne AUCUNE_CORRESPONDANCE_SURE.

CAS 1 — avec pistes faibles

Disposition (de haut en bas) :
- Photo du joueur.
- Titre : « Je ne suis pas sûr »
- Sous-titre : « Voici les pistes que j’ai trouvées. »
- Jusqu'à 3 candidats faibles.
- Chaque candidat affiche marque, modèle et confiance finale.
- Bouton : « Choisir manuellement »
- Option : « Aucun de ces modèles »

Textes exacts :
- « Je ne suis pas sûr »
- « Voici les pistes que j’ai trouvées. »
- « Choisir manuellement »
- « Aucun de ces modèles »

Les candidats affichent leurs valeurs réelles, sans inventer de seuil ou de formulation supplémentaire.

CAS 2 — sans aucune piste

Disposition :
- Photo du joueur.
- Titre : « Je n’ai pas trouvé de correspondance sûre »
- Sous-titre : « Tu peux choisir la voiture manuellement. »
- Bouton principal : « Choisir manuellement »
- Option : « Voiture introuvable → Non classé »

Textes exacts :
- « Je n’ai pas trouvé de correspondance sûre »
- « Tu peux choisir la voiture manuellement. »
- « Choisir manuellement »
- « Voiture introuvable → Non classé »

Couleurs :
- Fond #0b0b0d
- Panneau #161618
- Filets #27272a
- Texte #f4f4f5
- Secondaire #a1a1aa
- Action #ef4444

Pas de rouge d'alerte supplémentaire : le rouge de l'app reste une couleur d'action, pas une couleur d'erreur agressive.

Animation :
- Apparition 200 ms, ease-out.
- Mouvement réduit : instantané.

Actions :
- Candidat → E5 avec le candidat choisi.
- « Choisir manuellement » → E5.
- « Voiture introuvable → Non classé » → E5 en mode non classé.

Données utilisées :
- Statut AUCUNE_CORRESPONDANCE_SURE.
- Candidats éventuels.
- finalConfidence.
- Photo.

Clair / sombre :
- Identique structurellement.

============================================================
E4d — Erreurs
============================================================

Quand :
La reconnaissance ne peut pas produire de résultat à cause de :
- hors ligne ;
- délai dépassé ;
- quota du jour atteint ;
- aucun relais configuré.

Disposition (de haut en bas) :
- Photo du joueur.
- Icône d'état simple.
- Titre spécifique à la situation.
- Explication courte.
- Action principale vers la sélection manuelle.
- Aucun écran bloquant.

HORS LIGNE

Textes exacts :
- « Tu es hors ligne »
- « Choisis la voiture manuellement. »
- « Choisir manuellement »

DÉLAI DÉPASSÉ

- « L’analyse a pris trop de temps »
- « Choisis la voiture manuellement. »
- « Choisir manuellement »

QUOTA ATTEINT

- « La reconnaissance n’est plus disponible aujourd’hui »
- « Choisis la voiture à la main, ou reviens demain. »
- « Choisir manuellement »

AUCUN RELAIS CONFIGURÉ

- « Reconnaissance indisponible »
- « Choisis la voiture manuellement. »
- « Choisir manuellement »

Couleurs :
- Fond #0b0b0d
- Panneau #161618
- Texte #f4f4f5
- Secondaire #a1a1aa
- Filets #27272a
- Action #ef4444

Animation :
- Apparition 180 ms, ease-out.
- Aucun clignotement.
- Mouvement réduit : instantané.

Actions :
- « Choisir manuellement » → E5.
- L'utilisateur ne doit jamais perdre sa photo à cause de l'erreur.

Données utilisées :
- Photo.
- État d'erreur réellement retourné par le système.
- Aucun candidat inventé.

Clair / sombre :
- Même structure.

============================================================
E5 — Formulaire de confirmation
============================================================

Quand :
L'utilisateur a confirmé un candidat, choisi une piste, choisi manuellement une voiture ou sélectionné « Non classé ».

Disposition (de haut en bas) :
- Photo du joueur, hauteur modérée.
- Bloc « Modèle » :
  - recherche ;
  - modèle sélectionné ;
  - tag « IA » uniquement lorsqu'il vient effectivement de la reconnaissance.
- « Déclinaisons » si la voiture en possède.
- « Lieu ».
- « Date ».
- « GPS » / « Ajouter ma position ».
- « Note ».
- Action principale fixe ou sticky en bas : « Ajouter au garage »
- « Voiture introuvable → Non classé » reste accessible.

Textes exacts :
- « Modèle »
- « Rechercher une voiture »
- « IA » uniquement sur une proposition issue de l'IA
- « Déclinaisons »
- « Lieu »
- « Date »
- « Ajouter ma position »
- « Note »
- « Ajouter au garage »
- « Voiture introuvable → Non classé »

Couleurs :
- Fond #0b0b0d
- Panneaux #161618
- Panneau secondaire #111113
- Filets #27272a
- Filet actif #3f3f46
- Texte #f4f4f5
- Secondaire #a1a1aa
- Placeholder #71717a
- Action #ef4444

Animation :
- Entrée du formulaire : 200 ms, ease-out.
- Validation du modèle : 150 ms, ease-out.
- Mouvement réduit : aucune transition de déplacement.

Actions :
- Recherche → filtrer le catalogue.
- Sélection modèle → mettre à jour la voiture.
- Déclinaison → sélectionner les variantes accessibles.
- « Ajouter ma position » → demander le GPS si nécessaire.
- Note → éditer la note.
- « Ajouter au garage » → enregistrer la prise.
- Si nouvelle voiture → E6.
- Si déjà au garage → E8.

Données utilisées :
- Photo.
- Catalogue : marque, modèle, drapeau, catégorie, millésimes, rareté.
- Déclinaisons disponibles.
- Lieu, date, GPS, note.
- Statut/candidat de reconnaissance.
- Aucun chiffre technique non nécessaire.

Clair / sombre :
- Même interface, mêmes proportions.
- Surfaces et textes adaptés au thème.

============================================================
E6 — Révélation
============================================================

Quand :
Une nouvelle voiture est effectivement ajoutée au garage.

Disposition (de haut en bas) :
- Écran plein écran sombre.
- Carte centrale compacte inspirée de la fiche Giulia.
- Photo du joueur en élément principal.
- Badge de rareté.
- « Nouvelle capture »
- Marque + modèle.
- Catégorie / millésimes lorsque utiles.
- « +4 pts » pour la Giulia.
- En bas : « Toucher pour continuer »

La rareté agit comme halo lumineux discret, jamais comme bordure fluorescente.

PALIER 1 — courant / commun

Textes :
- « Nouvelle capture »
- « Courant » ou « Commun »
- « Alfa Romeo Giulia »
- « +4 pts »
- « Toucher pour continuer »

Couleurs :
- Courant #6b7280
- Commun #a1a1aa
- Fonds #0b0b0d / #161618
- Texte #f4f4f5
- Secondaire #a1a1aa

PALIER 2 — peu commun / rare

Pour la Giulia :
- « Nouvelle capture »
- « Peu commun »
- « Alfa Romeo Giulia »
- « Berline »
- « 2015– »
- « +4 pts »
- « Toucher pour continuer »

Couleurs :
- Peu commun #2dd4bf
- Rare #818cf8
- Même structure et mêmes surfaces.

PALIER 3 — épique / légendaire

Même structure.

Couleurs :
- Épique #e879f9
- Légendaire #fbbf24

Aucun confetti.

Animation :
- Fond : apparition 220 ms, ease-out.
- Carte : montée très courte 300 ms, cubic-bezier(.2,.8,.2,1).
- Halo : montée d'opacité 400 ms, ease-out.
- Pour épique/légendaire : intensité du halo légèrement supérieure, mais aucun confetti.
- Vibration courte déjà existante, plus marquée pour épique/légendaire.
- Mouvement réduit :
  - aucune montée ;
  - apparition instantanée ;
  - halo fixe ;
  - haptique conservé uniquement si le système le permet.

Actions :
- Toucher la carte / « Toucher pour continuer » → E7.
- Pas de bouton « Fermer » qui permettrait de sauter accidentellement la progression.

Données utilisées :
- Photo du joueur.
- Marque.
- Modèle.
- Drapeau.
- Catégorie.
- Millésimes.
- Rareté de jeu.
- Couleur de rareté.
- Points.

Clair / sombre :
- La révélation conserve un fond sombre pour maximiser le contraste et le caractère cinématique.
- La carte et les textes suivent les couleurs du thème.
- La couleur de rareté reste identique dans les deux thèmes.

============================================================
E7 — Ce que ça débloque
============================================================

Quand :
L'utilisateur touche la révélation E6.

Disposition (de haut en bas) :
- Titre : « Ce que ça débloque »
- Bloc progression générale.
- Bloc rareté.
- Bloc marque.
- Bloc déclinaisons si la voiture en possède.
- Bloc collections thématiques uniquement si la progression correspondante est réellement disponible.
- Bouton : « Voir la fiche »
- Pas de données techniques non prévues.

Pour la Giulia :
- « +1 voiture au garage » peut être affiché uniquement comme événement de progression, sans inventer le compteur total.
- « Première voiture de cette marque » uniquement si le calcul réel confirme que c'est la première.
- Progression du catalogue : 1 071 comme total du catalogue ; le nombre actuel possédé et le pourcentage restent masqués s'ils ne sont pas disponibles dans l'état courant.
- Progression de rareté : uniquement si les compteurs actuels sont disponibles.
- Déclinaisons : uniquement avec le total réellement disponible pour la Giulia.

Textes exacts :
- « Ce que ça débloque »
- « +1 voiture au garage »
- « Première voiture de cette marque » — conditionnel
- « Déclinaisons » — conditionnel
- « Voir la fiche »

Couleurs :
- Fond #0b0b0d
- Panneaux #161618
- Filets #27272a
- Texte #f4f4f5
- Secondaire #a1a1aa
- Rouge d'action #ef4444
- Rareté Giulia : #2dd4bf

Animation :
- Apparition des blocs : 160 ms, ease-out, sans cascade longue.
- Mouvement réduit : apparition instantanée.

Actions :
- « Voir la fiche » → fiche Giulia.
- Retour → écran précédent du parcours.

Données utilisées :
- Total catalogue : 1 071.
- Voitures au garage / total, seulement si le compteur courant est disponible.
- % catalogue, seulement si disponible.
- Points.
- Compteurs par rareté, marque, pays, catégorie, seulement si disponibles.
- Première voiture de la marque, si déductible.
- Déclinaisons cochées / total, si disponibles.
- Progression des collections thématiques, si disponible.
- Rareté, marque, modèle, catégorie, millésimes, points.

Clair / sombre :
- Structure identique.
- Couleur de rareté conservée.

============================================================
E8 — Voiture déjà au garage / plafond atteint
============================================================

Quand :
L'utilisateur ajoute une voiture déjà présente dans son garage, ou atteint le plafond de photos pour cette voiture.

CAS A — voiture déjà au garage

Disposition :
- Photo du joueur.
- Petit panneau de confirmation.
- Pas de grande révélation.
- Message central : « Fiche mise à jour »
- Résumé discret de la voiture.
- Bouton : « Voir la fiche »

Textes exacts :
- « Fiche mise à jour »
- « Voir la fiche »

Couleurs :
- Fond #0b0b0d
- Panneau #161618
- Filets #27272a
- Texte #f4f4f5
- Secondaire #a1a1aa
- Action #ef4444

CAS B — plafond de photos atteint

Textes exacts :
- « Limite de N photos pour une voiture [rareté] »

N est la limite réelle configurée et [rareté] la rareté réelle de la voiture. Aucun chiffre fixe ne doit être inventé dans la maquette.

L'utilisateur doit conserver une sortie claire vers la fiche, sans fausse révélation.

Animation :
- Message : 180 ms, ease-out.
- Pas de halo de rareté.
- Mouvement réduit : instantané.

Actions :
- « Voir la fiche » → fiche de la voiture.
- Retour → parcours de capture.

Données utilisées :
- Existence de la voiture dans le garage.
- Nombre réel de photos.
- Limite réelle.
- Rareté.
- Photo.
- Marque/modèle.

Clair / sombre :
- Même structure.

============================================================
E9 — Lot de photos
============================================================

Quand :
L'utilisateur a choisi « Importer un lot » et plusieurs photos sont disponibles.

Disposition (de haut en bas) :
- Photo actuellement traitée, grande.
- Indicateur de position dans le lot.
- Après confirmation / ajout :
  - retour automatique vers l'analyse de la photo suivante ;
  - indication discrète du nombre restant.
- Pas de deuxième révélation complète superposée à la suivante.
- Chaque photo suit individuellement E3 → E4 → E5 → E6/E8.

Textes exacts :
- « Encore N photos après celle-ci »
- Pour la dernière : aucun message « encore 0 » ; passer directement à la fin du lot.
- Pendant chaque photo : reprendre les textes des états E3/E4/E5/E6/E8 correspondants.

Couleurs :
- Fond #0b0b0d
- Panneau #161618
- Filets #27272a
- Texte #f4f4f5
- Secondaire #a1a1aa
- Action #ef4444
- Rareté de la photo actuellement révélée uniquement pendant E6.

Animation :
- Passage photo → photo : 180 ms, ease-out.
- Pas de succession automatique trop rapide : l'utilisateur doit pouvoir comprendre la capture courante.
- Mouvement réduit : changement instantané.
- La révélation E6 reste complète pour chaque nouvelle voiture.

Actions :
- Après traitement d'une photo → suivante.
- Abandon du lot → conserver les photos déjà enregistrées.
- Dernière photo → fin du parcours vers Garage / fiche selon le comportement existant.

Données utilisées :
- Photos du lot.
- Nombre de photos restantes.
- Résultat de reconnaissance de chaque photo.
- Données de chaque voiture.
- Données de progression réellement disponibles.

Clair / sombre :
- Même structure.

============================================================
ÉCART AVEC L'EXISTANT
============================================================

| État | Existant dans les captures / parcours actuel | Changement demandé |
|---|---|---|
| E1 | Feuille « Enregistrer une prise » avec caméra / photo / lot | Conserver la feuille ; clarifier la hiérarchie et les libellés sans changer la direction visuelle |
| E2 | Caméra existante | Conserver ; ajouter un état clairement traité pour permission refusée |
| E3 | Reconnaissance en arrière-plan sans indication visible | Nouveau véritable état « Analyse en cours » avec photo + statut explicite |
| E4a | Popup « Modèle trouvé », confiance, Oui / Non | Conserver la logique ; intégrer proprement le résultat dans le langage visuel de la fiche |
| E4b | Ambiguïté cachée, seul modèle affiché | Nouveau : 2–3 candidats + confiance + écart |
| E4c | Aucun résultat visible / silence | Nouveau : distinguer pistes faibles et aucune piste |
| E4d | Messages courts en bas d'écran | Nouveau vrai état d'erreur selon hors ligne / délai / quota / relais absent |
| E5 | Formulaire actuel assez chargé | Conserver tous les champs, mais améliorer hiérarchie et continuité avec E4 |
| E6 | Carte « Nouvelle capture », rareté, photo, points, halo | Conserver le principe ; supprimer les confettis ; organiser en trois paliers |
| E7 | Absent | Nouveau : écran « Ce que ça débloque » |
| E8 | « Fiche mise à jour » pour doublon ; limite de photos | Conserver, mais en faire un état explicite et cohérent avec le reste du parcours |
| E9 | Import lot existant mais progression peu mise en avant | Ajouter « Encore N photos après celle-ci » et traiter chaque photo comme une mini-boucle complète |

============================================================
CE QUI N'A PAS ÉTÉ FAIT FAUTE DE DONNÉES OU DE CONTRAINTES
============================================================

Données absentes — ne pas inventer :
- nombre actuel de voitures du garage ;
- pourcentage actuel du catalogue ;
- compteurs par rareté ;
- compteurs par marque ;
- compteurs par pays ;
- compteurs par catégorie ;
- nombre de déclinaisons actuellement cochées pour la Giulia ;
- progression exacte des collections thématiques ;
- valeur réelle de N pour le plafond photo ;
- valeur de points différente de +4 pts pour la Giulia ;
- confiance IA quelconque lorsque la donnée n'est pas fournie.

Ne pas afficher :
- 0–100 ;
- vitesse maximale ;
- consommation ;
- CO₂ ;
- dimensions ;
- équipement ;
- prix ;
- cote ;
- comparaison.

Contraintes respectées :
- aucune nouvelle couleur ;
- aucune nouvelle police ;
- aucune image constructeur ;
- aucune bibliothèque externe ;
- aucune nouvelle mécanique de jeu ;
- aucun confetti ;
- aucun effet néon ;
- aucune bordure de rareté fluorescente ;
- aucun score de confiance fabriqué ;
- aucune donnée technique supplémentaire.

============================================================
MAQUETTE MOBILE — PARCOURS
============================================================

Référence : 390 × 844, style de la fiche Giulia.

E1 — Choix de source

┌──────────────────────────────┐
│              ───             │
│                              │
│      Enregistrer une prise   │
│                              │
│  ┌────────────────────────┐  │
│  │  ◉  Appareil photo     │  │
│  └────────────────────────┘  │
│                              │
│  ┌────────────────────────┐  │
│  │  ▣  Importer une photo │  │
│  └────────────────────────┘  │
│                              │
│  ┌────────────────────────┐  │
│  │  ▤  Importer un lot    │  │
│  └────────────────────────┘  │
│                              │
└──────────────────────────────┘

E3 — Analyse Giulia

┌──────────────────────────────┐
│  ←                           │
│                              │
│  ┌────────────────────────┐  │
│  │                        │  │
│  │     PHOTO DU JOUEUR    │  │
│  │                        │  │
│  │                        │  │
│  └────────────────────────┘  │
│                              │
│        Analyse en cours      │
│                              │
│  J’essaie d’identifier       │
│  cette voiture…              │
│                              │
│          Jusqu’à 15 s        │
│                              │
│  ┌────────────────────────┐  │
│  │ Choisir manuellement   │  │
│  └────────────────────────┘  │
└──────────────────────────────┘

E4a — Giulia confirmée

┌──────────────────────────────┐
│                              │
│  ┌────────────────────────┐  │
│  │                        │  │
│  │     PHOTO DU JOUEUR    │  │
│  │                        │  │
│  └────────────────────────┘  │
│                              │
│         Modèle trouvé        │
│                              │
│       Alfa Romeo Giulia      │
│                              │
│ Confiance de reconnaissance  │
│             96 %             │
│                              │
│  ┌────────────────────────┐  │
│  │   Oui, c’est elle      │  │
│  └────────────────────────┘  │
│                              │
│  Ce n’est pas mon véhicule   │
│                              │
└──────────────────────────────┘

E4b — Ambiguïté M3 / M4

┌──────────────────────────────┐
│  ←                           │
│                              │
│  ┌────────────────────────┐  │
│  │     PHOTO DU JOUEUR    │  │
│  └────────────────────────┘  │
│                              │
│ J’hésite entre plusieurs     │
│ modèles                      │
│                              │
│ Vérifie celui qui correspond │
│ à ta voiture.                │
│                              │
│  ┌────────────────────────┐  │
│  │ BMW M3             74 %│  │
│  └────────────────────────┘  │
│                              │
│  ┌────────────────────────┐  │
│  │ BMW M4             73 %│  │
│  └────────────────────────┘  │
│                              │
│       Écart : 1 point        │
│                              │
│       Aucun de ces modèles   │
└──────────────────────────────┘

E5 — Confirmation Giulia

┌──────────────────────────────┐
│  ←       Confirmer           │
│                              │
│  ┌────────────────────────┐  │
│  │     PHOTO DU JOUEUR    │  │
│  └────────────────────────┘  │
│                              │
│ Modèle                       │
│ ┌──────────────────────────┐ │
│ │ Alfa Romeo Giulia    IA  │ │
│ └──────────────────────────┘ │
│                              │
│ Déclinaisons                 │
│ ┌──────────────────────────┐ │
│ │ Essence                  │ │
│ └──────────────────────────┘ │
│                              │
│ Lieu                         │
│ Date                         │
│ Ajouter ma position          │
│ Note                         │
│                              │
│ ┌──────────────────────────┐ │
│ │    Ajouter au garage    │ │
│ └──────────────────────────┘ │
└──────────────────────────────┘

E6 — Révélation Giulia

┌──────────────────────────────┐
│                              │
│          NOUVELLE            │
│          CAPTURE             │
│                              │
│  ┌────────────────────────┐  │
│  │                        │  │
│  │     PHOTO DU JOUEUR    │  │
│  │                        │  │
│  └────────────────────────┘  │
│                              │
│       PEU COMMUN             │
│                              │
│       Alfa Romeo             │
│          Giulia              │
│                              │
│          Berline             │
│          2015–               │
│                              │
│           +4 pts             │
│                              │
│      toucher pour continuer  │
└──────────────────────────────┘

Le halo de cette carte utilise #2dd4bf, sans nouvelle couleur et sans confettis.

E7 — Ce que ça débloque

┌──────────────────────────────┐
│  ←                           │
│                              │
│       Ce que ça débloque     │
│                              │
│  ┌────────────────────────┐  │
│  │  +1 voiture au garage  │  │
│  └────────────────────────┘  │
│                              │
│  ┌────────────────────────┐  │
│  │  Peu commun            │  │
│  │  Progression rareté    │  │
│  └────────────────────────┘  │
│                              │
│  ┌────────────────────────┐  │
│  │  Déclinaisons          │  │
│  │  si disponibles        │  │
│  └────────────────────────┘  │
│                              │
│  ┌────────────────────────┐  │
│  │      Voir la fiche     │  │
│  └────────────────────────┘  │
└──────────────────────────────┘

E8 — Doublon

┌──────────────────────────────┐
│                              │
│  ┌────────────────────────┐  │
│  │     PHOTO DU JOUEUR    │  │
│  └────────────────────────┘  │
│                              │
│       Fiche mise à jour      │
│                              │
│       Alfa Romeo Giulia      │
│                              │
│  ┌────────────────────────┐  │
│  │      Voir la fiche     │  │
│  └────────────────────────┘  │
└──────────────────────────────┘

E9 — Lot

┌──────────────────────────────┐
│  Import du lot          2/5  │
│                              │
│  ┌────────────────────────┐  │
│  │     PHOTO DU JOUEUR    │  │
│  └────────────────────────┘  │
│                              │
│     Encore 3 photos          │
│     après celle-ci           │
│                              │
│      → analyse               │
│      → confirmation          │
│      → révélation            │
│                              │
│      photo suivante          │
└──────────────────────────────┘

============================================================
PRINCIPE GLOBAL DU PARCOURS
============================================================

E3 → E4 → E5 → E6/E8 doit donner l'impression d'être un seul parcours continu, et non une succession d'écrans conçus séparément.

La révélation reste le moment fort, mais elle doit maintenant être précédée par une analyse lisible et suivie par une vraie récompense de progression.

Le design reste celui de Garage Manifest existant :
- premium ;
- sombre ;
- mobile-first ;
- très majoritairement noir / blanc / gris ;
- rouge Garage Manifest pour l'action ;
- couleur de rareté comme accent/halo discret ;
- aucune esthétique néon/gamey ;
- photo du joueur comme image principale ;
- fiche Giulia comme référence.
