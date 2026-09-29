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
   · Le jeton de session est gardé dans localStorage : c'est une préférence
     d'appareil, pas une donnée de collection (la collection reste en
     IndexedDB, CLAUDE.md §1.4).
   ====================================================================== */
(function (global) {
  'use strict';

  const VERSION_COMPTE = '2.0.0';

  /* Adresse du Worker de comptes, SANS « / » final.
     Ex. 'https://garage-comptes.<ton-compte>.workers.dev'. Vide = en sommeil.
     `window.GM_COMPTE_URL`, posé avant le chargement, prend le pas : c'est le
     point d'entrée des bancs (banc-compte-navigateur.js). */
  const COMPTE_URL = '';
  let base = String(global.GM_COMPTE_URL || COMPTE_URL || '').replace(/\/+$/, '');

  const CLE = 'gm-compte';
  const CONCURRENCE_PHOTOS = 3;
  const LOT_EMPREINTES = 1000;     // le serveur refuse au-delà de 5 000 par requête : on reste loin

  // ------------------------------------------------------------ état ----
  const lireEtat = () => { try { return JSON.parse(localStorage.getItem(CLE)) || {}; } catch (_) { return {}; } };
  const ecrireEtat = (e) => { try { localStorage.setItem(CLE, JSON.stringify(e)); } catch (_) {} };
  const oublierSession = () => { const e = lireEtat(); delete e.session; delete e.version; ecrireEtat(e); };

  const DUREE_CODE_MS = 10 * 60 * 1000;               // = serveur
  function etat() {
    const e = lireEtat();
    const enAttente = !e.session && e.emailEnAttente && Date.now() - (e.codeDemande || 0) < DUREE_CODE_MS ? e.emailEnAttente : null;
    return { configure: !!base, connecte: !!(base && e.session), email: e.email || null, codeEnvoyeA: enAttente,
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
    ecrireEtat({ ...lireEtat(), session: r.session, email: r.email, emailEnAttente: undefined, codeDemande: undefined, version: 0 });
    return true;
  }
  const annulerCode = () => { const e = lireEtat(); delete e.emailEnAttente; delete e.codeDemande; ecrireEtat(e); };

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
    const toutes = [...photos.keys()], manquantes = [];
    for (let i = 0; i < toutes.length; i += LOT_EMPREINTES) {
      const r = await api('POST', '/photos/manquantes', { corps: { empreintes: toutes.slice(i, i + LOT_EMPREINTES) } });
      manquantes.push(...r.manquantes);
    }
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
    let faites = 0, echecs = 0;
    await enParallele(aTelecharger, CONCURRENCE_PHOTOS, async (h) => {
      try {
        const r = await api('GET', `/photos/${h}`, { reponseBrute: true });
        // L'empreinte garantit les octets, pas l'en-tête : type en liste blanche.
        const type = (r.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
        if (!TYPES_PHOTO.has(type)) return;
        const octets = new Uint8Array(await r.arrayBuffer());
        // Contrôle d'intégrité : le contenu doit correspondre à son empreinte.
        if (await empreinte(octets) === h) locales.set(h, octetsVersDataUrl(octets, type));
      } catch (err) {
        /* 404 : la photo n'existe plus au cloud, il n'y a rien à perdre en
           l'ignorant. Toute AUTRE erreur (réseau, serveur) est passagère : on
           interrompt tout, sinon la sauvegarde suivante — automatique après un
           conflit — réécrirait le garage cloud SANS cette photo, qui serait
           perdue alors qu'elle existe (trouvé par /code-review). */
        if (!err || err.statut !== 404) echecs++;
      }
      progres && progres({ etape: 'photos', faites: ++faites, total: aTelecharger.length });
    });
    if (echecs) throw new ErreurCompte(`${echecs} photo${echecs > 1 ? 's' : ''} n'${echecs > 1 ? 'ont' : 'a'} pas pu être téléchargée${echecs > 1 ? 's' : ''} : rien n'a été modifié, réessaie`, 0);
    const donnees = { ...g.donnees, spots: (g.donnees.spots || []).map(s => ({
      ...s, photos: (Array.isArray(s.photos) ? s.photos : []).map(h => locales.get(h)).filter(Boolean) })) };
    const r = await global.GMGarage.importer(donnees, { fusion: true });
    ecrireEtat({ ...lireEtat(), version: g.version });
    return { voitures: r.n, rejetees: r.rejected, retirees: r.retirees || 0, photosTelechargees: aTelecharger.length, version: g.version };
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
  const CHAMP = 'flex:1;min-width:0;background:var(--bg);border:1px solid var(--line);border-radius:9px;color:var(--fg);padding:10px 12px;font:400 14px var(--sans)';

  function panneauHTML() {
    const e = etat();
    const corps = e.connecte ? `
          <div class="srow"><div class="l"><b>Connecté</b><span>${esc(e.email)}${e.derniereSauvegarde ? ` · dernière sauvegarde le ${esc(new Date(e.derniereSauvegarde).toLocaleString('fr-FR'))}` : ''}</span></div><button class="btn" data-gcp="deconnecter">Se déconnecter</button></div>
          <div class="srow"><div class="l"><b>Sauvegarder dans le cloud</b><span>Collection et photos, retrouvables sur tous tes appareils</span></div><button class="btn red" data-gcp="sauvegarder">Sauvegarder</button></div>
          <div class="srow"><div class="l"><b>Récupérer mon garage</b><span>Ajoute ici ce qui est sauvé dans le cloud, sans rien effacer</span></div><button class="btn" data-gcp="restaurer">Récupérer</button></div>
          <div class="srow"><div class="l"><b>Supprimer mon compte</b><span>Efface ton compte et tout ce qui est sauvé dans le cloud (ce téléphone garde son garage)</span></div><button class="btn red ghost" data-gcp="supprimer">Supprimer</button></div>` : e.codeEnvoyeA ? `
          <div class="srow"><div class="l"><b>Code envoyé</b><span>à ${esc(e.codeEnvoyeA)} — valable 10 minutes</span></div><button class="btn" data-gcp="changer">Changer d'adresse</button></div>
          <div class="srow"><input id="gcp-code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="7" placeholder="123456" aria-label="Code reçu par e-mail" style="${CHAMP};letter-spacing:.3em"><button class="btn red" data-gcp="valider">Valider</button></div>` : `
          <div class="srow"><div class="l"><b>Retrouver ton garage partout</b><span>Reçois un code par e-mail — pas de mot de passe</span></div></div>
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
  }
  function rafraichir() { const p = document.getElementById('gcp-compte'); if (p) { p.remove(); } greffer(); }
  function dire(t) { message = t; const m = document.getElementById('gcp-msg'); if (m) m.textContent = t; }

  async function surClic(ev) {
    const b = ev.target.closest('[data-gcp]'); if (!b) return;
    ev.preventDefault();
    const action = b.dataset.gcp;
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
        const r = await sauvegarder({ progres: p => dire(`Envoi des photos : ${p.faites}/${p.total}`) });
        message = `Sauvegardé : ${r.voitures} voiture${r.voitures > 1 ? 's' : ''}, ${r.photosEnvoyees} nouvelle${r.photosEnvoyees > 1 ? 's' : ''} photo${r.photosEnvoyees > 1 ? 's' : ''}.`;
        rafraichir();
      } else if (action === 'restaurer') {
        dire('Récupération en cours…');
        const r = await restaurer({ progres: p => dire(`Photos : ${p.faites}/${p.total}`) });
        message = r.rien ? 'Rien n\'est encore sauvé dans le cloud.' : `Récupéré : ${r.voitures} voiture${r.voitures > 1 ? 's' : ''}${r.retirees ? ` · ${r.retirees} retirée${r.retirees > 1 ? 's' : ''} sur un autre appareil` : ''}.`;
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
    VERSION: VERSION_COMPTE, etat, demanderCode, verifierCode, annulerCode, deconnecter,
    sauvegarder, restaurer, supprimerCompte, exporterCompte,
  });
})(window);
