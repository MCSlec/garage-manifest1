# Garage Manifest — PWA de collection automobile

Application web installable (PWA) pour collectionner les voitures croisées, façon Pokédex.
**927 voitures · 166 marques · 21 pays.** Double mécanique : rareté (commun → légendaire) **et** complétude par marque/pays.

Fonctionne **hors-ligne**, s'installe sur l'écran d'accueil, accède à **l'appareil photo en direct** et à la **galerie**, avec **stockage local** (IndexedDB) et **sauvegarde export/import**.

---

## 1. Contenu du dossier

```
index.html                 ← l'application entière (HTML + CSS + JS, autonome)
manifest.webmanifest       ← manifeste PWA (nom, icônes, couleurs, mode standalone)
sw.js                      ← service worker (cache app-shell → hors-ligne)
icon-192.png               ← icône 192×192
icon-512.png               ← icône 512×512
icon-maskable-512.png      ← icône adaptative Android (zone de sécurité)
apple-touch-icon-180.png   ← icône iOS
favicon-32.png             ← favicon
```

**Tout doit rester dans le même dossier** : les chemins sont relatifs, donc l'ensemble marche à la racine d'un site comme dans un sous-dossier.

---

## 2. L'installer sur ton téléphone

Une PWA doit être servie en **HTTPS** (obligatoire pour la caméra, le GPS et l'installation). Trois options, de la plus simple à la plus « propre » :

### Option A — Netlify Drop (30 secondes, gratuit, aucun compte technique)
1. Va sur **app.netlify.com/drop**.
2. Glisse-dépose le **dossier entier** (les 8 fichiers).
3. Netlify te donne une URL en `https://…netlify.app`.
4. Ouvre cette URL sur ton tél → voir « Installer ».

### Option B — GitHub Pages (durable, versionné)
1. Crée un dépôt, pousse les 8 fichiers à la racine.
2. Settings → Pages → Branch `main` / `/root` → Save.
3. URL en `https://<toi>.github.io/<repo>/`.

### Option C — Test en local (réseau Wi-Fi, sans hébergement)
Depuis le dossier, lance un serveur :
```bash
python3 -m http.server 8080
```
puis ouvre `http://<ip-de-ton-pc>:8080` sur le tél (même Wi-Fi).
⚠️ En HTTP simple, la **caméra en direct peut être bloquée** (l'import galerie fonctionne quand même). Pour la caméra, préfère A ou B (HTTPS).

### Installer une fois l'URL ouverte
- **Android / Chrome** : menu ⋮ → **« Ajouter à l'écran d'accueil »** / bannière « Installer ». L'app s'ouvre alors en plein écran, comme une appli native.
- **iOS / Safari** : bouton Partager → **« Sur l'écran d'accueil »**.

### Autorisations
- **Appareil photo** : demandée au 1ᵉʳ appui sur « Appareil photo » dans l'écran d'enregistrement.
- **Position (GPS)** : demandée au 1ᵉʳ appui sur « Ajouter ma position ». Facultative.
- Rien n'est envoyé nulle part : **tout reste sur ton téléphone**.

---

## 3. Utilisation

- **Bouton `+`** (barre du bas) : enregistrer une prise → *Appareil photo* (capture live) ou *Importer une photo* (galerie, pour les voitures déjà croisées) → choisir le modèle → date + lieu + GPS + note → **Ajouter au garage**.
- **Collection** : grille façon Pokédex (verrouillé = silhouette, collecté = ta photo), filtres par rareté / marque / type / statut, recherche.
- **Fiche voiture (swipe)** : page 1 = ta photo, tes infos de prise, ta note ; **glisse vers la gauche** → page 2 = **fiche technique** (moteur, puissance, 0-100, v-max quand les données sont fiables) + « Le saviez-vous ». Les points sous la fiche indiquent la page.
- **Catégorie Course** : F1, endurance (917, 787B, 499P…), GT3/Challenge (488 Challenge, 911 Cup…), Groupe B/WRC, IndyCar, midget, dragster — pour tes photos de circuit (Prenois inclus 😉).
- **Stats** : complétion, points, répartition par rareté, timeline, prises récentes, par catégorie.
- **Trophées** : 12 succès.
- **Rang & défis** : ton rang de collectionneur (Novice → Légende du bitume) progresse avec tes points. **2 défis du jour** (faciles, renouvelés à minuit) + **3 défis de la semaine** (corsés, nouveaux le lundi), tirés d'une bibliothèque de 55 gabarits × cibles aléatoires (~325 combinaisons quotidiennes, ~3650 hebdomadaires). Tirage par graine temporelle : hors-ligne total, et **tout ton équipage a les mêmes défis en même temps**.
- **Capture cinématique** : chaque nouvelle voiture déclenche une carte de révélation aux couleurs de sa rareté (confettis pour les épiques/légendaires, vibration).
- **Import par lot** : bouton + → « Importer un lot » → sélectionne 10, 20, 50 photos ; l'app les enchaîne une par une (le lieu/date restent pré-remplis). Idéal pour rattraper ta galerie.
- **Carte de chasse** (onglet Carte) : toutes tes prises géolocalisées sur une carte OpenStreetMap sombre, marqueurs aux couleurs de rareté, popup → fiche. ⚠️ Le fond de carte demande une connexion ; le reste de l'app reste hors-ligne.
- **Équipage (Stats)** : partage ton fichier profil (WhatsApp…), importe ceux de tes potes → classement, comparaison, fil d'activité (« X a capturé une Bolide ! ») et notification locale à chaque synchro. Sans serveur : la synchro se fait par échange de fichiers, pas en temps réel.
- **Carte à partager** : depuis une fiche (bouton ★), génère une image façon carte à collectionner avec ta photo, prête pour Insta/WhatsApp.
- **Réglages → Pilote & IA** : ton nom de pilote + l'URL d'un endpoint de reconnaissance (contrat : POST {image} → [{id, confidence}]). Vide = saisie manuelle.
- **Déclinaisons (arbo légère)** : 150 modèles portent leurs générations/phases directement sur la fiche (ex. 306 Phase 1/2/3, 911 de la 930 à la 992, Golf I→VIII, Type R EK9→FL5 — 473 déclinaisons au total). À la capture, des puces optionnelles permettent de cocher la déclinaison repérée ; la fiche affiche ta progression x/y. Hors score : le point est acquis à la première capture du modèle, les déclinaisons sont une sous-collection de complétionniste.
- **Popup de reconnaissance** : quand l'IA identifie la photo, un popup « Modèle trouvé » propose « Oui, c'est elle » (sélection directe) ou « Ce n'est pas mon véhicule » (retour à la recherche marque/modèle/année dans le catalogue). Aucune correspondance n'est jamais imposée sans confirmation.
- **« Non classé »** : une voiture absente du catalogue ? Depuis le sélecteur, « Voiture introuvable ? » ouvre un mini-formulaire (marque, modèle, année). Elle rejoint la catégorie Non classé (drapeau 🏳️), visible dans une rangée dédiée de la Collection, incluse dans les sauvegardes — mais hors score et hors complétion, pour garder le manifeste officiel comme seule référence de progression.
- **Réglages** : **export** (sauvegarde `.json` avec photos), **import** (restauration / transfert vers un autre appareil), stockage utilisé, état hors-ligne, réinitialisation.

> Sauvegarde régulièrement via **Réglages → Exporter** : les données vivent dans le navigateur du téléphone ; l'export est ton filet de sécurité et sert aussi à migrer d'un appareil à l'autre.

---

## 4. Architecture (pour comprendre et faire évoluer)

**Pile technique :** aucune dépendance, aucun build. JavaScript vanilla + CSS. Choix délibéré : une PWA sans chaîne de build est plus robuste, plus légère et réellement hors-ligne (rien à télécharger à l'exécution), et donc plus facile à héberger et à maintenir.

**Couches :**
- **Catalogue** (`CARS`) : source de vérité unique. Ajouter une voiture = une ligne ; rareté, marque, pays, catégorie, points, badges, complétudes se recalculent seuls.
- **Stockage** (`Store`) : abstraction **IndexedDB** (adaptée aux photos, contrairement au stockage clé-valeur basique limité à quelques Mo). En cas d'indisponibilité (ex. aperçu en bac à sable), **repli automatique en mémoire** → l'app tourne quand même, sans persistance. Un seul magasin `spots`, une entrée par voiture.
- **État dérivé** (`computeStats`) : toutes les statistiques sont **recalculées** depuis `spots`, jamais dupliquées → pas de désynchronisation possible.
- **Rendu** : vues reconstruites en chaînes HTML ; interactions gérées par **délégation d'événements** (un seul écouteur lit les attributs `data-*`) → pas de handlers périmés après re-rendu. Le texte saisi par l'utilisateur est échappé (`escapeHtml`) contre l'injection HTML.
- **Images** : chaque photo est **redimensionnée avant stockage** (canvas, orientation EXIF respectée) pour tenir des dizaines de clichés sans saturer le quota.
- **PWA** : `manifest.webmanifest` (installabilité) + `sw.js` (cache app-shell → hors-ligne). Comme toute l'app est dans `index.html`, mettre ce fichier en cache suffit à la rendre disponible hors-ligne.

**Le point de branchement IA :** toute la reconnaissance passe par **une seule fonction**, `identifyCar(photo)`, qui renvoie aujourd'hui `[]` (saisie manuelle). Pour brancher une vraie reconnaissance (Google Cloud Vision, ou un modèle YOLO/classifieur fine-tuné hébergé), il suffit qu'elle renvoie `[{ id, confidence }]` : le sélecteur de modèle pré-coche alors automatiquement les candidats (badge « IA »). **Aucun autre code ne change.** C'est de l'inversion de dépendance : l'interface ignore *comment* on reconnaît, elle ne connaît que le *contrat* de retour.

---

## 5. Mettre à jour le catalogue

Ouvre `index.html`, cherche `const CARS = [` et ajoute une entrée au même format :
```js
{ id: "marque-modele", brand: "Marque", model: "Modèle", yr: "2020–", c: "🇫🇷", cat: "Sportive", r: "rare" },
```
`r` ∈ `commun | peucommun | rare | epique | legendaire`. `id` doit être unique. Tout le reste s'ajuste automatiquement.

Après modification de fichiers en cache, incrémente `VERSION` dans `sw.js` pour forcer la mise à jour côté téléphone.

---

*Usage strictement personnel. Fonctionne avec tes propres photos. Aucune donnée n'est transmise à un serveur.*
