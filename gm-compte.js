/* ======================================================================
   gm-compte.js — compte par e-mail et sauvegarde cloud du garage
   ----------------------------------------------------------------------
   POURQUOI
   La collection vit dans IndexedDB : dans UN appareil. Ce module la sauve
   sur le serveur de comptes (cloud/compte-worker.js) et la restaure sur
   n'importe quel autre appareil. Connexion par un CODE à 6 chiffres reçu
   par e-mail : pas de mot de passe, donc pas de « mot de passe oublié ».
   (Un code plutôt qu'un lien : sur iPhone, l'app installée n'a pas le même
   stockage que Safari, où s'ouvrirait le lien. Le code se tape dans l'app.)

   EN SOMMEIL PAR DÉFAUT
   Tant que COMPTE_URL est vide, le module ne fait RIEN : aucun panneau,
   aucun appel réseau. On l'active en renseignant l'adresse du Worker une
   fois déployé (cloud/DEPLOIEMENT.md).

   CONTRATS
   · Côté app : window.GMGarage.exporter() / .importer(data, {fusion}) —
     le module ne touche jamais à IndexedDB ni à l'état de l'app. La
     restauration passe donc par les MÊMES filtres que l'import d'un fichier
     (DT-02, DT-03, DT-09, DT-10) : une sauvegarde cloud n'est pas plus
     digne de confiance qu'un fichier reçu.
   · Côté serveur : le contrat HTTP décrit en tête de compte-worker.js.

   CHOIX
   · Photos envoyées une seule fois : chacune est désignée par son empreinte
     SHA-256 ; on demande au serveur lesquelles lui manquent, on n'envoie
     qu'elles. Une resauvegarde sans nouvelle photo ne transfère presque rien.
   · Deux appareils : chaque sauvegarde annonce la version qu'elle remplace
     (If-Match). Si l'autre appareil a sauvé entre-temps (409), on RESTAURE
     d'abord en fusion (rien n'est perdu), puis on renvoie.
   · Une sauvegarde ne retire du cloud que ce qui a été retiré VOLONTAIREMENT
     (pierre tombale). Si l'appareil a perdu des voitures que le cloud possède
     — « Réinitialiser », base locale indisponible, version de l'app qui ne
     connaît pas encore un modèle — on récupère d'abord, et ce que cette
     version ne sait pas lire est renvoyé tel quel (voir sauvegarder()).
   · Le jeton de session est gardé dans localStorage : c'est une préférence
     d'appareil, pas une donnée de collection (la collection reste en
     IndexedDB, CLAUDE.md §1.4).
   · Synchronisation AUTOMATIQUE (2.7.0, 20/11, décision du propriétaire) :
     connecté, chaque geste part au cloud sans bouton, et l'ouverture de l'app
     récupère ce qu'un autre appareil a envoyé. Voir « synchronisation
     automatique » plus bas : ce qui la déclenche, et ce qui empêche deux
     téléphones de se renvoyer la balle sans fin.
   ====================================================================== */
(function (global) {
  'use strict';

  const VERSION_COMPTE = '2.7.1';

  /* Adresse du Worker de comptes, SANS « / » final. Vide = en sommeil.
     Renseignée le 18/11 : serveur déployé et vérifié (TUTO-GRATUIT.md, séance 2).
     `window.GM_COMPTE_URL`, posé avant le chargement, prend le pas — y compris
     VIDE, qui force le sommeil : c'est le point d'entrée des bancs
     (banc-compte-navigateur.js). Avant, une chaîne vide retombait sur
     COMPTE_URL : une fois l'adresse inscrite, aucun banc n'aurait plus pu
     vérifier le sommeil. */
  const COMPTE_URL = 'https://garage-comptes.cyril-lapopin.workers.dev';
  let base = String(typeof global.GM_COMPTE_URL === 'string' ? global.GM_COMPTE_URL : COMPTE_URL).trim().replace(/\/+$/, '');

  /* « Continuer avec Google » (14/10). Identifiant client OAuth de Google
     Cloud : PUBLIC, ce n'est pas un secret. Vide = EN SOMMEIL : ni bouton, ni
     script, ni requête vers Google. Renseigné, le script officiel de Google
     (autorisé par le propriétaire, CLAUDE.md §1.2) n'est chargé qu'à
     l'affichage du panneau Compte, et seulement hors connexion : Google n'est
     pas contacté à chaque ouverture de l'app. Le compte reste le nôtre : le
     serveur vérifie le jeton signé par Google et ouvre NOTRE session.
     Renseigné le 18/11 : client « Garage Manifest web » du projet Google Cloud
     « Garage Manifest », origine autorisée https://mcslec.github.io.
     `window.GM_GOOGLE_CLIENT_ID` prend le pas, y compris VIDE (bancs : Google
     en sommeil), comme GM_COMPTE_URL. */
  const GOOGLE_CLIENT_ID = '971591613910-9rdu43efkpdpehdp9l0bh99pqplq65u4.apps.googleusercontent.com';
  const idGoogle = String(typeof global.GM_GOOGLE_CLIENT_ID === 'string' ? global.GM_GOOGLE_CLIENT_ID : GOOGLE_CLIENT_ID).trim();
  const SCRIPT_GOOGLE = 'https://accounts.google.com/gsi/client';

  const CLE = 'gm-compte';
  /* Délai des requêtes. Sans lui, une connexion qui ne répond plus laissait
     « Sauvegarde en cours… » affiché sans fin, bouton grisé. Les envois lourds
     (photo, collection) ont quatre fois plus. `window.GM_COMPTE_DELAI_MS` : bancs. */
  const DELAI_MS = Number(global.GM_COMPTE_DELAI_MS) > 0 ? Number(global.GM_COMPTE_DELAI_MS) : 30000;
  const DELAI_LOURD_MS = DELAI_MS * 4;
  const CONCURRENCE_PHOTOS = 3;
  const LOT_EMPREINTES = 1000;     // le serveur refuse au-delà de 5 000 par requête : on reste loin
  /* Serveur sans stockage photo (mode essai, compte-worker.js) : état de
     configuration STABLE, à ne pas confondre avec une panne. On continue sans
     les photos — elles restent sur l'appareil — et on le dit. */
  const SANS_PHOTOS = 501;
  /* Synchronisation automatique. SYNCHRO_MS : calme attendu après un geste avant d'envoyer
     (une rafale de gestes = un seul envoi). REPOS_MS : au retour sur l'app, on ne
     réinterroge le cloud que si la dernière vérification date d'au moins ce délai.
     `window.GM_COMPTE_SYNCHRO_AUTO` (booléen) : valeur par défaut tant que le joueur n'a pas
     choisi — les bancs l'éteignent pour les tests qui comptent les requêtes.
     `window.GM_COMPTE_SYNCHRO_MS` : bancs. */
  const SYNCHRO_MS = Number(global.GM_COMPTE_SYNCHRO_MS) > 0 ? Number(global.GM_COMPTE_SYNCHRO_MS) : 4000;
  const REPOS_MS = 2 * 60 * 1000;
  const RELANCE_MS = Number(global.GM_COMPTE_RELANCE_MS) > 0 ? Number(global.GM_COMPTE_RELANCE_MS) : 30000;   // bancs : plus court
  const RELANCE_MAX_MS = 15 * 60 * 1000;
  const AUTO_PAR_DEFAUT = typeof global.GM_COMPTE_SYNCHRO_AUTO === 'boolean' ? global.GM_COMPTE_SYNCHRO_AUTO : true;

  // ------------------------------------------------------------ état ----
  const lireEtat = () => { try { return JSON.parse(localStorage.getItem(CLE)) || {}; } catch (_) { return {}; } };
  const ecrireEtat = (e) => { try { localStorage.setItem(CLE, JSON.stringify(e)); } catch (_) {} };
  /* Ce qui décrit le cloud D'UN compte (version, voitures, signature, modification en
     attente, état de la synchro) part avec la session : un autre compte ouvert ensuite sur
     cet appareil ne doit en hériter ni la version, ni la signature. */
  const ETAT_DU_COMPTE = ['version', 'ids', 'empreinteCloud', 'modif', 'derniereSynchro', 'erreurSynchro'];
  const oublierSession = () => { const e = lireEtat(); delete e.session; for (const k of ETAT_DU_COMPTE) delete e[k]; ecrireEtat(e); };
  const nouvelleSession = (r) => {
    const e = { ...lireEtat(), session: r.session, email: r.email, version: 0 };
    for (const k of ['emailEnAttente', 'codeDemande', ...ETAT_DU_COMPTE.filter(k => k !== 'version')]) delete e[k];
    ecrireEtat(e);
  };
  const synchroVoulue = (e) => typeof e.synchroAuto === 'boolean' ? e.synchroAuto : AUTO_PAR_DEFAUT;
  /* État vidé (déconnexion, compte supprimé) en gardant les PRÉFÉRENCES DE L'APPAREIL : le
     choix « synchronisation désactivée » survivait mal à une déconnexion (relecture du 21/11). */
  const viderEtat = () => { const e = lireEtat(); ecrireEtat(typeof e.synchroAuto === 'boolean' ? { synchroAuto: e.synchroAuto } : {}); };

  const DUREE_CODE_MS = 10 * 60 * 1000;               // = serveur
  function etat() {
    const e = lireEtat();
    const enAttente = !e.session && e.emailEnAttente && Date.now() - (e.codeDemande || 0) < DUREE_CODE_MS ? e.emailEnAttente : null;
    return { configure: !!base, connecte: !!(base && e.session), email: e.email || null, codeEnvoyeA: enAttente, google: !!(base && idGoogle),
             version: e.version || 0, derniereSauvegarde: e.derniere || null, sansPhotos: !!e.sansPhotos,
             /* F-8 (19/11) : tant qu'aucune sauvegarde n'a eu lieu, l'app ne SAIT pas si le
                serveur garde les photos — le panneau ne doit rien promettre. */
             photosInconnues: typeof e.sansPhotos !== 'boolean',
             synchroAuto: synchroVoulue(e), aEnvoyer: !!e.modif, derniereSynchro: e.derniereSynchro || null,
             erreurSynchro: e.erreurSynchro || null, synchroEnCours };
  }

  // ------------------------------------------------------------- réseau --
  class ErreurCompte extends Error { constructor(m, statut, corps) { super(m); this.statut = statut; this.corps = corps; } }

  async function api(methode, chemin, { corps, brut, type, entetes = {}, reponseBrute = false, delai = DELAI_MS } = {}) {
    if (!base) throw new ErreurCompte('Compte non configuré', 0);
    const e = lireEtat();
    const h = { ...entetes };
    if (e.session) h.Authorization = `Bearer ${e.session}`;
    if (corps !== undefined) h['Content-Type'] = 'application/json';
    if (type) h['Content-Type'] = type;
    // Le délai couvre la réponse ENTIÈRE, corps compris : une photo dont le
    // téléchargement s'enlise est aussi une requête qui ne répond pas.
    const ctl = new AbortController(); const minuterie = setTimeout(() => ctl.abort(), delai);
    const panne = () => new ErreurCompte(ctl.signal.aborted ? 'Le serveur ne répond pas : réessaie dans un instant' : 'Pas de connexion au serveur', 0);
    try {
      let r;
      try {
        r = await fetch(base + chemin, { method: methode, headers: h, signal: ctl.signal,
          body: brut !== undefined ? brut : corps !== undefined ? JSON.stringify(corps) : undefined });
      } catch (_) { throw panne(); }
      if (r.status === 401) oublierSession();
      let texte;
      try {
        if (reponseBrute && r.ok) return { type: r.headers.get('Content-Type') || '', octets: new Uint8Array(await r.arrayBuffer()) };
        texte = await r.text();
      } catch (_) { throw panne(); }
      let json = null; try { json = texte ? JSON.parse(texte) : null; } catch (_) {}
      if (!r.ok) throw new ErreurCompte((json && json.erreur) || `Erreur ${r.status}`, r.status, json);
      return json;
    } finally { clearTimeout(minuterie); }
  }

  // ------------------------------------------------------------ photos --
  const TYPES_PHOTO = new Set(['image/jpeg', 'image/png', 'image/webp']);
  const RE_DATAURL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/;
  function dataUrlVersOctets(d) {
    const m = RE_DATAURL.exec(d); if (!m) return null;
    const bin = atob(m[2]); const o = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) o[i] = bin.charCodeAt(i);
    return { type: m[1], octets: o };
  }
  function octetsVersDataUrl(octets, type) {
    let bin = ''; const pas = 0x8000;
    for (let i = 0; i < octets.length; i += pas) bin += String.fromCharCode.apply(null, octets.subarray(i, i + pas));
    return `data:${type};base64,${btoa(bin)}`;
  }
  async function empreinte(octets) {
    const h = await crypto.subtle.digest('SHA-256', octets);
    return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  /* Empreintes des photos, MÉMORISÉES. La synchronisation automatique sauvegarde après
     chaque geste : recalculer à chaque fois le SHA-256 de toutes les photos (décodage base64
     compris) coûterait plusieurs secondes de calcul sur un téléphone, pour un garage de
     quelques centaines de photos. Clé = le texte de la photo, déjà en mémoire dans l'app
     (aucune copie). Élaguée à chaque sauvegarde : une photo retirée n'y reste pas retenue. */
  const memoEmpreintes = new Map();
  async function empreintePhoto(p) {
    if (memoEmpreintes.has(p)) return memoEmpreintes.get(p);
    const o = dataUrlVersOctets(p);
    const h = o ? await empreinte(o.octets) : null;
    memoEmpreintes.set(p, h);
    return h;
  }
  const elaguerEmpreintes = (gardees) => { for (const k of memoEmpreintes.keys()) if (!gardees.has(k)) memoEmpreintes.delete(k); };

  /* SIGNATURE d'un garage tel qu'il est envoyé (photos en empreintes) : JSON canonique —
     clés triées, voitures triées, date d'export exclue — puis SHA-256. Deux contenus
     identiques ont la même signature quel que soit l'ordre de leurs champs. Sert à NE PAS
     envoyer ce que le cloud contient déjà (synchronisation automatique). */
  const canonique = (v) => Array.isArray(v) ? `[${v.map(x => x === undefined || typeof x === 'function' ? 'null' : canonique(x)).join(',')}]`
    : v && typeof v === 'object' ? `{${Object.keys(v).filter(k => v[k] !== undefined && typeof v[k] !== 'function').sort()
        .map(k => `${JSON.stringify(k)}:${canonique(v[k])}`).join(',')}}`
    : (JSON.stringify(v) ?? 'null');
  async function signatureGarage(donnees) {
    const { exportedAt, ...reste } = donnees && typeof donnees === 'object' && !Array.isArray(donnees) ? donnees : {};
    const cle = (s) => String(s && typeof s === 'object' ? s.carId : '');
    const spots = (Array.isArray(reste.spots) ? reste.spots : []).slice().sort((a, b) => cle(a) < cle(b) ? -1 : cle(a) > cle(b) ? 1 : 0);
    return empreinte(new TextEncoder().encode(canonique({ ...reste, spots })));
  }

  async function enParallele(liste, n, travail) {
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(n, liste.length) }, async () => {
      while (i < liste.length) { const k = i++; await travail(liste[k], k); }
    }));
  }

  // ---------------------------------------------------------- connexion --
  async function demanderCode(email) {
    const adresse = String(email).trim().toLowerCase();
    await api('POST', '/auth/code', { corps: { email: adresse } });
    ecrireEtat({ ...lireEtat(), emailEnAttente: adresse, codeDemande: Date.now() });
    return true;
  }

  /* Le code n'est valable que pour l'adresse qui l'a demandé SUR CET APPAREIL :
     on n'envoie jamais une adresse saisie ailleurs. */
  async function verifierCode(code) {
    const e = lireEtat();
    if (!e.emailEnAttente) throw new ErreurCompte('Demande d\'abord un code', 0);
    const r = await api('POST', '/auth/session', { corps: { email: e.emailEnAttente, code: String(code).replace(/\s/g, '') } });
    nouvelleSession(r);
    apresConnexion();
    return true;
  }
  const annulerCode = () => { const e = lireEtat(); delete e.emailEnAttente; delete e.codeDemande; ecrireEtat(e); };

  /* Le jeton signé par Google part au serveur, qui le vérifie et ouvre NOTRE
     session : la suite (sauvegarde, restauration) est identique à une connexion
     par code. Point d'entrée unique : l'app native y passera le jeton que lui
     rend le SDK Google, sans autre changement. */
  async function connecterGoogle(credential) {
    if (!credential) throw new ErreurCompte('Connexion Google interrompue', 0);
    const r = await api('POST', '/auth/google', { corps: { credential } });
    nouvelleSession(r);
    apresConnexion();
    return true;
  }

  async function deconnecter() {
    try { await api('POST', '/auth/deconnexion'); } catch (_) {}
    viderEtat();
    // Recommandation de Google : sans cela, le bouton pourrait reconnecter d'office le même compte.
    try { global.google && global.google.accounts && global.google.accounts.id.disableAutoSelect(); } catch (_) {}
  }

  // ------------------------------------------------ sauvegarde / restauration --
  /* Une opération à la fois. Deux boutons touchés coup sur coup (ou un conflit
     qui relance une récupération pendant qu'une autre tourne) entremêlaient
     export, import et numéro de version. Les appels publics passent à la file. */
  let file = Promise.resolve();
  const enSerie = (f) => (...a) => { const p = file.then(() => f(...a)); file = p.catch(() => {}); return p; };

  const RE_EMPREINTE = /^[0-9a-f]{64}$/;
  const RE_ID_CATALOGUE = /^[a-z0-9][a-z0-9-]{0,80}$/;
  const fusionnee = (id) => { try { return !!(global.GMSpecs && typeof global.GMSpecs.fusionDe === 'function' && global.GMSpecs.fusionDe(id)); } catch (_) { return false; } };
  const idsDe = (donnees) => new Set(((donnees && donnees.spots) || []).map(s => s && s.carId));
  const tombesDe = (donnees) => (donnees && donnees.meta && donnees.meta.supprimes) || {};

  /* GARDE. `e.ids` = les voitures que le cloud contient, à la version `e.version`
     que cet appareil connaît. Si l'une d'elles n'est plus ici, et que ce n'est ni
     un retrait volontaire (pierre tombale), ni un doublon de catalogue fusionné,
     l'envoyer telle quelle l'effacerait du cloud. Cas réels : « Réinitialiser le
     garage » (remise à zéro LOCALE, non propagée) suivi de « Sauvegarder » ;
     base locale indisponible au démarrage (repli en mémoire : garage vide) ;
     version de l'app qui ne connaît pas un modèle sauvé par une plus récente.
     Session ouverte avant cette garde (`ids` absent) : contenu du cloud inconnu,
     donc même prudence, une fois. */
  function aRecupererDAbord(e, donnees) {
    if (!(e.version > 0)) return false;              // rien au cloud que cet appareil ait vu
    if (!Array.isArray(e.ids)) return true;
    const ici = idsDe(donnees), tombes = tombesDe(donnees);
    return e.ids.some(id => !ici.has(id) && !tombes[id] && !fusionnee(id));
  }

  /* La modification en attente (`modif`, un compteur) n'est levée que si AUCUN geste n'a eu
     lieu depuis l'export : un geste pendant l'envoi des photos n'est pas dans ce qui part. */
  const leverModif = (marque) => { const e = lireEtat(); if (e.modif === marque) { delete e.modif; ecrireEtat(e); } };

  async function sauvegarder({ progres, auto = false } = {}) {
    if (!global.GMGarage) throw new ErreurCompte('Application pas encore prête', 0);
    const auDepart = idsDe(global.GMGarage.exporter());
    let inconnues = [], recuperations = 0;
    for (;;) {
      // Anciennes photos non compressées : ramenées sous le plafond du serveur (2 Mo) avant envoi.
      if (typeof global.GMGarage.normaliserPhotos === 'function') await global.GMGarage.normaliserPhotos();
      const donnees = global.GMGarage.exporter();
      /* Version lue AVEC l'export, pas au moment d'envoyer : entre les deux, les
         photos partent (plusieurs secondes). Si le numéro avait bougé entre-temps,
         on annonçait la NOUVELLE version avec l'ANCIEN contenu, et le serveur
         l'acceptait sans conflit — la voiture de l'autre appareil était écrasée. */
      const connu = lireEtat(), versionConnue = connu.version || 0, marque = connu.modif;
      if (!recuperations && aRecupererDAbord(connu, donnees)) {
        inconnues = (await restaurer({ progres })).inconnues || []; recuperations++;
        continue;
      }
      /* empreinte → dataURL. On garde la RÉFÉRENCE au texte déjà en mémoire, et on
         ne décode qu'au moment d'envoyer : garder les octets de toutes les photos
         doublait la mémoire (≈ 165 Mo pour 500 photos), de quoi faire fermer
         l'onglet sur un téléphone. */
      const photos = new Map();
      const spots = [];
      for (const s of donnees.spots || []) {
        const emp = [];
        for (const p of (s.photos || [])) {
          const h = await empreintePhoto(p); if (!h) continue;
          photos.set(h, p); emp.push(h);
        }
        spots.push({ ...s, photos: emp });
      }
      elaguerEmpreintes(new Set(photos.values()));
      /* Voitures du cloud que CETTE version de l'app ne sait pas lire (modèle
         ajouté par une version plus récente) : renvoyées telles quelles. Sans
         cela, un appareil en retard d'une mise à jour les effaçait pour tous. */
      const ici = new Set(spots.map(s => s.carId));
      for (const s of inconnues) if (!ici.has(s.carId)) { spots.push(s); ici.add(s.carId); }
      const charge = { ...donnees, spots };
      const signature = await signatureGarage(charge);
      /* Synchronisation automatique : le cloud contient déjà exactement ce garage (dernier
         envoi ou dernière récupération) → aucun envoi, aucune requête. Le bouton
         « Sauvegarder » envoie toujours : c'est aussi lui qui rattrape des photos restées
         sur l'appareil quand le serveur gagne son stockage photo. */
      /* Exception : le serveur ne gardait pas les photos à la dernière sauvegarde (mode essai).
         Il a pu gagner son stockage depuis (R2 branché) : une question légère avant de conclure,
         sinon les photos restées sur l'appareil ne partaient jamais seules (relecture du 21/11). */
      let serveurAPhotos = false;
      if (auto && signature === connu.empreinteCloud && connu.sansPhotos === true && photos.size) {
        try { await api('POST', '/photos/manquantes', { corps: { empreintes: [photos.keys().next().value] } }); serveurAPhotos = true; }
        catch (err) { if (err.statut !== SANS_PHOTOS) throw err; }
      }
      if (auto && signature === connu.empreinteCloud && !serveurAPhotos) {
        leverModif(marque);
        return { inchange: true, version: versionConnue, photosEnvoyees: 0, voitures: spots.length, photosNonSauvegardees: 0,
                 recuperees: [...idsDe(donnees)].filter(id => !auDepart.has(id)).length };
      }
      const toutes = [...photos.keys()];
      let manquantes = [], sansPhotos = false;
      try {
        for (let i = 0; i < toutes.length; i += LOT_EMPREINTES) {
          const r = await api('POST', '/photos/manquantes', { corps: { empreintes: toutes.slice(i, i + LOT_EMPREINTES) } });
          manquantes.push(...r.manquantes);
        }
      } catch (err) {
        if (err.statut !== SANS_PHOTOS) throw err;
        // Les empreintes restent dans la collection : quand le serveur aura son
        // stockage, la sauvegarde suivante enverra ces photos, sans migration.
        sansPhotos = true; manquantes = [];
      }
      /* Mémorisé dans les deux sens : le panneau suit le serveur le jour où il
         gagne son stockage photo. Sans photo locale, on ne sait rien : on laisse. */
      if (toutes.length) ecrireEtat({ ...lireEtat(), sansPhotos });
      let faites = 0;
      await enParallele(manquantes, CONCURRENCE_PHOTOS, async (h) => {
        const o = photos.has(h) ? dataUrlVersOctets(photos.get(h)) : null;
        if (!o) return;                                // empreinte que nous n'avons pas annoncée : rien à envoyer
        await api('PUT', `/photos/${h}`, { brut: o.octets, type: o.type, delai: DELAI_LOURD_MS });
        progres && progres({ etape: 'photos', faites: ++faites, total: manquantes.length });
      });
      try {
        const r = await api('PUT', '/garage', { corps: { donnees: charge }, entetes: { 'If-Match': String(versionConnue) }, delai: DELAI_LOURD_MS });
        ecrireEtat({ ...lireEtat(), version: r.version, ids: spots.map(s => s.carId), derniere: new Date().toISOString(), empreinteCloud: signature });
        leverModif(marque);
        return { version: r.version, photosEnvoyees: manquantes.length, voitures: spots.length, photosNonSauvegardees: sansPhotos ? toutes.length : 0,
                 recuperees: [...idsDe(donnees)].filter(id => !auDepart.has(id)).length };
      } catch (err) {
        /* 409 : un autre appareil a sauvé entre-temps. On récupère sa version en
           FUSION (la modification la plus récente gagne, rien n'est perdu), puis
           on renvoie. Deux récupérations au plus par sauvegarde. */
        if (err.statut !== 409 || recuperations >= 2) throw err;
        inconnues = (await restaurer({ progres })).inconnues || []; recuperations++;
      }
    }
  }

  /* `siChange` (synchronisation automatique) : si le cloud est à la version que cet appareil
     a déjà vue, on s'arrête là — pas d'import, pas de calcul d'empreintes. */
  async function restaurer({ progres, siChange = false } = {}) {
    let g;
    try { g = await api('GET', '/garage', { delai: DELAI_LOURD_MS }); }
    catch (err) {
      if (err.statut !== 404) throw err;
      // Rien au cloud : la prochaine sauvegarde sera la première.
      const e = lireEtat(); delete e.empreinteCloud; ecrireEtat({ ...e, version: 0, ids: [] });
      return { rien: true, inconnues: [] };
    }
    const connu = lireEtat();
    if (siChange && g && g.version === connu.version && Array.isArray(connu.ids) && connu.empreinteCloud) return { inchange: true, version: g.version, inconnues: [] };
    /* Le contenu du cloud n'est pas plus digne de confiance qu'un fichier reçu :
       une entrée nulle ou des « photos » qui ne sont pas une liste faisaient
       planter la récupération sur un message technique. */
    const cloud = g && g.donnees && typeof g.donnees === 'object' && !Array.isArray(g.donnees) ? g.donnees : {};
    const spotsCloud = (Array.isArray(cloud.spots) ? cloud.spots : []).filter(s => s && typeof s === 'object' && !Array.isArray(s));
    const empreintesDe = (s) => (Array.isArray(s.photos) ? s.photos : []).filter(h => typeof h === 'string' && RE_EMPREINTE.test(h));
    // Photos déjà présentes sur l'appareil : on ne les retélécharge pas.
    const locales = new Map();
    for (const s of (global.GMGarage.exporter().spots || [])) for (const p of (s.photos || [])) {
      const h = await empreintePhoto(p); if (h) locales.set(h, p);
    }
    const toutes = [...new Set(spotsCloud.flatMap(empreintesDe))];
    const aTelecharger = toutes.filter(h => !locales.has(h));
    let faites = 0, echecs = 0, sansPhotos = false;
    await enParallele(aTelecharger, CONCURRENCE_PHOTOS, async (h) => {
      if (sansPhotos) return;                        // serveur sans photos : inutile d'insister
      try {
        const r = await api('GET', `/photos/${h}`, { reponseBrute: true, delai: DELAI_LOURD_MS });
        // L'empreinte garantit les octets, pas l'en-tête : type en liste blanche.
        const type = r.type.split(';')[0].trim().toLowerCase();
        if (!TYPES_PHOTO.has(type)) return;
        // Contrôle d'intégrité : le contenu doit correspondre à son empreinte.
        if (await empreinte(r.octets) === h) { const d = octetsVersDataUrl(r.octets, type); locales.set(h, d); memoEmpreintes.set(d, h); }
      } catch (err) {
        /* 404 : la photo n'existe plus au cloud, il n'y a rien à perdre en
           l'ignorant. Toute AUTRE erreur (réseau, serveur) est passagère : on
           interrompt tout, sinon la sauvegarde suivante — automatique après un
           conflit — réécrirait le garage cloud SANS cette photo, qui serait
           perdue alors qu'elle existe (trouvé par /code-review). */
        /* 501 : ce serveur ne garde AUCUNE photo. Rien n'existe au cloud, donc
           rien ne peut se perdre : ce n'est pas un échec, on continue sans. */
        if (err && err.statut === SANS_PHOTOS) { sansPhotos = true; return; }
        if (!err || err.statut !== 404) echecs++;
      }
      progres && progres({ etape: 'photos', faites: ++faites, total: aTelecharger.length });
    });
    if (echecs) throw new ErreurCompte(`${echecs} photo${echecs > 1 ? 's' : ''} n'${echecs > 1 ? 'ont' : 'a'} pas pu être téléchargée${echecs > 1 ? 's' : ''} : rien n'a été modifié, réessaie`, 0);
    const donnees = { ...cloud, spots: spotsCloud.map(s => ({ ...s, photos: empreintesDe(s).map(h => locales.get(h)).filter(Boolean) })) };
    /* SILENCIEUX : ces écritures viennent du cloud, elles ne sont pas des gestes à renvoyer.
       Sans cela, deux téléphones se renvoyaient la balle sans fin (récupérer → sauvegarder
       → l'autre récupère → sauvegarde…), dès que leurs données locales différaient même d'un
       détail que la fusion garde de chaque côté (défis du jour, équipage). */
    const r = await global.GMGarage.importer(donnees, { fusion: true, silencieux: true });
    /* Ce que l'app n'a PAS repris alors que rien ne l'explique (ni retrait
       volontaire, ni doublon fusionné) : un modèle que cette version ne connaît
       pas. Gardé tel quel — photos en empreintes — pour être renvoyé à la
       prochaine sauvegarde. Seuls les identifiants de forme « catalogue » sont
       retenus : une entrée fantaisiste n'est pas conservée indéfiniment. */
    const apres = global.GMGarage.exporter(), ici = idsDe(apres), tombes = tombesDe(apres);
    const inconnues = spotsCloud.filter(s => typeof s.carId === 'string' && RE_ID_CATALOGUE.test(s.carId) && !ici.has(s.carId) && !tombes[s.carId] && !fusionnee(s.carId))
      .map(s => ({ ...s, photos: empreintesDe(s) }));
    const ids = [...new Set(spotsCloud.map(s => s.carId).filter(id => typeof id === 'string' && (ici.has(id) || RE_ID_CATALOGUE.test(id))))];
    ecrireEtat({ ...lireEtat(), version: g.version, ids, empreinteCloud: await signatureGarage(cloud), ...(aTelecharger.length ? { sansPhotos } : {}) });
    return { voitures: r.n, rejetees: r.rejected, retirees: r.retirees || 0, photosTelechargees: sansPhotos ? 0 : aTelecharger.length, sansPhotos, version: g.version, inconnues };
  }
  const sauvegarderEnSerie = enSerie(sauvegarder), restaurerEnSerie = enSerie(restaurer);

  async function supprimerCompte() {
    const r = await api('DELETE', '/compte');
    viderEtat();
    return r;
  }
  const exporterCompte = () => api('GET', '/compte/export');
  /* F-1 (19/11) : « Se déconnecter » et « Supprimer mon compte » passent eux aussi par la
     file. Touchés pendant une sauvegarde, ils agissaient tout de suite ; la réponse de la
     sauvegarde, arrivée après, réécrivait version et voitures du cloud dans l'état d'un
     appareil déconnecté (ou d'un compte effacé). Ils attendent désormais leur tour. */
  const deconnecterEnSerie = enSerie(deconnecter), supprimerEnSerie = enSerie(supprimerCompte);

  // ------------------------------------------------ synchronisation automatique --
  /* (20/11, décision du propriétaire : « automatique ».) Connecté, l'appareil garde le cloud
     à jour sans bouton :
     · chaque écriture de la collection (signal « gm:collection » d'index.html) note une
       modification en attente — `modif`, persistée : elle survit à la fermeture de l'app —
       puis une sauvegarde part après SYNCHRO_MS de calme ; quitter l'app (onglet masqué)
       l'envoie tout de suite ;
     · à l'ouverture de l'app, au retour sur l'app (au plus toutes les REPOS_MS) et au retour
       du réseau : récupération SI le cloud a changé, puis envoi de ce qui attend ;
     · à la connexion : récupération, puis envoi (le garage de ce téléphone rejoint le cloud).
     Ce qui empêche deux téléphones de se renvoyer la balle : la récupération écrit en
     SILENCE (aucune modification en attente n'en naît), et un envoi identique à ce que le
     cloud contient déjà n'a pas lieu (signature). Tout passe par la même file que les
     boutons : jamais deux opérations entremêlées. Une erreur ne s'affiche pas par-dessus
     l'app : la ligne d'état du panneau la dit, et l'essai suivant repart (réseau revenu,
     retour sur l'app, prochain geste, ou relance espacée de 30 s à 15 min, pour un envoi
     comme pour une récupération). Le silence est porté par chaque écriture de la
     récupération (index.html, `Store.put(v, muet)`) : un geste du joueur fait pendant
     qu'elle écrit reste signalé, donc envoyé (relecture du 21/11). */
  let synchroEnCours = false, synchroPrevue = null, minuterieSynchro = null, relances = 0, derniereVerification = 0;
  let recupererAussi = false, sauverAussi = false;
  const garagePret = () => !!(global.GMGarage && typeof global.GMGarage.pret === 'function' && global.GMGarage.pret());
  // index.html ancien (encore en cache) : ni signal, ni « prêt » → pas de synchronisation automatique.
  const synchroPossible = () => !!(global.GMGarage && typeof global.GMGarage.pret === 'function');
  const synchroActive = () => { const e = lireEtat(); return !!(base && e.session && synchroVoulue(e)); };

  function planifierSynchro(ms, options) {
    clearTimeout(minuterieSynchro);
    minuterieSynchro = setTimeout(() => { minuterieSynchro = null; synchroniser(options).catch(() => {}); }, ms);
  }
  function surModification() {
    const e = lireEtat();
    if (!base || !e.session) return;          // hors connexion : la connexion récupérera puis enverra tout
    ecrireEtat({ ...e, modif: (Number(e.modif) || 0) + 1 });
    majStatutSynchro();
    if (synchroVoulue(e)) planifierSynchro(SYNCHRO_MS);
  }
  /* Une seule synchronisation en file à la fois : les demandes qui arrivent avant son tour
     s'y ajoutent (récupérer et/ou envoyer) au lieu de s'empiler. */
  function synchroniser({ recuperer = false, sauver = false } = {}) {
    recupererAussi = recupererAussi || recuperer; sauverAussi = sauverAussi || sauver;
    if (synchroPrevue) return synchroPrevue;
    const p = enSerie(async () => {
      synchroPrevue = null;
      const rec = recupererAussi, sv = sauverAussi; recupererAussi = sauverAussi = false;
      if (!synchroActive() || !garagePret()) return { inactive: true };
      synchroEnCours = true; majStatutSynchro();
      try {
        const r = {};
        if (rec) { derniereVerification = Date.now(); r.recuperation = await restaurer({ siChange: true }); }
        if (sv || lireEtat().modif) r.sauvegarde = await sauvegarder({ auto: true });
        const e = lireEtat(); delete e.erreurSynchro;
        ecrireEtat({ ...e, derniereSynchro: new Date().toISOString() });
        relances = 0;
        return r;
      } catch (err) {
        if (lireEtat().session) {
          ecrireEtat({ ...lireEtat(), erreurSynchro: (err && err.message) || 'Erreur' });
          /* Relance espacée si quelque chose reste à faire : un envoi en attente, OU une
             récupération qui a échoué (sinon, app restée au premier plan, les nouveautés de
             l'autre appareil n'arrivaient qu'au prochain retour sur l'app — relecture du 21/11). */
          if (lireEtat().modif || rec) planifierSynchro(Math.min(RELANCE_MAX_MS, RELANCE_MS * 2 ** relances++), { recuperer: rec });
        }
        throw err;
      } finally {
        synchroEnCours = false; majStatutSynchro();
        // Session expirée (401) : le panneau repasse en « se connecter », et le dit.
        if (!lireEtat().session) { message = 'Session expirée : reconnecte-toi pour reprendre la synchronisation.'; actionMessage = null; rafraichir(); }
      }
    })();
    synchroPrevue = p;
    return p;
  }
  function apresConnexion() {
    if (synchroActive() && garagePret()) synchroniser({ recuperer: true, sauver: true }).catch(() => {});
  }
  function installerSynchro() {
    global.addEventListener('gm:collection', surModification);
    const demarrer = () => { if (synchroActive()) synchroniser({ recuperer: true }).catch(() => {}); };
    global.addEventListener('gm:pret', demarrer);
    if (garagePret()) demarrer();
    document.addEventListener('visibilitychange', () => {
      if (!synchroActive() || !garagePret()) return;
      if (document.visibilityState === 'hidden') {
        // L'app passe en arrière-plan (et sera peut-être fermée) : ce qui attend part maintenant.
        if (lireEtat().modif) { clearTimeout(minuterieSynchro); synchroniser().catch(() => {}); }
      } else if (Date.now() - derniereVerification >= REPOS_MS) synchroniser({ recuperer: true }).catch(() => {});
    });
    global.addEventListener('online', () => { if (synchroActive() && garagePret()) synchroniser({ recuperer: true }).catch(() => {}); });
  }
  /* En-tête de session pour le relais IA (quota du compte). index.html ne
     l'envoie qu'au relais officiel, jamais à un relais personnalisé. */
  const enteteAuth = () => { const e = lireEtat(); return base && e.session ? { Authorization: `Bearer ${e.session}` } : {}; };

  // --------------------------------------------- panneau dans Réglages --
  /* Greffé sous le panneau « Sauvegarde », comme les autres modules gm-* :
     aucun changement de structure dans index.html. N'apparaît QUE si le
     module est configuré. Réutilise les classes existantes (panel, srow, btn). */
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let message = '';
  let actionMessage = null;     // ligne du dernier bouton touché : le message s'affiche juste dessous (F-9)
  const CHAMP = 'flex:1;min-width:0;background:var(--bg);border:1px solid var(--line);border-radius:9px;color:var(--fg);padding:10px 12px;font:400 14px var(--sans)';

  /* Ligne d'état de la synchronisation : mise à jour SUR PLACE (texte seul). Redessiner le
     panneau à chaque envoi en arrière-plan ferait sauter l'écran sous le doigt du joueur. */
  const quand = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };
  function texteSynchro() {
    const e = etat();
    if (!e.synchroAuto) return 'Désactivée : rien ne part sans « Sauvegarder »';
    if (e.synchroEnCours) return 'Synchronisation…';
    if (e.erreurSynchro) return `Pas encore à jour (${e.erreurSynchro}) — nouvel essai automatique`;
    if (e.aEnvoyer) return 'Modification en attente d\'envoi…';
    return e.derniereSynchro ? `Activée · à jour (${quand(e.derniereSynchro)})` : 'Activée : chaque prise part dans le cloud toute seule';
  }
  function majStatutSynchro() { const s = document.getElementById('gcp-sync'); if (s) s.textContent = texteSynchro(); }

  function panneauHTML() {
    const e = etat();
    const corps = e.connecte ? `
          <div class="srow"><div class="l"><b>Connecté</b><span>${esc(e.email)}${e.derniereSauvegarde ? ` · dernière sauvegarde le ${esc(new Date(e.derniereSauvegarde).toLocaleString('fr-FR'))}` : ''}</span></div><button class="btn" data-gcp="deconnecter">Se déconnecter</button></div>${synchroPossible() ? `
          <div class="srow"><div class="l"><b>Synchronisation automatique</b><span id="gcp-sync">${esc(texteSynchro())}</span></div><button class="btn" data-gcp="auto" aria-pressed="${e.synchroAuto}">${e.synchroAuto ? 'Désactiver' : 'Activer'}</button></div>` : ''}
          <div class="srow"><div class="l"><b>Sauvegarder dans le cloud</b><span>${e.sansPhotos ? 'Collection seule, retrouvable sur tous tes appareils : ce serveur ne garde pas les photos, elles restent sur ce téléphone' : e.photosInconnues ? 'Ta collection, retrouvable sur tous tes appareils' : 'Collection et photos, retrouvables sur tous tes appareils'}</span></div><button class="btn red" data-gcp="sauvegarder">Sauvegarder</button></div>
          <div class="srow"><div class="l"><b>Récupérer mon garage</b><span>Ajoute ici ce qui est sauvé dans le cloud, sans rien effacer</span></div><button class="btn" data-gcp="restaurer">Récupérer</button></div>
          <div class="srow"><div class="l"><b>Supprimer mon compte</b><span>Efface ton compte et tout ce qui est sauvé dans le cloud (ce téléphone garde son garage)</span></div><button class="btn red ghost" data-gcp="supprimer">Supprimer</button></div>` : e.codeEnvoyeA ? `
          <div class="srow"><div class="l"><b>Code envoyé</b><span>à ${esc(e.codeEnvoyeA)} — valable 10 minutes</span></div><button class="btn" data-gcp="changer">Changer d'adresse</button></div>
          <div class="srow"><input id="gcp-code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="7" placeholder="123456" aria-label="Code reçu par e-mail" style="${CHAMP};letter-spacing:.3em"><button class="btn red" data-gcp="valider">Valider</button></div>` : `
          <div class="srow"><div class="l"><b>Retrouver ton garage partout</b><span>${e.google ? 'Avec ton compte Google, ou un code reçu par e-mail' : 'Reçois un code par e-mail'} — pas de mot de passe</span></div></div>${e.google ? `
          <div class="srow"><div id="gcp-google" style="flex:1;min-width:0;min-height:44px;display:flex;justify-content:center;align-items:center"></div></div>` : ''}
          <div class="srow"><input id="gcp-email" type="email" inputmode="email" autocomplete="email" placeholder="ton@email.fr" aria-label="Adresse e-mail" style="${CHAMP}"><button class="btn red" data-gcp="code">Recevoir un code</button></div>`;
    return `
      <div class="section panel" id="gcp-compte">
        <div class="h2" style="margin-bottom:6px">Compte</div>
        <div class="rows">${corps}</div>
        <p class="dim" id="gcp-msg" role="status" aria-live="polite" style="font:400 12px/1.5 var(--sans);margin:8px 0 0;min-height:1em">${esc(message)}</p>
      </div>`;
  }

  function greffer() {
    if (!base) return;
    const imp = document.querySelector('#view [data-act="import"]');
    if (!imp) return;
    const ancien = document.getElementById('gcp-compte');
    const panneau = imp.closest('.panel');
    if (!panneau) return;
    if (ancien) { if (ancien.previousElementSibling === panneau) return; ancien.remove(); }
    panneau.insertAdjacentHTML('afterend', panneauHTML());
    placerMessage();
    if (document.getElementById('gcp-google')) monterBoutonGoogle();
  }

  /* Script de Google chargé UNE fois, à la première ouverture du panneau ; un
     échec (hors ligne, bloqueur) permet un nouvel essai à l'ouverture suivante.
     Le code par e-mail reste toujours proposé : Google n'est jamais le seul chemin. */
  let chargementGoogle = null;
  function chargerGoogle() {
    if (!chargementGoogle) {
      chargementGoogle = new Promise((ok, ko) => {
        const s = document.createElement('script');
        s.src = SCRIPT_GOOGLE; s.async = true;
        s.onload = () => { const id = global.google && global.google.accounts && global.google.accounts.id; id ? ok(id) : ko(new Error('script-google')); };
        s.onerror = () => ko(new Error('script-google'));
        document.head.appendChild(s);
      }).then((id) => {
        id.initialize({ client_id: idGoogle, callback: surReponseGoogle, auto_select: false, cancel_on_tap_outside: true,
          context: 'signin', ux_mode: 'popup', itp_support: true });
        return id;
      });
      chargementGoogle.catch(() => { chargementGoogle = null; });
    }
    return chargementGoogle;
  }
  async function monterBoutonGoogle() {
    const zone = document.getElementById('gcp-google');
    if (!zone || zone.dataset.monte) return;
    zone.dataset.monte = '1';
    try {
      const id = await chargerGoogle();
      if (!zone.isConnected) return;                 // panneau redessiné entre-temps : le nouveau monte son bouton
      id.renderButton(zone, { type: 'standard', theme: 'filled_black', size: 'large', text: 'continue_with', shape: 'pill',
        logo_alignment: 'left', locale: 'fr', width: Math.max(200, Math.min(400, zone.clientWidth || 300)) });
    } catch (_) {
      if (zone.isConnected) zone.closest('.srow').remove();
      dire('Connexion Google indisponible pour l\'instant : utilise le code par e-mail.');
    }
  }
  async function surReponseGoogle(reponse) {
    actionMessage = null;                             // bouton de Google : message sous la première ligne
    try {
      dire('Connexion avec Google…');
      await connecterGoogle(reponse && reponse.credential);
      message = 'Connecté ✓'; rafraichir();
    } catch (err) {
      dire(err && err.message ? err.message : 'Connexion Google impossible');
    }
  }
  function rafraichir() { const p = document.getElementById('gcp-compte'); if (p) { p.remove(); } greffer(); montrerMessage(); }
  function dire(t) { message = t; const m = document.getElementById('gcp-msg'); if (m) { m.textContent = t; placerMessage(); montrerMessage(); } }
  /* F-9 (19/11, constaté en production : « Sauvegarder ne me dit rien »). Le message vivait
     en BAS du panneau, sous « Supprimer mon compte » : hors de l'écran, et derrière le
     bandeau partenaire fixé en bas. Il se place désormais sous la ligne du bouton touché
     (sinon sous la première ligne : après une connexion, la ligne touchée n'existe plus),
     et s'il est malgré tout recouvert ou hors de l'écran, il y est ramené. Le test est
     « ce point de l'écran montre-t-il le message ? » : il vaut quels que soient la barre
     d'onglets, le bandeau ou la taille de l'écran. */
  function placerMessage() {
    const m = document.getElementById('gcp-msg'), p = document.getElementById('gcp-compte');
    if (!m || !p) return;
    const b = actionMessage && p.querySelector(`[data-gcp="${actionMessage}"]`);
    const ligne = (b && b.closest('.srow')) || p.querySelector('.srow');
    if (ligne && ligne.nextElementSibling !== m) ligne.insertAdjacentElement('afterend', m);
  }
  function montrerMessage() {
    const m = document.getElementById('gcp-msg');
    if (!m || !m.textContent.trim()) return;
    const r = m.getBoundingClientRect();
    const x = r.left + Math.min(r.width / 2, 40), y = r.top + r.height / 2;
    const dessus = r.height > 0 && y > 0 && y < innerHeight ? document.elementFromPoint(x, y) : null;
    if (!(dessus && (dessus === m || m.contains(dessus)))) m.scrollIntoView({ block: 'center' });
  }

  async function surClic(ev) {
    const b = ev.target.closest('[data-gcp]'); if (!b) return;
    ev.preventDefault();
    const action = b.dataset.gcp;
    actionMessage = action;
    b.disabled = true;
    try {
      if (action === 'code') {
        const email = (document.getElementById('gcp-email')?.value || '').trim();
        if (!/^\S+@\S+\.\S+$/.test(email)) { dire('Adresse e-mail invalide'); return; }
        await demanderCode(email);
        message = 'Regarde ta boîte mail (et les indésirables).'; rafraichir();
        document.getElementById('gcp-code')?.focus();
      } else if (action === 'valider') {
        const code = (document.getElementById('gcp-code')?.value || '').replace(/\s/g, '');
        if (!/^\d{6}$/.test(code)) { dire('Le code fait 6 chiffres'); return; }
        await verifierCode(code);
        message = 'Connecté ✓'; rafraichir();
      } else if (action === 'changer') {
        annulerCode(); message = ''; rafraichir();
      } else if (action === 'auto') {
        const active = !etat().synchroAuto;
        ecrireEtat({ ...lireEtat(), synchroAuto: active });
        if (!active) clearTimeout(minuterieSynchro);
        message = active ? 'Synchronisation automatique activée : ce qui attendait part maintenant.' : 'Synchronisation automatique désactivée : utilise « Sauvegarder » et « Récupérer ».';
        rafraichir();
        // Réactivée : on rattrape ce qui a changé des deux côtés pendant la pause.
        if (active) synchroniser({ recuperer: true }).catch(() => {});
      } else if (action === 'sauvegarder') {
        dire('Sauvegarde en cours…');
        const r = await sauvegarderEnSerie({ progres: p => dire(`Envoi des photos : ${p.faites}/${p.total}`) });
        message = (r.photosNonSauvegardees
          ? `Sauvegardé : ${r.voitures} voiture${r.voitures > 1 ? 's' : ''}, sans les photos (ce serveur ne les garde pas : elles restent sur ce téléphone).`
          : `Sauvegardé : ${r.voitures} voiture${r.voitures > 1 ? 's' : ''}, ${r.photosEnvoyees} nouvelle${r.photosEnvoyees > 1 ? 's' : ''} photo${r.photosEnvoyees > 1 ? 's' : ''}.`)
          + (r.recuperees ? ` ${r.recuperees} voiture${r.recuperees > 1 ? 's' : ''} récupérée${r.recuperees > 1 ? 's' : ''} du cloud au passage.` : '');
        rafraichir();
      } else if (action === 'restaurer') {
        dire('Récupération en cours…');
        const r = await restaurerEnSerie({ progres: p => dire(`Photos : ${p.faites}/${p.total}`) });
        message = r.rien ? 'Rien n\'est encore sauvé dans le cloud.' : `Récupéré : ${r.voitures} voiture${r.voitures > 1 ? 's' : ''}${r.retirees ? ` · ${r.retirees} retirée${r.retirees > 1 ? 's' : ''} sur un autre appareil` : ''}${r.sansPhotos ? ', sans les photos (ce serveur ne les garde pas)' : ''}.`;
        rafraichir();
      } else if (action === 'deconnecter') {
        dire('Déconnexion…');
        await deconnecterEnSerie(); message = 'Déconnecté.'; rafraichir();
      } else if (action === 'supprimer') {
        if (!global.confirm('Supprimer ton compte et tout ce qui est sauvé dans le cloud ? Ce téléphone garde son garage. Irréversible.')) return;
        dire('Suppression du compte…');
        await supprimerEnSerie(); message = 'Compte supprimé.'; rafraichir();
      }
    } catch (err) {
      dire(err && err.message ? err.message : 'Erreur');
      if (err && err.statut === 401) rafraichir();
    } finally { b.disabled = false; }
  }

  function installer() {
    if (!base) return;                                // en sommeil : rien du tout
    document.addEventListener('click', surClic);
    const vue = document.getElementById('view');
    if (vue) new MutationObserver(() => { try { greffer(); } catch (_) {} }).observe(vue, { childList: true, subtree: true });
    // Entrée au clavier = le bouton de la ligne (champ e-mail → code, champ code → valider).
    document.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter') return;
      const cible = ev.target && ev.target.id === 'gcp-email' ? 'code' : ev.target && ev.target.id === 'gcp-code' ? 'valider' : null;
      if (cible) { ev.preventDefault(); document.querySelector(`[data-gcp="${cible}"]`)?.click(); }
    });
    installerSynchro();
    greffer();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installer); else installer();

  global.GMCompte = Object.freeze({
    VERSION: VERSION_COMPTE, etat, demanderCode, verifierCode, connecterGoogle, annulerCode, deconnecter: deconnecterEnSerie, enteteAuth,
    sauvegarder: sauvegarderEnSerie, restaurer: restaurerEnSerie, supprimerCompte: supprimerEnSerie, exporterCompte,
    // Synchronisation automatique à la demande (bancs, future app native) : même file, mêmes règles.
    synchroniser: (options) => synchroniser(options),
  });
})(window);
