# Politique de confidentialité — comptes Garage Manifest

> **Projet de texte**, rédigé à partir du code réel (`cloud/compte-worker.js`,
> `gm-compte.js`, `ai-relay-worker.js`) : chaque affirmation ci-dessous
> correspond à un comportement vérifié par `banc-compte.js` /
> `banc-compte-navigateur.js` / `banc-relais.js`. Les passages
> `[À COMPLÉTER]` et `[À DÉCIDER]` doivent être tranchés **avant** l'ouverture
> au public. Ce document n'est pas un avis juridique : fais-le relire si l'app
> dépasse le cercle d'amis.
>
> **Règle de maintenance :** toute modification du serveur qui change ce qui est
> collecté, combien de temps, ou par qui, modifie ce fichier dans le même commit.
>
> **Sources des passages factuels** (vérifiés le 24/11/2026 par recherche ; la page
> des conditions de Google n'est pas joignable depuis l'environnement de travail,
> lue par extraits indexés) :
> - Fournisseur d'IA : `IA_FOURNISSEUR = gemini`, sans clé Anthropic (relais
>   constaté le 18/11, `PASSATION.md` §2). **Si le relais change de fournisseur,
>   la ligne du tableau des sous-traitants et le paragraphe « Sans compte » changent
>   dans le même commit.**
> - Gemini : « Gemini API Additional Terms of Service »
>   (https://ai.google.dev/gemini-api/terms) : *« If you're in the European Economic
>   Area, Switzerland, or the United Kingdom, the terms under "How Google uses Your
>   Data" in "Paid Services" apply to all Services, including Google AI Studio and
>   unpaid quota in the Gemini API »* ; conservation de 55 jours : page « Abuse
>   monitoring » (https://ai.google.dev/gemini-api/docs/usage-policies). ⚠️ Les
>   mêmes conditions disent *« You may use only Paid Services when making API
>   Clients available to users in the European Economic Area, Switzerland, or the
>   United Kingdom »* : voir `RESTE-A-FAIRE.md` §0.
> - Data Privacy Framework : déclarations de Cloudflare (politique de
>   confidentialité, page RGPD), de Google (policies.google.com/privacy/frameworks)
>   et de Resend (journal des nouveautés, 13/03/2025). Liste officielle non lue.
> - Time Travel D1 : documentation Cloudflare
>   (https://developers.cloudflare.com/d1/reference/time-travel/) : 7 jours (offre
>   gratuite), 30 jours (Workers Paid).
>
> **Ce fichier est la source de la page publique** `pages/confidentialite.html`,
> générée par `node banc-pages.js --html` (21/11). Ce préambule, jusqu'au premier
> `---`, n'y figure pas. Après toute modification : régénérer ; `node banc-pages.js`
> échoue si la page n'est plus à jour.

---

## Qui est responsable

Responsable du traitement : **[À COMPLÉTER — nom du responsable]**.
Contact : [garagemanifest.app@gmail.com](mailto:garagemanifest.app@gmail.com).

## Sans compte : ta collection reste sur ton téléphone

Le compte est **facultatif**. Sans lui, ta collection et tes photos sont
**stockées** uniquement dans la mémoire de ton appareil (IndexedDB) : aucune
sauvegarde n'est faite ailleurs.

**Une exception, active par défaut : la reconnaissance automatique.** Quand tu
photographies ou importes une voiture, la photo est envoyée, **pour cette seule
identification**, à notre relais de reconnaissance, hébergé chez Cloudflare,
qui la transmet au fournisseur du modèle d'IA et te renvoie la marque et le
modèle proposés.
- Le relais **ne conserve pas** la photo : il ne l'écrit ni en base ni dans un
  stockage, et ne la journalise pas.
- Pour plafonner les abus (et la facture), il compte les identifications du
  jour **par appareil** (adresse IP ; en IPv6, seulement le préfixe réseau /64,
  commun à tous les appareils d'une même connexion) ou **par compte** si tu es
  connecté. Ces compteurs ne gardent qu'une **empreinte** SHA-256, jamais l'IP ni
  l'identifiant en clair, et sont effacés sous 48 heures par la purge nocturne
  du relais lui-même (il ne dépend pas du serveur de comptes pour cela).
- Une photo ajoutée **depuis la fiche d'une voiture** (« Ajouter une photo »)
  n'est jamais envoyée : la voiture est déjà connue, il n'y a rien à
  identifier. **[À DÉCIDER — un réglage pour couper complètement la
  reconnaissance automatique n'existe pas encore.]**
- Le fournisseur du modèle d'IA est aujourd'hui **Google** (modèle Gemini). Ses
  conditions d'utilisation de l'API Gemini prévoient que, l'éditeur de l'app étant
  établi dans l'Union européenne, Google **ne se sert pas** des photos reçues pour
  améliorer ses produits ni pour entraîner ses modèles. Il **conserve la photo et
  la réponse 55 jours**, uniquement pour détecter les abus (le non-respect de sa
  politique d'utilisation).

## Ce qui est collecté quand tu crées un compte

| Donnée | Pourquoi | Durée de conservation |
|---|---|---|
| **Adresse e-mail** | T'identifier et t'envoyer le code de connexion | Tant que le compte existe |
| **Code de connexion** (scellé par HMAC, jamais le code lui-même) et nombre d'essais | Vérifier le code quand tu le tapes | 10 minutes de validité, 5 essais, usage unique ; effacé à la purge nocturne suivante |
| **Session** (empreinte SHA-256 seulement) | Rester connecté sans recevoir un code à chaque fois | 90 jours, ou jusqu'à la déconnexion |
| **Ta collection** : voitures, dates, lieux saisis, **positions GPS** si tu les as enregistrées, notes, déclinaisons, favoris, voitures personnalisées, pseudo, missions, liste d'amis et fil d'activité | Te la rendre sur un autre appareil | Tant que le compte existe |
| **Tes photos**, désignées dans ta collection par leur empreinte SHA-256 | Idem | Tant que le compte existe. **Mode essai** (serveur sans stockage photo) : aucune photo ne quitte ton téléphone ; seules leurs empreintes figurent dans la collection sauvée |
| **Volume stocké** (nombre de photos, octets) | Appliquer le quota de stockage du compte | Tant que le compte existe |
| **Voitures retirées** (identifiant de la voiture, date du retrait) | Faire disparaître la voiture de tes autres appareils | Tant que le compte existe |
| **Photos supprimées ou remises** (identifiant de la voiture, empreinte SHA-256 de la photo, date de la suppression ou de la remise — jamais la photo elle-même) | Faire disparaître la photo de tes autres appareils, sans la retirer d'une autre voiture, et ne pas la refaire disparaître si tu la reprends | Tant que le compte existe (5 000 plus récentes au plus) |
| **Si tu te connectes avec Google** : l'adresse e-mail de ton compte Google (vérifiée par Google), une **empreinte** SHA-256 de ton identifiant Google (jamais l'identifiant lui-même), la date de la liaison. Rien d'autre : ni nom, ni photo de profil, ni contacts | Te reconnaître à la connexion suivante, même si ton adresse Google change | Tant que le compte existe |

Précisions vérifiables dans le code :
- Les photos prises dans l'app sont réencodées avant d'être enregistrées : leurs
  **métadonnées EXIF** (modèle du téléphone, position GPS de la prise de vue)
  n'existent déjà plus sur l'appareil, donc ne sont jamais envoyées.
- L'adresse du relais de reconnaissance IA, si tu en as configuré une, **n'est
  pas** envoyée (elle est vidée à l'export).
- Aucun mot de passe : il n'y en a pas.
- **Synchronisation automatique** (activée par défaut une fois connecté) : chaque
  modification de ta collection part vers le serveur quelques secondes après ton
  geste, et l'app demande au serveur, à son ouverture, si un autre de tes
  appareils a envoyé du nouveau. Ce sont **les mêmes données** que la sauvegarde
  manuelle, rien de plus. Tu peux la **désactiver** dans Réglages › Compte :
  plus rien ne part alors sans « Sauvegarder ». Sans compte, rien n'est envoyé.

## Ce qui est traité sans être conservé

- **Ton adresse IP** sert à limiter les abus (au plus 10 demandes de code et 20
  essais de connexion par quart d'heure et par adresse IP). En IPv6, seul le
  préfixe réseau /64 est pris en compte, pas l'adresse entière. Elle n'est
  enregistrée que sous forme **d'empreinte** SHA-256, et le compteur est effacé
  sous 48 heures par la purge nocturne.
- Un **compteur global**, sans aucune donnée personnelle, plafonne le nombre de
  codes envoyés par jour pour tout le service (protection contre l'envoi en
  masse d'e-mails à des inconnus).
- De même, les compteurs par adresse e-mail (3 codes par quart d'heure, 10 par
  jour), qui empêchent d'inonder la boîte de quelqu'un ou de deviner un code,
  ne conservent qu'une empreinte.
- L'hébergeur (Cloudflare) peut journaliser les requêtes, dont l'adresse IP,
  selon sa propre politique.
- **Connexion avec Google** : le jeton de connexion signé par Google n'est gardé
  que sous forme d'**empreinte**, le temps de sa validité (environ une heure),
  pour qu'il ne puisse pas servir deux fois ; la purge nocturne l'efface ensuite.
  Les tentatives sont plafonnées par adresse IP (20 par quart d'heure), avec la
  même empreinte que plus haut.
- **Le bouton « Continuer avec Google »** est fourni par un script de Google. Ce
  script n'est chargé **que lorsque tu ouvres le panneau « Compte »** sans être
  connecté — jamais à l'ouverture de l'app : sans ce geste, Google n'est pas
  contacté. Une fois chargé, Google reçoit ce que reçoit tout site qui affiche
  son bouton (adresse IP, navigateur, et sa propre session si tu es connecté à
  Google dans ce navigateur), selon **sa** politique de confidentialité. Tu peux
  toujours te connecter par code e-mail à la place.

## Pourquoi c'est légal (bases légales, RGPD art. 6)

- Compte, sauvegarde et restauration : **exécution du service** que tu demandes
  en créant un compte (art. 6.1.b).
- Limites de débit contre les abus : **intérêt légitime** à protéger le service
  et les boîtes mail d'autrui (art. 6.1.f).
- Reconnaissance automatique d'une photo : **exécution du service** que tu
  déclenches en capturant une voiture (art. 6.1.b) ; ses compteurs quotidiens
  relèvent de l'intérêt légitime ci-dessus.

Aucune publicité ciblée, aucune revente, aucun profilage, aucun traceur : ces
données ne servent qu'à te rendre ton garage.

## Qui d'autre y a accès (sous-traitants)

| Prestataire | Rôle | Données |
|---|---|---|
| **Cloudflare, Inc.** | Hébergement du serveur (Workers), de la base (D1) et des photos (R2). La base est créée sous **juridiction UE** : elle est stockée et traitée dans l'Union européenne (réglage fixé à sa création, constaté le 04/10/2026 par l'API Cloudflare : `jurisdiction: "eu"`) | Tout ce qui est listé plus haut |
| **Resend** | Envoi de l'e-mail de connexion | Ton adresse e-mail et le code |
| **Google LLC** (seulement si tu choisis « Continuer avec Google ») | Te connecter avec ton compte Google : Google confirme ton identité et ton adresse | Google sait que tu te connectes à Garage Manifest ; il ne reçoit **rien** de ta collection |
| **Google LLC** (modèle d'IA Gemini) | Reconnaissance de la voiture sur la photo | La photo envoyée à l'identification, sans ton adresse ni ton identifiant (le relais ne transmet que l'image) ; conservée 55 jours par Google pour la détection des abus, jamais pour entraîner ses modèles (voir plus haut) |

Ces sociétés sont établies aux **États-Unis**. Cloudflare, Google et Resend
déclarent adhérer au **Data Privacy Framework UE–États-Unis**, reconnu par la
décision d'adéquation de la Commission européenne du 10 juillet 2023 : le
transfert de tes données vers elles est encadré par cette décision.
**[À VÉRIFIER au lancement sur la liste officielle (dataprivacyframework.gov) :
la certification se renouvelle chaque année.]**

## Sécurité

- Connexion par code à 6 chiffres à usage unique, sans mot de passe
  réutilisable.
- Un code ne supporte que 5 essais ; en demander un nouveau annule le précédent,
  et une adresse ne peut pas recevoir plus de 10 codes par jour : deviner un
  code a au plus 1 chance sur 20 000 par jour.
- Ni les codes ni les sessions ne sont stockés en clair : une copie de la base ne
  permet pas de se connecter.
- La réponse à une demande de code est identique qu'un compte existe ou non :
  personne ne peut tester si ton adresse est inscrite.
- Chaque photo est vérifiée par son empreinte : personne ne peut remplacer une
  de tes photos par une autre. Les photos ne sont jamais publiques ; elles ne
  sont servies qu'à toi, connecté.
- Aucun autre site web ne peut appeler le serveur depuis ton navigateur : seules
  les pages de l'app y sont autorisées. Et sans ta session, le serveur ne livre
  rien de ton compte, quelle que soit la provenance de la requête.

## Tes droits

- **Suppression** : Réglages → Compte → « Supprimer mon compte ». Effacement
  **immédiat et total** côté serveur : adresse, sessions, collection et photos.
  Ton téléphone garde son garage local. Sans l'app : voir
  [Supprimer ton compte](./suppression-compte.html).
  L'hébergeur garde une sauvegarde technique de la base, qui permet de la
  remettre dans un état passé (« Time Travel » de Cloudflare D1) : une donnée
  effacée y reste restaurable **7 jours** avec l'offre gratuite de Cloudflare,
  utilisée aujourd'hui (30 jours avec son offre payante), puis disparaît.
- **Accès et portabilité** : Réglages → « Exporter ma collection » produit un
  fichier JSON complet (photos incluses). Une copie de tout ce que le serveur
  détient (adresse, date de création, moyens de connexion reliés, collection,
  liste des photos) est aussi
  disponible sur demande à l'adresse de contact.
- **Rectification** : modifie ta collection dans l'app puis sauvegarde ; pour
  changer d'adresse e-mail, contacte-nous.
- **Réclamation** : tu peux saisir la CNIL ([cnil.fr](https://www.cnil.fr)).

## Comptes inactifs

**[À DÉCIDER]** Aujourd'hui, un compte jamais rouvert est conservé sans limite.
Le RGPD demande une durée définie : par exemple, suppression après **3 ans**
sans connexion, précédée d'un e-mail d'avertissement. Le code ne l'implémente
pas encore — à décider avant l'ouverture au public.

## Mineurs

**[À DÉCIDER]** En France, un mineur de moins de 15 ans ne peut consentir seul à
un service de ce type lorsqu'il repose sur le consentement. Le compte reposant
ici sur l'exécution du service, précise l'âge minimum visé et la conduite à
tenir.

*Dernière mise à jour : [À COMPLÉTER — date de publication].*
