# Politique de confidentialité — comptes Garage Manifest

> **Projet de texte**, rédigé à partir du code réel (`cloud/compte-worker.js`,
> `gm-compte.js`) : chaque affirmation ci-dessous correspond à un comportement
> vérifié par `banc-compte.js` / `banc-compte-navigateur.js`. Les passages
> `[À COMPLÉTER]` et `[À DÉCIDER]` doivent être tranchés **avant** l'ouverture
> au public. Ce document n'est pas un avis juridique : fais-le relire si l'app
> dépasse le cercle d'amis.
>
> **Règle de maintenance :** toute modification du serveur qui change ce qui est
> collecté, combien de temps, ou par qui, modifie ce fichier dans le même commit.

---

## Qui est responsable

Responsable du traitement : **[À COMPLÉTER — nom, adresse ou e-mail de contact]**.

## Sans compte, rien ne quitte ton téléphone

Le compte est **facultatif**. Sans lui, ta collection et tes photos restent dans
la mémoire de ton appareil (IndexedDB) et ne sont envoyées nulle part.

## Ce qui est collecté quand tu crées un compte

| Donnée | Pourquoi | Durée de conservation |
|---|---|---|
| **Adresse e-mail** | T'identifier et t'envoyer le lien de connexion | Tant que le compte existe |
| **Lien de connexion** (empreinte SHA-256 seulement, jamais le lien lui-même) | Vérifier le lien quand tu l'ouvres | 15 minutes de validité, à usage unique ; effacé à la purge nocturne suivante |
| **Session** (empreinte SHA-256 seulement) | Rester connecté sans recevoir un lien à chaque fois | 90 jours, ou jusqu'à la déconnexion |
| **Ta collection** : voitures, dates, lieux saisis, **positions GPS** si tu les as enregistrées, notes, déclinaisons, favoris, voitures personnalisées, pseudo, missions, liste d'amis et fil d'activité | Te la rendre sur un autre appareil | Tant que le compte existe |
| **Tes photos** | Idem | Tant que le compte existe |

Précisions vérifiables dans le code :
- Les photos prises dans l'app sont réencodées avant d'être enregistrées : leurs
  **métadonnées EXIF** (modèle du téléphone, position GPS de la prise de vue)
  n'existent déjà plus sur l'appareil, donc ne sont jamais envoyées.
- L'adresse du relais de reconnaissance IA, si tu en as configuré une, **n'est
  pas** envoyée (elle est vidée à l'export).
- Aucun mot de passe : il n'y en a pas.

## Ce qui est traité sans être conservé

- **Ton adresse IP** sert à limiter les abus (au plus 10 demandes de lien et 20
  ouvertures de session par quart d'heure et par adresse IP). Elle n'est
  enregistrée que sous forme **d'empreinte** SHA-256, et le compteur est effacé à
  la purge nocturne qui suit la fin de sa fenêtre de 15 minutes.
- De même, le compteur « 3 liens par quart d'heure et par adresse e-mail », qui
  empêche d'inonder la boîte de quelqu'un, ne conserve qu'une empreinte.
- L'hébergeur (Cloudflare) peut journaliser les requêtes, dont l'adresse IP,
  selon sa propre politique.

## Pourquoi c'est légal (bases légales, RGPD art. 6)

- Compte, sauvegarde et restauration : **exécution du service** que tu demandes
  en créant un compte (art. 6.1.b).
- Limites de débit contre les abus : **intérêt légitime** à protéger le service
  et les boîtes mail d'autrui (art. 6.1.f).

Aucune publicité ciblée, aucune revente, aucun profilage, aucun traceur : ces
données ne servent qu'à te rendre ton garage.

## Qui d'autre y a accès (sous-traitants)

| Prestataire | Rôle | Données |
|---|---|---|
| **Cloudflare, Inc.** | Hébergement du serveur (Workers), de la base (D1) et des photos (R2) | Tout ce qui est listé plus haut |
| **Resend** | Envoi de l'e-mail de connexion | Ton adresse e-mail et le lien |

Ces deux sociétés sont établies aux **États-Unis**. **[À COMPLÉTER — vérifier au
moment du lancement leur adhésion au Data Privacy Framework UE–États-Unis ou
leurs clauses contractuelles types, et l'indiquer ici.]**

## Sécurité

- Connexion par lien à usage unique, sans mot de passe réutilisable.
- Ni les liens ni les sessions ne sont stockés en clair : une copie de la base ne
  permet pas de se connecter.
- Le lien voyage dans la partie de l'adresse (`#connexion=…`) que les navigateurs
  n'envoient jamais aux serveurs web : il n'apparaît dans aucun journal d'accès.
  L'app l'efface de la barre d'adresse dès qu'il est lu.
- Si un lien ouvre un **autre** compte que celui demandé sur ton appareil, l'app
  te montre l'adresse et demande confirmation (protection contre les liens
  piégés).
- La réponse à une demande de lien est identique qu'un compte existe ou non :
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
  Ton téléphone garde son garage local.
  **[À VÉRIFIER au lancement — durée des sauvegardes techniques de Cloudflare D1
  (« Time Travel ») selon l'offre choisie, pendant laquelle une donnée effacée
  reste restaurable par l'hébergeur ; l'indiquer ici.]**
- **Accès et portabilité** : Réglages → « Exporter ma collection » produit un
  fichier JSON complet (photos incluses). Une copie de tout ce que le serveur
  détient (adresse, date de création, collection, liste des photos) est aussi
  disponible sur demande à l'adresse de contact.
- **Rectification** : modifie ta collection dans l'app puis sauvegarde ; pour
  changer d'adresse e-mail, contacte-nous.
- **Réclamation** : tu peux saisir la CNIL (cnil.fr).

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
