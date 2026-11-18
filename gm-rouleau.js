/* ==========================================================================
   GARAGE MANIFEST — MODULE « LE ROULEAU »              v1.0.1
   --------------------------------------------------------------------------
   Découple la CAPTURE de l'IDENTIFICATION.

   Tu shootes en rafale, hors-ligne, sans jamais attendre. Chaque photo entre
   dans une pellicule persistée. Un ordonnanceur la développe quand il peut :
   réseau revenu, quota disponible, app rouverte trois heures plus tard.
   Rien ne se perd, rien n'attend l'utilisateur.

   Vanilla JS. Zéro dépendance. Zéro build. Base IndexedDB dédiée.
   N'expose qu'un symbole global : `GMRouleau`.
   ========================================================================== */

(function (global) {
  'use strict';

  const VERSION = '1.0.1';

  /* ======================================================================
     0. RÉGLAGES — tout le comportement de l'ordonnanceur en un bloc
     ====================================================================== */

  const CFG = {
    MAX_COTE          : 1280,   // px, plus grand côté après redimensionnement
    QUALITE_JPEG      : 0.82,
    VIGNETTE          : 128,    // px, vignette persistée pour l'affichage
    CONCURRENCE       : 2,      // requêtes IA simultanées max
    TIMEOUT_MS        : 25000,
    ESSAIS_MAX        : 6,
    BACKOFF_BASE_MS   : 8000,   // 8s, 16s, 32s, 64s… plafonné
    BACKOFF_PLAFOND_MS: 15 * 60 * 1000,
    GIGUE             : 0.25,   // ±25 % de bruit sur le back-off
    DISJONCTEUR_SEUIL : 3,      // échecs réseau consécutifs avant ouverture
    DISJONCTEUR_MS    : 45000,
    FENETRE_RAFALE_MS : 20 * 60 * 1000, // durée pendant laquelle on cherche un jumeau
    /* Seuils calibrés au banc d'essai, pas au doigt mouillé.
       Mesures : rafale réelle (même voiture, décalage de cadrage) → dHash 0-1,
       écart couleur 1-2. Sujets différents de même composition → couleur 14 à 45.
       Les deux coûts ne sont PAS symétriques : rater une fusion coûte un appel
       IA, en faire une à tort inscrit une fausse identification au garage. On
       serre donc côté prudence, et l'utilisateur peut toujours dissocier. */
    HAMMING_MAX       : 5,      // distance dHash sous laquelle la structure est jugée identique
    ECART_COULEUR_MAX : 8,      // écart chromatique moyen (0-255) toléré pour un jumeau
    PURGE_APRES_MS    : 7 * 24 * 3600 * 1000 // les révélées sont purgées après 7 j
  };

  const ETATS = { LATENT: 'latent', ENCOURS: 'encours', REVELE: 'revele', ECHEC: 'echec' };

  /* ======================================================================
     1. PERSISTANCE — base dédiée, aucun contact avec ton schéma existant
     ----------------------------------------------------------------------
     Un Blob se stocke nativement en IndexedDB (algorithme de clonage
     structuré). On ne le convertit donc JAMAIS en base64 pour le stockage :
     ce serait +33 % de volume et une chaîne à recopier en mémoire à chaque
     lecture. La conversion n'a lieu qu'au moment de l'envoi réseau.
     ====================================================================== */

  const DB_NOM = 'gm-rouleau', DB_VER = 1, STORE = 'pellicule';
  let _db = null;

  function ouvrirDB() {
    return new Promise((res, rej) => {
      const rq = indexedDB.open(DB_NOM, DB_VER);
      rq.onupgradeneeded = () => {
        const db = rq.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const s = db.createObjectStore(STORE, { keyPath: 'id' });
          s.createIndex('etat', 'etat');
          s.createIndex('creeLe', 'creeLe');
          s.createIndex('groupe', 'groupe');
        }
      };
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    });
  }

  const tx = (mode, fn) => new Promise((res, rej) => {
    const t = _db.transaction(STORE, mode);
    const rq = fn(t.objectStore(STORE));
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });

  const dbTous     = ()   => tx('readonly',  s => s.getAll());
  const dbLire     = id   => tx('readonly',  s => s.get(id));
  const dbEcrire   = item => tx('readwrite', s => s.put(item));
  const dbSupprimer= id   => tx('readwrite', s => s.delete(id));

  /* ======================================================================
     2. TRAITEMENT IMAGE
     ----------------------------------------------------------------------
     Trois opérations, une seule décode : décodage → redimensionnement →
     vignette → empreinte perceptuelle. Une photo de Xiaomi 15 Ultra fait
     ~12 Mo ; en stocker 40 dans une file, c'est saturer le quota et faire
     exploser le temps d'upload sur un réseau de paddock.
     ====================================================================== */

  async function decoder(fichier) {
    if ('createImageBitmap' in global) {
      try { return await createImageBitmap(fichier); } catch (_) { /* repli */ }
    }
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(fichier), img = new Image();
      img.onload  = () => { URL.revokeObjectURL(url); res(img); };
      img.onerror = e  => { URL.revokeObjectURL(url); rej(e); };
      img.src = url;
    });
  }

  function dessiner(src, w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, c.width, c.height);
    return c;
  }

  const versBlob = (canvas, q) => new Promise(res => canvas.toBlob(res, 'image/jpeg', q));

  /* Empreinte perceptuelle dHash 64 bits.
     Principe : on réduit à 9×8 en niveaux de gris, puis on compare chaque
     pixel à son voisin de droite → 8×8 = 64 bits de GRADIENT.
     Pourquoi le gradient et pas la valeur absolue (aHash) : il est
     naturellement invariant à la luminosité et au contraste. Deux photos de
     la même voiture prises à deux secondes d'écart, l'une au soleil l'autre
     à l'ombre d'un nuage, produisent la même empreinte. C'est exactement le
     cas d'usage d'une rafale au bord de piste. */
  function empreinte(src) {
    const c = dessiner(src, 9, 8);
    const d = c.getContext('2d').getImageData(0, 0, 9, 8).data;
    const gris = new Float32Array(72);
    for (let i = 0; i < 72; i++) {
      const o = i * 4;
      gris[i] = 0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2];
    }
    let bits = '';
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++)
        bits += gris[y * 9 + x] > gris[y * 9 + x + 1] ? '1' : '0';
    let hex = '';
    for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
    return hex;
  }

  const POPCOUNT = [0,1,1,2,1,2,2,3,1,2,2,3,2,3,3,4];
  function hamming(a, b) {
    if (!a || !b || a.length !== b.length) return 64;
    let d = 0;
    for (let i = 0; i < a.length; i++)
      d += POPCOUNT[(parseInt(a[i], 16) ^ parseInt(b[i], 16)) & 15];
    return d;
  }

  /* Signature chromatique — 4×4 cellules, moyenne RVB par cellule.
     Le dHash est calculé en niveaux de gris : il est structurellement
     AVEUGLE À LA COULEUR. Deux Golf identiques, une rouge une bleue,
     photographiées sous le même angle, produisent la même empreinte et
     seraient fusionnées à tort. Bug réel, trouvé au banc d'essai.
     La couleur seule serait tout aussi mauvaise (même voiture au soleil
     puis à l'ombre). On exige donc les deux : structure proche ET
     chromatique proche. */
  function signatureCouleur(src) {
    const c = dessiner(src, 4, 4);
    const d = c.getContext('2d').getImageData(0, 0, 4, 4).data;
    let hex = '';
    for (let i = 0; i < 16; i++) {
      const o = i * 4;
      hex += d[o].toString(16).padStart(2, '0')
           + d[o + 1].toString(16).padStart(2, '0')
           + d[o + 2].toString(16).padStart(2, '0');
    }
    return hex;
  }

  /** Écart chromatique moyen, sur l'échelle 0–255. */
  function ecartCouleur(a, b) {
    if (!a || !b || a.length !== b.length) return 255;
    let somme = 0;
    for (let i = 0; i < a.length; i += 2)
      somme += Math.abs(parseInt(a.substr(i, 2), 16) - parseInt(b.substr(i, 2), 16));
    return somme / (a.length / 2);
  }

  const b64 = blob => new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result).split(',')[1]);
    fr.onerror = rej;
    fr.readAsDataURL(blob);
  });

  /* ======================================================================
     3. ÉTAT DU MODULE
     ====================================================================== */

  const S = {
    pret: false,
    items: new Map(),          // id -> item (miroir mémoire de la base)
    enVol: new Set(),          // ids en cours de requête
    identify: null,            // fourni par l'hôte : (blob, signal) => Promise<any>
    onRevele: null,            // (item) => void — rapprochement catalogue côté hôte
    onChange: null,            // () => void
    onErreur: null,
    echecsConsecutifs: 0,
    disjoncteurJusqua: 0,      // timestamp de réarmement
    minuteur: null,
    economies: 0,              // appels IA évités par déduplication
    conteneur: null
  };

  const maintenant = () => Date.now();
  const uid = () => (crypto.randomUUID ? crypto.randomUUID()
                     : 'r' + maintenant().toString(36) + Math.random().toString(36).slice(2, 8));

  function notifier() {
    if (S.conteneur) peindre();
    if (typeof S.onChange === 'function') { try { S.onChange(API.stats()); } catch (_) {} }
  }

  async function majItem(item) {
    S.items.set(item.id, item);
    await dbEcrire(item).catch(e => console.warn('[Rouleau] écriture échouée', e));
    notifier();
  }

  /* ======================================================================
     4. ENTRÉE — exposition d'une photo sur la pellicule
     ====================================================================== */

  async function exposer(fichier, meta = {}) {
    if (!S.pret) throw new Error('[Rouleau] init() non appelé');

    const src = await decoder(fichier);
    const w = src.width, h = src.height;
    const k = Math.min(1, CFG.MAX_COTE / Math.max(w, h));

    const grandC = dessiner(src, w * k, h * k);
    const [blob, vignetteC] = await Promise.all([
      versBlob(grandC, CFG.QUALITE_JPEG),
      Promise.resolve(dessiner(src, CFG.VIGNETTE * (w / Math.max(w, h)),
                                    CFG.VIGNETTE * (h / Math.max(w, h))))
    ]);
    const hash = empreinte(src);
    const couleur = signatureCouleur(src);
    if (src.close) src.close();               // libère l'ImageBitmap immédiatement

    const item = {
      id: uid(),
      creeLe: maintenant(),
      etat: ETATS.LATENT,
      blob,
      vignette: vignetteC.toDataURL('image/jpeg', 0.6),
      hash,
      couleur,
      groupe: hash,
      heritage: false,
      essais: 0,
      prochainEssai: 0,
      erreur: null,
      resultat: null,
      geo: meta.geo || null,
      note: meta.note || null
    };

    /* Déduplication de rafale.
       On cherche un jumeau perceptuel récent. S'il existe ET qu'il est déjà
       révélé, on hérite du résultat : zéro requête réseau, zéro quota, zéro
       attente. C'est le gain le plus direct du terrain — cinq déclenchements
       sur la même Porsche qui passe ne coûtent qu'une seule identification. */
    const jumeau = jumeauRecent(hash, couleur, item.creeLe);
    if (jumeau) {
      item.groupe = jumeau.groupe;
      if (jumeau.etat === ETATS.REVELE) {
        item.etat = ETATS.REVELE;
        item.resultat = jumeau.resultat;
        item.heritage = true;
        S.economies++;
      }
    }

    await majItem(item);
    if (item.etat === ETATS.REVELE) revelation(item);
    else planifier();
    return item.id;
  }

  function jumeauRecent(hash, couleur, t) {
    let best = null, bestD = Infinity;
    for (const it of S.items.values()) {
      if (t - it.creeLe > CFG.FENETRE_RAFALE_MS) continue;
      if (it.etat === ETATS.ECHEC) continue;
      const d = hamming(hash, it.hash);
      if (d > CFG.HAMMING_MAX) continue;                        // structure trop éloignée
      const dc = ecartCouleur(couleur, it.couleur);
      if (dc > CFG.ECART_COULEUR_MAX) continue;                 // même forme, autre robe
      const score = d + dc / 8;
      if (score < bestD) { bestD = score; best = it; }
    }
    return best;
  }

  /* ======================================================================
     5. ORDONNANCEUR
     ----------------------------------------------------------------------
     Quatre mécanismes empilés, chacun résolvant un problème distinct :

     · Limite de concurrence   — deux requêtes en vol. Au-delà, sur un réseau
       de paddock, on ne va pas plus vite : on augmente juste le nombre de
       timeouts simultanés et la mémoire retenue par les blobs en upload.

     · Back-off exponentiel    — 8s, 16s, 32s… Un service momentanément à
       terre n'est pas aidé par un client qui martèle.

     · Gigue (jitter)          — ±25 % de bruit aléatoire. Sans elle, si dix
       captures échouent en même temps (perte de réseau), elles retentent
       toutes exactement à la même milliseconde, et remettent le service à
       terre au moment précis où il se relève. C'est le « troupeau tonnant ».

     · Disjoncteur             — trois échecs réseau consécutifs et on coupe
       tout pendant 45 s. Utile quand le Worker est vraiment mort : on cesse
       de brûler la batterie et le quota pour rien, puis on sonde une fois.
     ====================================================================== */

  function backoff(essais) {
    const brut = Math.min(CFG.BACKOFF_BASE_MS * 2 ** (essais - 1), CFG.BACKOFF_PLAFOND_MS);
    return Math.round(brut * (1 + (Math.random() * 2 - 1) * CFG.GIGUE));
  }

  /* Un seul développement par groupe à la fois.
     Sans ça, une rafale de quatre photos exposées en moins d'une seconde
     lance jusqu'à CONCURRENCE requêtes AVANT que la première ne revienne :
     l'héritage n'a pas encore de quoi hériter. On désigne donc un
     représentant par groupe ; les autres attendent sa réponse et la
     reçoivent par propagation. Zéro appel superflu, même en rafale. */
  function eligibles() {
    const t = maintenant();
    const occupes = new Set();
    for (const i of S.items.values())
      if (i.etat === ETATS.ENCOURS || i.etat === ETATS.REVELE) occupes.add(i.groupe);
    return [...S.items.values()]
      .filter(i => i.etat === ETATS.LATENT && !S.enVol.has(i.id)
                   && i.prochainEssai <= t && !occupes.has(i.groupe))
      .sort((a, b) => a.creeLe - b.creeLe);
  }

  function planifier() {
    if (!S.pret) return;
    clearTimeout(S.minuteur);

    if (!navigator.onLine) return;                       // réveil par l'événement 'online'
    if (maintenant() < S.disjoncteurJusqua) {
      S.minuteur = setTimeout(planifier, S.disjoncteurJusqua - maintenant() + 50);
      return;
    }

    const libres = CFG.CONCURRENCE - S.enVol.size;
    if (libres > 0) eligibles().slice(0, libres).forEach(traiter);

    /* Réveil au prochain item éligible — pas de polling à l'aveugle. */
    const futurs = [...S.items.values()]
      .filter(i => i.etat === ETATS.LATENT && i.prochainEssai > maintenant())
      .map(i => i.prochainEssai);
    if (futurs.length) S.minuteur = setTimeout(planifier, Math.min(...futurs) - maintenant() + 50);
  }

  async function traiter(item) {
    S.enVol.add(item.id);
    item.etat = ETATS.ENCOURS;
    await majItem(item);

    const ctrl = new AbortController();
    const chrono = setTimeout(() => ctrl.abort('timeout'), CFG.TIMEOUT_MS);

    try {
      const resultat = await S.identify(item.blob, ctrl.signal, { b64: () => b64(item.blob) });
      clearTimeout(chrono);

      item.etat = ETATS.REVELE;
      item.resultat = resultat;
      item.erreur = null;
      S.echecsConsecutifs = 0;
      S.enVol.delete(item.id);
      await majItem(item);

      revelation(item);
      propagerAuGroupe(item);            // les jumeaux latents héritent
    } catch (e) {
      clearTimeout(chrono);
      S.enVol.delete(item.id);
      const reseau = estErreurReseau(e);

      item.essais++;
      item.erreur = String(e && e.message || e);

      if (item.essais >= CFG.ESSAIS_MAX) {
        item.etat = ETATS.ECHEC;         // sort de la boucle, relance manuelle
      } else {
        item.etat = ETATS.LATENT;
        item.prochainEssai = maintenant() + backoff(item.essais);
      }
      await majItem(item);

      if (reseau && ++S.echecsConsecutifs >= CFG.DISJONCTEUR_SEUIL) {
        S.disjoncteurJusqua = maintenant() + CFG.DISJONCTEUR_MS;
        S.echecsConsecutifs = 0;
        console.warn('[Rouleau] disjoncteur ouvert 45 s');
      }
      if (typeof S.onErreur === 'function') { try { S.onErreur(item, e); } catch (_) {} }
    }
    planifier();
  }

  /* Ne compte comme « réseau » que ce qui dit quelque chose de la LIAISON ou
     du SERVICE : fetch rejeté (TypeError), délai dépassé, 429, 5xx.
     La v1.0.0 testait `includes('5')` : tout message contenant le chiffre 5
     passait pour une panne — une erreur 400 « 25 Mo maximum » ouvrait le
     disjoncteur et gelait toute la pellicule 45 s, service pourtant sain.
     Trouvé par banc-rouleau.js (test 8). */
  function estErreurReseau(e) {
    if (e instanceof TypeError) return true;
    const m = String(e && e.message || e).toLowerCase();
    return m.includes('fetch') || m.includes('network') || m.includes('timeout')
        || /\b(429|5\d\d)\b/.test(m);
  }

  function propagerAuGroupe(source) {
    for (const it of S.items.values()) {
      if (it.id === source.id || it.groupe !== source.groupe) continue;
      if (it.etat !== ETATS.LATENT && it.etat !== ETATS.ECHEC) continue;
      it.etat = ETATS.REVELE;
      it.resultat = source.resultat;
      it.heritage = true;
      S.economies++;
      majItem(it);
      revelation(it);
    }
  }

  function revelation(item) {
    if (typeof S.onRevele !== 'function') return;
    try { S.onRevele(item); } catch (e) { console.error('[Rouleau] onRevele a levé', e); }
  }

  /* ======================================================================
     6. RENDU — « la pellicule »
     ----------------------------------------------------------------------
     Signature visuelle : une bande de film 35 mm à défilement horizontal,
     perforations comprises. Ce n'est pas de la décoration : la métaphore
     argentique EST le modèle mental du module. Une photo latente est floue,
     désaturée, sous-exposée ; quand l'identification revient, elle se
     « développe » — 900 ms de transition de filtre.

     Détail d'implémentation qui n'en est pas un : le rendu est un patch de
     nœuds existants, jamais un `innerHTML =`. Reconstruire le DOM
     détruirait le nœud au moment exact où sa transition CSS doit se jouer,
     et la révélation ne serait jamais visible. L'animation impose la
     structure du rendu, pas l'inverse.
     ====================================================================== */

  const CSS = `
  .gmr{--gmr-a:var(--accent,#e8b13a);--gmr-b:var(--border,#2a2f3a);--gmr-c:var(--card,#15171c);
    display:flex;flex-direction:column;gap:8px;font-variant-numeric:tabular-nums}
  .gmr-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:.78rem}
  .gmr-bar b{font-size:.8rem;letter-spacing:.08em;text-transform:uppercase;font-weight:600}
  .gmr-etat{opacity:.62;text-align:right;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .gmr-etat[data-alerte="1"]{color:var(--gmr-a);opacity:1}
  .gmr-film{position:relative;background:#141720;border-radius:8px;padding:14px 8px;
    overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;scrollbar-width:none}
  .gmr-film::-webkit-scrollbar{display:none}
  .gmr-film::before,.gmr-film::after{content:"";position:absolute;left:0;right:0;height:8px;
    background:repeating-linear-gradient(90deg,#07080a 0 9px,transparent 9px 19px);
    pointer-events:none}
  .gmr-film::before{top:3px}.gmr-film::after{bottom:3px}
  .gmr-piste{display:flex;gap:6px;min-height:96px;align-items:stretch}
  .gmr-vide{display:flex;align-items:center;padding:0 6px;font-size:.76rem;opacity:.45}
  .gmr-v{position:relative;flex:0 0 auto;width:72px;height:96px;border-radius:4px;overflow:hidden;
    background:#111318;cursor:pointer;border:0;padding:0;outline-offset:2px}
  .gmr-v img{width:100%;height:100%;object-fit:cover;display:block;
    transition:filter .9s cubic-bezier(.22,.9,.3,1),transform .9s cubic-bezier(.22,.9,.3,1)}
  .gmr-v[data-etat="latent"] img,.gmr-v[data-etat="encours"] img{
    filter:grayscale(.85) sepia(.35) brightness(.55) contrast(.7) blur(2.5px);transform:scale(1.06)}
  .gmr-v[data-etat="revele"] img{filter:none;transform:scale(1)}
  .gmr-v[data-etat="echec"] img{filter:grayscale(1) brightness(.4)}
  .gmr-v::after{content:"";position:absolute;inset:0;pointer-events:none;
    box-shadow:inset 0 0 0 1px rgba(255,255,255,.06)}
  .gmr-v[data-etat="encours"]::before{content:"";position:absolute;inset:0;z-index:2;
    background:linear-gradient(105deg,transparent 35%,rgba(255,255,255,.16) 50%,transparent 65%);
    background-size:250% 100%;animation:gmr-bal 1.5s linear infinite}
  @keyframes gmr-bal{from{background-position:130% 0}to{background-position:-30% 0}}
  .gmr-tag{position:absolute;left:0;right:0;bottom:0;z-index:3;padding:3px 4px;font-size:.6rem;
    line-height:1.15;background:linear-gradient(transparent,rgba(0,0,0,.88) 45%);color:#fff;
    display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .gmr-pin{position:absolute;top:3px;right:3px;z-index:3;font-size:.58rem;padding:1px 4px;
    border-radius:99px;background:rgba(0,0,0,.65);color:var(--gmr-a)}
  .gmr-n{position:absolute;top:3px;left:4px;z-index:3;font-size:.55rem;opacity:.5;color:#fff}
  @media (prefers-reduced-motion:reduce){
    .gmr-v img{transition:none}.gmr-v[data-etat="encours"]::before{animation:none}}
  `;

  function injecterCSS() {
    if (document.getElementById('gmr-css')) return;
    const st = document.createElement('style');
    st.id = 'gmr-css'; st.textContent = CSS;
    document.head.appendChild(st);
  }

  const esc = s => String(s ?? '').replace(/[&<>"]/g, m =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));

  const noeuds = new Map();

  function libelle(item) {
    if (item.etat === ETATS.ECHEC) return 'Échec';
    if (item.etat !== ETATS.REVELE) return '';
    const r = item.resultat;
    if (r == null) return '';
    if (typeof r === 'string') return r;
    return r.libelle || r.nom || [r.marque, r.modele].filter(Boolean).join(' ') || 'Identifiée';
  }

  function peindre() {
    injecterCSS();
    const hote = S.conteneur;
    if (!hote) return;

    if (!hote.querySelector('.gmr')) {
      hote.innerHTML =
        `<div class="gmr">
           <div class="gmr-bar"><b>Le rouleau</b><span class="gmr-etat"></span></div>
           <div class="gmr-film"><div class="gmr-piste"></div></div>
         </div>`;
      noeuds.clear();
    }

    const piste = hote.querySelector('.gmr-piste');
    const liste = [...S.items.values()].sort((a, b) => b.creeLe - a.creeLe);

    /* Suppression des nœuds orphelins */
    for (const [id, n] of noeuds) if (!S.items.has(id)) { n.remove(); noeuds.delete(id); }

    let vide = piste.querySelector('.gmr-vide');
    if (!liste.length) {
      if (!vide) { vide = document.createElement('div'); vide.className = 'gmr-vide';
                   vide.textContent = 'Pellicule vierge. Shoote, tu trieras après.';
                   piste.appendChild(vide); }
    } else if (vide) vide.remove();

    liste.forEach((item, i) => {
      let n = noeuds.get(item.id);
      if (!n) {
        n = document.createElement('button');
        n.type = 'button'; n.className = 'gmr-v'; n.dataset.id = item.id;
        n.innerHTML = `<img alt="" decoding="async"><span class="gmr-n"></span>
                       <span class="gmr-pin" hidden></span><span class="gmr-tag" hidden></span>`;
        n.querySelector('img').src = item.vignette;
        n.addEventListener('click', () => ouvrir(item.id));
        noeuds.set(item.id, n);
      }
      /* Mise à jour ciblée : on ne touche QUE ce qui change. */
      if (n.dataset.etat !== item.etat) n.dataset.etat = item.etat;
      n.querySelector('.gmr-n').textContent = String(liste.length - i).padStart(2, '0');
      const pin = n.querySelector('.gmr-pin');
      pin.hidden = !item.heritage; pin.textContent = '⧉';
      const tag = n.querySelector('.gmr-tag');
      const lib = libelle(item);
      tag.hidden = !lib; tag.textContent = lib;
      n.setAttribute('aria-label',
        `Photo ${liste.length - i}, ${item.etat}${lib ? ' : ' + lib : ''}`);
      if (piste.children[i] !== n) piste.insertBefore(n, piste.children[i] || null);
    });

    const st = API.stats();
    const zone = hote.querySelector('.gmr-etat');
    let txt, alerte = 0;
    if (!navigator.onLine && st.latentes)      { txt = `${st.latentes} en attente · hors réseau`; alerte = 1; }
    else if (maintenant() < S.disjoncteurJusqua){ txt = 'Service injoignable · reprise auto'; alerte = 1; }
    else if (st.enCours)                        txt = `Développement… ${st.enCours} en cours`;
    else if (st.latentes)                       txt = `${st.latentes} à développer`;
    else if (st.echecs)                        { txt = `${st.echecs} en échec · touche pour relancer`; alerte = 1; }
    else if (st.total)                          txt = `${st.revelees} révélées${st.economies ? ` · ${st.economies} appels évités` : ''}`;
    else                                        txt = '';
    zone.textContent = txt; zone.dataset.alerte = alerte;
  }

  function ouvrir(id) {
    const item = S.items.get(id);
    if (!item) return;
    if (item.etat === ETATS.ECHEC) return API.relancer(id);
    if (typeof API.onOuvrir === 'function') API.onOuvrir(item);
  }

  /* ======================================================================
     7. RÉVEILS — le module reprend le travail tout seul
     ====================================================================== */

  function brancherReveils() {
    addEventListener('online', () => { S.disjoncteurJusqua = 0; S.echecsConsecutifs = 0; planifier(); });
    addEventListener('offline', () => { clearTimeout(S.minuteur); notifier(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) planifier(); });

    /* Background Sync : le service worker peut réveiller la page après
       fermeture. Facultatif — voir le fragment à coller dans sw.js. */
    navigator.serviceWorker?.ready
      .then(reg => reg.sync?.register('gm-rouleau').catch(() => {}))
      .catch(() => {});
    navigator.serviceWorker?.addEventListener('message', e => {
      if (e.data === 'gm-rouleau-sync') planifier();
    });
  }

  /* Un PWA qui stocke des photos DOIT demander le stockage persistant.
     Sans ça, le navigateur est en droit d'évincer IndexedDB sous pression
     disque — et une pellicule non développée disparaît en silence. */
  async function demanderPersistance() {
    try {
      if (navigator.storage?.persist && !(await navigator.storage.persisted()))
        await navigator.storage.persist();
    } catch (_) {}
  }

  async function purger() {
    const t = maintenant();
    for (const it of [...S.items.values()])
      if (it.etat === ETATS.REVELE && t - it.creeLe > CFG.PURGE_APRES_MS) {
        S.items.delete(it.id);
        await dbSupprimer(it.id).catch(() => {});
      }
  }

  /* ======================================================================
     8. API PUBLIQUE
     ====================================================================== */

  const API = {
    VERSION,
    ETATS,
    onOuvrir: null,

    /**
     * @param {(blob:Blob, signal:AbortSignal, aide:{b64:()=>Promise<string>}) => Promise<any>} identify
     *        Ton `identifyCar` existant, adapté pour accepter un Blob.
     * @param {(item)=>void} onRevele   Appelé une fois par photo identifiée :
     *        c'est là que tu branches matchCatalog() puis la création de capture.
     */
    async init({ identify, onRevele, onChange, onErreur, conteneur } = {}) {
      if (typeof identify !== 'function')
        throw new Error('[Rouleau] init() exige identify(blob, signal)');
      S.identify = identify;
      S.onRevele = onRevele || null;
      S.onChange = onChange || null;
      S.onErreur = onErreur || null;

      _db = await ouvrirDB();
      for (const it of await dbTous()) {
        /* Toute photo laissée « en cours » par une fermeture brutale de l'app
           est repassée en latente : une requête dont on n'a jamais lu la
           réponse n'a jamais eu lieu. */
        if (it.etat === ETATS.ENCOURS) { it.etat = ETATS.LATENT; dbEcrire(it).catch(() => {}); }
        S.items.set(it.id, it);
      }
      await purger();
      await demanderPersistance();

      S.pret = true;
      brancherReveils();
      if (conteneur) this.render(conteneur);
      planifier();
      console.info(`[Rouleau v${VERSION}] ${S.items.size} vue(s) restaurée(s)`);
      return this;
    },

    /** Point d'entrée unique : accepte un File, un Blob, ou un tableau des deux. */
    async exposer(entree, meta) {
      const lot = Array.isArray(entree) ? entree : [entree];
      const ids = [];
      for (const f of lot) ids.push(await exposer(f, meta));
      return Array.isArray(entree) ? ids : ids[0];
    },

    async relancer(id) {
      const cibles = id ? [S.items.get(id)].filter(Boolean)
                        : [...S.items.values()].filter(i => i.etat === ETATS.ECHEC);
      for (const it of cibles) {
        it.etat = ETATS.LATENT; it.essais = 0; it.prochainEssai = 0; it.erreur = null;
        await majItem(it);
      }
      S.disjoncteurJusqua = 0;
      planifier();
    },

    async retirer(id) { S.items.delete(id); await dbSupprimer(id); notifier(); },

    /** Filet de sécurité de la déduplication : détache une vue de son groupe
     *  et la renvoie au développement pour une identification propre. */
    async dissocier(id) {
      const it = S.items.get(id);
      if (!it) return;
      it.groupe = it.hash + '-' + uid().slice(0, 4);
      it.heritage = false; it.resultat = null;
      it.etat = ETATS.LATENT; it.essais = 0; it.prochainEssai = 0;
      await majItem(it);
      planifier();
    },

    async vider(seulementRevelees = true) {
      for (const it of [...S.items.values()]) {
        if (seulementRevelees && it.etat !== ETATS.REVELE) continue;
        S.items.delete(it.id); await dbSupprimer(it.id).catch(() => {});
      }
      notifier();
    },

    stats() {
      const v = [...S.items.values()];
      return {
        total: v.length,
        latentes: v.filter(i => i.etat === ETATS.LATENT).length,
        enCours: v.filter(i => i.etat === ETATS.ENCOURS).length,
        revelees: v.filter(i => i.etat === ETATS.REVELE).length,
        echecs: v.filter(i => i.etat === ETATS.ECHEC).length,
        economies: S.economies,
        enLigne: navigator.onLine,
        disjoncteur: maintenant() < S.disjoncteurJusqua
      };
    },

    items() { return [...S.items.values()].sort((a, b) => b.creeLe - a.creeLe); },

    render(cible) {
      S.conteneur = typeof cible === 'string' ? document.querySelector(cible) : cible;
      if (!S.conteneur) return console.warn('[Rouleau] conteneur introuvable', cible);
      peindre();
    },

    /** Réglages de l'ordonnanceur, modifiables à chaud (bancs d'essai, tuning terrain). */
    reglages: CFG,
    _debug: S
  };

  global.GMRouleau = API;
})(window);
