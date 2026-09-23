#!/usr/bin/env node
/* Banc de MISE EN PAGE — mesure ce qu'on ne peut pas juger à l'œil dans le
   code : débordement horizontal, contenu masqué par la barre basse, cibles
   tactiles trop petites, texte tronqué.

   Deux viewports reels : 390x844 (iPhone 13/14/15) et 393x852 (iPhone 15 Pro).

   Sert AVANT et APRES une retouche de design : sans mesure initiale, on
   « ameliore » sans savoir si on a casse autre chose. */
'use strict';
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');

const RACINE = '/home/user/garage-manifest1';
const T = { '.html':'text/html', '.js':'application/javascript', '.json':'application/json',
            '.png':'image/png', '.webmanifest':'application/manifest+json' };
const srv = http.createServer((q, s) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(RACINE, p);
  if (!f.startsWith(RACINE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
  s.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'text/plain' }); s.end(fs.readFileSync(f));
});

const ETIQUETTE = process.argv[2] || 'etat';
const VIEWPORTS = [{ w: 390, h: 844, nom: 'iPhone 13/14/15' }, { w: 393, h: 852, nom: 'iPhone 15 Pro' }];
const ONGLETS = ['collection', 'map', 'stats', 'trophies', 'plus'];

const res = [];
const v = (t, ok, d) => res.push({ t, ok, d });

(async () => {
  await new Promise(r => srv.listen(8096, r));
  const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

  for (const vp of VIEWPORTS) {
    const ctx = await nav.newContext({ viewport: { width: vp.w, height: vp.h } });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.goto('http://localhost:8096/index.html', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.GMSpecs, { timeout: 15000 });

    const et = `${vp.w}x${vp.h}`;

    /* Debordement horizontal : la plaie n°1 du mobile, invisible en lisant
       le CSS et immediatement visible a l'usage. */
    const deborde = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    v(`${et} — aucun débordement horizontal`, !deborde);

    /* Cible tactile du bouton central : Apple recommande 44pt minimum. */
    const fab = await page.evaluate(() => {
      const e = document.querySelector('[data-fab] > i'); if (!e) return null;
      const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) };
    });
    v(`${et} — bouton + central ≥ 44px`, fab && fab.w >= 44 && fab.h >= 44, fab ? `${fab.w}×${fab.h}` : 'absent');

    for (const onglet of ONGLETS) {
      await page.evaluate(o => document.querySelector(`[data-tab="${o}"]`)?.click(), onglet);
      await page.waitForTimeout(450);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(250);

      /* Le dernier element de contenu doit rester AU-DESSUS de la barre. */
      const m = await page.evaluate(() => {
        const nav = document.querySelector('nav.tabs');
        const hautNav = nav ? nav.getBoundingClientRect().top : window.innerHeight;
        const main = document.querySelector('main');
        if (!main) return null;
        const enfants = [...main.querySelectorAll('*')].filter(e => {
          const r = e.getBoundingClientRect();
          return r.height > 4 && r.width > 4 && e.children.length === 0;
        });
        let basMax = -Infinity, coupable = null;
        for (const e of enfants) {
          const r = e.getBoundingClientRect();
          if (r.bottom > basMax) { basMax = r.bottom; coupable = e.className || e.tagName; }
        }
        return { hautNav: Math.round(hautNav), basContenu: Math.round(basMax), coupable: String(coupable).slice(0, 40) };
      });
      if (m) {
        v(`${et} · ${onglet} — contenu non masqué par la barre basse`,
          m.basContenu <= m.hautNav,
          `bas contenu ${m.basContenu} / haut barre ${m.hautNav}${m.basContenu > m.hautNav ? ' — « ' + m.coupable + ' »' : ''}`);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(120);
    }

    /* Capture de la grille, pour juger le rendu et non l'imaginer. */
    await page.evaluate(() => document.querySelector('[data-tab="collection"]')?.click());
    await page.waitForTimeout(500);
    await page.screenshot({ path: `./banc-captures/${ETIQUETTE}-grille-${et}.jpeg`, type: 'jpeg', quality: 70 });

    v(`${et} — aucune erreur JS`, errs.length === 0, errs.join(' | ').slice(0, 140));
    await ctx.close();
  }

  await nav.close(); srv.close();
  let ko = 0;
  console.log(`\nBanc de mise en page — « ${ETIQUETTE} »\n`);
  for (const r of res) { if (!r.ok) ko++; console.log(`  ${r.ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${r.t}${r.d ? `\x1b[2m  — ${r.d}\x1b[0m` : ''}`); }
  console.log(`\n  ${res.length - ko} passé(s) · ${ko} échec(s)\n`);
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
