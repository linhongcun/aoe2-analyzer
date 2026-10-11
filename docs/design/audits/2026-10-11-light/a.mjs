import {chromium} from '/workspace/aoe2-m3/node_modules/playwright/index.mjs';
import fs from 'fs';
const B='https://linhongcun.github.io/aoe2-analyzer/#';
const pages={home:'/',civs:'/civs',civ:'/civ/Franks',units:'/units',unit:'/unit/281',buildings:'/buildings',building:'/building/12',techs:'/techs',tech:'/tech/22',tree:'/tree/Franks',matchup:'/matchup',duel:'/duel',compare:'/compare',builds:'/builds',simulator:'/simulator',bonuses:'/bonuses'};
const b=await chromium.launch();const out={};
for(const [w,tag] of [[1280,'d'],[390,'m']]){
 const ctx=await b.newContext({viewport:{width:w,height:900},colorScheme:'light'});
 for(const [k,p] of Object.entries(pages)){
  const pg=await ctx.newPage();await pg.goto(B+p,{waitUntil:'networkidle'});await pg.waitForTimeout(1200);
  await pg.screenshot({path:`${k}-${w}.png`,fullPage:true});
  const r=await pg.evaluate((mobile)=>{
   const L=c=>{const m=c.match(/[\d.]+/g);if(!m)return null;return m.map(Number)};
   const lum=([r,g,b])=>{const f=v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4};return .2126*f(r)+.7152*f(g)+.0722*f(b)};
   const bgOf=el=>{for(let e=el;e;e=e.parentElement){const c=L(getComputedStyle(e).backgroundColor);if(c&&(c[3]===undefined||c[3]>0.5))return c;}return [255,255,255]};
   const hex=c=>'#'+c.slice(0,3).map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
   const res={contrast:{},amber:[],emoji:[],svgNonLucide:0,svgLucide:0,font:[],small:[],empty:[],title:document.title,h1:document.querySelector('h1')?.innerText,headerBtns:[],sections:[]};
   const all=[...document.querySelectorAll('body *')].filter(e=>e.offsetParent!==null||e.tagName==='svg');
   for(const e of all){
     const own=[...e.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim();
     const cs=getComputedStyle(e);
     if(own){
       const fg=L(cs.color),bg=bgOf(e);const a=fg[3]??1;const f2=fg.slice(0,3).map((v,i)=>v*a+bg[i]*(1-a));
       const l1=lum(f2),l2=lum(bg);const ratio=(Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05);
       const fs=parseFloat(cs.fontSize),bold=+cs.fontWeight>=700;const need=(fs>=24||(fs>=18.66&&bold))?3:4.5;
       if(ratio<need){const key=hex(f2)+' on '+hex(bg);(res.contrast[key]??={ratio:+ratio.toFixed(2),n:0,ex:own.slice(0,20),need}).n++;}
       const [r,g,bb]=f2;if(r>180&&g>100&&g<190&&bb<120&&r-bb>90)res.amber.push(own.slice(0,20)+' '+hex(f2));
       if(/\p{Extended_Pictographic}/u.test(own))res.emoji.push(own.slice(0,30));
       if(/^(无|N\/A|NaN|undefined|null|-|0\/0)$/.test(own)||/NaN|undefined/.test(own))res.empty.push(own.slice(0,30));
     }
     if(e.tagName==='svg'){ (e.classList.contains('lucide')||[...e.classList].some(c=>c.startsWith('lucide')))?res.svgLucide++:res.svgNonLucide++; }
     if(['BUTTON','INPUT','SELECT','TEXTAREA'].includes(e.tagName)&&cs.fontFamily!==getComputedStyle(document.body).fontFamily)res.font.push(e.tagName+':'+cs.fontFamily.slice(0,30));
     if(mobile&&e.matches('a,button,input,select,[role=button],[role=tab],summary')){const R=e.getBoundingClientRect();if(R.width&&(R.height<44||R.width<44)&&R.height<44)res.small.push((e.innerText||e.getAttribute('aria-label')||e.tagName).trim().slice(0,16)+` ${Math.round(R.width)}x${Math.round(R.height)}`);}
   }
   const hdr=document.querySelector('.detail-head,.dhead,header.page-head,.page-header,main header');
   if(hdr)res.headerBtns=[...hdr.querySelectorAll('button,a')].map(x=>(x.innerText||x.getAttribute('aria-label')||'').trim()).filter(Boolean);
   res.sections=[...document.querySelectorAll('main h2')].map(h=>h.innerText.trim());
   res.sourceLine=/来源|数据来源/.test(document.querySelector('main')?.innerText||'');
   res.hasNoneText=(document.querySelector('main')?.innerText.match(/(^|\s)无(\s|$)|暂无/g)||[]).length;
   res.small=[...new Set(res.small)];return res;},w<500);
  out[k+'-'+w]=r;await pg.close();}
 await ctx.close();}
await b.close();fs.writeFileSync('r.json',JSON.stringify(out,null,1));
