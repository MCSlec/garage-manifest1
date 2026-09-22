# Fiches techniques — ce qui manque encore

> Généré le 2026-09-22 par `node banc-audit.js --manques-md`.
> Régénère-le après chaque vague plutôt que de le corriger à la main.

**48 fiches à compléter** · 59 légitimement incomplètes (voir la fin).

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
| Citroën Ami | 2020 | 8 ch | **couple** |
| Fiat Cinquecento | 1991–1998 | 54 ch | **couple** |
| Fiat Seicento | 1998–2010 | 54 ch | **couple** |
| Nissan Cube | 1998–2019 | 122 ch | **couple** |
| Peugeot 106 | 1991–2003 | 120 ch | **masse, cylindrée** |

## Classique

| Voiture | Années | Puissance (fixe la variante) | Manque |
|---|---|---|---|
| Bentley 4½ Litre Blower | 1929–1931 | 240 ch | **couple** |
| BMW Isetta | 1955–1962 | 13 ch | **couple** |
| Bugatti Type 35 | 1924–1930 | 140 ch | **couple** |
| Chevrolet C10 | 1960–1987 | 255 ch | **couple** |
| Citroën Ami 6 | 1961–1978 | 35 ch | **couple** |
| Citroën Dyane | 1967–1983 | 35 ch | **couple** |
| Citroën DS (Déesse) | 1955–1975 | 141 ch | **couple** |
| Cord 810 / 812 | 1936–1937 | 190 ch | **couple** |
| DAF 33 (Variomatic) | 1967–1974 | 32 ch | **couple** |
| Delahaye 135 | 1935–1954 | 160 ch | **couple** |
| Facel Vega Facel II | 1962–1964 | 390 ch | **couple** |
| Facel Vega HK500 | 1958–1961 | 360 ch | **couple** |
| Ferrari 250 GTO | 1962–1964 | 300 ch | **couple** |
| Fiat 600 | 1955–1969 | 29 ch | **couple** |
| Fiat 500 (Nuova) | 1957–1975 | 23 ch | **couple** |
| Ford Fiesta XR2i / RS Turbo | 1989–1994 | 133 ch | **couple** |
| Lancia Aurelia B20 | 1950–1958 | 118 ch | **couple** |
| Lancia 037 | 1982–1983 | 205 ch | **couple** |
| Pegaso Z-102 | 1951–1958 | 360 ch | **couple** |
| Peugeot 402 | 1935–1942 | 63 ch | **couple** |
| Porsche 356 | 1948–1965 | 130 ch | **couple** |
| Renault 4CV | 1947–1961 | 21 ch | **couple** |
| Renault Dauphine | 1956–1967 | 55 ch | **couple** |
| Renault 6 | 1968–1986 | 47 ch | **couple** |
| Rolls-Royce Silver Shadow | 1965–1980 | 200 ch | **couple** |
| Simca 1000 Rallye 2 | 1961–1978 | 103 ch | **couple** |
| Tatra T87 | 1936–1950 | 75 ch | **couple** |
| Trabant 601 | 1963–1991 | 26 ch | **couple** |

## Hypercar

| Voiture | Années | Puissance (fixe la variante) | Manque |
|---|---|---|---|
| Czinger 21C | 2023 | 1350 ch | **couple** |
| Hispano Suiza Carmen | 2019 | 1114 ch | **couple** |
| Mercedes-AMG ONE | 2022 | 1063 ch | **couple** |
| Nio EP9 | 2016 | 1360 ch | **couple** |

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

## Youngtimer

| Voiture | Années | Puissance (fixe la variante) | Manque |
|---|---|---|---|
| Fiat 126 | 1972–2000 | 26 ch | **couple** |
| Honda City Turbo II | 1983–1986 | 110 ch | **couple** |
| Nissan Pao | 1989–1991 | 52 ch | **couple** |

---

## Notes de sourcing — cas déjà creusés, et pourquoi ils bloquent

| Voiture | Ce qui bloque |
|---|---|
| **Lucid Air** | Deux chiffres incompatibles : 1 390 Nm (bases métriques) contre 1 430 lb-ft annoncés par Lucid, soit ~1 939 Nm. Bases de mesure différentes (couple moteur vs couple à la roue). Il faut trancher *laquelle* Lucid publie. |
| **Xiaomi SU7 Ultra** | 1 770 Nm chez les uns, 1 135 Nm chez les autres. Écart de 55 % : l'un des deux est probablement le prototype, l'autre la série. |
| **Mercedes-AMG ONE** | 900 Nm circule, mais Mercedes ne publie aucun couple système. Avec quatre moteurs électriques répartis sur des essieux différents, un couple « combiné » est mal défini. |
| **Renault Austral E-Tech** | Le « 410 Nm » des fiches est exactement 205 + 205 : une addition des couples thermique et électrique, ce que la convention interdit (voir CLAUDE.md §4.4). Chercher si Renault publie une valeur système réelle. |
| **Peugeot 106 (générique)** | Porte 120 ch / 145 Nm, soit les chiffres de la **106 GTI**, alors qu'une 106 de base fait 45 à 60 ch. Ajouter une masse cimenterait l'erreur : c'est la fiche elle-même qui doit être tranchée (générique ou sportive ?). |

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
