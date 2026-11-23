'use strict';
const {chromium}=require('playwright-core');
const http=require('http'),fs=require('fs'),path=require('path');
const R=__dirname;
const T={'.html':'text/html','.js':'application/javascript','.json':'application/json','.png':'image/png','.webmanifest':'application/manifest+json'};
const srv=http.createServer((q,s)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';const f=path.join(R,p);if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){s.writeHead(404);return s.end()}s.writeHead(200,{'Content-Type':T[path.extname(f)]||'text/plain'});s.end(fs.readFileSync(f))});
const res=[];const v=(t,ok,d)=>res.push({t,ok,d});
(async()=>{await new Promise(r=>srv.listen(8097,r));
const n=await chromium.launch({executablePath:process.env.CHROMIUM||'/opt/pw-browsers/chromium',args:['--no-sandbox']});
const ctx=await n.newContext({viewport:{width:390,height:844}});
// Google injoignable : un banc ne dépend jamais d'un service tiers (voir banc-imports.js, 18/11).
await ctx.route(/^https:\/\/(accounts\.google\.com|[a-z0-9.-]*\.gstatic\.com)\//,r=>r.abort());
const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(String(e)));
await p.goto('http://localhost:8097/index.html',{waitUntil:'networkidle'});

const bg=()=>p.evaluate(()=>getComputedStyle(document.body).backgroundColor);
/* Contraste WCAG du texte des barres fixes sur LEUR fond (fond semi-transparent composé sur
   celui de la page). Jusqu'au 21/11, le fond des barres était écrit en dur (sombre) : en
   thème clair, titre, compteur et onglet actif passaient en sombre sur sombre (≈ 1,1:1). */
const contrastes=()=>p.evaluate(()=>{
  const rvba=s=>{const m=String(s).match(/[\d.]+/g)||[];return {r:+m[0],g:+m[1],b:+m[2],a:m[3]===undefined?1:+m[3]}};
  const sur=(h,b)=>({r:h.r*h.a+b.r*(1-h.a),g:h.g*h.a+b.g*(1-h.a),b:h.b*h.a+b.b*(1-h.a),a:1});
  const lum=c=>{const f=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)};return .2126*f(c.r)+.7152*f(c.g)+.0722*f(c.b)};
  const ratio=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
  const page=rvba(getComputedStyle(document.body).backgroundColor);
  const mesure=(sel,barre)=>{const e=document.querySelector(sel),b=document.querySelector(barre);if(!e||!b)return null;
    const fond=sur(rvba(getComputedStyle(b).backgroundColor),page);return +ratio(rvba(getComputedStyle(e).color),fond).toFixed(2)};
  return {titre:mesure('.brand h1','header.top'),compteur:mesure('.ro:not(.acc) b','header.top'),onglet:mesure('nav.tabs button.on','nav.tabs')};
});
const lisible=c=>Object.values(c).every(x=>x!==null&&x>=4.5);
v('defaut = sombre', await p.evaluate(()=>document.documentElement.getAttribute('data-theme'))==='dark');
const bgSombre=await bg();
const cSombre=await contrastes();
v('sombre : titre, compteur et onglet actif lisibles sur leur barre (contraste ≥ 4,5)', lisible(cSombre), JSON.stringify(cSombre));

/* Les réglages sont derrière la page « plus » : deux clics, pas un. */
await p.evaluate(()=>document.querySelector('[data-tab="plus"]')?.click());
await p.waitForTimeout(400);
await p.evaluate(()=>document.querySelector('[data-tab="settings"]')?.click());
await p.waitForTimeout(500);
v('ligne de reglage presente (3 boutons)', await p.evaluate(()=>document.querySelectorAll('[data-theme-set]').length)===3);
v('bouton « Sombre » marque actif', await p.evaluate(()=>document.querySelector('[data-theme-set="dark"]')?.classList.contains('on')));

await p.evaluate(()=>document.querySelector('[data-theme-set="light"]')?.click());
await p.waitForTimeout(300);
const bgClair=await bg();
v('bascule en clair : le fond CHANGE', bgSombre!==bgClair, bgSombre+' -> '+bgClair);
/* L'onglet actif est alors « Plus » (réglages) : la mesure porte sur lui, c'est le même style. */
const cClair=await contrastes();
v('clair : titre, compteur et onglet actif lisibles sur leur barre (contraste ≥ 4,5)', lisible(cClair), JSON.stringify(cClair));
v('barre systeme recalee', await p.evaluate(()=>document.querySelector('meta[name="theme-color"]').content)==='#f4f4f5');
v('preference persistee', await p.evaluate(()=>localStorage.getItem('gm-theme'))==='light');

/* Le test qui compte vraiment : la preference survit-elle au rechargement,
   et SANS flash ? On relit l'attribut juste apres le domcontentloaded. */
await p.goto('http://localhost:8097/index.html',{waitUntil:'domcontentloaded'});
v('apres rechargement : clair applique DES le domcontentloaded (pas de flash)',
  await p.evaluate(()=>document.documentElement.getAttribute('data-theme'))==='light');

/* Mode systeme avec OS en clair */
await p.evaluate(()=>localStorage.setItem('gm-theme','system'));
await p.emulateMedia({colorScheme:"light"});
await p.goto('http://localhost:8097/index.html',{waitUntil:'networkidle'});
const bgSys=await bg();
v('mode systeme + OS clair = rendu clair', bgSys===bgClair, bgSys);
const cSys=await contrastes();
v('mode systeme + OS clair : barres lisibles (contraste ≥ 4,5)', lisible(cSys), JSON.stringify(cSys));
await p.emulateMedia({colorScheme:"dark"});
await p.reload({waitUntil:'networkidle'});
v('mode systeme + OS sombre = rendu sombre', (await bg())===bgSombre);

v('aucune erreur JS', errs.length===0, errs.join(' | ').slice(0,160));
await n.close();srv.close();
let ko=0;console.log('\nBanc thème\n');
for(const r of res){if(!r.ok)ko++;console.log('  '+(r.ok?'\x1b[32m✓\x1b[0m':'\x1b[31m✗\x1b[0m')+' '+r.t+(r.d?'\x1b[2m  — '+r.d+'\x1b[0m':''))}
console.log('\n  '+(res.length-ko)+' passé(s) · '+ko+' échec(s)\n');process.exit(ko?1:0)})().catch(e=>{console.error(e);process.exit(1)});
