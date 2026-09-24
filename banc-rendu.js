#!/usr/bin/env node
/* Vérification COMPORTEMENTALE des fiches nouvellement écrites.
   Une entrée MAP + une fiche SPECS ne prouvent rien : `ficheHTML()` résout par
   MAP[id] STRICTEMENT, et une fiche inatteignable est écrite, versionnée,
   relue… et jamais affichée (CLAUDE.md §5 bis). On spotte donc chaque voiture,
   on ouvre sa fiche, et on lit le bloc réellement greffé.

   Le bloc greffé n'affiche PAS la puissance brute — `index.html` la montre déjà
   dans son propre en-tête. On vérifie donc la puissance par ses DÉRIVÉES
   (ch/L, kg/ch) : si le ratio est juste, c'est que la bonne valeur est arrivée
   jusqu'à DERIVES.calc(). C'est une preuve plus forte qu'une recherche de texte.

   On vérifie aussi l'INVERSE : un champ volontairement absent (couple des
   E-Tech, masse du HSV) ne doit rien rendre du tout — sinon le « non
   communiqué » se transformerait en zéro affiché. */
'use strict';
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');

const RACINE = __dirname;
const T = { '.html':'text/html', '.js':'application/javascript', '.json':'application/json',
            '.png':'image/png', '.webmanifest':'application/manifest+json' };
const srv = http.createServer((q, s) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(RACINE, p);
  if (!f.startsWith(RACINE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
  s.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'text/plain' }); s.end(fs.readFileSync(f));
});

/* Échantillon couvrant les six vagues de cette livraison ET les cas limites. */
const CIBLES = [
  { id:'honda-civic-vti',       v5:'vague 5',  present:['100 ch/L', '150 Nm', '1 080 kg'] },
  { id:'cupra-formentor-vz5',   v5:'vague 6',  present:['156 ch/L', '480 Nm', '1 683 kg'] },
  { id:'seat-leon-cupra',       v5:'vague 6',  present:['150 ch/L', '400 Nm', '1 496 kg'] },
  { id:'renault-rafale',        v5:'vague 7',  present:['1 653 kg'], absent:['Nm'] },
  { id:'renault-4-etech',       v5:'vague 7',  present:['245 Nm', '1 462 kg'] },
  { id:'tvr-speed12',           v5:'vague 8',  present:['881 Nm', '1 070 kg'],
    recap:'Valeurs approximatives (≈) : puissance.' },
  { id:'holden-commodore-hsv',  v5:'vague 8',  present:['94 ch/L', '740 Nm'], absent:['kg'] },
  { id:'porsche-911-gt2rs-clubsport', v5:'vague 8', present:['184 ch/L', '750 Nm', '1 390 kg'] },
  { id:'dacia-1300',            v5:'vague 9',  present:['42 ch/L', '95 Nm', '890 kg'] },
  { id:'citroen-zx-16v',        v5:'vague 10', present:['183 Nm', '1 150 kg'] },
  { id:'ford-f150-shelby',      v5:'vague 10', present:['159 ch/L'], absent:['Nm', 'kg'] },
];

const res = []; const v = (t, ok, d) => res.push({ t, ok, d });

(async () => {
  await new Promise(r => srv.listen(8097, r));
  const nav = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--no-sandbox'] });
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));

  await page.goto('http://localhost:8097/index.html', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.GMSpecs, { timeout: 15000 });

  // Sans spot, le verrou bloque la greffe : on collecte les onze voitures d'un coup.
  await page.evaluate((ids) => new Promise((ok, ko) => {
    const rq = indexedDB.open('garage-manifest');
    rq.onsuccess = () => {
      const tx = rq.result.transaction('spots', 'readwrite');
      const st = tx.objectStore('spots');
      for (const id of ids) st.put({ carId: id, at: new Date().toISOString(), coords: null,
        photos: ['data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'],
        loc: 'Banc', note: '', cover: 0, variants: [], favorite: false });
      tx.oncomplete = ok; tx.onerror = ko;
    };
    rq.onerror = ko;
  }), CIBLES.map(c => c.id));

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.GMSpecs, { timeout: 15000 });

  for (const c of CIBLES) {
    const ouvert = await page.evaluate((i) => {
      const e = document.querySelector(`[data-car="${i}"]`); if (!e) return false; e.click(); return true;
    }, c.id);
    if (!ouvert) { v(`${c.id} — tuile présente dans la grille`, false, 'introuvable'); continue; }
    await page.waitForTimeout(900);

    const lu = await page.evaluate(() => {
      const o = document.querySelector('#overlay');
      const g = o && o.querySelector('.gsp:not(.gsp-gens):not(.gsp-mot)');
      return { titre: o?.querySelector('.info-head h2')?.textContent.trim() || null,
               verrou: !!o?.querySelector('[data-verrou]'),
               // Deux lectures : `texte` coupe la note, qui cite des chiffres en
               // prose et ferait passer un contrôle d'absence pour la mauvaise
               // raison ; `complet` la garde, car le récapitulatif « ≈ » est
               // rendu APRÈS elle (première version de ce test : faux négatif).
               complet: g ? g.textContent.replace(/\s+/g, ' ') : null,
               texte: g ? g.textContent.replace(/\s+/g, ' ').split('À savoir')[0] : null };
    });

    v(`${c.id} (${c.v5}) — fiche greffée, verrou levé`, !!lu.texte && !lu.verrou, lu.titre);
    if (!lu.texte) continue;

    for (const attendu of (c.present || [])) {
      v(`${c.id} — « ${attendu} » rendu`, lu.texte.includes(attendu));
    }
    if (c.recap) {
      v(`${c.id} — récapitulatif « ≈ » présent et nommant le bon champ`,
        lu.complet.includes(c.recap), c.recap);
    }
    for (const interdit of (c.absent || [])) {
      v(`${c.id} — champ non communiqué : aucun « ${interdit} » affiché`,
        !lu.texte.includes(interdit), lu.texte.slice(0, 120));
    }

    await page.evaluate(() => document.querySelector('#overlay [data-close],#overlay .scrim')?.click());
    await page.waitForTimeout(320);
  }

  v('aucune erreur JS sur tout le parcours', errs.length === 0, errs.join(' | ').slice(0, 160));

  await nav.close(); srv.close();
  let ko = 0;
  console.log('\nBanc des fiches nouvelles — rendu réel (390×844)\n');
  for (const r of res) { if (!r.ok) ko++; console.log(`  ${r.ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${r.t}${r.d ? `\x1b[2m  — ${r.d}\x1b[0m` : ''}`); }
  console.log(`\n  ${res.length - ko} passé(s) · ${ko} échec(s)\n`);
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
