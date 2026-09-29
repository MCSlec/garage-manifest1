#!/usr/bin/env node
/* ==========================================================================
   Banc SERVEUR — ai-relay-worker.js (reconnaissance photo par IA)
   --------------------------------------------------------------------------
   Exécute le VRAI code du relais dans Node, avec une base D1 simulée
   (node:sqlite, AVEC latence : sans elle, les requêtes simultanées ne
   s'entremêlent jamais et un défaut de concurrence reste invisible) et
   l'API Anthropic interceptée : rien ne sort sur le réseau, aucun crédit
   n'est dépensé.

   Ce que le banc garantit : le relais ne répond qu'à l'app (origine) et
   qu'à sa seule route ; il refuse les images trop lourdes ou d'un format
   inattendu ; il plafonne les identifications par appareil (sans compte),
   par compte (session valide) et pour tout le service, y compris sous une
   rafale de requêtes simultanées ; il ne renvoie jamais de détail interne ;
   sans base de limites, il refuse de travailler plutôt que d'être ouvert.
   /notify n'existe plus.

   Usage : node banc-relais.js     (Node ≥ 22, aucune dépendance)
   ========================================================================== */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
process.removeAllListeners('warning');
const { DatabaseSync } = require('node:sqlite');

function d1(sqlite) {
  const latence = () => new Promise(ok => setImmediate(ok));
  const lier = (sql, args = []) => ({
    bind: (...a) => lier(sql, a),
    first: async () => { await latence(); return sqlite.prepare(sql).get(...args) ?? null; },
    all: async () => { await latence(); return { results: sqlite.prepare(sql).all(...args) }; },
    run: async () => { await latence(); const r = sqlite.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
  });
  return { prepare: (sql) => lier(sql), batch: async (stmts) => Promise.all(stmts.map(s => s.run())) };
}

const res = []; const v = (t, ok, d) => res.push({ t, ok: !!ok, d });

(async () => {
  const tmp = path.join(os.tmpdir(), `relais-${process.pid}.mjs`);
  fs.copyFileSync(path.join(__dirname, 'ai-relay-worker.js'), tmp);
  const relais = (await import('file://' + tmp)).default;

  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(fs.readFileSync(path.join(__dirname, 'cloud', 'schema.sql'), 'utf8'));
  const env = { DB: d1(sqlite), ANTHROPIC_API_KEY: 'test', APP_ORIGIN: 'https://app.test' };

  // API Anthropic simulée : compte les appels (= coût), peut répondre en erreur.
  let appelsIA = 0, modeIA = 'ok';
  const fetchReel = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).startsWith('https://api.anthropic.com/')) {
      appelsIA++;
      if (modeIA === 'erreur') return new Response('{"type":"error","error":{"message":"clé interne sk-ant-SECRET invalide"}}', { status: 401 });
      return new Response(JSON.stringify({ content: [{ type: 'text', text: '[{"brand":"Porsche","model":"911 GT3","confidence":0.9}]' }] }), { status: 200 });
    }
    throw new Error('réseau interdit au banc : ' + url);
  };

  const IMAGE = 'data:image/jpeg;base64,' + Buffer.from('jpeg-de-banc').toString('base64');
  let ip = 1;
  const appel = ({ chemin = '/', image = IMAGE, origine = 'https://app.test', session, corps, envX = env, methode = 'POST', ipFixe } = {}) =>
    relais.fetch(new Request('https://relais.test' + chemin, {
      method: methode,
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ipFixe || `10.1.0.${ip}`,
        ...(origine ? { Origin: origine } : {}), ...(session ? { Authorization: `Bearer ${session}` } : {}) },
      body: methode === 'POST' ? (corps !== undefined ? corps : JSON.stringify({ image })) : undefined,
    }), envX);

  /* Nominal */
  let r = await appel();
  const propositions = r.status === 200 ? await r.json() : null;
  v('identification nominale : propositions renvoyées', Array.isArray(propositions) && propositions[0] && propositions[0].model === '911 GT3', r.status);

  /* /notify supprimé, route unique */
  const avantNotify = appelsIA;
  r = await appel({ chemin: '/notify', corps: JSON.stringify({ nom: 'x', photo: IMAGE }) });
  v('/notify n\'existe plus (404) et ne déclenche rien', r.status === 404 && appelsIA === avantNotify, r.status);
  r = await appel({ chemin: '/nimporte-quoi' });
  v('toute autre route : 404, pas une identification payante', r.status === 404 && appelsIA === avantNotify, r.status);

  /* Origine : filtre contre les autres SITES (pas une authentification) */
  r = await appel({ origine: 'https://pirate.test' });
  v('appel depuis un autre site : refusé (403), sans appel à l\'IA', r.status === 403 && appelsIA === avantNotify, r.status);
  r = await appel({ origine: 'https://pirate.test', methode: 'OPTIONS' });
  v('pré-vol CORS : l\'origine autorisée est celle de l\'app, pas un reflet', r.headers.get('Access-Control-Allow-Origin') === 'https://app.test', r.headers.get('Access-Control-Allow-Origin'));

  /* Taille et format de l'image */
  ip++;
  r = await appel({ image: 'data:image/jpeg;base64,' + 'A'.repeat(3_000_000) });
  v('image de plus de 2 Mo : refusée (413) avant tout appel à l\'IA', r.status === 413 && appelsIA === avantNotify, r.status);
  r = await appel({ image: 'data:image/svg+xml;base64,' + Buffer.from('<svg/>').toString('base64') });
  v('format non photo (SVG) : refusé (415)', r.status === 415, r.status);
  r = await appel({ corps: 'x'.repeat(4_000_000) });
  v('corps démesuré : refusé sans être analysé', r.status === 413, r.status);

  /* Quota par appareil, sans compte */
  env.QUOTA_IA_ANONYME = '3';
  const n = []; for (let i = 0; i < 4; i++) n.push((await appel({ ipFixe: '10.9.9.9' })).status);
  v('sans compte : 3 identifications, la 4e refusée (429)', JSON.stringify(n) === '[200,200,200,429]', JSON.stringify(n));
  r = await appel({ ipFixe: '10.9.9.9' });
  const msg429 = r.status === 429 ? (await r.json()).error : '';
  v('… avec un message qui propose la saisie manuelle', /manuel|main/i.test(msg429 || ''), msg429);
  v('… et un autre appareil n\'est pas pénalisé', (await appel({ ipFixe: '10.9.9.10' })).status === 200);

  /* Rafale simultanée : le compteur doit tenir */
  const avantRafale = appelsIA;
  const rafale = await Promise.all(Array.from({ length: 12 }, () => appel({ ipFixe: '10.8.8.8' })));
  const passees = rafale.filter(x => x.status === 200).length;
  v('12 appels simultanés, quota de 3 : exactement 3 passent (et 3 appels facturés)', passees === 3 && appelsIA - avantRafale === 3, `${passees} passés, ${appelsIA - avantRafale} facturés`);

  /* Quota plus large pour un compte connecté (session valide) */
  const session = crypto.randomBytes(32).toString('base64url');
  const hashSession = crypto.createHash('sha256').update(session).digest('hex');
  sqlite.prepare("INSERT INTO utilisateurs (id, email, cree) VALUES ('u1', 'a@b.fr', 0)").run();
  sqlite.prepare('INSERT INTO sessions (hash, utilisateur, expire, cree) VALUES (?, ?, ?, 0)').run(hashSession, 'u1', Date.now() + 3600e3);
  env.QUOTA_IA_COMPTE = '5';
  const nc = []; for (let i = 0; i < 6; i++) nc.push((await appel({ ipFixe: '10.9.9.9', session })).status);
  v('compte connecté : son propre quota (5), même depuis un appareil déjà au plafond anonyme', JSON.stringify(nc) === '[200,200,200,200,200,429]', JSON.stringify(nc));
  r = await appel({ ipFixe: '10.7.7.7', session: 'faux-jeton-' + 'x'.repeat(40) });
  v('jeton invalide : traité comme anonyme (la capture marche toujours)', r.status === 200, r.status);

  /* Plafond global du service */
  env.QUOTA_IA_JOUR = '1';
  r = await appel({ ipFixe: '10.6.6.6' });
  const msgGlobal = r.status === 429 ? (await r.json()).error : '';
  v('plafond global du jour atteint : plus personne ne consomme (429), message distinct', r.status === 429 && /aujourd/i.test(msgGlobal || ''), `${r.status} ${msgGlobal}`);
  delete env.QUOTA_IA_JOUR; delete env.QUOTA_IA_ANONYME; delete env.QUOTA_IA_COMPTE;

  /* Aucune fuite de détail interne */
  modeIA = 'erreur';
  r = await appel({ ipFixe: '10.5.5.5' });
  const texteErreur = await r.text();
  v('erreur de l\'API : 502 générique, aucun détail interne renvoyé', r.status === 502 && !/sk-ant|SECRET|clé interne/.test(texteErreur), texteErreur.slice(0, 120));
  modeIA = 'ok';

  /* Sans base de limites : fermé, jamais ouvert */
  const avantSansDB = appelsIA;
  r = await appel({ envX: { ...env, DB: undefined }, ipFixe: '10.4.4.4' });
  v('relais sans base de limites : refuse (503) plutôt que de tourner sans plafond', r.status === 503 && appelsIA === avantSansDB, r.status);

  /* Limites stockées hachées, comme celles des comptes */
  const cles = sqlite.prepare('SELECT cle FROM limites').all().map(x => x.cle);
  v('compteurs : ni IP ni identifiant en clair (empreintes seulement)', cles.length > 0 && cles.every(k => /^[0-9a-f]{64}$/.test(k)), JSON.stringify(cles.slice(0, 2)));

  globalThis.fetch = fetchReel; try { fs.unlinkSync(tmp); } catch {}
  let ko = 0; for (const x of res) { if (!x.ok) ko++; console.log(`  ${x.ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${x.t}${!x.ok && x.d != null ? '  → ' + x.d : ''}`); }
  console.log(`\n  ${res.length - ko} passé(s) · ${ko} échec(s)`); process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
