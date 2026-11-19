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
   ====================================================================== */
(function (global) {
  'use strict';

  const VERSION_COMPTE = '2.6.0';

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

  // ------------------------------------------------------------ état ----
  const lireEtat = () => { try { return JSON.parse(localStorage.getItem(CLE)) || {}; } catch (_) { return {}; } };
  const ecrireEtat = (e) => { try { localStorage.setItem(CLE, JSON.stringify(e)); } catch (_) {} };
  const oublierSession = () => { const e = lireEtat(); delete e.session; delete e.version; delete e.ids; ecrireEtat(e); };

  const DUREE_CODE_MS = 10 * 60 * 1000;               // = serveur
  function etat() {
    const e = lireEtat();
    const enAttente = !e.session && e.emailEnAttente && Date.now() - (e.codeDemande || 0) < DUREE_CODE_MS ? e.emailEnAttente : null;
    return { configure: !!base, connecte: !!(base && e.session), email: e.email || null, codeEnvoyeA: enAttente, google: !!(base && idGoogle),
             version: e.version || 0, derniereSauvegarde: e.derniere || null, sansPhotos: !!e.sansPhotos,
             /* F-8 (19/11) : tant qu'aucune sauvegarde n'a eu lieu, l'app ne SAIT pas si le
                serveur garde les photos — le panneau ne doit rien promettre. */
             photosInconnues: typeof e.sansPhotos !== 'boolean' };
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
    ecrireEtat({ ...lireEtat(), session: r.session, email: r.email, emailEnAttente: undefined, codeDemande: undefined, version: 0, ids: undefined });
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
    ecrireEtat({ ...lireEtat(), session: r.session, email: r.email, emailEnAttente: undefined, codeDemande: undefined, version: 0, ids: undefined });
    return true;
  }

  async function deconnecter() {
    try { await api('POST', '/auth/deconnexion'); } catch (_) {}
    ecrireEtat({});
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

  async function sauvegarder({ progres } = {}) {
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
      const connu = lireEtat(), versionConnue = connu.version || 0;
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
          const o = dataUrlVersOctets(p); if (!o) continue;
          const h = await empreinte(o.octets);
          photos.set(h, p); emp.push(h);
        }
        spots.push({ ...s, photos: emp });
      }
      /* Voitures du cloud que CETTE version de l'app ne sait pas lire (modèle
         ajouté par une version plus récente) : renvoyées telles quelles. Sans
         cela, un appareil en retard d'une mise à jour les effaçait pour tous. */
      const ici = new Set(spots.map(s => s.carId));
      for (const s of inconnues) if (!ici.has(s.carId)) { spots.push(s); ici.add(s.carId); }
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
        const r = await api('PUT', '/garage', { corps: { donnees: { ...donnees, spots } }, entetes: { 'If-Match': String(versionConnue) }, delai: DELAI_LOURD_MS });
        ecrireEtat({ ...lireEtat(), version: r.version, ids: spots.map(s => s.carId), derniere: new Date().toISOString() });
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

  async function restaurer({ progres } = {}) {
    let g;
    try { g = await api('GET', '/garage', { delai: DELAI_LOURD_MS }); }
    catch (err) {
      if (err.statut !== 404) throw err;
      ecrireEtat({ ...lireEtat(), version: 0, ids: [] });   // rien au cloud : la prochaine sauvegarde sera la première
      return { rien: true, inconnues: [] };
    }
    /* Le contenu du cloud n'est pas plus digne de confiance qu'un fichier reçu :
       une entrée nulle ou des « photos » qui ne sont pas une liste faisaient
       planter la récupération sur un message technique. */
    const cloud = g && g.donnees && typeof g.donnees === 'object' && !Array.isArray(g.donnees) ? g.donnees : {};
    const spotsCloud = (Array.isArray(cloud.spots) ? cloud.spots : []).filter(s => s && typeof s === 'object' && !Array.isArray(s));
    const empreintesDe = (s) => (Array.isArray(s.photos) ? s.photos : []).filter(h => typeof h === 'string' && RE_EMPREINTE.test(h));
    // Photos déjà présentes sur l'appareil : on ne les retélécharge pas.
    const locales = new Map();
    for (const s of (global.GMGarage.exporter().spots || [])) for (const p of (s.photos || [])) {
      const o = dataUrlVersOctets(p); if (o) locales.set(await empreinte(o.octets), p);
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
        if (await empreinte(r.octets) === h) locales.set(h, octetsVersDataUrl(r.octets, type));
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
    const r = await global.GMGarage.importer(donnees, { fusion: true });
    /* Ce que l'app n'a PAS repris alors que rien ne l'explique (ni retrait
       volontaire, ni doublon fusionné) : un modèle que cette version ne connaît
       pas. Gardé tel quel — photos en empreintes — pour être renvoyé à la
       prochaine sauvegarde. Seuls les identifiants de forme « catalogue » sont
       retenus : une entrée fantaisiste n'est pas conservée indéfiniment. */
    const apres = global.GMGarage.exporter(), ici = idsDe(apres), tombes = tombesDe(apres);
    const inconnues = spotsCloud.filter(s => typeof s.carId === 'string' && RE_ID_CATALOGUE.test(s.carId) && !ici.has(s.carId) && !tombes[s.carId] && !fusionnee(s.carId))
      .map(s => ({ ...s, photos: empreintesDe(s) }));
    const ids = [...new Set(spotsCloud.map(s => s.carId).filter(id => typeof id === 'string' && (ici.has(id) || RE_ID_CATALOGUE.test(id))))];
    ecrireEtat({ ...lireEtat(), version: g.version, ids, ...(aTelecharger.length ? { sansPhotos } : {}) });
    return { voitures: r.n, rejetees: r.rejected, retirees: r.retirees || 0, photosTelechargees: sansPhotos ? 0 : aTelecharger.length, sansPhotos, version: g.version, inconnues };
  }
  const sauvegarderEnSerie = enSerie(sauvegarder), restaurerEnSerie = enSerie(restaurer);

  async function supprimerCompte() {
    const r = await api('DELETE', '/compte');
    ecrireEtat({});
    return r;
  }
  const exporterCompte = () => api('GET', '/compte/export');
  /* F-1 (19/11) : « Se déconnecter » et « Supprimer mon compte » passent eux aussi par la
     file. Touchés pendant une sauvegarde, ils agissaient tout de suite ; la réponse de la
     sauvegarde, arrivée après, réécrivait version et voitures du cloud dans l'état d'un
     appareil déconnecté (ou d'un compte effacé). Ils attendent désormais leur tour. */
  const deconnecterEnSerie = enSerie(deconnecter), supprimerEnSerie = enSerie(supprimerCompte);
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

  function panneauHTML() {
    const e = etat();
    const corps = e.connecte ? `
          <div class="srow"><div class="l"><b>Connecté</b><span>${esc(e.email)}${e.derniereSauvegarde ? ` · dernière sauvegarde le ${esc(new Date(e.derniereSauvegarde).toLocaleString('fr-FR'))}` : ''}</span></div><button class="btn" data-gcp="deconnecter">Se déconnecter</button></div>
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
    greffer();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installer); else installer();

  global.GMCompte = Object.freeze({
    VERSION: VERSION_COMPTE, etat, demanderCode, verifierCode, connecterGoogle, annulerCode, deconnecter: deconnecterEnSerie, enteteAuth,
    sauvegarder: sauvegarderEnSerie, restaurer: restaurerEnSerie, supprimerCompte: supprimerEnSerie, exporterCompte,
  });
})(window);
