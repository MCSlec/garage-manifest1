# Fiches techniques — ce qui manque encore

> Généré le 2026-09-23 par `node banc-audit.js --manques-md`.
> Régénère-le après chaque vague plutôt que de le corriger à la main.

**10 fiches à compléter** · 59 légitimement incomplètes (voir la fin).

Le champ **ch** est indiqué parce qu'il **désigne la variante exacte** de la fiche :
cherche le couple ou la masse *de cette version-là*, pas du modèle en général.


## Classique

| Voiture | Années | Puissance (fixe la variante) | Manque |
|---|---|---|---|
| Bentley 4½ Litre Blower | 1929–1931 | 240 ch | **couple** |
| Bugatti Type 35 | 1924–1930 | 140 ch | **couple** |
| Cord 810 / 812 | 1936–1937 | 127 ch | **couple** |
| Peugeot 402 | 1935–1942 | 63 ch | **couple** |
| Tatra T87 | 1936–1950 | 75 ch | **couple** |

## Hypercar

| Voiture | Années | Puissance (fixe la variante) | Manque |
|---|---|---|---|
| Czinger 21C | 2023 | 1350 ch | **couple** |
| Hispano Suiza Carmen | 2019 | 1019 ch | **couple** |
| Mercedes-AMG ONE | 2022 | 1063 ch | **couple** |

## Supercar

| Voiture | Années | Puissance (fixe la variante) | Manque |
|---|---|---|---|
| Porsche 911 Sport Classic | 2022 | 550 ch | **masse** |

## SUV

| Voiture | Années | Puissance (fixe la variante) | Manque |
|---|---|---|---|
| Renault Austral | 2022 | 200 ch | **couple** |

---

## Notes de sourcing — cas déjà creusés, et pourquoi ils bloquent

| Voiture | Ce qui bloque |
|---|---|
| **Xiaomi SU7 Ultra** | 1 770 Nm chez les uns, 1 135 Nm chez les autres. Écart de 55 % : l'un des deux est probablement le prototype, l'autre la série. |
| **Mercedes-AMG ONE** | 900 Nm circule, mais Mercedes ne publie aucun couple système. Avec quatre moteurs électriques répartis sur des essieux différents, un couple « combiné » est mal défini. |
| **Renault Austral E-Tech** | Le « 410 Nm » des fiches est exactement 205 + 205 : une addition des couples thermique et électrique, ce que la convention interdit (voir CLAUDE.md §4.4). Chercher si Renault publie une valeur système réelle. |
| **Hispano Suiza Carmen** | 1 150 Nm chez les uns, 1 600 Nm chez les autres : couple moteur contre couple cumulé des quatre moteurs après démultiplication. |
| **Porsche 356 Carrera 2** | Le moteur Fuhrmann 587/1 est très documenté en puissance (130 ch à 6 200 tr/min), mais aucune source consultée ne publie son couple. |
| **GMC Hummer EV** | ⚠️ Le « 11 500 lb-ft » (≈ 15 592 Nm) qui circule est le **couple à la roue** annoncé par le marketing GM, pas le couple des moteurs (~1 500 Nm). Ne jamais le saisir tel quel : il donnerait un ratio délirant. |
| **Czinger 21C** | Puissance bien documentée (1 250 ch), couple jamais publié par le constructeur. |
| **Micro-citadines d'époque restantes** (Fiat 500 Nuova, Peugeot 402, Tatra T87, Cord, Bugatti Type 35, Bentley Blower, Delahaye 135) | Couple non communiqué à l'époque. Piste : revues techniques (RTA) et notices constructeur d'origine. |

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
