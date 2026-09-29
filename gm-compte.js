/* ======================================================================
   gm-compte.js — compte par e-mail et sauvegarde cloud du garage
   ----------------------------------------------------------------------
   POURQUOI
   La collection vit dans IndexedDB : dans UN appareil. Ce module la sauve
   sur le serveur de comptes (cloud/compte-worker.js) et la restaure sur
   n'importe quel autre appareil, connecté par un lien reçu par e-mail.

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
   · Le jeton de session est gardé dans localStorage : c'est une préférence
     d'appareil, pas une donnée de collection (la collection reste en
     IndexedDB, CLAUDE.md §1.4).
   ====================================================================== */
(function (global) {
  'use strict';

  const VERSION_COMPTE = '1.0.0';

  /* Adresse du Worker de comptes, SANS « / » final.
     Ex. 'https://garage-comptes.<ton-compte>.workers.dev'. Vide = en sommeil.
     `window.GM_COMPTE_URL`, posé avant le chargement, prend le pas : c'est le
     point d'entrée des bancs (banc-compte-navigateur.js). */
  const COMPTE_URL = '';
  let base = String(global.GM_COMPTE_URL || COMPTE_URL || '').replace(/\/+$/, '');

  const CLE = 'gm-compte';
  const CONCURRENCE_PHOTOS = 3;

  // ------------------------------------------------------------ état ----
  const lireEtat = () => { try { return JSON.parse(localStorage.getItem(CLE)) || {}; } catch (_) { return {}; } };
  const ecrireEtat = (e) => { try { localStorage.setItem(CLE, JSON.stringify(e)); } catch (_) {} };
  const oublierSession = () => { const e = lireEtat(); delete e.session; delete e.version; ecrireEtat(e); };

  function etat() {
    const e = lireEtat();
    return { configure: !!base, connecte: !!(base && e.session), email: e.email || null,
             version: e.version || 0, derniereSauvegarde: e.derniere || null };
  }

  // ------------------------------------------------------------- réseau --
  class ErreurCompte extends Error { constructor(m, statut, corps) { super(m); this.statut = statut; this.corps = corps; } }

  async function api(methode, chemin, { corps, brut, type, entetes = {}, reponseBrute = false } = {}) {
    if (!base) throw new ErreurCompte('Compte non configuré', 0);
    const e = lireEtat();
    const h = { ...entetes };
    if (e.session) h.Authorization = `Bearer ${e.session}`;
    if (corps !== undefined) h['Content-Type'] = 'application/json';
    if (type) h['Content-Type'] = type;
    let r;
    try {
      r = await fetch(base + chemin, { method: methode, headers: h, body: brut !== undefined ? brut : corps !== undefined ? JSON.stringify(corps) : undefined });
    } catch (_) { throw new ErreurCompte('Pas de connexion au serveur', 0); }
    if (r.status === 401) oublierSession();
    if (reponseBrute && r.ok) return r;
    const texte = await r.text();
    let json = null; try { json = texte ? JSON.parse(texte) : null; } catch (_) {}
    if (!r.ok) throw new ErreurCompte((json && json.erreur) || `Erreur ${r.status}`, r.status, json);
    return json;
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
  async function demanderLien(email) {
    await api('POST', '/auth/lien', { corps: { email } });
    const e = lireEtat(); e.emailEnAttente = String(email).trim().toLowerCase(); ecrireEtat(e);
    return true;
  }

  /* Le lien reçu ouvre l'app avec #connexion=<jeton>. Le fragment n'est jamais
     envoyé au serveur qui sert la page : il ne finit dans aucun journal. On le
     retire de la barre d'adresse dès qu'il est lu. */
  async function finaliserConnexion() {
    const m = /[#&]connexion=([A-Za-z0-9_-]{20,100})/.exec(global.location.hash || '');
    if (!m || !base) return false;
    try { history.replaceState(null, '', global.location.pathname + global.location.search); } catch (_) {}
    const e = lireEtat();
    const r = await api('POST', '/auth/session', { corps: { jeton: m[1] } });
    /* Parade au « login CSRF » : un lien piégé portant le jeton d'un TIERS
       connecterait l'appareil au compte de ce tiers, et la sauvegarde suivante
       lui livrerait le garage. Si l'adresse obtenue n'est pas celle demandée
       ici, on la montre et on demande confirmation ; refus → session révoquée. */
    if (r.email !== e.emailEnAttente &&
        !global.confirm(`Te connecter au compte ${r.email} ? Ta collection y sera sauvegardée.`)) {
      await fetch(base + '/auth/deconnexion', { method: 'POST', headers: { Authorization: `Bearer ${r.session}` } }).catch(() => {});
      throw new ErreurCompte('Connexion annulée', 0);
    }
    ecrireEtat({ ...e, session: r.session, email: r.email, emailEnAttente: undefined, version: 0 });
    return true;
  }

  async function deconnecter() {
    try { await api('POST', '/auth/deconnexion'); } catch (_) {}
    ecrireEtat({});
  }

  // ------------------------------------------------ sauvegarde / restauration --
  async function sauvegarder({ progres } = {}, _deuxiemeEssai = false) {
    if (!global.GMGarage) throw new ErreurCompte('Application pas encore prête', 0);
    const donnees = global.GMGarage.exporter();
    const photos = new Map();                        // empreinte → { type, octets }
    const spots = [];
    for (const s of donnees.spots || []) {
      const emp = [];
      for (const p of (s.photos || [])) {
        const o = dataUrlVersOctets(p); if (!o) continue;
        const h = await empreinte(o.octets);
        photos.set(h, o); emp.push(h);
      }
      spots.push({ ...s, photos: emp });
    }
    const { manquantes } = await api('POST', '/photos/manquantes', { corps: { empreintes: [...photos.keys()] } });
    let faites = 0;
    await enParallele(manquantes, CONCURRENCE_PHOTOS, async (h) => {
      const o = photos.get(h);
      await api('PUT', `/photos/${h}`, { brut: o.octets, type: o.type });
      progres && progres({ etape: 'photos', faites: ++faites, total: manquantes.length });
    });
    const e = lireEtat();
    try {
      const r = await api('PUT', '/garage', { corps: { donnees: { ...donnees, spots } }, entetes: { 'If-Match': String(e.version || 0) } });
      ecrireEtat({ ...lireEtat(), version: r.version, derniere: new Date().toISOString() });
      return { version: r.version, photosEnvoyees: manquantes.length, voitures: spots.length };
    } catch (err) {
      /* 409 : un autre appareil a sauvé entre-temps. On récupère sa version en
         FUSION (le local fait autorité, le cloud apporte ce qui manque), puis
         on renvoie une seule fois. */
      if (err.statut === 409 && !_deuxiemeEssai) {
        await restaurer({ progres });
        return sauvegarder({ progres }, true);
      }
      throw err;
    }
  }

  async function restaurer({ progres } = {}) {
    let g;
    try { g = await api('GET', '/garage'); }
    catch (err) { if (err.statut === 404) return { rien: true }; throw err; }
    // Photos déjà présentes sur l'appareil : on ne les retélécharge pas.
    const locales = new Map();
    for (const s of (global.GMGarage.exporter().spots || [])) for (const p of (s.photos || [])) {
      const o = dataUrlVersOctets(p); if (o) locales.set(await empreinte(o.octets), p);
    }
    const toutes = [...new Set((g.donnees.spots || []).flatMap(s => Array.isArray(s.photos) ? s.photos : []))]
      .filter(h => /^[0-9a-f]{64}$/.test(h));
    const aTelecharger = toutes.filter(h => !locales.has(h));
    let faites = 0;
    await enParallele(aTelecharger, CONCURRENCE_PHOTOS, async (h) => {
      try {
        const r = await api('GET', `/photos/${h}`, { reponseBrute: true });
        // L'empreinte garantit les octets, pas l'en-tête : type en liste blanche.
        const type = (r.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
        if (!TYPES_PHOTO.has(type)) return;
        const octets = new Uint8Array(await r.arrayBuffer());
        // Contrôle d'intégrité : le contenu doit correspondre à son empreinte.
        if (await empreinte(octets) === h) locales.set(h, octetsVersDataUrl(octets, type));
      } catch (_) { /* photo absente : la prise est restaurée sans elle */ }
      progres && progres({ etape: 'photos', faites: ++faites, total: aTelecharger.length });
    });
    const donnees = { ...g.donnees, spots: (g.donnees.spots || []).map(s => ({
      ...s, photos: (Array.isArray(s.photos) ? s.photos : []).map(h => locales.get(h)).filter(Boolean) })) };
    const r = await global.GMGarage.importer(donnees, { fusion: true });
    ecrireEtat({ ...lireEtat(), version: g.version });
    return { voitures: r.n, rejetees: r.rejected, photosTelechargees: aTelecharger.length, version: g.version };
  }

  async function supprimerCompte() {
    const r = await api('DELETE', '/compte');
    ecrireEtat({});
    return r;
  }
  const exporterCompte = () => api('GET', '/compte/export');

  // --------------------------------------------- panneau dans Réglages --
  /* Greffé sous le panneau « Sauvegarde », comme les autres modules gm-* :
     aucun changement de structure dans index.html. N'apparaît QUE si le
     module est configuré. Réutilise les classes existantes (panel, srow, btn). */
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let message = '';

  function panneauHTML() {
    const e = etat();
    const corps = e.connecte ? `
          <div class="srow"><div class="l"><b>Connecté</b><span>${esc(e.email)}${e.derniereSauvegarde ? ` · dernière sauvegarde le ${esc(new Date(e.derniereSauvegarde).toLocaleString('fr-FR'))}` : ''}</span></div><button class="btn" data-gcp="deconnecter">Se déconnecter</button></div>
          <div class="srow"><div class="l"><b>Sauvegarder dans le cloud</b><span>Collection et photos, retrouvables sur tous tes appareils</span></div><button class="btn red" data-gcp="sauvegarder">Sauvegarder</button></div>
          <div class="srow"><div class="l"><b>Récupérer mon garage</b><span>Ajoute ici ce qui est sauvé dans le cloud, sans rien effacer</span></div><button class="btn" data-gcp="restaurer">Récupérer</button></div>
          <div class="srow"><div class="l"><b>Supprimer mon compte</b><span>Efface ton compte et tout ce qui est sauvé dans le cloud (ce téléphone garde son garage)</span></div><button class="btn red ghost" data-gcp="supprimer">Supprimer</button></div>` : `
          <div class="srow"><div class="l"><b>Retrouver ton garage partout</b><span>Reçois un lien de connexion par e-mail — pas de mot de passe</span></div></div>
          <div class="srow"><input id="gcp-email" type="email" inputmode="email" autocomplete="email" placeholder="ton@email.fr" aria-label="Adresse e-mail" style="flex:1;min-width:0;background:var(--bg);border:1px solid var(--line);border-radius:9px;color:var(--fg);padding:10px 12px;font:400 14px var(--sans)"><button class="btn red" data-gcp="lien">Recevoir le lien</button></div>`;
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
  }
  function rafraichir() { const p = document.getElementById('gcp-compte'); if (p) { p.remove(); } greffer(); }
  function dire(t) { message = t; const m = document.getElementById('gcp-msg'); if (m) m.textContent = t; }

  async function surClic(ev) {
    const b = ev.target.closest('[data-gcp]'); if (!b) return;
    ev.preventDefault();
    const action = b.dataset.gcp;
    b.disabled = true;
    try {
      if (action === 'lien') {
        const email = (document.getElementById('gcp-email')?.value || '').trim();
        if (!/^\S+@\S+\.\S+$/.test(email)) { dire('Adresse e-mail invalide'); return; }
        await demanderLien(email);
        dire(`Lien envoyé à ${email} — ouvre-le sur cet appareil (valable 15 min).`);
      } else if (action === 'sauvegarder') {
        dire('Sauvegarde en cours…');
        const r = await sauvegarder({ progres: p => dire(`Envoi des photos : ${p.faites}/${p.total}`) });
        message = `Sauvegardé : ${r.voitures} voiture${r.voitures > 1 ? 's' : ''}, ${r.photosEnvoyees} nouvelle${r.photosEnvoyees > 1 ? 's' : ''} photo${r.photosEnvoyees > 1 ? 's' : ''}.`;
        rafraichir();
      } else if (action === 'restaurer') {
        dire('Récupération en cours…');
        const r = await restaurer({ progres: p => dire(`Photos : ${p.faites}/${p.total}`) });
        message = r.rien ? 'Rien n\'est encore sauvé dans le cloud.' : `Récupéré : ${r.voitures} voiture${r.voitures > 1 ? 's' : ''}.`;
        rafraichir();
      } else if (action === 'deconnecter') {
        await deconnecter(); message = 'Déconnecté.'; rafraichir();
      } else if (action === 'supprimer') {
        if (!global.confirm('Supprimer ton compte et tout ce qui est sauvé dans le cloud ? Ce téléphone garde son garage. Irréversible.')) return;
        await supprimerCompte(); message = 'Compte supprimé.'; rafraichir();
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
    greffer();
    const finaliser = () => finaliserConnexion()
      .then(ok => { if (ok) { message = 'Connecté ✓'; rafraichir(); } })
      .catch(err => { message = err && err.message ? err.message : 'Lien invalide'; rafraichir(); });
    finaliser();
    // Lien ouvert dans un onglet où l'app tourne déjà : seul le fragment change,
    // la page ne se recharge pas — sans cet écouteur, le jeton resterait lettre morte.
    global.addEventListener('hashchange', finaliser);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installer); else installer();

  global.GMCompte = Object.freeze({
    VERSION: VERSION_COMPTE, etat, demanderLien, finaliserConnexion, deconnecter,
    sauvegarder, restaurer, supprimerCompte, exporterCompte,
  });
})(window);
