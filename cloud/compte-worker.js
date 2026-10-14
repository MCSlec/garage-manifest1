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
//   POST   /auth/google          { credential }   → 200 { session, email } | 400 | 409 { lier:true } | 501 { google:false }
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
//   DB (D1), PHOTOS (R2, facultatif), APP_ORIGIN, MAIL_FROM
//   GOOGLE_CLIENT_ID (facultatif, PUBLIC : ce n'est pas un secret)
//   Secrets : RESEND_API_KEY, CODE_SECRET  (wrangler secret put …)
//
// CONNEXION GOOGLE (14/10, « Continuer avec Google », voulue par le propriétaire)
//   Le compte reste le NÔTRE (identifiant aléatoire) : Google n'est qu'une clé
//   de plus pour l'ouvrir (table `identites`). Le navigateur remet au serveur le
//   jeton d'identité SIGNÉ par Google ; le serveur vérifie lui-même signature
//   (clés publiques de Google), émetteur, destinataire (GOOGLE_CLIENT_ID) et
//   expiration — il ne croit jamais ce que dit le navigateur. Jeton à usage
//   unique (rejeu refusé). Fusion avec un compte e-mail existant SEULEMENT si
//   Google fait autorité sur l'adresse (Gmail, ou domaine géré : `hd`) ; sinon
//   409 « lier » : une adresse dont Google n'est pas maître ne doit pas ouvrir
//   le compte de quelqu'un d'autre. Sans GOOGLE_CLIENT_ID : 501, en sommeil.
//   Le même point d'entrée servira l'app native (le SDK Google y rend le même jeton).
//
// MODE ESSAI SANS PHOTOS (01/10, offre gratuite)
//   R2 exige une carte bancaire, même pour son offre gratuite. Sans liaison
//   PHOTOS, le serveur sauvegarde la collection (voitures, dates, notes,
//   lieux) et répond 501 à TOUTES les routes de photos. 501 et non 404 ou 500 :
//   « ce serveur ne le fait pas » est un état de configuration, stable, que le
//   client distingue d'une panne passagère (gm-compte.js) — il continue alors
//   la sauvegarde sans photos au lieu de l'interrompre. Les empreintes restent
//   dans la collection : le jour où R2 est branché, la sauvegarde suivante
//   envoie les photos manquantes, sans migration.
// ============================================================================

const DUREE_CODE_MS     = 10 * 60 * 1000;          // code : 10 min
const ESSAIS_CODE       = 5;                       // essais par code, puis il est détruit
const DUREE_SESSION_MS  = 90 * 24 * 3600 * 1000;   // session : 90 jours
/* D1 refuse toute ligne de plus de 2 000 000 octets : au-delà, l'écriture
   échouait en « Erreur interne ». On refuse avant, avec un message clair.
   Mesuré en OCTETS UTF-8 (un « é » en pèse 2), pas en caractères. */
const MAX_GARAGE_OCTETS = 1_900_000;               // collection sans photos
/* 2 Mo par photo (demande du 29/09) : l'app n'en produit pas de plus de ≈ 0,8 Mo
   (JPEG 1 280 px), et recompresse les anciennes avant envoi (normaliserPhotos). */
const MAX_PHOTO_OCTETS  = 2 * 1024 * 1024;

/* Quotas de stockage photo (défaut n°9 de /code-review). Mesure du 29/09 : une
   photo de l'app (JPEG, 1 280 px, qualité 0,82) pèse ≈ 330 Ko sur une scène
   réaliste, ≈ 800 Ko au pire. Valeurs PROPOSÉES — voir cloud/DEPLOIEMENT.md —
   et réglables sans toucher au code, par les variables du Worker
   (wrangler.toml [vars]) : QUOTA_PHOTOS, QUOTA_OCTETS, QUOTA_GLOBAL_OCTETS. */
const QUOTAS_DEFAUT = {
  photos:       5000,                        // par compte (≈ 4 à 5 photos par voiture du catalogue)
  octets:       1.5 * 1024 ** 3,             // par compte : 1,5 Go ≈ 4 500 photos réalistes
  globalOctets: 50 * 1024 ** 3,              // tout le service : disjoncteur de facture (≈ 0,60 $/mois au-delà des 10 Go gratuits)
};
const quota = (env, cle, defaut) => { const n = Number(env[cle]); return Number.isFinite(n) && n > 0 ? n : defaut; };
const MAX_EMPREINTES    = 5000;                    // par requête /photos/manquantes (le client envoie par lots de 1 000)
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
  googleParIp:  { max: 20, fenetreMs: 15 * 60 * 1000 },
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

// ------------------------------------------------- jeton d'identité Google --
const GOOGLE_EMETTEURS = ['accounts.google.com', 'https://accounts.google.com'];
const GOOGLE_CLES_URL  = 'https://www.googleapis.com/oauth2/v3/certs';
const DECALAGE_HORLOGE_S = 60;          // tolérance d'horloge entre Google et nous
const RELECTURE_CLES_MS  = 60 * 1000;   // une clé inconnue ne fait pas recharger plus d'une fois par minute

function octetsB64url(s) {
  const b = atob(String(s).replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  const o = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) o[i] = b.charCodeAt(i);
  return o;
}
const jsonB64url = (s) => JSON.parse(new TextDecoder().decode(octetsB64url(s)));

/* Clés publiques de Google, gardées en mémoire du Worker le temps que Google
   indique (Cache-Control). Google les fait tourner : une clé inconnue déclenche
   UNE relecture, au plus une fois par minute — sans ce frein, un jeton forgé
   avec un `kid` au hasard ferait interroger Google à chaque requête. */
let clesGoogle = { cles: new Map(), expire: 0, lu: 0 };
async function cleGoogle(kid) {
  const maintenant = Date.now();
  const perimee = maintenant > clesGoogle.expire;
  if (!clesGoogle.cles.has(kid) || perimee) {
    if (!perimee && maintenant - clesGoogle.lu < RELECTURE_CLES_MS) return null;
    const r = await fetch(GOOGLE_CLES_URL);
    if (!r.ok) throw new Error(`cles-google-${r.status}`);
    const { keys } = await r.json();
    const cles = new Map();
    for (const k of keys || []) {
      if (k.kty !== 'RSA' || !k.kid || !k.n || !k.e) continue;
      cles.set(k.kid, await crypto.subtle.importKey('jwk', { kty: 'RSA', n: k.n, e: k.e, alg: 'RS256', ext: true },
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']));
    }
    const age = Number((/max-age=(\d+)/.exec(r.headers.get('Cache-Control') || '') || [])[1]) || 3600;
    clesGoogle = { cles, expire: maintenant + age * 1000, lu: maintenant };
  }
  return clesGoogle.cles.get(kid) || null;
}

/* Rend la charge du jeton si TOUT est vérifié, sinon { refus } (raison pour le
   journal, jamais renvoyée au client). L'algorithme est IMPOSÉ (RS256) : on ne
   lit jamais celui qu'annonce le jeton, sinon « none » ou HS256 ouvriraient la
   porte à un jeton fabriqué. */
async function verifierJetonGoogle(env, jeton) {
  const parties = typeof jeton === 'string' && jeton.length <= 4096 ? jeton.split('.') : [];
  if (parties.length !== 3) return { refus: 'format' };
  let entete, charge;
  try { entete = jsonB64url(parties[0]); charge = jsonB64url(parties[1]); } catch { return { refus: 'format' }; }
  if (entete.alg !== 'RS256' || typeof entete.kid !== 'string') return { refus: 'algorithme' };
  const cle = await cleGoogle(entete.kid);
  if (!cle) return { refus: 'cle-inconnue' };
  let signee = false;
  try { signee = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', cle, octetsB64url(parties[2]), enc.encode(`${parties[0]}.${parties[1]}`)); } catch {}
  if (!signee) return { refus: 'signature' };
  const s = Date.now() / 1000;
  if (!GOOGLE_EMETTEURS.includes(charge.iss)) return { refus: 'emetteur' };
  if (typeof charge.aud !== 'string' || charge.aud !== env.GOOGLE_CLIENT_ID) return { refus: 'destinataire' };
  if (!(Number(charge.exp) > s - DECALAGE_HORLOGE_S) || !(Number(charge.iat) < s + DECALAGE_HORLOGE_S)) return { refus: 'expire' };
  if (typeof charge.sub !== 'string' || !/^[0-9A-Za-z_-]{1,255}$/.test(charge.sub)) return { refus: 'sujet' };
  return { charge, signature: parties[2] };
}

/* Google n'est MAÎTRE d'une adresse que pour Gmail et pour les domaines qu'il
   gère (Workspace : champ `hd`). Un compte Google peut aussi porter une adresse
   d'ailleurs, vérifiée un jour mais plus forcément détenue : celle-là ne doit
   pas ouvrir, à elle seule, un compte déjà créé par code e-mail. */
function googleFaitAutorite(email, charge) {
  if (/@(gmail|googlemail)\.com$/.test(email)) return true;
  return typeof charge.hd === 'string' && charge.hd.length > 0 && email.endsWith('@' + charge.hd.toLowerCase());
}

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
  /* UNE seule instruction, lue et écrite d'un bloc (upsert + RETURNING).
     La version précédente lisait le compteur PUIS l'écrivait : 50 requêtes
     simultanées lisaient toutes « 0 » et passaient toutes (trouvé par
     /code-review, reproduit au banc : 50 codes envoyés au lieu de 3).
     Dans un SET SQLite, `fenetre` désigne l'ANCIENNE valeur : la fenêtre
     expirée repart à 1, sinon le compteur s'incrémente. */
  const l = await env.DB.prepare(
    `INSERT INTO limites (cle, compte, fenetre) VALUES (?1, 1, ?2)
     ON CONFLICT (cle) DO UPDATE SET
       compte  = CASE WHEN ?2 - fenetre > ?3 THEN 1  ELSE compte + 1 END,
       fenetre = CASE WHEN ?2 - fenetre > ?3 THEN ?2 ELSE fenetre   END
     RETURNING compte`).bind(cle, maintenant, fenetreMs).first();
  return !l || l.compte > max;
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
  /* …et l'empreinte est lue DANS la même instruction (RETURNING) : un nouveau
     code demandé entre les deux ne peut pas être comparé sans être compté. */
  const ligne = await env.DB.prepare('UPDATE codes SET essais = essais + 1 WHERE email = ? AND expire > ? AND essais < ? RETURNING hash')
    .bind(email, maintenant, ESSAIS_CODE).first();
  if (!ligne) return erreur(env, 400, 'Code expiré : demandes-en un nouveau');
  const attendu = await hmacCode(env, email, code);
  if (!egauxTempsConstant(ligne.hash, attendu)) return erreur(env, 400, 'Code incorrect');
  // Consommation atomique : deux envois simultanés du bon code n'ouvrent qu'une session.
  const conso = await env.DB.prepare('DELETE FROM codes WHERE email = ? AND hash = ?').bind(email, attendu).run();
  if (!conso.meta || conso.meta.changes !== 1) return erreur(env, 400, 'Code déjà utilisé');
  let u = await env.DB.prepare('SELECT id FROM utilisateurs WHERE email = ?').bind(email).first();
  if (!u) {
    u = { id: crypto.randomUUID() };
    await env.DB.prepare('INSERT INTO utilisateurs (id, email, cree) VALUES (?, ?, ?)').bind(u.id, email, maintenant).run();
  }
  return ouvrirSession(env, u.id, email, maintenant);
}

/* Une seule façon d'ouvrir une session, quel que soit le moyen de connexion :
   ce qui suit (sauvegarde, restauration) ne sait pas — et n'a pas à savoir —
   si l'on est entré par un code ou par Google. */
async function ouvrirSession(env, idUtilisateur, email, maintenant = Date.now()) {
  const session = jetonAleatoire();
  await env.DB.prepare('INSERT INTO sessions (hash, utilisateur, expire, cree) VALUES (?, ?, ?, ?)')
    .bind(await sha256hex(session), idUtilisateur, maintenant + DUREE_SESSION_MS, maintenant).run();
  return json(env, { session, email });
}

async function routeGoogle(req, env) {
  // Non configuré : état stable (501), comme le stockage photo absent.
  if (!env.GOOGLE_CLIENT_ID) return json(env, { erreur: 'Connexion Google non configurée sur ce serveur', google: false }, 501);
  const ip = req.headers.get('CF-Connecting-IP') || 'inconnue';
  if (await depasseLimite(env, `google-ip:${ip}`, LIMITES.googleParIp)) return erreur(env, 429, 'Trop de tentatives');
  let corps; try { corps = await lireJson(req, 8 * 1024); } catch { return erreur(env, 400, 'Requête invalide'); }
  let verif;
  try { verif = await verifierJetonGoogle(env, corps && corps.credential); }
  catch (e) { console.error('[compte-worker] clés Google injoignables', e && e.message); return erreur(env, 503, 'Connexion Google momentanément indisponible : utilise le code par e-mail'); }
  if (verif.refus) { console.error('[compte-worker] jeton Google refusé :', verif.refus); return erreur(env, 400, 'Connexion Google refusée'); }
  const { charge } = verif;
  const email = normaliserEmail(charge.email);
  // L'adresse devient celle du compte (et le canal de secours par code) : Google doit l'avoir vérifiée.
  if (charge.email_verified !== true || !RE_EMAIL.test(email)) return erreur(env, 400, 'Adresse Google non vérifiée : connecte-toi avec un code reçu par e-mail');
  const maintenant = Date.now();
  /* Usage unique, d'une seule instruction : l'empreinte de la signature (propre
     à chaque jeton) n'entre qu'une fois. Un jeton intercepté puis rejoué — ou
     envoyé deux fois en même temps — n'ouvre qu'une session. */
  const neuf = await env.DB.prepare(
    'INSERT INTO jetons_consommes (empreinte, expire) VALUES (?, ?) ON CONFLICT (empreinte) DO NOTHING RETURNING empreinte'
  ).bind(await sha256hex('google:' + verif.signature), Number(charge.exp) * 1000).first();
  if (!neuf) return erreur(env, 400, 'Connexion Google déjà utilisée : recommence');

  const sujet = await sha256hex('google:' + charge.sub);      // l'identifiant Google n'est jamais stocké en clair
  const lien = () => env.DB.prepare('SELECT i.utilisateur AS id, u.email AS email FROM identites i JOIN utilisateurs u ON u.id = i.utilisateur WHERE i.fournisseur = ? AND i.sujet = ?').bind('google', sujet).first();
  let compte = await lien();
  if (!compte) {
    let u = await env.DB.prepare('SELECT id FROM utilisateurs WHERE email = ?').bind(email).first();
    let cree = false;
    if (!u) {
      const id = crypto.randomUUID();
      const r = await env.DB.prepare('INSERT INTO utilisateurs (id, email, cree) VALUES (?, ?, ?) ON CONFLICT (email) DO NOTHING').bind(id, email, maintenant).run();
      cree = !!(r.meta && r.meta.changes === 1);
      // Perdu une course (compte créé à l'instant par un autre appel) : on relit, et la règle d'autorité s'applique.
      u = cree ? { id } : await env.DB.prepare('SELECT id FROM utilisateurs WHERE email = ?').bind(email).first();
    }
    if (!cree && !googleFaitAutorite(email, charge)) {
      return json(env, { erreur: 'Cette adresse a déjà un compte : connecte-toi avec un code reçu par e-mail', lier: true }, 409);
    }
    await env.DB.prepare('INSERT INTO identites (fournisseur, sujet, utilisateur, cree) VALUES (?, ?, ?, ?) ON CONFLICT (fournisseur, sujet) DO NOTHING')
      .bind('google', sujet, u.id, maintenant).run();
    compte = await lien();                                      // la relecture départage deux connexions simultanées
  }
  return ouvrirSession(env, compte.id, compte.email, maintenant);
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
  let corps; try { corps = await lireJson(req, 2 * MAX_GARAGE_OCTETS); } catch (e) {
    return erreur(env, e.message === 'trop-gros' ? 413 : 400, e.message === 'trop-gros' ? 'Garage trop volumineux' : 'Requête invalide');
  }
  // `typeof null === 'object'` : null et tableaux passaient, et cassaient ensuite la restauration.
  const d = corps && corps.donnees;
  if (!d || typeof d !== 'object' || Array.isArray(d)) return erreur(env, 400, 'Champ « donnees » manquant ou invalide');
  const texte = JSON.stringify(d);
  if (enc.encode(texte).length > MAX_GARAGE_OCTETS) return erreur(env, 413, 'Garage trop volumineux pour la sauvegarde cloud (1,9 Mo hors photos)');
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
  const liste = (Array.isArray(corps.empreintes) ? corps.empreintes : []).filter(e => RE_SHA.test(e));
  // Refus explicite plutôt que troncature : le client découpe en lots (gm-compte.js).
  if (liste.length > MAX_EMPREINTES) return erreur(env, 413, `Au plus ${MAX_EMPREINTES} empreintes par requête`);
  /* UN listage (1 appel par tranche de 1 000 photos) au lieu d'un head() par
     photo : sur l'offre gratuite, une requête n'a droit qu'à 1 000 appels aux
     services Cloudflare — au-delà d'environ 1 000 photos, plus aucune
     sauvegarde ne passait. */
  const prefixe = `u/${u.id}/`;
  const presentes = new Set((await toutesLesPhotos(env, u)).map(k => k.slice(prefixe.length)));
  return json(env, { manquantes: [...new Set(liste)].filter(e => !presentes.has(e)) });
}

async function routePhotoEcrire(req, env, u, sha) {
  const type = (req.headers.get('Content-Type') || '').split(';')[0].trim();
  if (!TYPES_PHOTO.includes(type)) return erreur(env, 415, 'Type de photo non accepté');
  const octets = await req.arrayBuffer();
  if (!octets.byteLength || octets.byteLength > MAX_PHOTO_OCTETS) return erreur(env, 413, 'Photo vide ou trop lourde');
  // Le contenu doit correspondre à l'empreinte annoncée : pas d'écrasement possible.
  if (await sha256hex(octets) !== sha) return erreur(env, 400, 'Empreinte ne correspondant pas au contenu');
  const cle = `u/${u.id}/${sha}`;
  // Adressage par empreinte : une photo déjà stockée est identique, rien à compter ni à réécrire.
  if (await env.PHOTOS.head(cle)) return new Response(null, { status: 201, headers: cors(env) });
  const taille = octets.byteLength;
  /* Disjoncteur global : au-delà, le service n'accepte plus de photo, pour
     personne. Contrôle grossier (non atomique) : c'est une borne de facture. */
  const total = await env.DB.prepare('SELECT COALESCE(SUM(octets), 0) AS o FROM usages').first();
  if ((total ? total.o : 0) + taille > quota(env, 'QUOTA_GLOBAL_OCTETS', QUOTAS_DEFAUT.globalOctets)) {
    return erreur(env, 507, 'Stockage du service momentanément plein : ta collection reste sur ton téléphone');
  }
  /* Réservation ATOMIQUE sur le compte (upsert conditionnel + RETURNING) :
     des envois simultanés ne peuvent pas dépasser le quota ensemble. */
  const reserve = await env.DB.prepare(
    `INSERT INTO usages (utilisateur, photos, octets) VALUES (?1, 1, ?2)
     ON CONFLICT (utilisateur) DO UPDATE SET photos = photos + 1, octets = octets + ?2
       WHERE photos + 1 <= ?3 AND octets + ?2 <= ?4
     RETURNING photos`).bind(u.id, taille, quota(env, 'QUOTA_PHOTOS', QUOTAS_DEFAUT.photos), quota(env, 'QUOTA_OCTETS', QUOTAS_DEFAUT.octets)).first();
  // Première photo d'un compte : l'INSERT passe sans la condition, on la vérifie ici.
  if (!reserve || taille > quota(env, 'QUOTA_OCTETS', QUOTAS_DEFAUT.octets)) {
    if (reserve) await env.DB.prepare('UPDATE usages SET photos = photos - 1, octets = octets - ? WHERE utilisateur = ?').bind(taille, u.id).run();
    return erreur(env, 507, 'Quota de stockage du compte atteint');
  }
  try {
    await env.PHOTOS.put(cle, octets, { httpMetadata: { contentType: type } });
  } catch (e) {
    await env.DB.prepare('UPDATE usages SET photos = photos - 1, octets = octets - ? WHERE utilisateur = ?').bind(taille, u.id).run();
    throw e;
  }
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
  const photos = env.PHOTOS ? (await toutesLesPhotos(env, u)).map(k => k.split('/').pop()) : [];
  // Moyens de connexion reliés (droit d'accès) : le fournisseur et la date, l'identifiant n'étant gardé qu'en empreinte.
  const connexions = ((await env.DB.prepare('SELECT fournisseur, cree FROM identites WHERE utilisateur = ? ORDER BY cree').bind(u.id).all()).results || []);
  return json(env, { email: info.email, cree: info.cree, connexions, garage: g ? { version: g.version, maj: g.maj, donnees: JSON.parse(g.donnees) } : null, photos });
}

async function routeSupprimer(env, u) {
  const cles = env.PHOTOS ? await toutesLesPhotos(env, u) : [];
  for (let i = 0; i < cles.length; i += 1000) await env.PHOTOS.delete(cles.slice(i, i + 1000));
  const email = (await env.DB.prepare('SELECT email FROM utilisateurs WHERE id = ?').bind(u.id).first())?.email;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM garages WHERE utilisateur = ?').bind(u.id),
    env.DB.prepare('DELETE FROM usages WHERE utilisateur = ?').bind(u.id),
    env.DB.prepare('DELETE FROM sessions WHERE utilisateur = ?').bind(u.id),
    env.DB.prepare('DELETE FROM codes WHERE email = ?').bind(email || ''),
    // AVANT `utilisateurs` : D1 applique les clés étrangères (PRAGMA foreign_keys = 1, constaté le 14/10).
    env.DB.prepare('DELETE FROM identites WHERE utilisateur = ?').bind(u.id),
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
    env.DB.prepare('DELETE FROM jetons_consommes WHERE expire < ?').bind(maintenant),
  ]);
  const n = r.map(x => (x && x.meta && x.meta.changes) || 0);
  return { codes: n[0], sessions: n[1], limites: n[2], jetons: n[3] };
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
      if (req.method === 'POST' && p === '/auth/google')  return await routeGoogle(req, env);

      const u = await utilisateurDeSession(req, env);
      if (!u) return erreur(env, 401, 'Session absente ou expirée');

      if (req.method === 'POST' && p === '/auth/deconnexion') {
        await env.DB.prepare('DELETE FROM sessions WHERE hash = ?').bind(u.hashSession).run();
        return json(env, { ok: true });
      }
      if (p === '/garage' && req.method === 'GET') return await routeGarageLire(env, u);
      if (p === '/garage' && req.method === 'PUT') return await routeGarageEcrire(req, env, u);
      // Mode essai sans R2 : un seul contrôle, AVANT toute route de photos (voir en tête).
      if (!env.PHOTOS && (p === '/photos' || p.startsWith('/photos/'))) return json(env, { erreur: 'Ce serveur ne sauvegarde pas les photos', photos: false }, 501);
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
