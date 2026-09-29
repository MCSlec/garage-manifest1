#!/usr/bin/env node
/* ==========================================================================
   Banc SERVEUR — cloud/compte-worker.js (comptes et sauvegarde cloud)
   --------------------------------------------------------------------------
   Exécute le VRAI code du Worker dans Node, avec :
     · une base SQLite en mémoire (node:sqlite) qui imite l'API D1 ;
     · un stockage en mémoire qui imite l'API R2 ;
     · l'envoi d'e-mail (Resend) intercepté : on lit le lien reçu.
   Rien n'est déployé, rien ne sort sur le réseau.

   Ce que le banc garantit : le lien est à usage unique et expire ; aucun
   jeton n'est stocké en clair ; on ne peut pas sonder qui est inscrit ; les
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
  const lier = (sql, args = []) => ({
    bind: (...a) => lier(sql, a),
    first: async () => sqlite.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
    run: async () => { const r = sqlite.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
  });
  return { prepare: (sql) => lier(sql), batch: async (stmts) => Promise.all(stmts.map(s => s.run())) };
}
/* ---- R2 simulé ---------------------------------------------------------- */
function r2() {
  const m = new Map();
  return {
    _m: m,
    put: async (k, octets, o = {}) => { m.set(k, { octets: new Uint8Array(octets), httpMetadata: o.httpMetadata || {} }); },
    get: async (k) => m.has(k) ? { body: m.get(k).octets, httpMetadata: m.get(k).httpMetadata } : null,
    head: async (k) => m.has(k) ? { key: k } : null,
    delete: async (k) => { for (const x of [].concat(k)) m.delete(x); },
    list: async ({ prefix }) => ({ objects: [...m.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })), truncated: false }),
  };
}

const res = []; const v = (t, ok, d) => res.push({ t, ok: !!ok, d });

(async () => {
  // Le Worker est un module ES : on l'importe depuis une copie .mjs.
  const tmp = path.join(os.tmpdir(), `compte-worker-${process.pid}.mjs`);
  fs.copyFileSync(path.join(__dirname, 'cloud', 'compte-worker.js'), tmp);
  const worker = (await import('file://' + tmp)).default;

  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(fs.readFileSync(path.join(__dirname, 'cloud', 'schema.sql'), 'utf8'));
  const env = { DB: d1(sqlite), PHOTOS: r2(), APP_ORIGIN: 'https://app.test', APP_URL: 'https://app.test/garage/', MAIL_FROM: 'GM <x@app.test>', RESEND_API_KEY: 'test' };

  const mails = [];
  const fetchReel = globalThis.fetch;
  globalThis.fetch = async (url, opt) => {
    if (String(url).startsWith('https://api.resend.com/')) { mails.push(JSON.parse(opt.body)); return new Response('{"id":"x"}', { status: 200 }); }
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
  const jetonDuMail = () => { const m = /#connexion=([A-Za-z0-9_-]+)/.exec(mails[mails.length - 1].text); return m && m[1]; };
  const connecter = async (email) => {
    ip++;
    await appel('POST', '/auth/lien', { corps: { email } });
    const r = await appel('POST', '/auth/session', { corps: { jeton: jetonDuMail() } });
    return (await r.json()).session;
  };

  /* CORS et origine */
  let r = await appel('OPTIONS', '/garage');
  v('CORS : pré-vol limité à l\'origine de l\'app', r.status === 204 && r.headers.get('Access-Control-Allow-Origin') === 'https://app.test');
  r = await worker.fetch(new Request('https://api.test/auth/lien', { method: 'POST', headers: { Origin: 'https://pirate.test', 'Content-Type': 'application/json' }, body: '{"email":"a@b.fr"}' }), env);
  v('origine étrangère refusée (403)', r.status === 403);

  /* Lien magique */
  r = await appel('POST', '/auth/lien', { corps: { email: 'pas-une-adresse' } });
  v('e-mail invalide refusé (400)', r.status === 400);
  r = await appel('POST', '/auth/lien', { corps: { email: '  Alice@Exemple.FR ' } });
  const reponse1 = await r.text();
  v('demande de lien acceptée', r.status === 200 && mails.length === 1);
  v('le lien pointe vers l\'app, jeton dans le fragment (#)', mails[0].text.includes('https://app.test/garage/#connexion='));
  v('e-mail normalisé (minuscules, espaces retirés)', mails[0].to[0] === 'alice@exemple.fr');
  const jeton = jetonDuMail();
  const enBase = sqlite.prepare('SELECT hash FROM jetons_lien').all().map(x => x.hash);
  v('aucun jeton stocké en clair (empreinte seulement)', !enBase.includes(jeton) && enBase.every(h => /^[0-9a-f]{64}$/.test(h)));
  ip++;
  r = await appel('POST', '/auth/lien', { corps: { email: 'inconnu@exemple.fr' } });
  v('anti-sondage : même réponse pour une adresse sans compte', r.status === 200 && (await r.text()) === reponse1);

  /* Session */
  r = await appel('POST', '/auth/session', { corps: { jeton } });
  const sA = (await r.json()).session;
  v('le lien ouvre une session', r.status === 200 && typeof sA === 'string' && sA.length >= 40);
  r = await appel('POST', '/auth/session', { corps: { jeton } });
  v('lien à usage unique (2e clic refusé)', r.status === 400);
  ip++;
  await appel('POST', '/auth/lien', { corps: { email: 'bob@exemple.fr' } });
  const jetonExpire = jetonDuMail();
  sqlite.prepare('UPDATE jetons_lien SET expire = ? WHERE hash = (SELECT hash FROM jetons_lien ORDER BY rowid DESC LIMIT 1)').run(Date.now() - 1);
  r = await appel('POST', '/auth/session', { corps: { jeton: jetonExpire } });
  v('lien expiré refusé', r.status === 400);
  v('aucune session stockée en clair', !sqlite.prepare('SELECT hash FROM sessions').all().some(x => x.hash === sA));

  /* Limite de débit */
  ip = 200;
  for (let i = 0; i < 3; i++) await appel('POST', '/auth/lien', { corps: { email: 'cible@exemple.fr' } });
  ip = 201;
  r = await appel('POST', '/auth/lien', { corps: { email: 'cible@exemple.fr' } });
  v('au-delà de 3 liens en 15 min pour une adresse : 429', r.status === 429);
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
  await appel('POST', '/auth/lien', { corps: { email: 'vivant@exemple.fr' } });
  const jetonVivant = jetonDuMail();
  r = await appel('POST', '/auth/lien', { corps: { email: 'fantome@exemple.fr' } });
  sqlite.prepare("UPDATE jetons_lien SET expire = ? WHERE email = 'fantome@exemple.fr'").run(Date.now() - 1);
  r = await appel('POST', '/auth/session', { corps: { jeton: jetonVivant } });
  const sV = (await r.json()).session;
  sqlite.prepare("INSERT INTO sessions (hash, utilisateur, expire, cree) SELECT 'echue', utilisateur, ?, cree FROM sessions LIMIT 1").run(Date.now() - 1);
  sqlite.prepare("UPDATE limites SET fenetre = ? WHERE rowid = (SELECT MIN(rowid) FROM limites)").run(Date.now() - 16 * 60 * 1000);
  const avantPurge = sqlite.prepare('SELECT COUNT(*) AS n FROM limites').get().n;
  const purge = await worker.scheduled({ cron: '17 3 * * *' }, env, { waitUntil() {} });
  v('purge : jeton de lien expiré effacé (adresse d\'une personne sans compte)',
    !sqlite.prepare("SELECT 1 FROM jetons_lien WHERE email = 'fantome@exemple.fr'").get());
  v('purge : session échue effacée, session valide conservée',
    !sqlite.prepare("SELECT 1 FROM sessions WHERE hash = 'echue'").get() && (await appel('GET', '/garage', { session: sV })).status === 404);
  v('purge : compteur de débit hors fenêtre effacé, les autres gardés',
    purge.limites >= 1 && sqlite.prepare('SELECT COUNT(*) AS n FROM limites').get().n === avantPurge - purge.limites && avantPurge - purge.limites > 0, JSON.stringify(purge));

  globalThis.fetch = fetchReel; try { fs.unlinkSync(tmp); } catch {}
  let ko = 0; for (const x of res) { if (!x.ok) ko++; console.log(`  ${x.ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${x.t}${!x.ok && x.d != null ? '  → ' + x.d : ''}`); }
  console.log(`\n  ${res.length - ko} passé(s) · ${ko} échec(s)`); process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
