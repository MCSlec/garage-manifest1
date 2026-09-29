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
    put: compter(async (k, octets, o = {}) => { m.set(k, { octets: new Uint8Array(octets), httpMetadata: o.httpMetadata || {} }); }),
    get: compter(async (k) => m.has(k) ? { body: m.get(k).octets, httpMetadata: m.get(k).httpMetadata } : null),
    head: compter(async (k) => m.has(k) ? { key: k } : null),
    delete: compter(async (k) => { for (const x of [].concat(k)) m.delete(x); }),
    /* Comme le vrai R2 : 1 000 objets au plus par page, suite par curseur. */
    list: compter(async ({ prefix, cursor }) => { const toutes = [...m.keys()].filter(k => k.startsWith(prefix)).sort();
      const debut = Number(cursor || 0), page = toutes.slice(debut, debut + 1000), fin = debut + page.length;
      return { objects: page.map(key => ({ key })), truncated: fin < toutes.length, cursor: fin < toutes.length ? String(fin) : undefined }; }),
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
  const env = { DB: d1(sqlite), PHOTOS: r2(), APP_ORIGIN: 'https://app.test', MAIL_FROM: 'GM <x@app.test>', RESEND_API_KEY: 'test', CODE_SECRET: 'secret-de-banc-32-octets-minimum!' };

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
