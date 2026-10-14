'use strict';
const {chromium}=require('playwright-core');
const http=require('http'),fs=require('fs'),path=require('path');
const R='/home/user/garage-manifest1';
const T={'.html':'text/html','.js':'application/javascript','.json':'application/json','.png':'image/png','.webmanifest':'application/manifest+json'};
const srv=http.createServer((q,s)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/index.html';const f=path.join(R,p);if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){s.writeHead(404);return s.end()}s.writeHead(200,{'Content-Type':T[path.extname(f)]||'text/plain'});s.end(fs.readFileSync(f))});
const res=[];const v=(t,ok,d)=>res.push({t,ok,d});
(async()=>{await new Promise(r=>srv.listen(8097,r));
const n=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
const ctx=await n.newContext({viewport:{width:390,height:844}});
const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(String(e)));
await p.goto('http://localhost:8097/index.html',{waitUntil:'networkidle'});

const bg=()=>p.evaluate(()=>getComputedStyle(document.body).backgroundColor);
v('defaut = sombre', await p.evaluate(()=>document.documentElement.getAttribute('data-theme'))==='dark');
const bgSombre=await bg();

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
await p.emulateMedia({colorScheme:"dark"});
await p.reload({waitUntil:'networkidle'});
v('mode systeme + OS sombre = rendu sombre', (await bg())===bgSombre);

v('aucune erreur JS', errs.length===0, errs.join(' | ').slice(0,160));
await n.close();srv.close();
let ko=0;console.log('\nBanc thème\n');
for(const r of res){if(!r.ok)ko++;console.log('  '+(r.ok?'\x1b[32m✓\x1b[0m':'\x1b[31m✗\x1b[0m')+' '+r.t+(r.d?'\x1b[2m  — '+r.d+'\x1b[0m':''))}
console.log('\n  '+(res.length-ko)+' passé(s) · '+ko+' échec(s)\n');process.exit(ko?1:0)})().catch(e=>{console.error(e);process.exit(1)});
