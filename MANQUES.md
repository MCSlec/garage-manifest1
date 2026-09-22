# Fiches techniques — ce qui manque encore

> Généré le 2026-09-22 par `node banc-audit.js --manques-md`.
> Régénère-le après chaque vague plutôt que de le corriger à la main.

**25 fiches à compléter** · 59 légitimement incomplètes (voir la fin).

Le champ **ch** est indiqué parce qu'il **désigne la variante exacte** de la fiche :
cherche le couple ou la masse *de cette version-là*, pas du modèle en général.


## Berline

| Voiture | Années | Puissance (fixe la variante) | Manque |
|---|---|---|---|
| Lucid Air | 2021 | 1251 ch | **couple** |
| Xiaomi SU7 Ultra | 2024 | 1548 ch | **couple** |

## Citadine

| Voiture | Années | Puissance (fixe la variante) | Manque |
|---|---|---|---|
| Peugeot 106 | 1991–2003 | 120 ch | **masse, cylindrée** |

## Classique

| Voiture | Années | Puissance (fixe la variante) | Manque |
|---|---|---|---|
| Bentley 4½ Litre Blower | 1929–1931 | 240 ch | **couple** |
| Bugatti Type 35 | 1924–1930 | 140 ch | **couple** |
| Chevrolet C10 | 1960–1987 | 255 ch | **couple** |
| Cord 810 / 812 | 1936–1937 | 190 ch | **couple** |
| Delahaye 135 | 1935–1954 | 160 ch | **couple** |
| Facel Vega Facel II | 1962–1964 | 390 ch | **couple** |
| Facel Vega HK500 | 1958–1961 | 360 ch | **couple** |
| Fiat 500 (Nuova) | 1957–1975 | 23 ch | **couple** |
| Pegaso Z-102 | 1951–1958 | 360 ch | **couple** |
| Peugeot 402 | 1935–1942 | 63 ch | **couple** |
| Rolls-Royce Silver Shadow | 1965–1980 | 200 ch | **couple** |
| Simca 1000 Rallye 2 | 1961–1978 | 103 ch | **couple** |
| Tatra T87 | 1936–1950 | 75 ch | **couple** |

## Hypercar

| Voiture | Années | Puissance (fixe la variante) | Manque |
|---|---|---|---|
| Czinger 21C | 2023 | 1350 ch | **couple** |
| Hispano Suiza Carmen | 2019 | 1114 ch | **couple** |
| Mercedes-AMG ONE | 2022 | 1063 ch | **couple** |

## Sportive

| Voiture | Années | Puissance (fixe la variante) | Manque |
|---|---|---|---|
| Ariel Atom | 2000 | 350 ch | **couple** |

## SUV

| Voiture | Années | Puissance (fixe la variante) | Manque |
|---|---|---|---|
| Chevrolet K5 Blazer | 1969–1994 | 210 ch | **couple** |
| GMC Hummer EV | 2021 | 1000 ch | **couple** |
| Renault Scénic | 1996 | 170 ch | **couple** |
| Renault Austral | 2022 | 200 ch | **couple** |
| Tesla Cybertruck | 2023 | 845 ch | **couple** |

---

## Incohérences fiche / variante — à trancher

Repérées en sourçant : la **puissance de la fiche ne correspond pas à la
voiture que son nom annonce**. Ce sont des décisions de périmètre, pas des
trous de données — les combler mécaniquement figerait l'erreur. C'est la même
famille que les bugs Giulia/Quadrifoglio et M2 CS/M4 CSL.

| Fiche | Le problème | Options |
|---|---|---|
| **Peugeot 106** (générique) | Porte 120 ch / 145 Nm, soit les chiffres de la **106 GTI**. Une 106 de base fait 45 à 60 ch. | Soit la fiche devient une 106 de base (et il faut ses chiffres), soit elle assume d'être la sportive — mais alors elle double `peugeot-106-gti`. |
| **Simca 1000 Rallye 2** | Porte 103 ch, qui est la puissance de la **Rallye 3** (déc. 1977). La Rallye 2 développe 82 ch / 11 mkg. | Renommer en Rallye 3, ou ramener à 82 ch et prendre le couple de la Rallye 2. |
| **Fiat 500 (Nuova)** | Porte 23 ch, qui est la **500 R** (594 cm³). La Nuova 499 cm³ fait 18 à 21,5 ch. | Trancher quelle version la fiche représente avant de chercher son couple. |
| **Lancia Rally 037** | `ch:205` est la **Stradale** (route), mais `kg:960` est le poids de la version **Groupe B** de course. La Stradale pèse ~1 170 kg. | Le couple ajouté (234 Nm) est celui de la Stradale : aligner la masse, ou assumer la fiche « voiture de course ». |
| **Renault Scénic** | `ch:170` est le **Scénic E-Tech électrique** (125 kW), mais `cyl:1.3` est le thermique (qui plafonne à 160 ch). Ajouter le couple de l'électrique contre une cylindrée de 1,3 L produirait un Nm/L absurde. | Trancher : fiche thermique ou fiche électrique ? |
| **Ariel Atom** | `ch:350` ne correspond à aucune version des bases : Atom 3.5 = 242 ch, Atom 4 = 320 ch, Atom 4R = 400 ch. | Identifier la version visée (3.5R compressée ?) avant de chercher son couple. |

## Notes de sourcing — cas déjà creusés, et pourquoi ils bloquent

| Voiture | Ce qui bloque |
|---|---|
| **Lucid Air** | Deux chiffres incompatibles : 1 390 Nm (bases métriques) contre 1 430 lb-ft annoncés par Lucid, soit ~1 939 Nm. Bases de mesure différentes (couple moteur vs couple à la roue). Il faut trancher *laquelle* Lucid publie. |
| **Xiaomi SU7 Ultra** | 1 770 Nm chez les uns, 1 135 Nm chez les autres. Écart de 55 % : l'un des deux est probablement le prototype, l'autre la série. |
| **Mercedes-AMG ONE** | 900 Nm circule, mais Mercedes ne publie aucun couple système. Avec quatre moteurs électriques répartis sur des essieux différents, un couple « combiné » est mal défini. |
| **Renault Austral E-Tech** | Le « 410 Nm » des fiches est exactement 205 + 205 : une addition des couples thermique et électrique, ce que la convention interdit (voir CLAUDE.md §4.4). Chercher si Renault publie une valeur système réelle. |
| **Hispano Suiza Carmen** | 1 150 Nm chez les uns, 1 600 Nm chez les autres : couple moteur contre couple cumulé des quatre moteurs après démultiplication. |
| **Porsche 356 Carrera 2** | Le moteur Fuhrmann 587/1 est très documenté en puissance (130 ch à 6 200 tr/min), mais aucune source consultée ne publie son couple. |
| **Micro-citadines d'époque** (Fiat 500/600/126, BMW Isetta, Trabant 601, DAF 33) | Le couple n'était tout simplement pas communiqué à l'époque pour ces voitures. Piste : les revues techniques (RTA) et les notices constructeur d'origine. |

**Le réflexe à garder :** quand deux sources divergent d'un ordre de grandeur,
c'est presque toujours qu'elles ne mesurent pas la même chose (couple moteur vs
couple à la roue, prototype vs série, cumulé vs thermique seul). Mieux vaut un
champ vide qu'un chiffre faux — la valeur du catalogue, c'est la confiance.

---

## Légitimement incomplètes — ne pas chercher

Ces fiches sont **conformes** en l'état. Y inscrire un chiffre serait une erreur,
pas une amélioration.

### Voitures de course — couple jamais publié — 53

La puissance et la masse sont fixées course par course par la Balance of Performance ; le couple n'est communiqué par aucune écurie.

Alpine A442 · Alpine A424 · Aston Martin Vantage GT3 · Audi R18 e-tron quattro · Bentley Speed 8 · BMW M4 GT3 · Brabham BT46B « Fan Car » (F1) · Brawn BGP 001 · Cadillac V-Series.R · Chevrolet Corvette C8.R · Dallara IR-18 (IndyCar) · Ferrari 296 GT3 · Ferrari 330 P4 · Ferrari 499P · Ferrari F2004 (F1) · Ferrari 312T (F1) · Ford RS200 · Jaguar XJR-9 · Lamborghini Huracán GT3 · Lancia Delta S4 · Lotus 79 · Lotus 72 (F1) · Matra MS670 · Mazda 787B · McLaren MP4/4 (F1) · Mercedes-AMG GT3 · Mercedes-AMG W11 (F1) · MG Metro 6R4 · NHRA Top Fuel Dragster · Nissan R390 GT1 · Peugeot 405 T16 Pikes Peak · Peugeot 905 · Peugeot 9X8 · Peugeot 205 Turbo 16 Evo 2 · Porsche 935 « Moby Dick » · Porsche 911 RSR · Porsche 917 · Porsche 956 / 962 · Porsche 919 Hybrid · Porsche 963 · Porsche 911 GT3 R · Porsche 911 GT1 · Red Bull RB19 (F1) · Renault Espace F1 · Renault R25 (F1) · Toyota GT-One (TS020) · Toyota GR Yaris Rally1 · Toyota TS050 Hybrid · Toyota GR010 Hybrid · Tyrrell P34 six roues (F1) · USAC Midget · Williams FW14B (F1) · World of Outlaws Sprint Car 410

### Hybrides Toyota / Lexus (HSD) — couple système sans existence physique — 6

Thermique et électrique sont reliés par un train épicycloïdal, sans embrayage : les deux couples ne s'additionnent jamais sur un arbre commun. Toyota ne publie donc aucun couple système, et c'est délibéré.

Toyota Crown · Toyota Camry · Toyota Prius · Lexus RX · Toyota RAV4 · Toyota C-HR
