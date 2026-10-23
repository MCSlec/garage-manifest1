#!/usr/bin/env node
/* ==========================================================================
   Banc SERVEUR — cloud/compte-worker.js (comptes et sauvegarde cloud)
   --------------------------------------------------------------------------
   Exécute le VRAI code du Worker dans Node, avec :
     · une base SQLite en mémoire (node:sqlite) qui imite l'API D1 ;
     · un stockage en mémoire qui imite l'API R2 ;
     · l'envoi d'e-mail (Resend) intercepté : on lit le code reçu.
   Rien n'est déployé, rien ne sort sur le réseau.

   Ce que le banc garantit : le code est à usage unique, expire, ne supporte
   que 5 essais (même en rafale simultanée) et n'est jamais stocké en clair ; on ne peut pas sonder qui est inscrit ; les
   débits sont bornés ; deux appareils ne s'écrasent pas (409) ; une photo ne
   peut pas être remplacée par une autre ; un compte ne voit jamais les données
   d'un autre ; la suppression efface tout (RGPD).

   Usage : node banc-compte.js     (Node ≥ 22, aucune dépendance)
   ========================================================================== */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
process.removeAllListeners('warning'); // node:sqlite est « expérimental » : avertissement sans intérêt ici
const { DatabaseSync } = require('node:sqlite');

/* ---- D1 simulé ---------------------------------------------------------- */
function d1(sqlite) {
  /* Latence d'une vraie base distante : chaque requête rend la main avant de
     s'exécuter. Sans elle, les requêtes simultanées ne s'entremêlent jamais et
     un défaut de concurrence (lecture puis écriture séparées) reste invisible. */
  const latence = () => new Promise(ok => setImmediate(ok));
  const lier = (sql, args = []) => ({
    bind: (...a) => lier(sql, a),
    first: async () => { await latence(); return sqlite.prepare(sql).get(...args) ?? null; },
    all: async () => { await latence(); return { results: sqlite.prepare(sql).all(...args) }; },
    run: async () => { await latence(); const r = sqlite.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
  });
  return { prepare: (sql) => lier(sql), batch: async (stmts) => Promise.all(stmts.map(s => s.run())) };
}
/* ---- R2 simulé ---------------------------------------------------------- */
function r2() {
  const m = new Map();
  const appels = { n: 0 };            // chaque appel au stockage compte (limite Cloudflare par requête)
  const compter = (f) => async (...a) => { appels.n++; return f(...a); };
  return {
    _m: m, _appels: appels,
    put: compter(async (k, octets, o = {}) => { m.set(k, { octets: new Uint8Array(octets), httpMetadata: o.httpMetadata || {}, uploaded: new Date() }); }),
    get: compter(async (k) => m.has(k) ? { body: m.get(k).octets, httpMetadata: m.get(k).httpMetadata } : null),
    head: compter(async (k) => m.has(k) ? { key: k } : null),
    delete: compter(async (k) => { for (const x of [].concat(k)) m.delete(x); }),
    /* Comme le vrai R2 : 1 000 objets au plus par page, suite par curseur. */
    list: compter(async ({ prefix, cursor }) => { const toutes = [...m.keys()].filter(k => k.startsWith(prefix)).sort();
      const debut = Number(cursor || 0), page = toutes.slice(debut, debut + 1000), fin = debut + page.length;
      return { objects: page.map(key => ({ key, size: m.get(key).octets.length, uploaded: m.get(key).uploaded || new Date() })), truncated: fin < toutes.length, cursor: fin < toutes.length ? String(fin) : undefined }; }),
  };
}

const res = []; const v = (t, ok, d) => res.push({ t, ok: !!ok, d });

(async () => {
  // Le Worker est un module ES : on l'importe depuis une copie .mjs.
  const tmp = path.join(os.tmpdir(), `compte-worker-${process.pid}.mjs`);
  fs.copyFileSync(path.join(__dirname, 'cloud', 'compte-worker.js'), tmp);
  const worker = (await import('file://' + tmp)).default;

  const sqlite = new DatabaseSync(':memory:');
  /* Comme D1 (PRAGMA foreign_keys = 1, constaté sur la vraie base le 14/10) :
     sans cela, une suppression faite dans le mauvais ordre passerait au banc
     et échouerait en production. */
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(fs.readFileSync(path.join(__dirname, 'cloud', 'schema.sql'), 'utf8'));
  const env = { DB: d1(sqlite), PHOTOS: r2(), APP_ORIGIN: 'https://app.test', MAIL_FROM: 'GM <x@app.test>', RESEND_API_KEY: 'test', CODE_SECRET: 'secret-de-banc-32-octets-minimum!' };

  /* « Google » du banc : une VRAIE paire de clés RSA, dont la partie publique est
     servie à l'adresse des clés de Google. Les jetons sont signés pour de vrai :
     le Worker vérifie une vraie signature RS256, pas un simulacre. */
  const { generateKeyPairSync, sign: signer } = require('crypto');
  const paire = () => generateKeyPairSync('rsa', { modulusLength: 2048 });
  const cleGoogle1 = paire(), cleGoogle2 = paire(), clePirate = paire();
  const jwk = (p, kid) => ({ ...p.publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' });
  const clesServies = [jwk(cleGoogle1, 'banc-1')];
  let lecturesCles = 0, clesInjoignables = false;

  const mails = [];
  const fetchReel = globalThis.fetch;
  globalThis.fetch = async (url, opt) => {
    if (String(url).startsWith('https://api.resend.com/')) { mails.push(JSON.parse(opt.body)); return new Response('{"id":"x"}', { status: 200 }); }
    if (String(url) === 'https://www.googleapis.com/oauth2/v3/certs') {
      lecturesCles++;
      if (clesInjoignables) throw new TypeError('fetch failed');
      return new Response(JSON.stringify({ keys: clesServies }), { status: 200, headers: { 'Cache-Control': 'public, max-age=3600' } });
    }
    throw new Error('réseau interdit au banc : ' + url);
  };

  let ip = 1;
  const appel = (methode, chemin, { corps, session, entetes = {}, brut, type } = {}) => worker.fetch(new Request('https://api.test' + chemin, {
    method: methode,
    headers: { 'Origin': 'https://app.test', 'CF-Connecting-IP': `10.0.0.${ip}`,
      ...(session ? { Authorization: `Bearer ${session}` } : {}),
      ...(corps !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(type ? { 'Content-Type': type } : {}), ...entetes },
    body: brut !== undefined ? brut : corps !== undefined ? JSON.stringify(corps) : undefined,
  }), env);
  const codeDuMail = () => { const m = /code de connexion à Garage Manifest : (\d{6})/.exec(mails[mails.length - 1].text); return m && m[1]; };
  const connecter = async (email) => {
    ip++;
    await appel('POST', '/auth/code', { corps: { email } });
    const r = await appel('POST', '/auth/session', { corps: { email, code: codeDuMail() } });
    return (await r.json()).session;
  };
  const faux = (code) => String((Number(code) + 1) % 1e6).padStart(6, '0');

  /* CORS et origine */
  let r = await appel('OPTIONS', '/garage');
  v('CORS : pré-vol limité à l\'origine de l\'app', r.status === 204 && r.headers.get('Access-Control-Allow-Origin') === 'https://app.test');
  r = await worker.fetch(new Request('https://api.test/auth/code', { method: 'POST', headers: { Origin: 'https://pirate.test', 'Content-Type': 'application/json' }, body: '{"email":"a@b.fr"}' }), env);
  v('origine étrangère refusée (403)', r.status === 403);

  /* Code par e-mail */
  r = await appel('POST', '/auth/code', { corps: { email: 'pas-une-adresse' } });
  v('e-mail invalide refusé (400)', r.status === 400);
  r = await appel('POST', '/auth/code', { corps: { email: '  Alice@Exemple.FR ' } });
  const reponse1 = await r.text();
  v('demande de code acceptée', r.status === 200 && mails.length === 1);
  const code = codeDuMail();
  v('code à 6 chiffres, présent dans l\'objet du message (lisible dans la notification)', /^\d{6}$/.test(code) && mails[0].subject.startsWith(code));
  v('e-mail normalisé (minuscules, espaces retirés)', mails[0].to[0] === 'alice@exemple.fr');
  const enBase = sqlite.prepare('SELECT hash FROM codes').all().map(x => x.hash);
  v('code jamais stocké en clair (HMAC seulement)', enBase.length === 1 && /^[0-9a-f]{64}$/.test(enBase[0]) && !JSON.stringify(sqlite.prepare('SELECT * FROM codes').all()).includes(code));
  const { createHash } = require('crypto');
  v('… et pas en simple SHA-256 (qu\'on retrouverait en 10^6 essais hors ligne)',
    enBase[0] !== createHash('sha256').update(`alice@exemple.fr:${code}`).digest('hex') && enBase[0] !== createHash('sha256').update(code).digest('hex'));
  ip++;
  r = await appel('POST', '/auth/code', { corps: { email: 'inconnu@exemple.fr' } });
  v('anti-sondage : même réponse pour une adresse sans compte', r.status === 200 && (await r.text()) === reponse1);

  /* Session */
  r = await appel('POST', '/auth/session', { corps: { email: 'alice@exemple.fr', code: faux(code) } });
  v('code faux refusé', r.status === 400);
  r = await appel('POST', '/auth/session', { corps: { email: 'autre@exemple.fr', code } });
  v('le bon code ne vaut que pour SON adresse', r.status === 400);
  r = await appel('POST', '/auth/session', { corps: { email: 'ALICE@exemple.fr', code: ` ${code.slice(0, 3)} ${code.slice(3)} ` } });
  const sA = (await r.json()).session;
  v('le code ouvre une session (adresse normalisée, espaces tolérés)', r.status === 200 && typeof sA === 'string' && sA.length >= 40);
  r = await appel('POST', '/auth/session', { corps: { email: 'alice@exemple.fr', code } });
  v('code à usage unique (2e saisie refusée)', r.status === 400);
  v('aucune session stockée en clair', !sqlite.prepare('SELECT hash FROM sessions').all().some(x => x.hash === sA));

  ip++;
  await appel('POST', '/auth/code', { corps: { email: 'bob@exemple.fr' } });
  const codeExpire = codeDuMail();
  sqlite.prepare("UPDATE codes SET expire = ? WHERE email = 'bob@exemple.fr'").run(Date.now() - 1);
  r = await appel('POST', '/auth/session', { corps: { email: 'bob@exemple.fr', code: codeExpire } });
  v('code expiré refusé', r.status === 400);

  /* Force brute : 5 essais par code, y compris en rafale simultanée */
  ip = 50;
  await appel('POST', '/auth/code', { corps: { email: 'cible@exemple.fr' } });
  const codeCible = codeDuMail();
  for (let i = 0; i < 5; i++) { ip++; await appel('POST', '/auth/session', { corps: { email: 'cible@exemple.fr', code: faux(codeCible) } }); }
  ip++;
  r = await appel('POST', '/auth/session', { corps: { email: 'cible@exemple.fr', code: codeCible } });
  v('après 5 essais faux, même le BON code est refusé (code détruit)', r.status === 400);
  ip = 60;
  await appel('POST', '/auth/code', { corps: { email: 'rafale@exemple.fr' } });
  const codeRafale = codeDuMail();
  const rafale = await Promise.all(Array.from({ length: 30 }, (_, i) => { ip = 61 + i; return appel('POST', '/auth/session', { corps: { email: 'rafale@exemple.fr', code: faux(codeRafale) } }); }));
  const essais = sqlite.prepare("SELECT essais FROM codes WHERE email = 'rafale@exemple.fr'").get().essais;
  v('30 essais simultanés : le compteur plafonne à 5', essais === 5 && rafale.every(x => x.status === 400), essais);
  ip = 95;
  await appel('POST', '/auth/code', { corps: { email: 'double@exemple.fr' } });
  const ancien = codeDuMail();
  await appel('POST', '/auth/code', { corps: { email: 'double@exemple.fr' } });
  const nouveau = codeDuMail();
  r = ancien === nouveau ? null : await appel('POST', '/auth/session', { corps: { email: 'double@exemple.fr', code: ancien } });
  v('un nouveau code remplace l\'ancien (un seul code actif par adresse)', ancien === nouveau || r.status === 400);
  const courses = await Promise.all([0, 1, 2].map(() => appel('POST', '/auth/session', { corps: { email: 'double@exemple.fr', code: nouveau } })));
  v('bon code envoyé 3 fois simultanément : une seule session ouverte', courses.filter(x => x.status === 200).length === 1, courses.map(x => x.status).join(','));

  /* Uniformité du tirage : le code ne doit favoriser aucun chiffre */
  const src = fs.readFileSync(path.join(__dirname, 'cloud', 'compte-worker.js'), 'utf8');
  const codeAleatoire = new Function(/function codeAleatoire\(\) \{[\s\S]*?\n\}/.exec(src)[0] + '; return codeAleatoire;')();
  const tirages = Array.from({ length: 20000 }, codeAleatoire);
  const premiers = Array(10).fill(0); for (const c of tirages) premiers[c[0]]++;
  v('codes : toujours 6 chiffres, premier chiffre uniformément réparti (± 15 %)',
    tirages.every(c => /^\d{6}$/.test(c)) && premiers.every(n => Math.abs(n - 2000) < 300), premiers.join(','));
  const sansSecret = await worker.fetch(new Request('https://api.test/auth/code', { method: 'POST', headers: { Origin: 'https://app.test', 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.9.9.9' }, body: '{"email":"z@exemple.fr"}' }), { ...env, CODE_SECRET: '' });
  v('sans CODE_SECRET, le Worker refuse (500) plutôt que stocker un code faible', sansSecret.status === 500);

  /* Limite de débit */
  ip = 200;
  for (let i = 0; i < 3; i++) await appel('POST', '/auth/code', { corps: { email: 'limite@exemple.fr' } });
  ip = 201;
  r = await appel('POST', '/auth/code', { corps: { email: 'limite@exemple.fr' } });
  v('au-delà de 3 codes en 15 min pour une adresse : 429', r.status === 429);
  sqlite.prepare('UPDATE limites SET fenetre = ? WHERE compte = 3').run(Date.now() - 16 * 60 * 1000);
  let n429 = 0;
  for (let i = 0; i < 12; i++) { ip = 210 + i; const x = await appel('POST', '/auth/code', { corps: { email: 'limite@exemple.fr' } }); if (x.status === 429) n429++;
    sqlite.prepare('UPDATE limites SET fenetre = ? WHERE compte >= 3 AND fenetre > ?').run(Date.now() - 16 * 60 * 1000, Date.now() - 60000); }
  v('plafond journalier : pas plus de 10 codes par jour pour une adresse', n429 > 0, n429);
  /* n°6 : 50 demandes SIMULTANÉES pour une même adresse ne doivent pas passer le plafond */
  const avantRafale = mails.length;
  await Promise.all(Array.from({ length: 50 }, (_, i) => worker.fetch(new Request('https://api.test/auth/code', { method: 'POST',
    headers: { Origin: 'https://app.test', 'Content-Type': 'application/json', 'CF-Connecting-IP': `10.7.${i}.1` },
    body: JSON.stringify({ email: 'rafale-codes@exemple.fr' }) }), env)));
  const envoyes = mails.slice(avantRafale).filter(m => m.to[0] === 'rafale-codes@exemple.fr').length;
  v('50 demandes de code simultanées : pas plus de 3 codes envoyés (compteur atomique)', envoyes <= 3, envoyes);
  const clesLimites = sqlite.prepare('SELECT cle FROM limites').all().map(x => x.cle);
  v('compteurs de débit : ni adresse ni IP en clair (empreintes seulement)',
    clesLimites.length > 0 && clesLimites.every(k => /^[0-9a-f]{64}$/.test(k)), JSON.stringify(clesLimites.slice(0, 2)));

  /* Garage : lecture, écriture, conflit */
  r = await appel('GET', '/garage');
  v('sans session : 401', r.status === 401);
  r = await appel('GET', '/garage', { session: sA });
  v('aucune sauvegarde encore : 404', r.status === 404);
  r = await appel('PUT', '/garage', { session: sA, corps: { donnees: { spots: [] } } });
  v('écriture sans If-Match refusée (428)', r.status === 428);
  r = await appel('PUT', '/garage', { session: sA, corps: { donnees: { spots: [{ carId: 'ferrari-f40' }] } }, entetes: { 'If-Match': '0' } });
  v('première sauvegarde → version 1', r.status === 200 && (await r.json()).version === 1);
  r = await appel('PUT', '/garage', { session: sA, corps: { donnees: { spots: [] } }, entetes: { 'If-Match': '0' } });
  const conflit = await r.json();
  v('deux appareils : le second reçoit 409 et la version à jour', r.status === 409 && conflit.version === 1);
  r = await appel('PUT', '/garage', { session: sA, corps: { donnees: { spots: [{ carId: 'ferrari-f40' }, { carId: 'peugeot-205' }] } }, entetes: { 'If-Match': '1' } });
  v('écriture avec la bonne version → version 2', r.status === 200 && (await r.json()).version === 2);
  r = await appel('GET', '/garage', { session: sA });
  const g = await r.json();
  v('relecture : données et version conservées', g.version === 2 && g.donnees.spots.length === 2);

  /* Photos */
  const octets = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3, 4, 5]);
  const sha = require('crypto').createHash('sha256').update(octets).digest('hex');
  r = await appel('POST', '/photos/manquantes', { session: sA, corps: { empreintes: [sha, 'pas-une-empreinte'] } });
  v('photo absente signalée manquante (empreintes invalides ignorées)', JSON.stringify((await r.json()).manquantes) === JSON.stringify([sha]));
  r = await appel('PUT', `/photos/${'0'.repeat(64)}`, { session: sA, brut: octets, type: 'image/jpeg' });
  v('photo dont le contenu ne correspond pas à l\'empreinte : refusée', r.status === 400);
  r = await appel('PUT', `/photos/${sha}`, { session: sA, brut: octets, type: 'text/html' });
  v('type non image refusé (415)', r.status === 415);
  r = await appel('PUT', `/photos/${sha}`, { session: sA, brut: octets, type: 'image/jpeg' });
  v('photo envoyée (201)', r.status === 201);
  r = await appel('POST', '/photos/manquantes', { session: sA, corps: { empreintes: [sha] } });
  v('photo déjà présente : plus rien à envoyer', (await r.json()).manquantes.length === 0);
  r = await appel('GET', `/photos/${sha}`, { session: sA });
  const relu = new Uint8Array(await r.arrayBuffer());
  v('photo relue à l\'identique', r.status === 200 && relu.length === octets.length && relu.every((b, i) => b === octets[i]));

  /* Cloisonnement entre comptes */
  const sB = await connecter('bruno@exemple.fr');
  r = await appel('GET', `/photos/${sha}`, { session: sB });
  v('un autre compte ne voit pas la photo', r.status === 404);
  r = await appel('GET', '/garage', { session: sB });
  v('un autre compte ne voit pas le garage', r.status === 404);

  /* Gros garages et grosses collections (défauts n°2, 5, 8, 10 de /code-review) */
  const sC = await connecter('charge@exemple.fr');
  const idC = sqlite.prepare("SELECT id FROM utilisateurs WHERE email = 'charge@exemple.fr'").get().id;
  const hexa = (i) => require('crypto').createHash('sha256').update('photo-' + i).digest('hex');
  const empreintes = Array.from({ length: 1200 }, (_, i) => hexa(i));
  for (const e of empreintes.slice(0, 1100)) env.PHOTOS._m.set(`u/${idC}/${e}`, { octets: new Uint8Array([1]), httpMetadata: {} });
  const appelsAvant = env.PHOTOS._appels.n;
  r = await appel('POST', '/photos/manquantes', { session: sC, corps: { empreintes } });
  const manq = r.status === 200 ? (await r.json()).manquantes : null;
  v('1 200 photos dont 1 100 déjà au cloud : exactement les 100 manquantes', manq && manq.length === 100 && manq.every(e => empreintes.slice(1100).includes(e)), manq && manq.length);
  const appelsR2 = env.PHOTOS._appels.n - appelsAvant;
  v('… en quelques appels au stockage, pas un par photo (limite Cloudflare : 1 000 par requête)', appelsR2 <= 5, appelsR2);
  r = await appel('POST', '/photos/manquantes', { session: sC, corps: { empreintes: Array.from({ length: 5001 }, (_, i) => hexa(i)) } });
  v('liste trop longue : refus explicite (413), jamais une troncature silencieuse', r.status === 413, r.status);
  for (const e of empreintes.slice(0, 1100)) env.PHOTOS._m.delete(`u/${idC}/${e}`);
  r = await appel('PUT', '/garage', { session: sC, corps: { donnees: null }, entetes: { 'If-Match': '0' } });
  v('garage « null » refusé (400)', r.status === 400, r.status);
  r = await appel('PUT', '/garage', { session: sC, corps: { donnees: [1, 2] }, entetes: { 'If-Match': '0' } });
  v('garage « tableau » refusé (400)', r.status === 400, r.status);
  r = await appel('PUT', '/garage', { session: sC, corps: { donnees: { spots: [], note: 'é'.repeat(1_000_000) } }, entetes: { 'If-Match': '0' } });
  const msgTaille = r.status === 413 ? (await r.json()).erreur : '';
  v('garage de plus de 1,9 Mo (octets, accents compris) : 413 explicite, pas « Erreur interne »', r.status === 413 && /volumineux/i.test(msgTaille), `${r.status} ${msgTaille}`);
  await appel('DELETE', '/compte', { session: sC });

  /* Quota de stockage (défaut n°9) — valeurs réduites pour le banc via les variables du Worker */
  const sQ = await connecter('quota@exemple.fr');
  const photoQ = (i, n = 8) => { const o = new Uint8Array(n); o[0] = 0xff; o[1] = 0xd8; o[2] = i & 255; o[3] = (i >> 8) & 255; return o; };
  const shaQ = (o) => require('crypto').createHash('sha256').update(o).digest('hex');
  env.QUOTA_PHOTOS = '3';
  const res4 = [];
  for (let i = 0; i < 4; i++) { const o = photoQ(i); res4.push((await appel('PUT', `/photos/${shaQ(o)}`, { session: sQ, brut: o, type: 'image/jpeg' })).status); }
  v('quota photos : 3 acceptées, la 4e refusée (507)', JSON.stringify(res4) === '[201,201,201,507]', JSON.stringify(res4));
  r = await appel('PUT', `/photos/${shaQ(photoQ(0))}`, { session: sQ, brut: photoQ(0), type: 'image/jpeg' });
  v('… renvoyer une photo déjà stockée ne compte pas (201, idempotent)', r.status === 201, r.status);
  const lireErreur = async (x) => { try { return JSON.parse(await x.text()).erreur || ''; } catch { return ''; } };
  const msgQuota = await lireErreur(await appel('PUT', `/photos/${shaQ(photoQ(9))}`, { session: sQ, brut: photoQ(9), type: 'image/jpeg' }));
  v('… avec un message explicite', /quota/i.test(msgQuota || ''), msgQuota);
  // Rafale : 10 envois simultanés avec 1 place restante (après suppression du compte et recréation)
  await appel('DELETE', '/compte', { session: sQ });
  v('suppression du compte : son compteur de stockage disparaît aussi', !sqlite.prepare('SELECT 1 FROM usages').all().some(() => true) || !sqlite.prepare("SELECT 1 FROM usages u JOIN utilisateurs x ON x.id = u.utilisateur WHERE x.email = 'quota@exemple.fr'").get());
  ip = 250; const sR = await connecter('rafale-photos@exemple.fr');
  env.QUOTA_PHOTOS = '4';
  const rafaleP = await Promise.all(Array.from({ length: 10 }, (_, i) => appel('PUT', `/photos/${shaQ(photoQ(100 + i))}`, { session: sR, brut: photoQ(100 + i), type: 'image/jpeg' })));
  const acceptees = rafaleP.filter(x => x.status === 201).length;
  const idR = sqlite.prepare("SELECT id FROM utilisateurs WHERE email = 'rafale-photos@exemple.fr'").get().id;
  const stockees = [...env.PHOTOS._m.keys()].filter(k => k.startsWith(`u/${idR}/`)).length;
  v('10 envois simultanés, quota de 4 : exactement 4 acceptés et stockés (réservation atomique)', acceptees === 4 && stockees === 4, `${acceptees} acceptés, ${stockees} stockés`);
  delete env.QUOTA_PHOTOS;
  // Quota en octets
  env.QUOTA_OCTETS = '20';
  r = await appel('PUT', `/photos/${shaQ(photoQ(500, 16))}`, { session: sR, brut: photoQ(500, 16), type: 'image/jpeg' });
  v('quota octets : une photo qui dépasse le volume restant est refusée (507)', r.status === 507, r.status);
  delete env.QUOTA_OCTETS;
  // Plafond global du service
  env.QUOTA_GLOBAL_OCTETS = '10';
  r = await appel('PUT', `/photos/${shaQ(photoQ(600))}`, { session: sR, brut: photoQ(600), type: 'image/jpeg' });
  v('plafond global atteint : plus aucune photo acceptée, message distinct (507)', r.status === 507 && /service/i.test(await lireErreur(r)), r.status);
  delete env.QUOTA_GLOBAL_OCTETS;
  await appel('DELETE', '/compte', { session: sR });

  /* Mode essai sans R2 (offre gratuite) : collection sauvée, photos refusées en 501 */
  const r2Reel = env.PHOTOS; delete env.PHOTOS;
  ip = 270; const sE = await connecter('essai@exemple.fr');
  v('sans R2 : la connexion par code fonctionne', !!sE);
  r = await appel('PUT', '/garage', { session: sE, corps: { donnees: { spots: [{ carId: 'ferrari-f40', photos: [shaQ(photoQ(900))] }] } }, entetes: { 'If-Match': '0' } });
  v('sans R2 : la collection se sauvegarde', r.status === 200, r.status);
  r = await appel('GET', '/garage', { session: sE });
  const gE = r.status === 200 ? await r.json() : null;
  v('sans R2 : la collection se relit, empreintes de photos conservées (pour le jour où R2 arrive)', gE && gE.donnees.spots[0].photos[0] === shaQ(photoQ(900)));
  r = await appel('POST', '/photos/manquantes', { session: sE, corps: { empreintes: [shaQ(photoQ(900))] } });
  const corpsE = r.status === 501 ? await r.json() : {};
  v('sans R2 : liste des photos manquantes → 501, marquée « photos:false » (état stable, pas une panne)', r.status === 501 && corpsE.photos === false, r.status);
  r = await appel('PUT', `/photos/${shaQ(photoQ(900))}`, { session: sE, brut: photoQ(900), type: 'image/jpeg' });
  const r2b = await appel('GET', `/photos/${shaQ(photoQ(900))}`, { session: sE });
  v('sans R2 : envoi et lecture de photo → 501, sans erreur interne', r.status === 501 && r2b.status === 501, `${r.status} / ${r2b.status}`);
  r = await appel('POST', '/photos/manquantes', { corps: { empreintes: [] } });
  v('sans R2 : sans session, toujours 401 d\'abord (la configuration ne se lit pas anonymement)', r.status === 401, r.status);
  r = await appel('GET', '/compte/export', { session: sE });
  const exE = r.status === 200 ? await r.json() : {};
  v('sans R2 : l\'export RGPD fonctionne (liste de photos vide)', r.status === 200 && Array.isArray(exE.photos) && exE.photos.length === 0 && !!exE.garage, r.status);
  r = await appel('DELETE', '/compte', { session: sE });
  v('sans R2 : la suppression du compte fonctionne et efface tout', r.status === 200 && !sqlite.prepare("SELECT 1 FROM utilisateurs WHERE email='essai@exemple.fr'").get(), r.status);
  env.PHOTOS = r2Reel;

  /* Connexion Google (14/10) : jetons VRAIMENT signés, valides ou piégés */
  const CLIENT = 'client-banc.apps.googleusercontent.com';
  const b64u = (x) => Buffer.from(x).toString('base64url');
  let nJeton = 0, ipG = 0;
  const jetonGoogle = (champs = {}, { cle = cleGoogle1, entete = {}, signature } = {}) => {
    const s = Math.floor(Date.now() / 1000);
    const h = b64u(JSON.stringify({ alg: 'RS256', kid: 'banc-1', typ: 'JWT', ...entete }));
    const p = b64u(JSON.stringify({ iss: 'https://accounts.google.com', aud: CLIENT, sub: '1000000000000000000001', email: 'pilote@gmail.com',
      email_verified: true, iat: s, exp: s + 3600, jti: String(++nJeton), ...champs }));
    return `${h}.${p}.${signature !== undefined ? signature : b64u(signer('sha256', Buffer.from(`${h}.${p}`), cle.privateKey))}`;
  };
  const viaGoogle = (credential, { ipFixe, w = worker } = {}) => w.fetch(new Request('https://api.test/auth/google', { method: 'POST',
    headers: { Origin: 'https://app.test', 'Content-Type': 'application/json', 'CF-Connecting-IP': ipFixe || `10.4.${++ipG % 250}.${ipG >> 8}` },
    body: JSON.stringify({ credential }) }), env);
  const nbComptes = (email) => sqlite.prepare('SELECT COUNT(*) AS n FROM utilisateurs WHERE email = ?').get(email).n;
  const idDe = (email) => (sqlite.prepare('SELECT id FROM utilisateurs WHERE email = ?').get(email) || {}).id;

  r = await viaGoogle(jetonGoogle());
  v('Google · non configuré (pas de GOOGLE_CLIENT_ID) : 501 « google:false », état stable comme le stockage photo absent',
    r.status === 501 && (await r.json()).google === false && lecturesCles === 0, r.status);
  env.GOOGLE_CLIENT_ID = CLIENT;

  r = await viaGoogle(jetonGoogle());
  const g1 = r.status === 200 ? await r.json() : {};
  v('Google · jeton valide : session ouverte, compte créé à l\'adresse Google', r.status === 200 && g1.email === 'pilote@gmail.com' && nbComptes('pilote@gmail.com') === 1, r.status);
  v('Google · la session donne accès au garage comme une connexion par code', (await appel('GET', '/garage', { session: g1.session })).status === 404);
  const ident = sqlite.prepare('SELECT * FROM identites').all();
  v('Google · identité reliée, identifiant Google jamais stocké en clair (empreinte seulement)',
    ident.length === 1 && /^[0-9a-f]{64}$/.test(ident[0].sujet) && !JSON.stringify(sqlite.prepare('SELECT * FROM identites').all()).includes('1000000000000000000001'));
  r = await viaGoogle(jetonGoogle());
  v('Google · reconnexion (nouveau jeton) : même compte, aucun doublon', r.status === 200 && nbComptes('pilote@gmail.com') === 1 && sqlite.prepare('SELECT COUNT(*) AS n FROM identites').get().n === 1);
  r = await viaGoogle(jetonGoogle({ email: 'nouvelle-adresse@gmail.com' }));
  v('Google · l\'adresse Google change : on retrouve le compte par l\'identifiant Google, pas par l\'e-mail',
    r.status === 200 && (await r.json()).email === 'pilote@gmail.com' && nbComptes('nouvelle-adresse@gmail.com') === 0);

  // Rejeu et rafale
  const unique = jetonGoogle();
  const premier = await viaGoogle(unique), rejoue = await viaGoogle(unique);
  v('Google · jeton à usage unique : rejoué, il est refusé', premier.status === 200 && rejoue.status === 400, `${premier.status} / ${rejoue.status}`);
  /* Revue de sécurité du 14/10 : une même signature s'écrit de plusieurs façons en
     base64 (« = » final, alphabet standard, espace, bits de remplissage du dernier
     caractère). Aucune de ces réécritures ne doit passer pour un jeton neuf. */
  const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const remplissage = (s) => s.slice(0, -1) + ALPHA[ALPHA.indexOf(s[s.length - 1]) ^ 1];   // même octets décodés
  const [hU, pU, sU] = unique.split('.');
  const variantes = {
    '« = » ajoutés': `${hU}.${pU}.${sU}==`,
    'alphabet standard (+ /)': `${hU}.${pU}.${sU.replace(/-/g, '+').replace(/_/g, '/')}`,
    'espace inséré': `${hU}.${pU}.${sU.slice(0, 10)} ${sU.slice(10)}`,
    'bits de remplissage du dernier caractère': `${hU}.${pU}.${remplissage(sU)}`,
  };
  const statutsVariantes = {};
  for (const [nom, j] of Object.entries(variantes)) statutsVariantes[nom] = (await viaGoogle(j)).status;
  v('Google · jeton déjà utilisé, réécrit autrement (« = », alphabet, espace, bits de remplissage) : toujours refusé',
    Object.values(statutsVariantes).every(s => s === 400), JSON.stringify(statutsVariantes));
  const autreJeton = jetonGoogle(); const [hA, pA, sA2] = autreJeton.split('.');
  const deuxEcritures = [await viaGoogle(`${hA}.${pA}.${remplissage(sA2)}`), await viaGoogle(autreJeton)];
  v('… et dans l\'autre sens (réécriture d\'abord, original ensuite) : une seule session', deuxEcritures.filter(x => x.status === 200).length === 1,
    deuxEcritures.map(x => x.status).join(','));
  // Google n'émet que du base64url sans « = » : tout autre format est refusé d'emblée, même jamais utilisé.
  const [hN, pN, sN] = jetonGoogle().split('.');
  const formatsHors = [`${hN}.${pN}.${sN}==`, `${hN}.${pN}.${sN.replace(/-/g, '+').replace(/_/g, '/')}+`];
  const statutsHors = []; for (const j of formatsHors) statutsHors.push((await viaGoogle(j)).status);
  v('Google · format strict : un jeton neuf écrit hors base64url (« = », « + / ») est refusé', statutsHors.every(s => s === 400), statutsHors.join(','));
  const rafaleG = jetonGoogle();
  const rg = await Promise.all(Array.from({ length: 8 }, () => viaGoogle(rafaleG)));
  v('Google · même jeton envoyé 8 fois simultanément : une seule session', rg.filter(x => x.status === 200).length === 1, rg.map(x => x.status).join(','));

  // Jetons piégés : chacun doit être refusé
  const sessionsAvant = sqlite.prepare('SELECT COUNT(*) AS n FROM sessions').get().n;
  const [hV, pV, sV0] = jetonGoogle().split('.');
  const pModifiee = b64u(JSON.stringify({ ...JSON.parse(Buffer.from(pV, 'base64url')), sub: 'autre-personne', email: 'victime@gmail.com' }));
  const pieges = {
    'charge modifiée après signature (autre personne)': `${hV}.${pModifiee}.${sV0}`,
    'signé par une autre clé que Google': jetonGoogle({}, { cle: clePirate }),
    'algorithme « none », sans signature': jetonGoogle({}, { entete: { alg: 'none' }, signature: '' }),
    'algorithme HS256 (clé publique utilisée comme secret)': jetonGoogle({}, { entete: { alg: 'HS256' } }),
    'destiné à une autre application (aud)': jetonGoogle({ aud: 'autre-app.apps.googleusercontent.com' }),
    'émis par un autre que Google (iss)': jetonGoogle({ iss: 'https://pirate.test' }),
    'expiré': jetonGoogle({ exp: Math.floor(Date.now() / 1000) - 3600, iat: Math.floor(Date.now() / 1000) - 7200 }),
    'émis dans le futur': jetonGoogle({ iat: Math.floor(Date.now() / 1000) + 3600, exp: Math.floor(Date.now() / 1000) + 7200 }),
    'adresse non vérifiée par Google': jetonGoogle({ sub: '2000000000000000000002', email: 'nonverifiee@gmail.com', email_verified: false }),
    'pas un jeton': 'abc.def',
  };
  const statutsPieges = {};
  for (const [nom, j] of Object.entries(pieges)) statutsPieges[nom] = (await viaGoogle(j)).status;
  v('Google · 10 jetons piégés (signature, clé, algorithme, destinataire, émetteur, dates, adresse) : tous refusés (400)',
    Object.values(statutsPieges).every(s => s === 400), JSON.stringify(statutsPieges));
  v('… sans ouvrir la moindre session ni créer de compte',
    sqlite.prepare('SELECT COUNT(*) AS n FROM sessions').get().n === sessionsAvant && nbComptes('victime@gmail.com') === 0 && nbComptes('nonverifiee@gmail.com') === 0);
  const corpsRefus = await (await viaGoogle(jetonGoogle({ aud: 'x' }))).text();
  v('… et sans dire au client pourquoi (raison dans le journal seulement)', /Connexion Google refusée/.test(corpsRefus) && !/destinataire|aud/i.test(corpsRefus), corpsRefus);

  // Clés : rotation suivie, clé inconnue sans emballement
  const lecturesAvant = lecturesCles;
  for (let i = 0; i < 3; i++) await viaGoogle(jetonGoogle({}, { entete: { kid: 'kid-au-hasard-' + i } }));
  v('Google · clé inconnue (kid au hasard) : refusée, sans réinterroger Google à chaque requête', lecturesCles === lecturesAvant, lecturesCles - lecturesAvant);
  clesServies.push(jwk(cleGoogle2, 'banc-2'));
  const nowReel = Date.now; Date.now = () => nowReel() + 61_000;
  r = await viaGoogle(jetonGoogle({}, { cle: cleGoogle2, entete: { kid: 'banc-2' } }));
  Date.now = nowReel;
  v('Google · rotation des clés : une nouvelle clé publiée est relue et acceptée', r.status === 200 && lecturesCles === lecturesAvant + 1, `${r.status}, ${lecturesCles - lecturesAvant} relecture`);
  const worker2 = (await import('file://' + tmp + '?cles-injoignables')).default;    // module neuf : cache de clés vide
  clesInjoignables = true;
  r = await viaGoogle(jetonGoogle(), { w: worker2 });
  clesInjoignables = false;
  v('Google · clés de Google injoignables : 503 explicite (pas « Erreur interne »), le code par e-mail reste proposé',
    r.status === 503 && /code par e-mail/.test((await r.json()).erreur), r.status);

  // Liaison avec un compte créé par code e-mail
  const sGmail = await connecter('liaison@gmail.com');
  await appel('PUT', '/garage', { session: sGmail, corps: { donnees: { spots: [{ carId: 'alpine-a110' }] } }, entetes: { 'If-Match': '0' } });
  r = await viaGoogle(jetonGoogle({ sub: '3000000000000000000003', email: 'Liaison@Gmail.com' }));
  const gLiaison = r.status === 200 ? await r.json() : {};
  const garageLie = gLiaison.session ? await (await appel('GET', '/garage', { session: gLiaison.session })).json() : {};
  v('Google · compte déjà créé par code, adresse Gmail : même compte, même garage (Google fait autorité sur Gmail)',
    r.status === 200 && nbComptes('liaison@gmail.com') === 1 && garageLie.donnees && garageLie.donnees.spots[0].carId === 'alpine-a110', r.status);
  await connecter('pro@entreprise.fr');
  r = await viaGoogle(jetonGoogle({ sub: '4000000000000000000004', email: 'pro@entreprise.fr' }));
  const corpsLier = r.status === 409 ? await r.json() : {};
  v('Google · compte déjà créé par code, adresse NON Gmail sans domaine géré : 409 « lier », aucune prise du compte',
    r.status === 409 && corpsLier.lier === true && !sqlite.prepare('SELECT 1 FROM identites WHERE utilisateur = ?').get(idDe('pro@entreprise.fr')), r.status);
  r = await viaGoogle(jetonGoogle({ sub: '5000000000000000000005', email: 'pro@entreprise.fr', hd: 'entreprise.fr' }));
  v('Google · même adresse, domaine géré par Google (hd) : relié au compte existant', r.status === 200 && nbComptes('pro@entreprise.fr') === 1
    && !!sqlite.prepare('SELECT 1 FROM identites WHERE utilisateur = ?').get(idDe('pro@entreprise.fr')), r.status);
  /* Compte « piégé d'avance » (revue de sécurité du 14/10). Un tiers qui a gardé un
     compte Google sur une adresse NON Gmail (adresse recyclée, ancien poste, boîte
     piratée un temps) ne doit pas créer le compte AVANT la vraie personne, pour y
     revenir quand elle y aura mis son garage. Le banc affirmait jusqu'ici « rien à
     prendre à personne » : c'était faux. */
  r = await viaGoogle(jetonGoogle({ sub: '6000000000000000000006', email: 'victime@orange.fr' }));
  const corpsPiege = r.status === 409 ? await r.json() : {};
  v('Google · adresse NON Gmail, sans compte : aucun compte créé (409 « lier ») — Google n\'en est pas maître',
    r.status === 409 && corpsPiege.lier === true && nbComptes('victime@orange.fr') === 0, r.status);
  ip = 420;
  const sVictime = await connecter('victime@orange.fr');
  await appel('PUT', '/garage', { session: sVictime, corps: { donnees: { spots: [{ carId: 'x', coords: { lat: 48.85, lng: 2.35 } }] } }, entetes: { 'If-Match': '0' } });
  r = await viaGoogle(jetonGoogle({ sub: '6000000000000000000006', email: 'victime@orange.fr' }));
  v('… la vraie personne s\'inscrit ensuite par code et sauvegarde : le tiers, revenu par Google, n\'ouvre pas son compte',
    r.status === 409 && !sqlite.prepare('SELECT 1 FROM identites WHERE utilisateur = ?').get(idDe('victime@orange.fr')), r.status);
  await appel('DELETE', '/compte', { session: sVictime });
  r = await viaGoogle(jetonGoogle({ sub: '6100000000000000000061', email: 'nouveau@entreprise.fr', hd: 'entreprise.fr' }));
  v('Google · domaine géré par Google (hd), sans compte : compte créé (Google en est maître)', r.status === 200 && nbComptes('nouveau@entreprise.fr') === 1, r.status);
  ip = 400;
  const sCodeSurGoogle = await connecter('pilote@gmail.com');
  v('Google · compte créé par Google, puis connexion par code : même compte (l\'e-mail reste le canal de secours)',
    !!sCodeSurGoogle && nbComptes('pilote@gmail.com') === 1);

  // Limite de débit
  const statutsDebit = [];
  for (let i = 0; i < 21; i++) statutsDebit.push((await viaGoogle('abc.def.ghi', { ipFixe: '10.66.66.66' })).status);
  v('Google · plus de 20 tentatives en 15 min depuis une IP : 429', statutsDebit[19] === 400 && statutsDebit[20] === 429, statutsDebit.slice(18).join(','));

  // Export, suppression (clés étrangères actives, comme D1), purge
  r = await appel('GET', '/compte/export', { session: g1.session });
  const exG = r.status === 200 ? await r.json() : {};
  v('Google · export RGPD : le moyen de connexion relié est listé (fournisseur et date)',
    Array.isArray(exG.connexions) && exG.connexions.length === 1 && exG.connexions[0].fournisseur === 'google' && !('sujet' in exG.connexions[0]), JSON.stringify(exG.connexions));
  const idPiloteG = idDe('pilote@gmail.com');
  r = await appel('DELETE', '/compte', { session: g1.session });
  v('Google · suppression d\'un compte relié à Google : réussie malgré les clés étrangères, identité effacée',
    r.status === 200 && !idDe('pilote@gmail.com') && !sqlite.prepare('SELECT 1 FROM identites WHERE utilisateur = ?').get(idPiloteG), r.status);
  r = await viaGoogle(jetonGoogle());
  v('Google · après suppression, reconnexion Google : compte NEUF (rien de l\'ancien ne revient)', r.status === 200 && idDe('pilote@gmail.com') && idDe('pilote@gmail.com') !== idPiloteG);
  sqlite.prepare("INSERT INTO jetons_consommes (empreinte, expire) VALUES ('perime', ?)").run(Date.now() - 1);
  const jetonsVivants = sqlite.prepare('SELECT COUNT(*) AS n FROM jetons_consommes WHERE expire > ?').get(Date.now()).n;
  await worker.scheduled({ cron: '17 3 * * *' }, env, { waitUntil() {} });
  v('Google · purge nocturne : jetons expirés effacés, les autres gardés (rejeu toujours bloqué)',
    !sqlite.prepare("SELECT 1 FROM jetons_consommes WHERE empreinte = 'perime'").get() && sqlite.prepare('SELECT COUNT(*) AS n FROM jetons_consommes').get().n === jetonsVivants);
  r = await appel('DELETE', '/compte', { session: gLiaison.session });
  v('Google · suppression d\'un compte avec garage ET identité Google : tout part', r.status === 200 && !idDe('liaison@gmail.com'), r.status);
  delete env.GOOGLE_CLIENT_ID;

  /* RGPD : export, déconnexion, suppression */
  r = await appel('GET', '/compte/export', { session: sA });
  const ex = await r.json();
  v('export complet (e-mail, garage, liste des photos)', ex.email === 'alice@exemple.fr' && ex.garage.version === 2 && ex.photos[0] === sha);
  r = await appel('POST', '/auth/deconnexion', { session: sB });
  r = await appel('GET', '/garage', { session: sB });
  v('après déconnexion, la session ne vaut plus rien', r.status === 401);
  r = await appel('DELETE', '/compte', { session: sA });
  const sup = await r.json();
  v('suppression du compte', r.status === 200 && sup.photosEffacees === 1);
  v('plus aucune trace : utilisateur, garage, sessions, photos', !sqlite.prepare("SELECT 1 FROM utilisateurs WHERE email='alice@exemple.fr'").get()
    && !sqlite.prepare('SELECT 1 FROM garages').get() && ![...env.PHOTOS._m.keys()].length);
  r = await appel('GET', '/garage', { session: sA });
  v('la session du compte supprimé est invalide', r.status === 401);

  /* Purge nocturne (scheduled) : l'échu part, le vivant reste */
  ip = 300;
  await appel('POST', '/auth/code', { corps: { email: 'vivant@exemple.fr' } });
  const codeVivant = codeDuMail();
  r = await appel('POST', '/auth/code', { corps: { email: 'fantome@exemple.fr' } });
  sqlite.prepare("UPDATE codes SET expire = ? WHERE email = 'fantome@exemple.fr'").run(Date.now() - 1);
  r = await appel('POST', '/auth/session', { corps: { email: 'vivant@exemple.fr', code: codeVivant } });
  const sV = (await r.json()).session;
  sqlite.prepare("INSERT INTO sessions (hash, utilisateur, expire, cree) SELECT 'echue', utilisateur, ?, cree FROM sessions LIMIT 1").run(Date.now() - 1);
  sqlite.prepare("UPDATE limites SET fenetre = ? WHERE rowid = (SELECT MIN(rowid) FROM limites)").run(Date.now() - 25 * 3600 * 1000);
  const avantPurge = sqlite.prepare('SELECT COUNT(*) AS n FROM limites').get().n;
  const purge = await worker.scheduled({ cron: '17 3 * * *' }, env, { waitUntil() {} });
  v('purge : code expiré effacé (adresse d\'une personne sans compte)',
    !sqlite.prepare("SELECT 1 FROM codes WHERE email = 'fantome@exemple.fr'").get());
  v('purge : session échue effacée, session valide conservée',
    !sqlite.prepare("SELECT 1 FROM sessions WHERE hash = 'echue'").get() && (await appel('GET', '/garage', { session: sV })).status === 404);
  v('purge : compteur de débit hors fenêtre effacé, les autres gardés',
    purge.limites >= 1 && sqlite.prepare('SELECT COUNT(*) AS n FROM limites').get().n === avantPurge - purge.limites && avantPurge - purge.limites > 0, JSON.stringify(purge));

  globalThis.fetch = fetchReel; try { fs.unlinkSync(tmp); } catch {}
  let ko = 0; for (const x of res) { if (!x.ok) ko++; console.log(`  ${x.ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${x.t}${!x.ok && x.d != null ? '  → ' + x.d : ''}`); }
  console.log(`\n  ${res.length - ko} passé(s) · ${ko} échec(s)`); process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
