#!/usr/bin/env node
/* ==========================================================================
   Banc ET générateur — pages web exigées par les stores (21/11)
   --------------------------------------------------------------------------
   POURQUOI
   L'App Store et Google Play exigent des pages web publiques, même pour une
   app qui n'est pas un site : politique de confidentialité (Apple, Google),
   page de support (Apple), lien pour demander la suppression de son compte
   (Google Play). Ce sont de simples pages HTML, servies à côté de l'app.

   UNE SEULE SOURCE PAR PAGE
   La politique de confidentialité EXISTE déjà : `cloud/CONFIDENTIALITE.md`,
   tenue à jour dans le même commit que tout changement de collecte
   (CLAUDE.md §8 quinquies). La recopier à la main en HTML, c'était garantir
   qu'un jour les deux textes divergent — et la page publique mentirait. La
   page est donc GÉNÉRÉE depuis ce fichier (son préambule de maintenance, jusqu'au
   premier `---`, est omis). Même principe pour le support et la suppression de
   compte (`pages/*.md`). Même patron que `banc-i18n.js` → `I18N.md`.

   CE QUE LE BANC VÉRIFIE (code non nul sur ERREUR)
   · chaque page est À JOUR de sa source (sinon : `node banc-pages.js --html`) ;
   · aucune ressource externe (script, feuille de style, image, police) : les
     pages se lisent seules, sans traceur, comme l'app (CLAUDE.md §1.2) ;
   · chaque lien mène quelque part : page voisine existante, mailto:, ou site
     externe de la liste blanche ;
   · l'adresse de contact figure sur chaque page ;
   · dans Chromium (si Playwright est disponible) : aucune requête vers un autre
     domaine, aucune erreur, AUCUN débordement horizontal sur un écran de
     téléphone (390 px, tableaux compris), thèmes clair et sombre distincts.
   Les passages `[À COMPLÉTER …]`, `[À VÉRIFIER …]`, `[À DÉCIDER …]` sont
   surlignés sur la page, qui porte alors le bandeau « version de travail » :
   ce sont des ALERTES (le texte n'est pas fini), pas des erreurs.

   Usage : node banc-pages.js --html   (régénère les pages)
           node banc-pages.js          (vérifie)
   ========================================================================== */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http');
const RACINE = __dirname;
const CONTACT = 'garagemanifest.app@gmail.com';
const PAGES = [
  { source: 'cloud/CONFIDENTIALITE.md', cible: 'pages/confidentialite.html', titre: 'Politique de confidentialité', preambule: true },
  { source: 'pages/support.md', cible: 'pages/support.html', titre: 'Aide et support' },
  { source: 'pages/suppression-compte.md', cible: 'pages/suppression-compte.html', titre: 'Supprimer ton compte' },
];
const EXTERNES_PERMIS = [/^https:\/\/www\.cnil\.fr\/?$/];
const RE_A_FAIRE = /\[(À (?:COMPLÉTER|VÉRIFIER|DÉCIDER|CONFIRMER)[^\]]*)\]/g;

// ------------------------------------------------------- Markdown → HTML --
/* Sous-ensemble volontairement limité à ce que ces textes utilisent : titres,
   paragraphes, listes (à puces et numérotées, avec lignes de suite indentées),
   tableaux, citations, filets, gras, italique, code, liens. Pas de HTML brut :
   tout le texte est échappé, rien ne peut s'injecter dans la page. */
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function enLigne(texte) {
  let s = esc(texte);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, url) => `<a href="${url}">${t}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*(?!\s)([^*]+?)\*(?![*\w])/g, '$1<em>$2</em>');
  s = s.replace(RE_A_FAIRE, '<mark class="a-faire">[$1]</mark>');
  return s;
}
const ancre = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const debutBloc = (l) => /^#{1,6} /.test(l) || /^---\s*$/.test(l) || /^\|/.test(l) || /^> ?/.test(l) || /^- /.test(l) || /^\d+\. /.test(l);

function blocs(lignes) {
  const out = [];
  for (let i = 0; i < lignes.length;) {
    const l = lignes[i];
    if (!l.trim()) { i++; continue; }
    let m;
    if ((m = /^(#{1,6}) (.*)$/.exec(l))) {
      const niveau = Math.max(2, m[1].length);          // le titre de la page est le seul h1 : ## → h2, ### → h3
      out.push(`<h${niveau} id="${ancre(m[2])}">${enLigne(m[2])}</h${niveau}>`); i++; continue;
    }
    if (/^---\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
    if (/^\|/.test(l)) {
      const rangs = []; while (i < lignes.length && /^\|/.test(lignes[i])) rangs.push(lignes[i++]);
      const cellules = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const tete = cellules(rangs[0]), corps = rangs.slice(2).map(cellules);
      /* data-label : sur un écran de téléphone, chaque ligne devient une fiche et chaque
         valeur porte le nom de sa colonne (une 3e colonne cachée hors de l'écran, que
         personne ne pense à faire défiler, c'est une information perdue). */
      const etiquette = (k) => esc(tete[k].replace(/\*\*/g, ''));
      out.push(`<div class="tableau"><table><thead><tr>${tete.map(c => `<th>${enLigne(c)}</th>`).join('')}</tr></thead><tbody>${corps.map(r => `<tr>${r.map((c, k) => `<td data-label="${etiquette(k)}">${enLigne(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    if (/^> ?/.test(l)) {
      const dedans = []; while (i < lignes.length && /^>/.test(lignes[i])) dedans.push(lignes[i++].replace(/^> ?/, ''));
      out.push(`<blockquote>${blocs(dedans).join('\n')}</blockquote>`); continue;
    }
    if (/^- /.test(l) || /^\d+\. /.test(l)) {
      const ordonnee = /^\d+\. /.test(l), items = [];
      while (i < lignes.length) {
        const x = lignes[i];
        if ((ordonnee ? /^\d+\. / : /^- /).test(x)) { items.push(x.replace(ordonnee ? /^\d+\. / : /^- /, '')); i++; }
        else if (items.length && /^\s{2,}\S/.test(x)) { items[items.length - 1] += ' ' + x.trim(); i++; }
        else break;
      }
      const balise = ordonnee ? 'ol' : 'ul';
      out.push(`<${balise}>${items.map(t => `<li>${enLigne(t)}</li>`).join('')}</${balise}>`); continue;
    }
    const para = []; while (i < lignes.length && lignes[i].trim() && !debutBloc(lignes[i])) para.push(lignes[i++].trim());
    out.push(`<p>${enLigne(para.join(' '))}</p>`);
  }
  return out;
}

function corpsDe(md, { preambule }) {
  const lignes = md.replace(/\r\n/g, '\n').split('\n');
  const h1 = lignes.findIndex(l => /^# /.test(l));
  let debut = h1 + 1;
  if (preambule) { const filet = lignes.findIndex((l, k) => k > h1 && /^---\s*$/.test(l)); if (filet > 0) debut = filet + 1; }
  return lignes.slice(debut);
}

const CSS = `
:root{ --bg:#0b0b0d; --panel:#161618; --line:#27272a; --txt:#f4f4f5; --muted:#a1a1aa; --red:#ef4444; --mark:#3b2f0b; --mark-txt:#fde68a;
  --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; color-scheme:dark; }
@media (prefers-color-scheme: light){ :root{ --bg:#f7f7f8; --panel:#ffffff; --line:#e4e4e7; --txt:#18181b; --muted:#52525b; --red:#dc2626; --mark:#fef3c7; --mark-txt:#78350f; color-scheme:light; } }
*{ box-sizing:border-box; }
html{ -webkit-text-size-adjust:100%; }
body{ margin:0; background:var(--bg); color:var(--txt); font:400 16px/1.6 var(--sans); padding:0 max(16px, env(safe-area-inset-right)) 48px max(16px, env(safe-area-inset-left)); }
header,main,footer{ max-width:720px; margin:0 auto; }
header{ padding:20px 0 8px; border-bottom:1px solid var(--line); }
.app{ margin:0; font:700 13px/1 var(--mono); letter-spacing:.2em; text-transform:uppercase; }
.app span{ color:var(--red); }
nav{ display:flex; flex-wrap:wrap; gap:6px 16px; margin-top:12px; font-size:14px; }
nav a{ color:var(--muted); text-decoration:none; }
nav a[aria-current="page"]{ color:var(--txt); font-weight:600; }
h1{ font-size:28px; line-height:1.2; margin:28px 0 12px; }
h2{ font-size:20px; margin:32px 0 8px; }
h3{ font-size:17px; margin:22px 0 6px; }
p,li{ overflow-wrap:anywhere; }
a{ color:var(--red); }
code{ font:400 .9em var(--mono); background:var(--panel); padding:1px 4px; border-radius:4px; }
hr{ border:0; border-top:1px solid var(--line); margin:28px 0; }
blockquote{ margin:16px 0; padding:4px 16px; border-left:3px solid var(--line); color:var(--muted); }
.tableau{ overflow-x:auto; margin:12px 0; border:1px solid var(--line); border-radius:10px; }
table{ border-collapse:collapse; width:100%; min-width:520px; font-size:14px; }
th,td{ text-align:left; vertical-align:top; padding:8px 10px; border-bottom:1px solid var(--line); }
th{ background:var(--panel); }
tr:last-child td{ border-bottom:0; }
@media (max-width: 600px){
  .tableau{ overflow:visible; }
  table{ min-width:0; }
  table, tbody, tr, td{ display:block; }
  thead{ position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); }
  tr{ border-bottom:1px solid var(--line); padding:6px 0; }
  tr:last-child{ border-bottom:0; }
  td{ border:0; padding:4px 12px; }
  td::before{ content:attr(data-label); display:block; font:600 11px/1.6 var(--mono); letter-spacing:.06em; text-transform:uppercase; color:var(--muted); }
}
mark.a-faire{ background:var(--mark); color:var(--mark-txt); padding:0 3px; border-radius:3px; }
.brouillon{ margin:20px 0 0; padding:10px 14px; border:1px solid var(--line); border-left:3px solid var(--red); border-radius:8px; background:var(--panel); font-size:14px; }
footer{ margin-top:40px; padding-top:16px; border-top:1px solid var(--line); color:var(--muted); font-size:14px; }
`.trim();

function pageHTML(p) {
  const md = fs.readFileSync(path.join(RACINE, p.source), 'utf8');
  const corps = blocs(corpsDe(md, p)).join('\n');
  const aFaire = (corps.match(/class="a-faire"/g) || []).length;
  const nav = PAGES.map(q => `<a href="./${path.basename(q.cible)}"${q === p ? ' aria-current="page"' : ''}>${esc(q.titre)}</a>`).join('\n    ');
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark light">
<link rel="icon" href="data:,">
<title>${esc(p.titre)} — Garage Manifest</title>
<!-- Page GÉNÉRÉE par banc-pages.js depuis ${p.source} : ne pas la modifier à la main. -->
<style>
${CSS}
</style>
</head>
<body>
<header>
  <p class="app">Garage <span>Manifest</span></p>
  <nav aria-label="Pages">
    ${nav}
  </nav>
</header>
<main>
${aFaire ? '<p class="brouillon" role="note">Version de travail : les passages surlignés restent à compléter avant la publication de l\'app.</p>\n' : ''}<h1>${esc(p.titre)}</h1>
${corps}
</main>
<footer>
  <p>Contact : <a href="mailto:${CONTACT}">${CONTACT}</a></p>
</footer>
</body>
</html>
`;
}

// ------------------------------------------------------------- contrôle --
const erreurs = [], alertes = [], oks = [];
function verifierTexte(p, html) {
  const nom = p.cible;
  const surDisque = fs.existsSync(path.join(RACINE, nom)) ? fs.readFileSync(path.join(RACINE, nom), 'utf8') : null;
  if (surDisque === null) erreurs.push(`${nom} : absente — lancer node banc-pages.js --html`);
  else if (surDisque !== html) erreurs.push(`${nom} : plus à jour de ${p.source} — lancer node banc-pages.js --html`);
  else oks.push(`${nom} à jour de ${p.source}`);
  // Seule exception : l'icône d'onglet VIDE intégrée (data:), qui évite que le navigateur réclame favicon.ico.
  if (/<script|<link(?![^>]*href="data:,")|<img|<iframe|<object|<embed|\ssrc=|@import|url\(/i.test(html)) erreurs.push(`${nom} : ressource externe ou script interdit`);
  else oks.push(`${nom} : aucune ressource externe, aucun script`);
  const liens = [...html.matchAll(/<a [^>]*href="([^"]*)"/g)].map(m => m[1]);
  const mauvais = liens.filter(h => {
    if (/^mailto:[^@\s]+@[^@\s]+$/.test(h)) return false;
    if (/^https:\/\//.test(h)) return !EXTERNES_PERMIS.some(re => re.test(h));
    if (/^\.\/[a-z0-9-]+\.html(#[a-z0-9-]*)?$/.test(h)) return !fs.existsSync(path.join(RACINE, 'pages', h.slice(2).split('#')[0]));
    return true;
  });
  if (mauvais.length) erreurs.push(`${nom} : liens invalides ${JSON.stringify(mauvais)}`);
  else oks.push(`${nom} : ${liens.length} liens, tous valides`);
  if (!html.includes(`mailto:${CONTACT}`)) erreurs.push(`${nom} : adresse de contact absente`);
  const aFaire = (html.match(/class="a-faire"/g) || []).length;
  if (aFaire) alertes.push(`${nom} : ${aFaire} passage(s) à compléter avant la publication`);
}

async function verifierNavigateur() {
  let chromium;
  try { ({ chromium } = require('playwright-core')); } catch (_) { alertes.push('Playwright absent : rendu navigateur non vérifié'); return; }
  const PORT = 8141;
  const serveur = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]); const f = path.join(RACINE, p);
    if (!f.startsWith(RACINE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': path.extname(f) === '.html' ? 'text/html; charset=utf-8' : 'text/plain' }); res.end(fs.readFileSync(f));
  });
  await new Promise(r => serveur.listen(PORT, r));
  const nav = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  try {
    for (const schema of ['dark', 'light']) {
      const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, colorScheme: schema });
      const page = await ctx.newPage();
      const ailleurs = [], fautes = [];
      page.on('request', r => { if (!r.url().startsWith(`http://localhost:${PORT}/`)) ailleurs.push(r.url()); });
      page.on('pageerror', e => fautes.push(String(e)));
      page.on('console', m => { if (m.type() === 'error') fautes.push(m.text()); });
      for (const p of PAGES) {
        if (!fs.existsSync(path.join(RACINE, p.cible))) continue;     // déjà signalée plus haut : absente
        await page.goto(`http://localhost:${PORT}/${p.cible}`, { waitUntil: 'load' });
        const r = await page.evaluate(() => ({ large: document.documentElement.scrollWidth, ecran: innerWidth, h1: document.querySelector('h1')?.textContent || '',
          fond: getComputedStyle(document.body).backgroundColor,
          /* Cellules de tableau hors de l'écran : la page ne déborde pas (le tableau défile
             dans son cadre), mais une colonne cachée qu'on ne pense pas à faire défiler est
             une information perdue — vu sur la durée de conservation, 21/11. */
          cachees: [...document.querySelectorAll('td, th')].filter(c => { const b = c.getBoundingClientRect(); return b.width > 0 && b.right > innerWidth + 1; }).length }));
        if (r.large > r.ecran) erreurs.push(`${p.cible} (${schema}) : déborde horizontalement sur un téléphone (${r.large} px pour ${r.ecran})`);
        else if (r.cachees) erreurs.push(`${p.cible} (${schema}) : ${r.cachees} cellule(s) de tableau hors de l'écran d'un téléphone`);
        else oks.push(`${p.cible} (${schema}) : tient dans un écran de 390 px, tableaux compris`);
        if (r.h1 !== p.titre) erreurs.push(`${p.cible} : titre inattendu « ${r.h1} »`);
        p[`fond_${schema}`] = r.fond;
      }
      if (ailleurs.length) erreurs.push(`requêtes vers un autre domaine : ${JSON.stringify(ailleurs)}`);
      if (fautes.length) erreurs.push(`erreurs dans la page : ${fautes.join(' | ')}`);
      await ctx.close();
    }
    for (const p of PAGES.filter(q => q.fond_dark)) {
      if (p.fond_dark === p.fond_light) erreurs.push(`${p.cible} : thèmes clair et sombre identiques`);
      else oks.push(`${p.cible} : thème clair et thème sombre`);
    }
  } finally { await nav.close(); serveur.close(); }
}

(async () => {
  const ecrire = process.argv.includes('--html');
  const rendus = PAGES.map(p => [p, pageHTML(p)]);
  if (ecrire) {
    for (const [p, html] of rendus) { fs.mkdirSync(path.dirname(path.join(RACINE, p.cible)), { recursive: true }); fs.writeFileSync(path.join(RACINE, p.cible), html); }
    console.log(`Pages écrites : ${PAGES.map(p => p.cible).join(', ')}`);
  }
  for (const [p, html] of rendus) verifierTexte(p, html);
  await verifierNavigateur();
  console.log('\nBanc — pages web des stores\n');
  for (const o of oks) console.log(`  \x1b[32m✓\x1b[0m ${o}`);
  for (const a of alertes) console.log(`  \x1b[33m!\x1b[0m ${a}`);
  for (const e of erreurs) console.log(`  \x1b[31m✗\x1b[0m ${e}`);
  console.log(`\n  Résultat   ${oks.length} passé(s) · ${erreurs.length} erreur · ${alertes.length} alerte\n`);
  process.exit(erreurs.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
