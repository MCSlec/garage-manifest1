#!/usr/bin/env node
/* ==========================================================================
   RECENSEMENT DES TEXTES D'INTERFACE — préparation i18n (chantier B, option a)
   --------------------------------------------------------------------------
   But : savoir EXACTEMENT ce qu'il faudrait traduire, avant de décider s'il
   faut une abstraction `t("clé")`. Aucune ligne de l'app n'est modifiée.

   Règle structurante (CONTEXT.md §11 bis-B) : les DONNÉES automobiles ne se
   mélangent jamais aux textes d'interface. Un nom de modèle, une note de
   fiche, un libellé de motorisation ne sont pas des chaînes d'UI. Le
   recenseur l'applique mécaniquement : les littéraux de données (CARS, INFO,
   VARIANTS, SPECS, GENS, MOTOR_SPECS…) sont repérés par équilibrage de
   crochets et EXCLUS, puis comptés à part pour mesurer ce qu'on a écarté.

   Méthode : un tokeniseur JavaScript minimal (chaînes, gabarits `…${}…`,
   commentaires, expressions régulières) plutôt que des grep. Un grep compte
   un sélecteur CSS comme une phrase, et rate le texte d'un gabarit HTML.

     node banc-i18n.js          → résumé par fichier et par zone
     node banc-i18n.js --md     → réécrit I18N.md (inventaire complet)

   Préfixé `banc-` : hors cache (sw.js, HORS_CACHE).
   ========================================================================== */
'use strict';
const fs = require('fs'), path = require('path');
const RACINE = __dirname;

/* Littéraux de DONNÉES : jamais traduits. Le reste est de l'interface. */
const DONNEES = {
  'index.html': ['CARS', 'INFO', 'VARIANTS', 'G'],   // G : marques par groupe industriel
  'gm-specs.js': ['SPECS', 'GENS', 'MAP', 'MOTOR_SPECS', 'CATALOGUE_PLUS', 'ARCHI', 'FUSIONS',
                  'DOUBLONS_A_RETIRER', 'MOTEURS', 'MARQUES_PREMIUM', 'CAT_COURANTES', 'tests'],
  'gm-matcher.js': ['ALIAS_MARQUE'],
};
/* Contenu ÉDITORIAL : prose automobile montrée au joueur. Il se traduit, mais
   comme les notes de fiche — par fichiers de contenu, pas par clés d'UI.
   Recensé à part pour ne pas gonfler l'estimation du chantier `t()`. */
const EDITORIAL = { 'gm-specs.js': ['COLLECS'] };

/* ---------- Tokeniseur JavaScript minimal ---------------------------------- */
function litteraux(src) {
  const out = [];
  let i = 0, ligne = 1, dernier = '';   // dernier caractère significatif (pour les regex)
  const avance = n => { for (let k = 0; k < n; k++) { if (src[i] === '\n') ligne++; i++; } };
  const peutRegex = () => dernier === '' || '(,=:[!&|?{};+-*%<>~^'.includes(dernier) || /\b(return|typeof|case|in|of)$/.test(src.slice(Math.max(0, i - 8), i));
  function lireGabarit() {                         // i sur le backtick ouvrant
    const debut = ligne, parts = []; let cur = '';
    avance(1);
    while (i < src.length && src[i] !== '`') {
      if (src[i] === '\\') { cur += src[i + 1] || ''; avance(2); continue; }
      if (src[i] === '$' && src[i + 1] === '{') {
        parts.push(cur); cur = ''; avance(2);
        let prof = 1;
        while (i < src.length && prof) {            // expression : on saute, gabarits imbriqués compris
          const c = src[i];
          if (c === '`') { const g = lireGabarit(); out.push(g); continue; }
          if (c === '"' || c === "'") { out.push(lireChaine()); continue; }
          if (c === '{') prof++; else if (c === '}') prof--;
          avance(1);
        }
        continue;
      }
      cur += src[i]; avance(1);
    }
    parts.push(cur); avance(1);
    return { ligne: debut, type: 'gabarit', parts, pos: i };
  }
  function lireChaine() {
    const q = src[i], debut = ligne; let cur = ''; avance(1);
    while (i < src.length && src[i] !== q && src[i] !== '\n') {
      if (src[i] === '\\') { cur += src[i + 1] || ''; avance(2); continue; }
      cur += src[i]; avance(1);
    }
    avance(1);
    return { ligne: debut, type: 'chaine', parts: [cur], pos: i };
  }
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < src.length && src[i] !== '\n') avance(1); continue; }
    if (c === '/' && d === '*') { avance(2); while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) avance(1); avance(2); continue; }
    if (c === '`') { out.push(lireGabarit()); dernier = '`'; continue; }
    if (c === '"' || c === "'") { out.push(lireChaine()); dernier = c; continue; }
    if (c === '/' && peutRegex()) {                 // littéral d'expression régulière
      avance(1); let classe = false;
      while (i < src.length && src[i] !== '\n') {
        if (src[i] === '\\') { avance(2); continue; }
        if (src[i] === '[') classe = true; else if (src[i] === ']') classe = false;
        else if (src[i] === '/' && !classe) break;
        avance(1);
      }
      avance(1); while (/[a-z]/.test(src[i] || '')) avance(1);
      dernier = '/'; continue;
    }
    if (!/\s/.test(c)) dernier = c;
    avance(1);
  }
  return out;
}

/* Plages [début, fin[ des littéraux de données `const NOM = [ … ]` / `{ … }`. */
function plagesDonnees(src, noms) {
  const plages = [];
  for (const nom of noms) {
    const re = new RegExp(`const ${nom}\\s*=\\s*([\\[{])`, 'g');
    let m;
    while ((m = re.exec(src))) {
      const ouvre = m.index + m[0].length - 1, ferme = { '[': ']', '{': '}' }[m[1]];
      let prof = 0, j = ouvre, q = null;
      for (; j < src.length; j++) {
        const c = src[j];
        if (q) { if (c === '\\') { j++; continue; } if (c === q) q = null; continue; }
        if (c === '"' || c === "'" || c === '`') { q = c; continue; }
        if (c === '/' && src[j + 1] === '/') { j = src.indexOf('\n', j); continue; }
        if (c === '/' && src[j + 1] === '*') { j = src.indexOf('*/', j) + 1; continue; }
        if (c === m[1]) prof++; else if (c === ferme && --prof === 0) break;
      }
      plages.push({ nom, debut: m.index, fin: j + 1 });
    }
  }
  return plages;
}

/* Un nom de marque du catalogue est une DONNÉE, où qu'il apparaisse (tests de
   collections, groupes industriels…) : il ne se traduit jamais. */
const MARQUES = new Set([
  ...[...fs.readFileSync(path.join(RACINE, 'index.html'), 'utf8').matchAll(/brand:\s*"([^"]+)"/g)].map(m => m[1]),
  ...[...fs.readFileSync(path.join(RACINE, 'gm-specs.js'), 'utf8').matchAll(/brand:\s*'([^']+)'/g)].map(m => m[1]),
]);

/* ---------- Tri : texte d'interface ou bruit technique ? ------------------ */
const ATTRS = /\b(aria-label|placeholder|title|alt)="([^"$]{2,})"/g;
function textesDe(fragment) {
  const sorties = [];
  let m; ATTRS.lastIndex = 0;
  while ((m = ATTRS.exec(fragment))) sorties.push(m[2]);
  /* Le gabarit arrive ENTIER, chaque `${…}` remplacé par \u0001 : une balise
     coupée par une expression (`<img src="${x}">`) reste donc une balise, et
     s'efface d'un bloc. Dans le texte, le marqueur devient « {…} » : la phrase
     paramétrée reste lisible entière, ce qu'une traduction devra savoir. */
  const sansBalises = fragment.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]*>/g, '\n')
    .replace(/\u0001/g, '{…}')
    .replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&[a-z]+;/g, ' ');
  for (const t of sansBalises.split('\n')) sorties.push(t);
  return sorties.map(t => t.replace(/\s+/g, ' ').trim())
    .filter(t => t && t.replace(/\{…\}/g, '').replace(/[\s·:,.()«»\-–—/%+×]/g, '').length > 1);
}
function estInterface(t) {
  if (t.length < 2 || !/\p{L}/u.test(t)) return false;
  if (t === 'use strict' || MARQUES.has(t)) return false;
  if (/["=<>]/.test(t.replace(/\{…\}/g, ''))) return false;                           // reste d'attribut
  if (/^(Escape|Enter|Tab|Backspace|Arrow(Left|Right|Up|Down)|Space)$/.test(t)) return false;   // touches clavier
  if (/^[#.\[@:]|^--|^(https?:|data:|mailto:|\.\/|\/)/.test(t)) return false;         // sélecteur, URL
  if (/^[a-z][a-zA-Z0-9_]*(-[a-zA-Z0-9_]+)*$/.test(t)) return false;                   // identifiant, classe, clé
  if (/^[\w-]+\/[\w.+-]+$/.test(t)) return false;                                       // type MIME
  if (/[{};]/.test(t) && /:/.test(t)) return false;                                     // CSS
  if (/^[A-Z_][A-Z0-9_]+$/.test(t)) return false;                                       // CONSTANTE
  if (/^(var|calc|rgba?|hsla?|linear-gradient|translate|cubic-bezier)\(/.test(t)) return false;
  if (/^[\d\s.,%×x:/+-]+(px|ms|s|deg|em|rem|vh|vw|fr)?$/.test(t)) return false;
  if (/^[a-z-]+(\s+[a-z-]+)+$/.test(t) && !/[éèàùâêîôûç]/.test(t) && t.split(' ').every(w => /^[a-z0-9-]+$/.test(w) && (w.includes('-') || w.length <= 12)) && /-/.test(t)) return false; // listes de classes
  return /\s/.test(t) || /[A-ZÀ-Ý]/.test(t[0]) || /[éèàùâêîôûçÉ]/.test(t) || /[!?…:«»]/.test(t);
}

/* ---------- Recensement d'un fichier ------------------------------------- */
const MOTS_CLES = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return']);
function sectionDe(lignes, n) {                    // fonction ou constante de PREMIER niveau englobante
  for (let k = n - 1; k >= 0 && k >= n - 600; k--) {
    const m = lignes[k].match(/^\s*(?:async\s+)?function\s+([\w$]+)|^\s{0,2}(?:const|let)\s+([\w$]+)\s*=|^\s{2,6}(?:async\s+)?([\w$]+)\s*\([^)]*\)\s*\{\s*$/);
    const nom = m && (m[1] || m[2] || m[3]);
    if (nom && !MOTS_CLES.has(nom)) return nom;
  }
  return '(racine)';
}
function recenser(fichier) {
  const brut = fs.readFileSync(path.join(RACINE, fichier), 'utf8');
  const lignes = brut.split('\n');
  const blocs = [];                                 // [{ debutLigne, texte, js }]
  if (fichier.endsWith('.html')) {
    const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g; let m, dernierFin = 0;
    while ((m = re.exec(brut))) {
      blocs.push({ js: false, texte: brut.slice(dernierFin, m.index), decalage: dernierFin });
      const debutJs = m.index + m[0].indexOf('>') + 1;
      blocs.push({ js: true, texte: m[1], decalage: debutJs });
      dernierFin = m.index + m[0].length;
    }
    blocs.push({ js: false, texte: brut.slice(dernierFin), decalage: dernierFin });
  } else blocs.push({ js: true, texte: brut, decalage: 0 });

  const ligneDe = pos => brut.slice(0, pos).split('\n').length;
  const entrees = [], ecartes = {};
  for (const b of blocs) {
    if (!b.js) {                                    // balisage HTML hors script
      const html = b.texte.replace(/<style[\s\S]*?<\/style>/g, m => m.replace(/[^\n]/g, ' ')).replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ' '));
      html.split('\n').forEach((l, k) => {
        for (const t of textesDe(l)) if (estInterface(t))
          entrees.push({ ligne: ligneDe(b.decalage) + k, zone: 'balisage HTML', texte: t });
      });
      continue;
    }
    const plages = plagesDonnees(b.texte, DONNEES[fichier] || []);
    const edito = plagesDonnees(b.texte, EDITORIAL[fichier] || []);
    for (const lit of litteraux(b.texte)) {
      const p = plages.find(r => lit.pos > r.debut && lit.pos <= r.fin);
      const ligne = ligneDe(b.decalage) + lit.ligne - 1;
      const avant = b.texte.slice(Math.max(0, lit.pos - 400), lit.pos);
      const console_ = /console\.(log|info|warn|error|debug)\([^;]*$/.test(avant.slice(-200)) || /new Error\([^;]*$/.test(avant.slice(-120));
      for (const t of textesDe(lit.parts.join('\u0001'))) {
        if (!estInterface(t)) continue;
        if (p) { ecartes[p.nom] = (ecartes[p.nom] || 0) + 1; continue; }
        const e = edito.find(r => lit.pos > r.debut && lit.pos <= r.fin);
        if (e) { entrees.push({ ligne, zone: `${e.nom} (éditorial)`, texte: t, edito: true }); continue; }
        if (console_) { ecartes['(journaux console / erreurs dev)'] = (ecartes['(journaux console / erreurs dev)'] || 0) + 1; continue; }
        entrees.push({ ligne, zone: sectionDe(lignes, ligne), texte: t });
      }
    }
  }
  return { fichier, entrees, ecartes };
}

/* ---------- Sortie -------------------------------------------------------- */
const FICHIERS = ['index.html', 'gm-specs.js', 'gm-matcher.js', 'gm-compte.js'];
const resultats = FICHIERS.map(recenser);
const parZone = r => r.entrees.reduce((a, e) => (a[e.zone] = (a[e.zone] || 0) + 1, a), {});
const uniques = (r, edito = false) => new Set(r.entrees.filter(e => !!e.edito === edito).map(e => e.texte)).size;

if (!process.argv.includes('--md')) {
  for (const r of resultats) {
    console.log(`\n${r.fichier} : ${uniques(r)} textes d'interface distincts${uniques(r, true) ? `, + ${uniques(r, true)} éditoriaux` : ''}`);
    const z = Object.entries(parZone(r)).sort((a, b) => b[1] - a[1]).slice(0, 15);
    for (const [k, n] of z) console.log(`  ${String(n).padStart(4)}  ${k}`);
    console.log('  écartés (données, journaux) :', JSON.stringify(r.ecartes));
  }
  process.exit(0);
}

const esc = t => t.replace(/\|/g, '\\|');
let md = `# Inventaire des textes d'interface (i18n)

> Généré par \`node banc-i18n.js --md\` — ne pas éditer à la main, relancer le
> script. Préparation seulement (chantier B, option a) : **aucune ligne de
> l'application n'a été modifiée**.

## Règle appliquée

Les **données automobiles ne se traduisent pas** et ne figurent pas ici :
${FICHIERS.map(f => `\`${f}\` → ${(DONNEES[f] || []).map(n => '`' + n + '`').join(', ') || '—'}`).join(' ; ')}.
Elles sont repérées par équilibrage de crochets, puis **comptées à part** plus
bas, pour qu'on voie ce qui a été écarté. Les messages de console et les
erreurs de développement sont écartés aussi : l'utilisateur ne les voit pas.

## Résumé

| Fichier | Textes d'interface | Éditorial | Écartés (données, journaux) |
|---|---:|---:|---|
${resultats.map(r => `| \`${r.fichier}\` | ${uniques(r)} | ${uniques(r, true) || '—'} | ${Object.entries(r.ecartes).map(([k, n]) => `${k} : ${n}`).join(' · ') || '—'} |`).join('\n')}

**Total : ${resultats.reduce((a, r) => a + uniques(r), 0)} textes d'interface distincts à traduire**, plus
${resultats.reduce((a, r) => a + uniques(r, true), 0)} textes éditoriaux (collections), à traiter comme les notes de fiche.

## Ce que l'inventaire dit de la faisabilité d'un \`t("clé")\`

- Les textes sont **dispersés dans des gabarits HTML** (\`\${…}\` au milieu de
  phrases) : une traduction ne peut pas se faire par remplacement de chaînes,
  il faut des **phrases paramétrées** (\`t("capture.reste", { n })\`), sinon
  l'ordre des mots, le pluriel et l'accord cassent dans les autres langues.
- Les **pluriels** sont calculés en français dans le code
  (\`\${n>1?"s":""}\`) : à remplacer par une règle de pluriel par langue
  (\`Intl.PluralRules\`, natif, **aucune dépendance**).
- Les **noms de pays et de catégories** sont de l'interface (ils se traduisent),
  mais leurs **clés** (\`"Sportive"\`, drapeaux) servent aussi de données de
  filtrage : il faudra séparer la clé stable du libellé affiché avant de
  traduire, sinon un filtre sauvegardé en français ne retrouverait plus rien.

## Inventaire détaillé
`;
for (const r of resultats) {
  md += `\n### \`${r.fichier}\` — ${uniques(r)} textes d'interface${uniques(r, true) ? ` + ${uniques(r, true)} éditoriaux` : ''}\n`;
  const groupes = {};
  for (const e of r.entrees) (groupes[e.zone] ||= []).push(e);
  for (const [zone, es] of Object.entries(groupes).sort((a, b) => b[1].length - a[1].length)) {
    md += `\n<details><summary><b>${zone}</b> — ${es.length}</summary>\n\n| Ligne | Texte |\n|---:|---|\n`;
    const vus = new Set();
    for (const e of es) { if (vus.has(e.texte)) continue; vus.add(e.texte); md += `| ${e.ligne} | ${esc(e.texte)} |\n`; }
    md += `\n</details>\n`;
  }
}
fs.writeFileSync(path.join(RACINE, 'I18N.md'), md);
console.log(`I18N.md écrit — ${resultats.map(r => `${r.fichier} ${uniques(r)}`).join(', ')}`);
