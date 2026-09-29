// ============================================================================
// cloud/compte-worker.js — Comptes et sauvegarde cloud de Garage Manifest
// ============================================================================
// Déployé À PART sur Cloudflare Workers, comme ai-relay-worker.js. N'est ni
// chargé ni mis en cache par l'app : c'est le code d'un serveur.
//
// POURQUOI CE SERVEUR EXISTE
//   La collection vit dans IndexedDB, donc dans UN téléphone : perdu, changé,
//   réinitialisé → garage perdu. Un compte lié à l'e-mail permet de retrouver
//   son garage sur n'importe quel appareil.
//
// CHOIX D'ARCHITECTURE (voir cloud/DEPLOIEMENT.md pour le détail)
//   · Connexion par CODE À 6 CHIFFRES reçu par e-mail, sans mot de passe :
//     rien à stocker qui puisse fuiter, rien à oublier — donc pas de « mot de
//     passe oublié ». Le code vaut 10 min, 5 essais, et ouvre une session de
//     90 jours.
//     Pourquoi un code plutôt qu'un lien (version précédente) : sur iPhone,
//     une app installée sur l'écran d'accueil a son propre stockage, séparé de
//     Safari. Un lien ouvert depuis Mail s'ouvre dans Safari : la session
//     atterrissait dans Safari, pas dans l'app. Un code se tape là où on est.
//     Et les antivirus de messagerie qui « visitent » les liens ne peuvent
//     pas consommer un code.
//   · Un code n'a que 10^6 valeurs : il est protégé par le NOMBRE D'ESSAIS
//     (5 par code, un seul code actif par adresse, plafond de codes par jour),
//     et stocké en HMAC avec un secret du Worker (CODE_SECRET) — une simple
//     empreinte se retrouverait en un million d'essais hors ligne.
//   · Les sessions ne sont stockées qu'en empreinte SHA-256 (jeton de 256
//     bits : là, une empreinte suffit).
//   · Réponse identique que l'e-mail ait un compte ou non : impossible de
//     sonder qui est inscrit.
//   · Photos dans R2, rangées sous leur empreinte SHA-256 : une photo n'est
//     envoyée qu'une fois, et le serveur VÉRIFIE que le contenu correspond à
//     l'empreinte annoncée (impossible d'écraser une photo par une autre).
//   · Concurrence optimiste sur le garage (If-Match / version) : deux
//     appareils ne s'écrasent jamais en silence ; le second reçoit 409, fusionne
//     et renvoie.
//   · RGPD : export complet (portabilité) et suppression totale du compte.
//
// CONTRAT HTTP (JSON, CORS limité à APP_ORIGIN)
//   POST   /auth/code            { email }        → 200 { ok:true }   (toujours)
//   POST   /auth/session         { email, code }  → 200 { session, email } | 400
//   POST   /auth/deconnexion     Bearer           → 200
//   GET    /garage               Bearer           → 200 { version, maj, donnees } | 404
//   PUT    /garage               Bearer, If-Match → 200 { version } | 409 { version }
//   POST   /photos/manquantes    Bearer { empreintes:[…] } → 200 { manquantes:[…] }
//   PUT    /photos/:sha256       Bearer, corps = image      → 201 | 400
//   GET    /photos/:sha256       Bearer           → image | 404
//   GET    /compte/export        Bearer           → 200 { email, cree, garage, photos:[…] }
//   DELETE /compte               Bearer           → 200 (tout est effacé)
//
// LIAISONS ET VARIABLES (wrangler.toml)
//   DB (D1), PHOTOS (R2), APP_ORIGIN, MAIL_FROM
//   Secrets : RESEND_API_KEY, CODE_SECRET  (wrangler secret put …)
// ============================================================================

const DUREE_CODE_MS     = 10 * 60 * 1000;          // code : 10 min
const ESSAIS_CODE       = 5;                       // essais par code, puis il est détruit
const DUREE_SESSION_MS  = 90 * 24 * 3600 * 1000;   // session : 90 jours
const MAX_GARAGE_OCTETS = 5 * 1024 * 1024;         // collection sans photos
const MAX_PHOTO_OCTETS  = 12 * 1024 * 1024;        // même plafond que l'import côté app
const MAX_EMPREINTES    = 5000;                    // par requête /photos/manquantes
const TYPES_PHOTO       = ['image/jpeg', 'image/png', 'image/webp'];

/* Limites de débit : protègent la boîte de réception d'autrui (on ne doit pas
   pouvoir faire envoyer 1 000 codes à une adresse) et le quota d'envoi. */
const LIMITES = {
  codeParEmail:     { max: 3,  fenetreMs: 15 * 60 * 1000 },
  /* Plafond journalier : borne le nombre total d'essais sur une adresse à
     10 codes × 5 essais = 50 par jour, soit 1 chance sur 20 000 de deviner. */
  codeParEmailJour: { max: 10, fenetreMs: 24 * 3600 * 1000 },
  codeParIp:        { max: 10, fenetreMs: 15 * 60 * 1000 },
  sessionParIp: { max: 20, fenetreMs: 15 * 60 * 1000 },
};

// ---------------------------------------------------------------- outils ----
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const sha256hex = async (donnees) => hex(await crypto.subtle.digest('SHA-256', typeof donnees === 'string' ? enc.encode(donnees) : donnees));
/* Code à 6 chiffres UNIFORME : tirage par rejet. Un simple « % 1e6 » sur 32
   bits favoriserait les petits codes (2^32 n'est pas multiple de 10^6). */
function codeAleatoire() {
  const plafond = Math.floor(0x100000000 / 1e6) * 1e6;
  const t = new Uint32Array(1);
  do crypto.getRandomValues(t); while (t[0] >= plafond);
  return String(t[0] % 1e6).padStart(6, '0');
}
async function hmacCode(env, email, code) {
  if (!env.CODE_SECRET) throw new Error('CODE_SECRET absent');   // on refuse plutôt que stocker faible
  const cle = await crypto.subtle.importKey('raw', enc.encode(env.CODE_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', cle, enc.encode(`${email}:${code}`)));
}
/* Comparaison à temps constant : ne pas révéler, par la durée de la réponse,
   combien de caractères de l'empreinte coïncident. */
function egauxTempsConstant(a, b) {
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
function jetonAleatoire() {
  const o = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const RE_EMAIL = /^[^\s@<>()[\]\\,;:"]{1,64}@[a-z0-9.-]{1,185}\.[a-z]{2,24}$/;
const normaliserEmail = (e) => String(e || '').trim().toLowerCase().slice(0, 254);
const RE_SHA = /^[0-9a-f]{64}$/;

function cors(env) {
  return {
    'Access-Control-Allow-Origin': env.APP_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, If-Match',
    'Access-Control-Expose-Headers': 'ETag',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}
const json = (env, corps, statut = 200, extra = {}) => new Response(JSON.stringify(corps), {
  status: statut, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors(env), ...extra },
});
const erreur = (env, statut, message) => json(env, { erreur: message }, statut);

async function lireJson(req, max = 64 * 1024) {
  const t = await req.text();
  if (t.length > max) throw new Error('trop-gros');
  return JSON.parse(t);
}

/* Fenêtre glissante simplifiée en base : une ligne par clé, remise à zéro à
   l'expiration de la fenêtre. Suffisant pour un petit service ; Cloudflare
   Rate Limiting peut prendre le relais si le trafic grossit. */
/* La clé (« code-ip:1.2.3.4 », « code-email:x@y.fr ») n'est stockée que
   HACHÉE : le limiteur n'a besoin que de l'égalité, pas de pouvoir relire une
   IP ou l'adresse de quelqu'un qui n'a peut-être jamais créé de compte. */
async function depasseLimite(env, cleClaire, { max, fenetreMs }) {
  const maintenant = Date.now();
  const cle = await sha256hex('limite:' + cleClaire);
  const l = await env.DB.prepare('SELECT compte, fenetre FROM limites WHERE cle = ?').bind(cle).first();
  if (!l || maintenant - l.fenetre > fenetreMs) {
    await env.DB.prepare('INSERT OR REPLACE INTO limites (cle, compte, fenetre) VALUES (?, 1, ?)').bind(cle, maintenant).run();
    return false;
  }
  if (l.compte >= max) return true;
  await env.DB.prepare('UPDATE limites SET compte = compte + 1 WHERE cle = ?').bind(cle).run();
  return false;
}

async function utilisateurDeSession(req, env) {
  const m = /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(req.headers.get('Authorization') || '');
  if (!m) return null;
  const s = await env.DB.prepare(
    'SELECT s.utilisateur AS id, u.email AS email, s.expire AS expire FROM sessions s JOIN utilisateurs u ON u.id = s.utilisateur WHERE s.hash = ?'
  ).bind(await sha256hex(m[1])).first();
  if (!s || s.expire < Date.now()) return null;
  return { id: s.id, email: s.email, hashSession: await sha256hex(m[1]) };
}

async function envoyerCode(env, email, code) {
  const texte = `Bonjour,\n\nTon code de connexion à Garage Manifest : ${code}\n\nIl est valable 10 minutes. Tape-le dans l'app, là où tu l'as demandé.\n\nSi tu n'as rien demandé, ignore simplement ce message : personne ne peut se connecter sans ce code.\n`;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    // Le code dans l'objet : lisible dans la notification, sans ouvrir le message.
    body: JSON.stringify({ from: env.MAIL_FROM, to: [email], subject: `${code} — ton code Garage Manifest`, text: texte }),
  });
  if (!r.ok) throw new Error(`envoi-mail-${r.status}`);
}

// ------------------------------------------------------------- routes ------
async function routeCode(req, env) {
  let corps; try { corps = await lireJson(req); } catch { return erreur(env, 400, 'Requête invalide'); }
  const email = normaliserEmail(corps.email);
  if (!RE_EMAIL.test(email)) return erreur(env, 400, 'Adresse e-mail invalide');
  const ip = req.headers.get('CF-Connecting-IP') || 'inconnue';
  if (await depasseLimite(env, `code-ip:${ip}`, LIMITES.codeParIp)
   || await depasseLimite(env, `code-email:${email}`, LIMITES.codeParEmail)
   || await depasseLimite(env, `code-email-jour:${email}`, LIMITES.codeParEmailJour)) {
    return erreur(env, 429, 'Trop de demandes, réessaie plus tard');
  }
  const code = codeAleatoire();
  /* UN SEUL code actif par adresse : le nouveau remplace l'ancien (et remet
     les essais à zéro). Sans cela, demander 3 codes triplerait les chances
     de deviner l'un d'eux. */
  await env.DB.prepare('INSERT OR REPLACE INTO codes (email, hash, expire, essais) VALUES (?, ?, ?, 0)')
    .bind(email, await hmacCode(env, email, code), Date.now() + DUREE_CODE_MS).run();
  await envoyerCode(env, email, code);
  // Même réponse que le compte existe ou non (anti-énumération).
  return json(env, { ok: true });
}

async function routeSession(req, env) {
  const ip = req.headers.get('CF-Connecting-IP') || 'inconnue';
  if (await depasseLimite(env, `session-ip:${ip}`, LIMITES.sessionParIp)) return erreur(env, 429, 'Trop de tentatives');
  let corps; try { corps = await lireJson(req); } catch { return erreur(env, 400, 'Requête invalide'); }
  const email = normaliserEmail(corps.email);
  const code = String(corps.code ?? '').replace(/\s/g, '');
  if (!RE_EMAIL.test(email) || !/^\d{6}$/.test(code)) return erreur(env, 400, 'Code invalide');
  const maintenant = Date.now();
  /* L'essai est COMPTÉ AVANT la comparaison, par un UPDATE atomique borné :
     même cent requêtes simultanées ne dépassent pas 5 essais par code. */
  const essai = await env.DB.prepare('UPDATE codes SET essais = essais + 1 WHERE email = ? AND expire > ? AND essais < ?')
    .bind(email, maintenant, ESSAIS_CODE).run();
  if (!essai.meta || essai.meta.changes !== 1) return erreur(env, 400, 'Code expiré : demandes-en un nouveau');
  const ligne = await env.DB.prepare('SELECT hash FROM codes WHERE email = ?').bind(email).first();
  const attendu = await hmacCode(env, email, code);
  if (!ligne || !egauxTempsConstant(ligne.hash, attendu)) return erreur(env, 400, 'Code incorrect');
  // Consommation atomique : deux envois simultanés du bon code n'ouvrent qu'une session.
  const conso = await env.DB.prepare('DELETE FROM codes WHERE email = ? AND hash = ?').bind(email, attendu).run();
  if (!conso.meta || conso.meta.changes !== 1) return erreur(env, 400, 'Code déjà utilisé');
  let u = await env.DB.prepare('SELECT id FROM utilisateurs WHERE email = ?').bind(email).first();
  if (!u) {
    u = { id: crypto.randomUUID() };
    await env.DB.prepare('INSERT INTO utilisateurs (id, email, cree) VALUES (?, ?, ?)').bind(u.id, email, maintenant).run();
  }
  const session = jetonAleatoire();
  await env.DB.prepare('INSERT INTO sessions (hash, utilisateur, expire, cree) VALUES (?, ?, ?, ?)')
    .bind(await sha256hex(session), u.id, maintenant + DUREE_SESSION_MS, maintenant).run();
  return json(env, { session, email });
}

async function routeGarageLire(env, u) {
  const g = await env.DB.prepare('SELECT version, maj, donnees FROM garages WHERE utilisateur = ?').bind(u.id).first();
  if (!g) return erreur(env, 404, 'Aucune sauvegarde');
  return json(env, { version: g.version, maj: g.maj, donnees: JSON.parse(g.donnees) }, 200, { ETag: `"${g.version}"` });
}

async function routeGarageEcrire(req, env, u) {
  /* En-tête ABSENT ≠ « 0 » : Number('') vaut 0, et une écriture sans version
     passait pour une première sauvegarde (trouvé par banc-compte.js). */
  const brut = String(req.headers.get('If-Match') || '').replace(/"/g, '').trim();
  const attendue = /^\d+$/.test(brut) ? Number(brut) : NaN;
  if (!Number.isInteger(attendue)) return erreur(env, 428, 'En-tête If-Match requis (version connue, 0 pour une première sauvegarde)');
  let corps; try { corps = await lireJson(req, MAX_GARAGE_OCTETS); } catch (e) {
    return erreur(env, e.message === 'trop-gros' ? 413 : 400, e.message === 'trop-gros' ? 'Garage trop volumineux' : 'Requête invalide');
  }
  if (!corps || typeof corps.donnees !== 'object') return erreur(env, 400, 'Champ « donnees » manquant');
  const texte = JSON.stringify(corps.donnees);
  const maj = Date.now();
  let r;
  if (attendue === 0) {
    r = await env.DB.prepare('INSERT OR IGNORE INTO garages (utilisateur, version, maj, donnees) VALUES (?, 1, ?, ?)').bind(u.id, maj, texte).run();
  } else {
    r = await env.DB.prepare('UPDATE garages SET version = version + 1, maj = ?, donnees = ? WHERE utilisateur = ? AND version = ?')
      .bind(maj, texte, u.id, attendue).run();
  }
  if (!r.meta || r.meta.changes !== 1) {
    // Un autre appareil a écrit entre-temps : on renvoie la version actuelle,
    // le client récupère, fusionne, et renvoie.
    const g = await env.DB.prepare('SELECT version FROM garages WHERE utilisateur = ?').bind(u.id).first();
    return json(env, { erreur: 'Conflit : le garage a changé sur un autre appareil', version: g ? g.version : 0 }, 409);
  }
  return json(env, { version: attendue + 1, maj }, 200, { ETag: `"${attendue + 1}"` });
}

async function routePhotosManquantes(req, env, u) {
  let corps; try { corps = await lireJson(req, 512 * 1024); } catch { return erreur(env, 400, 'Requête invalide'); }
  const liste = (Array.isArray(corps.empreintes) ? corps.empreintes : []).filter(e => RE_SHA.test(e)).slice(0, MAX_EMPREINTES);
  const manquantes = [];
  for (const e of liste) if (!(await env.PHOTOS.head(`u/${u.id}/${e}`))) manquantes.push(e);
  return json(env, { manquantes });
}

async function routePhotoEcrire(req, env, u, sha) {
  const type = (req.headers.get('Content-Type') || '').split(';')[0].trim();
  if (!TYPES_PHOTO.includes(type)) return erreur(env, 415, 'Type de photo non accepté');
  const octets = await req.arrayBuffer();
  if (!octets.byteLength || octets.byteLength > MAX_PHOTO_OCTETS) return erreur(env, 413, 'Photo vide ou trop lourde');
  // Le contenu doit correspondre à l'empreinte annoncée : pas d'écrasement possible.
  if (await sha256hex(octets) !== sha) return erreur(env, 400, 'Empreinte ne correspondant pas au contenu');
  await env.PHOTOS.put(`u/${u.id}/${sha}`, octets, { httpMetadata: { contentType: type } });
  return new Response(null, { status: 201, headers: cors(env) });
}

async function routePhotoLire(env, u, sha) {
  const o = await env.PHOTOS.get(`u/${u.id}/${sha}`);
  if (!o) return erreur(env, 404, 'Photo introuvable');
  return new Response(o.body, { headers: { 'Content-Type': o.httpMetadata?.contentType || 'image/jpeg', 'Cache-Control': 'private, max-age=31536000, immutable', ...cors(env) } });
}

async function toutesLesPhotos(env, u) {
  const cles = []; let curseur;
  do {
    const l = await env.PHOTOS.list({ prefix: `u/${u.id}/`, cursor: curseur });
    for (const o of l.objects) cles.push(o.key);
    curseur = l.truncated ? l.cursor : undefined;
  } while (curseur);
  return cles;
}

async function routeExport(env, u) {
  const info = await env.DB.prepare('SELECT email, cree FROM utilisateurs WHERE id = ?').bind(u.id).first();
  const g = await env.DB.prepare('SELECT version, maj, donnees FROM garages WHERE utilisateur = ?').bind(u.id).first();
  const photos = (await toutesLesPhotos(env, u)).map(k => k.split('/').pop());
  return json(env, { email: info.email, cree: info.cree, garage: g ? { version: g.version, maj: g.maj, donnees: JSON.parse(g.donnees) } : null, photos });
}

async function routeSupprimer(env, u) {
  const cles = await toutesLesPhotos(env, u);
  for (let i = 0; i < cles.length; i += 1000) await env.PHOTOS.delete(cles.slice(i, i + 1000));
  const email = (await env.DB.prepare('SELECT email FROM utilisateurs WHERE id = ?').bind(u.id).first())?.email;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM garages WHERE utilisateur = ?').bind(u.id),
    env.DB.prepare('DELETE FROM sessions WHERE utilisateur = ?').bind(u.id),
    env.DB.prepare('DELETE FROM codes WHERE email = ?').bind(email || ''),
    env.DB.prepare('DELETE FROM utilisateurs WHERE id = ?').bind(u.id),
  ]);
  return json(env, { ok: true, photosEffacees: cles.length });
}

// ------------------------------------------------------------- aiguillage --
/* Minimisation (RGPD art. 5.1.e) : rien d'échu ne reste en base. Les codes
   portent l'adresse de personnes qui n'ont parfois jamais créé de
   compte ; les compteurs de débit n'ont de sens que pendant leur fenêtre.
   Lancé chaque nuit par le déclencheur cron de wrangler.toml. */
async function purger(env, maintenant = Date.now()) {
  const fenetreMax = Math.max(...Object.values(LIMITES).map(l => l.fenetreMs));
  const r = await env.DB.batch([
    env.DB.prepare('DELETE FROM codes WHERE expire < ?').bind(maintenant),
    env.DB.prepare('DELETE FROM sessions WHERE expire < ?').bind(maintenant),
    env.DB.prepare('DELETE FROM limites WHERE fenetre < ?').bind(maintenant - fenetreMax),
  ]);
  const n = r.map(x => (x && x.meta && x.meta.changes) || 0);
  return { codes: n[0], sessions: n[1], limites: n[2] };
}

export default {
  async scheduled(evenement, env, ctx) {
    const travail = purger(env).then(n => { console.log('[compte-worker] purge', JSON.stringify(n)); return n; });
    if (ctx && ctx.waitUntil) ctx.waitUntil(travail);
    return travail;
  },

  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env) });
    const origine = req.headers.get('Origin');
    if (origine && origine !== env.APP_ORIGIN) return erreur(env, 403, 'Origine non autorisée');
    const url = new URL(req.url);
    const p = url.pathname.replace(/\/+$/, '') || '/';
    try {
      if (req.method === 'POST' && p === '/auth/code')    return await routeCode(req, env);
      if (req.method === 'POST' && p === '/auth/session') return await routeSession(req, env);

      const u = await utilisateurDeSession(req, env);
      if (!u) return erreur(env, 401, 'Session absente ou expirée');

      if (req.method === 'POST' && p === '/auth/deconnexion') {
        await env.DB.prepare('DELETE FROM sessions WHERE hash = ?').bind(u.hashSession).run();
        return json(env, { ok: true });
      }
      if (p === '/garage' && req.method === 'GET') return await routeGarageLire(env, u);
      if (p === '/garage' && req.method === 'PUT') return await routeGarageEcrire(req, env, u);
      if (p === '/photos/manquantes' && req.method === 'POST') return await routePhotosManquantes(req, env, u);
      const mp = /^\/photos\/([0-9a-f]{64})$/.exec(p);
      if (mp && req.method === 'PUT') return await routePhotoEcrire(req, env, u, mp[1]);
      if (mp && req.method === 'GET') return await routePhotoLire(env, u, mp[1]);
      if (p === '/compte/export' && req.method === 'GET') return await routeExport(env, u);
      if (p === '/compte' && req.method === 'DELETE') return await routeSupprimer(env, u);
      return erreur(env, 404, 'Route inconnue');
    } catch (e) {
      // Jamais de détail interne vers le client ; le journal Cloudflare garde l'erreur.
      console.error('[compte-worker]', e && e.stack || e);
      return erreur(env, 500, 'Erreur interne');
    }
  },
};
